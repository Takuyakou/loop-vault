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

/** Human-entered pitches are authoritative even after the chord label changes.
 * Analyzer/source snapshots retain the existing identity compatibility guard.
 */
export function isUsablePracticeVoicing(snapshot: VoicingSnapshot, currentChord: ChordSymbol): boolean {
  return isValidVoicingSnapshot(snapshot) && (snapshot.source === "manual" || snapshot.source === "live-played"
    || voicingCompatibility(snapshot, currentChord) === "compatible");
}
