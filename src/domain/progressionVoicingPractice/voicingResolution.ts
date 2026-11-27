import type { ChordSymbol } from "../types";
import {
  buildShapeVoicing, pickShapeForm, placementNotes,
  type GeneratedShapeOptions, type ShapeVoicingPlacement, type ShapeVoicingResult, type VoicingShapeOptions,
} from "../voicingShapes";
import { optimizeShapeProgression } from "../voicingShapes/optimize";
import { buildBasicWithParts } from "../voicingShapes/basicParts";
import { usedShapeName } from "../voicingShapes/names";
import { build as buildRecipe } from "../voicingShapes/recipe";
import { recChordOf } from "../voicingShapes";
import { textProgressionVoicingNotes } from "../textProgressionVoicing";
import { supportsLegacyGeneratedChord } from "../textChordConsumerCapabilities";
import { labelFromSymbol } from "../chords";
import { chordPitchClasses } from "../chordVoicing";
import {
  generateStudyCandidates,
  type StudyGeneratedCandidate,
  type VoicingBaseStudy,
  type VoicingRuleContext,
} from "../voicingRules";
import {
  chordToneDescriptors,
  generateStyleCandidates,
  getStyleCompatibility,
  getStyleTonePolicy,
  intervalForDegreeLabel,
  optimizeCandidateGroups,
  selectChordLocalCandidates,
  pitchClassForDegreeLabel,
  rootlessTemplatesForChord,
} from "../voicingPractice";
import {
  enumerateSplitCandidates,
  pitchClass,
  type StyleVoicingCandidate,
} from "../voicingPractice/candidateTools";
import type {
  ProgressionPracticeChord,
  ProgressionPracticeEvent,
  ProgressionPracticeVoicingPlan,
  ProgressionPracticeVoicingResolution,
  ProgressionVoicingNoteFact,
  ProgressionVoicingPracticeSnapshot,
  ProgressionVoicingSelection,
  ResolvedProgressionPracticeVoicing,
} from "./types";

const DEFAULT_HAND_SPAN = 12;
const ALTERED_DEGREES = new Set(["b5", "#5", "b9", "#9", "#11", "b13"]);
const BASIC_STRUCTURAL_DEGREES = new Set(["R", "Bass", "2", "b3", "3", "4", "bb7", "b7", "7"]);

export interface ResolveProgressionPracticeVoicingsOptions {
  readonly maxLeftHandSpanSemitones?: number;
  readonly maxRightHandSpanSemitones?: number;
  readonly leftHandVariant?: "auto" | "A" | "B";
  readonly lessonStudyCategory?: VoicingBaseStudy;
  /** One explicit, visible substitute for an unsupported legacy detailed shape. */
  readonly detailedFallbackStudy?: VoicingBaseStudy;
  readonly lessonColorEnabled?: boolean;
  readonly lessonOpenEnabled?: boolean;
  readonly lessonProgressionOptimization?: boolean;
  /** Session-only, zero-based candidate overrides keyed by immutable event id. */
  readonly lessonCandidateIndexes?: Readonly<Record<string, number>>;
  readonly lessonContext?: VoicingRuleContext;
  /** Session-only octave displacement. The detached source snapshot stays unchanged. */
  readonly octaveShift?: -2 | -1 | 0 | 1 | 2;
  /**
   * P25-08 L1: the 「形」 chosen for 自動生成 (`basic-full`). 基本 keeps today's rules (its parts follow K11);
   * the four K shapes are built by `buildShapeVoicing` (K3 / K6). Absent = today's behaviour.
   */
  readonly generatedShape?: GeneratedShapeOptions;
}

/**
 * Resolves the selected family. Fixed sources consume detached exact pitches;
 * only their missing X/N events use the marked, fixed Teacher fallback.
 * Generated selections consume audited rules, never implicit generated-close.
 */
export function resolveProgressionPracticeVoicings(
  snapshot: ProgressionVoicingPracticeSnapshot,
  options: ResolveProgressionPracticeVoicingsOptions = {},
): ProgressionPracticeVoicingPlan {
  const candidateOptions = {
    maxLeftHandSpanSemitones: options.maxLeftHandSpanSemitones ?? DEFAULT_HAND_SPAN,
    maxRightHandSpanSemitones: options.maxRightHandSpanSemitones ?? DEFAULT_HAND_SPAN,
  };

  const selection = snapshot.selection;
  if (selection === "saved" || selection === "source-midi" || selection === "custom") {
    const exact = snapshot.events.map((event) => resolveMyVoicing(event, selection));
    // A 0/N source stays unavailable. For X/N, generate only missing cards
    // with a fixed, chord-local Teacher policy. Exact notes never enter the
    // optimizer and cannot be moved by neighboring fallback candidates.
    if (!exact.some((resolution) => resolution.status === "SUPPORTED")
      || exact.every((resolution) => resolution.status === "SUPPORTED")) {
      return applyOctaveShift(freezePlan(snapshot, exact), options.octaveShift ?? 0);
    }
    const generated = resolveStudyVoicings(
      { ...snapshot, selection: "basic-full" }, "teacher",
      { bass: "self-played", top: "normal-voicing-top" },
      { ...candidateOptions, color: false, open: false, optimize: false },
    );
    const mixed = exact.map((resolution, index): ProgressionPracticeVoicingResolution => {
      if (resolution.status === "SUPPORTED") return resolution;
      const fallback = generated.events[index];
      return fallback?.status === "SUPPORTED"
        ? freezeResolution({ ...fallback, fallbackFrom: selection }) : resolution;
    });
    return applyOctaveShift(freezePlan(snapshot, mixed), options.octaveShift ?? 0);
  }

  const octave = options.octaveShift ?? 0;
  const shape = selection === "basic-full" ? options.generatedShape : undefined;
  if (shape !== undefined && shape.shape !== "basic") {
    return applyOctaveShift(
      resolveShapeVoicings(snapshot, shape as VoicingShapeOptions, options.lessonProgressionOptimization ?? true),
      octave,
    );
  }
  const parts = shape !== undefined && (shape.tension || shape.spread) ? { tension: shape.tension, spread: shape.spread } : undefined;
  // K12: a 基本 card today's rules cannot make is filled with the text intake's recommendation; K11: the parts.
  const finishBasic = (plan: ProgressionPracticeVoicingPlan): ProgressionPracticeVoicingPlan =>
    applyOctaveShift(selection === "basic-full" ? fillBasicGaps(snapshot, slashBassToGaps(snapshot, plan), parts) : plan, octave);

  if (options.lessonStudyCategory && selection !== "left-hand") {
    return finishBasic(
      resolveStudyVoicings(
        snapshot,
        options.lessonStudyCategory,
        options.lessonContext ?? { bass: "self-played", top: "normal-voicing-top" },
        {
          ...candidateOptions,
          color: shape !== undefined ? false : options.lessonColorEnabled ?? false,
          open: shape !== undefined ? false : options.lessonOpenEnabled ?? false,
          optimize: options.lessonProgressionOptimization ?? true,
          candidateIndexes: options.lessonCandidateIndexes,
          ...(parts === undefined ? {} : { parts }),
        },
      ),
    );
  }

  if (selection === "basic-full" && snapshot.textDerivedPolicyId === "text-defining-basic-full-v1") {
    return finishBasic(applyBasicParts(snapshot, resolveTextBasicFull(snapshot), parts));
  }

  const resolutions: ProgressionPracticeVoicingResolution[] = [];
  const candidateGroups: StyleVoicingCandidate[][] = [];
  const candidateIndexes: number[] = [];
  const factsByCandidate = new Map<StyleVoicingCandidate, CandidateFacts>();

  snapshot.events.forEach((event, index) => {
    if (!supportsLegacyGeneratedChord(event.chord)) {
      resolutions[index] = unsupportedRule(event.id);
      return;
    }
    const candidates = selection === "left-hand"
      ? leftHandCandidates(event.chord, candidateOptions, options.leftHandVariant ?? "auto")
      : basicCandidates(event.chord, selection, candidateOptions);

    if (candidates.status === "UNSUPPORTED_RULE") {
      resolutions[index] = unsupportedRule(event.id);
      return;
    }
    if (candidates.status === "GENERATION_ERROR") {
      resolutions[index] = generationError(event.id);
      return;
    }
    for (const candidate of candidates.candidates) {
      factsByCandidate.set(candidate.candidate, candidate.facts);
    }
    candidateGroups.push(candidates.candidates.map(({ candidate }) => candidate));
    candidateIndexes.push(index);
  });

  const optimized = optimizeCandidateGroups(candidateGroups);
  candidateIndexes.forEach((eventIndex, optimizedIndex) => {
    const event = snapshot.events[eventIndex]!;
    const candidate = optimized[optimizedIndex];
    const facts = candidate ? factsByCandidate.get(candidate) : undefined;
    resolutions[eventIndex] = candidate && facts
      ? supportedLessonResolution(event, selection, candidate, facts)
      : generationError(event.id);
  });

  if (options.detailedFallbackStudy) {
    const failed = snapshot.events.filter((_, index) => resolutions[index]?.status !== "SUPPORTED");
    if (failed.length) {
      // Resolve only failed events. Supported legacy shapes never enter this optimizer.
      const fallback = resolveStudyVoicings({ ...snapshot, events: failed }, options.detailedFallbackStudy,
        { bass: "self-played", top: "normal-voicing-top" },
        { ...candidateOptions, color: false, open: false, optimize: false });
      const byId = new Map(fallback.events.map(event => [event.eventId, event]));
      resolutions.forEach((original, index) => {
        if (original.status === "SUPPORTED") return;
        const substitute = byId.get(original.eventId);
        if (substitute?.status === "SUPPORTED") resolutions[index] = freezeResolution({ ...substitute,
          shapeFallback: Object.freeze({ from: selection, study: options.detailedFallbackStudy! }) });
      });
    }
  }
  return finishBasic(applyBasicParts(snapshot, freezePlan(snapshot, resolutions), parts));
}

/**
 * Text-only Generated candidates retain all accepted chord pitch classes.
 * Three bounded upper-register rotations feed the existing progression
 * optimizer, so neighboring cards still influence voice leading.
 */
function resolveTextBasicFull(snapshot: ProgressionVoicingPracticeSnapshot): ProgressionPracticeVoicingPlan {
  const supportedEvents = snapshot.events.filter(event => supportsLegacyGeneratedChord(event.chord));
  const groups = supportedEvents.map(event => {
    const chord = asChordSymbol(event.chord);
    const bassPc = pitchClass(chord.bass ?? chord.root);
    const bassNote = 43 + ((bassPc - 43 + 120) % 12);
    const upperPcs = chordPitchClasses(chord).filter(pc => pc !== bassPc);
    return [60, 64, 67].map(start => {
      const rightHandNotes = upperPcs.map(pc => start + ((pc - start % 12 + 12) % 12))
        .sort((left, right) => left - right);
      return {
        styleId: "lesson-v2" as const,
        leftHandNotes: [bassNote],
        rightHandNotes,
        allNotes: [bassNote, ...rightHandNotes],
        requiredIntervals: [],
        addedColorIntervals: [],
        omittedIntervals: [],
        warnings: [],
      } satisfies StyleVoicingCandidate;
    });
  });
  const optimized = optimizeCandidateGroups(groups);
  const byEvent = new Map(supportedEvents.map((event, index) => [event.id, optimized[index]]));
  const resolutions = snapshot.events.map(event => {
    if (!supportsLegacyGeneratedChord(event.chord)) return unsupportedRule(event.id);
    const candidate = byEvent.get(event.id);
    if (!candidate) return generationError(event.id);
    const midiNotes = Object.freeze([...candidate.allNotes]);
    const bassNote = candidate.leftHandNotes[0]!;
    return freezeResolution({
      eventId: event.id,
      status: "SUPPORTED" as const,
      voicing: freezeVoicing({
        origin: "basic-full",
        midiNotes,
        bassNote,
        leftHandNotes: Object.freeze([...candidate.leftHandNotes]),
        rightHandNotes: Object.freeze([...candidate.rightHandNotes]),
        addedColorDegrees: Object.freeze([]),
        notes: noteFacts(event.chord, midiNotes, [], bassNote),
      }),
    });
  });
  return freezePlan(snapshot, resolutions);
}

function resolveMyVoicing(
  event: ProgressionPracticeEvent,
  selection: "saved" | "source-midi" | "custom",
): ProgressionPracticeVoicingResolution {
  if (!event.voicing || event.voicing.kind !== selection) {
    return freezeResolution({
      eventId: event.id,
      status: "UNAVAILABLE",
      reason: "selected-source-unavailable",
    });
  }
  const midiNotes = Object.freeze([...event.voicing.midiNotes]);
  return freezeResolution({
    eventId: event.id,
    status: "SUPPORTED",
    voicing: freezeVoicing({
      origin: selection,
      midiNotes,
      ...(event.voicing.bassNote === undefined ? {} : { bassNote: event.voicing.bassNote }),
      addedColorDegrees: Object.freeze([]),
      notes: noteFacts(event.chord, midiNotes, [], event.voicing.bassNote),
      explanation: Object.freeze({
        source: selection === "saved" ? event.voicing.savedSource ?? "custom" : selection,
        omittedDegrees: Object.freeze([]),
        addedDegrees: Object.freeze([]),
      }),
    }),
  });
}

function resolveStudyVoicings(
  snapshot: ProgressionVoicingPracticeSnapshot,
  study: VoicingBaseStudy,
  context: VoicingRuleContext,
  options: {
    readonly maxLeftHandSpanSemitones: number;
    readonly maxRightHandSpanSemitones: number;
    readonly color: boolean;
    readonly open: boolean;
    readonly optimize: boolean;
    readonly candidateIndexes?: Readonly<Record<string, number>>;
    /** P25-08 K11: 基本's parts, put on each candidate before the optimizer chooses. */
    readonly parts?: { readonly tension: boolean; readonly spread: boolean };
  },
): ProgressionPracticeVoicingPlan {
  const resolutions: ProgressionPracticeVoicingResolution[] = [];
  const candidateGroups: StyleVoicingCandidate[][] = [];
  const candidateIndexes: number[] = [];
  const metadataByCandidate = new Map<StyleVoicingCandidate, StudyGeneratedCandidate>();
  const factsByCandidate = new Map<StyleVoicingCandidate, CandidateFacts>();

  snapshot.events.forEach((event, eventIndex) => {
    if (!supportsLegacyGeneratedChord(event.chord)) {
      resolutions[eventIndex] = unsupportedRule(event.id);
      return;
    }
    const candidates = generateStudyCandidates(asChordSymbol(event.chord), study, context, {
      ...options,
      modifiers: { color: options.color, open: options.open },
    });
    const resolved = candidates.flatMap((metadata) => {
      const facts = candidateFacts(
        asChordSymbol(event.chord),
        metadata.candidate,
        metadata.rule.leftDegrees,
        metadata.rule.rightDegrees,
      );
      if (!facts) return [];
      const symbol = asChordSymbol(event.chord);
      if (!slashBassPlacementOk(symbol, metadata.candidate.leftHandNotes, metadata.candidate.rightHandNotes)) return [];
      const parted = options.parts === undefined ? metadata.candidate
        : withBasicParts(symbol, metadata.candidate, options.parts);
      const candidate = slashBassPlacementOk(symbol, parted.leftHandNotes, parted.rightHandNotes) ? parted : metadata.candidate;
      metadataByCandidate.set(candidate, metadata);
      factsByCandidate.set(candidate, facts);
      return [candidate];
    });
    if (resolved.length === 0) {
      resolutions[eventIndex] = unsupportedRule(event.id);
      return;
    }
    candidateGroups.push(resolved);
    candidateIndexes.push(eventIndex);
  });

  const optimized = options.optimize
    ? optimizeCandidateGroups(candidateGroups)
    : selectChordLocalCandidates(candidateGroups);
  candidateIndexes.forEach((eventIndex, optimizedIndex) => {
    const event = snapshot.events[eventIndex]!;
    const automaticCandidate = optimized[optimizedIndex];
    const group = candidateGroups[optimizedIndex] ?? [];
    const manualIndex = options.candidateIndexes?.[event.id];
    const candidate = manualIndex !== undefined && manualIndex >= 0 && manualIndex < group.length
      ? group[manualIndex]
      : automaticCandidate;
    const metadata = candidate ? metadataByCandidate.get(candidate) : undefined;
    const facts = candidate ? factsByCandidate.get(candidate) : undefined;
    resolutions[eventIndex] = candidate && metadata && facts
      ? supportedStudyResolution(
          event,
          candidate,
          metadata,
          facts,
          context,
          Math.max(0, group.indexOf(candidate)) + 1,
          group.length,
        )
      : generationError(event.id);
  });

  return freezePlan(snapshot, resolutions);
}

function supportedStudyResolution(
  event: ProgressionPracticeEvent,
  candidate: StyleVoicingCandidate,
  metadata: StudyGeneratedCandidate,
  facts: CandidateFacts,
  context: VoicingRuleContext,
  candidateIndex: number,
  candidateCount: number,
): ProgressionPracticeVoicingResolution {
  const midiNotes = Object.freeze([...candidate.allNotes]);
  const selfPlayedBass = metadata.rule.requiredBassContext === "self-played"
    ? candidate.leftHandNotes[0]
    : undefined;
  const referenceBassNote = metadata.rule.requiredBassContext === "external-bass"
    ? separateBassRegister(event.chord.root, midiNotes)
    : undefined;
  const partDegree = PARTS_ADDED.get(candidate);
  const addedDegrees = Object.freeze(unique([...metadata.rule.addedDegrees, ...(partDegree === undefined ? [] : [partDegree])]));
  return freezeResolution({
    eventId: event.id,
    status: "SUPPORTED",
    voicing: freezeVoicing({
      origin: "basic-full",
      midiNotes,
      ...(selfPlayedBass === undefined ? {} : { bassNote: selfPlayedBass }),
      ...(referenceBassNote === undefined ? {} : { referenceBassNote }),
      leftHandNotes: Object.freeze([...candidate.leftHandNotes]),
      rightHandNotes: Object.freeze([...candidate.rightHandNotes]),
      ...(candidate.variant === "A" || candidate.variant === "B" ? { variant: candidate.variant } : {}),
      addedColorDegrees: addedDegrees,
      notes: noteFacts(event.chord, midiNotes, addedDegrees, selfPlayedBass, facts.degreeByMidiNote),
      explanation: Object.freeze({
        source: "lesson-rules",
        study: metadata.rule.study,
        identity: Object.freeze({
          ruleId: metadata.rule.id,
          family: metadata.rule.family,
          variantId: metadata.rule.variantId,
        }),
        coverage: metadata.rule.coverage,
        context: Object.freeze({
          ...context,
          bass: metadata.rule.requiredBassContext,
          top: metadata.rule.topRole,
        }),
        provenance: metadata.rule.provenance,
        omittedDegrees: Object.freeze([...metadata.rule.omittedDegrees]),
        addedDegrees,
        topRole: metadata.rule.topRole,
        candidateIndex,
        candidateCount,
      }),
    }),
  });
}
type CandidateResult =
  | { readonly status: "SUPPORTED"; readonly candidates: ResolvedCandidate[] }
  | { readonly status: "UNSUPPORTED_RULE" }
  | { readonly status: "GENERATION_ERROR" };

function basicCandidates(
  chord: ProgressionPracticeChord,
  selection: "basic-shell" | "basic-full" | "rootless-shell" | "full-shell",
  options: { readonly maxLeftHandSpanSemitones: number; readonly maxRightHandSpanSemitones: number },
): CandidateResult {
  const split = basicLessonHandLabels(chord, selection);
  if (!split) return { status: "UNSUPPORTED_RULE" };

  const chordSymbol = asChordSymbol(chord);
  const canonicalTones = chordToneDescriptors(chordSymbol);
  const { leftLabels, rightLabels } = split;
  const labels = [...leftLabels, ...rightLabels];
  const leftPitchClasses = resolveDegreePitchClasses(chordSymbol, leftLabels);
  const rightPitchClasses = resolveDegreePitchClasses(chordSymbol, rightLabels);
  if (!leftPitchClasses || !rightPitchClasses) return { status: "GENERATION_ERROR" };
  const candidates = enumerateSplitCandidates(
    chordSymbol,
    "shell-17",
    leftPitchClasses,
    rightPitchClasses,
    {
      requiredIntervals: [...labels],
      addedColorIntervals: [],
      omittedIntervals: canonicalTones
        .map((tone) => tone.label)
        .filter((label) => label !== "R" && !labels.includes(label)),
      warnings: [],
    },
    options,
  );
  const resolved = candidates.flatMap((candidate) => {
    const facts = candidateFacts(chordSymbol, candidate, leftLabels, rightLabels);
    if (!facts) return [];
    if (chord.bass !== undefined) {
      const bassVoice = facts.bassNote ?? (selection !== "rootless-shell"
        ? candidate.leftHandNotes.find(note => pitchClass(note) === pitchClass(chord.bass!)) : undefined);
      // Choose a feasible placement with the designated bass at the bottom;
      // never transpose an already selected upper structure or double the bass.
      if (bassVoice !== undefined && bassVoice !== Math.min(...candidate.allNotes)) return [];
      if (bassVoice !== undefined) return [{ candidate, facts: { ...facts, bassNote: bassVoice } }];
    }
    return [{ candidate, facts }];
  });
  return resolved.length > 0
    ? { status: "SUPPORTED", candidates: resolved }
    : { status: "GENERATION_ERROR" };
}

interface LessonHandLabels {
  readonly leftLabels: readonly string[];
  readonly rightLabels: readonly string[];
}

function basicLessonHandLabels(
  chord: ProgressionPracticeChord,
  selection: "basic-shell" | "basic-full" | "rootless-shell" | "full-shell",
): LessonHandLabels | undefined {
  const hasSeparateSlashBass = chord.bass !== undefined && chord.bass !== chord.root;
  if (hasSeparateSlashBass && (selection === "basic-full" || selection === "rootless-shell")) {
    if (chord.quality === "add9") {
      if (selection === "rootless-shell" || pitchClass(chord.bass!) !== pitchClass(chord.root + 2)) {
        return undefined;
      }
      return { leftLabels: ["Bass"], rightLabels: ["R", "3", "5"] };
    }
    const numerator = basicLessonLabels({ ...chord, bass: undefined }, selection);
    if (!numerator) return undefined;
    return { leftLabels: ["Bass"], rightLabels: numerator };
  }

  const labels = basicLessonLabels(chord, selection);
  if (!labels) return undefined;
  return { leftLabels: labels.slice(0, 2), rightLabels: labels.slice(2) };
}

function leftHandCandidates(
  chord: ProgressionPracticeChord,
  options: { readonly maxLeftHandSpanSemitones: number; readonly maxRightHandSpanSemitones: number },
  variant: "auto" | "A" | "B",
): CandidateResult {
  const chordSymbol = asChordSymbol(chord);
  // Product policy: resolve X without changing the canonical event's X/Y.
  // Y is attached only after optimization, never influencing lesson targets.
  delete chordSymbol.bass;
  chordSymbol.label = labelFromSymbol(chordSymbol);
  if (!getStyleCompatibility(chordSymbol, "rootless-ab").supported) {
    return { status: "UNSUPPORTED_RULE" };
  }
  const generated = generateStyleCandidates(chordSymbol, "rootless-ab", options);
  const candidatesForVariant = variant === "auto"
    ? generated
    : generated.filter((candidate) => candidate.variant === variant);
  const templates = rootlessTemplatesForChord(chordSymbol);
  const candidates = candidatesForVariant.flatMap((candidate) => {
    const template = templates.find(({ variant: templateVariant }) => templateVariant === candidate.variant);
    if (!template) return [];
    const facts = candidateFacts(
      chordSymbol,
      candidate,
      template.labels.slice(0, 2),
      template.labels.slice(2),
    );
    return facts ? [{ candidate, facts }] : [];
  });
  return candidates.length > 0
    ? { status: "SUPPORTED", candidates }
    : { status: "GENERATION_ERROR" };
}

function basicLessonLabels(
  chord: ProgressionPracticeChord,
  selection: "basic-shell" | "basic-full" | "rootless-shell" | "full-shell",
): string[] | undefined {
  const bass = chord.bass !== undefined && chord.bass !== chord.root ? "Bass" : "R";
  if (selection === "full-shell") {
    const shellLabels = basicLessonLabels(chord, "basic-shell");
    if (!shellLabels) return undefined;
    const leftLabels = shellLabels.slice(0, 2);
    let remainingChordTones = chordToneDescriptors(asChordSymbol(chord))
      .map((tone) => tone.label)
      .filter((label) => !leftLabels.includes(label));
    const alteredCount = remainingChordTones.filter((label) => ALTERED_DEGREES.has(label)).length;
    if (alteredCount > 1 && remainingChordTones.includes("5")) {
      remainingChordTones = remainingChordTones.filter((label) => label !== "5");
    }
    return unique([...leftLabels, ...remainingChordTones]);
  }
  const rootless = selection === "rootless-shell";
  const full = selection === "basic-full";
  let anchor: string;
  let defining: string;
  let identity: string[] = [];

  switch (chord.quality) {
    case "maj7":
    case "maj9":
      anchor = "7";
      defining = "3";
      break;
    case "min7":
    case "min9":
    case "min11":
      anchor = "b7";
      defining = "b3";
      break;
    case "dom7":
    case "dom9":
    case "dom13":
      anchor = "b7";
      defining = "3";
      if (chord.tensions.some((tension) => ALTERED_DEGREES.has(tension))) {
        identity = getStyleTonePolicy(asChordSymbol(chord), "shell-17").requiredIntervals
          .filter((degree) => !BASIC_STRUCTURAL_DEGREES.has(degree));
      }
      break;
    case "six":
    case "sixNine":
      anchor = "6";
      defining = "3";
      if (rootless) return undefined;
      break;
    case "min6":
      anchor = "6";
      defining = "b3";
      if (rootless) return undefined;
      break;
    case "min7b5":
      anchor = "b7";
      defining = "b3";
      identity = ["b5"];
      break;
    case "dom7sus4":
      anchor = "b7";
      defining = "4";
      break;
    default:
      return undefined;
  }

  if (rootless) {
    return unique([defining, anchor, ...identity]);
  }
  return unique([bass, anchor, ...(full ? [defining] : []), ...identity]);
}

function supportedLessonResolution(
  event: ProgressionPracticeEvent,
  selection: Exclude<ProgressionVoicingSelection, "saved" | "source-midi" | "custom">,
  candidate: StyleVoicingCandidate,
  facts: CandidateFacts,
): ProgressionPracticeVoicingResolution {
  const midiNotes = Object.freeze([...candidate.allNotes]);
  const addedColorDegrees = Object.freeze([...candidate.addedColorIntervals]);
  const bassNote = facts.bassNote;
  const referenceBassNote = (selection === "left-hand" || (selection === "rootless-shell" && facts.bassNote === undefined)) && event.chord.bass !== undefined
    ? separateBassRegister(event.chord.bass, midiNotes)
    : undefined;
  return freezeResolution({
    eventId: event.id,
    status: "SUPPORTED",
    voicing: freezeVoicing({
      origin: selection,
      midiNotes,
      ...(referenceBassNote === undefined ? {} : { referenceBassNote }),
      ...(bassNote === undefined ? {} : { bassNote }),
      leftHandNotes: Object.freeze([...candidate.leftHandNotes]),
      rightHandNotes: Object.freeze([...candidate.rightHandNotes]),
      ...(candidate.variant === "A" || candidate.variant === "B"
        ? { variant: candidate.variant }
        : {}),
      addedColorDegrees,
      notes: noteFacts(
        event.chord,
        midiNotes,
        addedColorDegrees,
        bassNote,
        facts.degreeByMidiNote,
      ),
      explanation: Object.freeze({
        source: "lesson-rules",
        study: "core",
        identity: Object.freeze({
          ruleId: "legacy-" + selection,
          family: selection === "left-hand" ? "bass-guide-tones" : "characteristic-core",
          variantId: candidate.variant ?? "default",
        }),
        coverage: candidate.addedColorIntervals.length > 0
          ? "creative-enrichment"
          : candidate.omittedIntervals.length > 0
            ? "performance-reduction"
            : "literal",
        context: Object.freeze({ bass: "self-played", top: "normal-voicing-top" }),
        provenance: Object.freeze({
          kind: "legacy-product-rule",
          sourceIds: Object.freeze([]),
          note: "Existing approved product rule retained at the compatibility boundary.",
        }),
        omittedDegrees: Object.freeze([...candidate.omittedIntervals]),
        addedDegrees: addedColorDegrees,
        topRole: "normal-voicing-top",
      }),
    }),
  });
}

// ---- P25-08: the K shapes, 基本's parts (K11) and 基本's filled cards (K12) ----

const K12_TITLE = "このコードは基本では作れないので、テキスト取り込みのおすすめの音で鳴らしています";
/** V11b: the recommendation broke the slash-bass rules, so K's close form sounds instead. */
const K12_CLOSE_TITLE = "このコードは基本では作れないので、詰めた形で鳴らしています";
const K4_LEGACY_TITLE = "このコードは形で作れないので、今までの作り方の音で鳴らしています";

/** The added degree of a candidate that 基本's テンションを足す changed (K11), for its note facts. */
const PARTS_ADDED = new WeakMap<StyleVoicingCandidate, string>();

function withBasicParts(
  chord: ChordSymbol,
  candidate: StyleVoicingCandidate,
  parts: { readonly tension: boolean; readonly spread: boolean },
): StyleVoicingCandidate {
  const built = buildBasicWithParts(chord, { left: candidate.leftHandNotes, right: candidate.rightHandNotes }, parts);
  const next: StyleVoicingCandidate = {
    ...candidate,
    leftHandNotes: [...built.left],
    rightHandNotes: [...built.right],
    allNotes: [...built.left, ...built.right].sort((a, b) => a - b),
  };
  if (built.addedTension !== undefined) PARTS_ADDED.set(next, built.addedTension);
  return next;
}

/** K11 on a plan whose cards were chosen without parts (the text 基本 and the generic generated paths). */
function applyBasicParts(
  snapshot: ProgressionVoicingPracticeSnapshot,
  plan: ProgressionPracticeVoicingPlan,
  parts: { readonly tension: boolean; readonly spread: boolean } | undefined,
): ProgressionPracticeVoicingPlan {
  if (parts === undefined) return plan;
  return freezePlan(snapshot, plan.events.map((resolution, index) => {
    if (resolution.status !== "SUPPORTED") return resolution;
    const event = snapshot.events[index]!;
    return partsOnResolution(event, resolution, parts);
  }));
}

function partsOnResolution(
  event: ProgressionPracticeEvent,
  resolution: Extract<ProgressionPracticeVoicingResolution, { status: "SUPPORTED" }>,
  parts: { readonly tension: boolean; readonly spread: boolean },
): ProgressionPracticeVoicingResolution {
  const voicing = resolution.voicing;
  const left = voicing.leftHandNotes ?? voicing.midiNotes.slice(0, 1);
  const right = voicing.rightHandNotes ?? voicing.midiNotes.slice(1);
  const built = buildBasicWithParts(asChordSymbol(event.chord), { left, right }, parts);
  // V11b: parts that break the slash-bass rules are not put on (the card keeps the notes it had).
  if (!slashBassPlacementOk(asChordSymbol(event.chord), built.left, built.right)) return resolution;
  const midiNotes = Object.freeze([...built.left, ...built.right].sort((a, b) => a - b));
  const added = Object.freeze(unique([...voicing.addedColorDegrees, ...(built.addedTension === undefined ? [] : [built.addedTension])]));
  return freezeResolution({
    ...resolution,
    voicing: freezeVoicing({
      ...voicing,
      midiNotes,
      leftHandNotes: Object.freeze([...built.left]),
      rightHandNotes: Object.freeze([...built.right]),
      ...(voicing.bassNote === undefined ? {} : { bassNote: built.left[0] ?? voicing.bassNote }),
      addedColorDegrees: added,
      notes: noteFacts(event.chord, midiNotes, added, built.left[0]),
    }),
  });
}

/** K12-1/2: the text intake's recommendation (2–10 notes), else K's close form (rec.py `close`). */
function basicFillNotes(chord: ChordSymbol): { readonly left: readonly number[]; readonly right: readonly number[]; readonly from: "text" | "close" } | undefined {
  const text = textProgressionVoicingNotes(chord, "generated-close");
  if (text && text.length >= 2 && text.length <= 10) {
    const notes = [...text].sort((a, b) => a - b);
    if (slashBassPlacementOk(chord, notes.slice(0, 1), notes.slice(1))) return { left: notes.slice(0, 1), right: notes.slice(1), from: "text" };
  }
  try {
    const close = buildRecipe(recChordOf(chord), ((chord.root % 12) + 12) % 12, "close")?.forms[0];
    if (close) return { left: [...close.left], right: [...close.right], from: "close" };
  } catch { /* nothing can be made: the card stays unsupported */ }
  return undefined;
}

/** V11b: a 基本 card that breaks the slash-bass rules (any path: text, legacy, teacher) is filled like K12. */
function slashBassToGaps(snapshot: ProgressionVoicingPracticeSnapshot, plan: ProgressionPracticeVoicingPlan): ProgressionPracticeVoicingPlan {
  const broken = (resolution: ProgressionPracticeVoicingResolution, index: number): boolean => {
    if (resolution.status !== "SUPPORTED") return false;
    const voicing = resolution.voicing;
    const left = voicing.leftHandNotes ?? voicing.midiNotes.slice(0, 1);
    const right = voicing.rightHandNotes ?? voicing.midiNotes.slice(1);
    return !slashBassPlacementOk(asChordSymbol(snapshot.events[index]!.chord), left, right);
  };
  if (!plan.events.some(broken)) return plan;
  return freezePlan(snapshot, plan.events.map((resolution, index) => broken(resolution, index) ? unsupportedRule(resolution.eventId) : resolution));
}

/** K12: only UNSUPPORTED_RULE cards are filled; supported and GENERATION_ERROR cards stay as they are. */
function fillBasicGaps(
  snapshot: ProgressionVoicingPracticeSnapshot,
  plan: ProgressionPracticeVoicingPlan,
  parts: { readonly tension: boolean; readonly spread: boolean } | undefined,
): ProgressionPracticeVoicingPlan {
  if (!plan.events.some((resolution) => resolution.status === "UNSUPPORTED_RULE")) return plan;
  return freezePlan(snapshot, plan.events.map((resolution, index) => {
    if (resolution.status !== "UNSUPPORTED_RULE") return resolution;
    const event = snapshot.events[index]!;
    const fill = basicFillNotes(asChordSymbol(event.chord));
    if (fill === undefined) return resolution;
    const midiNotes = Object.freeze([...fill.left, ...fill.right].sort((a, b) => a - b));
    const filled = freezeResolution({
      eventId: event.id,
      status: "SUPPORTED" as const,
      autoFallbackTitle: fill.from === "close" ? K12_CLOSE_TITLE : K12_TITLE,
      voicing: freezeVoicing({
        origin: "basic-full",
        midiNotes,
        bassNote: fill.left[0]!,
        leftHandNotes: Object.freeze([...fill.left]),
        rightHandNotes: Object.freeze([...fill.right]),
        addedColorDegrees: Object.freeze([]),
        notes: noteFacts(event.chord, midiNotes, [], fill.left[0]),
      }),
    });
    return parts === undefined ? filled : partsOnResolution(event, filled, parts);
  }));
}

/** K4: Voicing Loop's sound when no shape can be made — the same recommendation K12 fills with. */
function loopLegacyPlacement(chord: ChordSymbol): ShapeVoicingPlacement | undefined {
  const fill = basicFillNotes(chord);
  return fill === undefined ? undefined : { left: fill.left, right: fill.right };
}

/** L1 / K3 / K6: the four K shapes for 自動生成. */
function resolveShapeVoicings(
  snapshot: ProgressionVoicingPracticeSnapshot,
  shape: VoicingShapeOptions,
  optimize: boolean,
): ProgressionPracticeVoicingPlan {
  const results: ShapeVoicingResult[] = snapshot.events.map((event) =>
    buildShapeVoicing(asChordSymbol(event.chord), shape, loopLegacyPlacement));
  const placements = optimize
    ? optimizeShapeProgression(results, shape.rootlessOrder)
    : results.map((result) => pickShapeForm(result, shape.rootlessOrder)?.staticChoice ?? { left: [], right: [] });
  const key = (placement: ShapeVoicingPlacement) => `${placement.left.join(",")}|${placement.right.join(",")}`;
  return freezePlan(snapshot, snapshot.events.map((event, index) => {
    const result = results[index]!;
    const placement = placements[index]!;
    const notes = placementNotes(placement);
    if (result.forms.length === 0 || notes.length < 2) return unsupportedRule(event.id);
    const form = result.forms.find((item) => item.candidates.some((candidate) => key(candidate) === key(placement)))?.form ?? null;
    const midiNotes = Object.freeze(notes);
    const added = Object.freeze(result.addedTension === undefined ? [] : [result.addedTension]);
    // L3b: ② without 広げる (left hand 4 notes, no root) adds the root (or the slash bass) as the accompaniment bass.
    const referenceBassNote = result.oneHand && result.used.startsWith("rootless")
      ? separateBassRegister(event.chord.bass ?? event.chord.root, midiNotes) : undefined;
    const orderMissing = shape.shape === "rootless" && shape.rootlessOrder !== "auto" && result.used.startsWith("rootless")
      && !result.forms.some((item) => item.form === shape.rootlessOrder);
    return freezeResolution({
      eventId: event.id,
      status: "SUPPORTED" as const,
      ...(result.fellBack
        ? { autoFallbackTitle: result.used === "legacy" ? K4_LEGACY_TITLE : `この形では作れないため「${usedShapeName(result.used)}」で鳴らしています` }
        : {}),
      ...(orderMissing ? { cardNote: `このコードは ${form ?? (shape.rootlessOrder === "A" ? "B" : "A")} の並びだけ置けます` } : {}),
      voicing: freezeVoicing({
        origin: "basic-full",
        midiNotes,
        ...(referenceBassNote === undefined ? {} : { referenceBassNote }),
        leftHandNotes: Object.freeze([...placement.left]),
        rightHandNotes: Object.freeze([...placement.right]),
        ...(form === "A" || form === "B" ? { variant: form } : {}),
        addedColorDegrees: added,
        notes: noteFacts(event.chord, midiNotes, added),
      }),
    });
  }));
}

/** Shared by reference playback, card audition and keyboard range, not targets. */
export function progressionPracticePlaybackNotes(voicing: ResolvedProgressionPracticeVoicing): readonly number[] {
  if (voicing.referenceBassNote === undefined) return voicing.midiNotes;
  return Object.freeze([...new Set([voicing.referenceBassNote, ...voicing.midiNotes])].sort((a, b) => a - b));
}

function separateBassRegister(bass: number, targets: readonly number[]): number {
  // Same C2–B2 starting register as the existing canonical bass reference.
  // Move below the unchanged upper targets, preventing a same-pitch role clash.
  let note = 36 + pitchClass(bass);
  while (note >= Math.min(...targets)) note -= 12;
  return note;
}

function noteFacts(
  chord: ProgressionPracticeChord,
  midiNotes: readonly number[],
  addedColorDegrees: readonly string[],
  bassNote?: number,
  approvedDegreeByMidiNote?: ReadonlyMap<number, string>,
): readonly ProgressionVoicingNoteFact[] {
  const exactSlashBassNote = chord.bass !== undefined
    && chord.bass !== chord.root
    && bassNote !== undefined
    && pitchClass(bassNote) === pitchClass(chord.bass)
    ? bassNote
    : undefined;
  const degreeByPitchClass = new Map<number, string>();
  for (const tone of chordToneDescriptors(asChordSymbol(chord))) {
    degreeByPitchClass.set(tone.pitchClass, tone.label === "R" ? "1" : tone.label);
  }
  for (const degree of addedColorDegrees) {
    const interval = intervalForDegreeLabel(degree);
    if (interval !== undefined) degreeByPitchClass.set(pitchClass(chord.root + interval), degree);
  }
  return Object.freeze(midiNotes.map((midiNote) => Object.freeze({
    midiNote,
    pitchClass: pitchClass(midiNote),
    octave: Math.floor(midiNote / 12) - 1,
    degree: approvedDegreeByMidiNote?.get(midiNote)
      ?? (exactSlashBassNote === midiNote
        ? "Bass"
        : degreeByPitchClass.get(pitchClass(midiNote))
          ?? null),
  })));
}

function freezePlan(
  snapshot: ProgressionVoicingPracticeSnapshot,
  events: readonly ProgressionPracticeVoicingResolution[],
): ProgressionPracticeVoicingPlan {
  return Object.freeze({
    snapshotFingerprint: snapshot.fingerprint,
    selection: snapshot.selection,
    events: Object.freeze([...events]),
  });
}

function freezeResolution<T extends ProgressionPracticeVoicingResolution>(resolution: T): T {
  return Object.freeze(resolution);
}

function freezeVoicing(
  voicing: ResolvedProgressionPracticeVoicing,
): ResolvedProgressionPracticeVoicing {
  return Object.freeze(voicing);
}

function applyOctaveShift(
  plan: ProgressionPracticeVoicingPlan,
  octaves: -2 | -1 | 0 | 1 | 2,
): ProgressionPracticeVoicingPlan {
  if (octaves === 0) return plan;
  const semitones = octaves * 12;
  const playable = plan.events.every((resolution) => {
    if (resolution.status !== "SUPPORTED") return true;
    const notes = [
      ...resolution.voicing.midiNotes,
      ...(resolution.voicing.referenceBassNote === undefined ? [] : [resolution.voicing.referenceBassNote]),
    ];
    return notes.every((note) => note + semitones >= 0 && note + semitones <= 127);
  });
  if (!playable) {
    return Object.freeze({
      ...plan,
      events: Object.freeze(plan.events.map((resolution) => (
        resolution.status === "SUPPORTED" ? generationError(resolution.eventId) : resolution
      ))),
    });
  }
  return Object.freeze({
    ...plan,
    snapshotFingerprint: `${plan.snapshotFingerprint}:octave:${octaves}`,
    events: Object.freeze(plan.events.map((resolution) => {
      if (resolution.status !== "SUPPORTED") return resolution;
      const voicing = resolution.voicing;
      return freezeResolution({
        eventId: resolution.eventId,
        status: "SUPPORTED" as const,
        ...(resolution.fallbackFrom ? { fallbackFrom: resolution.fallbackFrom } : {}),
        ...(resolution.autoFallbackTitle ? { autoFallbackTitle: resolution.autoFallbackTitle } : {}),
        ...(resolution.cardNote ? { cardNote: resolution.cardNote } : {}),
        voicing: freezeVoicing({
          ...voicing,
          midiNotes: shiftNotes(voicing.midiNotes, semitones),
          ...(voicing.leftHandNotes ? { leftHandNotes: shiftNotes(voicing.leftHandNotes, semitones) } : {}),
          ...(voicing.rightHandNotes ? { rightHandNotes: shiftNotes(voicing.rightHandNotes, semitones) } : {}),
          ...(voicing.bassNote === undefined ? {} : { bassNote: voicing.bassNote + semitones }),
          ...(voicing.referenceBassNote === undefined
            ? {}
            : { referenceBassNote: voicing.referenceBassNote + semitones }),
          notes: Object.freeze(voicing.notes.map((note) => Object.freeze({
            ...note,
            midiNote: note.midiNote + semitones,
            octave: note.octave + octaves,
          }))),
        }),
      });
    })),
  });
}

function shiftNotes(notes: readonly number[], semitones: number): readonly number[] {
  return Object.freeze(notes.map((note) => note + semitones));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function asChordSymbol(chord: ProgressionPracticeChord): ChordSymbol {
  return {
    ...(chord.altered ? { altered: true as const } : {}),
    root: chord.root,
    quality: chord.quality,
    tensions: [...chord.tensions],
    ...(chord.omissions?.length ? { omissions: [...chord.omissions] } : {}),
    ...(chord.bass === undefined ? {} : { bass: chord.bass }),
    label: chord.label,
  };
}

interface CandidateFacts {
  readonly degreeByMidiNote: ReadonlyMap<number, string>;
  readonly bassNote?: number;
}

interface ResolvedCandidate {
  readonly candidate: StyleVoicingCandidate;
  readonly facts: CandidateFacts;
}

function resolveDegreePitchClasses(
  chord: ChordSymbol,
  labels: readonly string[],
): number[] | undefined {
  const pitchClasses = labels.map((label) => pitchClassForDegreeLabel(chord, label));
  return pitchClasses.every(isNumber) ? pitchClasses : undefined;
}

function candidateFacts(
  chord: ChordSymbol,
  candidate: StyleVoicingCandidate,
  leftLabels: readonly string[],
  rightLabels: readonly string[],
): CandidateFacts | undefined {
  const degreeByMidiNote = new Map<number, string>();
  if (!assignDegrees(chord, candidate.leftHandNotes, leftLabels, degreeByMidiNote)) return undefined;
  if (!assignDegrees(chord, candidate.rightHandNotes, rightLabels, degreeByMidiNote)) return undefined;
  const bassNote = [...degreeByMidiNote.entries()]
    .find(([, degree]) => degree === "Bass")?.[0];
  return {
    degreeByMidiNote,
    ...(bassNote === undefined ? {} : { bassNote }),
  };
}

function assignDegrees(
  chord: ChordSymbol,
  midiNotes: readonly number[],
  labels: readonly string[],
  degreeByMidiNote: Map<number, string>,
): boolean {
  const available = [...midiNotes].sort((left, right) => left - right);
  for (const label of labels) {
    const expectedPitchClass = pitchClassForDegreeLabel(chord, label);
    if (expectedPitchClass === undefined) return false;
    const matchingIndex = available.findIndex((midiNote) => pitchClass(midiNote) === expectedPitchClass);
    if (matchingIndex < 0) return false;
    const [midiNote] = available.splice(matchingIndex, 1);
    degreeByMidiNote.set(midiNote!, label === "R" ? "1" : label);
  }
  return available.length === 0;
}

function unsupportedRule(eventId: string): ProgressionPracticeVoicingResolution {
  return freezeResolution({
    eventId,
    status: "UNSUPPORTED_RULE",
    reason: "no-approved-lesson-rule",
  });
}

function generationError(eventId: string): ProgressionPracticeVoicingResolution {
  return freezeResolution({
    eventId,
    status: "GENERATION_ERROR",
    reason: "candidate-generation-failed",
  });
}

function isNumber(value: number | undefined): value is number {
  return value !== undefined;
}

/**
 * V11b: the slash-bass rules of K (V11) that are about the sound, for every Voicing Loop placement: the bottom is the
 * bass, no semitone right above it, a minor 9th against it only at 25 semitones or more, the hands not too far apart.
 * The bass pitch class above (P26's own choice, K keeps it out itself) is not checked: the older 基本 tables keep it (P5.27).
 */
export function slashBassPlacementOk(chord: ChordSymbol, left: readonly number[], right: readonly number[]): boolean {
  if (chord.bass === undefined || ((chord.bass - chord.root) % 12 + 12) % 12 === 0) return true;
  const notes = [...left, ...right].sort((a, b) => a - b);
  if (notes.length < 2) return true;
  const bpc = ((chord.bass % 12) + 12) % 12;
  if (notes[0]! % 12 !== bpc) return false;
  if (notes[1]! - notes[0]! === 1) return false;
  if (notes.slice(1).some((n) => (n - notes[0]!) % 12 === 1 && n - notes[0]! < 25)) return false;
  if (left.length > 0 && right.length > 0 && Math.min(...right) - Math.max(...left) > (left.length === 1 ? 24 : 12)) return false;
  return true;
}
