import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { EditorDocOut, EditorSlideOut, EditorLayer } from "../lib/api";

/** Small, dependency-free ResizeObserver hook (returns a div ref + its width). */
function useMeasuredWidth(): [React.MutableRefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(e.contentRect.width);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

type Props = {
  doc: EditorDocOut | null | undefined;

  /** Responsive grid: minimum column width (ignored if `cols` is provided). */
  minColPx?: number;

  /** Force a fixed number of columns (1..n). If omitted, uses auto-fit + minmax. */
  cols?: number;

  /** Keep text readable at small scales. */
  minFontPx?: number;

  /** Show dashed outlines for debugging layer frames. */
  showFrames?: boolean;

  /** Toggle image rendering. */
  showImages?: boolean;

  /** Optional: cap the thumbnail height to keep cards compact. */
  maxThumbH?: number;
};

export default function EditorPreview({
  doc,
  minColPx = 340,
  cols,
  minFontPx = 12,
  showFrames = false,
  showImages = true,
  maxThumbH,
}: Props) {
  if (!doc?.slides?.length) {
    return <div className="text-sm text-gray-600">No editor document to preview yet.</div>;
  }

  const pageW = doc.page?.width ?? 1280;
  const pageH = doc.page?.height ?? 720;

  const gridStyle: CSSProperties = cols
    ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
    : { gridTemplateColumns: `repeat(auto-fit, minmax(${minColPx}px, 1fr))` };

  return (
    <div className="mt-4">
      <div className="text-sm text-gray-700 mb-2">
        Theme: <b>{doc.theme || "default"}</b> • Slides: <b>{doc.slides.length}</b>
      </div>

      <div className="grid gap-5" style={gridStyle}>
        {doc.slides.map((s, i) => (
          <SlideCard
            key={s.id ?? i}
            slide={s}
            pageW={pageW}
            pageH={pageH}
            minFontPx={minFontPx}
            showFrames={showFrames}
            showImages={showImages}
            maxThumbH={maxThumbH}
          />
        ))}
      </div>
    </div>
  );
}

function SlideCard({
  slide,
  pageW,
  pageH,
  minFontPx,
  showFrames,
  showImages,
  maxThumbH,
}: {
  slide: EditorSlideOut;
  pageW: number;
  pageH: number;
  minFontPx: number;
  showFrames: boolean;
  showImages: boolean;
  maxThumbH?: number;
}) {
  // Measure available width to compute an exact scale.
  const [holderRef, holderW] = useMeasuredWidth();

  const stageW = Math.max(200, holderW);
  const stageH = Math.round((stageW * pageH) / pageW);
  const clampedH = typeof maxThumbH === "number" ? Math.min(stageH, maxThumbH) : stageH;
  const scale = stageW / pageW;

  const stageStyle: CSSProperties = {
    position: "relative",
    width: stageW,
    height: clampedH,
    background: slide.background?.fill ?? "#fff",
    borderRadius: 16,
    overflow: "hidden",
  };

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-3">
      <div ref={holderRef}>
        <div className="mx-auto border border-gray-300/70 rounded-xl overflow-hidden" style={stageStyle}>
          {slide.layers
            ?.slice()
            .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
            .map((ly) => (
              <LayerView
                key={ly.id}
                layer={ly}
                scale={scale}
                minFontPx={minFontPx}
                showFrameOutline={showFrames}
                showImage={showImages}
              />
            ))}
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-600 truncate">{slide.name}</div>
    </div>
  );
}

function LayerView({
  layer,
  scale,
  minFontPx,
  showFrameOutline,
  showImage,
}: {
  layer: EditorLayer;
  scale: number;
  minFontPx: number;
  showFrameOutline: boolean;
  showImage: boolean;
}) {
  const f = layer.frame || { x: 0, y: 0, w: 0, h: 0 };
  const base: CSSProperties = {
    position: "absolute",
    left: f.x * scale,
    top: f.y * scale,
    width: f.w * scale,
    height: f.h * scale,
    boxSizing: "border-box",
    border: showFrameOutline ? "1px dashed rgba(0,0,0,0.28)" : undefined,
    borderRadius: 6,
    overflow: "hidden",
    background: "transparent",
  };

  if (layer.kind === "textbox") {
    const style = layer.style || {};
    const align = style.align || (style as any).textAlign || "left";
    const fontSizeRaw = typeof style.size === "number" ? style.size * scale : 20 * scale;
    const fontSize = Math.max(minFontPx, fontSizeRaw);

    const textStyle: CSSProperties = {
      fontFamily: style.font || "Inter, ui-sans-serif, system-ui",
      fontSize,
      fontWeight: style.weight || 400,
      lineHeight: 1.25,
      color: style.color || "#111",
      padding: 6,
      whiteSpace: "pre-wrap",
      textAlign: align as CSSProperties["textAlign"],
      wordBreak: "break-word",
    };

    const isPlaceholder = (layer.text || "").trim().startsWith("- placeholder");
    if (isPlaceholder) textStyle.color = "rgba(17,17,17,0.6)";

    return (
      <div style={base}>
        <div style={textStyle}>{layer.text ?? ""}</div>
      </div>
    );
  }

  if (layer.kind === "image") {
    const url = layer.source?.url || "";
    const fit = layer.fit || "cover";
    return (
      <div style={base}>
        {showImage && url ? (
          <SafeImage src={url} alt={layer.id || "image"} fit={fit} />
        ) : (
          <div
            className="flex items-center justify-center text-[10px] text-gray-500"
            style={{ width: "100%", height: "100%", background: "#f3f4f6" }}
          >
            {url ? "loading…" : "no image"}
          </div>
        )}
      </div>
    );
  }

  return <div style={base} />;
}

/** Image with graceful fallback (no broken icon) */
function SafeImage({ src, alt, fit }: { src: string; alt: string; fit: "cover" | "contain" | string }) {
  const [ok, setOk] = useState(true);
  return ok ? (
    <img
      src={src}
      alt={alt}
      style={{
        width: "100%",
        height: "100%",
        objectFit: fit === "contain" ? "contain" : "cover",
        objectPosition: "center",
        display: "block",
        background: "#f3f4f6",
      }}
      loading="lazy"
      decoding="async"
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      onError={() => setOk(false)}
    />
  ) : (
    <div
      className="flex items-center justify-center text-[10px] text-gray-500"
      style={{ width: "100%", height: "100%", background: "#eef2ff" }}
      aria-label="image unavailable"
      title="image unavailable"
    >
      image unavailable
    </div>
  );
}
