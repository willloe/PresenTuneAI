import type { Deck } from "../types/deck";
import type { ApiMeta } from "../lib/api";
import SlideCard from "./slide/SlideCard";
import ExportBanner from "./preview/ExportBanner";
import DeckStats from "./preview/DeckStats";

type Props = {
  deck: Deck | null;
  slides: Deck["slides"];
  displayTopic: string;
  loading: boolean;
  meta: ApiMeta | null;

  theme: string;
  showImages: boolean;

  regenIndex: number | null;
  onRegenerate: (i: number) => Promise<void>;
  onUpdateSlide: (index: number, next: Deck["slides"][number]) => void;

  downloadUrl?: string | null;
  layoutNameBySlide?: Record<string, string>;
  onReorder?: (from: number, to: number) => void;

  // Legacy single-image helpers (optional)
  onSetImage?: (index: number, url: string, alt?: string) => void;
  onRemoveImage?: (index: number) => void;
  onGenerateImage?: (index: number) => void;

  // Media library plumbing
  uploadId?: string | null;
  onOpenMediaLibrary?: (index: number) => void;

  // NEW (optional): slot-aware open
  onOpenMediaLibrarySlot?: (slideIndex: number, slotIndex: number) => void;

  // NEW (optional): slide_id -> required slots for chosen layout
  imageSlotsNeededBySlide?: Record<string, number>;
};

export default function Preview({
  deck,
  slides,
  displayTopic,
  loading,
  meta,
  theme,
  showImages,
  regenIndex,
  onRegenerate,
  onUpdateSlide,
  downloadUrl,
  layoutNameBySlide,
  onReorder,
  onSetImage,
  onRemoveImage,
  onGenerateImage,
  uploadId,
  onOpenMediaLibrary,
  onOpenMediaLibrarySlot,
  imageSlotsNeededBySlide,
}: Props) {
  const pretty = (s: string) => s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!slides.length) return null;

  const suggestedName =
    (deck?.topic?.trim()?.replace(/[^\w.-]+/g, "_") || "deck") +
    (deck?.slide_count ? `_${deck.slide_count}s` : "") +
    ".txt";

  const slideCount = deck?.slide_count ?? slides.length;

  return (
    <section className="rounded-2xl bg-white shadow-sm p-6">
      <ExportBanner downloadUrl={downloadUrl} suggestedName={suggestedName}>
        <DeckStats theme={theme} slideCount={slideCount} requestId={meta?.requestId ?? null} />
      </ExportBanner>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-medium">Preview</h3>
        <div className="text-sm text-gray-600">
          {pretty(displayTopic)} • {slideCount} slides
        </div>
      </div>

      <ul className="space-y-3">
        {slides.map((s, i) => {
          const have = Math.max(0, s.media?.length || 0);
          const need = imageSlotsNeededBySlide?.[s.id] ?? 0;
          const deficit = Math.max(0, need - have);

          return (
            <li key={s.id ?? i} className="space-y-2">
              <SlideCard
                slide={s}
                index={i}
                total={slides.length}
                loading={loading}
                regenIndex={regenIndex}
                showImages={showImages}
                onRegenerate={onRegenerate}
                onUpdate={(idx, next) => onUpdateSlide(idx, next)}
                layoutName={layoutNameBySlide?.[s.id]}
                onReorder={onReorder}
                // Legacy single-image hooks
                onSetImage={onSetImage}
                onRemoveImage={onRemoveImage}
                onGenerateImage={onGenerateImage}
                onOpenMediaLibrary={onOpenMediaLibrary}
              />

              <div className="flex items-center gap-2 pl-2 flex-wrap">
                {onOpenMediaLibrary && !!uploadId && (
                  <button
                    className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
                    onClick={() => onOpenMediaLibrary(i)}
                  >
                    Add from Library
                  </button>
                )}

                {onOpenMediaLibrarySlot && !!uploadId && deficit > 0 && (
                  <button
                    className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
                    onClick={() => onOpenMediaLibrarySlot(i, have /* next empty slot */)}
                    title="Fill the next empty image slot for this slide"
                  >
                    Fill next image slot ({deficit} needed)
                  </button>
                )}

                {deficit > 0 && (
                  <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5">
                    Needs {deficit} more image{deficit > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
