export const VIEWS = [
  { key: 'overview', label: 'Overview' },
  { key: 'r0', label: 'R0 Baseline' },
  { key: 'r1', label: 'R1 Score' },
  { key: 'r2', label: 'R2 Flip curve' },
  { key: 'r3', label: 'R3 Push it' },
  { key: 'r4', label: 'R4 Counterfactual' },
  { key: 'compare', label: 'Compare all' },
] as const;

export type ViewKey = (typeof VIEWS)[number]['key'];
