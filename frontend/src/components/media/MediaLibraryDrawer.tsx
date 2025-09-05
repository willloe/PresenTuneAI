import { useEffect } from "react";
import { useAssets } from "../../hooks/useAssets";

type Asset = {
  id: string;
  filename: string;
  // extend with width/height/type if your hook provides them
};

type Props = {
  open: boolean;
  onClose: () => void;
  uploadId?: string | null;

  /** Legacy: select by URL only (append/replace decided by parent) */
  onSelect: (url: string) => void;

  /** NEW: if provided, return (asset, url, slotIndex) */
  onSelectAsset?: (asset: Asset, url: string, slotIndex?: number | null) => void;

  /** NEW: select for a specific slot (keep null for legacy append mode) */
  slotIndex?: number | null;

  /** Optional: custom title */
  title?: string;
};

export default function MediaLibraryDrawer({
  open,
  onClose,
  uploadId,
  onSelect,
  onSelectAsset,
  slotIndex = null,
  title = "Media Library",
}: Props) {
  const { items, loading, error, url } = useAssets(uploadId);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl p-5 overflow-y-auto"
        aria-label="Media Library Drawer"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            {slotIndex !== null && (
              <div className="text-xs text-gray-500 mt-0.5">Selecting for slot #{slotIndex + 1}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 border hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        {loading && (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-video rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {items.map((a: Asset) => {
                const fileUrl = url(a.id);
                return (
                  <button
                    key={a.id}
                    title={a.filename}
                    onClick={() => {
                      if (onSelectAsset) onSelectAsset(a, fileUrl, slotIndex);
                      else onSelect(fileUrl);
                      onClose();
                    }}
                    className="group relative aspect-video overflow-hidden rounded-xl border hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/40"
                  >
                    <img
                      src={fileUrl}
                      alt={a.filename}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20" />
                    <div className="absolute bottom-0 left-0 right-0 p-1.5 text-[10px] text-white/90 bg-gradient-to-t from-black/50 to-transparent truncate">
                      {a.filename}
                    </div>
                  </button>
                );
              })}
            </div>

            {items.length === 0 && (
              <div className="mt-6 text-sm text-gray-600">
                No images extracted for this upload yet.
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
