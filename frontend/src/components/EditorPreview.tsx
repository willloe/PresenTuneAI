// frontend/src/components/EditorPreview.tsx
import { type CSSProperties } from "react";
import type { EditorDocOut, EditorSlideOut } from "../lib/api";
import Card from "./ui/Card";
import Tag from "./ui/Tag";
import useMeasuredWidth from "../hooks/useMeasuredWidth";
import LayerView from "./editor/LayerView";

// read theme tokens from the doc (or derive from theme key)
import { themeKeyToMeta } from "../theme/meta";
import { THEMES, type ThemeKey } from "../theme/themes";

type Props = {
  doc: EditorDocOut | null | undefined;
  minColPx?: number;
  cols?: number;
  minFontPx?: number;
  showFrames?: boolean;
  showImages?: boolean;
  maxThumbH?: number;
};

type ThemeDefaults = ReturnType<typeof themeKeyToMeta>;

/** Pick tokens from doc.theme_meta, else derive from doc.theme key, else default. */
function getThemeDefaults(doc: EditorDocOut): ThemeDefaults {
  if (doc?.theme_meta) return doc.theme_meta as ThemeDefaults;
  const key =
    (doc?.theme as ThemeKey) && (THEMES as any)[doc.theme]
      ? (doc.theme as ThemeKey)
      : "default";
  return themeKeyToMeta(key);
}

/** Heuristic: apply theme defaults to a layer if its style is incomplete. */
function withThemeDefaults(layer: EditorSlideOut["layers"][number], T: ThemeDefaults) {
  if (layer.kind !== "textbox") return layer;
  const style: any = { ...(layer.style || {}) };

  // Decide heading vs body using soft cues
  const declaredSize = Number(style.size ?? style.fontSize ?? 0);
  const declaredWeight = Number(style.weight ?? style.fontWeight ?? 0);
  const isTitleish =
    declaredSize >= 26 || declaredWeight >= 600 || (layer as any)?.meta?.role === "title";

  // Fill in missing tokens
  if (!style.font && !style.fontFamily) {
    style.font = isTitleish ? T.fonts.heading : T.fonts.body;
  }
  if (!style.weight && !style.fontWeight) {
    style.weight = isTitleish ? T.fonts.weightHeading : T.fonts.weightBody;
  }
  if (!style.color) {
    style.color = T.colors.text;
  }

  return { ...layer, style };
}

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

  const pageW = (doc.page as any)?.width ?? 1280;
  const pageH = (doc.page as any)?.height ?? 720;
  const gridStyle: CSSProperties = cols
    ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
    : { gridTemplateColumns: `repeat(auto-fit, minmax(${minColPx}px, 1fr))` };

  const T = getThemeDefaults(doc);

  return (
    <div className="mt-4">
      <div className="text-sm text-gray-700 mb-2 flex items-center gap-2">
        <span className="opacity-80">Theme</span>
        <Tag tone="neutral" size="sm">{doc.theme || "default"}</Tag>
        <span className="opacity-40">•</span>
        <Tag>{doc.slides.length} slides</Tag>
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
            themeDefaults={T}
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
  themeDefaults: T,
}: {
  slide: EditorSlideOut;
  pageW: number;
  pageH: number;
  minFontPx: number;
  showFrames: boolean;
  showImages: boolean;
  maxThumbH?: number;
  themeDefaults: ThemeDefaults;
}) {
  const [holderRef, holderW] = useMeasuredWidth();

  const stageW = Math.max(200, holderW);
  const stageH = Math.round((stageW * pageH) / pageW);
  const clampedH = typeof maxThumbH === "number" ? Math.min(stageH, maxThumbH) : stageH;
  const scale = stageW / pageW;

  // IMPORTANT: use appBg as the fallback for real slide canvas, not surface
  const bg =
    (slide.background as any)?.fill ??
    (T.colors.appBg ?? "#000");

  const stageStyle: CSSProperties = {
    position: "relative",
    width: stageW,
    height: clampedH,
    background: bg,
    borderRadius: 16,
    overflow: "hidden",
  };

  const themedLayers = (slide.layers || [])
    .slice()
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
    .map((ly) => withThemeDefaults(ly as any, T));

  return (
    <Card>
      <div ref={holderRef}>
        <div className="mx-auto border border-gray-300/70 rounded-xl overflow-hidden" style={stageStyle}>
          {themedLayers.map((ly) => (
            <LayerView
              key={ly.id}
              layer={ly as any}
              scale={scale}
              minFontPx={minFontPx}
              showFrameOutline={showFrames}
              showImage={showImages}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-600 truncate">{slide.name}</div>
    </Card>
  );
}
