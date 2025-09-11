import { useLayoutEffect, useMemo, useRef, useState } from "react";
import LayerView from "../LayerView";
// If you have an EditorDoc type, you can import it; keeping 'any' for brevity
// import type { EditorDoc } from "../../../lib/api";

type Props = {
  doc: any;                // EditorDoc
  activeIndex: number;
  minFontPx?: number;
  showFrames?: boolean;
  showImages?: boolean;
};

export default function PreviewStage({
  doc,
  activeIndex,
  minFontPx = 12,
  showFrames = false,
  showImages = true,
}: Props) {
  const page = doc?.page ?? { width: 1280, height: 720, background: { fill: "#fff" } };
  const slide = doc?.slides?.[activeIndex];

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Watch container size
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) =>
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height })
    );
    obs.observe(el);
    // initial
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => obs.disconnect();
  }, []);

  // Best fit scale inside container
  const scale = useMemo(() => {
    if (!box.w || !box.h) return 0.5;
    return Math.max(0.1, Math.min(box.w / page.width, box.h / page.height));
  }, [box.w, box.h, page.width, page.height]);

  const stageW = Math.round(page.width * scale);
  const stageH = Math.round(page.height * scale);
  const bgFill = slide?.background?.fill ?? page?.background?.fill ?? "#fff";

  return (
    // This wrapper defines the available preview height; tweak 72vh/820px to taste
    <div ref={wrapRef} 
      className="relative w-full flex items-center justify-center overflow-auto"
      style={{ minHeight: "min(30vh, 820px)" }}
    >
      <div className="rounded-2xl overflow-hidden border border-gray-300 bg-white" style={{ width: stageW, height: stageH }}>
        <div className="relative" style={{ width: stageW, height: stageH }}>
          {/* slide background */}
          <div className="absolute inset-0" style={{ background: bgFill }} />
          {slide ? (
            (slide.layers ?? []).map((ly: any) => (
              <LayerView
                key={ly.id || `${ly.kind}-${ly.z}-${Math.random().toString(36).slice(2)}`}
                layer={ly}
                scale={scale}
                minFontPx={minFontPx}
                showFrameOutline={!!showFrames}
                showImage={!!showImages}
              />
            ))
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              No slide
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
