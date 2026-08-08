import { useEffect, useState, type ComponentProps } from "react";
import {
  isBassPracticeBasslineEchoEnabled,
  isBassPracticeDegreeEchoEnabled,
  isBassPracticeRhythmEchoEnabled,
} from "../application/featureFlag";
import type { RhythmPracticeAttempt, VaultChordContextSnapshot } from "../domain";
import { BassPracticeView } from "./BassPracticeView";
import { BasslinePracticeView } from "./BasslinePracticeView";
import { RhythmPracticeView } from "./RhythmPracticeView";

type Mode = "degree" | "rhythm" | "bassline";
type BassPracticeModeViewProps = ComponentProps<typeof BassPracticeView> & {
  readonly onRhythmAttemptCompleted?: (attempt: RhythmPracticeAttempt) => Promise<void>;
  readonly chordContextSnapshot?: VaultChordContextSnapshot;
};

/**
 * Keep enabled mode views mounted while switching tabs.  Degree Echo owns a
 * live Practice session, so unmounting it merely to reveal another mode would
 * incorrectly mark that session abandoned.
 */
export function BassPracticeModeView({ onRhythmAttemptCompleted, chordContextSnapshot, ...degreeProps }: BassPracticeModeViewProps) {
  const degreeEnabled = isBassPracticeDegreeEchoEnabled();
  const rhythmEnabled = isBassPracticeRhythmEchoEnabled();
  const basslineEnabled = isBassPracticeBasslineEchoEnabled();
  const firstEnabledMode: Mode = degreeEnabled ? "degree" : rhythmEnabled ? "rhythm" : "bassline";
  const [mode, setMode] = useState<Mode>(() => chordContextSnapshot && basslineEnabled ? "bassline" : firstEnabledMode);
  useEffect(() => { if (chordContextSnapshot && basslineEnabled) setMode("bassline"); }, [basslineEnabled, chordContextSnapshot?.signature]);

  if (!degreeEnabled && !rhythmEnabled && !basslineEnabled) return null;
  if (degreeEnabled && !rhythmEnabled && !basslineEnabled) return <BassPracticeView {...degreeProps} />;

  const tabClass = (selected: boolean) =>
    `min-h-10 rounded-[var(--lv-radius-sm)] border px-4 text-sm font-semibold transition-colors ${
      selected
        ? "border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]"
        : "border-[var(--lv-border)] bg-[var(--lv-surface)] text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)]"
    }`;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Bass Practice mode" className="flex flex-wrap gap-2">
        {degreeEnabled ? <button type="button" role="tab" aria-selected={mode === "degree"} className={tabClass(mode === "degree")} onClick={() => setMode("degree")}>Degree Echo</button> : null}
        {rhythmEnabled ? <button type="button" role="tab" aria-selected={mode === "rhythm"} className={tabClass(mode === "rhythm")} onClick={() => setMode("rhythm")}>Rhythm Echo</button> : null}
        {basslineEnabled ? <button type="button" role="tab" aria-selected={mode === "bassline"} className={tabClass(mode === "bassline")} onClick={() => setMode("bassline")}>Bassline Echo</button> : null}
      </div>
      {degreeEnabled ? <div hidden={mode !== "degree"}><BassPracticeView {...degreeProps} /></div> : null}
      {mode === "rhythm" && rhythmEnabled ? <RhythmPracticeView onAttemptCompleted={onRhythmAttemptCompleted} /> : null}
      {mode === "bassline" && basslineEnabled ? <BasslinePracticeView chordContextSnapshot={chordContextSnapshot} /> : null}
    </div>
  );
}
