import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type ExportResp,
  API_BASE,
  type LayoutItem,
  type EditorBuildResponse,
} from "./lib/api";
import { uploadFile, type UploadResponse } from "./lib/upload";
import type { Deck } from "./types/deck";
import { useOutline, type OutlineRequest } from "./hooks/useOutline";
import { useLocalStorage } from "./hooks/useLocalStorage";
import {
  HeaderBar,
  UploadSection,
  OutlineControls,
  Preview,
  Settings,
  EditorPreview, // ⬅️ NEW
} from "./components";
import PhaseBar, { type Phase } from "./components/PhaseBar";
import PhaseContainer from "./components/PhaseContainer";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function App() {
  const [health, setHealth] = useState<"checking" | "ok" | "error">("checking");
  const [schemaVersion, setSchemaVersion] = useState<string | null>(null);
  const [topic, setTopic] = useState("AI Hackathon");
  const [count, setCount] = useLocalStorage<number>("slideCount", 5);
  const [theme, setTheme] = useLocalStorage<string>("exportTheme", "default");
  const [showImages, setShowImages] = useLocalStorage<boolean>("showImages", true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [uploadMeta, setUploadMeta] = useState<UploadResponse | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const { deck, loading, error, meta, generate, regenerate, updateSlide, clearError, setDeck } =
    useOutline();

  // phases
  const [step, setStep] = useState<number>(1); // 1..5

  // Week-2 bits
  const [layouts, setLayouts] = useState<LayoutItem[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [editorResp, setEditorResp] = useState<EditorBuildResponse | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildErr, setBuildErr] = useState<string | null>(null);
  const idemKeyRef = useRef<string | null>(null);
  if (!idemKeyRef.current)
    idemKeyRef.current = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(
      /-/g,
      ""
    );

  const [editConfirmed, setEditConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [exportInfo, setExportInfo] = useState<ExportResp | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const [regenIndex, setRegenIndex] = useState<number | null>(null);
  const displayTopic = (deck?.topic || topic || uploadMeta?.filename || "Untitled") as string;

  useEffect(() => {
    api
      .healthWithMeta()
      .then(({ data }) => {
        setHealth("ok");
        setSchemaVersion((data as any)?.schema_version ?? null);
      })
      .catch(() => setHealth("error"));
  }, []);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    } catch (err: any) {
      setUploadErr(err.message || "upload failed");
    } finally {
      if (input) input.value = "";
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.layouts();
        setLayouts(data.items || []);
      } catch {}
    })();
  }, []);

  // recompute phase auto-back if edits invalidate later steps
  useEffect(() => {
    if (step >= 4 && !editConfirmed) setStep(3);
    if (step >= 5 && !editorResp) setStep(4);
  }, [step, editConfirmed, editorResp]);

  // helpers
  const haveExtract = !!uploadMeta;
  const haveDeck = !!deck && (deck.slides?.length ?? 0) > 0;
  const selectionComplete = haveDeck && deck!.slides.every((s) => !!selection[s.id]);
  const haveEditor = !!editorResp;
  const haveExport = !!exportInfo;

  const phases: Phase[] = [
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
  ];

  const runOutline = async () => {
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
    await generate(body);
  };

  async function suggestLayoutsFromDeck(d: Deck) {
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
  }

  const confirmEdits = async () => {
    if (!deck) return;
    setConfirming(true);
    try {
      await suggestLayoutsFromDeck(deck);
      setEditConfirmed(true);
      setStep(4);
    } finally {
      setConfirming(false);
    }
  };

  const runRegen = async (i: number) => {
    if (!deck) return;
    setRegenIndex(i);
    try {
      await regenerate(i, {
        topic: deck.topic ?? topic,
        text: uploadMeta?.parsed?.text ?? undefined,
        slide_count: deck.slide_count ?? clamp(count, 1, 15),
      });
      // invalidate later steps
      setEditorResp(null);
      setSelection((old) => {
        const cp = { ...old };
        delete cp[deck.slides[i].id];
        return cp;
      });
      setEditConfirmed(false);
    } finally {
      setRegenIndex(null);
    }
  };

  const runBuildEditor = async () => {
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
        { idempotencyKey: idemKeyRef.current! }
      );
      setEditorResp(data);
    } catch (e: any) {
      setBuildErr(e?.message || "build failed");
    } finally {
      setBuilding(false);
    }
  };

  // inside App.tsx
  const runExport = async () => {
    if (!deck) return;
    setExporting(true);
    setExportInfo(null);
    setExportErr(null);
    try {
      const body =
        editorResp?.editor
          ? { editor: editorResp.editor, theme }
          : { slides: deck.slides, theme };

      const { data } = await api.exportDeck(body);
      setExportInfo(data);
    } catch (e: any) {
      setExportErr(e?.message || "export failed");
    } finally {
      setExporting(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };
  const slides: Deck["slides"] = deck?.slides ?? [];
  const downloadUrl = useMemo(() => {
    const p = exportInfo?.path;
    if (!p) return null;
    const name = p.split("/").pop();
    if (!name) return null;
    return `${API_BASE}/export/${encodeURIComponent(name)}`;
  }, [exportInfo?.path]);

  function moveSlide(from: number, to: number) {
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
  }
  function setImageForSlide(idx: number, url: string, alt?: string) {
    updateSlide(idx, (prev) => ({
      ...prev,
      media: url ? [{ type: "image", url, alt: alt ?? prev.title }] : [],
    }) as any);
    setEditorResp(null);
    setEditConfirmed(false);
  }
  function removeImageForSlide(idx: number) {
    updateSlide(idx, (prev) => ({ ...prev, media: [] } as any));
    setEditorResp(null);
    setEditConfirmed(false);
  }
  function generateImageForSlide(idx: number) {
    if (!deck) return;
    const s = deck.slides[idx];
    const seed = s.id || `${idx}-${Date.now()}`;
    const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/400`;
    setImageForSlide(idx, url, s.title);
  }

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
            showInlineSettings={true}
            showSettingsButton={false}
            theme={theme}
            setTheme={setTheme}
            count={count}
            setCount={(n: number) => setCount(Math.max(1, Math.min(15, n)))}
            showImages={showImages}
            setShowImages={setShowImages}
            exporting={exporting}
            exportInfo={exportInfo}
            exportErr={exportErr || error}
            onExport={runExport}
            meta={meta}
            copyToClipboard={copy}
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
              <div className="space-y-3">
                {deck?.slides.map((s) => (
                  <div key={s.id} className="border rounded-xl p-3">
                    <div className="font-medium">{s.title}</div>
                    <div className="text-sm text-gray-600">
                      {Math.max(0, s.bullets?.length || 0)} bullets •{" "}
                      {Math.max(0, s.media?.length || 0)} images
                    </div>
                    <div className="mt-2">
                      <select
                        className="border rounded px-2 py-1"
                        value={selection[s.id] || ""}
                        onChange={(e) => setSelection((x) => ({ ...x, [s.id]: e.target.value }))}
                      >
                        <option value="" disabled>
                          {layouts.length ? "Pick a layout…" : "Loading layouts…"}
                        </option>
                        {layouts.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

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
                      <span className="ml-2 text-amber-700">
                        Warnings: {editorResp.warnings.length}
                      </span>
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
          subtitle="Review the built editor doc and export a PPTX (text stub during Week 2)."
          step={5}
          currentStep={step}
        >
          <div className="rounded-xl border p-3 bg-gray-50 text-sm">
            <div className="font-medium mb-1">Editor build result</div>
            {editorResp ? (
              <>
                <div>Slides: <b>{editorResp.editor?.slides?.length ?? 0}</b></div>
                {editorResp.warnings?.length ? (
                  <div className="text-amber-700">
                    Warnings: {editorResp.warnings.length}
                  </div>
                ) : (
                  <div className="text-gray-600">No warnings</div>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer">View JSON</summary>
                  <pre className="mt-2 max-h-80 overflow-auto">
                    {JSON.stringify(editorResp, null, 2)}
                  </pre>
                </details>
              </>
            ) : (
              <div className="text-gray-600">
                No editor doc yet. Go back one step and build it.
              </div>
            )}
          </div>

          {/* Visual preview of the built editor doc */}
          {editorResp?.editor && (
            <EditorPreview
              doc={editorResp.editor}
              cols={2}
              minFontPx={12}
              showFrames={false}
              showImages={true}
              maxThumbH={220}
            />
          )}

          {/* Export controls only (no outline form here) */}
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button
              onClick={runExport}
              disabled={exporting || !editorResp?.editor}
              className={`rounded-xl px-4 py-2 text-white ${
                exporting || !editorResp?.editor
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-black hover:opacity-90"
              }`}
              title={!editorResp?.editor ? "Build the editor doc first" : "Export deck"}
            >
              {exporting ? "Exporting…" : "Export"}
            </button>

            {exportErr && <span className="text-sm text-red-600">{exportErr}</span>}

            {exportInfo && (
              <span className="text-sm text-gray-700">
                Exported <b>.{exportInfo.format}</b> •{" "}
                {Math.max(1, Math.round(exportInfo.bytes / 1024))} KB —{" "}
                <a
                  href={downloadUrl ?? "#"}
                  className="underline"
                  download
                  target="_blank"
                  rel="noreferrer"
                >
                  Download file
                </a>
              </span>
            )}
          </div>
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
