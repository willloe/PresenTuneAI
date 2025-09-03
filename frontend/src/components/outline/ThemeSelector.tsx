import { useMemo, useState } from "react";
import { THEME_KEYS, THEMES, type ThemeKey } from "../../theme/themes";
import Button from "../ui/Button";

export default function ThemeSelector({
  theme,
  setTheme,
}: {
  theme: string;
  setTheme?: (t: string) => void;
}) {
  const isCustom = useMemo(() => !!theme && !THEME_KEYS.includes(theme as ThemeKey), [theme]);

  const [mode, setMode] = useState<"preset" | "custom">(isCustom ? "custom" : "preset");
  const [preset, setPreset] = useState<ThemeKey>(isCustom ? THEME_KEYS[0] : ((theme || THEME_KEYS[0]) as ThemeKey));
  const [customTheme, setCustomTheme] = useState<string>(isCustom ? theme : "");

  function applyPreset(t: ThemeKey) {
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
            const next = THEME_KEYS.includes(theme as ThemeKey) ? (theme as ThemeKey) : THEME_KEYS[0];
            applyPreset(next);
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
          {THEME_KEYS.map((t) => {
            const tok = THEMES[t];
            return (
              <Button
                key={t}
                size="sm"
                variant={preset === t ? "solid" : "outline"}
                onClick={() => applyPreset(t)}
                className="capitalize flex items-center gap-2"
                title={t}
              >
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: tok.colors.accent }}
                />
                {t}
              </Button>
            );
          })}
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
