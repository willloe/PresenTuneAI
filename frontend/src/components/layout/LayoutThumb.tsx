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
  /** Maximum width the stage is allowed to take (card still fills its column) */
  width?: number;
  pageW?: number;
  pageH?: number;
  selected?: boolean;
  onSelect?: (id: string) => void;

  // a11y/keyboard (from parent)
  tabIndex?: number;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
};

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
  const [stageW, setStageW] = useState<number>(width); // content-box width

  useEffect(() => {
    if (!stageRef.current) return;
    const el = stageRef.current;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && Math.abs(w - stageW) > 0.5) setStageW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageW]);

  const { title, text, images } = useMemo(
    () => normalizeFrames(layout?.frames),
    [layout?.frames]
  );

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

  // Stage: no borders/padding; content-box; line-height:0; centered
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
        {title && (
          <div style={{ ...box(title), background: "var(--accent)" }}>
            <div
              style={{
                fontSize: Math.max(10, 28 * s),
                color: "var(--accent-contrast)",
                fontWeight: 700,
                fontFamily: "var(--font-heading)",
                letterSpacing: "var(--font-tracking)",
                padding: Math.max(4, 6 * s),
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Title
            </div>
          </div>
        )}

        {text.map((f, idx) => (
          <div
            key={`t${idx}`}
            style={{
              ...box(f),
              background: "transparent",
              border: "1px solid var(--border)",
            }}
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

        {images.map((f, idx) => (
          <div
            key={`i${idx}`}
            style={{
              ...box(f),
              background: "var(--accent-soft)",
              border: "1px solid var(--border)",
              display: "grid",
              placeItems: "center",
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
      </div>

      <div className="mt-2 text-xs truncate" style={{ color: "var(--muted-text)" }}>
        {layout.name}
      </div>
    </button>
  );
}

export default memo(forwardRef<HTMLButtonElement, ThumbProps>(LayoutThumbImpl));
