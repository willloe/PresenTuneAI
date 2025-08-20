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

  // Legacy single-image helpers (optional; SlideCard can operate without them)
  onSetImage?: (index: number, url: string, alt?: string) => void;
  onRemoveImage?: (index: number) => void;
  onGenerateImage?: (index: number) => void;
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
        {slides.map((s, i) => (
          <SlideCard
            key={s.id ?? i}
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
            // Legacy single-image hooks (optional; SlideCard will fallback to local ops)
            onSetImage={onSetImage}
            onRemoveImage={onRemoveImage}
            onGenerateImage={onGenerateImage}
          />
        ))}
      </ul>
    </section>
  );
}
