// Canonical theme keys used across the app (keeps UI in sync)
export const THEME_KEYS = ["default", "minimal", "corporate", "dark", "gradient", "serif"] as const;
export type ThemeKey = typeof THEME_KEYS[number];

export type ThemeTokens = {
  name: ThemeKey;
  fonts: {
    heading: string;
    body: string;
    weightHeading: number;
    weightBody: number;
    letterSpacing?: string;
    hrefs?: string[]; // optional font CSS links (e.g., Google Fonts)
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
  layout: { padding: string };
  animation: {
    elementIn: "fade" | "rise" | "zoom" | "none";
    slideTransition: "fade" | "push" | "zoom" | "none";
    durationMs?: number;
  };
};

const sysSans = `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"`;
const sysSerif = `ui-serif, "Iowan Old Style", "Apple Garamond", Baskerville, "Times New Roman", serif`;

export const THEMES: Record<ThemeKey, ThemeTokens> = {
  default: {
    name: "default",
    fonts: {
      heading: `"Inter", ${sysSans}`,
      body: `"Inter", ${sysSans}`,
      weightHeading: 700,
      weightBody: 400,
      hrefs: [
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap",
      ],
    },
    colors: {
      appBg: "#f8fafc",
      surface: "#ffffff",
      text: "#0f172a",
      mutedText: "#64748b",
      border: "#e5e7eb",
      accent: "#2563eb",
      accentContrast: "#ffffff",
      accentSoft: "rgba(37,99,235,0.18)",
    },
    radius: { card: "1rem", chip: "0.5rem" },
    shadow: { card: "0 1px 2px rgba(0,0,0,0.06)" },
    layout: { padding: "0.75rem" },
    animation: { elementIn: "rise", slideTransition: "fade", durationMs: 300 },
  },

  minimal: {
    name: "minimal",
    fonts: {
      heading: sysSans,
      body: sysSans,
      weightHeading: 600,
      weightBody: 400,
    },
    colors: {
      appBg: "#ffffff",
      surface: "#ffffff",
      text: "#111827",
      mutedText: "#6b7280",
      border: "#e5e7eb",
      accent: "#111827",
      accentContrast: "#ffffff",
      accentSoft: "rgba(17,24,39,0.08)",
    },
    radius: { card: "0.5rem", chip: "0.375rem" },
    shadow: { card: "0 1px 1px rgba(0,0,0,0.05)" },
    layout: { padding: "0.75rem" },
    animation: { elementIn: "fade", slideTransition: "fade", durationMs: 250 },
  },

  corporate: {
    name: "corporate",
    fonts: {
      heading: `"Segoe UI", ${sysSans}`,
      body: `"Segoe UI", ${sysSans}`,
      weightHeading: 700,
      weightBody: 400,
    },
    colors: {
      appBg: "#f5f7fb",
      surface: "#ffffff",
      text: "#0b1324",
      mutedText: "#5b6b88",
      border: "#d8e0ef",
      accent: "#1b4fd0",
      accentContrast: "#ffffff",
      accentSoft: "rgba(27,79,208,0.16)",
    },
    radius: { card: "0.75rem", chip: "0.5rem" },
    shadow: { card: "0 2px 6px rgba(22,34,65,0.06)" },
    layout: { padding: "0.75rem" },
    animation: { elementIn: "rise", slideTransition: "push", durationMs: 300 },
  },

  dark: {
    name: "dark",
    fonts: {
      heading: `"Inter", ${sysSans}`,
      body: `"Inter", ${sysSans}`,
      weightHeading: 700,
      weightBody: 400,
      hrefs: [
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap",
      ],
    },
    colors: {
      appBg: "#0b1220",
      surface: "#0f172a",
      text: "#e2e8f0",
      mutedText: "#94a3b8",
      border: "#1f2a44",
      accent: "#22d3ee",
      accentContrast: "#0f172a",
      accentSoft: "rgba(34,211,238,0.18)",
    },
    radius: { card: "1rem", chip: "0.5rem" },
    shadow: { card: "0 1px 2px rgba(0,0,0,0.35)" },
    layout: { padding: "0.75rem" },
    animation: { elementIn: "zoom", slideTransition: "fade", durationMs: 280 },
  },

  gradient: {
    name: "gradient",
    fonts: {
      heading: `"Poppins", ${sysSans}`,
      body: `"Inter", ${sysSans}`,
      weightHeading: 700,
      weightBody: 400,
      hrefs: [
        "https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Inter:wght@400;600&display=swap",
      ],
    },
    colors: {
      appBg: "#f8fafc",
      surface: "#ffffff",
      text: "#0f172a",
      mutedText: "#64748b",
      border: "#e5e7eb",
      accent: "#7c3aed",
      accentContrast: "#ffffff",
      accentSoft: "rgba(124,58,237,0.18)",
    },
    radius: { card: "1rem", chip: "0.75rem" },
    shadow: { card: "0 2px 8px rgba(124,58,237,0.12)" },
    layout: { padding: "0.75rem" },
    animation: { elementIn: "rise", slideTransition: "zoom", durationMs: 320 },
  },

  serif: {
    name: "serif",
    fonts: {
      heading: `"Merriweather", ${sysSerif}`,
      body: `"Source Serif 4", ${sysSerif}`,
      weightHeading: 700,
      weightBody: 400,
      hrefs: [
        "https://fonts.googleapis.com/css2?family=Merriweather:wght@700&family=Source+Serif+4:wght@400;600&display=swap",
      ],
    },
    colors: {
      appBg: "#fbf9f6",
      surface: "#ffffff",
      text: "#3b2f2f",
      mutedText: "#7a6a64",
      border: "#eadfce",
      accent: "#be6c2e",
      accentContrast: "#ffffff",
      accentSoft: "rgba(190,108,46,0.16)",
    },
    radius: { card: "0.75rem", chip: "0.5rem" },
    shadow: { card: "0 2px 6px rgba(70,55,40,0.1)" },
    layout: { padding: "0.75rem" },
    animation: { elementIn: "fade", slideTransition: "fade", durationMs: 260 },
  },
};
