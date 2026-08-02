import { useState, type ComponentProps } from "react";
import { isBassPracticeBasslineEchoEnabled, isBassPracticeRhythmEchoEnabled } from "../application/featureFlag";
import type { RhythmPracticeAttempt } from "../domain";
import { BassPracticeView } from "./BassPracticeView";
import { BasslinePracticeView } from "./BasslinePracticeView";
import { RhythmPracticeView } from "./RhythmPracticeView";

type BassPracticeModeViewProps = ComponentProps<typeof BassPracticeView> & { readonly onRhythmAttemptCompleted?: (attempt: RhythmPracticeAttempt) => Promise<void> };

export function BassPracticeModeView({ onRhythmAttemptCompleted, ...degreeProps }: BassPracticeModeViewProps) {
  const rhythmEnabled = isBassPracticeRhythmEchoEnabled(); const basslineEnabled = isBassPracticeBasslineEchoEnabled(); const [mode, setMode] = useState<"degree" | "rhythm" | "bassline">("degree");
  if (!rhythmEnabled && !basslineEnabled) return <BassPracticeView {...degreeProps} />;
  return <div className="space-y-4"><div role="tablist" aria-label="Bass Practice mode" className="flex gap-2"><button role="tab" aria-selected={mode === "degree"} onClick={() => setMode("degree")}>Degree Echo</button>{rhythmEnabled ? <button role="tab" aria-selected={mode === "rhythm"} onClick={() => setMode("rhythm")}>Rhythm Echo</button> : null}{basslineEnabled ? <button role="tab" aria-selected={mode === "bassline"} onClick={() => setMode("bassline")}>Bassline Echo</button> : null}</div>{mode === "degree" ? <BassPracticeView {...degreeProps} /> : mode === "rhythm" ? <RhythmPracticeView onAttemptCompleted={onRhythmAttemptCompleted} /> : <BasslinePracticeView />}</div>;
}