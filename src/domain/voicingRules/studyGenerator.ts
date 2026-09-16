import type { ChordQuality, ChordSymbol } from "../types";
import {
  enumerateSplitCandidates,
  pitchClass,
  type StyleVoicingCandidate,
} from "../voicingPractice/candidateTools";
import {
  chordToneDescriptors,
  pitchClassForDegreeLabel,
} from "../voicingPractice/tonePolicy";
import type {
  VoicingCoverage,
  VoicingRuleContext,
  VoicingRuleFamily,
  VoicingRuleProvenance,
  VoicingStudyCategory,
  VoicingTopContext,
} from "./types";

export interface StudyRuleDefinition {
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
}

export interface StudyGeneratedCandidate {
  readonly candidate: StyleVoicingCandidate;
  readonly rule: StudyRuleDefinition;
}

export interface GenerateStudyCandidatesOptions {
  readonly maxLeftHandSpanSemitones: number;
  readonly maxRightHandSpanSemitones: number;
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

/**
 * Generates lesson candidates from chord-family semantics. Research rule IDs are
 * deliberately not consulted here: the research corpus verifies these
 * strategies instead of acting as a runtime whitelist.
 */
export function generateStudyCandidates(
  chord: ChordSymbol,
  study: VoicingStudyCategory,
  context: VoicingRuleContext,
  options: GenerateStudyCandidatesOptions,
): readonly StudyGeneratedCandidate[] {
  const templates = templatesForStudy(chord, study, context);
  const family = familyForStudy(study);
  const topRole: VoicingTopContext = study === "teacher"
    ? "top-candidate"
    : "normal-voicing-top";
  const provenance = provenanceForStudy(study);

  return templates.flatMap((template) => {
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
    const rankedPlacements = study === "open"
      ? [...placements].sort(compareOpenPlacement)
      : placements;
    return rankedPlacements.slice(0, MAX_CANDIDATES_PER_TEMPLATE).map((candidate) => ({
      candidate,
      rule,
    }));
  });
}

function templatesForStudy(
  chord: ChordSymbol,
  study: VoicingStudyCategory,
  context: VoicingRuleContext,
): readonly StudyTemplate[] {
  const literalDegrees = chordDegrees(chord);
  if (literalDegrees.length === 0) return [];

  switch (study) {
    case "teacher":
      return fullAndReductionTemplates(chord, literalDegrees, context, "teacher");
    case "core":
      return coreTemplates(chord, literalDegrees, context);
    case "color":
      return colorTemplates(chord, literalDegrees, context);
    case "open":
      return fullAndReductionTemplates(chord, literalDegrees, context, "open", true);
  }
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
  const canReduceFifth = split.right.includes(REDUCIBLE_FIFTH)
    && split.right.length >= 4
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

  if (!hasSlashBass(chord) || compact.omittedDegrees.length === 0) return [compact];
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

function colorTemplates(
  chord: ChordSymbol,
  literalDegrees: readonly string[],
  context: VoicingRuleContext,
): readonly StudyTemplate[] {
  const additions = safeColorAdditions(chord, literalDegrees);
  const split = splitDegrees(chord, literalDegrees, context);
  const rightWithColor = unique([...split.right, ...additions]);
  const full = createTemplate(
    literalDegrees,
    additions.length > 0 ? "color-enrichment" : "color-literal",
    split.left,
    rightWithColor,
    additions,
  );
  const reducedRight = rightWithColor.filter((degree) => degree !== REDUCIBLE_FIFTH);
  if (!rightWithColor.includes(REDUCIBLE_FIFTH) || rightWithColor.length < 4) return [full];

  return [
    full,
    createTemplate(
      literalDegrees,
      additions.length > 0 ? "color-enrichment-omit-5" : "color-literal-omit-5",
      split.left,
      reducedRight,
      additions,
    ),
  ];
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
    case "six":
    case "sixNine":
    case "aug":
      return ["9", "13", "#11"];
    case "min":
    case "min7":
    case "min9":
    case "min11":
    case "min6":
      return ["9", "11", "13"];
    case "dom7":
    case "dom9":
    case "dom13":
      return ["9", "13", "#11"];
    case "sus2":
    case "sus4":
    case "dom7sus4":
      return ["9", "13"];
    case "min7b5":
      return ["11"];
    case "dim":
    case "dim7":
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

function familyForStudy(study: VoicingStudyCategory): VoicingRuleFamily {
  switch (study) {
    case "teacher": return "teacher-style";
    case "core": return "family-core";
    case "color": return "family-color";
    case "open": return "open-spread";
  }
}

function provenanceForStudy(study: VoicingStudyCategory): VoicingRuleProvenance {
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

function generatorRuleId(study: VoicingStudyCategory, quality: ChordQuality): string {
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

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isNumber(value: number | undefined): value is number {
  return value !== undefined;
}
