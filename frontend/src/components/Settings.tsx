import { useEffect, useMemo, useState } from "react";
import Modal from "./ui/Modal";

type SettingsProps = {
  open: boolean;
  onClose: () => void;
  theme: string;
  setTheme: (v: string) => void;
  count: number;
  setCount: (n: number) => void;
  showImages: boolean;
  setShowImages: (v: boolean) => void;
  apiBase: string;
};

const THEME_PRESETS = ["default", "minimal", "corporate", "dark", "gradient", "serif"] as const;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export default function Settings({
  open,
  onClose,
  theme,
  setTheme,
  count,
  setCount,
  showImages,
  setShowImages,
  apiBase,
}: SettingsProps) {
  const isCustomTheme = useMemo(
    () => !THEME_PRESETS.includes(theme as (typeof THEME_PRESETS)[number]),
    [theme]
  );
  const [themeMode, setThemeMode] = useState<"preset" | "custom">(isCustomTheme ? "custom" : "preset");
  const [preset, setPreset] = useState<string>(isCustomTheme ? THEME_PRESETS[0] : theme);
  const [customTheme, setCustomTheme] = useState<string>(isCustomTheme ? theme : "");

  // Sync external theme -> local controls when opening
  useEffect(() => {
    if (!open) return;
    const custom = !THEME_PRESETS.includes(theme as any);
    setThemeMode(custom ? "custom" : "preset");
    setPreset(custom ? THEME_PRESETS[0] : theme);
    setCustomTheme(custom ? theme : "");
  }, [open, theme]);

  if (!open) return null;

  const countHelpId = "settings-count-help";
  const themeHelpId = "settings-theme-help";
  const apiBaseHelpId = "settings-api-help";

  return (
    <Modal open={open} onClose={onClose} title="Settings" widthClass="max-w-lg">
      <div className="space-y-6">
        {/* Slide count */}
        <div>
          <label htmlFor="slide-count" className="block text-sm font-medium mb-1">Slide count</label>
          <div className="flex items-center gap-3">
            <input
              id="slide-count" type="range" min={1} max={15} value={count}
              onChange={(e) => setCount(clamp(parseInt(e.target.value || "5", 10), 1, 15))}
              className="w-full" aria-describedby={countHelpId}
            />
            <input
              type="number" min={1} max={15} inputMode="numeric" value={count}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setCount(clamp(Number.isNaN(v) ? count : v, 1, 15));
              }}
              className="w-20 rounded-xl border px-3 py-2 outline-none focus:ring"
              aria-label="Slide count input"
            />
          </div>
          <p id={countHelpId} className="mt-1 text-xs text-gray-500">
            Backend clamps to 1–15; values outside this range will be adjusted.
          </p>
        </div>

        {/* Theme picker */}
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">Export theme</label>
            <div className="text-xs text-gray-500">Sent with <code className="px-1 rounded bg-gray-100">/export</code></div>
          </div>

          <div className="mt-2 flex gap-3" role="group" aria-label="Theme mode">
            <button
              onClick={() => {
                setThemeMode("preset");
                const next = THEME_PRESETS.includes(theme as any) ? theme : THEME_PRESETS[0];
                setPreset(next); setTheme(next);
              }}
              className={`rounded-lg border px-3 py-1 text-sm ${themeMode === "preset" ? "bg-black text-white" : "hover:bg-gray-50"}`}
              aria-pressed={themeMode === "preset"} type="button"
            >
              Presets
            </button>
            <button
              onClick={() => {
                setThemeMode("custom");
                setCustomTheme(isCustomTheme ? theme : "");
                setTheme(isCustomTheme ? theme : "");
              }}
              className={`rounded-lg border px-3 py-1 text-sm ${themeMode === "custom" ? "bg-black text-white" : "hover:bg-gray-50"}`}
              aria-pressed={themeMode === "custom"} type="button"
            >
              Custom
            </button>
          </div>

          {themeMode === "preset" && (
            <div className="mt-3 flex flex-wrap gap-2" aria-describedby={themeHelpId}>
              {THEME_PRESETS.map((t) => (
                <button
                  key={t}
                  onClick={() => { setPreset(t); setTheme(t); }}
                  className={`rounded-full border px-3 py-1 text-sm capitalize ${preset === t ? "bg-black text-white" : "hover:bg-gray-50"}`}
                  title={t} type="button" aria-pressed={preset === t}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {themeMode === "custom" && (
            <div className="mt-3" aria-describedby={themeHelpId}>
              <input
                value={customTheme}
                onChange={(e) => { const v = e.target.value; setCustomTheme(v); setTheme(v.trim()); }}
                placeholder="e.g., brand-a, oceanic, sunrise"
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
                aria-label="Custom theme name"
              />
            </div>
          )}

          <p id={themeHelpId} className="mt-1 text-xs text-gray-500">
            Any string allowed—map it to styles in your exporter.
          </p>
        </div>

        {/* Images toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Show thumbnails</div>
            <div className="text-xs text-gray-500">
              Client-side toggle. Backend enrichment via <code className="px-1 rounded bg-gray-100">FEATURE_IMAGE_API</code>.
            </div>
          </div>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={showImages} onChange={(e) => setShowImages(e.target.checked)} className="h-4 w-4 accent-black" />
            <span className="text-sm">{showImages ? "On" : "Off"}</span>
          </label>
        </div>

        {/* API base (read-only) */}
        <div>
          <div className="text-sm font-medium mb-1">API base</div>
          <code className="block truncate rounded-lg bg-gray-50 px-2 py-1 text-sm border" aria-describedby={apiBaseHelpId}>
            {apiBase}
          </code>
          <p id={apiBaseHelpId} className="mt-1 text-xs text-gray-500">
            From <code className="px-1 rounded bg-gray-100">VITE_API_BASE</code> (or defaults).
          </p>
        </div>
      </div>
    </Modal>
  );
}
