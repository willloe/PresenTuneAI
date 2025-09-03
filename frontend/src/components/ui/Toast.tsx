import { createContext, useCallback, useContext, useMemo, useReducer } from "react";

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
  return Math.random().toString(36).slice(2, 10);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: [] });

  const remove = useCallback((id: string) => dispatch({ type: "remove", id }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  const show = useCallback(
    (item: Omit<ToastItem, "id">) => {
      const id = randomId();
      const timeout = item.timeoutMs ?? 4000;
      dispatch({ type: "push", item: { id, ...item } });
      if (timeout > 0) {
        setTimeout(() => remove(id), timeout);
      }
      return id;
    },
    [remove]
  );

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

  return (
    <div className="fixed bottom-4 right-4 z-[1000] flex flex-col gap-2 w-[320px] max-w-[90vw]">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl border shadow-lg p-3 ${toneClasses(t.tone)}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              {t.title ? <div className="font-medium truncate">{t.title}</div> : null}
              {t.description ? <div className="text-sm mt-0.5 whitespace-pre-wrap break-words">{t.description}</div> : null}
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
            <button onClick={clear} className="underline">clear all</button>
          </div>
        </div>
      ))}
    </div>
  );
}
