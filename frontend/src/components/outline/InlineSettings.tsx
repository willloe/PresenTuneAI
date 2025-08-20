import SlideCountControl from "./SlideCountControl";
import ThemeSelector from "./ThemeSelector";
import ImagesToggle from "./ImagesToggle";

export default function InlineSettings({
  count,
  setCount,
  theme,
  setTheme,
  showImages,
  setShowImages,
}: {
  count: number;
  setCount?: (n: number) => void;
  theme: string;
  setTheme?: (t: string) => void;
  showImages: boolean;
  setShowImages?: (v: boolean) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="sm:col-span-3">
        <SlideCountControl count={count} setCount={setCount} />
      </div>

      <div className="sm:col-span-3">
        <ThemeSelector theme={theme} setTheme={setTheme} />
      </div>

      <div className="sm:col-span-3">
        <ImagesToggle checked={showImages} onChange={setShowImages} />
      </div>
    </div>
  );
}
