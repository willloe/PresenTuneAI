import { THEMES, type ThemeKey } from "./themes";

export type ThemeMeta = {
  key: ThemeKey | string;
  fonts: {
    heading: string;
    body: string;
    weightHeading: number;
    weightBody: number;
    letterSpacing?: string;
  };
  colors: {
    appBg: string;
    surface: string;
    text: string;
    mutedText: string;
    border: string;
    accent: string;
    accentContrast: string;
    accentSoft: string;
  };
  radius: { card: string; chip: string };
  shadow: { card: string };
  animation: {
    elementIn: "fade" | "rise" | "zoom" | "none";
    slideTransition: "fade" | "push" | "zoom" | "none";
    durationMs?: number;
  };
};

export function themeKeyToMeta(key: ThemeKey | string): ThemeMeta {
  const t = THEMES[(THEMES as any)[key] ? (key as ThemeKey) : "default"];
  return {
    key,
    fonts: {
      heading: t.fonts.heading,
      body: t.fonts.body,
      weightHeading: t.fonts.weightHeading,
      weightBody: t.fonts.weightBody,
      letterSpacing: t.fonts.letterSpacing,
    },
    colors: { ...t.colors },
    radius: { ...t.radius },
    shadow: { ...t.shadow },
    animation: { ...t.animation },
  };
}
