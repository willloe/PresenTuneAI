import { type CSSProperties } from "react";
import type { EditorDocOut, EditorSlideOut } from "../lib/api";
import Card from "./ui/Card";
import Tag from "./ui/Tag";
import useMeasuredWidth from "../hooks/useMeasuredWidth";
import LayerView from "./editor/LayerView";

type Props = {
  doc: EditorDocOut | null | undefined;
  minColPx?: number;
  cols?: number;
  minFontPx?: number;
  showFrames?: boolean;
  showImages?: boolean;
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

  const pageW = (doc.page as any)?.width ?? 1280;
  const pageH = (doc.page as any)?.height ?? 720;

  const gridStyle: CSSProperties = cols
    ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
    : { gridTemplateColumns: `repeat(auto-fit, minmax(${minColPx}px, 1fr))` };

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
  const [holderRef, holderW] = useMeasuredWidth();

  const stageW = Math.max(200, holderW);
  const stageH = Math.round((stageW * pageH) / pageW);
  const clampedH = typeof maxThumbH === "number" ? Math.min(stageH, maxThumbH) : stageH;
  const scale = stageW / pageW;

  const stageStyle: CSSProperties = {
    position: "relative",
    width: stageW,
    height: clampedH,
    background: (slide.background as any)?.fill ?? "#fff",
    borderRadius: 16,
    overflow: "hidden",
  };

  return (
    <Card>
      <div ref={holderRef}>
        <div className="mx-auto border border-gray-300/70 rounded-xl overflow-hidden" style={stageStyle}>
          {slide.layers
            ?.slice()
            .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
            .map((ly) => (
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
