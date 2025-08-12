import { useEffect, useState } from "react";
import { api, type ExportResp, API_BASE } from "./lib/api";
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
  const [topic, setTopic] = useState("AI Hackathon");
  const [count, setCount] = useLocalStorage<number>("slideCount", 5);
  const [theme, setTheme] = useLocalStorage<string>("exportTheme", "default");
  const [showImages, setShowImages] = useLocalStorage<boolean>("showImages", true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [uploadMeta, setUploadMeta] = useState<UploadResponse | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const { deck, loading, error, meta, generate, regenerate, updateSlide, clearError } = useOutline();

  const [exportInfo, setExportInfo] = useState<ExportResp | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const [regenIndex, setRegenIndex] = useState<number | null>(null);

  const displayTopic = (deck?.topic || topic || uploadMeta?.filename || "Untitled") as string;

  useEffect(() => {
    api.health().then(() => setHealth("ok")).catch(() => setHealth("error"));
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

  const runOutline = async () => {
    setExportInfo(null);
    setExportErr(null);
    clearError();
    const body: OutlineRequest = {
      topic,
      slide_count: clamp(count, 1, 15),
      text: uploadMeta?.parsed?.text ?? undefined,
    };
    await generate(body);
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
    } finally {
      setRegenIndex(null);
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
    try { await navigator.clipboard.writeText(text); } catch {}

  };

  const slides: Deck["slides"] = deck?.slides ?? [];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <HeaderBar health={health} onOpenSettings={() => setSettingsOpen(true)} />

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
        />

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
