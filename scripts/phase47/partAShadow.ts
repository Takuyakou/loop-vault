import { chordIdentityKey, normalizeChordSymbol } from "../../src/domain/chordIdentity";
import { factorizeChordSymbol, factorizedKey } from "../../src/domain/chordFactorization";
import { chordPitchClasses } from "../../src/domain/chordVoicing";
import { makeChordSymbol, normalizePc } from "../../src/domain/chords";
import type { ChordSymbol } from "../../src/domain/types";

export const partACompanionRuleId =
  "automatic-bass-plain-companion-v1";

export interface PartASourceCandidate {
  chord: ChordSymbol;
  rawScore: number;
}
export interface PartASupportingNote {
  noteInstanceId: string;
  pitchClass: number;
}

export interface PartACompanionProvenance {
  sourceSlashCandidateId: string;
  sourceCoreCandidateId: string;
  generationRuleId: typeof partACompanionRuleId;
  noteInstanceIds: string[];
  supportingPitchClasses: number[];
  bassAttachment: {
    sourceBassPitchClass: number;
    sourceSlashIdentity: string;
  };
  canonicalRoundTrip: {
    label: string;
    identity: string;
    passed: true;
  };
}

export interface PartAGeneratedCandidate {
  chord: ChordSymbol;
  canonicalIdentity: string;
  rawScore: number;
  provenance: PartACompanionProvenance;
}

export interface PartAGenerationResult {
  candidates: PartAGeneratedCandidate[];
  diagnostics: {
    sourceCount: number;
    sourceWasNonRootSlash: boolean;
    skippedNoSource: number;
    skippedPlainSource: number;
    skippedExistingCanonical: number;
    skippedInsufficientProvenance: number;
    skippedRoundTrip: number;
    generatedCount: number;
    canonicalDuplicateCount: number;
  };
}

export interface RankedPartACandidate {
  chord: ChordSymbol;
  rawScore: number;
  baseline: boolean;
  baselineRank?: number;
  generationOrder?: number;
  provenance?: PartACompanionProvenance;
}

/**
 * Adds at most one plain companion for the incumbent raw winner.
 *
 * The rule is deliberately quality-agnostic. It does not decide that m7, maj9,
 * or any other family deserves special treatment; it only reverses the
 * information loss caused when the existing winner was rendered with an
 * automatically attached non-root bass.
 */
export function generatePartACompanion(
  rawCandidates: readonly PartASourceCandidate[],
  supportingNotes: readonly PartASupportingNote[],
): PartAGenerationResult {
  const diagnostics = {
    sourceCount: rawCandidates.length,
    sourceWasNonRootSlash: false,
    skippedNoSource: 0,
    skippedPlainSource: 0,
    skippedExistingCanonical: 0,
    skippedInsufficientProvenance: 0,
    skippedRoundTrip: 0,
    generatedCount: 0,
    canonicalDuplicateCount: 0,
  };
  const source = rawCandidates[0];
  if (!source) {
    diagnostics.skippedNoSource = 1;
    return { candidates: [], diagnostics };
  }
  const sourceBass = normalizePc(source.chord.bass ?? source.chord.root);
  const root = normalizePc(source.chord.root);
  if (source.chord.bass === undefined || sourceBass === root) {
    diagnostics.skippedPlainSource = 1;
    return { candidates: [], diagnostics };
  }
  diagnostics.sourceWasNonRootSlash = true;

  const plain = makeChordSymbol(
    root,
    source.chord.quality,
    [...source.chord.tensions],
  );
  const plainIdentity = chordIdentityKey(normalizeChordSymbol(plain));
  const existingIdentities = new Set(
    rawCandidates.map((candidate) =>
      chordIdentityKey(normalizeChordSymbol(candidate.chord))),
  );
  if (existingIdentities.has(plainIdentity)) {
    diagnostics.skippedExistingCanonical = 1;
    return { candidates: [], diagnostics };
  }

  const requiredPitchClasses = chordPitchClasses(plain)
    .map(normalizePc)
    .sort((left, right) => left - right);
  const support = supportingNotes
    .map((note) => ({
      noteInstanceId: note.noteInstanceId,
      pitchClass: normalizePc(note.pitchClass),
    }))
    .filter((note) => requiredPitchClasses.includes(note.pitchClass))
    .sort((left, right) =>
      left.pitchClass - right.pitchClass
      || left.noteInstanceId.localeCompare(right.noteInstanceId));
  const supportingPitchClasses = [...new Set(
    support.map((note) => note.pitchClass),
  )];
  if (!requiredPitchClasses.every((pitchClass) =>
    supportingPitchClasses.includes(pitchClass))) {
    diagnostics.skippedInsufficientProvenance = 1;
    return { candidates: [], diagnostics };
  }

  const roundTripIdentity = chordIdentityKey(normalizeChordSymbol(plain));
  if (roundTripIdentity !== plainIdentity) {
    diagnostics.skippedRoundTrip = 1;
    return { candidates: [], diagnostics };
  }
  const sourceIdentity = chordIdentityKey(normalizeChordSymbol(source.chord));
  const core = {
    ...factorizeChordSymbol(source.chord),
    bass: root,
  };
  const candidate: PartAGeneratedCandidate = {
    chord: plain,
    canonicalIdentity: plainIdentity,
    rawScore: source.rawScore,
    provenance: {
      sourceSlashCandidateId: `baseline:0:${sourceIdentity}`,
      sourceCoreCandidateId: `core:${factorizedKey(core)}`,
      generationRuleId: partACompanionRuleId,
      noteInstanceIds: support.map((note) => note.noteInstanceId),
      supportingPitchClasses,
      bassAttachment: {
        sourceBassPitchClass: sourceBass,
        sourceSlashIdentity: sourceIdentity,
      },
      canonicalRoundTrip: {
        label: plain.label,
        identity: roundTripIdentity,
        passed: true,
      },
    },
  };
  diagnostics.generatedCount = 1;
  return { candidates: [candidate], diagnostics };
}

/**
 * Score remains the primary order. At an exact tie every incumbent stays ahead
 * of every generated companion, then keeps its original baseline rank.
 */
export function rankWithIncumbentPreference(
  baseline: readonly PartASourceCandidate[],
  generated: readonly PartAGeneratedCandidate[],
): RankedPartACandidate[] {
  const entries: RankedPartACandidate[] = [
    ...baseline.map((candidate, baselineRank) => ({
      ...candidate,
      baseline: true,
      baselineRank,
    })),
    ...generated.map((candidate, generationOrder) => ({
      chord: candidate.chord,
      rawScore: candidate.rawScore,
      baseline: false,
      generationOrder,
      provenance: candidate.provenance,
    })),
  ];
  return entries.sort((left, right) =>
    right.rawScore - left.rawScore
    || Number(right.baseline) - Number(left.baseline)
    || (left.baselineRank ?? Number.MAX_SAFE_INTEGER)
      - (right.baselineRank ?? Number.MAX_SAFE_INTEGER)
    || (left.generationOrder ?? Number.MAX_SAFE_INTEGER)
      - (right.generationOrder ?? Number.MAX_SAFE_INTEGER)
    || chordIdentityKey(normalizeChordSymbol(left.chord))
      .localeCompare(chordIdentityKey(normalizeChordSymbol(right.chord))));
}
