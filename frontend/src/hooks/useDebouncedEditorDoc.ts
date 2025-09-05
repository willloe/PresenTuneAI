import { useEffect, useMemo, useRef, useState } from "react";
import type { Deck } from "../types/deck";
import type { EditorDocOut } from "../lib/api";
import { api } from "../lib/api";
import { themeKeyToMeta } from "../theme/meta";
import { THEMES, type ThemeKey } from "../theme/themes";
import { sanitizeDeckForApi } from "../utils/textBridge";

export function useDebouncedEditorDoc({
  deck,
  selection,
  theme,
  delay = 350,
}: {
  deck: Deck | null;
  selection: Record<string, string>;
  theme: string;
  delay?: number;
}) {
  const [doc, setDoc] = useState<EditorDocOut | null>(null);
  const [busy, setBusy] = useState(false);
  const tid = useRef<number | null>(null);

  const key = useMemo(
    () =>
      JSON.stringify({
        theme,
        selection,
        slides: (deck?.slides ?? []).map((s) => ({
          id: s.id,
          title: s.title,
          media: (s.media || []).map((m) => m.url),
          sections: (s.meta as any)?.sections ?? null,
        })),
      }),
    [deck, selection, theme]
  );

  async function rebuildNow(withDeck?: Deck) {
    if (!withDeck && !deck) return;
    const working = sanitizeDeckForApi(withDeck ?? (deck as Deck)); //  ← bridge here
    const selections = working.slides.map((s) => {
      const chosen = selection[s.id];
      return { slide_id: s.id, layout_id: chosen && chosen !== "AUTO" ? chosen : undefined };
    });
    const themeMeta = themeKeyToMeta((THEMES as any)[theme] ? (theme as ThemeKey) : "default");
    const { data } = await api.buildEditor({
      deck: working,
      selections,
      theme,
      policy: "best_fit",
      theme_meta: themeMeta,
    });
    setDoc(data.editor ?? null);
  }

  useEffect(() => {
    if (!deck?.slides?.length) {
      setDoc(null);
      return;
    }
    if (tid.current) window.clearTimeout(tid.current);
    tid.current = window.setTimeout(async () => {
      try {
        setBusy(true);
        await rebuildNow();
      } finally {
        setBusy(false);
      }
    }, delay) as unknown as number;
    return () => {
      if (tid.current) window.clearTimeout(tid.current);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { doc, busy, rebuildNow };
}
