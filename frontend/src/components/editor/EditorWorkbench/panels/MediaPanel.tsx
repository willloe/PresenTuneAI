import type { Deck } from "../../../../types/deck";
type Slide = Deck["slides"][number];

export default function MediaPanel({
  slide,
  onOpenSlot,
  onRemoveSlot,
}: {
  slide: Slide;
  onOpenSlot: (slotIdx: number) => void;
  onRemoveSlot: (slotIdx: number) => void;
}) {
  const imgs = slide.media || [];
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Images</div>
      {imgs.map((m, i) => (
        <div key={i} className="flex items-center gap-2">
          <img src={m.url} alt={m.alt || ""} className="h-12 w-20 object-cover rounded border" />
          <button className="text-xs rounded-md border px-2 py-1 hover:bg-gray-50" onClick={() => onOpenSlot(i)}>
            Replace
          </button>
          <button className="text-xs rounded-md border px-2 py-1 hover:bg-gray-50" onClick={() => onRemoveSlot(i)}>
            Remove
          </button>
        </div>
      ))}
      <button
        className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
        onClick={() => onOpenSlot(imgs.length)}
      >
        Add image
      </button>
    </div>
  );
}
