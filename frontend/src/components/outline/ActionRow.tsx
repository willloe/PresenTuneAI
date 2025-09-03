import Button from "../ui/Button";
import Tag from "../ui/Tag";
import type { ApiMeta } from "../../lib/api";

export default function ActionRow({
  showGenerate,
  loading,
  onGenerate,
  hasSlides,
  canConfirm,
  confirming,
  onConfirm,
  canBuild,
  building,
  onBuild,
  meta,
}: {
  showGenerate: boolean;
  loading: boolean;
  onGenerate: () => void;

  hasSlides: boolean;

  canConfirm?: boolean;
  confirming?: boolean;
  onConfirm?: () => void;

  canBuild?: boolean;
  building?: boolean;
  onBuild?: () => void;

  meta: ApiMeta | null;
}) {
  return (
    <div className="flex items-center gap-3 mt-4 flex-wrap">
      {showGenerate && (
        <Button onClick={onGenerate} disabled={loading} variant="solid">
          {loading ? "Generating…" : "Generate"}
        </Button>
      )}

      {hasSlides && typeof onConfirm === "function" && (
        <Button onClick={onConfirm} disabled={!!confirming || !canConfirm} variant="solid">
          {confirming ? "Confirming…" : "Confirm edits → Layouts"}
        </Button>
      )}

      {typeof onBuild === "function" && (
        <Button onClick={onBuild} disabled={!!building || !canBuild} variant="solid">
          {building ? "Building…" : "Build Editor Doc"}
        </Button>
      )}

      {meta?.serverTiming && <Tag size="sm">server-timing: {meta.serverTiming}</Tag>}
    </div>
  );
}
