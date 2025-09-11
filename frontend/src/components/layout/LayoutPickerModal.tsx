import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { LayoutItem } from "../../lib/api";
import LayoutPicker from "./LayoutPicker";
import Button from "../ui/Button";

type Counts = { text_count: number; image_count: number };

type Props = {
  open: boolean;
  onClose: () => void;

  items: LayoutItem[];
  selectedId: string;
  counts: Counts;
  page?: { width?: number; height?: number };
  topK?: number;

  onSelect: (id: string) => void;
  onAutoFit?: () => void | Promise<void>;
  closeOnSelect?: boolean; // default true — close modal immediately on pick
};

export default function LayoutPickerModal({
  open,
  onClose,
  items,
  selectedId,
  counts,
  page = { width: 1280, height: 720 },
  topK = 12,
  onSelect,
  onAutoFit,
  closeOnSelect = true,
}: Props) {
  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const root = typeof document !== "undefined" ? document.body : null;
  if (!root) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative mx-4 w-full max-w-5xl rounded-2xl bg-white shadow-xl">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <h3 className="text-base font-semibold">Choose a layout</h3>
          <div className="ml-auto flex items-center gap-2">
            {typeof onAutoFit === "function" && (
              <Button size="sm" onClick={onAutoFit} title="Pick best-fit for this slide">
                Auto-fit
              </Button>
            )}
            <Button size="sm" onClick={onClose} title="Close">
              Close
            </Button>
          </div>
        </header>

        <div className="max-h-[80vh] overflow-y-auto p-4">
          <LayoutPicker
            items={items}
            selectedId={selectedId}
            onSelect={(id) => {
              onSelect(id);
              if (closeOnSelect) onClose();
            }}
            counts={counts}
            page={page}
            topK={topK}
            initialView="recommended"
            bringToFrontOnSelect={false}
          />
        </div>
      </div>
    </div>,
    root
  );
}
