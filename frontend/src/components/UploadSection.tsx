import type { UploadResponse } from "../lib/upload";

type Props = {
  uploadErr: string | null;
  uploadMeta: UploadResponse | null;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function UploadSection({ uploadErr, uploadMeta, onPick }: Props) {
  return (
    <section className="rounded-2xl bg-white shadow-sm p-6 mb-6">
      <h2 className="text-lg font-medium mb-4">Upload</h2>
      <input
        type="file"
        accept=".pdf,.docx,.txt"
        onChange={onPick}
        className="block w-full rounded-xl border px-3 py-2"
      />
      {uploadErr && <p className="mt-2 text-sm text-red-600">{uploadErr}</p>}
      {uploadMeta && (
        <div className="mt-3 text-sm">
          <div className="font-medium">{uploadMeta.filename}</div>
          <div className="text-gray-600">
            {Math.round(uploadMeta.size / 1024)} KB • {uploadMeta.content_type} • kind:{" "}
            {uploadMeta.parsed.kind} • pages: {uploadMeta.parsed.pages}
          </div>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 border">
            {uploadMeta.parsed.text_preview}
          </pre>
        </div>
      )}
    </section>
  );
}
