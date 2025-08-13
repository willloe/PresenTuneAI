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
    // strip common bullet prefixes and whitespace
    .map((s) => s.trim().replace(/^(\d+[.)]\s*|[-*•·]\s*)/, ""))
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

  // keep local editor in sync when slide changes externally (regen)
  useEffect(() => {
    setTitle(slide.title);
    setBulletsText(slide.bullets?.join("\n") ?? "");
    setDirty(false);
  }, [slide.id, slide.title, slide.bullets]);

  const titleTrim = (title || "").trim();
  const titleValid = useMemo(() => (
    titleTrim.length >= TITLE_MIN && titleTrim.length <= TITLE_MAX
  ), [titleTrim]);

  const bulletList = useMemo(() => normalizeBullets(bulletsText), [bulletsText]);
  const bulletsValid = bulletList.length <= BULLETS_MAX;

  const isRegenning = regenIndex === index;
  const isBusy = loading || isRegenning;

  function startEdit() {
    if (isBusy) return;
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
    if (!dirty || !titleValid || !bulletsValid) return;
    const next: Slide = { ...slide, title: titleTrim, bullets: bulletList };
    onUpdate(index, next);
    setEditing(false);
    setDirty(false);
  }

  // Keyboard UX: Enter = save title, Esc = cancel, Ctrl/⌘+S = save bullets
  function onTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.currentTarget.blur();
      saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }
  function onBulletsKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  // Auto-save on blur (only if user changed something and inputs are valid)
  function onTitleBlur() {
    if (dirty && titleValid) saveEdit();
  }
  function onBulletsBlur() {
    if (dirty && bulletsValid) saveEdit();
  }

  const bulletRows = Math.max(3, Math.min(8, bulletsText.split(/\r?\n/).length));
  const media0 = slide.media?.[0];
  const showSkeleton = showImages && !editing && !media0 && isBusy;

  return (
    <li className="border rounded-xl p-4">
      {/* Title / actions */}
      {!editing ? (
        <div className="flex items-start justify-between gap-3">
          <div className="font-semibold break-words">{slide.title}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={startEdit}
              disabled={isBusy}
              className={`rounded-lg border px-2 py-1 text-xs ${
                isBusy ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
              }`}
              title="Edit slide"
              aria-label={`Edit slide ${index + 1}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onRegenerate(index)}
              disabled={isRegenning}
              className={`rounded-lg border px-2 py-1 text-xs ${
                isRegenning ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
              }`}
              title="Regenerate this slide"
              aria-label={`Regenerate slide ${index + 1}`}
            >
              {isRegenning ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            onKeyDown={onTitleKeyDown}
            onBlur={onTitleBlur}
            className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring ${
              titleValid ? "" : "border-red-500"
            }`}
            maxLength={TITLE_MAX}
            placeholder="Slide title"
            aria-invalid={!titleValid}
            aria-label={`Slide ${index + 1} title`}
          />
          <div className="text-[11px] text-gray-500 text-right">
            {titleTrim.length}/{TITLE_MAX}
          </div>
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
            onKeyDown={onBulletsKeyDown}
            onBlur={onBulletsBlur}
            rows={bulletRows}
            className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring ${
              bulletsValid ? "" : "border-red-500"
            }`}
            placeholder="- Point A\n- Point B"
            aria-invalid={!bulletsValid}
            aria-label={`Slide ${index + 1} bullets`}
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
            <span>{bulletList.length}/{BULLETS_MAX} bullets</span>
            {!bulletsValid && (
              <span className="text-red-600">Up to {BULLETS_MAX} bullets allowed.</span>
            )}
          </div>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
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
              type="button"
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
        media0 ? (
          <div className="mt-2">
            <img
              src={media0.url}
              alt={media0.alt ?? slide.title}
              className="w-full h-40 object-cover rounded-lg border bg-gray-100"
              loading="lazy"
            />
            {media0.alt && (
              <div className="mt-1 text-xs text-gray-500">{media0.alt}</div>
            )}
          </div>
        ) : showSkeleton ? (
          <div className="mt-2 h-40 w-full rounded-lg bg-gray-100 animate-pulse" />
        ) : null
      )}
    </li>
  );
}
