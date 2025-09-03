import { useEffect, useMemo } from "react";
import { THEMES, type ThemeKey } from "./themes";

function setFontLinks(hrefs?: string[]) {
  // remove previous
  document.querySelectorAll('link[data-theme-font="1"]').forEach((n) => n.remove());
  if (!hrefs?.length) return;
  for (const href of hrefs) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-theme-font", "1");
    document.head.appendChild(l);
  }
}

export default function ThemeRoot({ themeKey }: { themeKey: ThemeKey | string }) {
  const key = (THEMES[themeKey as ThemeKey] ? (themeKey as ThemeKey) : "default") as ThemeKey;
  const t = useMemo(() => THEMES[key], [key]);

  useEffect(() => { setFontLinks(t.fonts.hrefs); }, [t]);

  return (
    <style>{`
      :root{
        --app-bg:${t.colors.appBg};
        --surface:${t.colors.surface};
        --text:${t.colors.text};
        --muted-text:${t.colors.mutedText};
        --border:${t.colors.border};
        --accent:${t.colors.accent};
        --accent-contrast:${t.colors.accentContrast};
        --accent-soft:${t.colors.accentSoft};

        --radius-card:${t.radius.card};
        --radius-chip:${t.radius.chip};
        --shadow-card:${t.shadow.card};
        --pad:${t.layout.padding};

        --font-heading:${t.fonts.heading};
        --font-body:${t.fonts.body};
        --font-w-h:${t.fonts.weightHeading};
        --font-w-b:${t.fonts.weightBody};
        --font-tracking:${t.fonts.letterSpacing || "normal"};

        --anim-in:${t.animation.elementIn};
        --anim-slide:${t.animation.slideTransition};
        --anim-dur:${t.animation.durationMs ?? 300}ms;
      }

      body { background: var(--app-bg); color: var(--text); }
      .themed-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-card);
        box-shadow: var(--shadow-card);
      }

      @keyframes rise { from{opacity:0; transform: translateY(6px);} to{opacity:1; transform: none;} }
      @keyframes fade { from{opacity:0;} to{opacity:1;} }
      @keyframes zoom { from{opacity:0; transform: scale(.98);} to{opacity:1; transform: none;} }

      .anim-in {
        animation-duration: var(--anim-dur);
        animation-timing-function: cubic-bezier(.2,.8,.2,1);
        animation-name: fade;
      }
      /* progressive enhancement for named animations (optional) */
      [style*="--anim-in: rise"] .anim-in { animation-name: rise; }
      [style*="--anim-in: zoom"] .anim-in { animation-name: zoom; }
    `}</style>
  );
}
