import type { Deck } from "@/types/deck";
import type { ApiMeta } from "@/lib/api";

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
};

export default function Preview({
  deck, slides, displayTopic, loading, meta,
  theme, showImages, regenIndex, onRegenerate,
}: Props) {
  const pretty = (s: string) => s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  if (!slides.length) return null;

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
          <li key={s.id ?? i} className="border rounded-xl p-4">
            <div className="font-semibold">{s.title}</div>

            {!!s.bullets?.length && (
              <ul className="list-disc ml-6">
                {s.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            )}

            {/* Thumbnail & caption (client-side toggle) */}
            {showImages && (
              (s.media && s.media.length > 0) ? (
                <div className="mt-2">
                  <img
                    src={s.media[0].url}
                    alt={s.media[0].alt ?? s.title}
                    className="w-full h-40 object-cover rounded-lg border bg-gray-100"
                    loading="lazy"
                  />
                  {s.media[0].alt && (
                    <div className="mt-1 text-xs text-gray-500">
                      {s.media[0].alt}
                    </div>
                  )}
                </div>
              ) : (
                (loading || regenIndex === i) ? (
                  <div className="mt-2 h-40 w-full rounded-lg bg-gray-100 animate-pulse" />
                ) : null
              )
            )}

            <div className="mt-3">
              <button
                onClick={() => onRegenerate(i)}
                disabled={regenIndex === i}
                className={`rounded-lg px-3 py-1 border ${
                  regenIndex === i ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
                }`}
                title="Regenerate this slide"
              >
                {regenIndex === i ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
