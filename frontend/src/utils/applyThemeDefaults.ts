import type { EditorDocOut } from "../lib/api";
import type { ThemeMeta } from "../theme/meta";

export function applyThemeDefaults(doc: EditorDocOut, meta: ThemeMeta): EditorDocOut {
  const next = { ...doc, slides: doc.slides.map(s => ({
    ...s,
    layers: s.layers.map(l => {
      const st = { ...(l.style || {}) };
      if (l.kind === "textbox") {
        st.fontFamily = st.fontFamily ?? meta.fonts.body;
        st.fontWeight = st.fontWeight ?? meta.fonts.weightBody;
        st.color = st.color ?? meta.colors.text;
      }
      if (l.kind === "shape") {
        st.stroke = st.stroke ?? meta.colors.border;
        st.fill = st.fill ?? meta.colors.surface;
      }
      return { ...l, style: st };
    })
  }))};
  return next;
}
