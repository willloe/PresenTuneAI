import type { EditorDocOut } from "../../../lib/api";
import useMeasuredWidth from "../../../hooks/useMeasuredWidth";
import LayerView from "../../editor/LayerView";
import { themeKeyToMeta } from "../../../theme/meta";
import { THEMES, type ThemeKey } from "../../../theme/themes";

export default function PreviewStage({ doc, activeIndex }: { doc: EditorDocOut | null; activeIndex: number }) {
  const [holderRef, holderW] = useMeasuredWidth();
  if (!doc?.slides?.length) return <div className="text-sm text-gray-600">Build preview will appear here.</div>;

  const pageW = (doc.page as any)?.width ?? 1280;
  const pageH = (doc.page as any)?.height ?? 720;
  const stageW = Math.max(480, holderW);
  const stageH = Math.round((stageW * pageH) / pageW);
  const scale = stageW / pageW;

  const T =
    doc.theme_meta ??
    themeKeyToMeta(((doc.theme as ThemeKey) && (THEMES as any)[doc.theme] ? (doc.theme as ThemeKey) : "default"));

  const idx = Math.max(0, Math.min(doc.slides.length - 1, activeIndex));
  const slide = doc.slides[idx];
  const bg = (slide.background as any)?.fill ?? (T.colors.appBg ?? "#000");
  const layers = (slide.layers || []).slice().sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  return (
    <div ref={holderRef} className="w-full">
      <div
        className="mx-auto rounded-2xl overflow-hidden border border-gray-300/70"
        style={{ position: "relative", width: stageW, height: stageH, background: bg }}
      >
        {layers.map((ly) => (
          <LayerView
            key={ly.id}
            layer={ly as any}
            scale={scale}
            minFontPx={12}
            showFrameOutline={false}
            showImage={true}
          />
        ))}
      </div>
    </div>
  );
}
