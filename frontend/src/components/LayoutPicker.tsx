import { useEffect, useMemo, useState } from "react";
import { api, type LayoutItem } from "../lib/api";

const COLORS = {
  titleBar: "#0f172a",                     // slate-900
  textBg: "rgba(251, 191, 36, 0.22)",      // amber-400 @ 22%
  textBorder: "rgba(245, 158, 11, 0.55)",  // amber-500 @ 55%
  imageBg: "rgba(59, 130, 246, 0.18)",     // blue-500 @ 18%
  imageBorder: "rgba(59, 130, 246, 0.35)", // blue-500 @ 35%
  shapeBg: "rgba(16, 185, 129, 0.20)",     // emerald-500 @ 20%
  shapeBorder: "rgba(5, 150, 105, 0.45)",  // emerald-600 @ 45%
};

/** Local fallback scoring (mirrors backend heuristic) */
function scoreLayoutLocal(item: LayoutItem, text_count: number, image_count: number) {
  const sup = (item.supports || {}) as Record<string, number | undefined>;
  const tmin = sup.text_min, tmax = sup.text_max;
  const imin = sup.images_min, imax = sup.images_max;

  const penalty = (v: number, mn?: number, mx?: number) => {
    if (typeof mn === "number" && v < mn) return (mn - v) * 2;
    if (typeof mx === "number" && v > mx) return (v - mx) * 1.5;
    return 0;
  };
  const closeness = (v: number, mn?: number, mx?: number) => {
    if (typeof mn !== "number" || typeof mx !== "number" || mx <= mn) return 0;
    const center = (mn + mx) / 2;
    const span = (mx - mn) || 1;
    return Math.abs(v - center) / span;
  };

  let p = penalty(text_count, tmin, tmax) + penalty(image_count, imin, imax);
  if (p === 0) p += (closeness(text_count, tmin, tmax) + closeness(image_count, imin, imax)) * 0.5;
  const w = (item as any).weight ? Number((item as any).weight) : 1;
  return p / Math.max(0.1, w);
}

type Counts = { text_count: number; image_count: number };

type View = "selected" | "recommended" | "all";

type Props = {
  items: LayoutItem[];
  selectedId?: string;
  onSelect: (id: string) => void;

  counts?: Counts;                       // for recommendations
  page?: { width?: number; height?: number }; // for aspect ratio
  topK?: number;                         // size of recommended set
  initialView?: View;                    // default 'selected'
  bringToFrontOnSelect?: boolean;        // default true
};

export default function LayoutPicker({
  items,
  selectedId = "",
  onSelect,
  counts = { text_count: 0, image_count: 0 },
  page = { width: 1280, height: 720 },
  topK = 6,
  initialView = "selected",
  bringToFrontOnSelect = true,
}: Props) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [view, setView] = useState<View>(initialView);

  // Ask backend for best order; fallback to local
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.filterLayouts({
          components: counts,
          top_k: Math.max(1, items.length),
        });
        if (!alive) return;
        const candidates = (data as any)?.candidates ?? [];
        const known = new Set(items.map((i) => i.id));
        const merged = [...candidates.filter((id: string) => known.has(id))];
        for (const it of items) if (!merged.includes(it.id)) merged.push(it.id);
        setOrder(merged);
      } catch {
        if (!alive) return;
        const sorted = [...items].sort((a, b) =>
          scoreLayoutLocal(a, counts.text_count, counts.image_count) -
          scoreLayoutLocal(b, counts.text_count, counts.image_count)
        );
        setOrder(sorted.map((i) => i.id));
      }
    })();
    return () => { alive = false; };
  }, [items, counts.text_count, counts.image_count]);

  // Aspect ratio from page size
  const pageW = Number(page.width ?? 1280);
  const pageH = Number(page.height ?? 720);
  const aspect = pageW > 0 && pageH > 0 ? pageW / pageH : 16 / 9;

  const byId = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);

  const orderedItems: LayoutItem[] = useMemo(() => {
    if (!order) return items;
    return order.map(id => byId.get(id)).filter(Boolean) as LayoutItem[];
  }, [order, byId, items]);

  // Recommended set (topK), but ensure the selected (if any) is first.
  const recommended = useMemo(() => {
    const top = orderedItems.slice(0, Math.min(topK, orderedItems.length));
    if (!selectedId) return top;
    const idx = top.findIndex(i => i.id === selectedId);
    if (idx <= 0) return top;
    const sel = top[idx];
    const rest = top.slice(0, idx).concat(top.slice(idx + 1));
    return [sel, ...rest];
  }, [orderedItems, topK, selectedId]);

  const selectedItem = selectedId ? byId.get(selectedId) || null : null;

  function handleSelect(id: string) {
    onSelect(id);
    if (bringToFrontOnSelect) setView("selected");
  }

  return (
    <div className="space-y-2">
      {/* Selected-only view */}
      {view === "selected" && (
        <div className="flex items-start gap-3">
          <div className="grow">
            <Card
              item={selectedItem ?? recommended[0] ?? orderedItems[0]}
              aspect={aspect}
              selected
              onClick={() => setView("recommended")}
            />
          </div>
          <div className="shrink-0 flex flex-col gap-2">
            <button
              onClick={() => setView("recommended")}
              className="text-xs underline text-gray-700"
            >
              Change…
            </button>
            {orderedItems.length > recommended.length && (
              <button
                onClick={() => setView("all")}
                className="text-xs underline text-gray-700"
              >
                View all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Recommended view */}
      {view === "recommended" && (
        <>
          <SectionHeader label="Recommended" />
          <Grid>
            {recommended.map((it) => (
              <Card
                key={it.id}
                item={it}
                aspect={aspect}
                selected={it.id === (selectedItem?.id ?? "")}
                onClick={() => handleSelect(it.id)}
              />
            ))}
          </Grid>
          <div className="mt-2 flex items-center gap-3">
            <button onClick={() => setView("selected")} className="text-xs underline text-gray-700">
              Done
            </button>
            {orderedItems.length > recommended.length && (
              <button onClick={() => setView("all")} className="text-xs underline text-gray-700">
                Show all {orderedItems.length}
              </button>
            )}
          </div>
        </>
      )}

      {/* All layouts */}
      {view === "all" && (
        <>
          <SectionHeader label="All layouts" />
          <Grid>
            {orderedItems.map((it) => (
              <Card
                key={it.id}
                item={it}
                aspect={aspect}
                selected={it.id === (selectedItem?.id ?? "")}
                onClick={() => handleSelect(it.id)}
              />
            ))}
          </Grid>
          <div className="mt-2">
            <button onClick={() => setView("recommended")} className="text-xs underline text-gray-700">
              Back to recommended
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return <div className="text-xs font-medium text-gray-600">{label}</div>;
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
    >
      {children}
    </div>
  );
}

function Card({
  item,
  aspect,
  selected,
  onClick,
}: {
  item: LayoutItem | undefined;
  aspect: number;
  selected?: boolean;
  onClick: () => void;
}) {
  if (!item) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.name}
      className={[
        "group w-full rounded-xl border bg-white shadow-sm p-2 text-left",
        "focus:outline-none focus:ring-2 focus:ring-indigo-500",
        selected ? "ring-2 ring-black border-black" : "hover:border-gray-400",
      ].join(" ")}
    >
      <Thumb item={item} aspect={aspect} />
      <div className="mt-1 text-[11px] text-gray-700 truncate flex items-center gap-2">
        {selected && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-black" aria-hidden />
        )}
        {item.name}
      </div>
    </button>
  );
}

function Thumb({ item, aspect }: { item: LayoutItem; aspect: number }) {
  const frames = (item.frames || {}) as any;
  return (
    <div
      className="relative w-full rounded-lg border border-gray-300/70 bg-white overflow-hidden"
      style={{ aspectRatio: String(aspect) }}
    >
      {/* Title stripe across the top edge */}
      <div className="absolute left-0 right-0 top-0" style={{ height: "8%", background: COLORS.titleBar, opacity: 0.95 }} />
      {/* Title frame (if present) */}
      {frames.title && <Bar frame={frames.title} color={COLORS.titleBar} insetTopPct={1.5} heightPct={7} />}

      {/* First bullets/text frame (colorized) */}
      {Array.isArray(frames.bullets) &&
        frames.bullets.slice(0, 1).map((f: any, i: number) => (
          <TextBlock key={`b${i}`} frame={f} />
        ))}

      {/* All image frames (colorized) */}
      {Array.isArray(frames.images) &&
        frames.images.map((f: any, i: number) => <ImageBlock key={`i${i}`} frame={f} />)}
    </div>
  );
}

function pctStyles(frame: any) {
  const W = 1280, H = 720; // canonical editor page size for layout authoring
  const x = (Number(frame?.x ?? 0) / W) * 100;
  const y = (Number(frame?.y ?? 0) / H) * 100;
  const w = (Number(frame?.w ?? 0) / W) * 100;
  const h = (Number(frame?.h ?? 0) / H) * 100;
  return { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` };
}

/* Text/bullets = amber */
function TextBlock({ frame }: { frame: any }) {
  return (
    <div
      className="absolute rounded-md"
      style={{
        ...pctStyles(frame),
        background: COLORS.textBg,
        border: `1px solid ${COLORS.textBorder}`,
      }}
    />
  );
}

/* Images = blue */
function ImageBlock({ frame }: { frame: any }) {
  return (
    <div
      className="absolute rounded-md"
      style={{
        ...pctStyles(frame),
        background: COLORS.imageBg,
        border: `1px solid ${COLORS.imageBorder}`,
      }}
    />
  );
}

/* Optional: generic colored bar used for the title frame */
function Bar({ frame, color = COLORS.titleBar, insetTopPct = 0, heightPct = 6 }: any) {
  const base = pctStyles(frame);
  return (
    <div
      className="absolute rounded-md"
      style={{
        left: base.left,
        top: `calc(${base.top} + ${insetTopPct}%)`,
        width: base.width,
        height: `max(${base.height}, ${heightPct}%)`,
        background: color,
        opacity: 0.95,
      }}
    />
  );
}