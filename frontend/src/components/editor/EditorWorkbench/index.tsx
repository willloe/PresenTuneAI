import { useState, useMemo } from "react";
import { type Deck, deriveComponentsForFilter } from "../../../types/deck";
import type { LayoutItem } from "../../../lib/api";
import SlideTabs from "./SlideTabs";
import PreviewStage from "./PreviewStage";
import ContentPanel from "./panels/ContentPanel";
import MediaPanel from "./panels/MediaPanel";
import { useDebouncedEditorDoc } from "../../../hooks/useDebouncedEditorDoc";
import LayoutPickerModal from "../../layout/LayoutPickerModal";
import LayoutThumb from "../../layout/LayoutThumb";
import Button from "../../ui/Button";

type Slide = Deck["slides"][number];

export default function EditorWorkbench({
  deck,
  slides,
  theme,
  layouts,
  selection,
  onSelectLayout,
  onAutoFit,
  onUpdateSlide,
  onOpenMediaLibrarySlot,
  requestId,
  exportStatus,
  onBuildEditor,
  selectionComplete,
  building,
  buildErr,
}: {
  deck: Deck;
  slides: Slide[];
  theme: string;
  layouts: LayoutItem[];
  selection: Record<string, string>;
  onSelectLayout: (slideId: string, layoutId: string) => void;
  onAutoFit: (slideId: string) => void | Promise<void>;
  onUpdateSlide: (idx: number, next: Slide) => void;
  onOpenMediaLibrarySlot: (slideIdx: number, slotIdx: number) => void;
  requestId: string | null;
  exportStatus?: string;
  onBuildEditor: () => Promise<void>;
  selectionComplete: boolean;
  building: boolean;
  buildErr: string | null;
}) {
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState<"content" | "layout" | "media">("content");
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);
  const activeSlide = slides[active];

  const { doc, busy: previewBusy, rebuildNow } = useDebouncedEditorDoc({
    deck,
    selection,
    theme,
  });

  const counts = useMemo(() => {
    if (!activeSlide) return { text_count: 0, image_count: 0 };
    try {
      return deriveComponentsForFilter(activeSlide);
    } catch {
      return {
        text_count: Math.max(0, activeSlide.bullets?.length ?? 0),
        image_count: Math.max(0, (activeSlide.media ?? []).length),
      };
    }
  }, [activeSlide?.meta?.sections, activeSlide?.media, activeSlide?.id]);

  const selectedLayoutId = activeSlide ? (selection[activeSlide.id] || "") : "";
  const selectedLayout =
    activeSlide ? layouts.find((l) => l.id === selectedLayoutId) || null : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border bg-white px-3 py-2 text-sm">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="truncate">
            {deck.topic} • {slides.length} slides • Theme: {theme}
            {requestId ? ` • Req: ${requestId}` : ""}
          </div>
          {exportStatus && <span className="text-gray-500 hidden sm:inline">{exportStatus}</span>}
          {previewBusy && <span className="text-xs text-gray-500">preview updating…</span>}
        </div>
        <Button
          onClick={onBuildEditor}
          disabled={building || !selectionComplete}
          variant="solid"
          size="sm"
          title={!selectionComplete ? "Choose a layout for each slide" : "Build editor and continue"}
          type="button"
        >
          {building ? "Building…" : "Build & Continue"}
        </Button>
      </div>

      {/* Slide tabs */}
      <SlideTabs slides={slides} active={active} setActive={setActive} />

      {/* Split: 1/3 inspector • 2/3 preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Inspector */}
        <div className="rounded-xl border bg-white">
          <div className="flex items-center gap-2 border-b p-2">
            <Tab id="content" current={tab} setTab={setTab}>Content</Tab>
            <Tab id="layout" current={tab} setTab={setTab}>Layout</Tab>
            <Tab id="media" current={tab} setTab={setTab}>Media</Tab>
          </div>

          <div className="p-3 space-y-4">
            {tab === "content" && (
              <ContentPanel
                slide={activeSlide}
                slideIndex={active}
                onUpdateSlide={onUpdateSlide}
                requestRebuild={() => rebuildNow()}
              />
            )}

            {tab === "layout" && activeSlide && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Layout</div>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-xs underline underline-offset-2"
                      onClick={() => onAutoFit(activeSlide.id)}
                      type="button"
                    >
                      Auto-fit
                    </button>
                    <Button size="sm" onClick={() => setLayoutModalOpen(true)}>
                      Choose…
                    </Button>
                  </div>
                </div>

                <LayoutPickerModal
                  open={layoutModalOpen}
                  onClose={() => setLayoutModalOpen(false)}
                  items={layouts}
                  selectedId={selectedLayoutId || ""}
                  counts={counts}
                  onSelect={(id) => onSelectLayout(activeSlide.id, id)}
                  onAutoFit={() => onAutoFit(activeSlide.id)}
                />
                <div className="mt-2">
                  {selectedLayout ? (
                    <LayoutThumb
                      layout={selectedLayout}
                      width={420}
                      pageW={1280}
                      pageH={720}
                      selected
                      onSelect={() => setLayoutModalOpen(true)}
                      tabIndex={0}
                    />
                  ) : (
                    <div className="rounded-xl border p-3 text-sm text-gray-600 bg-white">
                      Using <b>Auto-fit</b>. Click <em>Choose…</em> to pick a specific layout.
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "media" && (
              <MediaPanel
                slide={activeSlide}
                onOpenSlot={(slot) => onOpenMediaLibrarySlot(active, slot)}
                onRemoveSlot={(slot) => {
                  if (!activeSlide) return;
                  onUpdateSlide(active, {
                    ...activeSlide,
                    media: (activeSlide.media || []).filter((_, i) => i !== slot),
                  } as Slide);
                  rebuildNow();
                }}
              />
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2 rounded-xl border bg-white">
          <PreviewStage doc={doc} activeIndex={active} />
        </div>
      </div>

      {buildErr && <p className="text-sm text-red-600">{buildErr}</p>}
    </div>
  );
}

function Tab({
  id,
  current,
  setTab,
  children,
}: {
  id: "content" | "layout" | "media";
  current: "content" | "layout" | "media";
  setTab: (t: "content" | "layout" | "media") => void;
  children: React.ReactNode;
}) {
  const active = current === id;
  return (
    <Button
      size="xs"
      className={active ? "bg-black text-white border-black" : ""}
      onClick={() => setTab(id)}
      type="button"
    >
      {children}
    </Button>
  );
}
