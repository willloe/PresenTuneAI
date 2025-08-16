import { useEffect, useMemo, useState } from "react";
import type { Slide } from "../types/deck";
import ImageGalleryEditor, { type MediaItem } from "./ImageGalleryEditor";

type Props = {
  slide: Slide;
  index: number;
  total: number;

  loading: boolean;
  regenIndex: number | null;
  showImages: boolean;

  onRegenerate: (i: number) => Promise<void>;
  onUpdate: (index: number, next: Slide) => void;

  layoutName?: string;
  onReorder?: (from: number, to: number) => void;

  // image tools
  onSetImage?: (index: number, url: string, alt?: string) => void;
  onRemoveImage?: (index: number) => void;
  onGenerateImage?: (index: number) => void;
};

const TITLE_MIN = 1;
const TITLE_MAX = 200;
const BULLETS_MAX = 12;

function normalizeBullets(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/^(\d+[.)]\s*|[-*•·]\s*)/, ""))
    .filter(Boolean)
    .slice(0, BULLETS_MAX);
}

export default function SlideCard({
  slide,
  index,
  total,
  loading,
  regenIndex,
  showImages,
  onRegenerate,
  onUpdate,
  layoutName,
  onReorder,
  onSetImage,
  onRemoveImage,
  onGenerateImage,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(slide.title);
  const [bulletsText, setBulletsText] = useState(slide.bullets?.join("\n") ?? "");
  const [dirty, setDirty] = useState(false);

  // quick URL box (legacy single-image helpers)
  const [imgUrl, setImgUrl] = useState(slide.media?.[0]?.url ?? "");
  useEffect(() => {
    setImgUrl(slide.media?.[0]?.url ?? "");
  }, [slide.media, slide.id]);

  useEffect(() => {
    setTitle(slide.title);
    setBulletsText(slide.bullets?.join("\n") ?? "");
    setDirty(false);
  }, [slide.id, slide.title, slide.bullets]);

  const titleTrim = (title || "").trim();
  const titleValid = useMemo(
    () => titleTrim.length >= TITLE_MIN && titleTrim.length <= TITLE_MAX,
    [titleTrim]
  );

  const bulletList = useMemo(() => normalizeBullets(bulletsText), [bulletsText]);
  const bulletsValid = bulletList.length <= BULLETS_MAX;

  const isRegenning = regenIndex === index;
  const isBusy = loading || isRegenning;

  const canUp = index > 0;
  const canDown = index < total - 1;

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

  function moveUp() {
    if (!canUp || !onReorder) return;
    onReorder(index, index - 1);
  }
  function moveDown() {
    if (!canDown || !onReorder) return;
    onReorder(index, index + 1);
  }

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
  function onTitleBlur() {
    if (dirty && titleValid) saveEdit();
  }
  function onBulletsBlur() {
    if (dirty && bulletsValid) saveEdit();
  }

  // --- Media normalization (strict MediaItem[]) ---
  const media: MediaItem[] = useMemo(() => {
    const arr = (slide.media || []) as any[];
    return arr
      .map((m: any) => {
        const url = m?.url as string | undefined;
        if (!url) return null;
        const alt = (m?.alt as string | undefined) ?? undefined;
        return { type: "image" as const, url: String(url), alt };
      })
      .filter(Boolean) as MediaItem[];
  }, [slide.media]);

  function updateMedia(nextMedia: MediaItem[]) {
    const next: Slide = { ...slide, media: nextMedia };
    onUpdate(index, next);
  }
  function addImage(url: string, alt?: string) {
    const next = [...media, { type: "image" as const, url, alt: alt ?? slide.title }];
    if (!media.length && onSetImage) onSetImage(index, url, alt ?? slide.title);
    else updateMedia(next);
  }
  function replaceImage(at: number, url: string, alt?: string) {
    if (at === 0 && onSetImage) {
      onSetImage(index, url, alt ?? slide.title);
      return;
    }
    const next = [...media];
    next[at] = { type: "image" as const, url, alt: alt ?? next[at]?.alt };
    updateMedia(next);
  }
  function removeImageAt(at: number) {
    if (at === 0 && media.length === 1 && onRemoveImage) {
      onRemoveImage(index);
      return;
    }
    const next = media.slice(0, at).concat(media.slice(at + 1));
    updateMedia(next);
  }
  function moveImage(from: number, to: number) {
    if (from === to) return;
    const clampedTo = Math.max(0, Math.min(media.length - 1, to));
    const next = [...media];
    const [m] = next.splice(from, 1);
    next.splice(clampedTo, 0, m);
    updateMedia(next);
  }
  function aiGenerate(at?: number) {
    if (onGenerateImage) {
      onGenerateImage(index);
      return;
    }
    const seed = `${slide.id || index}-${Date.now()}`;
    const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/400`;
    if (typeof at === "number" && media[at]) replaceImage(at, url, slide.title);
    else addImage(url, slide.title);
  }

  const showSkeleton = showImages && !editing && !media.length && isBusy;

  return (
    <li className="border rounded-xl p-4">
      {/* Header / actions */}
      {!editing ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold break-words">{slide.title}</div>
            {layoutName && (
              <div className="mt-1">
                <span className="inline-block text-[11px] rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">
                  {layoutName}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={moveUp}
              disabled={!canUp}
              className={`rounded-lg border px-2 py-1 text-xs ${
                canUp ? "hover:bg-gray-50" : "opacity-50 cursor-not-allowed"
              }`}
              title="Move up"
              aria-label={`Move slide ${index + 1} up`}
            >
              ▲
            </button>
            <button
              type="button"
              onClick={moveDown}
              disabled={!canDown}
              className={`rounded-lg border px-2 py-1 text-xs ${
                canDown ? "hover:bg-gray-50" : "opacity-50 cursor-not-allowed"
              }`}
              title="Move down"
              aria-label={`Move slide ${index + 1} down`}
            >
              ▼
            </button>

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
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
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
        !!slide.bullets?.length && <ul className="list-disc ml-6 mt-2">{slide.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
      ) : (
        <div className="mt-3">
          <label className="block text-sm mb-1">Bullets (one per line)</label>
          <textarea
            value={bulletsText}
            onChange={(e) => {
              setBulletsText(e.target.value);
              setDirty(true);
            }}
            onKeyDown={onBulletsKeyDown}
            onBlur={onBulletsBlur}
            rows={Math.max(3, Math.min(8, bulletsText.split(/\r?\n/).length))}
            className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring ${
              bulletsValid ? "" : "border-red-500"
            }`}
            placeholder="- Point A\n- Point B"
            aria-invalid={!bulletsValid}
            aria-label={`Slide ${index + 1} bullets`}
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
            <span>
              {bulletList.length}/{BULLETS_MAX} bullets
            </span>
            {!bulletsValid && <span className="text-red-600">Up to {BULLETS_MAX} bullets allowed.</span>}
          </div>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={!titleValid || !bulletsValid || !dirty}
              className={`rounded-lg px-3 py-1 text-sm text-white ${
                !titleValid || !bulletsValid || !dirty ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90"
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

      {/* Quick preview of first image */}
      {showImages && !editing && (media[0] ? (
        <div className="mt-2">
          <img
            src={media[0].url}
            alt={media[0].alt ?? slide.title}
            className="w-full h-40 object-cover rounded-lg border bg-gray-100"
            loading="lazy"
          />
          {media[0].alt && <div className="mt-1 text-xs text-gray-500">{media[0].alt}</div>}
        </div>
      ) : showSkeleton ? (
        <div className="mt-2 h-40 w-full rounded-lg bg-gray-100 animate-pulse" />
      ) : null)}

      {/* Full image gallery editor */}
      <div className="mt-3">
        <ImageGalleryEditor
          items={media}
          onAdd={(url: string, alt?: string) => addImage(url, alt)}
          onReplace={(at: number, url: string, alt?: string) => replaceImage(at, url, alt)}
          onRemove={(at: number) => removeImageAt(at)}
          onMove={(from: number, to: number) => moveImage(from, to)}
          onAIGenerate={(at?: number) => aiGenerate(at)}
        />
      </div>

      {/* Quick actions (legacy single-image) */}
      {!editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={imgUrl}
            onChange={(e) => setImgUrl(e.target.value)}
            placeholder="https://… (image URL)"
            className="min-w-[12rem] flex-1 rounded-xl border px-3 py-2 outline-none focus:ring"
          />
          <button
            type="button"
            onClick={() => {
              if (!imgUrl) return;
              if (media.length === 0 && onSetImage) onSetImage(index, imgUrl, slide.title);
              else if (media.length === 0) addImage(imgUrl, slide.title);
              else replaceImage(0, imgUrl, slide.title);
            }}
            className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
          >
            {media.length ? "Replace" : "Attach"} Image
          </button>
          <button
            type="button"
            onClick={() => aiGenerate()}
            className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
            title="Generate placeholder image"
          >
            AI Generate
          </button>
          {media.length ? (
            <button
              type="button"
              onClick={() => {
                if (onRemoveImage && media.length === 1) onRemoveImage(index);
                else removeImageAt(0);
              }}
              className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
            >
              Remove
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}
