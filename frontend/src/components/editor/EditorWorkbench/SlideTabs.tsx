import type { Deck } from "../../../types/deck";
import Button from "../../ui/Button";
type Slide = Deck["slides"][number];

export default function SlideTabs({
  slides,
  active,
  setActive,
}: {
  slides: Slide[];
  active: number;
  setActive: (i: number) => void;
}) {
  const imgCount = (s: Slide) => Math.max(0, (s.media ?? []).length);
  return (
    <div className="rounded-xl border bg-white px-2 pt-2">
      <div className="flex overflow-x-auto gap-2 pb-2">
        {slides.map((s, i) => (
          <Button
            key={s.id || i}
            onClick={() => setActive(i)}
            size="sm"
            className={`shrink-0 ${i === active ? "bg-black text-white border-black" : ""}`}
            title={s.title || `Slide ${i + 1}`}
          >
            <span className="text-xs mr-1 text-gray-400">{i + 1}.</span>
            <span className="truncate max-w-[14ch] inline-block align-bottom">{s.title || "Untitled"}</span>
            {imgCount(s) > 0 && (
              <span className={`ml-2 text-[10px] ${i === active ? "text-white/80" : "text-gray-500"}`}>
                {imgCount(s)} img
              </span>
            )}
          </Button>
        ))}
      </div>
    </div>
  );
}
