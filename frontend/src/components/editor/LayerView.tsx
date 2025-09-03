// frontend/src/components/editor/LayerView.tsx
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
    const st = (layer.style as any) || {};
    const align = (st.align || st.textAlign || "left") as CSSProperties["textAlign"];
    const fontSizeRaw =
      typeof st.size === "number"
        ? st.size * scale
        : typeof st.fontSize === "number"
        ? st.fontSize * scale
        : 20 * scale;
    const fontSize = Math.max(minFontPx, fontSizeRaw);

    const padding =
      typeof st.padding === "number"
        ? Math.max(0, st.padding * scale)
        : 6; // sensible default
    const bgFill = st.bg || st.background || st.fill || "transparent";
    const letterSpacing =
      typeof st.letterSpacing === "number" ? st.letterSpacing * scale : undefined;
    const lineHeight =
      typeof st.lineHeight === "number" ? st.lineHeight : 1.25;
    const borderRadius =
      typeof st.radius === "number"
        ? st.radius * scale
        : typeof st.borderRadius === "number"
        ? st.borderRadius * scale
        : undefined;

    const textStyle: CSSProperties = {
      fontFamily: st.font || st.fontFamily || "Inter, ui-sans-serif, system-ui",
      fontSize,
      fontWeight: st.weight || st.fontWeight || 400,
      lineHeight,
      letterSpacing,
      color: st.color || "#111",
      padding,
      whiteSpace: "pre-wrap",
      textAlign: align,
      wordBreak: "break-word",
      background: bgFill,
      border:
        st.stroke || st.border
          ? `${Math.max(1, (st.strokeWidth || st.borderWidth || 1) * scale)}px solid ${
              st.stroke || st.border
            }`
          : undefined,
      borderRadius,
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
    const st = (layer.style as any) || {};

    const wrapStyle: CSSProperties = {
      ...base,
      borderRadius:
        typeof st.radius === "number"
          ? st.radius * scale
          : typeof st.borderRadius === "number"
          ? st.borderRadius * scale
          : base.borderRadius,
      border:
        st.stroke || st.border
          ? `${Math.max(1, (st.strokeWidth || st.borderWidth || 1) * scale)}px solid ${
              st.stroke || st.border
            }`
          : base.border,
      background: st.bg || st.background || base.background,
    };

    return (
      <div style={wrapStyle}>
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

  if (layer.kind === "shape") {
    // Minimal rectangle shape support
    const st = (layer.style as any) || {};
    const shapeStyle: CSSProperties = {
      ...base,
      background: st.fill || "#ffffff",
      border:
        st.stroke || st.border
          ? `${Math.max(1, (st.strokeWidth || st.borderWidth || 1) * scale)}px solid ${
              st.stroke || st.border
            }`
          : undefined,
      borderRadius:
        typeof st.radius === "number"
          ? st.radius * scale
          : typeof st.borderRadius === "number"
          ? st.borderRadius * scale
          : base.borderRadius,
    };
    return <div style={shapeStyle} />;
  }

  // Fallback (unknown kind)
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
