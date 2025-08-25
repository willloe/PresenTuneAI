import { useMemo } from "react";
import type { Phase } from "../components/PhaseBar";

export type UsePhasesArgs = {
  step: number;                // current requested step (1..5)
  editConfirmed: boolean;      // whether user confirmed edits in step 3
  haveExtract: boolean;
  uploadPages?: number | null;
  haveDeck: boolean;
  deckSlideCount?: number | null;
  selectionComplete: boolean;
  haveEditor: boolean;
  haveExport: boolean;
};

export function usePhases({
  step,
  editConfirmed,
  haveExtract,
  uploadPages,
  haveDeck,
  deckSlideCount,
  selectionComplete,
  haveEditor,
  haveExport,
}: UsePhasesArgs) {
  // Auto-back rules
  const safeStep = useMemo(() => {
    let s = step;
    if (s >= 5 && !haveEditor) s = 4;
    if (s >= 4 && !editConfirmed) s = 3;
    return s;
  }, [step, editConfirmed, haveEditor]);

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

  return { phases, safeStep };
}
