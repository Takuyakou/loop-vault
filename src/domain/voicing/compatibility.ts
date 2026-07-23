import type { ChordSymbol, VoicingSnapshot } from "../types";
import { isValidVoicingSnapshot, normalizedChordKey } from "./normalizeVoicing";
import type { VoicingCompatibility } from "./types";

export function voicingCompatibility(
  snapshot: VoicingSnapshot,
  currentChord: ChordSymbol,
): VoicingCompatibility {
  if (!isValidVoicingSnapshot(snapshot)) return "invalid";
  return snapshot.capturedForChordKey === normalizedChordKey(currentChord)
    ? "compatible"
    : "stale";
}
