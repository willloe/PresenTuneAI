import { useAssets } from "../../hooks/useAssets";

type Props = {
  open: boolean;
  onClose: () => void;
  uploadId?: string | null;
  onSelect: (url: string) => void;
};

export default function MediaLibraryDrawer({ open, onClose, uploadId, onSelect }: Props) {
  const { items, loading, error, url } = useAssets(uploadId);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl p-5 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Media Library</h3>
          <button onClick={onClose} className="rounded-lg px-3 py-1 border">Close</button>
        </div>

        {loading && <div className="text-sm text-gray-500">Loading…</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="grid grid-cols-3 gap-3">
          {items.map((a) => {
            const fileUrl = url(a.id);
            return (
              <button
                key={a.id}
                title={a.filename}
                onClick={() => { onSelect(fileUrl); onClose(); }}
                className="group relative aspect-video overflow-hidden rounded-xl border hover:shadow-md"
              >
                <img src={fileUrl} alt={a.filename} className="h-full w-full object-cover" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20" />
              </button>
            );
          })}
        </div>

        {!loading && !error && items.length === 0 && (
          <div className="mt-6 text-sm text-gray-600">No images extracted for this upload yet.</div>
        )}
      </div>
    </div>
  );
}
