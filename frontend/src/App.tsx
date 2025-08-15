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
import { HeaderBar, UploadSection, OutlineControls, Preview, Settings } from "./components";

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

  const { deck, loading, error, meta, generate, regenerate, updateSlide, clearError } = useOutline();

  // ───────── Week-2 additions: layouts + editor/build ─────────
  const [layouts, setLayouts] = useState<LayoutItem[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [editorResp, setEditorResp] = useState<EditorBuildResponse | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildErr, setBuildErr] = useState<string | null>(null);
  const idemKeyRef = useRef<string | null>(null);

  if (!idemKeyRef.current) {
    // single key for a given session to test idempotency HITs
    idemKeyRef.current = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/-/g, "");
  }

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
    clearError();
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

  // Load layouts (once)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.layouts();
        setLayouts(data.items || []);
      } catch {
        // non-fatal for UI; outline can still run
      }
    })();
  }, []);

  const runOutline = async () => {
    setExportInfo(null);
    setExportErr(null);
    setEditorResp(null);
    setBuildErr(null);
    clearError();
    const body: OutlineRequest = {
      topic,
      slide_count: clamp(count, 1, 15),
      text: uploadMeta?.parsed?.text ?? undefined,
    };

    // ✅ generate() returns { deck, meta }
    const { deck: newDeck } = await generate(body);

    // after outline, auto-pick layouts for each slide
    if (newDeck && newDeck.slides?.length) {
      const next: Record<string, string> = {};
      // Try filter API for each slide; fallback to first layout
      await Promise.all(
        newDeck.slides.map(async (s) => {
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
      // When a slide changes, clear prior editor/build (force re-build)
      setEditorResp(null);
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

  const runExport = async () => {
    if (!deck) return;
    setExporting(true);
    setExportInfo(null);
    setExportErr(null);
    try {
      const { data } = await api.exportDeck({ slides: deck.slides, theme });
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

  // Compute a direct download URL for the last export
  const downloadUrl = useMemo(() => {
    const p = exportInfo?.path;
    if (!p) return null;
    const name = p.split("/").pop();
    if (!name) return null;
    return `${API_BASE}/export/${encodeURIComponent(name)}`;
  }, [exportInfo?.path]);

  const layoutNameBySlide = useMemo(() => {
    const map: Record<string, string> = {};
    if (!deck) return map;
    for (const s of deck.slides) {
      const lid = selection[s.id];
      const name = layouts.find((l) => l.id === lid)?.name;
      if (lid && name) map[s.id] = name;
    }
    return map;
  }, [deck, selection, layouts]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <HeaderBar health={health} schemaVersion={schemaVersion} onOpenSettings={() => setSettingsOpen(true)} />

      <main className="mx-auto max-w-4xl px-6">
        <UploadSection uploadErr={uploadErr} uploadMeta={uploadMeta} onPick={onPick} />

        <OutlineControls
          topic={topic}
          setTopic={setTopic}
          loading={loading}
          onGenerate={runOutline}
          hasSlides={slides.length > 0}
          onOpenSettings={() => setSettingsOpen(true)}
          exporting={exporting}
          exportInfo={exportInfo}
          exportErr={exportErr || error}
          onExport={runExport}
          meta={meta}
          copyToClipboard={copy}
          canBuild={!!deck && Object.values(selection).every(Boolean)}
          building={building}
          onBuild={runBuildEditor}
        />

        {/* Week-2: Layout selection + Build Editor Doc */}
        {slides.length > 0 && (
          <section className="rounded-2xl bg-white shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Select Layouts & Build</h2>
              <div className="text-xs text-gray-500">
                Using <code>/layouts</code>, <code>/layouts/filter</code> and <code>/editor/build</code>
              </div>
            </div>

            {/* Per-slide layout picker */}
            <div className="space-y-3">
              {deck?.slides.map((s) => (
                <div key={s.id} className="border rounded-xl p-3">
                  <div className="font-medium">{s.title}</div>
                  <div className="text-sm text-gray-600">
                    {Math.max(0, s.bullets?.length || 0)} bullets • {Math.max(0, s.media?.length || 0)} images
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

            {/* Build / status */}
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={runBuildEditor}
                disabled={building || !deck || !Object.values(selection).every(Boolean)}
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
          </section>
        )}

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
          downloadUrl={downloadUrl}
          layoutNameBySlide={layoutNameBySlide}
        />
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
