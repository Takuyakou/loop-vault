import type {
  NoteEvidenceDedupDiagnostics,
  NoteEvidenceDuplicateGroup,
} from "../types";
import type { TimedNote } from "./types";

export interface ExactNoteEvidenceDedupResult {
  notes: TimedNote[];
  diagnostics: NoteEvidenceDedupDiagnostics;
}

/**
 * Collapse only byte-for-byte-equivalent analysis evidence identities.
 *
 * Source, logical voice and original track provenance are part of the key.
 * Velocity is intentionally exact (delta zero): a velocity layer is evidence,
 * not a duplicate. The input notes and their provenance are never mutated.
 */
export function deduplicateExactNoteEvidence(
  notes: readonly TimedNote[],
  fallbackSourceIdentity = "single-source",
): ExactNoteEvidenceDedupResult {
  const entries = notes.map((note, originalIndex) => ({
    note,
    originalIndex,
    identity: evidenceIdentity(note, fallbackSourceIdentity),
  })).sort(compareEntry);
  const retained: typeof entries = [];
  const groups: NoteEvidenceDuplicateGroup[] = [];

  for (let index = 0; index < entries.length;) {
    let end = index + 1;
    while (end < entries.length && entries[end].identity === entries[index].identity) {
      end += 1;
    }
    const groupEntries = entries.slice(index, end);
    const representative = groupEntries[0];
    retained.push(representative);
    if (groupEntries.length > 1) {
      groups.push({
        representativeId: evidenceId(index),
        duplicateCount: groupEntries.length - 1,
        duplicateIds: groupEntries.slice(1).map((_, offset) => evidenceId(index + offset + 1)),
        reason: "exact-note-evidence",
      });
    }
    index = end;
  }

  retained.sort((left, right) => left.originalIndex - right.originalIndex);
  const duplicateCount = notes.length - retained.length;
  return {
    notes: retained.map(({ note }) => note),
    diagnostics: {
      originalNoteCount: notes.length,
      effectiveNoteCount: retained.length,
      duplicateCount,
      groups,
    },
  };
}

function evidenceIdentity(note: TimedNote, fallbackSourceIdentity: string): string {
  const provenance = note.analysisProvenance;
  const channel = note.channel ?? 0;
  const sourceIdentity = provenance?.sourceIdentity ?? fallbackSourceIdentity;
  const logicalVoiceIdentity = provenance?.logicalVoiceIdentity
    ?? `${note.trackIndex}:${channel}`;
  const sourceTrackIndex = provenance?.sourceTrackIndex ?? note.trackIndex;
  const effectiveEndTick = note.startTick + note.durationTick;
  return JSON.stringify([
    sourceIdentity,
    logicalVoiceIdentity,
    sourceTrackIndex,
    note.trackIndex,
    channel,
    note.pitch,
    note.startTick,
    effectiveEndTick,
    note.velocity,
    note.program ?? null,
    note.programExplicit ?? null,
  ]);
}

function compareEntry(
  left: { identity: string; originalIndex: number },
  right: { identity: string; originalIndex: number },
): number {
  return asciiCompare(left.identity, right.identity)
    || left.originalIndex - right.originalIndex;
}

function evidenceId(index: number): string {
  return `evidence-${String(index + 1).padStart(6, "0")}`;
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
