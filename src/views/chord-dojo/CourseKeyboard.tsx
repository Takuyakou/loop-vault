import { useEffect, useState } from "react";
import { PracticeKeyboard } from "../../components/practice/PracticeKeyboard";
import { answerKeyboardRange } from "./keyboardRange";
import type { ResultMark } from "./guidedMarks";

/** P23-49: the stage keyboard is 176px tall; a low window (760px or less) uses 132px so nothing scrolls. */
const STAGE_HEIGHT = 176;
const STAGE_HEIGHT_LOW = 132;
const LOW_WINDOW = "(max-height: 760px)";

function useStageHeight(stage: boolean): number {
  const [low, setLow] = useState(() => stage && typeof window.matchMedia === "function" && window.matchMedia(LOW_WINDOW).matches);
  useEffect(() => {
    if (!stage || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(LOW_WINDOW);
    const update = () => setLow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [stage]);
  return !stage ? 128 : low ? STAGE_HEIGHT_LOW : STAGE_HEIGHT;
}

/** The shared guide-course keyboard: a neutral monitor whose legend can be hidden for ear questions. */
export function CourseKeyboard({ guideNotes, showNames, stage = false, marks }: {
  readonly guideNotes: readonly number[];
  readonly showNames: boolean;
  readonly stage?: boolean;
  /** P23-51: after a wrong answer, the played notes and the missing tones (mock ⑤). The guide circles are not drawn then. */
  readonly marks?: ReadonlyMap<number, ResultMark> | undefined;
}) {
  const height = useStageHeight(stage);
  return <div className="gc-keyboard-body" data-stage-height={stage ? height : undefined}>
    <PracticeKeyboard
      appearance="dojo"
      hideLegend
      compactSummary
      octaveConvention="scientific"
      range={answerKeyboardRange([], false)}
      guideNotes={marks === undefined ? [...guideNotes] : []}
      allowedPitchClasses={[]}
      requiredPitchClasses={[]}
      interactionMode="neutral-monitor"
      level={guideNotes.length > 0 && marks === undefined ? 1 : 2}
      concealNoteNames={!showNames}
      dojoHeight={height}
      {...(marks === undefined ? {} : { resultMarks: marks })}
    />
  </div>;
}
