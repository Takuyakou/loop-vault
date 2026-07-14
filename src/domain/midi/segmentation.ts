import { overlapWithSegment } from "./normalize";
import type { NormalizedTimedNote, NoteSegmentOverlap } from "./types";

export type BoundaryReason = "bar-start" | "beat-start" | "strong-onset-burst" | "bass-change"
  | "pitch-profile-change" | "silence-gap" | "time-signature-change";

export interface BoundaryCandidate {
  beat: number;
  strength: number;
  reasons: BoundaryReason[];
}

export interface SegmentCandidate {
  startBeat: number;
  endBeat: number;
  durationBeats: number;
  startBoundaryStrength: number;
  endBoundaryStrength: number;
  noteOverlaps: NoteSegmentOverlap[];
}

export interface SegmentationOptions {
  beatsPerBar: number;
  totalBeats: number;
  maxEndsPerStart?: number;
  maxSegmentBeats?: number;
}

export function generateBoundaries(
  notes: readonly NormalizedTimedNote[], options: SegmentationOptions,
): BoundaryCandidate[] {
  const map = new Map<number, { strength: number; reasons: Set<BoundaryReason> }>();
  const add = (beat: number, strength: number, reason: BoundaryReason) => {
    const rounded = Number(beat.toFixed(6));
    const current = map.get(rounded) ?? { strength: 0, reasons: new Set<BoundaryReason>() };
    current.strength = Math.max(current.strength, strength);
    current.reasons.add(reason);
    map.set(rounded, current);
  };
  add(0, 1, "bar-start");
  add(options.totalBeats, 1, "bar-start");
  for (let beat = 0; beat <= options.totalBeats; beat += 1) {
    add(beat, beat % options.beatsPerBar === 0 ? 1 : 0.56, beat % options.beatsPerBar === 0 ? "bar-start" : "beat-start");
  }
  const onsetGroups = groupOnsets(notes);
  for (const [beat, onsetNotes] of onsetGroups) {
    const burst = onsetNotes.length >= 3;
    const bassChange = onsetNotes.some((note) => note.pitch < 52);
    if (burst) add(beat, 0.82, "strong-onset-burst");
    if (bassChange) add(beat, 0.74, "bass-change");
    if (burst && bassChange && !Number.isInteger(beat)) add(beat, 0.68, "pitch-profile-change");
  }
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startBeat - sorted[index - 1].sustainedEndBeat >= 0.75) add(sorted[index].startBeat, 0.7, "silence-gap");
  }
  return [...map.entries()].map(([beat, value]) => ({ beat, strength: value.strength, reasons: [...value.reasons].sort() }))
    .sort((a, b) => a.beat - b.beat);
}

export function buildSegmentLattice(
  notes: readonly NormalizedTimedNote[], boundaries: readonly BoundaryCandidate[], options: SegmentationOptions,
): SegmentCandidate[] {
  const maxEnds = options.maxEndsPerStart ?? 8;
  const maxLength = options.maxSegmentBeats ?? options.beatsPerBar;
  const segments: SegmentCandidate[] = [];
  boundaries.forEach((start, startIndex) => {
    let ends = 0;
    for (let endIndex = startIndex + 1; endIndex < boundaries.length && ends < maxEnds; endIndex += 1) {
      const end = boundaries[endIndex];
      const duration = end.beat - start.beat;
      if (duration > maxLength) break;
      const allowHalfBeat = duration >= 0.5 && start.strength >= 0.68 && end.strength >= 0.68;
      if (duration < 1 && !allowHalfBeat) continue;
      const range = { startBeat: start.beat, endBeat: end.beat };
      segments.push({ startBeat: start.beat, endBeat: end.beat, durationBeats: duration,
        startBoundaryStrength: start.strength, endBoundaryStrength: end.strength,
        noteOverlaps: notes.map((note) => overlapWithSegment(note, range)).filter((entry) => entry.overlapBeats > 0) });
      ends += 1;
    }
  });
  return segments;
}

function groupOnsets(notes: readonly NormalizedTimedNote[]): Map<number, NormalizedTimedNote[]> {
  const groups = new Map<number, NormalizedTimedNote[]>();
  notes.forEach((note) => {
    const beat = Number(note.startBeat.toFixed(6));
    groups.set(beat, [...(groups.get(beat) ?? []), note]);
  });
  return groups;
}
