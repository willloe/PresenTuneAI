// src/components/GlobalErrorCatcher.tsx
import { useEffect, useRef } from "react";
import { ApiError } from "../lib/api";          // re-exported from ./errors
import { useToast } from "./ui/Toast";          // <-- adjust if your path is ./ui/Toasts

type ToastShow = (args: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  description?: string;
  timeoutMs?: number;
}) => string;

export default function GlobalErrorCatcher() {
  const { show, remove } = useToast() as { show: ToastShow; remove: (id: string) => void };

  // simple de-dupe for bursty errors
  const recentRef = useRef<Map<string, number>>(new Map());
  const offlineToastId = useRef<string | null>(null);

  function dedupe(key: string, ttlMs = 4000) {
    const now = Date.now();
    const recent = recentRef.current;
    // cleanup old
    for (const [k, t] of recent) if (now - t > ttlMs) recent.delete(k);
    if (recent.has(key)) return true;
    recent.set(key, now);
    return false;
  }

  function isAbortLike(err: any) {
    return err?.name === "AbortError" || /abort(ed)?/i.test(String(err?.message || ""));
  }

  function toastFor(reason: any) {
    // ApiError → show details
    if (reason instanceof ApiError) {
      const badge = reason.requestId ? ` • req: ${reason.requestId}` : "";
      const timing = reason.serverTiming ? ` • ${reason.serverTiming}` : "";
      const key = `api|${reason.status}|${reason.message}|${reason.requestId ?? ""}`;
      if (!dedupe(key)) {
        show({
          tone: "danger",
          title: `API ${reason.status}`,
          description: `${reason.message}${badge}${timing}`,
          timeoutMs: 7000,
        });
      }
      return;
    }

    // Abort/canceled → ignore
    if (isAbortLike(reason)) return;

    // Generic Error
    if (reason instanceof Error) {
      const key = `err|${reason.name}|${reason.message}`;
      if (!dedupe(key)) {
        show({
          tone: "danger",
          title: reason.name || "Error",
          description: reason.message || "Unexpected error",
          timeoutMs: 7000,
        });
      }
      return;
    }

    // Strings / unknowns
    const desc = typeof reason === "string" ? reason : "Unhandled runtime error";
    const key = `str|${desc}`;
    if (!dedupe(key)) {
      show({ tone: "danger", title: "Runtime error", description: desc, timeoutMs: 7000 });
    }
  }

  useEffect(() => {
    // unhandled promise rejections
    function onUnhandled(e: PromiseRejectionEvent) {
      toastFor(e.reason);
    }
    // synchronous runtime errors not caught by React
    function onWindowError(e: ErrorEvent) {
      // React error boundaries will usually catch render errors;
      // this is here for non-React errors (3rd-party scripts, etc.)
      toastFor(e.error ?? e.message);
    }
    // network offline/online
    function onOffline() {
      if (offlineToastId.current) return;
      offlineToastId.current = show({
        tone: "warning",
        title: "You’re offline",
        description: "Some actions may fail until connection is restored.",
        timeoutMs: 0, // sticky
      });
    }
    function onOnline() {
      if (offlineToastId.current) {
        remove(offlineToastId.current);
        offlineToastId.current = null;
      }
      show({ tone: "success", title: "Back online", timeoutMs: 2000 });
    }

    window.addEventListener("unhandledrejection", onUnhandled);
    window.addEventListener("error", onWindowError);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    // initialize current network state
    if (typeof navigator !== "undefined" && navigator.onLine === false) onOffline();

    return () => {
      window.removeEventListener("unhandledrejection", onUnhandled);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [show, remove]);

  return null;
}
