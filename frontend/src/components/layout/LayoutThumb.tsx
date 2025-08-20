import { type CSSProperties, useMemo } from "react";
import type { LayoutItem } from "../../lib/api";
import { normalizeFrames, type Frame } from "./utils";

type ThumbProps = {
  layout?: LayoutItem | undefined;
  width?: number;
  pageW?: number;
  pageH?: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
};

export default function LayoutThumb({
  layout,
  width = 320,
  pageW = 1280,
  pageH = 720,
  selected,
  onSelect,
}: ThumbProps) {
  const { title, text, images } = useMemo(
    () => normalizeFrames(layout?.frames),
    [layout?.frames],
  );

  if (!layout) {
    return (
      <div className="w-full rounded-2xl border border-gray-200 bg-white p-3" aria-busy>
        <div
          className="mx-auto rounded-xl border border-gray-300/70 bg-gray-50 animate-pulse"
          style={{ position: "relative", width, height: Math.round((pageH || 720) * (width / (pageW || 1280))) }}
        />
        <div className="mt-2 h-3 w-2/3 rounded bg-gray-100" />
      </div>
    );
  }

  const s = width / (pageW || 1280);
  const outerH = Math.round((pageH || 720) * s);

  const stageStyle: CSSProperties = {
    position: "relative", width, height: outerH, background: "#fff", borderRadius: 12, overflow: "hidden",
  };

  const box = (f: Frame): CSSProperties => ({
    position: "absolute", left: f.x * s, top: f.y * s, width: f.w * s, height: f.h * s, borderRadius: 8, overflow: "hidden",
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
      <div className="mx-auto border border-gray-300/70 rounded-xl" style={stageStyle}>
        {title && (
          <div style={{ ...box(title), background: "#0f172a" }}>
            <div style={{ fontSize: Math.max(12, 36 * s), color: "white", fontWeight: 700, padding: 6, lineHeight: 1.1 }}>
              Title
            </div>
          </div>
        )}

        {text.map((f, idx) => (
          <div key={`t${idx}`} style={{ ...box(f), background: "rgba(251,191,36,0.22)", border: "1px solid rgba(245,158,11,0.55)" }}>
            <div className="px-2 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}
                  style={{ height: Math.max(4, 6 * s), marginBottom: Math.max(6, 10 * s), width: `${80 - i * 8}%`, background: "#cbd5e1", borderRadius: 3 }}
                />
              ))}
            </div>
          </div>
        ))}

        {images.map((f, idx) => (
          <div key={`i${idx}`} style={{ ...box(f), background: "rgba(59,130,246,0.18)", border: "1px solid rgba(59,130,246,0.35)" }}>
            <svg viewBox="0 0 24 24"
              style={{ width: Math.min(48, f.w * s * 0.4), height: Math.min(48, f.h * s * 0.4), opacity: 0.6,
                       position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
              aria-hidden>
              <path fill="currentColor" d="M21 19V7a2 2 0 0 0-2-2h-3.2l-.8-1H9l-.8 1H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2m-3-8l-3.5 4.5l-2.5-3L8 17h10" />
            </svg>
          </div>
        ))}
      </div>

      <div className="mt-2 text-xs text-gray-700 truncate">{layout.name}</div>
    </button>
  );
}
