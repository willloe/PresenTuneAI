import { useState } from "react";

export type MediaItem = { type: "image"; url: string; alt?: string };

export default function ImageGalleryEditor({
  items,
  onAdd,
  onReplace,
  onRemove,
  onMove,
  onAIGenerate,
}: {
  items: MediaItem[];
  onAdd: (url: string, alt?: string) => void;
  onReplace: (index: number, url: string, alt?: string) => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onAIGenerate?: (index?: number) => void;
}) {
  const [newUrl, setNewUrl] = useState("");

  return (
    <div className="space-y-2">
      {/* thumbnails */}
      {items.length > 0 && (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
        >
          {items.map((m, i) => (
            <div key={i} className="border rounded-lg overflow-hidden bg-white">
              <div className="aspect-[16/9] bg-gray-100">
                <img
                  src={m.url}
                  alt={m.alt || `image ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-2 flex items-center gap-2 flex-wrap">
                <button
                  className="text-xs underline"
                  onClick={() => onMove(i, Math.max(0, i - 1))}
                  disabled={i === 0}
                >
                  ↑
                </button>
                <button
                  className="text-xs underline"
                  onClick={() => onMove(i, Math.min(items.length - 1, i + 1))}
                  disabled={i === items.length - 1}
                >
                  ↓
                </button>
                <button
                  className="text-xs underline"
                  onClick={() => {
                    const url = prompt("New image URL", m.url) || "";
                    if (url) onReplace(i, url);
                  }}
                >
                  Replace
                </button>
                {onAIGenerate && (
                  <button className="text-xs underline" onClick={() => onAIGenerate(i)}>
                    AI Generate
                  </button>
                )}
                <button className="text-xs text-red-600 underline" onClick={() => onRemove(i)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* add by URL */}
      <div className="flex items-center gap-2">
        <input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://…"
          className="flex-1 border rounded px-2 py-1"
        />
        <button
          className="rounded px-3 py-1 bg-black text-white disabled:opacity-50"
          onClick={() => {
            if (!newUrl.trim()) return;
            onAdd(newUrl.trim());
            setNewUrl("");
          }}
        >
          Add Image
        </button>
        {onAIGenerate && (
          <button className="rounded px-3 py-1 border" onClick={() => onAIGenerate()}>
            AI Generate
          </button>
        )}
      </div>
    </div>
  );
}
