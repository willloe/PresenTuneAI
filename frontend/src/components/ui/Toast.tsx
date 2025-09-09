import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { M, scaleIn } from "./Motion";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type ToastItem = {
  id: string;
  title?: string;
  description?: string;
  tone?: ToastTone;
  timeoutMs?: number; // default 4000
};

type State = { items: ToastItem[] };
type Action =
  | { type: "push"; item: ToastItem }
  | { type: "remove"; id: string }
  | { type: "clear" };

const ToastCtx = createContext<{
  items: ToastItem[];
  show: (item: Omit<ToastItem, "id">) => string;
  remove: (id: string) => void;
  clear: () => void;
} | null>(null);

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "push":
      return { items: [action.item, ...state.items].slice(0, 6) };
    case "remove":
      return { items: state.items.filter((t) => t.id !== action.id) };
    case "clear":
      return { items: [] };
    default:
      return state;
  }
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: [] });
  const timersRef = useRef<Record<string, number>>({});

  const remove = useCallback((id: string) => dispatch({ type: "remove", id }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  const show = useCallback(
    (item: Omit<ToastItem, "id">) => {
      const id = randomId();
      const timeout = item.timeoutMs ?? 4000;
      dispatch({ type: "push", item: { id, ...item } });
      if (timeout > 0) {
        const handle = window.setTimeout(() => {
          remove(id);
          delete timersRef.current[id];
        }, timeout);
        timersRef.current[id] = handle;
      }
      return id;
    },
    [remove]
  );

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((h) => window.clearTimeout(h));
      timersRef.current = {};
    };
  }, []);

  const value = useMemo(() => ({ items: state.items, show, remove, clear }), [state.items, show, remove, clear]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <ToastViewport />
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

function toneClasses(tone: ToastTone | undefined) {
  switch (tone) {
    case "success":
      return "bg-emerald-50 border-emerald-300 text-emerald-900";
    case "warning":
      return "bg-amber-50 border-amber-300 text-amber-900";
    case "danger":
      return "bg-red-50 border-red-300 text-red-900";
    default:
      return "bg-white border-gray-200 text-gray-900";
  }
}

function ToastViewport() {
  const { items, remove, clear } = useToast();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="fixed bottom-4 right-4 z-[1000] flex flex-col gap-2 w-[320px] max-w-[90vw]">
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const isHovered = hovered === t.id;
          return (
            <M.div
              key={t.id}
              variants={scaleIn}
              initial="initial"
              animate="animate"
              exit="exit"
              className={[
                "rounded-xl border shadow-lg p-3 transition",
                toneClasses(t.tone),
                isHovered ? "ring-1 ring-black/15 translate-y-[-2px]" : "",
              ].join(" ")}
              role={t.tone === "danger" || t.tone === "success" ? "alert" : "status"}
              aria-live={t.tone === "danger" ? "assertive" : "polite"}
              onMouseEnter={() => setHovered(t.id)}
              onMouseLeave={() => setHovered((id) => (id === t.id ? null : id))}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {t.title ? <div className="font-medium truncate">{t.title}</div> : null}
                  {t.description ? (
                    <div className="text-sm mt-0.5 whitespace-pre-wrap break-words">{t.description}</div>
                  ) : null}
                </div>
                <button
                  onClick={() => remove(t.id)}
                  className="text-xs rounded-md border px-2 py-1 hover:bg-black hover:text-white"
                  aria-label="Dismiss"
                  title="Dismiss"
                >
                  ×
                </button>
              </div>
              <div className="mt-2 text-[11px] text-gray-500">
                <button onClick={clear} className="underline">
                  clear all
                </button>
              </div>
            </M.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
