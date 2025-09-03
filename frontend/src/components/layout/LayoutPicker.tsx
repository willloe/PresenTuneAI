import { useEffect, useMemo, useRef, useState, useId } from "react";
import { api, type LayoutItem } from "../../lib/api";
import LayoutThumb from "./LayoutThumb";
import { scoreLayoutLocal } from "./utils";
import SectionHeader from "../ui/SectionHeader";
import Button from "../ui/Button";

type Counts = { text_count: number; image_count: number };
type View = "selected" | "recommended" | "all";

type Props = {
  items: LayoutItem[];
  selectedId?: string;
  onSelect: (id: string) => void;

  counts?: Counts;
  page?: { width?: number; height?: number };
  topK?: number;
  initialView?: View;
  bringToFrontOnSelect?: boolean;
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

  // Stable ids for aria-labelledby
  const recHdrId = useId();
  const allHdrId = useId();

  // Debounced fetch of ranked order; fallback to local score
  useEffect(() => {
    let alive = true;
    const tid = setTimeout(async () => {
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
        const sorted = [...items].sort(
          (a, b) =>
            scoreLayoutLocal(a, counts.text_count, counts.image_count) -
            scoreLayoutLocal(b, counts.text_count, counts.image_count)
        );
        setOrder(sorted.map((i) => i.id));
      }
    }, 120);
    return () => {
      alive = false;
      clearTimeout(tid);
    };
  }, [items, counts.text_count, counts.image_count]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const orderedItems: LayoutItem[] = useMemo(() => {
    if (!order) return items;
    return order.map((id) => byId.get(id)).filter(Boolean) as LayoutItem[];
  }, [order, byId, items]);

  // Recommended set (topK), ensure selected (if any) is first
  const recommended = useMemo(() => {
    const top = orderedItems.slice(0, Math.min(topK, orderedItems.length));
    if (!selectedId) return top;
    const idx = top.findIndex((i) => i.id === selectedId);
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

  // Sizing (normalized)
  const largeWidth = 480; // selected card width
  const gridWidth = 240;  // grid cards

  // Keyboard navigation (roving tabindex) for grids
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(1);
  const [focusIdx, setFocusIdx] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!gridRef.current) return;
    const el = gridRef.current;
    const compute = () => {
      const w = el.clientWidth || 1;
      const minCol = 240;
      setCols(Math.max(1, Math.floor(w / minCol)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  // Reset focus list on view/data changes
  useEffect(() => {
    itemRefs.current = [];
  }, [view, orderedItems.length, recommended.length]);

  // Set initial focus idx when entering a grid view; prefer selected item if present
  useEffect(() => {
    if (view === "recommended") {
      const idx = Math.max(
        0,
        recommended.findIndex((i) => i.id === selectedId)
      );
      setFocusIdx(idx);
      // focus after DOM paints
      setTimeout(() => itemRefs.current[idx]?.focus(), 0);
    } else if (view === "all") {
      const idx = Math.max(
        0,
        orderedItems.findIndex((i) => i.id === selectedId)
      );
      setFocusIdx(idx);
      setTimeout(() => itemRefs.current[idx]?.focus(), 0);
    }
  }, [view, selectedId, recommended, orderedItems]);

  const onKeyDownItem =
    (list: LayoutItem[]) =>
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Enter", " "].includes(e.key))
        return;
      e.preventDefault();

      const last = list.length - 1;
      let next = idx;

      switch (e.key) {
        case "ArrowLeft":  next = Math.max(0, idx - 1); break;
        case "ArrowRight": next = Math.min(last, idx + 1); break;
        case "ArrowUp":    next = Math.max(0, idx - cols); break;
        case "ArrowDown":  next = Math.min(last, idx + cols); break;
        case "Home":       next = 0; break;
        case "End":        next = last; break;
        case "Enter":
        case " ":
          handleSelect(list[idx].id);
          return;
      }

      setFocusIdx(next);
      itemRefs.current[next]?.focus();
    };

  const commonThumbProps = { pageW: page.width, pageH: page.height };

  return (
    <div className="space-y-2">
      {/* Selected-only view */}
      {view === "selected" && (
        <div className="flex items-start gap-3">
          <div className="grow max-w-[520px]">
            {(() => {
              const chosen = selectedItem ?? recommended[0] ?? orderedItems[0];
              return chosen ? (
                <LayoutThumb
                  layout={chosen}
                  width={largeWidth}
                  {...commonThumbProps}
                  selected
                  onSelect={() => setView("recommended")}
                  tabIndex={0}
                />
              ) : (
                <div className="rounded-xl border p-4 text-sm text-gray-600 bg-white">
                  No layouts available yet.
                </div>
              );
            })()}
          </div>
          <div className="shrink-0 flex flex-col gap-2">
            <Button size="xs" variant="ghost" onClick={() => setView("recommended")}>
              Change…
            </Button>
            {orderedItems.length > recommended.length && (
              <Button size="xs" variant="ghost" onClick={() => setView("all")}>
                View all
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Recommended view */}
      {view === "recommended" && (
        <>
          <SectionHeader id={recHdrId} label="Recommended" />
          <Grid innerRef={gridRef} ariaLabelledBy={recHdrId}>
            {recommended.map((it, idx) => (
              <LayoutThumb
                key={it.id}
                layout={it}
                width={gridWidth}
                {...commonThumbProps}
                selected={it.id === (selectedItem?.id ?? "")}
                onSelect={() => handleSelect(it.id)}
                tabIndex={focusIdx === idx ? 0 : -1}
                onKeyDown={(e) => onKeyDownItem(recommended)(e, idx)}
                ref={(el) => { itemRefs.current[idx] = el; }}
              />
            ))}
          </Grid>
          <div className="mt-2 flex items-center gap-3">
            <Button size="xs" variant="ghost" onClick={() => setView("selected")}>
              Done
            </Button>
            {orderedItems.length > recommended.length && (
              <Button size="xs" variant="ghost" onClick={() => setView("all")}>
                Show all {orderedItems.length}
              </Button>
            )}
          </div>
        </>
      )}

      {/* All layouts */}
      {view === "all" && (
        <>
          <SectionHeader id={allHdrId} label="All layouts" />
          <Grid innerRef={gridRef} ariaLabelledBy={allHdrId}>
            {orderedItems.map((it, idx) => (
              <LayoutThumb
                key={it.id}
                layout={it}
                width={gridWidth}
                {...commonThumbProps}
                selected={it.id === (selectedItem?.id ?? "")}
                onSelect={() => handleSelect(it.id)}
                tabIndex={focusIdx === idx ? 0 : -1}
                onKeyDown={(e) => onKeyDownItem(orderedItems)(e, idx)}
                ref={(el) => { itemRefs.current[idx] = el; }}
              />
            ))}
          </Grid>
          <div className="mt-2">
            <Button size="xs" variant="ghost" onClick={() => setView("recommended")}>
              Back to recommended
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Grid({
  children,
  innerRef,
  ariaLabelledBy,
}: {
  children: React.ReactNode;
  innerRef?: React.Ref<HTMLDivElement>;
  ariaLabelledBy: string;
}) {
  return (
    <div
      ref={innerRef as any}
      role="radiogroup"
      aria-labelledby={ariaLabelledBy}
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
    >
      {children}
    </div>
  );
}
