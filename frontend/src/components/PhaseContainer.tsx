import React, { useEffect, useRef } from "react";

type Props = {
  title: string;
  subtitle?: React.ReactNode;
  step: number;
  currentStep: number;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  hideNext?: boolean;

  /** Auto-scroll this section into view when it becomes active (default: true) */
  autoScroll?: boolean;
  /** Where to place the section in the viewport when scrolling (default: 'start') */
  scrollBlock?: "start" | "center" | "end";
  /** Optional pixel offset to compensate for sticky headers (default: 0) */
  scrollOffset?: number;

  children: React.ReactNode;
};

export default function PhaseContainer({
  title,
  subtitle,
  step,
  currentStep,
  onNext,
  nextLabel = "Next",
  nextDisabled,
  hideNext = false,
  autoScroll = true,
  scrollBlock = "start",
  scrollOffset = 0,
  children,
}: Props) {
  const isActive = step === currentStep;
  const isFuture = step > currentStep;

  // Scroll into view when this phase becomes active
  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!autoScroll || !isActive || !rootRef.current) return;

    // Let layout settle before scrolling
    requestAnimationFrame(() => {
      rootRef.current!.scrollIntoView({
        behavior: "smooth",
        block: scrollBlock,
        inline: "nearest",
      });
      if (scrollOffset) {
        // Adjust for sticky header etc.
        setTimeout(() => {
          try {
            window.scrollBy({ top: -scrollOffset, behavior: "smooth" });
          } catch {
            window.scrollTo(0, Math.max(0, window.scrollY - scrollOffset));
          }
        }, 180);
      }
    });
  }, [autoScroll, isActive, scrollBlock, scrollOffset]);

  return (
    <section
      ref={rootRef}
      className={`rounded-2xl bg-white shadow-sm p-6 mb-6 scroll-mt-48 relative ${isFuture ? "opacity-50" : ""}`}
      aria-disabled={isFuture}
      aria-labelledby={`phase-title-${step}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="min-w-0">
          <h2 id={`phase-title-${step}`} className="text-lg font-medium truncate">
            {title}
          </h2>
          {subtitle ? <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div> : null}
        </div>
        <div
          className="text-xs rounded-full bg-gray-100 text-gray-700 px-2 py-0.5"
          aria-label={`Step ${step}${isActive ? ", active" : isFuture ? ", upcoming" : ", done"}`}
        >
          Step {step}
        </div>
      </div>

      <div className={isFuture ? "pointer-events-none select-none" : ""}>{children}</div>

      {isActive && !hideNext && typeof onNext === "function" && (
        <div className="mt-4">
          <button
            onClick={onNext}
            disabled={!!nextDisabled}
            className={`rounded-xl px-4 py-2 text-white ${
              nextDisabled ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90"
            }`}
            type="button"
          >
            {nextLabel}
          </button>
        </div>
      )}
    </section>
  );
}
