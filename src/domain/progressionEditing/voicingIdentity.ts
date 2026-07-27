import type { ChordSymbol, ChordVoicingMemory } from "../types";
import { voicingCompatibility } from "../voicing";

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
    && voicingCompatibility(memory.practiceVoicingOverride, chord) === "compatible"
    ? memory.practiceVoicingOverride
    : undefined;
  if (!sourceVoicing && !practiceVoicingOverride) return undefined;
  return {
    ...(sourceVoicing ? { sourceVoicing } : {}),
    ...(practiceVoicingOverride ? { practiceVoicingOverride } : {}),
  };
}
