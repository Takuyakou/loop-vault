import type { ChordQuality, ChordSymbol } from "../types";
import {
  compareCandidate,
  enumerateSplitCandidates,
  pitchClass,
  type StyleVoicingCandidate,
} from "../voicingPractice/candidateTools";
import {
  chordToneDescriptors,
  pitchClassForDegreeLabel,
} from "../voicingPractice/tonePolicy";
import { STYLE_VOICING_REGISTER } from "../voicingPractice/register";
import type {
  VoicingCoverage,
  VoicingRuleContext,
  VoicingRuleFamily,
  VoicingRuleProvenance,
  VoicingBaseStudy,
  VoicingStudyModifiers,
  VoicingTopContext,
} from "./types";

export interface StudyRuleDefinition {
  readonly id: string;
  readonly study: VoicingBaseStudy;
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
}

export interface StudyGeneratedCandidate {
  readonly candidate: StyleVoicingCandidate;
  readonly rule: StudyRuleDefinition;
}

export interface GenerateStudyCandidatesOptions {
  readonly maxLeftHandSpanSemitones: number;
  readonly maxRightHandSpanSemitones: number;
  readonly modifiers?: Partial<VoicingStudyModifiers>;
}

interface StudyTemplate {
  readonly variantId: string;
  readonly leftDegrees: readonly string[];
  readonly rightDegrees: readonly string[];
  readonly omittedDegrees: readonly string[];
  readonly addedDegrees: readonly string[];
  readonly coverage: VoicingCoverage;
  readonly requireOpenWidth?: boolean;
}

const MAX_CANDIDATES_PER_TEMPLATE = 4;
const REDUCIBLE_FIFTH = "5";
const OPTIONAL_NATURAL_NINTH = "9";

/**
 * Generates lesson candidates from chord-family semantics. Research rule IDs are
 * deliberately not consulted here: the research corpus verifies these
 * strategies instead of acting as a runtime whitelist.
 */
export function generateStudyCandidates(
  chord: ChordSymbol,
  study: VoicingBaseStudy,
  context: VoicingRuleContext,
  options: GenerateStudyCandidatesOptions,
): readonly StudyGeneratedCandidate[] {
  const modifiers = {
    color: options.modifiers?.color ?? false,
    open: options.modifiers?.open ?? false,
  };
  const templates = templatesForStudy(chord, study, context, modifiers);
  const family = familyForStudy(study, modifiers);
  const topRole: VoicingTopContext = context.top === "fixed-melody"
    ? "fixed-melody"
    : study === "teacher" ? "top-candidate" : "normal-voicing-top";
  const provenance = provenanceForStudy(study);

  const generated = templates.flatMap((template) => {
    const leftPitchClasses = degreePitchClasses(chord, template.leftDegrees);
    const rightPitchClasses = degreePitchClasses(chord, template.rightDegrees);
    if (!leftPitchClasses || !rightPitchClasses) return [];

    const rule = freezeRule({
      id: generatorRuleId(study, chord.quality),
      study,
      family,
      variantId: template.variantId,
      coverage: template.coverage,
      leftDegrees: template.leftDegrees,
      rightDegrees: template.rightDegrees,
      omittedDegrees: template.omittedDegrees,
      addedDegrees: template.addedDegrees,
      requiredBassContext: context.bass,
      topRole,
      provenance,
    });

    const placements = enumerateSplitCandidates(
      chord,
      "lesson-v2",
      leftPitchClasses,
      rightPitchClasses,
      {
        variant: template.variantId,
        requiredIntervals: [...template.leftDegrees, ...template.rightDegrees],
        addedColorIntervals: [...template.addedDegrees],
        omittedIntervals: [...template.omittedDegrees],
        warnings: [],
      },
      {
        ...options,
        requireOpenWidth: template.requireOpenWidth,
      },
    );
    const slashAnchoredPlacements = hasSlashBass(chord)
      ? placements.filter(({ leftHandNotes }) => leftHandNotes[0] === stableSlashBassNote(chord))
      : placements;
    const fixedTopPlacements = context.top === "fixed-melody"
      && context.fixedMelodyMidiNote !== undefined
      ? slashAnchoredPlacements.filter(({ allNotes }) => allNotes[allNotes.length - 1] === context.fixedMelodyMidiNote)
      : slashAnchoredPlacements;
    const rankedPlacements = modifiers.open
      ? [...fixedTopPlacements].sort(compareOpenPlacement)
      : fixedTopPlacements;
    return rankedPlacements.slice(0, MAX_CANDIDATES_PER_TEMPLATE).map((candidate) => ({
      candidate: {
        ...candidate,
        intrinsicCost: studyCandidateIntrinsicCost(study, chord, template),
        guideToneNotes: guideToneNotes(chord, candidate),
      },
      rule,
    }));
  });
  return generated.sort((left, right) => (
    compareCandidate(left.candidate, right.candidate)
    || left.rule.variantId.localeCompare(right.rule.variantId)
  ));
}

function templatesForStudy(
  chord: ChordSymbol,
  study: VoicingBaseStudy,
  context: VoicingRuleContext,
  modifiers: VoicingStudyModifiers,
): readonly StudyTemplate[] {
  const literalDegrees = chordDegrees(chord);
  if (literalDegrees.length === 0) return [];
  const extended = extendedReductionTemplates(
    chord,
    literalDegrees,
    context,
    study === "teacher" ? "teacher" : "core",
  );
  const base = extended ?? (study === "teacher"
    ? fullAndReductionTemplates(chord, literalDegrees, context, "teacher")
    : coreTemplates(chord, literalDegrees, context));
  return base.map((template) => applyModifiers(chord, literalDegrees, template, modifiers));
}

function extendedReductionTemplates(
  chord: ChordSymbol,
  literalDegrees: readonly string[],
  context: VoicingRuleContext,
  prefix: "teacher" | "core",
): readonly StudyTemplate[] | undefined {
  if (!isExtendedReductionFamily(literalDegrees)) return undefined;

  const split = splitDegrees(chord, literalDegrees, context);
  const splits = [split, ...chromaticClusterReliefSplits(chord, split)];
  return splits.flatMap((candidateSplit, index) => reductionSeries(
    chord,
    literalDegrees,
    candidateSplit,
    index === 0 ? prefix : prefix + "-cluster-spread",
  ));
}

function reductionSeries(
  chord: ChordSymbol,
  literalDegrees: readonly string[],
  split: { readonly left: readonly string[]; readonly right: readonly string[] },
  prefix: string,
): readonly StudyTemplate[] {
  const templates: StudyTemplate[] = [createTemplate(
    literalDegrees,
    prefix + "-literal",
    split.left,
    split.right,
    [],
  )];
  const canOmitFifth = split.right.includes(REDUCIBLE_FIFTH);
  if (canOmitFifth) {
    templates.push(createTemplate(
      literalDegrees,
      prefix + "-omit-5",
      split.left,
      split.right.filter((degree) => degree !== REDUCIBLE_FIFTH),
      [],
    ));
  }

  const canOmitNaturalNinth = split.right.includes(OPTIONAL_NATURAL_NINTH)
    && !chord.tensions.includes(OPTIONAL_NATURAL_NINTH);
  if (canOmitNaturalNinth) {
    const removable = canOmitFifth
      ? [REDUCIBLE_FIFTH, OPTIONAL_NATURAL_NINTH]
      : [OPTIONAL_NATURAL_NINTH];
    templates.push(createTemplate(
      literalDegrees,
      prefix + "-omit-" + removable.join("-"),
      split.left,
      split.right.filter((degree) => !removable.includes(degree)),
      [],
    ));
  }

  return templates;
}

function chromaticClusterReliefSplits(
  chord: ChordSymbol,
  split: { readonly left: readonly string[]; readonly right: readonly string[] },
): readonly { readonly left: readonly string[]; readonly right: readonly string[] }[] {
  if (hasSlashBass(chord)) return [];
  const pitchClasses = split.right.flatMap((degree) => {
    const value = pitchClassForDegreeLabel(chord, degree);
    return value === undefined ? [] : [value];
  });
  if (!hasChromaticRunOfThree(pitchClasses)) return [];
  const movableGuide = ["3", "b3"].find((degree) => split.right.includes(degree));
  const leftAnchor = ["7", "b7", "bb7", "6"].find((degree) => split.left.includes(degree));
  if (!movableGuide || !leftAnchor) return [];
  return [{
    left: Object.freeze([
      ...split.left.filter((degree) => degree !== leftAnchor),
      movableGuide,
    ]),
    right: Object.freeze([
      ...split.right.filter((degree) => degree !== movableGuide),
      leftAnchor,
    ]),
  }];
}

function hasChromaticRunOfThree(pitchClasses: readonly number[]): boolean {
  const values = new Set(pitchClasses.map(pitchClass));
  return [...values].some((value) => (
    values.has(pitchClass(value + 1)) && values.has(pitchClass(value + 2))
  ));
}

function isExtendedReductionFamily(literalDegrees: readonly string[]): boolean {
  const hasSeventhIdentity = ["7", "b7", "bb7"].some((degree) => (
    literalDegrees.includes(degree)
  ));
  const hasExtendedIdentity = ["11", "#11", "13", "b13"].some((degree) => (
    literalDegrees.includes(degree)
  ));
  return hasSeventhIdentity && hasExtendedIdentity;
}

function applyModifiers(
  chord: ChordSymbol,
  literalDegrees: readonly string[],
  template: StudyTemplate,
  modifiers: VoicingStudyModifiers,
): StudyTemplate {
  const additions = modifiers.color ? safeColorAdditions(chord, literalDegrees) : [];
  const rightDegrees = unique([...template.rightDegrees, ...additions]);
  return createTemplate(
    literalDegrees,
    [template.variantId, modifiers.color ? "color" : "", modifiers.open ? "open" : ""]
      .filter(Boolean)
      .join("-"),
    template.leftDegrees,
    rightDegrees,
    unique([...template.addedDegrees, ...additions]),
    modifiers.open,
  );
}

function fullAndReductionTemplates(
  chord: ChordSymbol,
  literalDegrees: readonly string[],
  context: VoicingRuleContext,
  prefix: string,
  requireOpenWidth = false,
): readonly StudyTemplate[] {
  const split = splitDegrees(chord, literalDegrees, context);
  const full = createTemplate(
    literalDegrees,
    prefix + "-literal",
    split.left,
    split.right,
    [],
    requireOpenWidth,
  );
  const reducedRight = split.right.filter((degree) => degree !== REDUCIBLE_FIFTH);
  const extendedFamily = ["maj9", "min9", "dom9", "min11", "dom13"].includes(chord.quality);
  const canReduceFifth = split.right.includes(REDUCIBLE_FIFTH)
    && (split.right.length >= 4 || (extendedFamily && split.right.length >= 3))
    && reducedRight.length > 0;
  if (!canReduceFifth) return [full];

  return [
    full,
    createTemplate(
      literalDegrees,
      prefix + "-omit-5",
      split.left,
      reducedRight,
      [],
      requireOpenWidth,
    ),
  ];
}

function coreTemplates(
  chord: ChordSymbol,
  literalDegrees: readonly string[],
  context: VoicingRuleContext,
): readonly StudyTemplate[] {
  const coreDegrees = coreDegreesForChord(chord, literalDegrees);
  const split = splitDegrees(chord, coreDegrees, context);
  const compact = createTemplate(
    literalDegrees,
    "core",
    split.left,
    split.right,
    [],
  );

  if (compact.omittedDegrees.length === 0) return [compact];
  const literalSplit = splitDegrees(chord, literalDegrees, context);
  const literal = createTemplate(
    literalDegrees,
    "core-literal",
    literalSplit.left,
    literalSplit.right,
    [],
  );
  return [compact, literal];
}

function studyCandidateIntrinsicCost(
  study: VoicingBaseStudy,
  chord: ChordSymbol,
  template: StudyTemplate,
): number {
  const noteCount = unique([...template.leftDegrees, ...template.rightDegrees]).length;
  const omissionCount = template.omittedDegrees.length;
  const omissionBudget = omissionBudgetFor(chord, template);
  const omissionPenalty = omissionCount * (
    study === "teacher" ? 2 : hasSlashBass(chord) ? 5 : 1
  );
  const excessiveOmissionPenalty = Math.max(0, omissionCount - omissionBudget) * 10;
  const minimumDensity = study === "teacher" ? 4 : 3;
  const maximumDensity = study === "teacher" ? 5 : 4;
  const sparsePenalty = Math.max(0, minimumDensity - noteCount) * 8;
  const densePenalty = Math.max(0, noteCount - maximumDensity) * (study === "teacher" ? 3 : 2);
  const enrichmentPenalty = template.addedDegrees.length;
  return omissionPenalty + excessiveOmissionPenalty + sparsePenalty + densePenalty + enrichmentPenalty;
}

function omissionBudgetFor(chord: ChordSymbol, template: StudyTemplate): number {
  const representedDegrees = unique([...template.leftDegrees, ...template.rightDegrees]);
  const literalDegrees = unique([...representedDegrees, ...template.omittedDegrees]);
  if (isExtendedReductionFamily(literalDegrees)) return 2;
  if (["maj9", "min9", "dom9", "min11", "dom13"].includes(chord.quality)) return 1;
  return 1;
}

function guideToneNotes(
  chord: ChordSymbol,
  candidate: StyleVoicingCandidate,
): number[] {
  const guideDegrees = ["3", "b3", "4", "7", "b7", "bb7"];
  const guidePitchClasses = new Set(guideDegrees.flatMap((degree) => {
    const value = pitchClassForDegreeLabel(chord, degree);
    return value === undefined ? [] : [value];
  }));
  return candidate.allNotes.filter((note) => guidePitchClasses.has(pitchClass(note)));
}

function createTemplate(
  literalDegrees: readonly string[],
  variantId: string,
  leftDegrees: readonly string[],
  rightDegrees: readonly string[],
  addedDegrees: readonly string[],
  requireOpenWidth = false,
): StudyTemplate {
  const represented = unique([...leftDegrees, ...rightDegrees]);
  const omittedDegrees = literalDegrees.filter((degree) => !represented.includes(degree));
  const coverage: VoicingCoverage = addedDegrees.length > 0
    ? "creative-enrichment"
    : omittedDegrees.length > 0
      ? "performance-reduction"
      : "literal";
  return Object.freeze({
    variantId,
    leftDegrees: Object.freeze([...leftDegrees]),
    rightDegrees: Object.freeze([...rightDegrees]),
    omittedDegrees: Object.freeze([...omittedDegrees]),
    addedDegrees: Object.freeze([...addedDegrees]),
    coverage,
    ...(requireOpenWidth ? { requireOpenWidth: true } : {}),
  });
}

function splitDegrees(
  chord: ChordSymbol,
  degrees: readonly string[],
  context: VoicingRuleContext,
): { readonly left: readonly string[]; readonly right: readonly string[] } {
  if (hasSlashBass(chord)) {
    const suppliedDegree = degreeForPitchClass(chord, chord.bass!);
    return {
      left: Object.freeze([suppliedDegree ?? "Bass"]),
      right: Object.freeze(degrees.filter((degree) => degree !== suppliedDegree)),
    };
  }

  const anchor = ["7", "b7", "bb7", "6"].find((degree) => degrees.includes(degree));
  const left = context.bass === "external-bass"
    ? unique(anchor ? [anchor] : [])
    : unique(["1", ...(anchor ? [anchor] : [])]).filter((degree) => degrees.includes(degree));
  let right = degrees.filter((degree) => !left.includes(degree));
  if (right.length === 0 && left.length > 1) {
    right = [left[left.length - 1]!];
    left.pop();
  }
  return {
    left: Object.freeze(left),
    right: Object.freeze(right),
  };
}

function coreDegreesForChord(
  chord: ChordSymbol,
  literalDegrees: readonly string[],
): readonly string[] {
  if (hasSlashBass(chord) && chord.quality === "add9") return literalDegrees;
  if (
    hasSlashBass(chord)
    && ["maj9", "min9", "min11"].includes(chord.quality)
  ) {
    return literalDegrees.filter((degree) => degree !== REDUCIBLE_FIFTH);
  }

  const byQuality: Readonly<Record<ChordQuality, readonly string[]>> = {
    maj: ["1", "3", "5"],
    min: ["1", "b3", "5"],
    dim: ["1", "b3", "b5"],
    aug: ["1", "3", "#5"],
    maj7: ["1", "3", "7"],
    min7: ["1", "b3", "b7"],
    dom7: ["1", "3", "b7"],
    min7b5: ["1", "b3", "b5", "b7"],
    dim7: ["1", "b3", "b5", "bb7"],
    maj9: ["1", "3", "7", "9"],
    min9: ["1", "b3", "b7", "9"],
    dom9: ["1", "3", "b7", "9"],
    min11: ["1", "b3", "b7", "9", "11"],
    dom13: ["1", "3", "b7", "13"],
    sus2: ["1", "2", "5"],
    sus4: ["1", "4", "5"],
    dom7sus4: ["1", "4", "5", "b7"],
    add9: ["1", "3", "5", "9"],
    six: ["1", "3", "6"],
    min6: ["1", "b3", "6"],
    sixNine: ["1", "3", "6", "9"],
    add13: ["1", "3", "5", "13"],
    minMaj7: ["1", "b3", "7"],
    power: ["1", "5"],
    dom11: ["1", "3", "b7", "9", "11"],
  };
  const requested = unique([...byQuality[chord.quality], ...chord.tensions]);
  return requested.filter((degree) => literalDegrees.includes(degree));
}

function safeColorAdditions(
  chord: ChordSymbol,
  literalDegrees: readonly string[],
): readonly string[] {
  const candidates: readonly string[] = colorCandidatesForQuality(chord.quality);
  const occupiedPitchClasses = new Set(literalDegrees.flatMap((degree) => {
    const value = pitchClassForDegreeLabel(chord, degree);
    return value === undefined ? [] : [value];
  }));
  const addition = candidates.find((degree) => {
    const value = pitchClassForDegreeLabel(chord, degree);
    return value !== undefined && !occupiedPitchClasses.has(value);
  });
  return addition ? Object.freeze([addition]) : Object.freeze([]);
}

function colorCandidatesForQuality(quality: ChordQuality): readonly string[] {
  switch (quality) {
    case "maj":
    case "maj7":
    case "maj9":
    case "add9":
    case "add13":
    case "six":
    case "sixNine":
    case "aug":
      return ["9", "13", "#11"];
    case "min":
    case "min7":
    case "min9":
    case "min11":
    case "minMaj7":
    case "min6":
      return ["9", "11", "13"];
    case "dom7":
    case "dom9":
    case "dom13":
    case "dom11":
      return ["9", "13", "#11"];
    case "sus2":
    case "sus4":
    case "dom7sus4":
      return ["9", "13"];
    case "min7b5":
      return ["11"];
    case "dim":
    case "dim7":
    case "power":
      return [];
  }
}

function chordDegrees(chord: ChordSymbol): readonly string[] {
  return Object.freeze(unique(chordToneDescriptors(chord).map(({ label }) => (
    label === "R" ? "1" : label
  ))));
}

function degreeForPitchClass(chord: ChordSymbol, value: number): string | undefined {
  return chordDegrees(chord).find((degree) => (
    pitchClassForDegreeLabel(chord, degree) === pitchClass(value)
  ));
}

function degreePitchClasses(
  chord: ChordSymbol,
  degrees: readonly string[],
): number[] | undefined {
  const values = degrees.map((degree) => pitchClassForDegreeLabel(chord, degree));
  return values.every(isNumber) ? values : undefined;
}

function familyForStudy(
  study: VoicingBaseStudy,
  modifiers: VoicingStudyModifiers,
): VoicingRuleFamily {
  if (modifiers.open) return study === "teacher" ? "teacher-open" : "open-spread";
  if (modifiers.color) return "family-color";
  return study === "teacher" ? "teacher-style" : "family-core";
}

function provenanceForStudy(study: VoicingBaseStudy): VoicingRuleProvenance {
  if (study === "teacher") {
    return Object.freeze({
      kind: "teacher-derived-generalized",
      sourceIds: Object.freeze(["T01", "T03", "T08"]),
      note: "App-generated pitches and octaves from teacher-derived principles; not a teacher-specified chord voicing.",
    });
  }
  return Object.freeze({
    kind: "analysis-proposal",
    sourceIds: Object.freeze(["P5.33-FAMILY-GENERATOR"]),
    note: "App-generated family strategy validated against the research semantic corpus.",
  });
}

function generatorRuleId(study: VoicingBaseStudy, quality: ChordQuality): string {
  return "P5.33-GEN-" + study.toUpperCase() + "-" + quality.toUpperCase();
}

function freezeRule(rule: StudyRuleDefinition): StudyRuleDefinition {
  return Object.freeze({
    ...rule,
    leftDegrees: Object.freeze([...rule.leftDegrees]),
    rightDegrees: Object.freeze([...rule.rightDegrees]),
    omittedDegrees: Object.freeze([...rule.omittedDegrees]),
    addedDegrees: Object.freeze([...rule.addedDegrees]),
    provenance: Object.freeze({
      ...rule.provenance,
      sourceIds: Object.freeze([...rule.provenance.sourceIds]),
    }),
  });
}

function compareOpenPlacement(
  left: StyleVoicingCandidate,
  right: StyleVoicingCandidate,
): number {
  return handSpan(right.rightHandNotes) - handSpan(left.rightHandNotes)
    || handSpan(right.allNotes) - handSpan(left.allNotes)
    || left.rightHandNotes.join(".").localeCompare(right.rightHandNotes.join("."))
    || left.leftHandNotes.join(".").localeCompare(right.leftHandNotes.join("."));
}

function handSpan(notes: readonly number[]): number {
  return notes.length < 2 ? 0 : notes[notes.length - 1]! - notes[0]!;
}
function hasSlashBass(chord: ChordSymbol): boolean {
  return chord.bass !== undefined && pitchClass(chord.bass) !== pitchClass(chord.root);
}

function stableSlashBassNote(chord: ChordSymbol): number | undefined {
  if (!hasSlashBass(chord)) return undefined;
  const bassPitchClass = pitchClass(chord.bass!);
  const candidates: number[] = [];
  for (
    let note = STYLE_VOICING_REGISTER.leftHandMin;
    note <= STYLE_VOICING_REGISTER.leftHandMax;
    note += 1
  ) {
    if (pitchClass(note) === bassPitchClass) candidates.push(note);
  }
  return candidates.sort((left, right) => (
    Math.abs(left - STYLE_VOICING_REGISTER.leftHandCenter)
    - Math.abs(right - STYLE_VOICING_REGISTER.leftHandCenter)
    || left - right
  ))[0];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isNumber(value: number | undefined): value is number {
  return value !== undefined;
}
