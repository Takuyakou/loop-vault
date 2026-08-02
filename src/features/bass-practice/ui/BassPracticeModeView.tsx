import { useState, type ComponentProps } from "react";
import {
  isBassPracticeBasslineEchoEnabled,
  isBassPracticeDegreeEchoEnabled,
  isBassPracticeRhythmEchoEnabled,
} from "../application/featureFlag";
import type { RhythmPracticeAttempt } from "../domain";
import { BassPracticeView } from "./BassPracticeView";
import { BasslinePracticeView } from "./BasslinePracticeView";
import { RhythmPracticeView } from "./RhythmPracticeView";

type Mode = "degree" | "rhythm" | "bassline";
type BassPracticeModeViewProps = ComponentProps<typeof BassPracticeView> & {
  readonly onRhythmAttemptCompleted?: (attempt: RhythmPracticeAttempt) => Promise<void>;
};

/**
 * Keep enabled mode views mounted while switching tabs.  Degree Echo owns a
 * live Practice session, so unmounting it merely to reveal another mode would
 * incorrectly mark that session abandoned.
 */
export function BassPracticeModeView({ onRhythmAttemptCompleted, ...degreeProps }: BassPracticeModeViewProps) {
  const degreeEnabled = isBassPracticeDegreeEchoEnabled();
  const rhythmEnabled = isBassPracticeRhythmEchoEnabled();
  const basslineEnabled = isBassPracticeBasslineEchoEnabled();
  const firstEnabledMode: Mode = degreeEnabled ? "degree" : rhythmEnabled ? "rhythm" : "bassline";
  const [mode, setMode] = useState<Mode>(firstEnabledMode);

  if (!degreeEnabled && !rhythmEnabled && !basslineEnabled) return null;
  if (degreeEnabled && !rhythmEnabled && !basslineEnabled) return <BassPracticeView {...degreeProps} />;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Bass Practice mode" className="flex gap-2">
        {degreeEnabled ? <button role="tab" aria-selected={mode === "degree"} onClick={() => setMode("degree")}>Degree Echo</button> : null}
        {rhythmEnabled ? <button role="tab" aria-selected={mode === "rhythm"} onClick={() => setMode("rhythm")}>Rhythm Echo</button> : null}
        {basslineEnabled ? <button role="tab" aria-selected={mode === "bassline"} onClick={() => setMode("bassline")}>Bassline Echo</button> : null}
      </div>
      {degreeEnabled ? <div hidden={mode !== "degree"}><BassPracticeView {...degreeProps} /></div> : null}
      {mode === "rhythm" && rhythmEnabled ? <RhythmPracticeView onAttemptCompleted={onRhythmAttemptCompleted} /> : null}
      {mode === "bassline" && basslineEnabled ? <BasslinePracticeView /> : null}
    </div>
  );
}