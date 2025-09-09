import type { Deck } from "../../../../types/deck";
import LayoutPicker from "../../../layout/LayoutPicker";
import { sectionsFromSlide, sanitizeSections } from "../../../slide/sections";
import { bulletsFromSectionsForBuilder } from "../../../../utils/textBridge";
import Button from "../../../ui/Button";

type Slide = Deck["slides"][number];

export default function LayoutPanel({
  slide,
  selectedLayoutId,
  onSelectLayout,
  onAutoFit,
}: {
  slide: Slide;
  selectedLayoutId: string;
  onSelectLayout: (layoutId: string) => void;
  onAutoFit: () => void | Promise<void>;
}) {
  const textCount = bulletsFromSectionsForBuilder(sanitizeSections(sectionsFromSlide(slide))).length;
  const imageCount = Math.max(0, (slide.media ?? []).length);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Layout</div>
        <Button size="xs" onClick={onAutoFit} title="Pick a best-fit layout">
          Auto-fit
        </Button>
      </div>
      <LayoutPicker
        items={(undefined as any) /* parent passes layouts via props in wrapper; see index.tsx */}
        // NOTE: this component is wrapped in index.tsx where items and handlers are bound.
        selectedId={selectedLayoutId || ""}
        onSelect={onSelectLayout}
        counts={{ text_count: textCount, image_count: imageCount }}
        page={{ width: 1280, height: 720 }}
        topK={6}
        initialView="selected"
        bringToFrontOnSelect
      />
    </div>
  );
}
