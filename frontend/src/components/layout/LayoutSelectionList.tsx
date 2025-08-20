import type { Deck } from "../../types/deck";
import type { LayoutItem } from "../../lib/api";
import LayoutPicker from "./LayoutPicker";

type Props = {
  slides: Deck["slides"];
  layouts: LayoutItem[];
  selection: Record<string, string>;
  onSelect: (slideId: string, layoutId: string) => void;
};

export default function LayoutSelectionList({
  slides,
  layouts,
  selection,
  onSelect,
}: Props) {
  return (
    <div className="space-y-3">
      {slides.map((s) => {
        const bullets = Math.max(0, s.bullets?.length || 0);
        const images = Math.max(0, s.media?.length || 0);
        return (
          <div key={s.id} className="border rounded-xl p-3 space-y-3 bg-white">
            <div className="font-medium">{s.title}</div>
            <div className="text-sm text-gray-600">
              {bullets} bullets • {images} images
            </div>
            <LayoutPicker
              items={layouts}
              selectedId={selection[s.id] || ""}
              onSelect={(id) => onSelect(s.id, id)}
              counts={{ text_count: bullets, image_count: images }}
              page={{ width: 1280, height: 720 }}
              topK={6}
              initialView="selected"
              bringToFrontOnSelect
            />
          </div>
        );
      })}
    </div>
  );
}
