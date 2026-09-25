import type { ChordSymbol } from "../types";
import { labelFromSymbol } from "../chords";
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
  readonly lessonColorEnabled?: boolean;
  readonly lessonOpenEnabled?: boolean;
  readonly lessonProgressionOptimization?: boolean;
  /** Session-only, zero-based candidate overrides keyed by immutable event id. */
  readonly lessonCandidateIndexes?: Readonly<Record<string, number>>;
  readonly lessonContext?: VoicingRuleContext;
  /** Session-only octave displacement. The detached source snapshot stays unchanged. */
  readonly octaveShift?: -2 | -1 | 0 | 1 | 2;
}

/**
 * Resolves the explicitly selected P5.27 family without crossing family
 * boundaries. MY selections only consume detached exact pitches. Lesson
 * selections only consume audited rules and never enable generated-close.
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
  if (selection === "source-midi" || selection === "custom") {
    return applyOctaveShift(
      freezePlan(snapshot, snapshot.events.map((event) => resolveMyVoicing(event, selection))),
      options.octaveShift ?? 0,
    );
  }

  if (options.lessonStudyCategory && selection !== "left-hand") {
    return applyOctaveShift(
      resolveStudyVoicings(
        snapshot,
        options.lessonStudyCategory,
        options.lessonContext ?? { bass: "self-played", top: "normal-voicing-top" },
        {
          ...candidateOptions,
          color: options.lessonColorEnabled ?? false,
          open: options.lessonOpenEnabled ?? false,
          optimize: options.lessonProgressionOptimization ?? true,
          candidateIndexes: options.lessonCandidateIndexes,
        },
      ),
      options.octaveShift ?? 0,
    );
  }

  const resolutions: ProgressionPracticeVoicingResolution[] = [];
  const candidateGroups: StyleVoicingCandidate[][] = [];
  const candidateIndexes: number[] = [];
  const factsByCandidate = new Map<StyleVoicingCandidate, CandidateFacts>();

  snapshot.events.forEach((event, index) => {
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

  return applyOctaveShift(freezePlan(snapshot, resolutions), options.octaveShift ?? 0);
}

function resolveMyVoicing(
  event: ProgressionPracticeEvent,
  selection: "source-midi" | "custom",
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
        source: selection,
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
  },
): ProgressionPracticeVoicingPlan {
  const resolutions: ProgressionPracticeVoicingResolution[] = [];
  const candidateGroups: StyleVoicingCandidate[][] = [];
  const candidateIndexes: number[] = [];
  const metadataByCandidate = new Map<StyleVoicingCandidate, StudyGeneratedCandidate>();
  const factsByCandidate = new Map<StyleVoicingCandidate, CandidateFacts>();

  snapshot.events.forEach((event, eventIndex) => {
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
      metadataByCandidate.set(metadata.candidate, metadata);
      factsByCandidate.set(metadata.candidate, facts);
      return [metadata.candidate];
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
  const addedDegrees = Object.freeze([...metadata.rule.addedDegrees]);
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
    return facts ? [{ candidate, facts }] : [];
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
  selection: Exclude<ProgressionVoicingSelection, "source-midi" | "custom">,
  candidate: StyleVoicingCandidate,
  facts: CandidateFacts,
): ProgressionPracticeVoicingResolution {
  const midiNotes = Object.freeze([...candidate.allNotes]);
  const addedColorDegrees = Object.freeze([...candidate.addedColorIntervals]);
  const bassNote = facts.bassNote;
  const referenceBassNote = selection === "left-hand" && event.chord.bass !== undefined
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
