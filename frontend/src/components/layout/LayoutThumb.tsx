import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
};

export default function LayoutThumb({
  layout,
  width = 320,           // acts as a maxWidth now
  pageW = 1280,
  pageH = 720,
  selected,
  onSelect,
}: ThumbProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageW, setStageW] = useState<number>(width); // measured content width

  // Observe the rendered width so we can scale fonts/icons correctly
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

  const { title, text, images } = useMemo(() => normalizeFrames(layout?.frames), [layout?.frames]);

  // helpers: percentage placement
  const pct = (n: number, base: number) => `${(n / base) * 100}%`;

  // scale to use for typography/icons
  const s = (stageW || width) / (pageW || 1280);

  if (!layout) {
    return (
      <div className="w-full rounded-2xl border border-gray-200 bg-white p-3" aria-busy>
        <div
          className="mx-auto rounded-xl border border-gray-300/70 bg-gray-50 animate-pulse"
          style={{
            width: "100%",
            maxWidth: width,
            aspectRatio: `${pageW}/${pageH}`,
          }}
        />
        <div className="mt-2 h-3 w-2/3 rounded bg-gray-100" />
      </div>
    );
  }

  const stageStyle: CSSProperties = {
    // responsive, centered stage that never exceeds its column
    width: "100%",
    maxWidth: width,
    aspectRatio: `${pageW}/${pageH}`,
    position: "relative",
    background: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  };

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
      type="button"
      onClick={() => onSelect?.(layout.id)}
      className={`w-full text-left rounded-2xl border bg-white p-3 shadow-sm hover:shadow ${
        selected ? "ring-2 ring-blue-600 border-blue-600" : "border-gray-200"
      }`}
      title={layout.name}
    >
      <div ref={stageRef} className="mx-auto border border-gray-300/70 rounded-xl" style={stageStyle}>
        {title && (
          <div style={{ ...box(title), background: "#0f172a" }}>
            <div
              style={{
                fontSize: Math.max(10, 28 * s), // scales with real width
                color: "white",
                fontWeight: 700,
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
              background: "rgba(251,191,36,0.22)",
              border: "1px solid rgba(245,158,11,0.55)",
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
                    background: "#cbd5e1",
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
              background: "rgba(59,130,246,0.18)",
              border: "1px solid rgba(59,130,246,0.35)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              style={{
                width: Math.min(48, (f.w * (stageW || width)) / pageW * 0.4),
                height: Math.min(48, (f.h * (stageW || width)) / pageH * 0.4),
                opacity: 0.6,
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

      <div className="mt-2 text-xs text-gray-700 truncate">{layout.name}</div>
    </button>
  );
}
