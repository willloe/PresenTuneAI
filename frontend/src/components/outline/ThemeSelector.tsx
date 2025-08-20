import { useMemo, useState } from "react";
import Button from "../ui/Button";

const THEME_PRESETS = [
  "default",
  "minimal",
  "corporate",
  "dark",
  "gradient",
  "serif",
] as const;

export default function ThemeSelector({
  theme,
  setTheme,
}: {
  theme: string;
  setTheme?: (t: string) => void;
}) {
  const isCustom = useMemo(
    () => !!theme && !THEME_PRESETS.includes(theme as (typeof THEME_PRESETS)[number]),
    [theme]
  );

  const [mode, setMode] = useState<"preset" | "custom">(isCustom ? "custom" : "preset");
  const [preset, setPreset] = useState<string>(isCustom ? THEME_PRESETS[0] : theme || THEME_PRESETS[0]);
  const [customTheme, setCustomTheme] = useState<string>(isCustom ? theme : "");

  function applyPreset(t: string) {
    setPreset(t);
    setTheme?.(t);
    setMode("preset");
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium">Export theme</label>
        <div className="text-xs text-gray-500">
          Sent with <code className="px-1 rounded bg-gray-100">/export</code>
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant={mode === "preset" ? "solid" : "outline"}
          onClick={() => {
            setMode("preset");
            applyPreset(THEME_PRESETS.includes(theme as any) ? (theme as string) : THEME_PRESETS[0]);
          }}
        >
          Presets
        </Button>
        <Button
          size="sm"
          variant={mode === "custom" ? "solid" : "outline"}
          onClick={() => {
            setMode("custom");
            setCustomTheme(isCustom ? theme : "");
            setTheme?.(isCustom ? theme : "");
          }}
        >
          Custom
        </Button>
      </div>

      {mode === "preset" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {THEME_PRESETS.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={preset === t ? "solid" : "outline"}
              onClick={() => applyPreset(t)}
              className="capitalize"
              title={t}
            >
              {t}
            </Button>
          ))}
        </div>
      )}

      {mode === "custom" && (
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
  );
}
