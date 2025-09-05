import type { Deck } from "../../types/deck";
import type { LayoutItem } from "../../lib/api";
import LayoutPicker from "./LayoutPicker";

type LayoutRecommendation = {
  selected_layout?: string | null;
  top_k?: string[];
  image_slots_needed?: number;
  reasons?: string[];
};

type Props = {
  slides: Deck["slides"];
  layouts: LayoutItem[];
  selection: Record<string, string>;
  onSelect: (slideId: string, layoutId: string) => void;

  // NEW (optional)
  recommendations?: Record<string, LayoutRecommendation>;
  allowAuto?: boolean;
};

export default function LayoutSelectionList({
  slides,
  layouts,
  selection,
  onSelect,
  recommendations,
  allowAuto = true,
}: Props) {
  const pickTopKItems = (ids?: string[]) => {
    if (!ids || !ids.length) return layouts;
    const set = new Set(ids);
    const prioritized = layouts.filter((l) => set.has(l.id));
    const rest = layouts.filter((l) => !set.has(l.id));
    return [...prioritized, ...rest];
  };

  return (
    <div className="space-y-3">
      {slides.map((s) => {
        const bullets = Math.max(0, s.bullets?.length || 0);
        const images = Math.max(0, s.media?.length || 0);

        const rec = recommendations?.[s.id];
        const selectedFromRec = rec?.selected_layout || null;
        const imageSlotsNeeded = rec?.image_slots_needed ?? null;

        const selectedId =
          selection[s.id] ??
          (selectedFromRec || (allowAuto ? "AUTO" : ""));

        const itemsForPicker = pickTopKItems(rec?.top_k);

        return (
          <div key={s.id} className="border rounded-xl p-3 space-y-3 bg-white">
            <div className="flex items-center justify-between">
              <div className="font-medium truncate pr-3">{s.title}</div>
              {allowAuto && (
                <button
                  className={`text-xs rounded-full px-2 py-1 border ${
                    selectedId === "AUTO"
                      ? "bg-black text-white border-black"
                      : "hover:bg-gray-50"
                  }`}
                  onClick={() => onSelect(s.id, "AUTO")}
                  title="Let the backend pick the best layout for this slide"
                >
                  Auto-fit
                </button>
              )}
            </div>

            <div className="text-sm text-gray-600 flex items-center gap-2 flex-wrap">
              <span>{bullets} bullets • {images} images</span>
              {imageSlotsNeeded !== null && (
                <span className="inline-flex items-center gap-1 text-xs rounded-full bg-gray-100 px-2 py-0.5">
                  <span className="opacity-70">needs</span>
                  <b>{imageSlotsNeeded}</b>
                  <span className="opacity-70">image slot{imageSlotsNeeded === 1 ? "" : "s"}</span>
                </span>
              )}
            </div>

            <LayoutPicker
              items={itemsForPicker}
              selectedId={selectedId || ""}
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
