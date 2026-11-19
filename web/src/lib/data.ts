import * as d3 from 'd3';
import type { Band, Dataset, Item, Stats } from './types';
import { siteRoot } from './site';

export interface Loaded {
  data: Dataset;
  isMock: boolean;
  /** Why we fell back to mock data, if we did. */
  fallbackReason?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isDataset(x: any): x is Dataset {
  return (
    x &&
    x.meta &&
    Array.isArray(x.meta.alphas) &&
    Array.isArray(x.items) &&
    x.items.length > 0 &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    x.items.every((it: any) => typeof it.id === 'string' && it.curves && Array.isArray(it.curves.p_answer))
  );
}

async function tryLoad(url: string): Promise<Dataset> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json(); // dev servers answer missing files with index.html -> parse error
  if (!isDataset(j)) throw new Error('unexpected format');
  return j;
}

export async function loadDataset(): Promise<Loaded> {
  const base = siteRoot(); // not BASE_URL: it is relative ('./'), which breaks from /study/
  // ?data=mock forces the mock set (handy for presenting the intended design).
  if (new URLSearchParams(window.location.search).get('data') === 'mock') {
    return { data: await tryLoad(`${base}data/mock_items.json`), isMock: true, fallbackReason: 'forced with ?data=mock' };
  }
  try {
    const data = await tryLoad(`${base}data/items.json`);
    return { data, isMock: !!data.meta.is_mock };
  } catch (e) {
    const data = await tryLoad(`${base}data/mock_items.json`);
    return { data, isMock: true, fallbackReason: `items.json not usable (${(e as Error).message})` };
  }
}

/** Margin used for ranking/plotting: censored items get the cap value. */
export function mval(it: Item, stats: Pick<Stats, 'cap'>): number {
  return it.censored || it.margin == null ? stats.cap : it.margin;
}

export function computeStats(data: Dataset): Stats {
  const alphas = data.meta.alphas;
  const maxAlpha = alphas[alphas.length - 1];
  const cap = maxAlpha + 0.1;
  const items = data.items;
  const ms = items.map((it) => mval(it, { cap })).sort(d3.ascending);
  const ps = items.map((it) => it.p_answer);
  const nRows = items[0].curves.p_answer.length;
  const layers =
    data.meta.layers && data.meta.layers.length === nRows ? data.meta.layers : d3.range(nRows);
  const fragilerThan = new Map<string, number>();
  const robusterThan = new Map<string, number>();
  const others = Math.max(items.length - 1, 1);
  for (const it of items) {
    const m = mval(it, { cap });
    fragilerThan.set(it.id, items.filter((o) => o !== it && mval(o, { cap }) > m).length / others);
    robusterThan.set(it.id, items.filter((o) => o !== it && mval(o, { cap }) < m).length / others);
  }
  const anyCensored = items.some((it) => it.censored || it.margin == null);
  const maxFlip = d3.max(items, (it) => (it.censored || it.margin == null ? 0 : it.margin)) ?? maxAlpha;
  const displayMax = anyCensored
    ? cap + 0.05
    : (PUSH_TICK_CANDIDATES.find((t) => t >= maxFlip * 1.15) ?? maxAlpha);
  return {
    alphas,
    maxAlpha,
    cap,
    displayMax,
    anyCensored,
    t1: Math.min(d3.quantileSorted(ms, 1 / 3) ?? 0.5, maxAlpha),
    t2: Math.min(d3.quantileSorted(ms, 2 / 3) ?? 1, maxAlpha),
    medP: d3.median(ps) ?? 0.5,
    medM: d3.median(ms) ?? 0.5,
    layers,
    fragilerThan,
    robusterThan,
  };
}

export function bandOf(it: Item, stats: Stats): Band {
  if (it.censored || it.margin == null) return 'Robust';
  if (it.margin < stats.t1) return 'Fragile';
  if (it.margin < stats.t2) return 'Moderate';
  return 'Robust';
}

export const BAND_WORD: Record<Band, string> = { Fragile: 'small', Moderate: 'moderate', Robust: 'large' };

export type Quadrant = 'confident-robust' | 'confident-fragile' | 'unsure-stable' | 'unsure-fragile';

export function quadrantOf(it: Item, stats: Stats): Quadrant {
  const confident = it.p_answer > stats.medP;
  const fragile = mval(it, stats) < stats.medM;
  if (confident) return fragile ? 'confident-fragile' : 'confident-robust';
  return fragile ? 'unsure-fragile' : 'unsure-stable';
}

/** Best human-readable word for a top-1 token: the full answer / counterfactual when the token starts it
 *  (so "Bras" shows as "Brasilia", "Kath" as "Kathmandu"); otherwise the stripped token. */
export function wordFor(it: Item, t: string): string {
  const role = tokenRole(it, t);
  if (role === 'answer') return it.answer_text || tok(it.answer_token);
  const s = tok(t);
  const cf = (it.counterfactual_text || '').trim();
  if (cf && s !== '␣' && cf.toLowerCase().startsWith(s.toLowerCase())) return cf;
  return s;
}

/** Display form of a raw token: strip whitespace, make empty visible. */
export function tok(s: string | null | undefined): string {
  const t = (s ?? '').trim();
  return t.length ? t : '␣';
}

/** Push strengths can be as small as 0.002, so use 3 decimals below 0.1. */
export function fmtPush(a: number): string {
  return a < 0.1 && a > 0 ? a.toFixed(3) : a.toFixed(2);
}

export function fmtMargin(it: Item, stats: Stats): string {
  return it.censored || it.margin == null ? `> ${stats.maxAlpha}` : fmtPush(it.margin);
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Comparison sentence, phrased from whichever side the item is on (never "more fragile than 0%"). */
export function comparePhrase(it: Item, stats: Stats, style: 'long' | 'short'): string {
  const fr = stats.fragilerThan.get(it.id) ?? 0;
  const rb = stats.robusterThan.get(it.id) ?? 0;
  if (fr >= rb) {
    return style === 'long'
      ? `This answer changes with a smaller internal push than ${pct(fr)} of the other answers.`
      : `More fragile than ${pct(fr)} of questions tested.`;
  }
  return style === 'long'
    ? `It takes a bigger internal push to change this answer than ${pct(rb)} of the other answers.`
    : `More robust than ${pct(rb)} of questions tested.`;
}

/** Push strengths span ~0.002 .. 1.5, so every push axis uses one shared square-root scale. */
export function pushScale(domainMax: number, range: [number, number]) {
  return d3.scaleSqrt().domain([0, domainMax]).range(range).clamp(true);
}

const PUSH_TICK_CANDIDATES = [0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 1.5];

/** Tick values for a sqrt push axis ending at `max`, thinned so labels don't collide near zero. */
export function pushTicks(max: number, compact = false): number[] {
  const t = PUSH_TICK_CANDIDATES.filter((v) => v <= max + 1e-9 && (v === 0 || v >= max / (compact ? 12 : 30)));
  return compact && t.length > 5 ? t.filter((_, i) => i === 0 || i % 2 === (t.length - 1) % 2) : t;
}

/** Index of the grid strength nearest to a. */
export function nearestAlphaIndex(alphas: number[], a: number): number {
  const i = d3.bisectLeft(alphas, a);
  if (i <= 0) return 0;
  if (i >= alphas.length) return alphas.length - 1;
  return a - alphas[i - 1] < alphas[i] - a ? i - 1 : i;
}

/** Row index in the curves arrays for a given layer number. */
export function rowOfLayer(stats: Stats, layer: number): number {
  const i = stats.layers.indexOf(layer);
  return i >= 0 ? i : 0;
}

/** First token the model switches to at the margin layer (may be a third token). */
export function flipToken(it: Item, stats: Stats): string | null {
  const row = it.curves.top1[rowOfLayer(stats, it.margin_layer)];
  const hit = row?.find((t) => tokenRole(it, t) !== 'answer');
  return hit ?? null;
}

export function tokenRole(it: Item, t: string): 'answer' | 'alt' | 'other' {
  if (t === it.answer_token || tok(t).toLowerCase() === tok(it.answer_token).toLowerCase()) return 'answer';
  if (it.same_answer_tokens?.includes(t)) return 'answer';
  if (t === it.alt_token || tok(t).toLowerCase() === tok(it.alt_token).toLowerCase()) return 'alt';
  return 'other';
}

function rank(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}

export function spearman(a: number[], b: number[]): number {
  const ra = rank(a);
  const rb = rank(b);
  const ma = d3.mean(ra)!;
  const mb = d3.mean(rb)!;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
