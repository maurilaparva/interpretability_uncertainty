# Pipeline: approximate causal robustness margins

Computes, offline, everything the web app shows and writes `../web/public/data/items.json`.

```bash
python -m venv .venv
.venv/Scripts/activate            # Windows   (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt   # CPU torch is fine for the 0.5B model

python compute_margins.py --limit 3   # quick test (~45 s on a laptop CPU, incl. model load)
python compute_margins.py             # all 24 questions (~5 min on a laptop CPU)
python compute_margins.py --model Qwen/Qwen2.5-1.5B-Instruct   # bigger model on a GPU
python make_mock.py                   # regenerate the hand-made mock set (no model needed)
```

Flags: `--model`, `--limit N`, `--layer-stride K` (test every K-th layer), `--alpha-grid fine|linear`,
`--batch-size`, `--no-cache` (ignore per-item cache in `.cache/`), `--no-prefix-cache` (debug), `--out PATH`.

At the end the script prints every item sorted by margin plus the four quadrant counts (median splits of
confidence and margin). It warns loudly if the **confident but fragile** quadrant is empty.

## What it computes

This approximates Komanduri et al. (2026, arXiv 2610.22636). **It is not their exact method.**

| Step | What we do |
|---|---|
| Prompt | Fixed few-shot "Q: … A:" prompt; the answer is the next token after `A:` |
| Answer `a` | argmax token; `p_answer` = its softmax probability (the baseline confidence) |
| Alternative `b` | highest-probability token with a different surface form (skips `" Paris"`/`"Paris"`, prefixes like `Can`/`Canberra`, and words inside the model's own answer, such as `Shakespeare` in "William Shakespeare") |
| Direction | `v̂ = (W_U[b] − W_U[a]) / ‖·‖`, a contrastive **logit-lens** direction (the Jacobian lens with J = I) |
| Push | at decoder layer ℓ, last prompt position only: `h ← h + α · ‖h‖ · v̂` (forward hook on `model.model.layers[ℓ]`) |
| Flip | the top-1 token is no longer `a` **and** is not just another piece of the same answer (`same_answer_tokens`) |
| Per-layer margin | first grid α that flips, refined by a 6-step bisection; `null` if it never flips by α = 1.5 |
| Margin | minimum over layers (`margin_layer` = argmin). **The paper's exact aggregation may differ.** If no layer flips, `censored = true` and `margin_layer` is the layer with the lowest P(a) at α = 1.5 |
| Counterfactual | greedy decode with the push at (`margin_layer`, 1.05 × margin), applied on the answer position only |

### Deviations from SPEC.md (and why)

* **α grid.** The spec grid `np.arange(0, 1.51, 0.05)` is kept, and by default we *add* steps 0.005…0.045.
  With Qwen2.5-0.5B, almost every margin is below 0.06, so the spec grid alone would put every flip in the
  first cell and R3's slider could not show it. `--alpha-grid linear` reproduces the spec grid exactly.
* **Flip criterion** ignores tokens that are part of the model's own answer (see the table). Without this,
  "William Shakespeare" flipping to "Shakespeare" counted as the most fragile answer in the set.
* **Speed.** The prompt prefix is run once and cached; each (layer, α) pair then needs only the last token,
  batched. The script checks this against a full forward pass on startup and falls back if they disagree.
* **No year questions.** Qwen tokenizes digits one at a time, so a year's first token ("1") is not distinctive.

## Known limitation, and the key finding for the demo

With this approximation, the minimum over layers almost always lands in the **last two layers** (22–23 of 24).
There a push along `W_U[b] − W_U[a]` mostly edits the output logits directly, so the margin behaves like
"logit gap ÷ residual norm". It is therefore **strongly rank-correlated with output confidence**
(Spearman ρ = 0.71 on the 24 questions; it was 0.92 before the same-answer flip fix, and excluding the last
2–10 layers from the minimum did not bring it below ~0.77). The exceptions are the interesting part: q05 and q16
("William Shakespeare", "Albert Einstein") have low output confidence only because probability is split across
two spellings of the same answer, yet a large push is needed to change them ("unsure but stable"); q06, q15, q20
(Rome, Brasília, Naypyidaw) are confident but flip to Florence / Rio / Mandalay with a small push.
The Overview screen reports ρ so this is visible, not hidden. A mechanistic signal that genuinely diverges from
confidence may need directions that are *not* read straight off the unembedding (the paper's Jacobian
lens, or activation-difference directions). See the TODOs in `compute_margins.py`.

## Output

`../web/public/data/items.json` follows the schema in SPEC.md §2, plus `meta.layers` (which layer each curve
row refers to, needed with `--layer-stride`) and per-item `same_answer_tokens`. Floats are rounded to 4 decimals.
