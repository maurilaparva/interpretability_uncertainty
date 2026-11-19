/** The views participants compare. R0 (the baseline) is always first, so it is not part of the rotation. */
export type RotatedView = 'r1' | 'r2' | 'r3' | 'r4';

/**
 * Balanced Latin square: each view appears once in every position, and each view comes right before every
 * other view once. Every new session gets one row at random, so order effects are spread across views.
 */
export const VIEW_ORDERS: readonly (readonly RotatedView[])[] = [
  ['r1', 'r2', 'r4', 'r3'],
  ['r2', 'r3', 'r1', 'r4'],
  ['r3', 'r4', 'r2', 'r1'],
  ['r4', 'r1', 'r3', 'r2'],
];

/** Sessions saved before the rotation existed kept this order. */
export const DEFAULT_VIEW_ORDER: readonly RotatedView[] = ['r1', 'r2', 'r3', 'r4'];

export function viewOrderFor(index: number | undefined): readonly RotatedView[] {
  return index === undefined ? DEFAULT_VIEW_ORDER : VIEW_ORDERS[index];
}
