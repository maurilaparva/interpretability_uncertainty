import type { ReactNode } from 'react';

/** Tooltip positioned (in px) relative to the nearest positioned ancestor; clamped horizontally,
 *  and flipped below the point when there is no room above. */
export function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.max(120, Math.min(x, width - 120));
  const below = y < 90;
  return (
    <div className="tip" style={{ left, top: y, transform: below ? 'translate(-50%, 14px)' : undefined }}>
      {children}
    </div>
  );
}
