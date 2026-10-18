import { useEffect, useRef, useState } from "react";

// Container width in px, so SVG charts draw at real size and text stays legible on phones.
export function useWidth<T extends HTMLElement>(initial = 800) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
