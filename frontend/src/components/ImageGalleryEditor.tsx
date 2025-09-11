import { useState } from "react";
import Button from "./ui/Button";

export type MediaItem = { type: "image"; url: string; alt?: string };

type Props = {
  items: MediaItem[];
  onAdd: (url: string, alt?: string) => void;
  onReplace: (index: number, url: string, alt?: string) => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onAIGenerate?: (index?: number) => void;
};

export default function ImageGalleryEditor({
  items,
  onAdd,
  onReplace,
  onRemove,
  onMove,
  onAIGenerate,
}: Props) {
  const [newUrl, setNewUrl] = useState("");
  const [editing, setEditing] = useState<{ index: number; url: string; alt: string } | null>(null);

  function commitInlineEdit() {
    if (!editing) return;
    const i = editing.index;
    const url = editing.url.trim();
    const alt = editing.alt.trim() || undefined;
    if (url) onReplace(i, url, alt);
    setEditing(null);
  }

  return (
    <div className="space-y-3">
      {/* Thumbnails */}
      {items.length > 0 && (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
        >
          {items.map((m, i) => {
            const isEditing = editing?.index === i;
            return (
              <div key={i} className="border rounded-lg overflow-hidden bg-white">
                <div className="aspect-[16/9] bg-gray-100">
                  {m.url ? (
                    <img
                      src={m.url}
                      alt={m.alt || `image ${i + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                      no image
                    </div>
                  )}
                </div>

                {/* Inline replace / alt edit */}
                {isEditing ? (
                  <div className="p-2 space-y-2 border-t bg-gray-50">
                    <input
                      value={editing.url}
                      onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitInlineEdit();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      placeholder="https://…"
                      className="w-full rounded border px-2 py-1"
                      aria-label={`Image ${i + 1} URL`}
                    />
                    <input
                      value={editing.alt}
                      onChange={(e) => setEditing({ ...editing, alt: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitInlineEdit();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      placeholder="Alt text (optional)"
                      className="w-full rounded border px-2 py-1"
                      aria-label={`Image ${i + 1} alt text`}
                    />
                    <div className="flex items-center gap-2">
                      <Button size="xs" variant="solid" onClick={commitInlineEdit} type="button">
                        Save
                      </Button>
                      <Button size="xs" onClick={() => setEditing(null)} type="button">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Actions */}
                <div className="p-2 flex items-center gap-2 flex-wrap border-t">
                  <Button
                    size="xs"
                    onClick={() => onMove(i, Math.max(0, i - 1))}
                    disabled={i === 0}
                    title="Move left"
                    aria-label={`Move image ${i + 1} earlier`}
                  >
                    ↑
                  </Button>
                  <Button
                    size="xs"
                    onClick={() => onMove(i, Math.min(items.length - 1, i + 1))}
                    disabled={i === items.length - 1}
                    title="Move right"
                    aria-label={`Move image ${i + 1} later`}
                  >
                    ↓
                  </Button>

                  <Button size="xs" onClick={() => setEditing({ index: i, url: m.url, alt: m.alt ?? "" })} type="button">
                    Edit
                  </Button>

                  {onAIGenerate && (
                    <Button size="xs" onClick={() => onAIGenerate(i)} type="button" title="AI-generate replacement">
                      AI Generate
                    </Button>
                  )}

                  <Button
                    size="xs"
                    variant="danger"
                    onClick={() => onRemove(i)}
                    type="button"
                    aria-label={`Remove image ${i + 1}`}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add by URL */}
      <div className="flex items-center gap-2">
        <input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://…"
          className="flex-1 border rounded px-2 py-2 outline-none focus:ring"
          aria-label="New image URL"
        />
        <Button
          onClick={() => {
            const url = newUrl.trim();
            if (!url) return;
            onAdd(url);
            setNewUrl("");
          }}
          type="button"
        >
          Add Image
        </Button>
        {onAIGenerate && (
          <Button onClick={() => onAIGenerate()} type="button" title="AI-generate new image">
            AI Generate
          </Button>
        )}
      </div>
    </div>
  );
}
