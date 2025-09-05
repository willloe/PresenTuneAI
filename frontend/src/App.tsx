import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  API_BASE,
  type ExportResp,
  type LayoutItem,
  type EditorBuildResponse,
} from "./lib/api";
import { uploadFile, type UploadResponse } from "./lib/upload";
import type { Deck } from "./types/deck";
import { useOutline, type OutlineRequest } from "./hooks/useOutline";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useHealth } from "./hooks/useHealth";
import { useLayouts } from "./hooks/useLayout";
import { usePhases } from "./hooks/usePhases";
import { clamp } from "./utils/clamp";
import { safeUUID } from "./utils/safeUUID";
import { copyToClipboard } from "./utils/clipboard";
import ThemeRoot from "./theme/ThemeRoot";
import { themeKeyToMeta } from "./theme/meta";
import { THEMES, type ThemeKey } from "./theme/themes";

import {
  HeaderBar,
  UploadSection,
  OutlineControls,
  Settings,
} from "./components";
import PhaseBar from "./components/PhaseBar";
import PhaseContainer from "./components/PhaseContainer";
import FinalizeSection from "./components/FinalizeSection";
import { useToast } from "./components/ui/Toast";

// Media library drawer
import MediaLibraryDrawer from "./components/media/MediaLibraryDrawer";
// Workbench (inline)
import EditorWorkbench from "./components/editor/EditorWorkbench";

// Slot-aware plan
import { useMediaPlan } from "./hooks/useMediaPlan";

export default function App() {
  // Health + schema
  const { health, schemaVersion } = useHealth();

  // App settings
  const [topic, setTopic] = useState("AI Hackathon");
  const [count, setCount] = useLocalStorage<number>("slideCount", 5);
  const [theme, setTheme] = useLocalStorage<string>("exportTheme", "default");
  const [showImages, setShowImages] = useLocalStorage<boolean>("showImages", true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Upload
  const [uploadMeta, setUploadMeta] = useState<UploadResponse | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const uploadId = uploadMeta?.uploadId ?? null;

  // Outline
  const { deck, loading, error, meta, generate, updateSlide, clearError } = useOutline();

  // Layouts & Editor
  const { items: layouts } = useLayouts();
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [editorResp, setEditorResp] = useState<EditorBuildResponse | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildErr, setBuildErr] = useState<string | null>(null);
  const idemKeyRef = useRef<string>(safeUUID());

  // Export
  const [exportInfo, setExportInfo] = useState<ExportResp | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // Media drawer target (slide + optional slot)
  const [openLibTarget, setOpenLibTarget] = useState<{ slide: number; slot: number | null } | null>(null);

  // Derived
  const slides: Deck["slides"] = deck?.slides ?? [];

  // Toasts
  const { show } = useToast();

  // Slot-aware plan util (only used to register setSlot on changes)
  const { setSlot } = useMediaPlan();

  // Phase orchestration
  const haveExtract = !!uploadMeta;
  const haveDeck = slides.length > 0;
  const selectionComplete = useMemo(
    () => haveDeck && slides.every((s) => !!selection[s.id]),
    [haveDeck, slides, selection]
  );
  const haveEditor = !!editorResp;
  const haveExport = !!exportInfo;

  const {
    step,
    phases,
    canNext,
    next,
    setStep,
  } = usePhases({
    editConfirmed: true, // workbench replaces confirm step
    haveExtract,
    uploadPages: uploadMeta?.parsed?.pages ?? null,
    haveDeck,
    deckSlideCount: deck?.slide_count ?? null,
    selectionComplete,
    haveEditor,
    haveExport,
    storageKey: "phaseStep",
    initialStep: 1,
  });

  /* --------------------------- handlers --------------------------- */
  const onPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const f = input.files?.[0];
    if (!f) return;

    setUploadErr(null);
    setUploadMeta(null);
    setExportInfo(null);
    setExportErr(null);
    setEditorResp(null);
    setSelection({});
    clearError();
    setOpenLibTarget(null);
    setStep(1);

    try {
      const meta = await uploadFile(f);
      setUploadMeta(meta);
      setTopic(meta.filename.replace(/\.[^.]+$/, ""));
      show({ tone: "success", title: "Uploaded", description: meta.filename });
    } catch (err: any) {
      const msg = err?.message || "upload failed";
      setUploadErr(msg);
      show({ tone: "danger", title: "Upload failed", description: msg });
    } finally {
      if (input) input.value = "";
    }
  }, [clearError, show, setStep]);

  const runOutline = useCallback(async () => {
    setExportInfo(null);
    setExportErr(null);
    setEditorResp(null);
    setBuildErr(null);
    setSelection({});
    clearError();

    const body: OutlineRequest = {
      topic,
      slide_count: clamp(count, 1, 15),
      text: uploadMeta?.parsed?.text ?? undefined,
    };
    try {
      await generate(body);
      show({ tone: "success", title: "Outline ready", description: "Draft slides generated." });
      setStep(3);
    } catch (err: any) {
      show({ tone: "danger", title: "Generate failed", description: err?.message || "Could not generate outline." });
      throw err;
    }
  }, [topic, count, uploadMeta?.parsed?.text, generate, clearError, show, setStep]);

  // Suggest a best layout per slide (fallback to local filter) — auto-runs when deck arrives
  const suggestLayoutsFromDeck = useCallback(async (d: Deck) => {
    const nextSel: Record<string, string> = {};
    await Promise.all(
      d.slides.map(async (s) => {
        const text_count = Math.max(0, (s.bullets || []).length);
        const image_count = Math.max(0, (s.media || []).length);
        try {
          const { data } = await api.filterLayouts({
            components: { text_count, image_count },
            top_k: 1,
          });
          nextSel[s.id] = data.candidates?.[0] || layouts?.[0]?.id || "AUTO";
        } catch {
          nextSel[s.id] = layouts?.[0]?.id || "AUTO";
        }
      })
    );
    setSelection(nextSel);
  }, [layouts]);

  useEffect(() => {
    if (!deck?.slides?.length) return;
    const haveAny = deck.slides.some((s) => !!selection[s.id]);
    if (!haveAny) void suggestLayoutsFromDeck(deck);
  }, [deck, selection, suggestLayoutsFromDeck]);

  const runBuildEditor = useCallback(async () => {
    if (!deck) return;
    setBuilding(true);
    setBuildErr(null);
    setEditorResp(null);
    try {
      const selections = deck.slides.map((s) => {
        const chosen = selection[s.id];
        return { slide_id: s.id, layout_id: chosen && chosen !== "AUTO" ? chosen : undefined };
      });
      const themeMeta = themeKeyToMeta((THEMES as any)[theme] ? (theme as ThemeKey) : "default");

      const { data } = await api.buildEditor(
        { deck, selections, theme, policy: "best_fit", theme_meta: themeMeta },
        { idempotencyKey: idemKeyRef.current }
      );
      setEditorResp(data);
      const n = data.editor?.slides?.length ?? 0;
      show({ tone: "success", title: "Editor built", description: `${n} slide(s)` });
      if (data.warnings?.length) {
        show({ tone: "info", title: "Build warnings", description: `${data.warnings.length} warning(s)` });
      }
    } catch (e: any) {
      const msg = e?.message || "build failed";
      setBuildErr(msg);
      show({ tone: "danger", title: "Build failed", description: msg });
    } finally {
      setBuilding(false);
    }
  }, [deck, selection, theme, show]);

  const runExport = useCallback(async () => {
    if (!deck) return;
    setExporting(true);
    setExportInfo(null);
    setExportErr(null);
    try {
      const themeMeta = themeKeyToMeta((THEMES as any)[theme] ? (theme as ThemeKey) : "default");
      const body = editorResp?.editor
        ? { editor: { ...editorResp.editor, theme_meta: editorResp.editor.theme_meta ?? themeMeta }, theme }
        : { slides: deck.slides, theme, theme_meta: themeMeta };
      const { data } = await api.exportDeck(body);
      setExportInfo(data);
      const kb = Math.max(1, Math.round(data.bytes / 1024));
      show({ tone: "success", title: "Exported", description: `.${data.format} — ${kb} KB` });
    } catch (e: any) {
      const msg = e?.message || "export failed";
      setExportErr(msg);
      show({ tone: "danger", title: "Export failed", description: msg });
    } finally {
      setExporting(false);
    }
  }, [deck, editorResp?.editor, theme, show]);

  // Place/replace at an exact slot index
  const setImageForSlot = useCallback(
    (slideIdx: number, slotIdx: number, url: string, alt?: string) => {
      if (!deck) return;
      updateSlide(slideIdx, (prev) => {
        const current = Array.isArray(prev.media) ? [...prev.media] : [];
        const img = { type: "image", url, alt: alt ?? prev.title } as any;
        if (slotIdx < current.length) current[slotIdx] = img;
        else current.push(img);
        return { ...prev, media: current } as any;
      });
      const slideId = deck.slides[slideIdx]?.id;
      if (slideId) setSlot(slideId, slotIdx, { source: "library", url, alt });
      setEditorResp(null);
    },
    [deck, setSlot, updateSlide]
  );

  /* ------------------------------ UI ------------------------------ */
  return (
    <div className="min-h-screen text-gray-900" style={{ background: "var(--app-bg)" }}>
      <ThemeRoot themeKey={theme as any} />
      <HeaderBar health={health} schemaVersion={schemaVersion} onOpenSettings={() => setSettingsOpen(true)} />

      <main className="mx-auto max-w-5xl px-6">
        <PhaseBar phases={phases} />

        {/* Step 1: Upload */}
        <PhaseContainer
          title="Upload Extract"
          subtitle="PDF, DOCX or plain text. We extract text and (optionally) images."
          step={1}
          currentStep={step}
          onNext={next}
          nextLabel="Continue to Outline"
        >
          <UploadSection uploadErr={uploadErr} uploadMeta={uploadMeta} onPick={onPick} />
        </PhaseContainer>

        {/* Step 2: Outline Generate */}
        <PhaseContainer
          title="Outline Generate"
          subtitle="Set slide count & theme, then generate."
          step={2}
          currentStep={step}
          onNext={() => setStep(3)}
          nextLabel="Proceed to Workbench"
          nextDisabled={!canNext}
        >
          <OutlineControls
            topic={topic}
            setTopic={setTopic}
            loading={loading}
            onGenerate={runOutline}
            hasSlides={slides.length > 0}
            showInlineSettings
            showSettingsButton={false}
            theme={theme}
            setTheme={setTheme}
            count={count}
            setCount={(n: number) => setCount(clamp(n, 1, 15))}
            showImages={showImages}
            setShowImages={setShowImages}
            exporting={exporting}
            exportInfo={exportInfo}
            exportErr={exportErr || error}
            onExport={runExport}
            meta={meta}
            copyToClipboard={copyToClipboard}
          />
        </PhaseContainer>

        {/* Step 3: Editor Workbench (INLINE) */}
        <PhaseContainer
          title="Editor Workbench"
          subtitle="Edit text, choose layouts, and manage images in one place. Build when ready."
          step={3}
          currentStep={step}
          onNext={next}
          nextLabel={editorResp ? "Proceed to Finalize" : "Build editor to continue"}
          nextDisabled={!editorResp}
        >
          {deck && slides.length > 0 ? (
            <div className="rounded-2xl bg-white shadow-sm border p-4">
              <EditorWorkbench
                deck={deck}
                slides={slides}
                theme={theme}
                layouts={layouts as LayoutItem[]}
                selection={selection}
                onSelectLayout={(slideId: string, layoutId: string) =>
                  setSelection((x) => ({ ...x, [slideId]: layoutId }))
                }
                onAutoFit={async (slideId: string) => {
                  const s = deck.slides.find((sl) => sl.id === slideId);
                  if (!s) return;
                  const text_count = Math.max(0, (s.bullets || []).length);
                  const image_count = Math.max(0, (s.media || []).length);
                  try {
                    const { data } = await api.filterLayouts({
                      components: { text_count, image_count },
                      top_k: 1,
                    });
                    const id = data.candidates?.[0] || layouts?.[0]?.id || "AUTO";
                    setSelection((old) => ({ ...old, [slideId]: id }));
                  } catch {
                    const id = layouts?.[0]?.id || "AUTO";
                    setSelection((old) => ({ ...old, [slideId]: id }));
                  }
                }}
                onUpdateSlide={(idx: number, next: Deck["slides"][number]) => updateSlide(idx, () => next)}
                onOpenMediaLibrarySlot={(slideIdx: number, slotIdx: number) =>
                  setOpenLibTarget({ slide: slideIdx, slot: slotIdx })
                }
                requestId={meta?.requestId ?? null}
                exportStatus={exportInfo ? "Export ready" : undefined}
                onBuildEditor={runBuildEditor}
                selectionComplete={selectionComplete}
                building={building}
                buildErr={buildErr}
              />
            </div>
          ) : (
            <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
              Generate an outline first to use the workbench.
            </div>
          )}
        </PhaseContainer>

        {/* Step 4: Finalize & Export */}
        <PhaseContainer
          title="Finalize & Export"
          subtitle="Review the built editor doc and export a PPTX."
          step={4}
          currentStep={step}
        >
          <FinalizeSection editorResp={editorResp} />
        </PhaseContainer>
      </main>

      {/* Media Library drawer (opens when we have an uploadId) */}
      <MediaLibraryDrawer
        open={!!openLibTarget && !!uploadId}
        onClose={() => setOpenLibTarget(null)}
        uploadId={uploadId}
        slotIndex={openLibTarget?.slot ?? null}
        onSelect={(url) => {
          if (!openLibTarget) return;
          const { slide, slot } = openLibTarget;
          if (slot === null || slot === undefined) {
            // Append (inline path rarely uses this; kept for parity)
            updateSlide(slide, (prev) => {
              const current = Array.isArray(prev.media) ? [...prev.media] : [];
              if (current.some((m: any) => m?.url === url)) return prev;
              return { ...prev, media: [...current, { type: "image", url, alt: prev.title }] } as any;
            });
          } else {
            // Place at slot
            setImageForSlot(slide, slot, url);
          }
          setOpenLibTarget(null);
        }}
        onSelectAsset={(_, url, slotIndex) => {
          if (!openLibTarget) return;
          const { slide } = openLibTarget;
          if (slotIndex === null || slotIndex === undefined) {
            updateSlide(slide, (prev) => {
              const current = Array.isArray(prev.media) ? [...prev.media] : [];
              if (current.some((m: any) => m?.url === url)) return prev;
              return { ...prev, media: [...current, { type: "image", url, alt: prev.title }] } as any;
            });
          } else {
            setImageForSlot(slide, slotIndex, url);
          }
          setOpenLibTarget(null);
        }}
      />

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        setTheme={setTheme}
        count={count}
        setCount={(n) => setCount(clamp(n, 1, 15))}
        showImages={showImages}
        setShowImages={setShowImages}
        apiBase={API_BASE}
      />
    </div>
  );
}
