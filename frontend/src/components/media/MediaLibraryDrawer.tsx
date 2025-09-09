import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import ImageGenModal from "../media/ImageGenModal";
import { useAssets } from "../../hooks/useAssets";
import Button from "../ui/Button";

type Asset = { id: string; filename: string };

type Props = {
  open: boolean;
  onClose: () => void;
  uploadId?: string | null;

  onSelect: (url: string) => void;
  onSelectAsset?: (asset: Asset, url: string, slotIndex?: number | null) => void;

  slotIndex?: number | null;
  title?: string;

  enableAI?: boolean;
  slideTitle?: string;
  slotCount?: number;
};

export default function MediaLibraryDrawer({
  open,
  onClose,
  uploadId,
  onSelect,
  onSelectAsset,
  slotIndex = null,
  title = "Media Library",
  enableAI = true,
  slideTitle,
  slotCount = 0,
}: Props) {
  const { items, loading, error, url } = useAssets(uploadId);

  // Provider pill
  const [providerLabel, setProviderLabel] =
    useState<{ provider: string; model?: string } | null>(null);

  useEffect(() => {
    if (!open || !enableAI) return;
    let alive = true;
    api
      .imageProvider()
      .then(({ data }) => alive && setProviderLabel(data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, enableAI]);

  // Escape closes drawer
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Use image callback (bridge for generated images)
  function handleUseGenerated(urlStr: string, chosenSlot: number | "append") {
    const dest =
      chosenSlot === "append"
        ? null
        : typeof chosenSlot === "number"
        ? chosenSlot
        : slotIndex ?? null;

    if (onSelectAsset) onSelectAsset({ id: "__ai__", filename: "ai-generated.png" }, urlStr, dest);
    else onSelect(urlStr);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl p-5 flex flex-col"
        aria-label="Media Library Drawer"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold truncate">{title}</h3>
            {slotIndex !== null && (
              <div className="text-xs text-gray-500 mt-0.5">
                Selecting for slot #{slotIndex + 1}
              </div>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
            {enableAI && providerLabel && (
              <span
                className="text-[11px] rounded-full border px-2 py-0.5 bg-gray-50 text-gray-700"
                title="Image provider"
              >
                {providerLabel.provider}
                {providerLabel.model ? ` • ${providerLabel.model}` : ""}
              </span>
            )}
            <Button onClick={onClose} className="px-3 py-1" aria-label="Close media library">
              Close
            </Button>
          </div>
        </div>

        {/* Body: two rows (50/50). Use min-h-0 so children can scroll */}
        <div className="flex-1 grid grid-rows-2 gap-4 min-h-0">
          {/* Top: library list (scrollable) */}
          <div className="min-h-0 overflow-y-auto">
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
          </div>

          {/* Bottom: embedded AI generator (scrollable) */}
          <div className="min-h-0 overflow-y-auto rounded-xl border bg-white">
            {enableAI && (
              <ImageGenModal
                variant="embedded"
                open={true}
                onClose={() => {}}
                onUseImage={handleUseGenerated}
                slideTitle={slideTitle}
                slotCount={slotCount}
                className="rounded-xl"
              />
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
