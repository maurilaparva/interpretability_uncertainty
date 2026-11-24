"""Figures for the Preliminary Findings section, built from final_study.json.

fig_accuracy.pdf : correct / not sure / wrong per graded item (RQ1)
fig_views.pdf    : per-view ratings and the overall ranking (RQ2)
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

DATA = Path(__file__).parent / "final_study.json"
OUT = Path(__file__).parent.parent / "final-report" / "img"
d = json.loads(DATA.read_text())
n = d["meta"]["n"]

CORRECT, UNSURE, WRONG = "#3f74ad", "#d7dce1", "#c0703c"

# ---------- RQ1: accuracy per graded item ----------
items = [(t, "C") for t in d["tasks"]] + [(t, "F") for t in d["understanding"]]
fig, ax = plt.subplots(figsize=(3.33, 3.5))
labels = []
for y, (t, grp) in enumerate(items):
    left = 0
    for count, colour in ((t["correct"], CORRECT), (t["notsure"], UNSURE), (t["wrong"], WRONG)):
        if count:
            ax.barh(y, count, left=left, color=colour, edgecolor="white", linewidth=0.6, height=0.68)
            ax.text(left + count / 2, y, str(count), ha="center", va="center", fontsize=6.5,
                    color="white" if colour == CORRECT else "#23323f")
            left += count
    labels.append(t["id"])
ax.set_yticks(range(len(items)))
ax.set_yticklabels(labels, fontsize=7)
ax.invert_yaxis()
ax.set_xlim(0, n)
ax.set_xticks([0, 5, 10, 15, n])
ax.tick_params(axis="x", labelsize=6.5, length=2)
ax.set_xlabel(f"participants (n = {n})", fontsize=7)
ax.axhline(len(d["tasks"]) - 0.5, color="#9aa4ae", linewidth=0.7, linestyle=(0, (3, 2)))
ax.text(n, len(d["tasks"]) / 2 - 0.5, "guided\ntasks", fontsize=6.5, color="#6b7682", va="center", ha="left")
ax.text(n, len(d["tasks"]) + len(d["understanding"]) / 2 - 0.5, "comprehension",
        fontsize=6.5, color="#6b7682", va="center", ha="left")
for side in ("top", "right", "left"):
    ax.spines[side].set_visible(False)
ax.spines["bottom"].set_color("#b9c2cb")
handles = [plt.Rectangle((0, 0), 1, 1, color=c) for c in (CORRECT, UNSURE, WRONG)]
ax.legend(handles, ["correct", "not sure", "wrong"], fontsize=6.5, ncol=3, loc="lower center",
          bbox_to_anchor=(0.5, 1.01), frameon=False, handlelength=1.1, columnspacing=1.2)
fig.savefig(OUT / "fig_accuracy.pdf", bbox_inches="tight", pad_inches=0.02)

# ---------- RQ2: ratings and ranking ----------
STAT = [("E1", "understood it"), ("E2", "helped me decide"), ("E3", "was clear")]
SHADES = ["#8fb4d8", "#4e81b5", "#1f4b7f"]
views = [v["view"] for v in d["view_ratings"]]
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.0, 2.1), gridspec_kw={"width_ratios": [2.0, 1.0]})
h = 0.26
for k, (sid, lab) in enumerate(STAT):
    vals = [next(i["mean"] for i in v["items"] if i["id"].startswith(sid)) for v in d["view_ratings"]]
    ys = [y + (k - 1) * h for y in range(len(views))]
    ax1.barh(ys, vals, height=h, color=SHADES[k], label=lab)
    for y, val in zip(ys, vals):
        ax1.text(val + 0.08, y, f"{val:.2f}", va="center", fontsize=6, color="#4a5560")
ax1.set_yticks(range(len(views)))
ax1.set_yticklabels(views, fontsize=7.5)
ax1.invert_yaxis()
ax1.set_xlim(1, 7.6)
ax1.set_xticks([1, 3, 5, 7])
ax1.set_xlabel("mean agreement (1 to 7)", fontsize=7)
ax1.legend(fontsize=6.5, ncol=3, loc="lower center", bbox_to_anchor=(0.5, 1.01), frameon=False,
           handlelength=1.1, columnspacing=1.2)
ax1.set_title("(a) per-view ratings", fontsize=7.5, loc="left", pad=18)

order = sorted(d["ranking"], key=lambda r: r["mean"])
ax2.barh([r["view"] for r in order], [r["mean"] for r in order], color="#4e81b5", height=0.6)
for y, r in enumerate(order):
    ax2.text(r["mean"] + 0.07, y, f"{r['mean']:.2f}", va="center", fontsize=6, color="#4a5560")
ax2.set_yticks(range(len(order)))
ax2.set_yticklabels([r["view"] for r in order], fontsize=7.5)
ax2.invert_yaxis()
ax2.set_xlim(0, 4.6)
ax2.set_xticks([1, 2, 3, 4])
ax2.set_xlabel("mean rank (1 = most useful)", fontsize=7)
ax2.set_title("(b) overall ranking", fontsize=7.5, loc="left", pad=18)
for a in (ax1, ax2):
    a.tick_params(axis="x", labelsize=6.5, length=2)
    for side in ("top", "right", "left"):
        a.spines[side].set_visible(False)
    a.spines["bottom"].set_color("#b9c2cb")
fig.savefig(OUT / "fig_views.pdf", bbox_inches="tight", pad_inches=0.02)
print("wrote fig_accuracy.pdf and fig_views.pdf")
