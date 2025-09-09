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

type AnySection = any;

function normalizeSectionKind(sec: AnySection): string {
  return String(sec?.kind ?? sec?.type ?? "").toLowerCase();
}

function isNonEmptySection(sec: AnySection): boolean {
  const kind = normalizeSectionKind(sec);
  if (kind === "paragraph") {
    return Boolean(String(sec?.text ?? "").trim());
  }
  if (kind === "list" || Array.isArray(sec?.bullets)) {
    const bullets = (sec?.bullets ?? []).map((b: any) => String(b ?? "").trim());
    return bullets.filter(Boolean).length > 0;
  }
  // Unknown kinds: treat as non-empty if there is any payload besides meta keys
  if (typeof sec === "object" && sec) {
    const keys = Object.keys(sec).filter((k) => !["kind", "type", "role", "id"].includes(k));
    return keys.length > 0;
  }
  return false;
}

function cleanSections(sections?: AnySection[] | null): AnySection[] {
  if (!Array.isArray(sections)) return [];
  const out = sections
    .map((sec) => {
      if (!sec) return null;
      const kind = normalizeSectionKind(sec);
      if (kind === "paragraph") {
        const text = String(sec.text ?? "").trim();
        if (!text) return null;
        return { ...sec, kind: "paragraph", text };
      }
      if (kind === "list" || Array.isArray(sec.bullets)) {
        const bullets = (sec.bullets ?? [])
          .map((b: any) => String(b ?? "").trim())
          .filter(Boolean);
        if (bullets.length === 0) return null;
        return { ...sec, kind: "list", bullets };
      }
      // passthrough unknown non-empty kinds
      return isNonEmptySection(sec) ? sec : null;
    })
    .filter(Boolean) as AnySection[];
  return out;
}

function sanitizeDeckForBuild(deck: Deck): Deck {
  return {
    ...deck,
    slides: deck.slides.map((s) => {
      const sections = cleanSections((s as any).meta?.sections);
      const meta = { ...(s as any).meta, sections };
      return { ...s, meta } as any;
    }),
  };
}

export default function App() {
  // Health + schema
  const { health, schemaVersion } = useHealth();

  // Teleport to top on first load
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch {
      window.scrollTo(0, 0);
    }
  }, []);

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

  // Abort controllers for per-slide layout queries + debounce timer for batch suggest
  const layoutReqCtrls = useRef<Record<string, AbortController>>({});
  const layoutSuggestTimerRef = useRef<number | null>(null);

  // Export
  const [exportInfo, setExportInfo] = useState<ExportResp | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // Media drawer target (slide + optional slot)
  const [openLibTarget, setOpenLibTarget] = useState<{ slide: number; slot: number | null } | null>(null);

  // Derived
  const slides: Deck["slides"] = deck?.slides ?? [];
  const currentSlide = openLibTarget ? slides[openLibTarget.slide] : null;

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

  // ---- sections-first text block count; fallback to legacy bullets as one block ----
  const textBlockCount = useCallback((s: Deck["slides"][number]) => {
    const secs = (s as any).meta?.sections;
    if (Array.isArray(secs)) return secs.filter(isNonEmptySection).length;
    const legacyBullets = Array.isArray((s as any).bullets)
      ? (s as any).bullets.map((b: any) => String(b ?? "").trim()).filter(Boolean).length
      : 0;
    return legacyBullets > 0 ? 1 : 0;
  }, []);

  // Cleanup: abort any in-flight per-slide layout requests and pending debounce on unmount
  useEffect(() => {
    return () => {
      Object.values(layoutReqCtrls.current).forEach((c) => c.abort());
      layoutReqCtrls.current = {};
      if (layoutSuggestTimerRef.current) {
        clearTimeout(layoutSuggestTimerRef.current);
        layoutSuggestTimerRef.current = null;
      }
    };
  }, []);

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

  // Suggest a best layout per slide (fallback to local filter) — abortable + debounced
  const suggestLayoutsFromDeck = useCallback(async (d: Deck) => {
    const nextSel: Record<string, string> = {};

    await Promise.all(
      d.slides.map(async (s) => {
        const slideId = s.id;
        const text_count = textBlockCount(s);
        const image_count = Math.max(0, (s.media || []).length);

        // Abort any existing per-slide request
        try { layoutReqCtrls.current[slideId]?.abort(); } catch {}

        const ctrl = new AbortController();
        layoutReqCtrls.current[slideId] = ctrl;

        try {
          const { data } = await api.filterLayouts(
            { components: { text_count, image_count }, top_k: 1 },
            { signal: ctrl.signal, timeoutMs: 5000, retries: 1 }
          );

          // Ignore if superseded
          if (layoutReqCtrls.current[slideId] !== ctrl) return;
          nextSel[slideId] = data.candidates?.[0] || layouts?.[0]?.id || "AUTO";
        } catch {
          if (layoutReqCtrls.current[slideId] !== ctrl) return;
          nextSel[slideId] = layouts?.[0]?.id || "AUTO";
        } finally {
          if (layoutReqCtrls.current[slideId] === ctrl) delete layoutReqCtrls.current[slideId];
        }
      })
    );

    setSelection(nextSel);
  }, [layouts, textBlockCount]);

  // Debounce the initial suggestions when a new deck arrives
  useEffect(() => {
    if (!deck?.slides?.length) return;

    const haveAny = deck.slides.some((s) => !!selection[s.id]);
    if (haveAny) return;

    // clear prior timer if any
    if (layoutSuggestTimerRef.current) {
      clearTimeout(layoutSuggestTimerRef.current);
      layoutSuggestTimerRef.current = null;
    }

    layoutSuggestTimerRef.current = window.setTimeout(() => {
      void suggestLayoutsFromDeck(deck);
      layoutSuggestTimerRef.current = null;
    }, 150); // short debounce to batch state bursts
  }, [deck, selection, suggestLayoutsFromDeck]);

  const runBuildEditor = useCallback(async () => {
    if (!deck) return;
    setBuilding(true);
    setBuildErr(null);
    setEditorResp(null);
    try {
      const deckForBuild = sanitizeDeckForBuild(deck); // ← sanitize sections
      const selections = deckForBuild.slides.map((s) => {
        const chosen = selection[s.id];
        return { slide_id: s.id, layout_id: chosen && chosen !== "AUTO" ? chosen : undefined };
      });
      const themeMeta = themeKeyToMeta((THEMES as any)[theme] ? (theme as ThemeKey) : "default");

      const { data } = await api.buildEditor(
        { deck: deckForBuild, selections, theme, policy: "best_fit", theme_meta: themeMeta },
        { idempotencyKey: idemKeyRef.current, timeoutMs: 25000, retries: 1 }
      );

      const built = { ...data };
      if (built.editor) {
        const safeThemeKey =
          (built.editor.theme as ThemeKey) && (THEMES as any)[built.editor.theme]
            ? (built.editor.theme as ThemeKey)
            : "default";
        const safeThemeMeta =
          built.editor.theme_meta ?? themeKeyToMeta(safeThemeKey);

        built.editor = { ...built.editor, theme_meta: safeThemeMeta };
      }

      setEditorResp(built);
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

  // Auto-advance to Step 4 when a build succeeds (editorResp appears) while on Step 3
  useEffect(() => {
    if (editorResp && step === 3) setStep(4);
  }, [editorResp, step, setStep]);

  const runExport = useCallback(async () => {
    if (!deck) return;
    setExporting(true);
    setExportInfo(null);
    setExportErr(null);
    try {
      const themeMeta = themeKeyToMeta((THEMES as any)[theme] ? (theme as ThemeKey) : "default");
      const cleanDeck = sanitizeDeckForBuild(deck); // ← sanitize sections
      const body = editorResp?.editor
        ? { editor: { ...editorResp.editor, theme_meta: editorResp.editor.theme_meta ?? themeMeta }, theme }
        : { slides: cleanDeck.slides, theme, theme_meta: themeMeta };
      const { data } = await api.exportDeck(body, { timeoutMs: 30000, retries: 1 });
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

  // Place/replace at an exact slot index (now includes 'source' metadata)
  type BackendSource = "asset" | "external";
  type UiSource = "library" | "external" | "generated" | "empty";

  const setImageForSlot = useCallback(
    (
      slideIdx: number,
      slotIdx: number,
      url: string,
      alt?: string,
      backendSource?: BackendSource,
      uiSourceOverride?: UiSource
    ) => {
      if (!deck) return;

      // --- update deck for backend (send asset|external) ---
      updateSlide(slideIdx, (prev) => {
        const current = Array.isArray(prev.media) ? [...prev.media] : [];
        const img: any = { type: "image", url, alt: alt ?? prev.title };
        if (backendSource) img.source = backendSource;
        if (slotIdx < current.length) current[slotIdx] = img;
        else current.push(img);
        return { ...prev, media: current } as any;
      });

      // --- update local plan (map to UI tags) ---
      const slideId = deck.slides[slideIdx]?.id;
      if (slideId) {
        const uiSource: UiSource =
          uiSourceOverride ??
          (backendSource === "asset" ? "library" : "external");
        setSlot(slideId, slotIdx, {
          source: uiSource,
          url,
          alt: alt ?? deck.slides[slideIdx]?.title,
        });
      }

      // any change invalidates prior built editor output
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
          hideNext
          scrollBlock="end"
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
            showExport={false}
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
          hideNext
          scrollBlock="end"
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

                  const text_count = textBlockCount(s);
                  const image_count = Math.max(0, (s.media || []).length);

                  // If slide empty: local fallback, no network
                  if (text_count === 0 && image_count === 0) {
                    const fallback =
                      layouts?.find((l) => l.id === "title_only")?.id ||
                      layouts?.[0]?.id ||
                      "AUTO";
                    setSelection((old) => ({ ...old, [slideId]: fallback }));
                    return;
                  }

                  // Abort any in-flight request for this slide
                  try { layoutReqCtrls.current[slideId]?.abort(); } catch {}
                  const ctrl = new AbortController();
                  layoutReqCtrls.current[slideId] = ctrl;

                  try {
                    const { data } = await api.filterLayouts(
                      { components: { text_count, image_count }, top_k: 1 },
                      { signal: ctrl.signal, timeoutMs: 5000, retries: 1 }
                    );
                    if (layoutReqCtrls.current[slideId] !== ctrl) return; // superseded
                    const id = data.candidates?.[0] || layouts?.[0]?.id || "AUTO";
                    setSelection((old) => ({ ...old, [slideId]: id }));
                  } catch (err: any) {
                    if (err?.name === "AbortError") return; // expected
                    const id = layouts?.[0]?.id || "AUTO";
                    setSelection((old) => ({ ...old, [slideId]: id }));
                  } finally {
                    if (layoutReqCtrls.current[slideId] === ctrl) delete layoutReqCtrls.current[slideId];
                  }
                }}
                onUpdateSlide={(idx: number, next: Deck["slides"][number]) => updateSlide(idx, () => next)}
                onOpenMediaLibrarySlot={(slideIdx: number, slotIdx: number) =>
                  setOpenLibTarget({ slide: slideIdx, slot: slotIdx })
                }
                requestId={meta?.requestId ?? null}
                exportStatus={exportInfo ? "Export ready" : undefined}
                onBuildEditor={runBuildEditor} // Build & Continue (auto-advance via useEffect)
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
          scrollBlock="end"
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
        enableAI
        slideTitle={currentSlide?.title}
        slotCount={Math.max(0, currentSlide?.media?.length ?? 0)}
        onSelect={(url) => {
          if (!openLibTarget) return;
          const { slide, slot } = openLibTarget;
          const idx = slot ?? Number.MAX_SAFE_INTEGER; // append if null
          // External URL (or extracted image URL)
          setImageForSlot(slide, idx, url, undefined, "external", "external");
          setOpenLibTarget(null);
        }}
        onSelectAsset={(asset: any, url, slotIndex) => {
          if (!openLibTarget) return;
          const { slide } = openLibTarget;
          const idx = slotIndex ?? openLibTarget.slot ?? Number.MAX_SAFE_INTEGER;

          // AI images from the in-drawer generator use id="__ai__"
          const isAI = asset?.id === "__ai__";

          // Backend: AI images are data/external → "external"
          // UI plan: tag AI as "generated", library assets as "library"
          setImageForSlot(
            slide,
            idx,
            url,
            undefined,
            isAI ? "external" : "asset",
            isAI ? "generated" : "library"
          );
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
