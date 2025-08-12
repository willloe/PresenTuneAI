// frontend/src/App.tsx
import { useEffect, useState } from "react";
import { api, type ExportResp } from "./lib/api";
import { uploadFile, type UploadResponse } from "./lib/upload";
import type { Deck } from "./types/deck";
import { useOutline, type OutlineRequest } from "./hooks/useOutline";

export default function App() {
  // Health
  const [health, setHealth] = useState<"checking" | "ok" | "error">("checking");

  // Inputs
  const [topic, setTopic] = useState("AI Hackathon");
  const [count, setCount] = useState(5);
  const [theme, setTheme] = useState("default");

  // Upload
  const [uploadMeta, setUploadMeta] = useState<UploadResponse | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  // Outline via hook (deck, loading, errors, meta, actions)
  const { deck, loading, error, meta, generate, regenerate, clearError } = useOutline();

  // Export
  const [exportInfo, setExportInfo] = useState<ExportResp | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // Per-slide regenerate UI state
  const [regenIndex, setRegenIndex] = useState<number | null>(null);

  const displayTopic = (deck?.topic || topic || uploadMeta?.filename || "Untitled") as string;
  const pretty = (s: string) => s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  // Health check
  useEffect(() => {
    api.health().then(() => setHealth("ok")).catch(() => setHealth("error"));
  }, []);

  // Upload handler
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const f = input.files?.[0];
    if (!f) return;

    setUploadErr(null);
    setUploadMeta(null);
    setExportInfo(null);     // clear export on new input
    setExportErr(null);
    clearError();            // clear outline errors

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

  // Generate outline (uses hook)
  const runOutline = async () => {
    setExportInfo(null);
    setExportErr(null);
    clearError();

    const body: OutlineRequest = {
      topic,
      slide_count: count,
      text: uploadMeta?.parsed?.text ?? undefined,
    };

    await generate(body); // deck + meta are set by the hook
  };

  // Per-slide regenerate (uses hook)
  const runRegen = async (i: number) => {
    if (!deck) return;
    setRegenIndex(i);
    try {
      await regenerate(i, {
        topic: deck.topic ?? topic,
        text: uploadMeta?.parsed?.text ?? undefined,
        slide_count: deck.slide_count ?? count,
      });
    } finally {
      setRegenIndex(null);
    }
  };

  // Export
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {}
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

  const slides: Deck["slides"] = deck?.slides ?? [];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-semibold">PresenTuneAI</h1>
        <p className="text-sm text-gray-600">
          API:{" "}
          <span className={health === "ok" ? "text-green-600" : "text-amber-600"}>
            {health === "checking" ? "checking..." : health}
          </span>
        </p>
      </header>

      <main className="mx-auto max-w-4xl px-6">
        {/* Upload */}
        <section className="rounded-2xl bg-white shadow-sm p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Upload</h2>
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={onPick}
            className="block w-full rounded-xl border px-3 py-2"
          />
          {uploadErr && <p className="mt-2 text-sm text-red-600">{uploadErr}</p>}
          {uploadMeta && (
            <div className="mt-3 text-sm">
              <div className="font-medium">{uploadMeta.filename}</div>
              <div className="text-gray-600">
                {Math.round(uploadMeta.size / 1024)} KB • {uploadMeta.content_type} • kind:{" "}
                {uploadMeta.parsed.kind} • pages: {uploadMeta.parsed.pages}
              </div>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 border">
                {uploadMeta.parsed.text_preview}
              </pre>
            </div>
          )}
        </section>

        {/* Outline */}
        <section className="rounded-2xl bg-white shadow-sm p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Generate Outline</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="sm:col-span-2">
              <span className="block text-sm mb-1">Topic</span>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              />
            </label>
            <label>
              <span className="block text-sm mb-1">Slide count</span>
              <input
                type="number"
                min={1}
                max={15}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              />
            </label>
          </div>

          {/* Export controls (theme + buttons) */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={runOutline}
              disabled={loading}
              className={`rounded-xl px-4 py-2 text-white ${
                loading ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90"
              }`}
            >
              {loading ? "Generating…" : "Generate"}
            </button>

            {!!slides.length && (
              <>
                <label className="text-sm text-gray-700 flex items-center gap-2">
                  Theme
                  <input
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="rounded-lg border px-2 py-1"
                  />
                </label>

                <button
                  onClick={runExport}
                  disabled={exporting}
                  className={`rounded-xl px-4 py-2 border ${
                    exporting ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
                  }`}
                >
                  {exporting ? "Exporting…" : `Export (.${exportInfo?.format ?? "txt"})`}
                </button>
              </>
            )}
          </div>

          {/* Errors + meta */}
          {(error || exportErr) && (
            <p className="mt-3 text-sm text-red-600">
              {error || exportErr}
              {meta?.requestId && (
                <span className="ml-2 inline-block rounded bg-red-50 text-red-700 px-2 py-0.5">
                  req: {meta.requestId}
                </span>
              )}
            </p>
          )}

          {meta?.serverTiming && (
            <p className="mt-2 text-xs text-gray-500">server-timing: {meta.serverTiming}</p>
          )}

          {exportInfo && (
            <p className="mt-3 text-sm text-gray-700 flex items-center gap-2 flex-wrap">
              <span>
                Exported <strong>.{exportInfo.format}</strong>
                {exportInfo.theme ? ` (theme: ${exportInfo.theme})` : ""} —
                {Math.max(1, Math.round(exportInfo.bytes / 1024))} KB
              </span>
              <code className="bg-gray-50 px-2 py-0.5 rounded">{exportInfo.path}</code>
              <button
                onClick={() => copy(exportInfo.path)}
                className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
                title="Copy path"
              >
                Copy
              </button>
            </p>
          )}
        </section>

        {/* Preview */}
        {!!slides.length && (
          <section className="rounded-2xl bg-white shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium">Preview</h3>
              <div className="text-sm text-gray-600">
                {pretty(displayTopic)} • {deck?.slide_count ?? slides.length} slides
                {meta?.requestId && (
                  <span className="ml-2 inline-block rounded bg-gray-100 text-gray-700 px-2 py-0.5">
                    req: {meta.requestId}
                  </span>
                )}
              </div>
            </div>
            <ul className="space-y-3">
              {slides.map((s, i) => (
                <li key={s.id ?? i} className="border rounded-xl p-4">
                  <div className="font-semibold">{s.title}</div>
                  {!!s.bullets?.length && (
                    <ul className="list-disc ml-6">
                      {s.bullets.map((b, j) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3">
                    <button
                      onClick={() => runRegen(i)}
                      disabled={regenIndex === i}
                      className={`rounded-lg px-3 py-1 border ${
                        regenIndex === i ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
                      }`}
                      title="Regenerate this slide"
                    >
                      {regenIndex === i ? "Regenerating…" : "Regenerate"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
