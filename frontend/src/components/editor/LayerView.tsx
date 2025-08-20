import { useState, type CSSProperties } from "react";
import type { EditorLayer } from "../../lib/api";

export default function LayerView({
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
  const f = (layer.frame as any) || { x: 0, y: 0, w: 0, h: 0 };
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
    const style = (layer.style as any) || {};
    const align = style.align || style.textAlign || "left";
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
    if (isPlaceholder) (textStyle as any).color = "rgba(17,17,17,0.6)";

    return (
      <div style={base}>
        <div style={textStyle}>{layer.text ?? ""}</div>
      </div>
    );
  }

  if (layer.kind === "image") {
    const url = (layer.source as any)?.url || "";
    const fit = (layer.fit as any) || "cover";
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

export function SafeImage({
  src,
  alt,
  fit,
}: {
  src: string;
  alt: string;
  fit: "cover" | "contain" | string;
}) {
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
