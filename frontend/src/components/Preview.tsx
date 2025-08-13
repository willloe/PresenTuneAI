import type { Deck } from "../types/deck";
import type { ApiMeta } from "../lib/api";
import SlideCard from "./SlideCard";

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

  /** New: direct download URL for the most recent export (or null if none) */
  downloadUrl?: string | null;
};

export default function Preview({
  deck, slides, displayTopic, loading, meta,
  theme, showImages, regenIndex, onRegenerate, onUpdateSlide,
  downloadUrl,
}: Props) {
  const pretty = (s: string) => s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!slides.length) return null;

  const suggestedName =
    (deck?.topic?.trim()?.replace(/[^\w.-]+/g, "_") || "deck") +
    (deck?.slide_count ? `_${deck.slide_count}s` : "") +
    ".txt";

  return (
    <section className="rounded-2xl bg-white shadow-sm p-6">
      {/* Active settings banner */}
      <div className="mb-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-gray-900 to-gray-700 px-4 py-2 text-white">
        <div className="text-sm">
          <span className="opacity-80">Theme:</span>{" "}
          <span className="font-medium">{theme || "default"}</span>
          <span className="mx-2 opacity-50">•</span>
          <span className="opacity-80">Slides:</span>{" "}
          <span className="font-medium">{deck?.slide_count ?? slides.length}</span>
        </div>
        {downloadUrl ? (
          <a
            href={downloadUrl}
            download={suggestedName}
            className="text-xs rounded-lg border px-3 py-1 bg-white/10 hover:bg-white/20"
            title="Download latest export"
          >
            Download export
          </a>
        ) : null}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-medium">Preview</h3>
        <div className="text-sm text-gray-600">
          {pretty(displayTopic)} • {deck?.slide_count ?? slides.length} slides
          {meta?.requestId && (
            <span className="ml-2 inline-block rounded bg-gray-100 text-gray-700 px-2 py-0.5">
              req: {meta.requestId}
            </span>
          )}
        </div>
      </div>

      <ul className="space-y-3">
        {slides.map((s, i) => (
          <SlideCard
            key={s.id ?? i}
            slide={s}
            index={i}
            loading={loading}
            regenIndex={regenIndex}
            showImages={showImages}
            onRegenerate={onRegenerate}
            onUpdate={(idx, next) => onUpdateSlide(idx, next)}
          />
        ))}
      </ul>
    </section>
  );
}
