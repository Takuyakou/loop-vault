import { useState, type ComponentProps } from "react";
import { isBassPracticeRhythmEchoEnabled } from "../application/featureFlag";
import { BassPracticeView } from "./BassPracticeView";
import { RhythmPracticeView } from "./RhythmPracticeView";

export function BassPracticeModeView(props: ComponentProps<typeof BassPracticeView>) {
  const rhythmEnabled = isBassPracticeRhythmEchoEnabled();
  const [mode, setMode] = useState<"degree" | "rhythm">("degree");
  if (!rhythmEnabled) return <BassPracticeView {...props} />;
  return <div className="space-y-4"><div role="tablist" aria-label="Bass Practice mode" className="flex gap-2"><button role="tab" aria-selected={mode === "degree"} onClick={() => setMode("degree")}>Degree Echo</button><button role="tab" aria-selected={mode === "rhythm"} onClick={() => setMode("rhythm")}>Rhythm Echo</button></div>{mode === "degree" ? <BassPracticeView {...props} /> : <RhythmPracticeView />}</div>;
}
