import type { ExportResp, ApiMeta } from "../lib/api";
import OutlineHeader from "./outline/OutlineHeader";
import TopicInput from "./outline/TopicInput";
import InlineSettings from "./outline/InlineSettings";
import ActionRow from "./outline/ActionRow";
import ExportSection from "./outline/ExportSection";

export type OutlineControlsProps = {
  // Outline controls
  topic: string;
  setTopic: (s: string) => void;
  loading: boolean;
  onGenerate: () => void;

  hasSlides: boolean;

  // Export controls
  exporting: boolean;
  exportInfo: ExportResp | null;
  exportErr: string | null;
  onExport: () => void;

  meta: ApiMeta | null;
  copyToClipboard: (s: string) => Promise<void>;

  // Phase helpers
  canConfirm?: boolean;
  confirming?: boolean;
  onConfirm?: () => void;

  canBuild?: boolean;
  building?: boolean;
  onBuild?: () => void;

  // Visibility toggles
  showExport?: boolean;
  showGenerate?: boolean;

  showInlineSettings?: boolean;
  showSettingsButton?: boolean;

  // Inline settings state (only read when showInlineSettings=true)
  theme?: string;
  setTheme?: (v: string) => void;
  count?: number;
  setCount?: (n: number) => void;
  showImages?: boolean;
  setShowImages?: (v: boolean) => void;

  // Optional modal opener; hidden when inline
  onOpenSettings?: () => void;
};

export default function OutlineControls(props: OutlineControlsProps) {
  const {
    topic,
    setTopic,
    loading,
    onGenerate,
    hasSlides,
    exporting,
    exportInfo,
    exportErr,
    onExport,
    meta,
    copyToClipboard,
    canConfirm,
    confirming,
    onConfirm,
    canBuild,
    building,
    onBuild,
    showExport = true,
    showGenerate = true,
    showInlineSettings = false,
    showSettingsButton = true,
    theme = "",
    setTheme,
    count = 5,
    setCount,
    showImages = true,
    setShowImages,
    onOpenSettings,
  } = props;

  return (
    <section className="rounded-2xl bg-white shadow-sm p-6 mb-6">
      <OutlineHeader
        title={showGenerate ? "Generate Outline" : showExport ? "Export" : "Actions"}
        showSettingsButton={showSettingsButton}
        showInlineSettings={showInlineSettings}
        onOpenSettings={onOpenSettings}
      />

      {showGenerate && (
        <>
          <TopicInput topic={topic} onCommit={setTopic} />

          {showInlineSettings && (
            <InlineSettings
              count={count}
              setCount={setCount}
              theme={theme}
              setTheme={setTheme}
              showImages={showImages}
              setShowImages={setShowImages}
            />
          )}
        </>
      )}

      <ActionRow
        showGenerate={showGenerate}
        loading={loading}
        onGenerate={onGenerate}
        hasSlides={hasSlides}
        canConfirm={canConfirm}
        confirming={confirming}
        onConfirm={onConfirm}
        canBuild={canBuild}
        building={building}
        onBuild={onBuild}
        meta={meta}
      />

      {showExport && hasSlides && (
        <ExportSection
          exporting={exporting}
          exportInfo={exportInfo}
          exportErr={exportErr}
          onExport={onExport}
          meta={meta}
          copyToClipboard={copyToClipboard}
        />
      )}
    </section>
  );
}
