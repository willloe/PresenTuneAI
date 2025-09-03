function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function SlideCountControl({
  count,
  setCount,
}: {
  count: number;
  setCount?: (n: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">Slide count</label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={15}
          value={count}
          onChange={(e) => setCount?.(clamp(parseInt(e.target.value || "5", 10), 1, 15))}
          className="w-full"
        />
        <input
          type="number"
          min={1}
          max={15}
          value={count}
          onChange={(e) => setCount?.(clamp(parseInt(e.target.value || "5", 10), 1, 15))}
          className="w-20 rounded-xl border px-3 py-2 outline-none focus:ring"
        />
      </div>
      <p className="mt-1 text-xs text-gray-500">Backend clamps to 1–15.</p>
    </div>
  );
}
