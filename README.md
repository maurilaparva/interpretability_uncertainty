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

## Run the local study

Click **Start study** or open `study/` (old `?mode=study` links redirect there). The guided flow uses [QUESTIONS.md](QUESTIONS.md), randomly
assigns task set A or B without asking for birth month, and saves progress automatically. Resume in the
same browser and origin (same address and port); progress lives in `localStorage` under `uncircuit.study.v1`.
All questions are required; written feedback can use “None” when there is nothing to report.
Starting a new session replaces the saved session after confirmation; download the previous session first to keep it.

Download **CSV** for responses or **JSON** for responses and interaction events, including views, question
selection, sliders, autoplay, About-panel use, and step timings.

A quick guide appears after first impressions and can be reopened from the task toolbar. CSV includes
`guidance_version`; JSON includes guide exposure and navigation events, including earlier explorer use
in the same browser tab. Section B receives no new hints; Section F and D2 measure post-guidance comprehension.

### Google Sheets upload

When `VITE_SHEETS_URL` is set, a finished session is POSTed once to a Google Apps Script web app, which writes
one row per participant to a **Responses** tab and every interaction to an **Events** tab. If the upload fails,
the completion screen offers a retry, and the download buttons remain as a fallback. Without the variable,
nothing is sent and responses must be collected manually.

1. In the Sheet, open **Extensions → Apps Script**, paste [apps-script/Code.gs](apps-script/Code.gs), and deploy it as a
   **Web app** (Execute as: *Me*, Who has access: *Anyone*). After editing the script, use
   **Manage deployments → Edit → Version: New version** so the `/exec` URL keeps working.
2. Put the `/exec` URL in [web/.env](web/.env) as `VITE_SHEETS_URL=…` and commit it. Opening the URL in a browser
   should show `{"ok":true,...}`.
3. Restart `npm run dev` (Vite reads env files at startup). A `web/.env.local` overrides `web/.env` locally.

The `/exec` URL ships in the public JavaScript, so anyone with the page can post to it.

Participants see no grades. The answer key unlocks after predictions are submitted; this controls the
study flow and stays locked in the explorer while predictions are pending. The underlying static dataset remains accessible.

Task 3 is omitted because no current item has both ≥90% output confidence and a Fragile-band score.
F7 tests fragility under the tested intervention rather than claiming that fragility predicts correctness.

## Deploy to GitHub Pages

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) tests, builds, and publishes `web/dist` on every push to
`main`. One-time setup: in the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
The site is then at `https://<user>.github.io/<repo>/`, and the study at `…/study/` (the link to give participants).
Older releases stay online for comparison at `…/<address>/` (e.g. `…/v0/`), one per line of
[versions.txt](versions.txt); each address keeps its own saved study progress.

## Versions

Live at `https://mivillavicencio.com/interpretability_uncertainty/` (latest) and `…/<address>/` (older, see
[versions.txt](versions.txt)). Every response records its version (`app_version`); a blank value means v0.

| Version | Address | What changed |
|---|---|---|
| v0.1.0 | `/v0/` | Original demo and study (`?mode=study`). |
| v0.2.0 | | Same rendering in Chrome, Safari and Firefox (sliders, selects, R2 heatmap, quick guide). |
| v0.3.0 | | Study at its own address (`study/`); version stamped on every response; older versions kept online. |
| v0.3.1 | `/v1/` | `app_version` reaches the Responses sheet without redeploying the sheet script. |
| unreleased (`next`) | | Welcome page with goal, duration, pause note and a submission ID at the end; outline of the five parts; participants never sent to the explorer. Free exploration (B) restored: 5 min, views hidden until "Start exploring", controls highlighted, Overview clicks select instead of jumping to R2. Guided "Learn the views" tour opens C: concepts first (the quick guide is folded in as "Try a push" and "Two scores", so it no longer pops up before the tasks), then R1–R4 in a counterbalanced order per participant (also used for the ratings; `view_order` recorded). Overview: linear axis with zoom and a mini-map. One color per variable. Larger, plainer explanations. |

## Recompute the data

See [pipeline/README.md](pipeline/README.md). About 5 minutes on a laptop CPU for Qwen2.5-0.5B-Instruct.
The approximation and its known limits (the margin tracks output confidence, ρ ≈ 0.7) are documented there
and in the app's **About this method** drawer.
