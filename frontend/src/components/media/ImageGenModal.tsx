import { useMemo, useState } from "react";
import { api, type ImageGenRequest, type ImageGenResponse } from "../../lib/api";
import { safeUUID } from "../../utils/safeUUID";
import Button from "../ui/Button";

type Props = {
  // kept for modal variant; ignored if variant="embedded"
  open: boolean;
  onClose: () => void;

  // Where to place the image after selection
  onUseImage: (url: string, slotIndex: number | "append") => void;

  slideTitle?: string;
  slotCount?: number;

  /** Render as an inline panel instead of a full-screen modal */
  variant?: "modal" | "embedded";
  /** Optional className for embedded container */
  className?: string;
};

const SIZES: ImageGenRequest["size"][] = ["1024x1024", "1024x768", "768x1024", "512x512"];
const STYLES = ["photo", "illustration", "diagram", "icon"];

export default function ImageGenModal({
  open,
  onClose,
  onUseImage,
  slideTitle,
  slotCount = 0,
  variant = "modal",
  className,
}: Props) {
  const [prompt, setPrompt] = useState(slideTitle ? `Hero image for: ${slideTitle}` : "");
  const [style, setStyle] = useState<string>("photo");
  const [size, setSize] = useState<ImageGenRequest["size"]>("1024x1024");
  const [n, setN] = useState(4);
  const [slot, setSlot] = useState<number | "append">(slotCount > 0 ? 0 : "append");

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = useMemo(() => !!prompt.trim() && n >= 1 && n <= 8, [prompt, n]);

  async function handleGenerate() {
    if (!canSubmit) return;
    setLoading(true);
    setErr(null);
    setResults([]);
    try {
      const { data } = await api.generateImages(
        { prompt: prompt.trim(), style, size, n: Math.max(1, Math.min(8, n)) },
        { idempotencyKey: safeUUID() }
      );
      const urls = (data.assets || [])
        .map((a: ImageGenResponse["assets"][number]) => a.url)
        .filter(Boolean) as string[];
      setResults(urls);
      if (!urls.length) setErr("No images returned.");
    } catch (e: any) {
      setErr(e?.message || "Failed to generate.");
    } finally {
      setLoading(false);
    }
  }

  function useThis(url: string) {
    onUseImage(url, slot);
    if (variant === "modal") onClose();
  }

  // For modal variant, respect `open`; for embedded we always render
  if (variant === "modal" && !open) return null;

  const Inner = (
    <div className={`h-full flex flex-col ${variant === "embedded" ? (className || "") : ""}`}>
      {/* Header */}
      {variant === "modal" ? (
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-medium">Generate image with AI</div>
          <Button size="xs" onClick={onClose} aria-label="Close image generator">
            Close
          </Button>
        </div>
      ) : (
        <div className="px-4 pt-2 pb-3 border-t">
          <div className="text-sm font-medium">Generate image with AI</div>
        </div>
      )}

      {/* Body */}
      <div className="px-4 pb-4 space-y-3 overflow-y-auto">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-xs block mb-1">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              placeholder="Describe the image you want…"
            />
          </div>

          <div>
            <label className="text-xs block mb-1">Style</label>
            <select
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              {STYLES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="">(none)</option>
            </select>
          </div>

          <div>
            <label className="text-xs block mb-1">Size</label>
            <select
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={size}
              onChange={(e) => setSize(e.target.value as ImageGenRequest["size"])}
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs block mb-1">Count</label>
            <input
              type="number"
              min={1}
              max={8}
              value={n}
              onChange={(e) => setN(parseInt(e.target.value || "1", 10))}
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            />
          </div>

          <div>
            <label className="text-xs block mb-1">Place into slot</label>
            <select
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={slot === "append" ? "append" : String(slot)}
              onChange={(e) => {
                const v = e.target.value;
                setSlot(v === "append" ? "append" : Math.max(0, parseInt(v, 10)));
              }}
            >
              <option value="append">Append as new</option>
              {Array.from({ length: slotCount }).map((_, i) => (
                <option key={i} value={i}>Replace slot {i + 1}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleGenerate} disabled={!canSubmit || loading}>
            {loading ? "Generating…" : "Generate"}
          </Button>
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>

        {results.length > 0 && (
          <>
            <div className="text-xs text-gray-600">Click an image to use it.</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {results.map((u, i) => (
                <button
                  key={u + i}
                  className="rounded-xl border overflow-hidden hover:ring-2 hover:ring-blue-600"
                  onClick={() => useThis(u)}
                  title="Use this image"
                >
                  <img src={u} alt={`generated-${i}`} className="w-full h-32 object-cover" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (variant === "embedded") {
    // Inline panel (no overlay)
    return <div className="h-full">{Inner}</div>;
  }

  // Full-screen modal variant
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 top-6 mx-auto w-full max-w-3xl rounded-2xl bg-white shadow-lg">
        {Inner}
      </div>
    </div>
  );
}
