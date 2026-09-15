import type { ChordSymbol } from "../types";
import { labelFromSymbol } from "../chords";
import {
  chordToneDescriptors,
  generateStyleCandidates,
  getStyleCompatibility,
  getStyleTonePolicy,
  intervalForDegreeLabel,
  optimizeCandidateGroups,
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
    return freezePlan(snapshot, snapshot.events.map((event) => resolveMyVoicing(event, selection)));
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

  return freezePlan(snapshot, resolutions);
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
  const labels = basicLessonLabels(chord, selection);
  if (!labels) return { status: "UNSUPPORTED_RULE" };

  const chordSymbol = asChordSymbol(chord);
  const canonicalTones = chordToneDescriptors(chordSymbol);
  const leftLabels = labels.slice(0, 2);
  const rightLabels = labels.slice(2);
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
    degree: exactSlashBassNote === midiNote
      ? "Bass"
      : approvedDegreeByMidiNote?.get(midiNote)
        ?? degreeByPitchClass.get(pitchClass(midiNote))
        ?? null,
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

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function asChordSymbol(chord: ProgressionPracticeChord): ChordSymbol {
  return {
    root: chord.root,
    quality: chord.quality,
    tensions: [...chord.tensions],
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
