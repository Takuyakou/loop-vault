import { noteNameFromPitchClass, normalizePc, makeChordSymbol } from "../../src/domain/chords";
import {
  chordIdentityKey,
  normalizeChordLabel,
  normalizeChordSymbol,
} from "../../src/domain/chordIdentity";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { chordPitchSet } from "../../src/domain/midi/candidateDiversity";
import { detectorQualities, classifyRepresentability } from "../../src/domain/midi/evaluation/metricsV2";
import { diagnoseLegacyWindowCandidates } from "../../src/domain/midi/legacy";
import type { ChordQuality } from "../../src/domain/types";
import { chordFixture } from "../p534/fixtures";

export type BaselineClassification =
  | "representable-correct"
  | "representable-misranked"
  | "not-representable"
  | "parser-unsupported";

export interface VocabularyBaselineRow {
  id: string;
  family: string;
  root: number;
  targetLabel: string;
  classification: BaselineClassification;
  analyzerTop1: string;
  candidateCount: number;
}

export interface VocabularyBaselineSummary {
  qualityCount: number;
  roots: number;
  targetRows: number;
  neighboringUnsupportedRows: number;
  supportedControlRows: number;
  slashControlRows: number;
  classifications: Record<BaselineClassification, number>;
  misrankedFamilies: Record<string, number>;
  minCandidateCount: number;
  maxCandidateCount: number;
}

interface GeneratedFamily {
  id: string;
  intervals: readonly number[];
  label: (rootName: string) => string;
}

/**
 * Public-safe Family-C shapes expressed only as root-relative pitch classes.
 * These are characterization fixtures, not a candidate grammar or production
 * special cases.
 */
const targetFamilies: readonly GeneratedFamily[] = [
  {
    id: "altered-dominant-no5",
    intervals: [0, 3, 4, 8, 10],
    label: (root) => `${root}7(#9,b13,no5)`,
  },
  {
    id: "dominant-11-no5",
    intervals: [0, 2, 4, 5, 10],
    label: (root) => `${root}11(no5)`,
  },
];

/** Nearby identities the current parser can read but the detector cannot emit. */
const neighboringUnsupportedFamilies: readonly GeneratedFamily[] = [
  {
    id: "altered-dominant-with5",
    intervals: [0, 3, 4, 7, 8, 10],
    label: (root) => `${root}7(#9,b13)`,
  },
  {
    id: "dominant-11-with5",
    intervals: [0, 2, 4, 5, 7, 10],
    label: (root) => `${root}7(9,11)`,
  },
];

function pitchesFromIntervals(root: number, intervals: readonly number[]): number[] {
  const rootMidi = 48 + normalizePc(root);
  return intervals.map((interval) => rootMidi + interval);
}

function currentProduction(pitches: number[]): {
  label: string;
  key: string | null;
  candidateCount: number;
} {
  const bytes = chordFixture(pitches, { ticksPerBeat: 96, numerator: 4, denominator: 4 });
  const top1 = analyzeMidi(bytes, { mode: "phase4-v1" }).fullTimeline[0]?.chord;
  const diagnostics = diagnoseLegacyWindowCandidates(bytes, { useQualityEvidence: true });
  return {
    label: top1?.label ?? "(none)",
    key: top1 ? chordIdentityKey(normalizeChordSymbol(top1)) : null,
    candidateCount: diagnostics[0]?.candidates.length ?? 0,
  };
}

function diagnose(
  id: string,
  family: string,
  root: number,
  intervals: readonly number[],
  targetLabel: string,
  classification: BaselineClassification,
): VocabularyBaselineRow {
  const current = currentProduction(pitchesFromIntervals(root, intervals));
  return {
    id,
    family,
    root,
    targetLabel,
    classification,
    analyzerTop1: current.label,
    candidateCount: current.candidateCount,
  };
}

function supportedIntervals(root: number, quality: ChordQuality): number[] {
  return chordPitchSet(makeChordSymbol(root, quality))
    .map((pitchClass) => normalizePc(pitchClass - root))
    .sort((left, right) => left - right);
}

export function buildStage00VocabularyBaseline(): VocabularyBaselineRow[] {
  const rows: VocabularyBaselineRow[] = [];

  for (let root = 0; root < 12; root += 1) {
    const rootName = noteNameFromPitchClass(root);

    for (const family of targetFamilies) {
      const targetLabel = family.label(rootName);
      const representability = classifyRepresentability(targetLabel).representability;
      rows.push(diagnose(
        `target:${family.id}:${root}`,
        family.id,
        root,
        family.intervals,
        targetLabel,
        representability === "parser-unsupported" ? "parser-unsupported" : "not-representable",
      ));
    }

    for (const family of neighboringUnsupportedFamilies) {
      const targetLabel = family.label(rootName);
      const representability = classifyRepresentability(targetLabel).representability;
      rows.push(diagnose(
        `neighbor:${family.id}:${root}`,
        family.id,
        root,
        family.intervals,
        targetLabel,
        representability === "parser-unsupported" ? "parser-unsupported" : "not-representable",
      ));
    }

    for (const quality of detectorQualities) {
      const chord = makeChordSymbol(root, quality);
      const targetLabel = chord.label;
      const current = currentProduction(pitchesFromIntervals(
        root,
        supportedIntervals(root, quality),
      ));
      rows.push({
        id: `control:${quality}:${root}`,
        family: `control:${quality}`,
        root,
        targetLabel,
        classification: current.key === canonicalKey(targetLabel)
          ? "representable-correct"
          : "representable-misranked",
        analyzerTop1: current.label,
        candidateCount: current.candidateCount,
      });
    }

    const bass = normalizePc(root + 4);
    const slashLabel = `${rootName}/${noteNameFromPitchClass(bass)}`;
    const upperRootMidi = 60 + root;
    const slashPitches = [48 + bass, upperRootMidi, upperRootMidi + 4, upperRootMidi + 7];
    const slashCurrent = currentProduction(slashPitches);
    rows.push({
      id: `slash:maj-first-inversion:${root}`,
      family: "control:maj-first-inversion",
      root,
      targetLabel: slashLabel,
      classification: slashCurrent.key === canonicalKey(slashLabel)
        ? "representable-correct"
        : "representable-misranked",
      analyzerTop1: slashCurrent.label,
      candidateCount: slashCurrent.candidateCount,
    });
  }

  return rows;
}

export function summarizeStage00VocabularyBaseline(
  rows: readonly VocabularyBaselineRow[],
): VocabularyBaselineSummary {
  const classifications: VocabularyBaselineSummary["classifications"] = {
    "representable-correct": 0,
    "representable-misranked": 0,
    "not-representable": 0,
    "parser-unsupported": 0,
  };
  rows.forEach((row) => { classifications[row.classification] += 1; });
  const candidateCounts = rows.map((row) => row.candidateCount);
  const misrankedFamilies: Record<string, number> = {};
  rows
    .filter((row) => row.classification === "representable-misranked")
    .forEach((row) => {
      misrankedFamilies[row.family] = (misrankedFamilies[row.family] ?? 0) + 1;
    });

  return {
    qualityCount: detectorQualities.length,
    roots: new Set(rows.map((row) => row.root)).size,
    targetRows: rows.filter((row) => row.id.startsWith("target:")).length,
    neighboringUnsupportedRows: rows.filter((row) => row.id.startsWith("neighbor:")).length,
    supportedControlRows: rows.filter((row) => row.id.startsWith("control:")).length,
    slashControlRows: rows.filter((row) => row.id.startsWith("slash:")).length,
    classifications,
    misrankedFamilies,
    minCandidateCount: Math.min(...candidateCounts),
    maxCandidateCount: Math.max(...candidateCounts),
  };
}

export function canonicalKey(label: string): string | null {
  const identity = normalizeChordLabel(label);
  return identity ? chordIdentityKey(identity) : null;
}
