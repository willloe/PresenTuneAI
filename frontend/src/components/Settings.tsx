import { useEffect, useMemo, useRef, useState } from "react";

type SettingsProps = {
  open: boolean;
  onClose: () => void;

  // Theme (string sent to /export)
  theme: string;
  setTheme: (v: string) => void;

  // Slide count (1..15)
  count: number;
  setCount: (n: number) => void;

  // Images toggle (client-side only)
  showImages: boolean;
  setShowImages: (v: boolean) => void;

  // Informational only
  apiBase: string;
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
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // If current theme is not one of presets, we’re in custom mode
  const isCustomTheme = useMemo(
    () => !THEME_PRESETS.includes(theme as (typeof THEME_PRESETS)[number]),
    [theme]
  );
  const [themeMode, setThemeMode] = useState<"preset" | "custom">(
    isCustomTheme ? "custom" : "preset"
  );
  const [preset, setPreset] = useState<string>(
    isCustomTheme ? THEME_PRESETS[0] : theme
  );
  const [customTheme, setCustomTheme] = useState<string>(isCustomTheme ? theme : "");

  // Sync external theme -> local controls when opening
  useEffect(() => {
    if (!open) return;
    const custom = !THEME_PRESETS.includes(theme as any);
    setThemeMode(custom ? "custom" : "preset");
    setPreset(custom ? THEME_PRESETS[0] : theme);
    setCustomTheme(custom ? theme : "");
  }, [open, theme]);

  // Focus & ESC
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => closeRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-lg font-medium">Settings</h2>
          <button
            ref={closeRef}
            onClick={onClose}
            className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 p-5">
          {/* Slide count */}
          <div>
            <label className="block text-sm font-medium mb-1">Slide count</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={15}
                value={count}
                onChange={(e) => setCount(clamp(parseInt(e.target.value || "5", 10), 1, 15))}
                className="w-full"
              />
              <input
                type="number"
                min={1}
                max={15}
                value={count}
                onChange={(e) => setCount(clamp(parseInt(e.target.value || "5", 10), 1, 15))}
                className="w-20 rounded-xl border px-3 py-2 outline-none focus:ring"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Backend clamps to 1–15; values outside this range will be adjusted.
            </p>
          </div>

          {/* Theme picker */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium">Export theme</label>
              <div className="text-xs text-gray-500">
                Sent with <code className="px-1 rounded bg-gray-100">/export</code>
              </div>
            </div>

            {/* Mode toggle */}
            <div className="mt-2 flex gap-3">
              <button
                onClick={() => {
                  setThemeMode("preset");
                  const next = THEME_PRESETS.includes(theme as any) ? theme : THEME_PRESETS[0];
                  setPreset(next);
                  setTheme(next);
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
                  setTheme(isCustomTheme ? theme : "");
                }}
                className={`rounded-lg border px-3 py-1 text-sm ${
                  themeMode === "custom" ? "bg-black text-white" : "hover:bg-gray-50"
                }`}
              >
                Custom
              </button>
            </div>

            {/* Preset chips */}
            {themeMode === "preset" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {THEME_PRESETS.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setPreset(t);
                      setTheme(t);
                    }}
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

            {/* Custom input */}
            {themeMode === "custom" && (
              <div className="mt-3">
                <input
                  value={customTheme}
                  onChange={(e) => {
                    setCustomTheme(e.target.value);
                    setTheme(e.target.value.trim());
                  }}
                  placeholder="e.g., brand-a, oceanic, sunrise"
                  className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Any string allowed—map it to styles in your exporter.
                </p>
              </div>
            )}
          </div>

          {/* Images toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Show thumbnails</div>
              <div className="text-xs text-gray-500">
                Client-side toggle. Backend enrichment via{" "}
                <code className="px-1 rounded bg-gray-100">FEATURE_IMAGE_API</code>.
              </div>
            </div>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showImages}
                onChange={(e) => setShowImages(e.target.checked)}
                className="h-4 w-4 accent-black"
              />
              <span className="text-sm">{showImages ? "On" : "Off"}</span>
            </label>
          </div>

          {/* API base (read-only) */}
          <div>
            <div className="text-sm font-medium mb-1">API base</div>
            <code className="block truncate rounded-lg bg-gray-50 px-2 py-1 text-sm border">
              {apiBase}
            </code>
            <p className="mt-1 text-xs text-gray-500">
              From <code className="px-1 rounded bg-gray-100">VITE_API_BASE</code> (or defaults).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
