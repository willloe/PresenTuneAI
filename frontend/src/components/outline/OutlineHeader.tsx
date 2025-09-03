import Button from "../ui/Button";

export default function OutlineHeader({
  title,
  showSettingsButton,
  showInlineSettings,
  onOpenSettings,
}: {
  title: string;
  showSettingsButton?: boolean;
  showInlineSettings?: boolean;
  onOpenSettings?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-medium">{title}</h2>
      {showSettingsButton && !showInlineSettings && onOpenSettings && (
        <Button onClick={onOpenSettings} size="md" title="Open settings">
          Settings
        </Button>
      )}
    </div>
  );
}
