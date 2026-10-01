import type { ChordSymbol, ChordVoicingMemory } from "../types";
import { isUsablePracticeVoicing, voicingCompatibility } from "../voicing";

export function compatibleVoicingMemory(
  memory: ChordVoicingMemory | undefined,
  chord: ChordSymbol,
): ChordVoicingMemory | undefined {
  if (!memory) return undefined;
  const sourceVoicing = memory.sourceVoicing
    && voicingCompatibility(memory.sourceVoicing, chord) === "compatible"
    ? memory.sourceVoicing
    : undefined;
  const practiceVoicingOverride = memory.practiceVoicingOverride
    && isUsablePracticeVoicing(memory.practiceVoicingOverride, chord)
    ? memory.practiceVoicingOverride
    : undefined;
  if (!sourceVoicing && !practiceVoicingOverride && memory.playbackChoice !== "GENERATED") return undefined;
  return {
    ...(memory.playbackChoice ? { playbackChoice: memory.playbackChoice } : {}),
    ...(sourceVoicing ? { sourceVoicing } : {}),
    ...(practiceVoicingOverride ? { practiceVoicingOverride } : {}),
  };
}
