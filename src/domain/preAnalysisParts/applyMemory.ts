import type { AnalysisSession } from "../midi/preAnalysis";
import type { PreAnalysisMemoryEntry } from "../../storage/preAnalysisMemory";
import { canSplitPart, type PartSplits } from "./splitSession";
import { suggestMelodyFrom } from "./suggestLine";

export interface AppliedMemory {
  session: AnalysisSession;
  splits: PartSplits;
  /** False when the remembered settings are what the screen already has. */
  changed: boolean;
}

/**
 * 「前回の設定を使う」: the roles (and what is used) of last time, the same 「アプリに任せる」 choice.
 * A part that had a line gets the line THIS song suggests (none if nothing is suggested): the height of
 * a line belongs to the song it was drawn on. Drums and duplicates keep what they have.
 */
export function applyPreAnalysisMemory(
  session: AnalysisSession,
  splits: PartSplits,
  entry: PreAnalysisMemoryEntry,
): AppliedMemory {
  const voices = session.voices.map((voice, index) => {
    const part = entry.parts[index];
    if (!part || voice.isDrum || voice.duplicateOf !== undefined) return voice;
    const role = part.included ? part.role : "exclude";
    return { ...voice, assignedRole: role, included: role !== "exclude" };
  });
  const next: AnalysisSession = {
    ...session,
    voices,
    preset: "custom",
    voiceContributionPreset: entry.contribution,
  };
  const lines: Record<string, { melodyFrom: number }> = {};
  next.voices.forEach((voice, index) => {
    if (!entry.parts[index]?.line || !canSplitPart(voice)) return;
    const suggested = suggestMelodyFrom(next.notes.filter((note) => note.voiceId === voice.id));
    if (suggested !== undefined) lines[voice.id] = { melodyFrom: suggested };
  });
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const changed = !same(
    session.voices.map((voice) => [voice.assignedRole, voice.included]),
    voices.map((voice) => [voice.assignedRole, voice.included]),
  )
    || (session.voiceContributionPreset ?? "standard") !== entry.contribution
    || !same(splits, lines);
  return { session: next, splits: lines, changed };
}
