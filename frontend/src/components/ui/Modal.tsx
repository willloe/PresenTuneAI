import { useEffect, useRef } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  widthClass?: string; // e.g. "max-w-lg" | "max-w-2xl"
  initialFocusRef?: React.RefObject<HTMLElement>;
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  widthClass = "max-w-lg",
  initialFocusRef,
}: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      initialFocusRef?.current?.focus?.() ?? closeButtonRef.current?.focus?.();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`w-full ${widthClass} rounded-2xl bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          {title ? (
            <h2 id="modal-title" className="text-lg font-medium">
              {title}
            </h2>
          ) : <span />}
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black"
            type="button"
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
