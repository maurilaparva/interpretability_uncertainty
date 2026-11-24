"""Score and summarize the final user study (app_version v0.5.0) into results/final_study.json.

Usage: python3 results/analyze_final.py  (also renders results/final_study_report.html from report_template.html).
"""
import csv, json, re, statistics
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV = ROOT / 'results' / 'Data Tracking - Responses.csv'
ITEMS = json.load(open(ROOT / 'web/public/data/items.json'))['items']
ITEM = {i['id']: i for i in ITEMS}
FINAL_VERSION = 'v0.5.0'

rows = [r for r in csv.DictReader(open(CSV, encoding='utf-8')) if r['participant_id']]
final = [r for r in rows if r['app_version'] == FINAL_VERSION]
excluded = [{'pid': r['participant_id'][:8], 'version': r['app_version'] or '(none)', 'started': r['started_at'][:10]}
            for r in rows if r['app_version'] != FINAL_VERSION]

# Question prompts, read from the questionnaire source; the templated ones are filled in by hand.
src = (ROOT / 'web/src/study/questionnaire.ts').read_text()
PROMPT = {m[0]: m[1].replace('\\u2019', '’') for m in re.findall(r"\(\s*'([A-H]\d+[a-g]?)',\s*'((?:[^'\\]|\\.)*)'", src)}
PROMPT.update({
    'E5': 'In R1, 0.048 is labeled “Robust”. Did 0.048 seem like a small or a large number to you?',
    'E6': 'In R4, “a large internal nudge” matched the strength of 0.048 shown.',
    'F1': 'For question 1, “Robustness 0.048” means…',
    'C11': '', 'C1': PROMPT.get('C1'),
})
for v in ['r0', 'r1', 'r2', 'r3', 'r4']:
    PROMPT[f'E1_{v}'] = 'I understood what this view was showing.'
    PROMPT[f'E2_{v}'] = 'This view helped me decide whether to trust the answer.'
    PROMPT[f'E3_{v}'] = 'This view was visually clear.'
VIEW_NAME = {'overview': 'Overview', 'r0': 'R0 Baseline', 'r1': 'R1 Score', 'r2': 'R2 Flip curve',
             'r3': 'R3 Push it', 'r4': 'R4 Counterfactual', 'compare': 'Compare all', 'own-knowledge': 'Own knowledge'}

pid = lambda r: r['participant_id'][:6]
norm = lambda s: s.strip().lower()

def nums(s):
    return [float(x) for x in re.findall(r'\d*\.?\d+', s)]

# --- graded free-text and single-choice tasks: (id, set or None, key text, grader) ---
STEER = {'A': ITEM['q04'], 'B': ITEM['q24']}
def grade_push(ans, ts):
    # Accept the "flips at" marker (the exact margin, 3 decimals) or the first slider stop past it.
    ok = {'A': {0.019, 0.02}, 'B': {0.01, 0.015}}[ts]
    if 'after' in ans.lower():  # "flipped after the value 0.01" = the next stop
        return {'A': 0.019, 'B': 0.01}[ts] in [round(n, 3) for n in nums(ans)]
    return any(round(n, 3) in ok for n in nums(ans))

TASKS = [
    ('C1', 'Output confidence for “What is the capital of Japan?”', '99%', lambda a, t: '99' in a),
    ('C2', 'Word the answer flips to', 'Kyoto', lambda a, t: norm(a) == 'kyoto'),
    ('C3', 'Layer where the answer is easiest to flip', '22', lambda a, t: '22' in a),
    ('C4', 'Compared with the other questions, this answer is…', 'Harder to flip than most',
     lambda a, t: a == 'Harder to flip than most'),
    ('C6', 'Push strength at which the answer first changed (default layer)',
     'Set A: 0.019 (marker) or 0.02 (slider) · Set B: 0.010 or 0.015', lambda a, t: grade_push(a, t)),
    ('C7', 'What the answer changed to', 'Set A: Atlantic Ocean · Set B: Lagos',
     lambda a, t: norm(a).startswith('atlantic') if t == 'A' else norm(a) == 'lagos'),
    ('C8', 'At layer 5 compared with the default layer, the answer…',
     'Set A: Changed at a larger push · Set B: Never changed',
     lambda a, t: a == ('Changed at a larger push' if t == 'A' else 'Never changed')),
]
UNDERSTANDING = [
    ('F1', 'A push about 4.8% the size of the model’s internal state at one layer is enough to change the answer'),
    ('F2', 'False'),
    ('F3', 'How the answer compares with the other questions in this set'),
    ('F4', 'The same push at other layers'),
    ('F5', 'To the model’s internal state at one layer, while it reads the question'),
    ('F6', 'No'),
    ('F7', 'The answer changes under a small tested internal push; this alone does not establish whether it is correct'),
]
NOT_SURE = lambda a: 'not sure' in a.lower()

def graded(qid, label, key, ok):
    answers = []
    for r in final:
        a = r[qid].strip()
        status = 'notsure' if NOT_SURE(a) and not ok(a, r['task_set']) else ('correct' if ok(a, r['task_set']) else 'wrong')
        answers.append({'pid': pid(r), 'set': r['task_set'], 'answer': a, 'status': status})
    c = {s: sum(x['status'] == s for x in answers) for s in ('correct', 'wrong', 'notsure')}
    return {'id': qid, 'label': label, 'prompt': PROMPT.get(qid, ''), 'key': key, **c, 'answers': answers}

tasks = [graded(*t) for t in TASKS]
understanding = [graded(q, PROMPT[q], key, (lambda k: lambda a, t: a.lower() == k.lower())(key)) for q, key in UNDERSTANDING]

def scale(qid, lo=1, hi=7, prompt=None):
    vals = [int(r[qid]) for r in final if r[qid].strip()]
    return {'id': qid, 'prompt': prompt or PROMPT.get(qid, qid), 'min': lo, 'max': hi,
            'counts': [vals.count(v) for v in range(lo, hi + 1)], 'n': len(vals),
            'mean': round(statistics.mean(vals), 2), 'median': statistics.median(vals)}

def single(qid, options):
    vals = [r[qid].strip() for r in final]
    vals = ['False' if v == 'FALSE' else 'True' if v == 'TRUE' else v for v in vals]
    return {'id': qid, 'prompt': PROMPT.get(qid, qid), 'options': [[o, vals.count(o)] for o in options], 'n': len(vals)}

def multi(qid, options):
    lists = [json.loads(r[qid]) for r in final if r[qid].strip()]
    return {'id': qid, 'prompt': PROMPT.get(qid, qid), 'n': len(lists),
            'options': [[VIEW_NAME.get(o, o), sum(o in l for l in lists)] for o in options]}

# --- predictions (C13): both sets hold two right and two wrong model answers ---
PRED_SETS = {'A': ['q09', 'q19', 'q17', 'q21'], 'B': ['q23', 'q22', 'q08', 'q19']}
LEVELS = ['Definitely wrong', 'Probably wrong', 'Probably right', 'Definitely right', 'Not sure']
ms = sorted(i['margin'] for i in ITEMS if i['margin'] is not None)
def quantile(p):  # d3.quantileSorted
    i = (len(ms) - 1) * p; lo = int(i); return ms[lo] + (ms[min(lo + 1, len(ms) - 1)] - ms[lo]) * (i - lo)
t1, t2 = quantile(1 / 3), quantile(2 / 3)
band = lambda it: 'Fragile' if it['margin'] < t1 else 'Moderate' if it['margin'] < t2 else 'Robust'

pred_items, per_person_pred = [], {}
for qid in ['q09', 'q17', 'q22', 'q08', 'q19', 'q21', 'q23']:
    it = ITEM[qid]
    vals = [r[f'C13_{qid}'] for r in final if r.get(f'C13_{qid}', '').strip()]
    right = sum(('right' in v) == it['correct'] for v in vals if v != 'Not sure')
    pred_items.append({'id': qid, 'question': it['question'], 'answer': it['answer_text'], 'gold': it['gold'],
                       'correct': it['correct'], 'p': it['p_answer'], 'margin': it['margin'], 'band': band(it),
                       'sets': [s for s, l in PRED_SETS.items() if qid in l],
                       'counts': [vals.count(l) for l in LEVELS], 'n': len(vals), 'judged_right': right})
for r in final:
    hits = sum(('right' in r[f'C13_{q}']) == ITEM[q]['correct'] for q in PRED_SETS[r['task_set']]
               if r[f'C13_{q}'] != 'Not sure')
    per_person_pred[r['participant_id']] = hits

# --- ranking (E4) ---
ranks = {v: [] for v in ['r0', 'r1', 'r2', 'r3', 'r4']}
for r in final:
    for pos, v in enumerate(json.loads(r['E4']), 1):
        ranks[v].append(pos)
ranking = [{'view': VIEW_NAME[v], 'key': v, 'mean': round(statistics.mean(p), 2),
            'counts': [p.count(k) for k in range(1, 6)]} for v, p in ranks.items()]
ranking.sort(key=lambda x: x['mean'])

view_ratings = [{'view': VIEW_NAME[v], 'key': v,
                 'items': [scale(f'E{k}_{v}', prompt=PROMPT[f'E{k}_{v}']) for k in (1, 2, 3)]}
                for v in ['r0', 'r1', 'r2', 'r3', 'r4']]

# --- participants table ---
def minutes(r):
    f = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00'))
    return round((f(r['completed_at']) - f(r['started_at'])).total_seconds() / 60, 1)
people = []
for r in final:
    t = sum(next(a for a in task['answers'] if a['pid'] == pid(r))['status'] == 'correct' for task in tasks)
    u = sum(next(a for a in q['answers'] if a['pid'] == pid(r))['status'] == 'correct' for q in understanding)
    people.append({'pid': pid(r), 'set': r['task_set'], 'program': r['A2'], 'llm': int(r['A3']), 'mi': int(r['A4']),
                   'minutes': minutes(r), 'tasks': t, 'pred': per_person_pred[r['participant_id']],
                   'understanding': u, 'order': r['view_order'], 'top': VIEW_NAME[json.loads(r['E4'])[0]],
                   'date': r['started_at'][:10]})
people.sort(key=lambda p: p['date'])

TEXT_IDS = ['B1', 'B2', 'B6', 'C16', 'D4', 'D5', 'E7', 'G3', 'G4', 'H4', 'H5', 'H6', 'H7']
texts = [{'id': q, 'prompt': PROMPT[q],
          'answers': [{'pid': pid(r), 'set': r['task_set'], 'text': r[q].strip()} for r in final if r[q].strip()]}
         for q in TEXT_IDS]

out = {
    'meta': {'n': len(final), 'nA': sum(r['task_set'] == 'A' for r in final), 'nB': sum(r['task_set'] == 'B' for r in final),
             'first': min(r['started_at'] for r in final)[:10], 'last': max(r['completed_at'] for r in final)[:10],
             'median_minutes': statistics.median(minutes(r) for r in final), 'version': FINAL_VERSION,
             'excluded': excluded, 'thresholds': [round(t1, 4), round(t2, 4)],
             'orders': {o: sum(r['view_order'] == o for r in final) for o in sorted({r['view_order'] for r in final})}},
    'background': {
        'program': single('A2', ['Undergraduate', 'Master’s', 'PhD', 'Other', 'Prefer not to say']),
        'scales': [scale('A3', 1, 5), scale('A4', 1, 5), scale('A6', 1, 5)],
        'steered': single('A5', ['Yes', 'No', 'Not sure']),
    },
    'first': {'opened': multi('B3', ['overview', 'r0', 'r1', 'r2', 'r3', 'r4', 'compare']),
              'about': single('B4', ['Yes, read most of it', 'Yes, skimmed it', 'No']), 'clear': scale('B5')},
    'tasks': tasks, 'task_conf': scale('C5'), 'slider_expect': scale('C9'),
    'autoplay': single('C10', ['Yes, before dragging myself', 'Yes, after dragging myself', 'No']),
    'predictions': pred_items, 'pred_views': multi('C14', ['r0', 'r1', 'r2', 'r3', 'r4', 'own-knowledge']),
    'reliance': scale('C15'),
    'steering': [scale(f'D1{c}') for c in 'abcdefg'],
    'live': single('D2', ['Changing the live model', 'Replaying recorded results', 'Not sure', 'I didn’t think about it']),
    'note': single('D3', ['Yes', 'No']),
    'view_ratings': view_ratings, 'ranking': ranking,
    'scale_sense': single('E5', ['Small', 'Large', 'I had no sense of scale', 'Didn’t notice']), 'nudge_match': scale('E6'),
    'understanding': understanding,
    'trust': [scale(f'G1{c}') for c in 'abcdef'],
    'signal': single('G2', ['Output confidence', 'Robustness', 'Both equally', 'Neither', 'Not sure']),
    'usability': [scale('H1'), scale('H2'), scale('H3')],
    'texts': texts, 'people': people,
}
json.dump(out, open(ROOT / 'results' / 'final_study.json', 'w'), ensure_ascii=False, indent=1)
print(f"final n={out['meta']['n']}  excluded={len(excluded)}")
for t in tasks + understanding:
    print(f"{t['id']:4} correct {t['correct']:2}  wrong {t['wrong']:2}  not sure {t['notsure']:2}")
for p in pred_items:
    print(p['id'], p['band'], p['correct'], p['counts'], 'judged right', p['judged_right'], '/', p['n'])
print('ranking', [(x['view'], x['mean'], x['counts'][0]) for x in ranking])
print('missing prompts', [q for q in ['A3','B5','C5','C9','C15','D1a','G1a','H3','B1','H7','F7','F2','D2'] if q not in PROMPT])

# Render the HTML report: the template with the data inlined.
# The page is written as pure ASCII (entities in markup, \\u escapes in script and style), so dashes, quotes
# and arrows survive whatever encoding the viewer assumes.
template = (ROOT / 'results' / 'report_template.html').read_text()
data = json.dumps(out, ensure_ascii=True).replace('</', '<\\/')
js_escape = lambda t: ''.join(c if ord(c) < 128 else f'\\u{ord(c):04x}' for c in t)
css_escape = lambda t: ''.join(c if ord(c) < 128 else f'\\{ord(c):x} ' for c in t)
parts = re.split(r'(<script>.*?</script>|<style>.*?</style>)', template, flags=re.S)
html = ''.join(js_escape(x) if x.startswith('<script>') else css_escape(x) if x.startswith('<style>')
               else x.encode('ascii', 'xmlcharrefreplace').decode() for x in parts)
(ROOT / 'results' / 'final_study_report.html').write_text(html.replace('/*DATA*/null', data))
print('wrote results/final_study_report.html')
