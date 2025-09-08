import { useState, useRef, useLayoutEffect, type CSSProperties } from "react";
import type { EditorLayer } from "../../lib/api";

export default function LayerView({
  layer,
  scale,
  minFontPx,
  showFrameOutline,
  showImage,
  floorFontPx = 10,
  shrinkToFit = true,
}: {
  layer: EditorLayer;
  scale: number;
  minFontPx: number;
  showFrameOutline: boolean;
  showImage: boolean;
  floorFontPx?: number;
  shrinkToFit?: boolean;
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

    const stylePx =
      typeof st.size === "number"
        ? st.size * scale
        : typeof st.fontSize === "number"
        ? st.fontSize * scale
        : 20 * scale;

    const preferredPx = Math.max(minFontPx, stylePx);
    const floorPx = Math.max(6, floorFontPx);

    const [fittedPx, setFittedPx] = useState<number>(preferredPx);
    const textRef = useRef<HTMLDivElement | null>(null);

    const padding = typeof st.padding === "number" ? Math.max(0, st.padding * scale) : 6;
    const bgFill = st.bg || st.background || st.fill || "transparent";
    const letterSpacing = typeof st.letterSpacing === "number" ? st.letterSpacing * scale : undefined;
    const lineHeight = typeof st.lineHeight === "number" ? st.lineHeight : 1.25;
    const borderRadius =
      typeof st.radius === "number"
        ? st.radius * scale
        : typeof st.borderRadius === "number"
        ? st.borderRadius * scale
        : undefined;

    // Reset when inputs change
    useLayoutEffect(() => {
      setFittedPx(preferredPx);
    }, [preferredPx, layer.text, f.w, f.h, scale]);

    // Shrink-to-fit (binary search)
    useLayoutEffect(() => {
      if (!shrinkToFit || !textRef.current) return;
      const el = textRef.current;
      const fits = () => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth;
      const apply = (px: number) => (el.style.fontSize = `${px}px`);

      apply(preferredPx);
      if (fits()) {
        setFittedPx(preferredPx);
        return;
      }

      let lo = floorPx, hi = preferredPx, best = lo;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        apply(mid);
        if (fits()) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      setFittedPx(best);
    }, [preferredPx, floorPx, shrinkToFit, layer.text, f.w, f.h, scale]);

    const textStyle: CSSProperties = {
      fontFamily: st.font || st.fontFamily || "Inter, ui-sans-serif, system-ui",
      fontSize: fittedPx,
      fontWeight: st.weight || st.fontWeight || 400,
      lineHeight,
      letterSpacing,
      color: st.color || "#111",
      padding,
      whiteSpace: "pre-wrap",
      textAlign: align,
      wordBreak: "break-word",
      overflowWrap: "anywhere",
      hyphens: "auto",
      background: bgFill,
      border:
        st.stroke || st.border
          ? `${Math.max(1, (st.strokeWidth || st.borderWidth || 1) * scale)}px solid ${st.stroke || st.border}`
          : undefined,
      borderRadius,
    };

    return (
      <div style={base}>
        <div ref={textRef} style={textStyle}>{layer.text ?? ""}</div>
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
          ? `${Math.max(1, (st.strokeWidth || st.borderWidth || 1) * scale)}px solid ${st.stroke || st.border}`
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
    const st = (layer.style as any) || {};
    const shapeStyle: CSSProperties = {
      ...base,
      background: st.fill || "#ffffff",
      border:
        st.stroke || st.border
          ? `${Math.max(1, (st.strokeWidth || st.borderWidth || 1) * scale)}px solid ${st.stroke || st.border}`
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
