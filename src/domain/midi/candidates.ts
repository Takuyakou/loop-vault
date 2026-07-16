import { labelFromSymbol, makeChordSymbol, normalizePc } from "../chords";
import type { ChordQuality, ChordSymbol } from "../types";
import { chordKeyCompatibility, type KeyRegionCandidate } from "./keyPrior";
import type { WeightedPitchProfile } from "./profiles";
import type { SegmentCandidate } from "./segmentation";

export interface ChordTemplate {
  quality: ChordQuality;
  required: number[];
  important: number[];
  optional: number[];
  conflicting: number[];
}

export interface ChordEvidence { kind: string; pitchClass?: number; value: number }

export interface ChordCandidateScore {
  chord: ChordSymbol;
  templateScore: number;
  coreCoverageScore: number;
  extensionCoverageScore: number;
  bassCompatibilityScore: number;
  slashCompatibilityScore: number;
  keyCompatibilityScore: number;
  foreignNotePenalty: number;
  missingCoreTonePenalty: number;
  ambiguityPenalty: number;
  totalScore: number;
  evidence: ChordEvidence[];
}

export interface ScoredSegment { segment: SegmentCandidate; candidates: ChordCandidateScore[] }

export const chordTemplates: readonly ChordTemplate[] = [
  template("maj", [0, 4], [7], [], [3]), template("min", [0, 3], [7], [], [4]),
  template("dim", [0, 3, 6], [], [], [4, 7]), template("aug", [0, 4, 8], [], [], [3, 7]),
  template("sus2", [0, 2], [7], [], [3, 4]), template("sus4", [0, 5], [7], [], [3, 4]),
  template("six", [0, 4, 9], [7], [], [3, 10, 11]), template("min6", [0, 3, 9], [7], [], [4, 10, 11]),
  template("dom7", [0, 4, 10], [7], [], [3, 11]), template("maj7", [0, 4, 11], [7], [], [3, 10]),
  template("min7", [0, 3, 10], [7], [], [4, 11]), template("min7b5", [0, 3, 6, 10], [], [], [4, 7, 11]),
  template("dim7", [0, 3, 6, 9], [], [], [4, 7, 10]), template("add9", [0, 4], [7], [2], [3]),
  template("dom9", [0, 4, 10], [7], [2], [3, 11]), template("maj9", [0, 4, 11], [7], [2], [3, 10]),
  template("min9", [0, 3, 10], [7], [2], [4, 11]), template("min11", [0, 3, 10], [7], [2, 5], [4, 11]),
  template("dom13", [0, 4, 10], [7], [2, 9], [3, 11]), template("dom7sus4", [0, 5, 10], [7], [], [3, 4, 11]),
  template("sixNine", [0, 4, 9], [7], [2], [3, 10, 11]),
];

export function scoreChordCandidates(
  profile: WeightedPitchProfile, key?: KeyRegionCandidate, topK = 8,
): ChordCandidateScore[] {
  const total = Math.max(1e-9, profile.qualityPcs.reduce((sum, value) => sum + value, 0));
  const bassPc = maxIndex(profile.bassPcs);
  const scored: ChordCandidateScore[] = [];
  for (let root = 0; root < 12; root += 1) {
    for (const chordTemplate of chordTemplates) {
      const required = chordTemplate.required.map((interval) => normalizePc(root + interval));
      const important = chordTemplate.important.map((interval) => normalizePc(root + interval));
      const optional = chordTemplate.optional.map((interval) => normalizePc(root + interval));
      const allowed = [...new Set([...required, ...important, ...optional])];
      const coreCoverageScore = required.reduce((sum, pc) => sum + profile.qualityPcs[pc], 0) / total;
      const importantCoverage = important.reduce((sum, pc) => sum + profile.qualityPcs[pc], 0) / total;
      const extensionCoverageScore = optional.reduce((sum, pc) => sum + profile.qualityPcs[pc], 0) / total;
      const foreignNotePenalty = profile.qualityPcs.reduce((sum, value, pc) => sum + (allowed.includes(pc) ? 0 : value), 0) / total * 0.42;
      const missing = required.filter((pc) => profile.qualityPcs[pc] / total < 0.035).length;
      const missingCoreTonePenalty = missing / Math.max(1, required.length) * 0.5;
      const bassInChord = allowed.includes(bassPc);
      const bassCompatibilityScore = bassPc === root ? 0.14 : bassInChord ? 0.07 : -0.08;
      const slashCompatibilityScore = bassPc !== root && bassInChord ? 0.035 : 0;
      const keyCompatibilityScore = chordKeyCompatibility(root, chordTemplate.quality, key);
      const conflictingWeight = chordTemplate.conflicting.map((interval) => normalizePc(root + interval))
        .reduce((sum, pc) => sum + profile.qualityPcs[pc], 0) / total;
      const ambiguityPenalty = conflictingWeight * 0.35;
      const templateScore = coreCoverageScore * 0.9 + importantCoverage * 0.3 + extensionCoverageScore * 0.18;
      const totalScore = templateScore + bassCompatibilityScore + slashCompatibilityScore + keyCompatibilityScore
        - foreignNotePenalty - missingCoreTonePenalty - ambiguityPenalty;
      const bass = bassPc !== root && bassInChord ? bassPc : undefined;
      const chord = makeChordSymbol(root, chordTemplate.quality, [], bass);
      scored.push({ chord: { ...chord, label: labelFromSymbol(chord) }, templateScore, coreCoverageScore,
        extensionCoverageScore, bassCompatibilityScore, slashCompatibilityScore, keyCompatibilityScore,
        foreignNotePenalty, missingCoreTonePenalty, ambiguityPenalty, totalScore,
        evidence: [
          { kind: "core-coverage", value: coreCoverageScore },
          { kind: "bass", pitchClass: bassPc, value: bassCompatibilityScore },
          { kind: "foreign", value: foreignNotePenalty },
        ] });
    }
  }
  return scored.sort((a, b) => b.totalScore - a.totalScore || canonicalChord(a.chord).localeCompare(canonicalChord(b.chord))).slice(0, topK);
}

export function scoreSegments(segments: readonly SegmentCandidate[], profiles: readonly WeightedPitchProfile[], key?: KeyRegionCandidate): ScoredSegment[] {
  return segments.map((segment, index) => ({ segment, candidates: scoreChordCandidates(profiles[index], key) }));
}

export function canonicalChord(chord: ChordSymbol): string {
  return `${normalizePc(chord.root)}:${chord.quality}:${chord.tensions.join(",")}:${chord.bass === undefined ? "" : normalizePc(chord.bass)}`;
}

function template(quality: ChordQuality, required: number[], important: number[], optional: number[], conflicting: number[]): ChordTemplate {
  return { quality, required, important, optional, conflicting };
}
function maxIndex(values: number[]): number { return values.reduce((best, value, index) => value > values[best] ? index : best, 0); }
