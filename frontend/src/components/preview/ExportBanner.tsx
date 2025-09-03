import type { ReactNode } from "react";

type Props = {
  downloadUrl?: string | null;
  suggestedName?: string;
  children?: ReactNode; // place stats/content on the left
};

export default function ExportBanner({ downloadUrl, suggestedName, children }: Props) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-gray-900 to-gray-700 px-4 py-2 text-white">
      <div className="text-sm">{children}</div>
      {downloadUrl ? (
        <a
          href={downloadUrl}
          download={suggestedName ?? "deck.txt"}
          className="text-xs rounded-lg border px-3 py-1 bg-white/10 hover:bg-white/20"
          title="Download latest export"
        >
          Download export
        </a>
      ) : null}
    </div>
  );
}
