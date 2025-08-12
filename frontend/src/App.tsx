import { useEffect, useState } from "react";
import { api, ApiError } from "./lib/api";
import { uploadFile, type UploadResponse } from "./lib/upload";
import type { Deck } from "./types/deck";

export default function App() {
  // Health
  const [health, setHealth] = useState<"checking" | "ok" | "error">("checking");

  // Inputs
  const [topic, setTopic] = useState("AI Hackathon");
  const [count, setCount] = useState(5);
  const [theme, setTheme] = useState("default"); // <-- export theme

  // Upload
  const [uploadMeta, setUploadMeta] = useState<UploadResponse | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  // Results
  const [deck, setDeck] = useState<Deck | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [lastReqId, setLastReqId] = useState<string | null>(null);
  const [lastServerTiming, setLastServerTiming] = useState<string | null | undefined>(null);

  // Export
  type ExportResp = { path: string; format: string; theme?: string | null; bytes: number };
  const [exportInfo, setExportInfo] = useState<ExportResp | null>(null);
  const [exporting, setExporting] = useState(false);

  const displayTopic = deck?.topic || topic || (uploadMeta?.filename ?? "Untitled");
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
    setExportInfo(null); // clear any old export since input changed

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

  // Generate outline
  const runOutline = async () => {
    setErr(null);
    setDeck(null);
    setLastReqId(null);
    setLastServerTiming(null);
    setExportInfo(null); // new outline -> previous export is stale
    setGenerating(true);

    try {
      const body: { topic?: string; text?: string; slide_count?: number } = {
        topic,
        slide_count: count,
      };
      if (uploadMeta?.parsed?.text) body.text = uploadMeta.parsed.text;

      const { data, meta } = await api.outlineWithMeta(body);
      setDeck(data);
      setLastReqId(meta.requestId ?? null);
      setLastServerTiming(meta.serverTiming);
    } catch (e: any) {
      if (e instanceof ApiError) {
        setLastReqId(e.meta.requestId ?? null);
        setErr(e.message);
      } else {
        setErr(e?.message || "failed");
      }
    } finally {
      setGenerating(false);
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
    try {
      const { data } = await api.exportDeck({ slides: deck.slides, theme });
      setExportInfo(data);
    } catch (e: any) {
      setErr(e?.message || "export failed");
    } finally {
      setExporting(false);
    }
  };

  const slides = deck?.slides ?? [];

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
              disabled={generating}
              className={`rounded-xl px-4 py-2 text-white ${
                generating ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90"
              }`}
            >
              {generating ? "Generating…" : "Generate"}
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

          {err && (
            <p className="mt-3 text-sm text-red-600">
              {err}
              {lastReqId && (
                <span className="ml-2 inline-block rounded bg-red-50 text-red-700 px-2 py-0.5">
                  req: {lastReqId}
                </span>
              )}
            </p>
          )}

          {lastServerTiming && (
            <p className="mt-2 text-xs text-gray-500">server-timing: {lastServerTiming}</p>
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
                {lastReqId && (
                  <span className="ml-2 inline-block rounded bg-gray-100 text-gray-700 px-2 py-0.5">
                    req: {lastReqId}
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
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
