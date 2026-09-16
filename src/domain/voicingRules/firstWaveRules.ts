import type { ChordSymbol, Tension } from "../types";
import {
  enumerateSplitCandidates,
  pitchClass,
  type StyleVoicingCandidate,
} from "../voicingPractice/candidateTools";
import { pitchClassForDegreeLabel } from "../voicingPractice/tonePolicy";
import type {
  VoicingCoverage,
  VoicingRuleContext,
  VoicingRuleFamily,
  VoicingRuleProvenance,
  VoicingStudyCategory,
  VoicingTopContext,
} from "./types";

export interface FirstWaveRuleDefinition {
  readonly id: string;
  readonly study: VoicingStudyCategory;
  readonly family: VoicingRuleFamily;
  readonly variantId: string;
  readonly coverage: VoicingCoverage;
  readonly leftDegrees: readonly string[];
  readonly rightDegrees: readonly string[];
  readonly omittedDegrees: readonly string[];
  readonly addedDegrees: readonly string[];
  readonly requiredBassContext: VoicingRuleContext["bass"];
  readonly topRole: VoicingTopContext;
  readonly provenance: VoicingRuleProvenance;
  readonly matches: (chord: ChordSymbol) => boolean;
}

export interface FirstWaveCandidate {
  readonly candidate: StyleVoicingCandidate;
  readonly rule: FirstWaveRuleDefinition;
}

export interface GenerateFirstWaveCandidatesOptions {
  readonly maxLeftHandSpanSemitones: number;
  readonly maxRightHandSpanSemitones: number;
}

const analysis = (sourceIds: readonly string[], note: string): VoicingRuleProvenance => ({
  kind: "analysis-proposal",
  sourceIds,
  note,
});

const externalTheory = (sourceIds: readonly string[], note: string): VoicingRuleProvenance => ({
  kind: "external-theory",
  sourceIds,
  note,
});

const teacher = (sourceIds: readonly string[], note: string): VoicingRuleProvenance => ({
  kind: "teacher-evidence",
  sourceIds,
  note,
});

const legacy = (note: string): VoicingRuleProvenance => ({
  kind: "legacy-product-rule",
  sourceIds: [],
  note,
});

const FIRST_WAVE_RULES: readonly FirstWaveRuleDefinition[] = Object.freeze([
  rule("V01", "core", "slash-bass-upper-structure", "inversion", "literal", ["3"], ["5", "1", "3"], [], [], "self-played", ["T03", "W07"], analysis, (chord) => chord.quality === "maj" && slashInterval(chord) === 4),
  rule("V03", "core", "slash-bass-upper-structure", "add9-over-9", "literal", ["9"], ["1", "3", "5"], [], [], "self-played", ["T03", "W07", "W18"], analysis, (chord) => chord.root === 4 && chord.quality === "add9" && slashInterval(chord) === 2),
  rule("V04", "core", "bass-guide-tones", "minor-seven", "performance-reduction", ["1"], ["b3", "b7"], ["5"], [], "self-played", ["W13", "W06"], externalTheory, (chord) => chord.quality === "min7" && !hasSlashBass(chord)),
  rule("V06", "teacher", "teacher-open", "minor-seven-top-candidate", "literal", ["1", "b7"], ["b3", "5"], [], [], "self-played", ["T01", "W06"], teacher, (chord) => chord.quality === "min7" && !hasSlashBass(chord), "top-candidate"),
  rule("V15", "open", "two-hand-open", "minor-nine-spread", "literal", ["1", "b7"], ["b3", "5", "9"], [], [], "self-played", ["W01", "W06"], analysis, (chord) => chord.quality === "min9" && !hasSlashBass(chord)),
  rule("V16", "open", "two-hand-open", "open-triad", "literal", ["1", "5"], ["3", "1"], [], [], "self-played", ["W18", "W01"], analysis, (chord) => chord.quality === "maj" && !hasSlashBass(chord)),
  rule("V17", "open", "drop-2", "drop-two", "literal", ["5"], ["1", "3", "7"], [], [], "external-bass", ["W10"], externalTheory, (chord) => chord.quality === "maj7" && !hasSlashBass(chord)),
  rule("V20", "color", "dominant-upper-structure", "major-upper-structure", "performance-reduction", ["3", "b7"], ["9", "#11", "13"], ["5"], [], "external-bass", ["T08", "W08"], analysis, (chord) => chord.quality === "dom13" && hasTensions(chord, "#11")),
  rule("V21", "color", "dominant-upper-structure", "altered-minor-upper-structure", "performance-reduction", ["1", "b7"], ["b9", "3", "b13"], ["5"], [], "self-played", ["T08", "T04", "W08", "W19"], analysis, (chord) => chord.quality === "dom7" && hasTensions(chord, "b9", "b13")),
  rule("V22", "core", "slash-bass-upper-structure", "minor-nine-over-third", "literal", ["b3"], ["1", "9", "5", "b7"], [], [], "self-played", ["T03", "W07"], analysis, (chord) => chord.quality === "min9" && slashInterval(chord) === 3),
  rule("V23", "core", "slash-bass-upper-structure", "minor-eleven-over-nine", "performance-reduction", ["9"], ["1", "b3", "11", "b7"], ["5"], [], "self-played", ["T03", "W07", "W09"], analysis, (chord) => chord.quality === "min11" && slashInterval(chord) === 2),
  rule("V24", "core", "slash-bass-upper-structure", "add9-over-9", "literal", ["9"], ["1", "3", "5"], [], [], "self-played", ["T03", "W07", "W18"], analysis, (chord) => chord.root === 2 && chord.quality === "add9" && slashInterval(chord) === 2),
  rule("V25", "core", "slash-bass-upper-structure", "compact", "performance-reduction", ["9"], ["7", "1", "3"], ["5"], [], "self-played", ["T03", "W07", "W13"], analysis, (chord) => chord.quality === "maj9" && slashInterval(chord) === 2),
  rule("V26", "core", "slash-bass-upper-structure", "full", "literal", ["9"], ["5", "7", "1", "3"], [], [], "self-played", ["T03", "W07"], analysis, (chord) => chord.quality === "maj9" && slashInterval(chord) === 2),
  rule("V29", "core", "characteristic-core", "half-diminished", "literal", ["1"], ["b7", "b3", "b5"], [], [], "self-played", ["W01", "W13"], externalTheory, (chord) => chord.quality === "min7b5" && !hasSlashBass(chord)),
  rule("V30", "core", "characteristic-core", "diminished-seven", "literal", ["1"], ["b3", "b5", "bb7"], [], [], "self-played", ["T01", "T27", "W01"], analysis, (chord) => chord.quality === "dim7" && !hasSlashBass(chord)),
  rule("V31", "core", "slash-bass-upper-structure", "upper-triad-over-b7", "literal", ["b7"], ["1", "3", "5"], [], [], "self-played", ["T03", "W07", "W14"], analysis, (chord) => chord.quality === "maj" && slashInterval(chord) === 10),
  rule("V32", "core", "characteristic-core", "six-nine", "literal", ["1", "6"], ["9", "3", "5"], [], [], "self-played", ["W01", "W18"], externalTheory, (chord) => chord.quality === "sixNine" && !hasSlashBass(chord)),
  rule("V33", "core", "characteristic-core", "suspended-core", "literal", ["1", "b7"], ["4", "5"], [], [], "self-played", ["W01", "W18"], externalTheory, (chord) => chord.quality === "dom7sus4" && !hasSlashBass(chord)),
  compatibilityRule("P5.31-MAJ7", ["1"], ["3", "7"], ["5"], (chord) => chord.quality === "maj7" && !hasSlashBass(chord)),
  compatibilityRule("P5.31-DOM7", ["1"], ["3", "b7"], ["5"], (chord) => chord.quality === "dom7" && chord.tensions.length === 0 && !hasSlashBass(chord)),
  compatibilityRule("P5.31-MIN11", ["1"], ["b3", "b7", "11"], ["5", "9"], (chord) => chord.quality === "min11" && !hasSlashBass(chord)),
  compatibilityRule("P5.31-DOM13", ["1"], ["3", "b7", "13"], ["5", "9"], (chord) => chord.quality === "dom13" && chord.tensions.length === 0 && !hasSlashBass(chord)),
]);

export function firstWaveRuleDefinitions(): readonly FirstWaveRuleDefinition[] {
  return FIRST_WAVE_RULES;
}

export function generateFirstWaveCandidates(
  chord: ChordSymbol,
  study: VoicingStudyCategory,
  context: VoicingRuleContext,
  options: GenerateFirstWaveCandidatesOptions,
): readonly FirstWaveCandidate[] {
  return FIRST_WAVE_RULES
    .filter((definition) => definition.study === study
      && definition.requiredBassContext === context.bass
      && definition.matches(chord))
    .flatMap((definition) => generateForRule(chord, definition, options));
}

function generateForRule(
  chord: ChordSymbol,
  definition: FirstWaveRuleDefinition,
  options: GenerateFirstWaveCandidatesOptions,
): FirstWaveCandidate[] {
  const leftPitchClasses = degreePitchClasses(chord, definition.leftDegrees);
  const rightPitchClasses = degreePitchClasses(chord, definition.rightDegrees);
  if (!leftPitchClasses || !rightPitchClasses) return [];
  return enumerateSplitCandidates(
    chord,
    "lesson-v2",
    leftPitchClasses,
    rightPitchClasses,
    {
      variant: definition.variantId,
      requiredIntervals: [...definition.leftDegrees, ...definition.rightDegrees],
      addedColorIntervals: [...definition.addedDegrees],
      omittedIntervals: [...definition.omittedDegrees],
      warnings: [],
    },
    {
      ...options,
      requireOpenWidth: definition.family === "two-hand-open" || definition.family === "drop-2",
    },
  ).map((candidate) => ({ candidate, rule: definition }));
}

function rule(
  id: string,
  study: VoicingStudyCategory,
  family: VoicingRuleFamily,
  variantId: string,
  coverage: VoicingCoverage,
  leftDegrees: readonly string[],
  rightDegrees: readonly string[],
  omittedDegrees: readonly string[],
  addedDegrees: readonly string[],
  requiredBassContext: VoicingRuleContext["bass"],
  sourceIds: readonly string[],
  provenanceFactory: (sourceIds: readonly string[], note: string) => VoicingRuleProvenance,
  matches: (chord: ChordSymbol) => boolean,
  topRole: VoicingTopContext = "normal-voicing-top",
): FirstWaveRuleDefinition {
  return Object.freeze({
    id,
    study,
    family,
    variantId,
    coverage,
    leftDegrees: Object.freeze([...leftDegrees]),
    rightDegrees: Object.freeze([...rightDegrees]),
    omittedDegrees: Object.freeze([...omittedDegrees]),
    addedDegrees: Object.freeze([...addedDegrees]),
    requiredBassContext,
    topRole,
    provenance: Object.freeze(provenanceFactory(
      Object.freeze([...sourceIds]),
      "Pitch and degree accounting is promoted; concrete fingering remains downstream.",
    )),
    matches,
  });
}

function compatibilityRule(
  id: string,
  leftDegrees: readonly string[],
  rightDegrees: readonly string[],
  omittedDegrees: readonly string[],
  matches: (chord: ChordSymbol) => boolean,
): FirstWaveRuleDefinition {
  return rule(
    id,
    "core",
    "bass-guide-tones",
    "compatibility",
    "performance-reduction",
    leftDegrees,
    rightDegrees,
    omittedDegrees,
    [],
    "self-played",
    [],
    () => legacy("Existing approved product behavior retained at the compatibility boundary."),
    matches,
  );
}

function degreePitchClasses(chord: ChordSymbol, degrees: readonly string[]): number[] | undefined {
  const values = degrees.map((degree) => pitchClassForDegreeLabel(chord, degree));
  return values.every(isNumber) ? values : undefined;
}

function slashInterval(chord: ChordSymbol): number | undefined {
  return chord.bass === undefined ? undefined : pitchClass(chord.bass - chord.root);
}

function hasSlashBass(chord: ChordSymbol): boolean {
  return chord.bass !== undefined && pitchClass(chord.bass) !== pitchClass(chord.root);
}

function hasTensions(chord: ChordSymbol, ...required: Tension[]): boolean {
  return required.every((tension) => chord.tensions.includes(tension));
}

function isNumber(value: number | undefined): value is number {
  return value !== undefined;
}
