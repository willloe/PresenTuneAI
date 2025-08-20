import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  API_BASE,
  type ExportResp,
  type LayoutItem,
  type EditorBuildResponse,
  exportDownloadUrl as buildDownloadUrl,
} from "./lib/api";
import { uploadFile, type UploadResponse } from "./lib/upload";
import type { Deck } from "./types/deck";
import { useOutline, type OutlineRequest } from "./hooks/useOutline";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useHealth } from "./hooks/useHealth";
import { useLayouts } from "./hooks/useLayout";
import { clamp } from "./utils/clamp";
import { safeUUID } from "./utils/safeUUID";
import { copyToClipboard } from "./utils/clipboard";

import {
  HeaderBar,
  UploadSection,
  OutlineControls,
  Preview,
  Settings,
} from "./components";
import PhaseBar, { type Phase } from "./components/PhaseBar";
import PhaseContainer from "./components/PhaseContainer";
import LayoutSelectionList from "./components/layout/LayoutSelectionList";
import FinalizeSection from "./components/FinalizeSection";
import { useToast } from "./components/ui/Toast";

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

  // Outline
  const { deck, loading, error, meta, generate, regenerate, updateSlide, clearError, setDeck } =
    useOutline();

  // Phases
  const [step, setStep] = useState<number>(1); // 1..5

  // Layouts & Editor
  const { items: layouts } = useLayouts();
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [editorResp, setEditorResp] = useState<EditorBuildResponse | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildErr, setBuildErr] = useState<string | null>(null);
  const idemKeyRef = useRef<string>(safeUUID());

  const [editConfirmed, setEditConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Export
  const [exportInfo, setExportInfo] = useState<ExportResp | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // Regen
  const [regenIndex, setRegenIndex] = useState<number | null>(null);

  // Derived
  const slides: Deck["slides"] = deck?.slides ?? [];
  const displayTopic = (deck?.topic || topic || uploadMeta?.filename || "Untitled") as string;

  // Toasts
  const { show } = useToast();

  // Auto-back when later steps are invalid
  useEffect(() => {
    if (step >= 4 && !editConfirmed) setStep(3);
    if (step >= 5 && !editorResp) setStep(4);
  }, [step, editConfirmed, editorResp]);

  const haveExtract = !!uploadMeta;
  const haveDeck = slides.length > 0;
  const selectionComplete = useMemo(
    () => haveDeck && slides.every((s) => !!selection[s.id]),
    [haveDeck, slides, selection]
  );
  const haveEditor = !!editorResp;
  const haveExport = !!exportInfo;

  const phases: Phase[] = useMemo(
    () => [
      {
        id: 1,
        title: "Upload Extract",
        status: step > 1 ? "done" : "active",
        hint: haveExtract ? `${uploadMeta?.parsed?.pages ?? 0} pages` : undefined,
      },
      {
        id: 2,
        title: "Outline Generate",
        status: step === 2 ? "active" : step > 2 ? "done" : "upcoming",
        hint: haveDeck ? `${deck?.slide_count ?? 0} slides` : undefined,
      },
      {
        id: 3,
        title: "Edit & Assign",
        status: step === 3 ? "active" : step > 3 ? "done" : "upcoming",
        hint: "reorder / text / images",
      },
      {
        id: 4,
        title: "Layout Selection",
        status: step === 4 ? "active" : step > 4 ? "done" : "upcoming",
        hint: selectionComplete ? "ready" : undefined,
      },
      {
        id: 5,
        title: "Finalize & Export",
        status: step === 5 ? "active" : "upcoming",
        hint: haveExport ? "exported" : haveEditor ? "built" : undefined,
      },
    ],
    [step, haveExtract, uploadMeta?.parsed?.pages, haveDeck, deck?.slide_count, selectionComplete, haveExport, haveEditor]
  );

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
    setEditConfirmed(false);
    clearError();
    setStep(1);

    try {
      const meta = await uploadFile(f);
      setUploadMeta(meta);
      setTopic(meta.filename.replace(/\.[^.]+$/, ""));
      // toast: upload success
      show({ tone: "success", title: "Uploaded", description: meta.filename });
    } catch (err: any) {
      const msg = err?.message || "upload failed";
      setUploadErr(msg);
      // toast: upload error
      show({ tone: "danger", title: "Upload failed", description: msg });
    } finally {
      if (input) input.value = "";
    }
  }, [clearError, show]);

  const runOutline = useCallback(async () => {
    setExportInfo(null);
    setExportErr(null);
    setEditorResp(null);
    setBuildErr(null);
    setSelection({});
    setEditConfirmed(false);
    clearError();

    const body: OutlineRequest = {
      topic,
      slide_count: clamp(count, 1, 15),
      text: uploadMeta?.parsed?.text ?? undefined,
    };
    try {
      await generate(body);
      // toast: outline success
      show({ tone: "success", title: "Outline ready", description: "Draft slides generated." });
    } catch (err: any) {
      // toast: outline error
      show({ tone: "danger", title: "Generate failed", description: err?.message || "Could not generate outline." });
      throw err;
    }
  }, [topic, count, uploadMeta?.parsed?.text, generate, clearError, show]);

  const suggestLayoutsFromDeck = useCallback(async (d: Deck) => {
    const next: Record<string, string> = {};
    await Promise.all(
      d.slides.map(async (s) => {
        const text_count = Math.max(0, (s.bullets || []).length);
        const image_count = Math.max(0, (s.media || []).length);
        try {
          const { data } = await api.filterLayouts({
            components: { text_count, image_count },
            top_k: 1,
          });
          next[s.id] = data.candidates?.[0] || layouts?.[0]?.id || "";
        } catch {
          next[s.id] = layouts?.[0]?.id || "";
        }
      })
    );
    setSelection(next);
  }, [layouts]);

  const confirmEdits = useCallback(async () => {
    if (!deck) return;
    setConfirming(true);
    try {
      await suggestLayoutsFromDeck(deck);
      setEditConfirmed(true);
      setStep(4);
      // toast: edits confirmed
      show({ tone: "info", title: "Edits confirmed", description: "Initial layouts suggested." });
    } catch (err: any) {
      show({ tone: "danger", title: "Confirm failed", description: err?.message || "Could not confirm edits." });
      throw err;
    } finally {
      setConfirming(false);
    }
  }, [deck, suggestLayoutsFromDeck, show]);

  const runRegen = useCallback(
    async (i: number) => {
      if (!deck) return;
      setRegenIndex(i);
      try {
        await regenerate(i, {
          topic: deck.topic ?? topic,
          text: uploadMeta?.parsed?.text ?? undefined,
          slide_count: deck.slide_count ?? clamp(count, 1, 15),
        });
        setEditorResp(null);
        setSelection((old) => {
          const cp = { ...old };
          delete cp[deck.slides[i].id];
          return cp;
        });
        setEditConfirmed(false);
        // toast: slide regenerated
        show({ tone: "info", title: "Slide regenerated", description: `Slide #${i + 1}` });
      } catch (err: any) {
        show({ tone: "danger", title: "Regenerate failed", description: err?.message || `Slide #${i + 1}` });
        throw err;
      } finally {
        setRegenIndex(null);
      }
    },
    [deck, topic, uploadMeta?.parsed?.text, count, regenerate, show]
  );

  const runBuildEditor = useCallback(async () => {
    if (!deck) return;
    setBuilding(true);
    setBuildErr(null);
    setEditorResp(null);
    try {
      const selections = deck.slides.map((s) => ({
        slide_id: s.id,
        layout_id: selection[s.id] || undefined,
      }));
      const { data } = await api.buildEditor(
        { deck, selections, theme, policy: "best_fit" },
        { idempotencyKey: idemKeyRef.current }
      );
      setEditorResp(data);
      // toast: build success
      const n = data.editor?.slides?.length ?? 0;
      show({ tone: "success", title: "Editor built", description: `${n} slide(s)` });
      if (data.warnings?.length) {
        show({ tone: "info", title: "Build warnings", description: `${data.warnings.length} warning(s)` });
      }
    } catch (e: any) {
      const msg = e?.message || "build failed";
      setBuildErr(msg);
      // toast: build error
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
      const body = editorResp?.editor
        ? { editor: editorResp.editor, theme }
        : { slides: deck.slides, theme };
      const { data } = await api.exportDeck(body);
      setExportInfo(data);
      // toast: export success
      const kb = Math.max(1, Math.round(data.bytes / 1024));
      show({ tone: "success", title: "Exported", description: `.${data.format} — ${kb} KB` });
    } catch (e: any) {
      const msg = e?.message || "export failed";
      setExportErr(msg);
      // toast: export error
      show({ tone: "danger", title: "Export failed", description: msg });
    } finally {
      setExporting(false);
    }
  }, [deck, editorResp?.editor, theme, show]);

  const moveSlide = useCallback(
    (from: number, to: number) => {
      if (!deck) return;
      if (to < 0 || to >= deck.slides.length || from === to) return;
      setDeck((prev) => {
        if (!prev) return prev;
        const nextSlides = [...prev.slides];
        const [spliced] = nextSlides.splice(from, 1);
        nextSlides.splice(to, 0, spliced);
        return { ...prev, slides: nextSlides, slide_count: nextSlides.length };
      });
      setEditorResp(null);
      setEditConfirmed(false);
    },
    [deck, setDeck]
  );

  const setImageForSlide = useCallback(
    (idx: number, url: string, alt?: string) => {
      updateSlide(idx, (prev) => ({
        ...prev,
        media: url ? [{ type: "image", url, alt: alt ?? prev.title }] : [],
      }) as any);
      setEditorResp(null);
      setEditConfirmed(false);
    },
    [updateSlide]
  );

  const removeImageForSlide = useCallback(
    (idx: number) => {
      updateSlide(idx, (prev) => ({ ...prev, media: [] } as any));
      setEditorResp(null);
      setEditConfirmed(false);
    },
    [updateSlide]
  );

  const generateImageForSlide = useCallback(
    (idx: number) => {
      if (!deck) return;
      const s = deck.slides[idx];
      const seed = s.id || `${idx}-${Date.now()}`;
      const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/400`;
      setImageForSlide(idx, url, s.title);
    },
    [deck, setImageForSlide]
  );

  const downloadUrl = useMemo(() => {
    const p = exportInfo?.path;
    return p ? buildDownloadUrl(p) : null;
  }, [exportInfo?.path]);

  /* ------------------------------ UI ------------------------------ */
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <HeaderBar
        health={health}
        schemaVersion={schemaVersion}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="mx-auto max-w-4xl px-6">
        <PhaseBar phases={phases} />

        {/* Step 1: Upload */}
        <PhaseContainer
          title="Upload Extract"
          subtitle="PDF, DOCX or plain text. We extract text and (optionally) images."
          step={1}
          currentStep={step}
          onNext={() => setStep(2)}
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
          nextLabel="Proceed to Editing"
          nextDisabled={!haveDeck}
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

        {/* Step 3: Edit & Assign */}
        <PhaseContainer
          title="Edit & Assign"
          subtitle="Reorder slides, refine text, attach/AI-generate images. Confirm to move on."
          step={3}
          currentStep={step}
          onNext={confirmEdits}
          nextLabel="Confirm edits → Layouts"
          nextDisabled={!haveDeck || confirming}
        >
          <Preview
            deck={deck}
            slides={slides}
            displayTopic={displayTopic}
            loading={loading}
            meta={meta}
            theme={theme}
            showImages={showImages}
            regenIndex={regenIndex}
            onRegenerate={runRegen}
            onUpdateSlide={(idx, next) => updateSlide(idx, () => next)}
            onReorder={moveSlide}
            onSetImage={setImageForSlide}
            onRemoveImage={removeImageForSlide}
            onGenerateImage={generateImageForSlide}
          />
        </PhaseContainer>

        {/* Step 4: Layout Selection */}
        <PhaseContainer
          title="Layout Selection"
          subtitle="Pick a layout per slide, then build an editor doc."
          step={4}
          currentStep={step}
          onNext={() => setStep(5)}
          nextLabel="Proceed to Finalize"
          nextDisabled={!haveDeck || !selectionComplete || !haveEditor}
        >
          {slides.length > 0 && (
            <>
              <LayoutSelectionList
                slides={slides}
                layouts={layouts as LayoutItem[]}
                selection={selection}
                onSelect={(slideId, layoutId) => setSelection((x) => ({ ...x, [slideId]: layoutId }))}
              />
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <button
                  onClick={runBuildEditor}
                  disabled={building || !haveDeck || !selectionComplete}
                  className={`rounded-xl px-4 py-2 text-white ${
                    building ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90"
                  }`}
                >
                  {building ? "Building…" : "Build Editor Doc"}
                </button>

                {buildErr && <span className="text-sm text-red-600">{buildErr}</span>}

                {editorResp && (
                  <span className="text-sm text-gray-700">
                    Editor slides: <b>{editorResp.editor?.slides?.length ?? 0}</b>
                    {editorResp.warnings?.length ? (
                      <span className="ml-2 text-amber-700">Warnings: {editorResp.warnings.length}</span>
                    ) : null}
                  </span>
                )}
              </div>
            </>
          )}
        </PhaseContainer>

        {/* Step 5: Finalize & Export */}
        <PhaseContainer
          title="Finalize & Export"
          subtitle="Review the built editor doc and export a PPTX."
          step={5}
          currentStep={step}
        >
          <FinalizeSection
            editorResp={editorResp}
            runExport={runExport}
            exporting={exporting}
            exportErr={exportErr}
            exportInfo={exportInfo}
            downloadUrl={downloadUrl}
          />
        </PhaseContainer>
      </main>

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
