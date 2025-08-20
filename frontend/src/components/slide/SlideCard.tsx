import { useEffect, useMemo, useState } from "react";
import type { Slide, Media } from "../../types/deck";
import ImageGalleryEditor, { type MediaItem } from "../ImageGalleryEditor";
import BlockViewer from "./BlockViewer";
import BlocksEditor from "./BlocksEditor";
import {
  TITLE_MAX,
  TITLE_MIN,
  sectionsFromSlide,
  sanitizeSections,
  derivePrimaryBullets,
} from "./sections";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";

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

  onSetImage?: (index: number, url: string, alt?: string) => void;
  onRemoveImage?: (index: number) => void;
  onGenerateImage?: (index: number) => void;
};

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
  const [sections, setSections] = useState(sectionsFromSlide(slide));
  const [dirty, setDirty] = useState(false);

  const [imgUrl, setImgUrl] = useState(slide.media?.[0]?.url ?? "");
  useEffect(() => {
    setTitle(slide.title);
    setSections(sectionsFromSlide(slide));
    setDirty(false);
    setImgUrl(slide.media?.[0]?.url ?? "");
  }, [slide.id, slide.title, slide.meta?.sections, slide.bullets, slide.media]);

  const titleTrim = (title || "").trim();
  const titleValid = titleTrim.length >= TITLE_MIN && titleTrim.length <= TITLE_MAX;

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
    setSections(sectionsFromSlide(slide));
    setDirty(false);
  }
  function saveEdit() {
    if (!dirty || !titleValid) return;
    const clean = sanitizeSections(sections);
    const next: Slide = {
      ...slide,
      title: titleTrim,
      bullets: derivePrimaryBullets(clean),
      meta: { ...(slide.meta ?? {}), sections: clean },
    };
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

  // --- Media gallery
  const media: MediaItem[] = useMemo(() => {
    const arr = (slide.media || []) as Media[];
    return arr
      .map((m) => (m?.url ? { type: "image" as const, url: String(m.url), alt: m.alt ?? undefined } : null))
      .filter(Boolean) as MediaItem[];
  }, [slide.media]);

  function updateMedia(nextMedia: MediaItem[]) {
    const next: Slide = { ...slide, media: nextMedia as any };
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
  const selectedLayout = layoutName ?? (slide.layout || "");

  return (
    <li className="border rounded-xl p-4">
      {!editing ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold break-words">{slide.title}</div>
            {selectedLayout ? (
              <div className="mt-1">
                <span className="inline-block text-[11px] rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">
                  {selectedLayout}
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex gap-2 shrink-0">
            <IconButton label="Move up" onClick={moveUp} disabled={!canUp}>▲</IconButton>
            <IconButton label="Move down" onClick={moveDown} disabled={!canDown}>▼</IconButton>
            <Button onClick={startEdit} disabled={isBusy} size="xs">Edit</Button>
            <Button onClick={() => onRegenerate(index)} disabled={isRegenning} size="xs">
              {isRegenning ? "Regenerating…" : "Regenerate"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            onKeyDown={onTitleKeyDown}
            className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring ${titleValid ? "" : "border-red-500"}`}
            maxLength={TITLE_MAX}
            placeholder="Slide title"
            aria-invalid={!titleValid}
          />
          <div className="text-[11px] text-gray-500 text-right">{titleTrim.length}/{TITLE_MAX}</div>
        </div>
      )}

      {/* Text blocks */}
      {!editing ? (
        <div className="mt-2">
          <BlockViewer sections={slide.meta?.sections ?? sections} />
          {!slide.meta?.sections?.length && slide.bullets?.length ? (
            <ul className="list-disc ml-6">
              {slide.bullets.map((b, j) => <li key={j}>{b}</li>)}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="mt-3">
          <BlocksEditor
            sections={sections}
            onChange={(next) => { setSections(next); setDirty(true); }}
            onRequestSave={saveEdit}
            onRequestCancel={cancelEdit}
          />
          <div className="mt-2 flex gap-2">
            <Button variant="solid" onClick={saveEdit} disabled={!titleValid || !dirty}>
              Save
            </Button>
            <Button onClick={cancelEdit}>Cancel</Button>
          </div>
        </div>
      )}

      {/* First image preview */}
      {showImages && !editing && (media[0] ? (
        <div className="mt-2">
          <img src={media[0].url} alt={media[0].alt ?? slide.title}
               className="w-full h-40 object-cover rounded-lg border bg-gray-100" loading="lazy" />
          {media[0].alt && <div className="mt-1 text-xs text-gray-500">{media[0].alt}</div>}
        </div>
      ) : showSkeleton ? (
        <div className="mt-2 h-40 w-full rounded-lg bg-gray-100 animate-pulse" />
      ) : null)}

      {/* Image gallery */}
      <div className="mt-3">
        <ImageGalleryEditor
          items={media}
          onAdd={(url, alt) => addImage(url, alt)}
          onReplace={(at, url, alt) => replaceImage(at, url, alt)}
          onRemove={(at) => removeImageAt(at)}
          onMove={(from, to) => moveImage(from, to)}
          onAIGenerate={(at) => aiGenerate(at)}
        />
      </div>

      {/* Legacy quick image actions */}
      {!editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={imgUrl}
            onChange={(e) => setImgUrl(e.target.value)}
            placeholder="https://… (image URL)"
            className="min-w-[12rem] flex-1 rounded-xl border px-3 py-2 outline-none focus:ring"
          />
          <Button
            onClick={() => {
              if (!imgUrl) return;
              if (media.length === 0 && onSetImage) onSetImage(index, imgUrl, slide.title);
              else if (media.length === 0) addImage(imgUrl, slide.title);
              else replaceImage(0, imgUrl, slide.title);
            }}
            size="sm"
          >
            {media.length ? "Replace" : "Add Image"}
          </Button>
          <Button onClick={() => aiGenerate()} size="sm" title="Generate placeholder image">
            AI Generate
          </Button>
          {media.length ? (
            <Button
              onClick={() => {
                if (onRemoveImage && media.length === 1) onRemoveImage(index);
                else removeImageAt(0);
              }}
              size="sm"
            >
              Remove
            </Button>
          ) : null}
        </div>
      )}
    </li>
  );
}
