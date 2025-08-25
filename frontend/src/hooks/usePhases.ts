import { useCallback, useMemo } from "react";
import type { Phase } from "../components/PhaseBar";
import { useLocalStorage } from "./useLocalStorage";

export type UsePhasesArgs = {
  // Inputs that determine readiness / hints
  editConfirmed: boolean;      // confirms done in step 3
  haveExtract: boolean;
  uploadPages?: number | null;
  haveDeck: boolean;
  deckSlideCount?: number | null;
  selectionComplete: boolean;
  haveEditor: boolean;
  haveExport: boolean;

  // Optional persistence key & initial step
  storageKey?: string;         // default: "phaseStep"
  initialStep?: number;        // default: 1
};

type PhaseId = 1 | 2 | 3 | 4 | 5;
const clampStep = (n: number): PhaseId => (Math.max(1, Math.min(5, Math.floor(n))) as PhaseId);

export function usePhases({
  editConfirmed,
  haveExtract,
  uploadPages,
  haveDeck,
  deckSlideCount,
  selectionComplete,
  haveEditor,
  haveExport,
  storageKey = "phaseStep",
  initialStep = 1,
}: UsePhasesArgs) {
  // Persist the user's requested step
  const [requested, setRequested] = useLocalStorage<number>(storageKey, initialStep);

  // Auto-back rules to ensure consistency with the current app state
  const safeStep: PhaseId = useMemo(() => {
    let s = clampStep(requested || 1);
    if (s >= 5 && !haveEditor) s = 4;
    if (s >= 4 && !editConfirmed) s = 3;
    if (s >= 3 && !haveDeck) s = 2;
    return s;
  }, [requested, editConfirmed, haveEditor, haveDeck]);

  // Guardrails for moving forward
  const canNext: boolean = useMemo(() => {
    switch (safeStep) {
      case 1: return true;                          // can proceed to Generate
      case 2: return !!haveDeck;                    // need slides to leave Outline
      case 3: return !!haveDeck;                    // allow Confirm button; the click sets editConfirmed & advances
      case 4: return !!selectionComplete && !!haveEditor; // need layouts selected AND built editor
      default: return false;                        // step 5 has no “next”
    }
  }, [safeStep, haveDeck, selectionComplete, haveEditor]);

  const canPrev = safeStep > 1;

  const next = useCallback(() => {
    if (!canNext) return false;
    setRequested(clampStep(safeStep + 1));
    return true;
  }, [canNext, safeStep, setRequested]);

  const prev = useCallback(() => {
    if (!canPrev) return;
    setRequested(clampStep(safeStep - 1));
  }, [canPrev, safeStep, setRequested]);

  const setStep = useCallback((n: number) => {
    setRequested(clampStep(n));
  }, [setRequested]);

  // Phase bar data
  const statusFor = (id: number): Phase["status"] =>
    id < safeStep ? "done" : id === safeStep ? "active" : "upcoming";

  const phases: Phase[] = useMemo(
    () => [
      {
        id: 1,
        title: "Upload Extract",
        status: statusFor(1),
        hint: haveExtract ? `${uploadPages ?? 0} pages` : undefined,
      },
      {
        id: 2,
        title: "Outline Generate",
        status: statusFor(2),
        hint: haveDeck ? `${deckSlideCount ?? 0} slides` : undefined,
      },
      {
        id: 3,
        title: "Edit & Assign",
        status: statusFor(3),
        hint: "reorder / text / images",
      },
      {
        id: 4,
        title: "Layout Selection",
        status: statusFor(4),
        hint: selectionComplete ? "ready" : undefined,
      },
      {
        id: 5,
        title: "Finalize & Export",
        status: statusFor(5),
        hint: haveExport ? "exported" : haveEditor ? "built" : undefined,
      },
    ],
    [haveExtract, uploadPages, haveDeck, deckSlideCount, selectionComplete, haveExport, haveEditor, safeStep]
  );

  return {
    step: safeStep,
    phases,
    canNext,
    canPrev,
    next,
    prev,
    setStep,
  };
}
