import * as d3 from 'd3';
import type { Band, Dataset, Item, Stats } from './types';

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
  const base = import.meta.env.BASE_URL;
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
  for (const it of items) {
    const m = mval(it, { cap });
    const larger = items.filter((o) => o !== it && mval(o, { cap }) > m).length;
    fragilerThan.set(it.id, items.length > 1 ? larger / (items.length - 1) : 0);
  }
  return {
    alphas,
    maxAlpha,
    cap,
    t1: Math.min(d3.quantileSorted(ms, 1 / 3) ?? 0.5, maxAlpha),
    t2: Math.min(d3.quantileSorted(ms, 2 / 3) ?? 1, maxAlpha),
    medP: d3.median(ps) ?? 0.5,
    medM: d3.median(ms) ?? 0.5,
    layers,
    fragilerThan,
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

/** Display form of a raw token: strip whitespace, make empty visible. */
export function tok(s: string | null | undefined): string {
  const t = (s ?? '').trim();
  return t.length ? t : '␣';
}

export function fmtMargin(it: Item, stats: Stats): string {
  return it.censored || it.margin == null ? `> ${stats.maxAlpha}` : it.margin.toFixed(2);
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Push strengths span ~0.002 .. 1.5, so every push axis uses one shared square-root scale. */
export function pushScale(domainMax: number, range: [number, number]) {
  return d3.scaleSqrt().domain([0, domainMax]).range(range).clamp(true);
}

export function pushTicks(max: number, compact = false): number[] {
  const t = compact ? [0, 0.1, 0.5, 1, 1.5] : [0, 0.05, 0.1, 0.25, 0.5, 1, 1.5];
  return t.filter((v) => v <= max + 1e-9);
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
