# SPEC: "Stress-Test" Prototype — Visualizing Mechanistic Uncertainty in an LLM

## 0. Context (read this first)

This is a **demo prototype** for a research project on how to *represent* mechanistic uncertainty to users. It will be shown to people **tomorrow** as one candidate interface. Polish and robustness matter more than completeness. It is NOT a user study yet.

**The idea.** Normal LLM confidence is read from the output (e.g., the probability of the answer token). *Mechanistic uncertainty* instead asks: how stable is the internal mechanism producing this answer? Komanduri et al. (2026, arXiv 2610.22636) define a **causal robustness margin**: the minimum internal intervention needed to change the model's output. Small margin means a fragile answer, and they report that incorrect and uncertain answers have smaller margins.

**What the interface does.** For a set of short factual questions, show the model's answer and then show its fragility in **four alternative representations** (plus a baseline), so viewers can compare the design options:

| View | What it shows |
|---|---|
| R0 Baseline | Ordinary output confidence (P(answer token)) as a bar |
| R1 Margin score | A single robustness score on a fragile → robust gauge |
| R2 Flip curve | P(answer) vs. push strength, one line per layer, with flip points |
| R3 Push it yourself | Interactive sliders (strength, layer) showing what the model would say |
| R4 Counterfactual card | Plain-language sentence: "A small nudge toward *X* changes the answer to *X*" |

Plus an **Overview** scatter (output confidence vs. margin across all questions). That scatter is the main pitch: it shows whether the mechanistic signal says something different from ordinary confidence.

**Honesty requirement.** Our method is an *approximation* of the paper (see §2). The UI must say so in an "About this method" panel. Never claim it is the paper's exact method.

---

## 1. Architecture

```
margin-prototype/
  SPEC.md
  pipeline/                 # Python: compute data offline
    requirements.txt
    questions.json          # input questions + gold answers
    compute_margins.py      # main script
    README.md
  web/                      # Vite + React + TypeScript + D3
    public/data/items.json  # pipeline output (or mock)
    public/data/mock_items.json
    src/...
```

- **Offline pipeline → static JSON → static web app.** No live model in the browser or server. That makes the demo instant and impossible to crash.
- The web app loads `/data/items.json`; if it is missing or fails to parse, it falls back to `/data/mock_items.json` and shows a small "MOCK DATA" badge.

---

## 2. Pipeline (Python)

### Environment
- Python 3.10+, `torch`, `transformers`, `numpy`, `tqdm`. Use plain HF `transformers` with PyTorch forward hooks (no TransformerLens needed).
- Default model: **`Qwen/Qwen2.5-0.5B-Instruct`** (ungated, runs on a laptop CPU or Apple MPS). Make it a CLI flag (`--model`) so `Qwen/Qwen2.5-1.5B-Instruct` or others can be swapped in on a GPU.
- Auto-select device: cuda → mps → cpu. Use float32 on CPU/MPS.

### Questions (`questions.json`)
Write **~24 short factual questions** with gold answers. Mix them:
- ~8 easy (capital of France, chemical symbol for gold)
- ~8 medium (capital of Australia, who wrote *One Hundred Years of Solitude*)
- ~8 hard or obscure, where a 0.5B model is likely to be wrong or torn (capital of Burkina Faso, year a minor treaty was signed)

Prefer answers whose **first token is distinctive** (we score the first answer token only). Format:
```json
[{"id": "q01", "question": "What is the capital of Australia?", "gold": "Canberra", "difficulty": "medium"}]
```

### Prompt
Use a few-shot, one-word-answer format so the next token is the answer:
```
Answer each question with a single word or name.
Q: What is the capital of France?
A: Paris
Q: Who painted the Mona Lisa?
A: Leonardo
Q: {question}
A:
```
Read logits at the **last prompt position** (the token after "A:").

### Quantities to compute per item
1. **Unsteered run.** Get `answer_token` a = argmax and `p_answer` = softmax prob (the **baseline output confidence**). Get the top-5 tokens with probs. Greedy-generate up to 6 tokens to get `answer_text`. Set `correct` = normalized `answer_text` starts with normalized gold (lowercase, strip punctuation and whitespace).
2. **Alternative token b.** The highest-probability token whose stripped, lowercased decoding differs from a's and is non-empty and not punctuation (avoid " Paris" vs "Paris" duplicates).
3. **Steering direction (approximation).** Use a contrastive **logit-lens direction**: `v = W_U[b] − W_U[a]`, then `v̂ = v / ||v||`. W_U is the unembedding matrix (`model.lm_head.weight`). This is the special case J = I of the Jacobian lens used in the paper. Document this.
4. **Intervention.** At decoder layer ℓ, at the **last position only**, add `α · ||h_ℓ|| · v̂` to that layer's output hidden state (use a forward hook on `model.model.layers[ℓ]`; the output is a tuple and you edit `output[0]`). Scaling by the residual norm makes α unitless and comparable across layers.
5. **Flip curve grid.** For each layer ℓ (all layers by default; a `--layer-stride` flag allows every 2nd) and each α in `np.arange(0, 1.51, 0.05)`, record P(a), P(b), and the top-1 token string.
6. **Per-layer margin.** The smallest α in the grid where top-1 ≠ a. Then refine with a 6-step binary search between the bracketing grid points. If it never flips, set `margin = null` and `censored = true` (display as "> 1.5").
7. **Overall margin.** The minimum per-layer margin. Also record `margin_layer` (the argmin). Note in the README that the paper's exact aggregation may differ.
8. **Counterfactual text.** At (`margin_layer`, `margin × 1.05`), greedy-generate up to 6 tokens with the hook active. Store as `counterfactual_text`.
9. **Percentile.** After all items are done, compute each item's margin percentile among items (censored counts as max).

### Runtime
24 items × 24 layers × 31 α values comes to about 18k short forward passes, which should take minutes on a laptop CPU for 0.5B. Add a `--limit N` flag for quick tests and a tqdm progress bar. Cache results per item so reruns skip finished items.

### Output schema: `web/public/data/items.json`
```json
{
  "meta": {
    "model": "Qwen/Qwen2.5-0.5B-Instruct",
    "n_layers": 24,
    "alphas": [0.0, 0.05, "..."],
    "method_note": "Contrastive logit-lens steering at last position; alpha scaled by residual norm; first-token flip.",
    "generated_at": "ISO timestamp",
    "is_mock": false
  },
  "items": [
    {
      "id": "q07",
      "question": "What is the capital of Australia?",
      "gold": "Canberra",
      "difficulty": "medium",
      "answer_text": "Canberra",
      "answer_token": " Canberra",
      "alt_token": " Sydney",
      "correct": true,
      "p_answer": 0.81,
      "top5": [{"token": " Canberra", "p": 0.81}, {"token": " Sydney", "p": 0.12}],
      "margin": 0.18,
      "censored": false,
      "margin_layer": 14,
      "margin_percentile": 0.22,
      "per_layer_margin": [0.9, 0.7, null, "..."],
      "curves": {
        "p_answer": [[/* layer 0: one value per alpha */], "..."],
        "p_alt":    [["..."], "..."],
        "top1":     [["Canberra", "Canberra", "Sydney"], "..."]
      },
      "counterfactual_text": "Sydney"
    }
  ]
}
```
Round floats to 4 decimals to keep the file small.

### Quadrant check (print at the end)
Print a table of items sorted by margin, plus counts in the 4 quadrants (median splits of `p_answer` and `margin`). The most interesting quadrant is **high confidence + low margin** ("confident but fragile"). If that quadrant is empty, say so loudly. It is the key thing the demo needs to show.

---

## 3. Mock data (build FIRST)

Before touching the model, create `web/public/data/mock_items.json` by hand (or with a tiny script) using the exact schema above: **8 items**, 2 per quadrant, with plausible curves (sigmoid-shaped drops in P(answer) at layer-dependent α). Set `meta.is_mock: true`. This guarantees a working demo even if the pipeline fails tonight.

---

## 4. Web app (Vite + React + TypeScript + D3)

### Global layout
- **Top bar:** the title "How sure is the model, *inside*?", a small subtitle "Prototype: mechanistic uncertainty representations", and the MOCK badge when relevant.
- **Left rail:** list of questions as compact cards showing the question text and a tiny correctness dot. The correctness dot is hidden when the "Hide answers key" toggle is on.
- **Main area:** tabs `Overview | R0 Baseline | R1 Score | R2 Flip curve | R3 Push it | R4 Counterfactual | Compare all`.
- The current tab and item are reflected in the URL (`?view=r2&item=q07`) so specific screens can be linked during a talk.
- **Footer button:** "About this method" opens a side drawer (§4.8).

### Shared answer header (on every per-item view)
The question, the model's answer in large type, and the gold answer plus correct/incorrect (hidden behind a "Reveal answer key" toggle, **hidden by default**, so viewers can judge before seeing the truth).

### Consistent visual encoding (use it everywhere)
- **Answer token a:** one fixed color (e.g., blue `#2563eb`).
- **Alternative token b:** one fixed contrasting color (e.g., orange `#ea580c`).
- **Fragile → robust:** a single sequential scale. Never use red/green as the only cue; always pair color with a text label.
- Typography: system UI font, generous whitespace, light theme, no chart junk. Every chart has axis labels in plain words ("Push strength", "Probability of model's answer").

### 4.1 Overview
A scatter plot with x = output confidence (`p_answer`) and y = robustness margin (censored points pinned at the top with a "> 1.5" marker). Point color/shape shows correct vs. incorrect (shape too, for accessibility). Dashed median lines with quadrant labels: "Confident & robust", "Confident but fragile", "Unsure but stable", "Unsure & fragile". Hovering shows the question and answer; clicking opens that item in R2. Above the chart, a one-sentence takeaway computed from the data, e.g., "4 of 24 answers look confident but are mechanistically fragile."

### 4.2 R0 Baseline: output confidence
A horizontal bar showing `p_answer` as a percentage, plus the top-5 token distribution as a small bar list. This is the "what products show today" condition.

### 4.3 R1 Margin score
- A horizontal gauge from 0 to 1.5+ with three labeled bands: **Fragile / Moderate / Robust**. Band thresholds are the tertiles of margins across the dataset (computed client-side).
- A needle or marker at the item's margin, with the label "Robustness 0.18: Fragile".
- One plain-language line: "This answer changes with a smaller internal push than 78% of the other answers."

### 4.4 R2 Flip curve
- Line chart with x = push strength α, y = P(answer). One thin gray line per layer. The `margin_layer` line is highlighted in the answer color, and its P(alt) line is drawn dashed in the alt color.
- A vertical marker at the margin labeled "Flips to *Sydney* here".
- Hovering a gray line highlights it and shows "Layer 9: flips at 0.42" (or "never flips").
- **Small inset under the chart:** a layer × α heatmap where each cell is colored by whether top-1 is still the answer (answer color) or not (alt color, or neutral gray for a third token). This makes "which layers are fragile" visible at a glance.

### 4.5 R3 Push it yourself
- Two sliders: **Push strength** (snapping to the α grid) and **Layer** (default `margin_layer`).
- A live panel showing "At this push, the model would say: **Sydney**" with an animated swap when top-1 changes, and bars for P(answer) and P(alt) that animate smoothly.
- A small "auto-play" button that sweeps α from 0 up to the flip, for presenting.
- Caption: "Values are precomputed; the slider snaps to tested strengths."

### 4.6 R4 Counterfactual card
A card that reads like a sentence:

> A **small** internal nudge toward "Sydney" (strength 0.18, layer 14) makes the model answer "**Sydney**" instead of "Canberra".

The size word comes from the band: small, moderate, or large. For censored items: "Even a large internal push (1.5) did not change this answer." Below it, a muted comparison line: "More fragile than 78% of questions tested."

### 4.7 Compare all
A 2×2 grid of R1–R4 for the selected item, with R0 as a slim strip on top. Each panel is titled with its representation name. **This is the main screen for tomorrow's presentation**, so it must fit a 1440×900 laptop screen without scrolling.

### 4.8 About this method (drawer)
Short, honest text:
- What the causal robustness margin is (cite Komanduri et al., 2026, arXiv 2610.22636).
- **How this prototype approximates it:** a contrastive logit-lens direction (answer vs. runner-up token) instead of Jacobian-lens concept vectors; a push at the last token position scaled by residual-stream norm; first-token flips only; a small model (show `meta.model`); minimum over layers.
- Limitations: a single alternative direction; small model; a demo question set; not validated.

### Quality bar
- No console errors; works in Chrome at 1440×900 and 1280×800.
- All charts have tooltips, axis labels, and transitions of 300ms or less.
- Keyboard: ↑/↓ changes item, 1–7 switches tabs (handy when presenting).
- `npm run build` produces a static `dist/` that can be opened via `npm run preview` (and is deployable to GitHub Pages / Netlify as-is).

---

## 5. Milestones (do in order; commit after each)

1. **M1 Skeleton + mock data:** scaffold the Vite app, write the mock JSON, and build the layout, item list, URL state, and R0 + R1. *Check:* the app runs on mock data.
2. **M2 All views on mock:** R2 (with heatmap), R3, R4, Overview, Compare all, About drawer. *Check:* every tab renders for every mock item and Compare all fits 1440×900.
3. **M3 Pipeline:** `compute_margins.py`; run with `--limit 3`, then the full set. Print the quadrant table. *Check:* the JSON validates against the schema and the app loads real data with no code changes.
4. **M4 Polish for the demo:** keyboard shortcuts, auto-play, the Overview takeaway sentence, empty and edge states (censored items, items where the model is wrong), final visual pass.

If time runs short, **stop after M2 + M4 on mock data**. That is still a complete demo; just leave the MOCK badge visible.

## 6. Out of scope for now
Participant logging, study conditions or randomization, live model inference, multi-token answers, Jacobian-lens implementation, multiple alternative directions, random-direction controls. (These are the next steps after the demo; leave TODO notes where they would plug in.)
