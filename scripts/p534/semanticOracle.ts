/**
 * P5.34-03 semantic oracle + candidate-pipeline diagnostics (shadow-only).
 *
 * The oracle is defined independently of current Analyzer output. For each
 * semantic fixture it records the source pitch classes, structural bass,
 * expected family, representability, and forbidden identities, then inspects
 * the full candidate list (via `diagnoseLegacyWindowCandidates`) to answer the
 * candidate-pipeline questions without a parallel Analyzer.
 */

import { normalizePc, parseChordLabel } from "../../src/domain/chords";
import {
  chordIdentityKey,
  normalizeChordLabel,
  normalizeChordSymbol,
} from "../../src/domain/chordIdentity";
import { chordPitchSet } from "../../src/domain/midi/candidateDiversity";
import { diagnoseLegacyWindowCandidates } from "../../src/domain/midi/legacy";
import type { LegacyWindowCandidateDiagnostic } from "../../src/domain/midi/legacy";
import type { ChordSymbol } from "../../src/domain/types";
import { chordFixture } from "./fixtures";

export type Representability = "yes" | "no" | "partial";

export interface SemanticOracleEntry {
  id: string;
  pitches: number[];
  expectedLabel: string | null;
  representable: Representability;
  structuralBass: number | null;
  forbiddenTop1Keys?: string[];
  note: string;
}

function key(label: string): string {
  const identity = normalizeChordLabel(label);
  if (!identity) throw new Error(`unparseable oracle label: ${label}`);
  return chordIdentityKey(identity);
}

export const SEMANTIC_ORACLE: readonly SemanticOracleEntry[] = [
  {
    id: "S01", pitches: [56, 60, 63, 67, 70],
    expectedLabel: "Abmaj9", representable: "yes", structuralBass: 8,
    forbiddenTop1Keys: [key("Am7b5")],
    note: "Ab C Eb G Bb -> Abmaj9",
  },
  {
    id: "S02", pitches: [55, 59, 58, 63, 65],
    expectedLabel: null, representable: "partial", structuralBass: 7,
    forbiddenTop1Keys: [key("Fm11/G")],
    note: "G B Bb Eb F -> G7(#9,b13,no5) family (dom7 core representable; no5 unsupported)",
  },
  {
    id: "S03", pitches: [59, 62, 66, 69],
    expectedLabel: "Bm7", representable: "yes", structuralBass: 11,
    note: "B D F# A -> Bm7 (positive control)",
  },
  {
    id: "S04", pitches: [59, 63, 69, 61, 64],
    expectedLabel: null, representable: "no", structuralBass: 11,
    forbiddenTop1Keys: [key("Bm11")],
    note: "B D# A C# E -> B11(no5) family (major 3rd D# must not be erased)",
  },
  {
    id: "S05", pitches: [52, 60, 64, 67],
    expectedLabel: "C/E", representable: "yes", structuralBass: 4,
    forbiddenTop1Keys: [key("Edim")],
    note: "C/E — upper C major, structural E bass",
  },
  {
    id: "S06", pitches: [55, 60, 62, 65],
    expectedLabel: "G7sus4", representable: "yes", structuralBass: 7,
    note: "G C D F -> G7sus4 (positive control)",
  },
  {
    id: "S07", pitches: [59, 62, 65, 69],
    expectedLabel: "Bm7b5", representable: "yes", structuralBass: 11,
    note: "B D F A -> Bm7b5 (positive control)",
  },
];

export interface CandidateRow {
  rank: number;
  label: string;
  rawScore: number;
  key: string;
  pitchClasses: number[];
}

export interface ExplanationProfile {
  sourcePitchClasses: number[];
  top1PitchClasses: number[];
  matched: number[];
  unexplainedObserved: number[];
  candidateOnly: number[];
  structuralBassMatch: boolean;
  definingToneContradiction: boolean;
}

export type SemanticClassification =
  | "REPRESENTABLE_AND_CORRECT"
  | "GENERATION_FAILURE"
  | "RANKING_FAILURE"
  | "REPRESENTABILITY_LIMIT"
  | "BASS_OR_INVERSION_FAILURE"
  | "SURFACE_SPELLING_ONLY"
  | "UNRESOLVED";

export interface SemanticClassificationResult {
  id: string;
  representable: Representability;
  expectedKey: string | null;
  expectedGenerated: boolean;
  expectedRank: number | null;
  top1Label: string;
  top1Key: string;
  classification: SemanticClassification;
  explanation: ExplanationProfile;
  candidates: CandidateRow[];
}

function chordKey(chord: ChordSymbol): string {
  return chordIdentityKey(normalizeChordSymbol(chord));
}

export function classifySemantic(entry: SemanticOracleEntry): SemanticClassificationResult {
  const bytes = chordFixture(entry.pitches, { ticksPerBeat: 96, numerator: 4, denominator: 4 });
  const diagnostics: LegacyWindowCandidateDiagnostic[] = diagnoseLegacyWindowCandidates(bytes);
  const diag = diagnostics[0];
  if (!diag) {
    return {
      id: entry.id,
      representable: entry.representable,
      expectedKey: entry.expectedLabel ? key(entry.expectedLabel) : null,
      expectedGenerated: false,
      expectedRank: null,
      top1Label: "(none)",
      top1Key: "NC",
      classification: "UNRESOLVED",
      explanation: emptyExplanation(entry),
      candidates: [],
    };
  }

  const candidates = diag.candidates.map((candidate, index) => ({
    rank: index + 1,
    label: candidate.chord.label,
    rawScore: candidate.rawScore,
    key: chordKey(candidate.chord),
    pitchClasses: chordPitchSet(candidate.chord),
  }));
  const top1 = candidates[0];

  const expectedKey = entry.expectedLabel ? key(entry.expectedLabel) : null;
  const expectedIndex = expectedKey
    ? candidates.findIndex((candidate) => candidate.key === expectedKey)
    : -1;
  const expectedGenerated = expectedIndex >= 0;
  const expectedRank = expectedGenerated ? expectedIndex + 1 : null;

  const sourcePcs = [...new Set(entry.pitches.map((pitch) => normalizePc(pitch)))]
    .sort((a, b) => a - b);
  const top1Pcs = top1.pitchClasses;
  const matched = sourcePcs.filter((pc) => top1Pcs.includes(pc));
  const unexplainedObserved = sourcePcs.filter((pc) => !top1Pcs.includes(pc));
  const candidateOnly = top1Pcs.filter((pc) => !sourcePcs.includes(pc));
  const top1Chord = diag.candidates[0].chord;
  const structuralBassMatch =
    entry.structuralBass === null
      ? true
      : top1Chord.bass !== undefined
        ? normalizePc(top1Chord.bass) === entry.structuralBass
        : false;
  const definingToneContradiction =
    entry.forbiddenTop1Keys?.includes(top1.key) ?? false;

  const classification = classify(
    entry, top1, expectedGenerated, expectedRank, structuralBassMatch,
  );

  return {
    id: entry.id,
    representable: entry.representable,
    expectedKey,
    expectedGenerated,
    expectedRank,
    top1Label: top1.label,
    top1Key: top1.key,
    classification,
    explanation: {
      sourcePitchClasses: sourcePcs,
      top1PitchClasses: top1Pcs,
      matched,
      unexplainedObserved,
      candidateOnly,
      structuralBassMatch,
      definingToneContradiction,
    },
    candidates,
  };
}

function classify(
  entry: SemanticOracleEntry,
  top1: CandidateRow,
  expectedGenerated: boolean,
  expectedRank: number | null,
  structuralBassMatch: boolean,
): SemanticClassification {
  if (entry.representable === "no" || entry.representable === "partial") {
    return "REPRESENTABILITY_LIMIT";
  }
  if (!expectedGenerated) {
    return "GENERATION_FAILURE";
  }
  if (expectedRank === 1) {
    return "REPRESENTABLE_AND_CORRECT";
  }
  // expected generated but loses
  if (entry.structuralBass !== null && !structuralBassMatch) {
    return "BASS_OR_INVERSION_FAILURE";
  }
  return "RANKING_FAILURE";
}

function emptyExplanation(entry: SemanticOracleEntry): ExplanationProfile {
  return {
    sourcePitchClasses: [...new Set(entry.pitches.map((pitch) => normalizePc(pitch)))].sort((a, b) => a - b),
    top1PitchClasses: [],
    matched: [],
    unexplainedObserved: [],
    candidateOnly: [],
    structuralBassMatch: true,
    definingToneContradiction: false,
  };
}

/** Whether the top-1 candidate semantically contradicts a defining source tone. */
export function isDefiningToneContradiction(result: SemanticClassificationResult): boolean {
  return result.explanation.definingToneContradiction;
}

export { parseChordLabel };
