import { useEffect, useMemo, useState } from "react";
import type { Slide } from "../types/deck";

type Props = {
  slide: Slide;
  index: number;

  loading: boolean;
  regenIndex: number | null;
  showImages: boolean;

  onRegenerate: (i: number) => Promise<void>;
  onUpdate: (index: number, next: Slide) => void;
};

const TITLE_MIN = 1;
const TITLE_MAX = 200;
const BULLETS_MAX = 12;

function normalizeBullets(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map(s => s.trim().replace(/^[-*•·]\s*/, ""))
    .filter(Boolean)
    .slice(0, BULLETS_MAX);
}

export default function SlideCard({
  slide, index, loading, regenIndex, showImages, onRegenerate, onUpdate,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(slide.title);
  const [bulletsText, setBulletsText] = useState(slide.bullets?.join("\n") ?? "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    // keep local editor in sync when slide changes externally (regen)
    setTitle(slide.title);
    setBulletsText(slide.bullets?.join("\n") ?? "");
    setDirty(false);
  }, [slide.id, slide.title, slide.bullets]);

  const titleValid = useMemo(() => {
    const t = (title || "").trim();
    return t.length >= TITLE_MIN && t.length <= TITLE_MAX;
  }, [title]);

  const bulletsValid = useMemo(() => {
    const list = normalizeBullets(bulletsText);
    return list.length <= BULLETS_MAX;
  }, [bulletsText]);

  function startEdit() {
    setEditing(true);
    setDirty(false);
  }
  function cancelEdit() {
    setEditing(false);
    setTitle(slide.title);
    setBulletsText(slide.bullets?.join("\n") ?? "");
    setDirty(false);
  }
  function saveEdit() {
    if (!titleValid || !bulletsValid) return;
    const nextBullets = normalizeBullets(bulletsText);
    const next: Slide = { ...slide, title: title.trim(), bullets: nextBullets };
    onUpdate(index, next);
    setEditing(false);
    setDirty(false);
  }

  return (
    <li className="border rounded-xl p-4">
      {/* Title */}
      {!editing ? (
        <div className="flex items-start justify-between gap-3">
          <div className="font-semibold break-words">{slide.title}</div>
          <div className="flex gap-2">
            <button
              onClick={startEdit}
              className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50"
              title="Edit slide"
            >
              Edit
            </button>
            <button
              onClick={() => onRegenerate(index)}
              disabled={regenIndex === index}
              className={`rounded-lg border px-2 py-1 text-xs ${
                regenIndex === index ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
              }`}
              title="Regenerate this slide"
            >
              {regenIndex === index ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring ${
              titleValid ? "" : "border-red-500"
            }`}
            maxLength={TITLE_MAX}
            placeholder="Slide title"
          />
          {!titleValid && (
            <div className="text-xs text-red-600">
              Title must be {TITLE_MIN}–{TITLE_MAX} characters.
            </div>
          )}
        </div>
      )}

      {/* Bullets */}
      {!editing ? (
        !!slide.bullets?.length && (
          <ul className="list-disc ml-6 mt-2">
            {slide.bullets.map((b, j) => (
              <li key={j}>{b}</li>
            ))}
          </ul>
        )
      ) : (
        <div className="mt-3">
          <label className="block text-sm mb-1">Bullets (one per line)</label>
          <textarea
            value={bulletsText}
            onChange={(e) => { setBulletsText(e.target.value); setDirty(true); }}
            rows={Math.max(3, Math.min(8, bulletsText.split(/\r?\n/).length))}
            className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring ${
              bulletsValid ? "" : "border-red-500"
            }`}
            placeholder="- Point A\n- Point B"
          />
          {!bulletsValid && (
            <div className="text-xs text-red-600">
              Up to {BULLETS_MAX} bullet points are allowed.
            </div>
          )}

          <div className="mt-2 flex gap-2">
            <button
              onClick={saveEdit}
              disabled={!titleValid || !bulletsValid || !dirty}
              className={`rounded-lg px-3 py-1 text-sm text-white ${
                (!titleValid || !bulletsValid || !dirty)
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-black hover:opacity-90"
              }`}
            >
              Save
            </button>
            <button
              onClick={cancelEdit}
              className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Media */}
      {showImages && !editing && (
        (slide.media && slide.media.length > 0) ? (
          <div className="mt-2">
            <img
              src={slide.media[0].url}
              alt={slide.media[0].alt ?? slide.title}
              className="w-full h-40 object-cover rounded-lg border bg-gray-100"
              loading="lazy"
            />
            {slide.media[0].alt && (
              <div className="mt-1 text-xs text-gray-500">{slide.media[0].alt}</div>
            )}
          </div>
        ) : (
          (loading || regenIndex === index) ? (
            <div className="mt-2 h-40 w-full rounded-lg bg-gray-100 animate-pulse" />
          ) : null
        )
      )}
    </li>
  );
}
