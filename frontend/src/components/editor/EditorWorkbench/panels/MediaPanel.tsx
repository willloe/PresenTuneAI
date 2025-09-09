import type { Deck } from "../../../../types/deck";
import Button from "../../../ui/Button";
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
          <img
            src={m.url}
            alt={m.alt || ""}
            className="h-12 w-20 object-cover rounded border"
          />
          <Button size="xs" onClick={() => onOpenSlot(i)} title="Replace this image">
            Replace
          </Button>
          <Button size="xs" onClick={() => onRemoveSlot(i)} title="Remove this image">
            Remove
          </Button>
        </div>
      ))}

      <Button size="xs" onClick={() => onOpenSlot(imgs.length)}>
        Add image
      </Button>
    </div>
  );
}
