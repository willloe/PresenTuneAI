import { useEffect, useLayoutEffect, useRef } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  widthClass?: string; // e.g. "max-w-lg" | "max-w-2xl"
  /** Element to focus first when the modal opens */
  initialFocusRef?: React.RefObject<HTMLElement>;
};

function getTabbables(root: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "area[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "iframe",
    "audio[controls]",
    "video[controls]",
    "[contenteditable]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && el.offsetParent !== null);
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  widthClass = "max-w-lg",
  initialFocusRef,
}: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Save the element that had focus before opening, then restore on close
  useLayoutEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
  }, [open]);

  // Focus management + Escape
  useEffect(() => {
    if (!open) return;

    const t = setTimeout(() => {
      initialFocusRef?.current?.focus?.() ?? closeButtonRef.current?.focus?.();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialogRef.current) {
        // focus trap
        const tabbables = getTabbables(dialogRef.current);
        if (tabbables.length === 0) return;
        const first = tabbables[0];
        const last = tabbables[tabbables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, initialFocusRef]);

  // Scroll lock on body while modal is open (with layout shift guard)
  useEffect(() => {
    if (!open) return;
    const { overflow, paddingRight } = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      // restore focus to opener
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

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
      <div
        ref={dialogRef}
        className={`w-full ${widthClass} rounded-2xl bg-white shadow-xl`}
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          {title ? (
            <h2 id="modal-title" className="text-lg font-medium">
              {title}
            </h2>
          ) : (
            <span />
          )}
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
