export default function ImagesToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium">Show thumbnails</div>
        <div className="text-xs text-gray-500">Client-side toggle; server enrichment is separate.</div>
      </div>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => onChange?.(e.target.checked)}
          className="h-4 w-4 accent-black"
        />
        <span className="text-sm">{checked ? "On" : "Off"}</span>
      </label>
    </div>
  );
}
