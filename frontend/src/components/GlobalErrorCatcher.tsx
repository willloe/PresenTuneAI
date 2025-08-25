import { useEffect } from "react";
import { useToast } from "./ui/Toast";

/** Catches unhandled promise rejections and surfaces as toasts. */
export default function GlobalErrorCatcher() {
  const { show } = useToast();

  useEffect(() => {
    function onRejection(e: PromiseRejectionEvent) {
      const reason = e.reason;
      const msg =
        (reason && typeof reason === "object" && "message" in reason && (reason as any).message) ||
        (typeof reason === "string" ? reason : "Unhandled promise rejection");
      show({ tone: "danger", title: "Runtime error", description: String(msg), timeoutMs: 7000 });
    }
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, [show]);

  return null;
}
