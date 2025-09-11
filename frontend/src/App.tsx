import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  API_BASE,
  type ExportResp,
  type LayoutItem,
  type EditorBuildResponse,
} from "./lib/api";
import { assetFileUrl } from "./lib/assets";
 import { ensureWebUrl } from "./lib/url";
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

/* ---------------------- helpers ---------------------- */
// Make any URL browser-loadable. If it's relative (e.g. "/uploads/..."),
// prefix it with API_BASE; if it's already absolute, leave it alone.
function toWebUrl(u: string | undefined | null): string | undefined {
  if (!u) return undefined;
  try {
    // new URL(relative, base) also normalizes absolute values
    return new URL(u, API_BASE).toString();
  } catch {
    // very defensive, but keep UI resilient
    const base = String(API_BASE || "").replace(/\/$/, "");
    const path = String(u).replace(/^\/+/, "");
    return `${base}/${path}`;
  }
}

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
  const [uploading, setUploading] = useState(false);
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

  // Media drawer target
  const [openLibTarget, setOpenLibTarget] = useState<{ slide: number; slot: number | null } | null>(null);

  // Derived
  const slides: Deck["slides"] = deck?.slides ?? [];
  const currentSlide = openLibTarget ? slides[openLibTarget.slide] : null;

  // Toasts
  const { show } = useToast();

  // Slot-aware plan util
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
  const layoutRRRef = useRef<Record<string, number>>({});

  const {
    step,
    phases,
    canNext,
    next,
    setStep,
  } = usePhases({
    editConfirmed: true,
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

  // Cleanup
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
      setUploading(true);
      const meta = await uploadFile(f);
      setUploadMeta(meta);
      setTopic(meta.filename.replace(/\.[^.]+$/, ""));
      show({ tone: "success", title: "Uploaded", description: meta.filename });
    } catch (err: any) {
      const msg = err?.message || "upload failed";
      setUploadErr(msg);
      show({ tone: "danger", title: "Upload failed", description: msg });
    } finally {
      setUploading(false);
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
      upload_id: uploadMeta?.uploadId,
      topic,
      slide_count: clamp(count, 1, 15)
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

  // Suggest a best layout per slide — abortable + debounced
  const suggestLayoutsFromDeck = useCallback(async (d: Deck) => {
    const nextSel: Record<string, string> = {};

    await Promise.all(
      d.slides.map(async (s) => {
        const slideId = s.id;
        const text_count = textBlockCount(s);
        const image_count = Math.max(0, (s.media || []).length);
        const sig = `${text_count}:${image_count}`;

        try { layoutReqCtrls.current[slideId]?.abort(); } catch {}

        const ctrl = new AbortController();
        layoutReqCtrls.current[slideId] = ctrl;

        try {
          const { data } = await api.filterLayouts(
            { components: { text_count, image_count }, top_k: 8 },
            { signal: ctrl.signal, timeoutMs: 5000, retries: 1 }
          );

          if (layoutReqCtrls.current[slideId] !== ctrl) return;

          const cands = data.candidates ?? [];
          if (cands.length > 0) {
            const idx = layoutRRRef.current[sig] ?? 0;
            nextSel[slideId] = cands[idx % cands.length];
            layoutRRRef.current[sig] = idx + 1;
          } else {
            nextSel[slideId] = "AUTO";
          }
        } catch {
          if (layoutReqCtrls.current[slideId] !== ctrl) return;
          nextSel[slideId] = "AUTO";
        } finally {
          if (layoutReqCtrls.current[slideId] === ctrl) delete layoutReqCtrls.current[slideId];
        }
      })
    );

    setSelection(nextSel);
  }, [textBlockCount]);

  // Debounce the initial suggestions when a new deck arrives
  useEffect(() => {
    if (!deck?.slides?.length) return;

    const haveAny = deck.slides.some((s) => !!selection[s.id]);
    if (haveAny) return;

    if (layoutSuggestTimerRef.current) {
      clearTimeout(layoutSuggestTimerRef.current);
      layoutSuggestTimerRef.current = null;
    }

    layoutSuggestTimerRef.current = window.setTimeout(() => {
      void suggestLayoutsFromDeck(deck);
      layoutSuggestTimerRef.current = null;
    }, 150);
  }, [deck, selection, suggestLayoutsFromDeck]);

  const runBuildEditor = useCallback(async () => {
    if (!deck) return;
    setBuilding(true);
    setBuildErr(null);
    setEditorResp(null);
    try {
      const deckForBuild = sanitizeDeckForBuild(deck);
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

  useEffect(() => {
    if (editorResp && step === 3) setStep(4);
  }, [editorResp, step, setStep]);

  const normalizedReqIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const reqId = meta?.requestId;
    if (!deck || !reqId || normalizedReqIds.current.has(reqId)) return;

    deck.slides.forEach((s, si) => {
      if (!Array.isArray(s.media)) return;
      const next = s.media.map((m: any) => {
        if (m?.type === "image" && typeof m.url === "string") {
          const fixed = ensureWebUrl(m.url);
          return fixed && fixed !== m.url ? { ...m, url: fixed } : m;
        }
        return m;
      });
      if (JSON.stringify(next) !== JSON.stringify(s.media)) {
        updateSlide(si, () => ({ ...s, media: next } as any));
      }
    });

    normalizedReqIds.current.add(reqId);
  }, [deck, meta?.requestId, updateSlide]);

  const runExport = useCallback(async () => {
    if (!deck) return;
    setExporting(true);
    setExportInfo(null);
    setExportErr(null);
    try {
      const themeMeta = themeKeyToMeta((THEMES as any)[theme] ? (theme as ThemeKey) : "default");
      const cleanDeck = sanitizeDeckForBuild(deck);
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

  // Place/replace at an exact slot index
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

      const displayUrl = toWebUrl(url) || url;

      // --- update deck for backend (send asset|external) ---
      updateSlide(slideIdx, (prev) => {
        const current = Array.isArray(prev.media) ? [...prev.media] : [];
        const img: any = { type: "image", url: displayUrl, alt: alt ?? prev.title };
        if (backendSource) img.source = backendSource;
        if (slotIdx < current.length) current[slotIdx] = img;
        else current.push(img);
        return { ...prev, media: current } as any;
      });

      // --- update local plan (map to UI tags) ---
      const slideId = deck.slides[slideIdx]?.id;
      if (slideId) {
        const uiSource: UiSource =
          uiSourceOverride ?? (backendSource === "asset" ? "library" : "external");
        setSlot(slideId, slotIdx, {
          source: uiSource,
          url: displayUrl,
          alt: alt ?? deck.slides[slideIdx]?.title,
        });
      }

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
          nextLabel={uploading ? "Parsing…" : "Continue to Outline"}
          nextDisabled={uploading || !haveExtract}
          autoScroll={false}
        >
          <UploadSection uploadErr={uploadErr} uploadMeta={uploadMeta} onPick={onPick} uploading={uploading} />
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

                  if (text_count === 0 && image_count === 0) {
                    const fallback =
                      layouts?.find((l) => l.id === "title_only")?.id ||
                      layouts?.[0]?.id ||
                      "AUTO";
                    setSelection((old) => ({ ...old, [slideId]: fallback }));
                    return;
                  }

                  try { layoutReqCtrls.current[slideId]?.abort(); } catch {}
                  const ctrl = new AbortController();
                  layoutReqCtrls.current[slideId] = ctrl;

                  try {
                    const { data } = await api.filterLayouts(
                      { components: { text_count, image_count }, top_k: 1 },
                      { signal: ctrl.signal, timeoutMs: 5000, retries: 1 }
                    );
                    if (layoutReqCtrls.current[slideId] !== ctrl) return;
                    const id = data.candidates?.[0] || layouts?.[0]?.id || "AUTO";
                    setSelection((old) => ({ ...old, [slideId]: id }));
                  } catch (err: any) {
                    if (err?.name === "AbortError") return;
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
          const fixed = ensureWebUrl(url) ?? url;
          setImageForSlot(slide, idx, fixed, undefined, "external", "external");
          setOpenLibTarget(null);
        }}
        onSelectAsset={(asset: any, url, slotIndex) => {
          if (!openLibTarget) return;
          const { slide } = openLibTarget;
          const idx = slotIndex ?? openLibTarget.slot ?? Number.MAX_SAFE_INTEGER;

          const isAI = asset?.id === "__ai__"; // AI generator pseudo-asset

          const finalUrl = isAI
            ? (ensureWebUrl(url) ?? url)                                 // AI/external URLs
            : (uploadId ? assetFileUrl(uploadId, asset.id) : ensureWebUrl(url) ?? url); // library asset → API URL
          setImageForSlot(
            slide,
            idx,
            finalUrl,
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
