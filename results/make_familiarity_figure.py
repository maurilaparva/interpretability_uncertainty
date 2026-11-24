"""Likert chart of the three background familiarity items (A3, A4, A6).

Reads the response sheet, keeps the final-build sessions, and writes a
single-column figure for the Participants section of the final report.
"""
import csv
import statistics
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

CSV = Path(__file__).parent / "Data Tracking - Responses.csv"
OUT = Path(__file__).parent.parent / "final-report" / "img" / "familiarity.pdf"
PILOT_ROWS = 8  # the earlier-build sessions, excluded from the main study

ITEMS = [
    ("A3", "LLMs", "rarely use", "train or fine-tune"),
    ("A6", "Uncertainty scores", "not at all", "very familiar"),
    ("A4", "Mechanistic\ninterpretability", "never heard of it", "do research in it"),
]
# sequential blues, light (1) to dark (5)
COLORS = ["#dbe7f3", "#a9c6e4", "#6f9fcd", "#3f74ad", "#1f4b7f"]

rows = [r for r in csv.DictReader(CSV.open(encoding="utf-8-sig")) if (r.get("participant_id") or "").strip()]
rows = rows[PILOT_ROWS:]
n = len(rows)

fig, ax = plt.subplots(figsize=(3.33, 1.85))
for y, (col, label, lo, hi) in enumerate(ITEMS):
    vals = [int(r[col]) for r in rows]
    left = 0
    for score in range(1, 6):
        count = vals.count(score)
        if not count:
            continue
        ax.barh(y, count, left=left, color=COLORS[score - 1], edgecolor="white", linewidth=0.7, height=0.62)
        ax.text(left + count / 2, y, str(count), ha="center", va="center", fontsize=7,
                color="white" if score >= 4 else "#23323f")
        left += count

ax.set_yticks(range(len(ITEMS)))
ax.set_yticklabels([i[1] for i in ITEMS], fontsize=7.5)
ax.invert_yaxis()
ax.set_xlim(0, n + 0.4)
ax.set_xticks([0, 5, 10, 15, 17])
ax.tick_params(axis="x", labelsize=6.5, length=2)
ax.set_xlabel(f"participants (n = {n})", fontsize=7)
for side in ("top", "right", "left"):
    ax.spines[side].set_visible(False)
ax.spines["bottom"].set_color("#b9c2cb")

handles = [plt.Rectangle((0, 0), 1, 1, color=c) for c in COLORS]
ax.legend(handles, ["1", "2", "3", "4", "5"], title="self-rated familiarity (1 = little or no exposure, 5 = active practice)",
          title_fontsize=6.5, fontsize=6.5, ncol=5, loc="lower center",
          bbox_to_anchor=(0.5, 1.14), frameon=False, handlelength=1.1, handleheight=0.9,
          columnspacing=1.0, borderpad=0.1)

OUT.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(OUT, bbox_inches="tight", pad_inches=0.02)
print("wrote", OUT)
print("for the caption:")
for col, label, *_ in ITEMS:
    v = [int(r[col]) for r in rows]
    print(f"  {label.replace(chr(10), ' '):28s} median {statistics.median(v):.0f}  mean {statistics.mean(v):.2f}")
