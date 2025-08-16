import { useMemo, useState } from "react";
import type { ExportResp, ApiMeta } from "../lib/api";
import { exportDownloadUrl } from "../lib/api";

export type OutlineControlsProps = {
  // Outline controls
  topic: string;
  setTopic: (s: string) => void;
  loading: boolean;
  onGenerate: () => void;

  hasSlides: boolean;

  // Export controls
  exporting: boolean;
  exportInfo: ExportResp | null;
  exportErr: string | null;
  onExport: () => void;

  meta: ApiMeta | null;
  copyToClipboard: (s: string) => Promise<void>;

  // Phase helpers
  canConfirm?: boolean;
  confirming?: boolean;
  onConfirm?: () => void;

  canBuild?: boolean;
  building?: boolean;
  onBuild?: () => void;

  // Visibility toggles
  showExport?: boolean;         // default true in export phase
  showGenerate?: boolean;       // default true (hide in final phase)

  showInlineSettings?: boolean;
  showSettingsButton?: boolean; // default true (ignored when inline)

  // Inline settings state (only read when showInlineSettings=true)
  theme?: string;
  setTheme?: (v: string) => void;
  count?: number;
  setCount?: (n: number) => void;
  showImages?: boolean;
  setShowImages?: (v: boolean) => void;

  // Optional modal opener; hidden when inline
  onOpenSettings?: () => void;
};

const THEME_PRESETS = [
  "default",
  "minimal",
  "corporate",
  "dark",
  "gradient",
  "serif",
] as const;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function OutlineControls(props: OutlineControlsProps) {
  const {
    topic,
    setTopic,
    loading,
    onGenerate,
    hasSlides,
    exporting,
    exportInfo,
    exportErr,
    onExport,
    meta,
    copyToClipboard,
    canConfirm,
    confirming,
    onConfirm,
    canBuild,
    building,
    onBuild,
    showExport = true,
    showGenerate = true,
    showInlineSettings = false,
    showSettingsButton = true,
    theme = "",
    setTheme,
    count = 5,
    setCount,
    showImages = true,
    setShowImages,
    onOpenSettings,
  } = props;

  const [localTopic, setLocalTopic] = useState(topic);
  const commitTopic = () => {
    if (localTopic !== topic) setTopic(localTopic);
  };

  const isCustomTheme = useMemo(
    () => !!theme && !THEME_PRESETS.includes(theme as (typeof THEME_PRESETS)[number]),
    [theme]
  );
  const [themeMode, setThemeMode] = useState<"preset" | "custom">(
    showInlineSettings && isCustomTheme ? "custom" : "preset"
  );
  const [preset, setPreset] = useState<string>(
    showInlineSettings ? (isCustomTheme ? THEME_PRESETS[0] : theme || THEME_PRESETS[0]) : THEME_PRESETS[0]
  );
  const [customTheme, setCustomTheme] = useState<string>(isCustomTheme ? theme : "");

  function applyPreset(t: string) {
    setPreset(t);
    setTheme?.(t);
    setThemeMode("preset");
  }

  return (
    <section className="rounded-2xl bg-white shadow-sm p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">
          {showGenerate ? "Generate Outline" : showExport ? "Export" : "Actions"}
        </h2>
        {showSettingsButton && !showInlineSettings && onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
            title="Open settings"
          >
            Settings
          </button>
        )}
      </div>

      {/* Topic + Inline Settings (Step 2) */}
      {showGenerate && (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="sm:col-span-3">
            <span className="block text-sm mb-1">Topic</span>
            <input
              value={localTopic}
              onChange={(e) => setLocalTopic(e.target.value)}
              onBlur={commitTopic}
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              placeholder="What’s this deck about?"
            />
          </label>

          {showInlineSettings && (
            <>
              {/* Slide count */}
              <div className="sm:col-span-3">
                <label className="block text-sm font-medium mb-1">Slide count</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={15}
                    value={count}
                    onChange={(e) => setCount?.(clamp(parseInt(e.target.value || "5", 10), 1, 15))}
                    className="w-full"
                  />
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={count}
                    onChange={(e) => setCount?.(clamp(parseInt(e.target.value || "5", 10), 1, 15))}
                    className="w-20 rounded-xl border px-3 py-2 outline-none focus:ring"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">Backend clamps to 1–15.</p>
              </div>

              {/* Theme */}
              <div className="sm:col-span-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium">Export theme</label>
                  <div className="text-xs text-gray-500">
                    Sent with <code className="px-1 rounded bg-gray-100">/export</code>
                  </div>
                </div>

                <div className="mt-2 flex gap-3">
                  <button
                    onClick={() => {
                      setThemeMode("preset");
                      applyPreset(THEME_PRESETS.includes(theme as any) ? (theme as string) : THEME_PRESETS[0]);
                    }}
                    className={`rounded-lg border px-3 py-1 text-sm ${
                      themeMode === "preset" ? "bg-black text-white" : "hover:bg-gray-50"
                    }`}
                  >
                    Presets
                  </button>
                  <button
                    onClick={() => {
                      setThemeMode("custom");
                      setCustomTheme(isCustomTheme ? theme : "");
                      setTheme?.(isCustomTheme ? theme : "");
                    }}
                    className={`rounded-lg border px-3 py-1 text-sm ${
                      themeMode === "custom" ? "bg-black text-white" : "hover:bg-gray-50"
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {themeMode === "preset" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {THEME_PRESETS.map((t) => (
                      <button
                        key={t}
                        onClick={() => applyPreset(t)}
                        className={`rounded-full border px-3 py-1 text-sm capitalize ${
                          preset === t ? "bg-black text-white" : "hover:bg-gray-50"
                        }`}
                        title={t}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}

                {themeMode === "custom" && (
                  <div className="mt-3">
                    <input
                      value={customTheme}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomTheme(v);
                        setTheme?.(v.trim());
                      }}
                      placeholder="e.g., brand-a, oceanic, sunrise"
                      className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
                    />
                    <p className="mt-1 text-xs text-gray-500">Any string allowed.</p>
                  </div>
                )}
              </div>

              {/* Images toggle */}
              <div className="sm:col-span-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Show thumbnails</div>
                  <div className="text-xs text-gray-500">Client-side toggle; server enrichment is separate.</div>
                </div>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!showImages}
                    onChange={(e) => setShowImages?.(e.target.checked)}
                    className="h-4 w-4 accent-black"
                  />
                  <span className="text-sm">{showImages ? "On" : "Off"}</span>
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-3 mt-4 flex-wrap">
        {showGenerate && (
          <button
            onClick={onGenerate}
            disabled={loading}
            className={`rounded-xl px-4 py-2 text-white ${
              loading ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90"
            }`}
          >
            {loading ? "Generating…" : "Generate"}
          </button>
        )}

        {/* Confirm edits → Layouts (Phase 3) */}
        {hasSlides && typeof onConfirm === "function" && (
          <button
            onClick={onConfirm}
            disabled={!!confirming || !canConfirm}
            className={`rounded-xl px-4 py-2 text-white ${
              !!confirming || !canConfirm ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90"
            }`}
          >
            {confirming ? "Confirming…" : "Confirm edits → Layouts"}
          </button>
        )}

        {/* Optional build (Phase 4) */}
        {typeof onBuild === "function" && (
          <button
            onClick={onBuild}
            disabled={!!building || !canBuild}
            className={`rounded-xl px-4 py-2 text-white ${
              !!building || !canBuild ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90"
            }`}
          >
            {building ? "Building…" : "Build Editor Doc"}
          </button>
        )}

        {meta?.serverTiming && (
          <span className="text-xs text-gray-500">server-timing: {meta.serverTiming}</span>
        )}
      </div>

      {/* Finalize & Export */}
      {showExport && hasSlides && (
        <div className="mt-4 space-y-3">
          <button
            onClick={onExport}
            disabled={exporting}
            className={`rounded-xl px-4 py-2 text-white ${
              exporting ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90"
            }`}
            title="Export deck"
          >
            {exporting ? "Exporting…" : "Export"}
          </button>

          {exportErr && (
            <p className="text-sm text-red-600">
              {exportErr}
              {meta?.requestId && (
                <span className="ml-2 inline-block rounded bg-red-50 text-red-700 px-2 py-0.5">req: {meta?.requestId}</span>
              )}
            </p>
          )}

          {exportInfo && (
            <p className="text-sm text-gray-700 flex items-center gap-2 flex-wrap">
              <span>
                Exported <strong>.{exportInfo.format}</strong>
                {exportInfo.theme ? ` (theme: ${exportInfo.theme})` : ""} — {Math.max(1, Math.round(exportInfo.bytes / 1024))} KB
              </span>
              <code className="bg-gray-50 px-2 py-0.5 rounded">{exportInfo.path}</code>
              <button
                onClick={() => copyToClipboard(exportInfo.path)}
                className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
                title="Copy server path"
              >
                Copy
              </button>
              <a
                href={exportDownloadUrl(exportInfo.path)}
                className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
                title="Download file"
                download
                target="_blank"
                rel="noreferrer"
              >
                Download
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
