import {
  chordIdentityKey,
  normalizeChordLabel,
  normalizeChordSymbol,
} from "../../src/domain/chordIdentity";
import { makeChordSymbol, normalizePc, noteNameFromPitchClass } from "../../src/domain/chords";
import type { ChordSymbol } from "../../src/domain/types";

export const rootPositionMin7CompanionRuleId =
  "plain-minor-seventh-root-position-companion-v1";

export interface ShadowGeneratedCandidate {
  canonicalIdentity: string;
  root: string;
  triad: string;
  seventh?: string;
  tensions: string[];
  bass?: string;
  sourceCoreCandidateId: string;
  generationRuleId: string;
  supportingNoteInstanceIds: string[];
  supportingPitchClasses: number[];
  evidenceSummary: {
    coreEvidence: number;
    extensionEvidence: number;
    bassEvidence?: number;
  };
  productScore?: number;
  counterfactualScore?: number;
}

export interface ShadowSourceCandidate {
  chord: ChordSymbol;
  rawScore: number;
}

export interface ShadowSupportingNote {
  noteInstanceId: string;
  pitchClass: number;
}

export interface ShadowGenerationInput {
  rawCandidates: readonly ShadowSourceCandidate[];
  supportingNotes: readonly ShadowSupportingNote[];
}

export interface ShadowGenerationResult {
  candidates: ShadowGeneratedCandidate[];
  diagnostics: {
    sourceCount: number;
    eligibleSourceCount: number;
    generatedCount: number;
    skippedExistingCanonical: number;
    skippedInsufficientProvenance: number;
    skippedPerRootBudget: number;
    skippedEventBudget: number;
    canonicalDuplicateCount: number;
  };
}

const eventBudget = 4;

export function generateRootPositionMin7Shadows(
  input: ShadowGenerationInput,
): ShadowGenerationResult {
  const rootPositionMin7Canonical = new Set(input.rawCandidates
    .filter((candidate) =>
      candidate.chord.quality === "min7"
      && candidate.chord.tensions.length === 0
      && (candidate.chord.bass === undefined
        || normalizePc(candidate.chord.bass) === normalizePc(candidate.chord.root)))
    .map((candidate) => chordIdentityKey(normalizeChordSymbol(candidate.chord))));
  const eligible = input.rawCandidates
    .filter((candidate) =>
      candidate.chord.quality === "min7"
      && candidate.chord.tensions.length === 0
      && candidate.chord.bass !== undefined
      && normalizePc(candidate.chord.bass) !== normalizePc(candidate.chord.root))
    .map((candidate) => ({
      ...candidate,
      sourceIdentity: chordIdentityKey(normalizeChordSymbol(candidate.chord)),
    }))
    .sort((left, right) =>
      right.rawScore - left.rawScore
      || left.sourceIdentity.localeCompare(right.sourceIdentity));
  const generated: ShadowGeneratedCandidate[] = [];
  const generatedRoots = new Set<number>();
  let skippedExistingCanonical = 0;
  let skippedInsufficientProvenance = 0;
  let skippedPerRootBudget = 0;
  let skippedEventBudget = 0;

  for (const source of eligible) {
    const root = normalizePc(source.chord.root);
    if (generated.length >= eventBudget) {
      skippedEventBudget += 1;
      continue;
    }
    if (generatedRoots.has(root)) {
      skippedPerRootBudget += 1;
      continue;
    }
    const chord = makeChordSymbol(root, "min7");
    const identity = chordIdentityKey(normalizeChordSymbol(chord));
    if (rootPositionMin7Canonical.has(identity)) {
      skippedExistingCanonical += 1;
      continue;
    }
    const requiredPitchClasses = [0, 3, 7, 10]
      .map((interval) => normalizePc(root + interval))
      .sort((left, right) => left - right);
    const support = input.supportingNotes
      .filter((note) => requiredPitchClasses.includes(normalizePc(note.pitchClass)))
      .map((note) => ({
        noteInstanceId: note.noteInstanceId,
        pitchClass: normalizePc(note.pitchClass),
      }))
      .sort((left, right) =>
        left.pitchClass - right.pitchClass
        || left.noteInstanceId.localeCompare(right.noteInstanceId));
    const supportedPitchClasses = [...new Set(support.map((note) => note.pitchClass))];
    if (!requiredPitchClasses.every((pitchClass) =>
      supportedPitchClasses.includes(pitchClass))) {
      skippedInsufficientProvenance += 1;
      continue;
    }
    const sourceBass = normalizePc(source.chord.bass ?? source.chord.root);
    generated.push({
      canonicalIdentity: identity,
      root: noteNameFromPitchClass(root),
      triad: "minor",
      seventh: "minor7",
      tensions: [],
      sourceCoreCandidateId: source.sourceIdentity,
      generationRuleId: rootPositionMin7CompanionRuleId,
      supportingNoteInstanceIds: support.map((note) => note.noteInstanceId),
      supportingPitchClasses: supportedPitchClasses,
      evidenceSummary: {
        coreEvidence: supportedPitchClasses.length / requiredPitchClasses.length,
        extensionEvidence: 0,
        bassEvidence: supportedPitchClasses.includes(sourceBass) ? 1 : 0,
      },
      counterfactualScore: source.rawScore,
    });
    generatedRoots.add(root);
  }

  const canonicalDuplicateCount = generated.length
    - new Set(generated.map((candidate) => candidate.canonicalIdentity)).size;
  return {
    candidates: generated,
    diagnostics: {
      sourceCount: input.rawCandidates.length,
      eligibleSourceCount: eligible.length,
      generatedCount: generated.length,
      skippedExistingCanonical,
      skippedInsufficientProvenance,
      skippedPerRootBudget,
      skippedEventBudget,
      canonicalDuplicateCount,
    },
  };
}

export function shadowCandidateToChord(
  candidate: ShadowGeneratedCandidate,
): ChordSymbol | null {
  const label = `${candidate.root}m7`;
  const parsed = normalizeChordLabel(label);
  return parsed && chordIdentityKey(parsed) === candidate.canonicalIdentity
    ? makeChordSymbol(parsed.rootPitchClass, "min7")
    : null;
}
