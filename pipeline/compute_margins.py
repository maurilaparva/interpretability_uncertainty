"""Compute an approximate *causal robustness margin* for short factual answers.

Approximation of Komanduri et al. (2026, arXiv 2610.22636) -- NOT their exact method:
  * direction  v = W_U[b] - W_U[a]  (contrastive logit-lens direction, i.e. Jacobian lens with J = I),
    a = model's answer token, b = runner-up token with a different surface form;
  * intervention at decoder layer l, last prompt position only:  h <- h + alpha * ||h|| * v_hat;
  * margin = smallest alpha that changes the first answer token (min over layers).

Usage:
    python compute_margins.py --limit 3          # quick test
    python compute_margins.py                    # full run (cached per item)
    python compute_margins.py --model Qwen/Qwen2.5-1.5B-Instruct --layer-stride 2
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import string
import sys
import unicodedata
from datetime import datetime, timezone

import numpy as np
import torch
from tqdm import tqdm
from transformers import AutoModelForCausalLM, AutoTokenizer

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(HERE, "..", "web", "public", "data", "items.json")

PROMPT = (
    "Answer each question with a single word or name.\n"
    "Q: What is the capital of France?\n"
    "A: Paris\n"
    "Q: Who painted the Mona Lisa?\n"
    "A: Leonardo\n"
    "Q: {question}\n"
    "A:"
)
LINEAR_ALPHAS = np.round(np.arange(0, 1.51, 0.05), 4)  # the spec grid
# Real margins for a 0.5B model are often < 0.05, so by default we add fine steps near zero.
# The spec grid is kept as a subset; `--alpha-grid linear` reproduces it exactly.
FINE_ALPHAS = np.round(np.union1d(LINEAR_ALPHAS, np.arange(0.005, 0.05, 0.005)), 4)
ALPHAS = FINE_ALPHAS
BISECT_STEPS = 6
GEN_TOKENS = 6
METHOD_NOTE = (
    "Contrastive logit-lens steering (W_U[alt] - W_U[answer]) at the last prompt position; "
    "alpha scaled by residual norm; first-token flip (tokens that are part of the same answer do not count); "
    "margin = min over layers."
)


# ----------------------------------------------------------------------------- utils
def pick_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def norm_text(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return "".join(c for c in s.lower() if c.isalnum())


def is_punct_or_empty(s: str) -> bool:
    s = s.strip()
    return not s or all(c in string.punctuation or unicodedata.category(c).startswith("P") for c in s)


def r4(x):
    return None if x is None else round(float(x), 4)


# ----------------------------------------------------------------------------- steering
class Steerer:
    """Forward hooks on every decoder layer. For a batch, `plan[layer]` is a (B,) tensor of
    alphas (0 = no push for that row). Pushes only the LAST sequence position."""

    def __init__(self, layers, direction: torch.Tensor):
        self.direction = direction  # (d,) unit vector
        self.plan: dict[int, torch.Tensor] = {}
        self.handles = [layer.register_forward_hook(self._make(i)) for i, layer in enumerate(layers)]

    def _make(self, idx):
        def hook(_mod, _inp, out):
            a = self.plan.get(idx)
            if a is None:
                return None
            hs = out[0] if isinstance(out, tuple) else out
            last = hs[:, -1, :]
            push = a.to(hs.dtype)[:, None] * last.norm(dim=-1, keepdim=True) * self.direction
            hs = hs.clone()
            hs[:, -1, :] = last + push
            return (hs,) + tuple(out[1:]) if isinstance(out, tuple) else hs

        return hook

    def remove(self):
        for h in self.handles:
            h.remove()


class Runner:
    def __init__(self, model, tok, device, use_cache=True, batch_size=64):
        self.model, self.tok, self.device = model, tok, device
        self.use_cache = use_cache
        self.batch_size = batch_size
        self.layers = model.model.layers
        self.n_layers = len(self.layers)

    @torch.no_grad()
    def _last_logits_full(self, ids: torch.Tensor, B: int) -> torch.Tensor:
        out = self.model.model(input_ids=ids.expand(B, -1))
        return self.model.lm_head(out.last_hidden_state[:, -1, :]).float()

    @torch.no_grad()
    def prepare(self, prompt: str):
        self.ids = self.tok(prompt, return_tensors="pt").input_ids.to(self.device)
        self.prefix_cache = None
        if self.use_cache and self.ids.shape[1] > 1:
            out = self.model.model(input_ids=self.ids[:, :-1], use_cache=True)
            self.prefix_cache = out.past_key_values

    @torch.no_grad()
    def logits(self, steerer: Steerer | None, rows: list[tuple[int, float]]) -> torch.Tensor:
        """rows = [(layer, alpha), ...]  ->  (len(rows), vocab) logits at the answer position."""
        res = []
        for s in range(0, len(rows), self.batch_size):
            chunk = rows[s : s + self.batch_size]
            B = len(chunk)
            if steerer is not None:
                plan = {}
                for j, (layer, alpha) in enumerate(chunk):
                    if alpha != 0:
                        plan.setdefault(layer, torch.zeros(B, device=self.device))[j] = alpha
                steerer.plan = plan
            try:
                if self.prefix_cache is not None:
                    cache = copy.deepcopy(self.prefix_cache)
                    cache.batch_repeat_interleave(B)
                    out = self.model.model(
                        input_ids=self.ids[:, -1:].expand(B, -1), past_key_values=cache, use_cache=True
                    )
                    res.append(self.model.lm_head(out.last_hidden_state[:, -1, :]).float())
                else:
                    res.append(self._last_logits_full(self.ids, B))
            finally:
                if steerer is not None:
                    steerer.plan = {}
        return torch.cat(res, 0)

    @torch.no_grad()
    def generate(self, steerer: Steerer | None, layer: int | None, alpha: float) -> str:
        """Greedy decode; the push (if any) is applied only on the first step (answer position)."""
        ids = self.ids
        if steerer is not None and layer is not None:
            steerer.plan = {layer: torch.tensor([alpha], device=self.device)}
        try:
            out = self.model(input_ids=ids, use_cache=True)
        finally:
            if steerer is not None:
                steerer.plan = {}
        pkv = out.past_key_values
        nxt = out.logits[:, -1, :].argmax(-1, keepdim=True)
        gen = [nxt.item()]
        for _ in range(GEN_TOKENS - 1):
            if "\n" in self.tok.decode(gen):
                break
            out = self.model(input_ids=nxt, past_key_values=pkv, use_cache=True)
            pkv = out.past_key_values
            nxt = out.logits[:, -1, :].argmax(-1, keepdim=True)
            gen.append(nxt.item())
        text = self.tok.decode(gen, skip_special_tokens=True)
        return text.split("\n")[0].strip()


# ----------------------------------------------------------------------------- per item
# TODO(next): multi-token answers -- score the whole answer span instead of the first token only.
def choose_alt(tok, probs: torch.Tensor, a: int, answer_text: str = "") -> int:
    a_s = tok.decode([a]).strip().lower()
    full = norm_text(answer_text)
    for b in torch.argsort(probs, descending=True)[:200].tolist():
        if b == a:
            continue
        s = tok.decode([b])
        if is_punct_or_empty(s):
            continue
        b_s = s.strip().lower()
        # skip " Paris" vs "Paris" and "Can" vs "Canberra" style duplicates
        if b_s == a_s or a_s.startswith(b_s) or b_s.startswith(a_s):
            continue
        # skip words that are part of the same answer ("Shakespeare" vs "William Shakespeare")
        if norm_text(b_s) and norm_text(b_s) in full:
            continue
        return b
    raise RuntimeError("no alternative token found")


def process_item(q: dict, runner: Runner, layer_ids: list[int]) -> dict:
    model, tok = runner.model, runner.tok
    runner.prepare(PROMPT.format(question=q["question"]))

    base = runner.logits(None, [(0, 0.0)])[0]
    probs = torch.softmax(base, -1)
    a = int(probs.argmax())
    answer_text = runner.generate(None, None, 0.0)
    b = choose_alt(tok, probs, a, answer_text)
    top5 = torch.topk(probs, 5)
    # Tokens that are just another piece of the model's own answer (e.g. " Shakespeare" when the
    # answer is "William Shakespeare") do not count as the answer changing.
    full = norm_text(answer_text)
    same = {a}
    for t in torch.argsort(probs, descending=True)[:300].tolist():
        nt = norm_text(tok.decode([t]))
        if len(nt) >= 3 and nt in full and t != b:
            same.add(t)
    same_t = torch.tensor(sorted(same), device=runner.device)
    is_same = lambda ids: torch.isin(ids, same_t)  # noqa: E731
    golds = [q["gold"]] + q.get("aliases", [])
    na = norm_text(answer_text)
    correct = any(na.startswith(norm_text(g)) for g in golds if norm_text(g))

    # TODO(next): Jacobian-lens concept vectors (the paper's method) would replace this direction.
    # TODO(next): multiple alternative directions (top-k runner-ups) and a random-direction control
    #             (same norm, random v_hat) to calibrate what a "small" margin means.
    W = model.lm_head.weight.detach()
    v = (W[b] - W[a]).float()
    v_hat = (v / v.norm()).to(W.dtype)
    steerer = Steerer(runner.layers, v_hat)
    try:
        rows = [(l, float(al)) for l in layer_ids for al in ALPHAS]
        lg = runner.logits(steerer, rows)
        pr = torch.softmax(lg, -1)
        nA = len(ALPHAS)
        p_ans = pr[:, a].reshape(len(layer_ids), nA).cpu().numpy()
        p_alt = pr[:, b].reshape(len(layer_ids), nA).cpu().numpy()
        top1_t = pr.argmax(-1)
        top1_ids = top1_t.reshape(len(layer_ids), nA).cpu().numpy()
        same_grid = is_same(top1_t).reshape(len(layer_ids), nA).cpu().numpy()

        # per-layer margin: first grid alpha with top-1 != a, then bisection
        per_layer: list[float | None] = []
        brackets = []
        for i, l in enumerate(layer_ids):
            hit = next((k for k in range(nA) if not same_grid[i, k]), None)
            per_layer.append(None if hit is None else float(ALPHAS[hit]))
            if hit is not None and hit > 0:
                brackets.append((i, l, float(ALPHAS[hit - 1]), float(ALPHAS[hit])))
        # bisect all flipping layers in parallel (one batch per step)
        for _ in range(BISECT_STEPS):
            if not brackets:
                break
            mids = [(l, (lo + hi) / 2) for (_, l, lo, hi) in brackets]
            flipped = (~is_same(runner.logits(steerer, mids).argmax(-1))).cpu().tolist()
            brackets = [
                (i, l, lo, m) if f else (i, l, m, hi)
                for (i, l, lo, hi), (_, m), f in zip(brackets, mids, flipped)
            ]
        for i, _l, _lo, hi in brackets:
            per_layer[i] = hi

        flips = [(m, layer_ids[i]) for i, m in enumerate(per_layer) if m is not None]
        if flips:
            margin, margin_layer = min(flips)
            censored = False
            cf = runner.generate(steerer, margin_layer, margin * 1.05)
        else:
            margin, censored = None, True
            # "closest to flipping": lowest P(answer) at the strongest push
            margin_layer = layer_ids[int(np.argmin(p_ans[:, -1]))]
            cf = answer_text
    finally:
        steerer.remove()

    dec = lambda i: tok.decode([int(i)])  # noqa: E731
    return {
        "id": q["id"],
        "question": q["question"],
        "gold": q["gold"],
        "difficulty": q.get("difficulty", ""),
        "answer_text": answer_text,
        "answer_token": dec(a),
        "alt_token": dec(b),
        "same_answer_tokens": sorted({dec(t) for t in same if t != a}),
        "correct": bool(correct),
        "p_answer": r4(probs[a]),
        "top5": [{"token": dec(i), "p": r4(p)} for p, i in zip(top5.values.tolist(), top5.indices.tolist())],
        "margin": r4(margin),
        "censored": censored,
        "margin_layer": int(margin_layer),
        "margin_percentile": None,
        "per_layer_margin": [r4(m) for m in per_layer],
        "curves": {
            "p_answer": [[r4(x) for x in row] for row in p_ans],
            "p_alt": [[r4(x) for x in row] for row in p_alt],
            "top1": [[dec(t) for t in row] for row in top1_ids],
        },
        "counterfactual_text": cf,
    }


# ----------------------------------------------------------------------------- reporting
def add_percentiles(items):
    key = [float("inf") if it["censored"] else it["margin"] for it in items]
    n = len(items)
    for it, k in zip(items, key):
        it["margin_percentile"] = r4(sum(o < k for o in key) / max(n - 1, 1))


def quadrant_report(items):
    if not items:
        return
    key = lambda it: float("inf") if it["censored"] else it["margin"]  # noqa: E731
    med_p = float(np.median([it["p_answer"] for it in items]))
    med_m = float(np.median([min(key(it), 99) for it in items]))
    print("\n" + "=" * 92)
    print(f"{'id':5} {'diff':7} {'ok':3} {'p_ans':>6} {'margin':>7} {'layer':>5}  {'answer':16} {'alt':12} counterfactual")
    print("-" * 92)
    for it in sorted(items, key=key):
        m = "  >1.5" if it["censored"] else f"{it['margin']:7.3f}"
        print(
            f"{it['id']:5} {it['difficulty'][:7]:7} {'Y' if it['correct'] else 'n':3} {it['p_answer']:6.2f} {m:>7} "
            f"{it['margin_layer']:5}  {it['answer_text'][:16]:16} {it['alt_token'].strip()[:12]:12} {it['counterfactual_text'][:20]}"
        )
    q = {"Confident & robust": [], "Confident but fragile": [], "Unsure but stable": [], "Unsure & fragile": []}
    for it in items:
        conf, frag = it["p_answer"] > med_p, key(it) < med_m
        name = ("Confident" if conf else "Unsure") + (
            (" but fragile" if conf else " & fragile") if frag else (" & robust" if conf else " but stable")
        )
        q[name].append(it["id"])
    print("-" * 92)
    print(f"median p_answer = {med_p:.3f}   median margin = {med_m:.3f}")
    for k, v in q.items():
        print(f"  {k:24} {len(v):3}   {', '.join(v)}")
    if not q["Confident but fragile"]:
        print("\n" + "!" * 92)
        print("!!  WARNING: the 'Confident but fragile' quadrant is EMPTY. The demo needs at least one.  !!")
        print("!" * 92)
    print("=" * 92)


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="Qwen/Qwen2.5-0.5B-Instruct")
    ap.add_argument("--questions", default=os.path.join(HERE, "questions.json"))
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--limit", type=int, default=None, help="only the first N questions")
    ap.add_argument("--layer-stride", type=int, default=1, help="1 = all layers, 2 = every 2nd, ...")
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--alpha-grid", choices=["fine", "linear"], default="fine",
                    help="linear = np.arange(0, 1.51, 0.05); fine = same plus 0.005-steps below 0.05")
    ap.add_argument("--cache-dir", default=os.path.join(HERE, ".cache"), help="per-item result cache")
    ap.add_argument("--no-cache", action="store_true", help="ignore cached per-item results")
    ap.add_argument("--no-prefix-cache", action="store_true", help="run full prompts (slower, debug)")
    args = ap.parse_args()

    global ALPHAS
    ALPHAS = FINE_ALPHAS if args.alpha_grid == "fine" else LINEAR_ALPHAS
    device = pick_device()
    print(f"device={device}  model={args.model}", file=sys.stderr)
    torch.set_grad_enabled(False)
    tok = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(args.model, dtype=torch.float32).to(device).eval()

    runner = Runner(model, tok, device, use_cache=not args.no_prefix_cache, batch_size=args.batch_size)
    layer_ids = list(range(0, runner.n_layers, args.layer_stride))

    with open(args.questions, encoding="utf-8") as f:
        questions = json.load(f)
    if args.limit:
        questions = questions[: args.limit]

    # Sanity check: prefix-cached path must match a full forward pass (incl. a push).
    if runner.use_cache:
        runner.prepare(PROMPT.format(question=questions[0]["question"]))
        W = model.lm_head.weight
        st = Steerer(runner.layers, (W[1] / W[1].norm()).detach())
        try:
            fast = runner.logits(st, [(len(layer_ids) // 2, 0.0), (len(layer_ids) // 2, 0.5)])
            runner.prefix_cache = None
            slow = runner.logits(st, [(len(layer_ids) // 2, 0.0), (len(layer_ids) // 2, 0.5)])
        finally:
            st.remove()
        diff = (fast - slow).abs().max().item()
        if diff > 1e-2:
            print(f"prefix cache mismatch ({diff:.3g}); falling back to full prompts", file=sys.stderr)
            runner.use_cache = False
        else:
            print(f"prefix-cache check ok (max |dlogit| = {diff:.2e})", file=sys.stderr)

    cache_dir = os.path.join(args.cache_dir, args.model.replace("/", "__") + f"__s{args.layer_stride}__{args.alpha_grid}__v3")
    os.makedirs(cache_dir, exist_ok=True)
    items = []
    for q in tqdm(questions, desc="items"):
        cpath = os.path.join(cache_dir, f"{q['id']}.json")
        if not args.no_cache and os.path.exists(cpath):
            with open(cpath, encoding="utf-8") as f:
                cached = json.load(f)
            if cached.get("question") == q["question"] and cached.get("gold") == q["gold"]:
                items.append(cached)
                continue
        it = process_item(q, runner, layer_ids)
        with open(cpath, "w", encoding="utf-8") as f:
            json.dump(it, f, ensure_ascii=False)
        items.append(it)

    add_percentiles(items)
    out = {
        "meta": {
            "model": args.model,
            "n_layers": runner.n_layers,
            "layers": layer_ids,
            "alphas": [r4(a) for a in ALPHAS],
            "method_note": METHOD_NOTE,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "is_mock": False,
        },
        "items": items,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\nwrote {len(items)} items -> {os.path.abspath(args.out)}", file=sys.stderr)
    quadrant_report(items)


if __name__ == "__main__":
    main()
