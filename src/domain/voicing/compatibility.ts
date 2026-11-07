import type { ChordSymbol, VoicingSnapshot } from "../types";
import { isValidVoicingSnapshot, normalizedChordKey } from "./normalizeVoicing";
import type { VoicingCompatibility } from "./types";
import { validateTextChordNotes } from "../textChordValidation";

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
  // App recommendations are not human-confirmed pitches after a chord edit.
  if (snapshot.source === "manual" && snapshot.extractorVersion?.startsWith("text-style-v1:")
    && (currentChord.altered || snapshot.capturedForChordKey.endsWith(":alt"))) {
    return voicingCompatibility(snapshot, currentChord) === "compatible"
      && validateTextChordNotes(currentChord, snapshot.midiNotes);
  }
  return isValidVoicingSnapshot(snapshot) && (snapshot.source === "manual" || snapshot.source === "live-played"
    || voicingCompatibility(snapshot, currentChord) === "compatible");
}
