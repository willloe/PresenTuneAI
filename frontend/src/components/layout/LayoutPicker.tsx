import { useEffect, useMemo, useState } from "react";
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

  counts?: Counts;                            // for recommendations
  page?: { width?: number; height?: number }; // for aspect ratio / scaling
  topK?: number;                              // size of recommended set
  initialView?: View;                         // default 'selected'
  bringToFrontOnSelect?: boolean;             // default true
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

  // Suggested widths for thumbs
  const largeWidth = 480; // main selected card
  const gridWidth = 220;  // grid items

  return (
    <div className="space-y-2">
      {/* Selected-only view */}
      {view === "selected" && (
        <div className="flex items-start gap-3">
          <div className="grow">
            {(() => {
              const chosen = selectedItem ?? recommended[0] ?? orderedItems[0];
              return chosen ? (
                <LayoutThumb
                  layout={chosen}
                  width={largeWidth}
                  pageW={page.width}
                  pageH={page.height}
                  selected
                  onSelect={() => setView("recommended")}
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
          <SectionHeader label="Recommended" />
          <Grid>
            {recommended.map((it) => (
              <LayoutThumb
                key={it.id}
                layout={it}
                width={gridWidth}
                pageW={page.width}
                pageH={page.height}
                selected={it.id === (selectedItem?.id ?? "")}
                onSelect={() => handleSelect(it.id)}
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
          <SectionHeader label="All layouts" />
          <Grid>
            {orderedItems.map((it) => (
              <LayoutThumb
                key={it.id}
                layout={it}
                width={gridWidth}
                pageW={page.width}
                pageH={page.height}
                selected={it.id === (selectedItem?.id ?? "")}
                onSelect={() => handleSelect(it.id)}
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
