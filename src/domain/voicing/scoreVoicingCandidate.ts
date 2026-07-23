import { chordPitchClasses } from "../chordVoicing";
import type { ChordSymbol } from "../types";
import { normalizePitchClass } from "./normalizeVoicing";
import type { ChordCoverageResult, VoicingCandidate } from "./types";

export function chordCoverage(
  chord: ChordSymbol,
  notes: readonly number[],
  bassNote?: number,
): ChordCoverageResult {
  const required = chordPitchClasses(chord);
  const present = new Set(notes.map(normalizePitchClass));
  const matched = required.filter((pc) => present.has(pc)).length;
  const foreign = [...present].filter((pc) => !required.includes(pc)).length;
  const bassPc = normalizePitchClass(chord.bass ?? chord.root);
  return {
    requiredCoverage: required.length === 0 ? 0 : matched / required.length,
    optionalCoverage: 1,
    foreignToneWeight: present.size === 0 ? 0 : foreign / present.size,
    bassMatches: bassNote === undefined || normalizePitchClass(bassNote) === bassPc,
  };
}

export function scoreVoicingCandidate(
  chord: ChordSymbol,
  candidate: VoicingCandidate,
): { score: number; coverage: ChordCoverageResult } {
  const coverage = chordCoverage(chord, candidate.midiNotes, candidate.bassNote);
  const range = candidate.midiNotes[candidate.midiNotes.length - 1]!
    - candidate.midiNotes[0]!;
  const score = coverage.requiredCoverage * 0.5
    + coverage.optionalCoverage * 0.05
    + Math.min(1, candidate.durationBeats / 2) * 0.16
    + candidate.roleScore * 0.15
    + (coverage.bassMatches ? 0.08 : 0)
    + (range >= 7 && range <= 36 ? 0.06 : 0)
    - coverage.foreignToneWeight * 0.25
    - Math.max(0, candidate.midiNotes.length - 7) * 0.025;
  return { score, coverage };
}
