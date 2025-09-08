import {
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  forwardRef,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import type { LayoutItem } from "../../lib/api";
import { normalizeFrames, type Frame } from "./utils";

type ThumbProps = {
  layout?: LayoutItem | undefined;
  width?: number;
  pageW?: number;
  pageH?: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
  tabIndex?: number;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
};

function pickSectionFrames(f: any): Frame[] {
  if (!f) return [];
  const candidates = [f.sections, f.text, f.content, f.bodies, f.columns];
  for (const c of candidates) if (Array.isArray(c) && c.length) return c as Frame[];
  return [];
}

function LayoutThumbImpl(
  {
    layout,
    width = 320,
    pageW = 1280,
    pageH = 720,
    selected,
    onSelect,
    tabIndex = -1,
    onKeyDown,
  }: ThumbProps,
  ref: React.Ref<HTMLButtonElement>
) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageW, setStageW] = useState<number>(width);

  useEffect(() => {
    if (!stageRef.current) return;
    const el = stageRef.current;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (typeof w === "number" && Math.abs(w - stageW) > 0.5) setStageW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageRef.current, stageW]);

  const { title, images, raw } = useMemo(() => {
    const nf = normalizeFrames(layout?.frames);
    return { title: nf.title, images: nf.images ?? [], raw: layout?.frames ?? {} };
  }, [layout?.frames]);

  const sections: Frame[] = useMemo(() => {
    const nf = normalizeFrames(layout?.frames);
    const viaNF = (nf as any).sections as Frame[] | undefined;
    if (Array.isArray(viaNF) && viaNF.length) return viaNF;
    return pickSectionFrames(raw);
  }, [layout?.frames, raw]);

  const pct = (n: number, base: number) => `${(n / base) * 100}%`;
  const s = useMemo(() => (stageW || width) / (pageW || 1280), [stageW, width, pageW]);

  if (!layout) {
    return (
      <div className="w-full rounded-2xl border bg-white p-3" aria-busy style={{ borderColor: "var(--border)" }}>
        <div
          className="mx-auto rounded-xl animate-pulse"
          style={{
            width: "100%",
            maxWidth: width,
            aspectRatio: `${pageW}/${pageH}`,
            background: "var(--surface)",
          }}
        />
        <div className="mt-2 h-3 w-2/3 rounded" style={{ background: "var(--accent-soft)" }} />
      </div>
    );
  }

  const stageStyle: CSSProperties = useMemo(() => {
    const h = Math.round(pageH * s);
    return {
      width: "100%",
      maxWidth: width,
      height: h,
      position: "relative",
      background: "var(--surface)",
      borderRadius: 12,
      overflow: "hidden",
      boxSizing: "content-box",
      lineHeight: 0,
      marginLeft: "auto",
      marginRight: "auto",
    };
  }, [pageH, s, width]);

  const box = (f: Frame): CSSProperties => ({
    position: "absolute",
    left: pct(f.x, pageW),
    top: pct(f.y, pageH),
    width: pct(f.w, pageW),
    height: pct(f.h, pageH),
    borderRadius: 8,
    overflow: "hidden",
  });

  // Dynamic padding & font for the title, so it never clips and stays centered.
  const titleStyles = (f: Frame): { wrap: CSSProperties; fs: number; pad: number } => {
    const absH = f.h * s; // frame height in preview pixels
    const absW = f.w * s;
    // Pad is proportional to the smaller dimension, clamped.
    const pad = Math.max(4, Math.min(12, Math.min(absW, absH) * 0.12));
    // Base font size scales with frame height, capped by a global max and min.
    const fs = Math.max(9, Math.min(28 * s, (absH - pad * 2) * 0.66));
    return {
      wrap: {
        ...box(f),
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        background: "var(--accent)",
        zIndex: 30, // on top of everything
      },
      fs,
      pad,
    };
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect?.(layout.id)}
      onKeyDown={onKeyDown}
      role="radio"
      aria-checked={!!selected}
      aria-label={`${layout.name}${selected ? " (selected)" : ""}`}
      tabIndex={tabIndex}
      className={`w-full text-left rounded-2xl border p-3 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-600 ${
        selected ? "ring-2 ring-blue-600 border-blue-600" : ""
      }`}
      style={{
        background: "var(--surface)",
        color: "var(--text)",
        ...(selected ? {} : { borderColor: "var(--border)" }),
      }}
      title={layout.name}
    >
      <div ref={stageRef} className="mx-auto" style={stageStyle} data-s={s.toFixed(3)}>
        {/* Draw order: images (back) → sections → title (front) */}
        {(images ?? []).map((f, idx) => (
          <div
            key={`img${idx}`}
            style={{
              ...box(f),
              background: "var(--accent-soft)",
              border: "1px solid var(--border)",
              display: "grid",
              placeItems: "center",
              zIndex: 10,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              style={{
                width: Math.min(48, ((f.w * (stageW || width)) / pageW) * 0.4),
                height: Math.min(48, ((f.h * (stageW || width)) / pageH) * 0.4),
                opacity: 0.75,
                color: "var(--accent)",
              }}
              aria-hidden
            >
              <path
                fill="currentColor"
                d="M21 19V7a2 2 0 0 0-2-2h-3.2l-.8-1H9l-.8 1H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2m-3-8l-3.5 4.5l-2.5-3L8 17h10"
              />
            </svg>
          </div>
        ))}

        {sections.map((f, idx) => (
          <div
            key={`sec${idx}`}
            style={{
              ...box(f),
              background: "transparent",
              border: "1px solid var(--border)",
              zIndex: 20,
            }}
            aria-hidden
          >
            <div style={{ padding: Math.max(4, 6 * s) }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: Math.max(3, 5 * s),
                    marginBottom: Math.max(5, 8 * s),
                    width: `${80 - i * 8}%`,
                    background: "var(--accent-soft)",
                    borderRadius: 3,
                  }}
                />
              ))}
            </div>
          </div>
        ))}

        {title && (() => {
          const { wrap, fs, pad } = titleStyles(title);
          return (
            <div style={wrap}>
              <div
                style={{
                  fontSize: fs,
                  color: "var(--accent-contrast)",
                  fontWeight: 700,
                  fontFamily: "var(--font-heading)",
                  letterSpacing: "var(--font-tracking)",
                  padding: `${pad}px`,
                  lineHeight: 1.1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  width: "100%",
                }}
              >
                Title
              </div>
            </div>
          );
        })()}
      </div>

      <div className="mt-2 text-xs truncate" style={{ color: "var(--muted-text)" }}>
        {layout.name}
      </div>
    </button>
  );
}

export default memo(forwardRef<HTMLButtonElement, ThumbProps>(LayoutThumbImpl));
