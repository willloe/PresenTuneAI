import { useCallback, useMemo } from "react";
import type { Phase } from "../components/PhaseBar";
import { useLocalStorage } from "./useLocalStorage";

export type UsePhasesArgs = {
  // Inputs that determine readiness / hints
  /** (legacy; ignored in new flow) */
  editConfirmed: boolean;
  haveExtract: boolean;
  uploadPages?: number | null;
  haveDeck: boolean;
  deckSlideCount?: number | null;
  /** (legacy; ignored in new flow) */
  selectionComplete: boolean;
  haveEditor: boolean; // built editor doc
  haveExport: boolean;

  // Optional persistence key & initial step
  storageKey?: string;  // default: "phaseStep"
  initialStep?: number; // default: 1
};

// 4 steps now: Upload → Outline → Workbench → Finalize
type PhaseId = 1 | 2 | 3 | 4;
const clampStep = (n: number): PhaseId => (Math.max(1, Math.min(4, Math.floor(n))) as PhaseId);

// New 4-step orchestrator
export function usePhases(args: Partial<UsePhasesArgs> = {}) {
  const {
    haveExtract = false,
    uploadPages = null,
    haveDeck = false,
    deckSlideCount = null,
    haveEditor = false,
    haveExport = false,

    storageKey = "phaseStep",
    initialStep = 1,
  } = args;

  // Persist user's requested step
  const [requested, setRequested] = useLocalStorage<number>(storageKey, initialStep);

  // Auto-back rules to ensure consistency with current app state
  const safeStep: PhaseId = useMemo(() => {
    let s = clampStep(requested || 1);
    // Can't be in Finalize without an editor doc
    if (s >= 4 && !haveEditor) s = 3;
    // Can't be in Workbench without a deck
    if (s >= 3 && !haveDeck) s = 2;
    // Can't be in Outline without an extract (optional guard)
    if (s >= 2 && !haveExtract) s = 1;
    return s;
  }, [requested, haveEditor, haveDeck, haveExtract]);

  // Guardrails for moving forward
  const canNext: boolean = useMemo(() => {
    switch (safeStep) {
      case 1: return true;           // proceed to Outline anytime
      case 2: return !!haveDeck;     // need slides to leave Outline
      case 3: return !!haveEditor;   // need a built editor doc to Finalize
      case 4: return false;          // last step
      default: return false;
    }
  }, [safeStep, haveDeck, haveEditor]);

  const canPrev = safeStep > 1;

  const next = useCallback(() => {
    if (!canNext) return false;
    setRequested(clampStep(safeStep + 1));
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canNext, safeStep]);

  const prev = useCallback(() => {
    if (!canPrev) return;
    setRequested(clampStep(safeStep - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPrev, safeStep]);

  const setStep = useCallback((n: number) => {
    setRequested(clampStep(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        title: "Editor Workbench",
        status: statusFor(3),
        hint: haveEditor ? "built" : "edit • layout • media",
      },
      {
        id: 4,
        title: "Finalize & Export",
        status: statusFor(4),
        hint: haveExport ? "exported" : haveEditor ? "built" : undefined,
      },
    ],
    [haveExtract, uploadPages, haveDeck, deckSlideCount, haveEditor, haveExport, safeStep]
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
