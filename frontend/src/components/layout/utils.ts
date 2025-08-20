export type Frame = { x: number; y: number; w: number; h: number };

function toArray<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/** Normalize various backend frame shapes into { title?, text[], images[] }. */
export function normalizeFrames(frames?: unknown): {
  title?: Frame;
  text: Frame[];
  images: Frame[];
} {
  const raw: any = frames || {};
  const title = raw.title as Frame | undefined;
  const text = toArray<Frame>(raw.text ?? raw.bullets);
  const images = toArray<Frame>(raw.images);
  return { title, text, images };
}

/** Local fallback scoring (mirrors backend heuristic). */
export function scoreLayoutLocal(
  item: { supports?: Record<string, number | undefined>; weight?: number },
  text_count: number,
  image_count: number,
) {
  const sup = (item.supports || {}) as Record<string, number | undefined>;
  const tmin = sup.text_min, tmax = sup.text_max;
  const imin = sup.images_min, imax = sup.images_max;

  const penalty = (v: number, mn?: number, mx?: number) => {
    if (typeof mn === "number" && v < mn) return (mn - v) * 2;
    if (typeof mx === "number" && v > mx) return (v - mx) * 1.5;
    return 0;
  };
  const closeness = (v: number, mn?: number, mx?: number) => {
    if (typeof mn !== "number" || typeof mx !== "number" || mx <= mn) return 0;
    const center = (mn + mx) / 2;
    const span = (mx - mn) || 1;
    return Math.abs(v - center) / span;
  };

  let p = penalty(text_count, tmin, tmax) + penalty(image_count, imin, imax);
  if (p === 0) p += (closeness(text_count, tmin, tmax) + closeness(image_count, imin, imax)) * 0.5;
  const w = item.weight ? Number(item.weight) : 1;
  return p / Math.max(0.1, w);
}
