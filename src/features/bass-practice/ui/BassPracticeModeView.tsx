import { useState, type ComponentProps } from "react";
import { isBassPracticeRhythmEchoEnabled } from "../application/featureFlag";
import type { RhythmPracticeAttempt } from "../domain";
import { BassPracticeView } from "./BassPracticeView";
import { RhythmPracticeView } from "./RhythmPracticeView";

type BassPracticeModeViewProps = ComponentProps<typeof BassPracticeView> & { readonly onRhythmAttemptCompleted?: (attempt: RhythmPracticeAttempt) => Promise<void> };

export function BassPracticeModeView({ onRhythmAttemptCompleted, ...degreeProps }: BassPracticeModeViewProps) {
  const rhythmEnabled = isBassPracticeRhythmEchoEnabled(); const [mode, setMode] = useState<"degree" | "rhythm">("degree");
  if (!rhythmEnabled) return <BassPracticeView {...degreeProps} />;
  return <div className="space-y-4"><div role="tablist" aria-label="Bass Practice mode" className="flex gap-2"><button role="tab" aria-selected={mode === "degree"} onClick={() => setMode("degree")}>Degree Echo</button><button role="tab" aria-selected={mode === "rhythm"} onClick={() => setMode("rhythm")}>Rhythm Echo</button></div>{mode === "degree" ? <BassPracticeView {...degreeProps} /> : <RhythmPracticeView onAttemptCompleted={onRhythmAttemptCompleted} />}</div>;
}