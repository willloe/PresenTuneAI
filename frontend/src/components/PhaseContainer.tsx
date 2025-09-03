import React from "react";

type Props = {
  title: string;
  subtitle?: React.ReactNode;
  step: number;
  currentStep: number;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
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
  children,
}: Props) {
  const isActive = step === currentStep;
  const isFuture = step > currentStep;

  return (
    <section
      className={`rounded-2xl bg-white shadow-sm p-6 mb-6 relative ${isFuture ? "opacity-50" : ""}`}
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

      {isActive && typeof onNext === "function" && (
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
