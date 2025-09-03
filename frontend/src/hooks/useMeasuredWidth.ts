import { useEffect, useRef, useState } from "react";

/**
 * Observe the rendered width of a div.
 * Returns: [ref, widthPx]
 *
 * Usage:
 *   const [ref, w] = useMeasuredWidth();
 *   return <div ref={ref}>…</div>
 */
export default function useMeasuredWidth(): [
  React.MutableRefObject<HTMLDivElement | null>,
  number
] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Guard for environments without ResizeObserver (SSR/tests)
    if (typeof ResizeObserver === "undefined") {
      setW(el.getBoundingClientRect().width);
      const onResize = () => setW(el.getBoundingClientRect().width);
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, w];
}
