import {
  chordIdentityKey,
  normalizeChordSymbol,
} from "../../src/domain/chordIdentity";
import { noteNameFromPitchClass } from "../../src/domain/chords";
import type { ChordSymbol } from "../../src/domain/types";
import {
  flatNineIdentity,
  makeFlatNineDominant,
  observedFlatNineRuleId,
} from "./canonicalFlatNine";
import {
  analyzePhase48EventEvidence,
  type Phase48EvidenceNote,
} from "./eventEvidence";

export type FlatNineEvidenceVariant = "E1" | "E2" | "E3";

export interface AlteredDominantShadowCandidate {
  canonicalIdentity: string;
  root: string;
  triad: "major";
  seventh: "minor7";
  tensions: ["b9"];
  bass: string;
  sourceCoreCandidateId: string;
  generationRuleId: string;
  supportingCoreNoteInstanceIds: string[];
  supportingB9NoteInstanceIds: string[];
  evidenceClass: "strong" | "medium" | "weak" | "incidental";
  baselineCoreScore: number;
  counterfactualScore?: number;
}

export interface FlatNineSourceCandidate {
  chord: ChordSymbol;
  rawScore: number;
}

export interface GenerateFlatNineShadowOptions {
  variant: FlatNineEvidenceVariant;
  eventStartBeat: number;
  eventEndBeat: number;
  maximumCandidates?: number;
}

export function generateObservedFlatNineShadowCandidates(
  sourceCandidates: readonly FlatNineSourceCandidate[],
  notes: readonly Phase48EvidenceNote[],
  options: GenerateFlatNineShadowOptions,
): AlteredDominantShadowCandidate[] {
  const limit = Math.min(2, Math.max(0, options.maximumCandidates ?? 2));
  if (limit === 0 || options.eventEndBeat <= options.eventStartBeat) return [];
  const existingIdentities = new Set(
    sourceCandidates.map((candidate) =>
      chordIdentityKey(normalizeChordSymbol(candidate.chord))),
  );
  const sourceCores = deduplicateSourceRoots(
    sourceCandidates
      .filter((candidate) =>
        candidate.chord.quality === "dom7"
        && candidate.chord.tensions.length === 0)
      .sort(compareSourceCandidates),
  );
  const eventPitchClasses = new Set(
    notes
      .filter((note) =>
        note.startBeat < options.eventEndBeat
        && note.endBeat > options.eventStartBeat)
      .map((note) => note.pitchClass),
  );
  const generated: AlteredDominantShadowCandidate[] = [];

  for (const source of sourceCores) {
    const bass = source.chord.bass ?? source.chord.root;
    const canonicalIdentity = flatNineIdentity(source.chord.root, bass);
    if (existingIdentities.has(canonicalIdentity)) continue;
    if (!hasRequiredPitchClasses(
      eventPitchClasses,
      source.chord.root,
      options.variant,
    )) continue;
    const evidence = analyzePhase48EventEvidence(
      notes,
      source.chord.root,
      options.eventStartBeat,
      options.eventEndBeat,
    );
    if (!eligibleForVariant(evidence, options.variant)) continue;
    generated.push({
      canonicalIdentity,
      root: noteNameFromPitchClass(source.chord.root),
      triad: "major",
      seventh: "minor7",
      tensions: ["b9"],
      bass: noteNameFromPitchClass(bass),
      sourceCoreCandidateId: [
        chordIdentityKey(normalizeChordSymbol(source.chord)),
        source.rawScore.toFixed(12),
      ].join("@"),
      generationRuleId: `${observedFlatNineRuleId}:${options.variant}`,
      supportingCoreNoteInstanceIds: uniqueSorted([
        ...evidence.rootNotes,
        ...evidence.majorThirdNotes,
        ...evidence.perfectFifthNotes,
        ...evidence.minorSeventhNotes,
      ].map((note) => note.noteInstanceId)),
      supportingB9NoteInstanceIds: uniqueSorted(
        evidence.flatNineNotes.map((note) => note.noteInstanceId),
      ),
      evidenceClass: evidence.evidenceClass,
      baselineCoreScore: source.rawScore,
    });
    if (generated.length >= limit) break;
  }

  return generated;
}

function hasRequiredPitchClasses(
  pitchClasses: ReadonlySet<number>,
  root: number,
  variant: FlatNineEvidenceVariant,
): boolean {
  const required = variant === "E1"
    ? [root, root + 4, root + 7, root + 10, root + 1]
    : [root, root + 4, root + 10, root + 1];
  return required.every((pitchClass) =>
    pitchClasses.has(((pitchClass % 12) + 12) % 12));
}

export function shadowCandidateToChord(
  candidate: AlteredDominantShadowCandidate,
): ChordSymbol {
  const root = noteNameToPitchClass(candidate.root);
  const bass = noteNameToPitchClass(candidate.bass);
  return makeFlatNineDominant(root, bass);
}

function eligibleForVariant(
  evidence: ReturnType<typeof analyzePhase48EventEvidence>,
  variant: FlatNineEvidenceVariant,
): boolean {
  if (variant === "E1") return evidence.e1Eligible;
  if (variant === "E2") return evidence.e2Eligible;
  return evidence.e3Eligible;
}

function deduplicateSourceRoots(
  candidates: readonly FlatNineSourceCandidate[],
): FlatNineSourceCandidate[] {
  const roots = new Set<number>();
  return candidates.filter((candidate) => {
    if (roots.has(candidate.chord.root)) return false;
    roots.add(candidate.chord.root);
    return true;
  });
}

function compareSourceCandidates(
  left: FlatNineSourceCandidate,
  right: FlatNineSourceCandidate,
): number {
  return right.rawScore - left.rawScore
    || left.chord.root - right.chord.root
    || (left.chord.bass ?? left.chord.root)
      - (right.chord.bass ?? right.chord.root)
    || left.chord.label.localeCompare(right.chord.label);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function noteNameToPitchClass(name: string): number {
  const pitchClass = [
    "C",
    "C#",
    "D",
    "Eb",
    "E",
    "F",
    "F#",
    "G",
    "Ab",
    "A",
    "Bb",
    "B",
  ].indexOf(name);
  if (pitchClass < 0) throw new Error(`Unsupported note name: ${name}`);
  return pitchClass;
}
