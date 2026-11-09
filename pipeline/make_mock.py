"""Generate web/public/data/mock_items.json: 8 hand-designed items, 2 per quadrant.

Pure standard library so it runs anywhere. Curves are synthetic (sigmoid drops in
P(answer) at a layer-dependent flip strength); margins are then *measured* from the
synthetic curves exactly the way compute_margins.py measures them from the model,
so every field in the file is internally consistent.

    python make_mock.py
"""
import json
import math
import os
from datetime import datetime, timezone

N_LAYERS = 24
ALPHAS = [round(i * 0.05, 2) for i in range(31)]  # 0.00 .. 1.50
OUT = os.path.join(os.path.dirname(__file__), "..", "web", "public", "data", "mock_items.json")

# id, question, gold, difficulty, answer_text, answer_tok, alt_tok, correct, p0, p_alt0,
# target margin (None = never flips), margin layer, counterfactual, extra top-5 tokens
ITEMS = [
    # Confident & robust
    ("q01", "What is the capital of France?", "Paris", "easy", "Paris", " Paris", " Lyon",
     True, 0.97, 0.012, 0.92, 15, "Lyon", [" Marseille", " The", " Nice"]),
    ("q02", "What is the chemical symbol for gold?", "Au", "easy", "Au", " Au", " Ag",
     True, 0.93, 0.035, None, 12, "Au", [" Gold", " G", " Pb"]),
    # Confident but fragile
    ("q07", "What is the capital of Australia?", "Canberra", "medium", "Canberra", " Canberra",
     " Sydney", True, 0.81, 0.12, 0.18, 14, "Sydney", [" Melbourne", " Perth", " Brisbane"]),
    ("q09", "What is the capital of Turkey?", "Ankara", "medium", "Istanbul", " Istanbul",
     " Ankara", False, 0.78, 0.17, 0.15, 13, "Ankara", [" Izmir", " Constantinople", " Bursa"]),
    # Unsure but stable
    ("q17", "What is the capital of Burkina Faso?", "Ouagadougou", "hard", "Ouagadougou",
     " Ou", " Bob", True, 0.41, 0.18, 0.76, 16, "Bobo-Dioulasso", [" Abidjan", " Bamako", " Ni"]),
    ("q19", "Which element has the chemical symbol W?", "Tungsten", "hard", "Tungsten",
     " Tung", " Wolf", True, 0.38, 0.26, 0.68, 11, "Wolfram", [" Tin", " Titanium", " Zinc"]),
    # Unsure & fragile
    ("q21", "What is the capital of Kazakhstan?", "Astana", "hard", "Almaty", " Almaty",
     " Astana", False, 0.34, 0.31, 0.09, 12, "Astana", [" Tashkent", " Bishkek", " Nur"]),
    ("q23", "Who composed The Four Seasons?", "Vivaldi", "medium", "Vivaldi", " Vivaldi",
     " Bach", True, 0.33, 0.24, 0.11, 10, "Bach", [" Mozart", " Handel", " Haydn"]),
]


def sig(x):
    return 1.0 / (1.0 + math.exp(-x))


def layer_flip_point(target, layer, best_layer, seed):
    """U-shaped profile: easiest to flip at best_layer, harder far from it."""
    if target is None:
        return 2.5 + 0.03 * abs(layer - best_layer)
    dist = abs(layer - best_layer)
    wobble = 0.04 * math.sin(layer * 1.7 + seed)
    m = target * (1 + 0.012 * dist ** 2) + abs(wobble) * (1 if dist else 0)
    if layer < 3:  # earliest layers barely move the output
        m += 0.9
    return m


def curves_for(p0, pa0, target, best_layer, seed, alt_tok, ans_tok):
    p_ans, p_alt, top1 = [], [], []
    for layer in range(N_LAYERS):
        m = layer_flip_point(target, layer, best_layer, seed)
        k = 9.0 + 3 * ((layer + seed) % 3)
        s0 = sig(-k * m)
        ra, rb, rt = [], [], []
        for a in ALPHAS:
            s = (sig(k * (a - m)) - s0) / (1 - s0)  # 0 at alpha=0, ~0.5 at m
            pa = p0 * (1 - s) + 0.03 * s
            pb = pa0 * (1 - s) + 0.80 * s
            # Force the crossing to sit at m: before m answer stays top-1.
            if a < m and pb >= pa:
                pb = pa * 0.95
            if a >= m and pa >= pb:
                pa, pb = pb * 0.9, pa
            # Early layers at huge pushes drift to an unrelated third token.
            third = target is not None and layer < 3 and a >= 1.3
            if third:
                pa, pb = pa * 0.5, pb * 0.5
            ra.append(round(pa, 4))
            rb.append(round(pb, 4))
            if third:
                rt.append(" the")
            else:
                rt.append(alt_tok if a >= m else ans_tok)
        p_ans.append(ra)
        p_alt.append(rb)
        top1.append(rt)
    return p_ans, p_alt, top1


def measure_margin(top1, ans_tok):
    per = []
    for row in top1:
        hit = next((ALPHAS[i] for i, t in enumerate(row) if t != ans_tok), None)
        per.append(hit)
    flips = [(m, l) for l, m in enumerate(per) if m is not None]
    if not flips:
        return per, None, int(min(range(N_LAYERS), key=lambda l: 0)), True
    m, l = min(flips)
    return per, m, l, False


def main():
    items = []
    for n, row in enumerate(ITEMS):
        (iid, q, gold, diff, ans_text, ans_tok, alt_tok, correct, p0, pa0, target,
         best, cf, extra) = row
        p_ans, p_alt, top1 = curves_for(p0, pa0, target, best, n, alt_tok, ans_tok)
        per, margin, mlayer, censored = measure_margin(top1, ans_tok)
        if censored:
            mlayer = best
        # Refine the grid margin a little so it is not always a multiple of .05
        if margin is not None and target is not None:
            margin = round(max(margin - 0.05, 0) + 0.05 * 0.6, 4) if margin > 0 else margin
            per = [None if v is None else round(max(v - 0.05, 0) + 0.03, 4) for v in per]
        rest = 1 - p0 - pa0
        top5 = [{"token": ans_tok, "p": p0}, {"token": alt_tok, "p": pa0}]
        for j, t in enumerate(extra):
            top5.append({"token": t, "p": round(rest * (0.45 / (j + 1)), 4)})
        top5.sort(key=lambda d: -d["p"])
        items.append({
            "id": iid, "question": q, "gold": gold, "difficulty": diff,
            "answer_text": ans_text, "answer_token": ans_tok, "alt_token": alt_tok,
            "correct": correct, "p_answer": p0, "top5": top5,
            "margin": margin, "censored": censored, "margin_layer": mlayer,
            "margin_percentile": None, "per_layer_margin": per,
            "curves": {"p_answer": p_ans, "p_alt": p_alt, "top1": top1},
            "counterfactual_text": cf,
        })
    # Percentile: share of items with a strictly smaller margin (censored = max).
    key = [it["margin"] if not it["censored"] else float("inf") for it in items]
    for it, k in zip(items, key):
        below = sum(1 for o in key if o < k)
        it["margin_percentile"] = round(below / max(len(items) - 1, 1), 4)

    out = {
        "meta": {
            "model": "MOCK (hand-made curves, no model)",
            "n_layers": N_LAYERS,
            "alphas": ALPHAS,
            "method_note": "Synthetic mock data shaped like the pipeline output.",
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "is_mock": True,
        },
        "items": items,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    for it in items:
        print(f"{it['id']}  p={it['p_answer']:.2f}  margin={it['margin']}  layer={it['margin_layer']}"
              f"  pct={it['margin_percentile']}")


if __name__ == "__main__":
    main()
