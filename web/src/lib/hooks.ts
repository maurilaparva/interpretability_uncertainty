import { useLayoutEffect, useRef, useState } from 'react';

/** Measures an element's content box; re-renders on resize. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize((s) =>
        s.width === Math.floor(r.width) && s.height === Math.floor(r.height)
          ? s
          : { width: Math.floor(r.width), height: Math.floor(r.height) },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}
