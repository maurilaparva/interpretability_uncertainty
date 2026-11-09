export interface TokenProb {
  token: string;
  p: number;
}

export interface Curves {
  /** [layerIndex][alphaIndex] */
  p_answer: number[][];
  p_alt: number[][];
  top1: string[][];
}

export interface Item {
  id: string;
  question: string;
  gold: string;
  difficulty: string;
  answer_text: string;
  answer_token: string;
  alt_token: string;
  /** Other tokens that are part of the same answer (" Shakespeare" for "William Shakespeare"); not a flip. */
  same_answer_tokens?: string[];
  correct: boolean;
  p_answer: number;
  top5: TokenProb[];
  margin: number | null;
  censored: boolean;
  margin_layer: number;
  margin_percentile: number | null;
  per_layer_margin: (number | null)[];
  curves: Curves;
  counterfactual_text: string;
}

export interface Meta {
  model: string;
  n_layers: number;
  /** Layer numbers that curves[i] refer to. Absent = 0..n-1 (all layers). */
  layers?: number[];
  alphas: number[];
  method_note: string;
  generated_at: string;
  is_mock: boolean;
}

export interface Dataset {
  meta: Meta;
  items: Item[];
}

export type Band = 'Fragile' | 'Moderate' | 'Robust';

export interface Stats {
  alphas: number[];
  maxAlpha: number;
  /** Stand-in margin value for censored items (ranks above every tested strength). */
  cap: number;
  /** Top of every robustness axis: fits the data; includes the "never flipped" zone only if needed. */
  displayMax: number;
  anyCensored: boolean;
  /** Tertile thresholds on margins. */
  t1: number;
  t2: number;
  medP: number;
  medM: number;
  /** Layer number for each curve row. */
  layers: number[];
  /** Share of *other* items whose margin is strictly larger (0..1). */
  fragilerThan: Map<string, number>;
  /** Share of *other* items whose margin is strictly smaller (0..1). */
  robusterThan: Map<string, number>;
}
