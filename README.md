# How sure is the model, *inside*? (mechanistic-uncertainty demo)

A prototype showing five ways to represent an LLM's answer fragility: baseline output confidence (R0), a
robustness score (R1), flip curves (R2), push-it-yourself sliders (R3) and a counterfactual sentence (R4),
plus an Overview scatter of confidence against robustness. Full requirements are in [SPEC.md](SPEC.md).

```
pipeline/   Python: computes approximate causal robustness margins offline -> web/public/data/items.json
web/        Vite + React + TypeScript + D3 static app (reads items.json, falls back to mock_items.json)
```

## Run the demo

```bash
cd web
npm install
npm run dev          # http://localhost:5173
# or the production build:
npm run build && npm run preview     # http://localhost:4173 (dist/ is deployable as-is)
```

Useful links while presenting:

| Screen | URL |
|---|---|
| Main presentation screen | `?view=compare&item=q15` (confident but fragile: Brasília → Rio) |
| The key scatter | `?view=overview` |
| Unsure but stable | `?view=compare&item=q05` (Shakespeare: 50% confidence, yet robust) |
| A wrong answer | `?view=r2&item=q19` (W → "Oxygen") |
| The intended design, on mock data | append `&data=mock` to any URL |

Keyboard: **↑/↓** question · **1–7** tabs · **K** answer key · **Esc** closes the About drawer.
The answer key (gold answer, correct/incorrect) is hidden by default.

## Recompute the data

See [pipeline/README.md](pipeline/README.md). About 5 minutes on a laptop CPU for Qwen2.5-0.5B-Instruct.
The approximation and its known limits (the margin tracks output confidence, ρ ≈ 0.7) are documented there
and in the app's **About this method** drawer.
