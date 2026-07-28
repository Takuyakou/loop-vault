import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseChordLabel } from "../../src/domain/chords";
import {
  buildVoiceFeatureInputs,
  buildVoices,
  parseMidi,
} from "../../src/domain/midi";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import type {
  MidiSongData,
  TimedNote,
  Voice,
} from "../../src/domain/midi/types";
import { annotateVoiceRoles } from "../../src/domain/midi/voiceRoles";
import {
  extractSimultaneousCandidates,
  extractVoicing,
  filterEventLocalMelodyContamination,
  scoreVoicingCandidate,
  voicingNoteSetMetrics,
  voicingRegisterMetrics,
  type MelodyContaminationRemoval,
  type VoicingExtractionInput,
} from "../../src/domain/voicing";
import type { Phase44Split } from "../phase44/targetedCorpus";
import {
  type HarmonySupportEvent,
  type HarmonySupportFile,
  type HarmonySupportManifest,
  type HarmonySupportMode,
} from "./harmonySupportCorpus";

export interface SupportEvidence {
  targetNoteInstanceId: string;
  targetPitch: number;
  productRole: Voice["inferredRole"] | "missing";
  roleConfidence: number;
  maxPolyphony: number;
  highestVoiceShare: number;
  lowestVoiceShare: number;
  supportPitchCount: number;
  supportPitches: number[];
  supportDurationBeats: number;
  supportDurationRatio: number;
  supportMass: number;
  repeatedSupportCount: number;
  eventAvailableSupportPitchCount: number;
  supportCoverageRatio: number;
  polyphonicSupportVoiceCount: number;
  hasHarmonyVoice: boolean;
  baselineFilterTriggeredForTarget: boolean;
  baselineFilterRejectionReasons: string[];
  subset: "primary" | "diagnostic-only" | "other";
}

export interface ShadowFilterResult {
  notes: TimedNote[];
  removed: MelodyContaminationRemoval[];
  evidenceByNoteId?: Record<string, Record<string, unknown>>;
}

export type ShadowFilter = (
  input: VoicingExtractionInput,
  noteIdByReference: ReadonlyMap<TimedNote, string>,
) => ShadowFilterResult;

export interface SupportEvaluationRow {
  key: string;
  fileId: string;
  scenarioId: string;
  scenarioSlug: string;
  split: Phase44Split;
  variant: "clean" | "stress";
  mode: HarmonySupportMode;
  declaredSupportCount: number;
  declaredSupportBeats: number;
  eventId: string;
  chordSymbol: string;
  evidence: SupportEvidence;
  filterTriggered: boolean;
  removedNoteInstanceIds: string[];
  filterReasons: string[];
  filterEvidence: Record<string, Record<string, unknown>>;
  beforeInputPitchSet: number[];
  afterInputPitchSet: number[];
  beforeFinalPitchSet: number[];
  afterFinalPitchSet: number[];
  goldPitchSet: number[];
  beforeStatus: "usable" | "review" | "not-found";
  afterStatus: "usable" | "review" | "not-found";
  beforeConfidence: number | null;
  afterConfidence: number | null;
  confidenceDelta: number;
  beforeWinnerDuration: number | null;
  afterWinnerDuration: number | null;
  winnerDurationDelta: number;
  beforeExact: boolean;
  afterExact: boolean;
  beforeMelodyLeakedPitches: number[];
  afterMelodyLeakedPitches: number[];
  melodyOpportunityCount: number;
  pitchSetChanged: boolean;
  pitchFidelityChanged: boolean;
  statusOnlyChanged: boolean;
  sourceNoteAdditionCount: number;
  afterBassCorrect: boolean;
  afterTopCorrect: boolean;
  afterRegisterExact: boolean;
  afterOctaveError: boolean;
  truePositive: number;
  predictedCount: number;
  goldCount: number;
  extraNoteCount: number;
  missingNoteCount: number;
}

export interface SupportAggregate {
  events: number;
  contaminationEventCount: number;
  melodyLeakRate: number | null;
  voicingExactRate: number | null;
  notePrecision: number;
  noteRecall: number;
  noteF1: number;
  extraNoteCount: number;
  missingNoteCount: number;
  finalPitchSetChangedRate: number | null;
  sourceVoicingUsableRate: number | null;
  reviewRate: number | null;
  generatedFallbackRate: number | null;
  statusOnlyChangeRate: number | null;
  averageConfidenceDelta: number;
  averageWinnerDurationDelta: number;
  bassAccuracy: number | null;
  topNoteAccuracy: number | null;
  registerExactRate: number | null;
  octaveErrorRate: number | null;
  sourceNoteAdditionCount: number;
  filterTriggerRate: number | null;
}

const frozenOptions = {
  minimumRoleConfidence: 0.65,
  minimumConcurrentNonMelodyPitches: 4,
  minimumConcurrentSupportBeats: 0.2,
};

export async function evaluateSupportSplit(
  corpusDir: string,
  manifest: HarmonySupportManifest,
  split: Phase44Split,
  filter: ShadowFilter = currentFrozenFilter,
): Promise<SupportEvaluationRow[]> {
  const rows: SupportEvaluationRow[] = [];
  for (const file of manifest.files.filter((candidate) => candidate.split === split)) {
    const data = parseMidi(new Uint8Array(await readFile(resolve(corpusDir, file.path))));
    const rawVoices = buildVoices(data);
    const features = buildVoiceFeatureInputs(rawVoices, normalizeNotes(data));
    const voices = annotateVoiceRoles(rawVoices, features);
    const ids = new Map(data.notes.map((note, index) => [
      note,
      noteInstanceId(note, index),
    ]));
    for (const event of file.events) {
      rows.push(evaluateEvent(data, file, event, voices, ids, filter));
    }
  }
  return rows;
}

export function aggregateSupportRows(
  rows: readonly SupportEvaluationRow[],
): SupportAggregate {
  const truePositive = sum(rows.map((row) => row.truePositive));
  const predictedCount = sum(rows.map((row) => row.predictedCount));
  const goldCount = sum(rows.map((row) => row.goldCount));
  const precision = predictedCount === 0 ? (goldCount === 0 ? 1 : 0) : truePositive / predictedCount;
  const recall = goldCount === 0 ? (predictedCount === 0 ? 1 : 0) : truePositive / goldCount;
  const melodyOpportunities = sum(rows.map((row) => row.melodyOpportunityCount));
  return {
    events: rows.length,
    contaminationEventCount: count(rows, (row) => row.afterMelodyLeakedPitches.length > 0),
    melodyLeakRate: ratio(
      sum(rows.map((row) => row.afterMelodyLeakedPitches.length)),
      melodyOpportunities,
    ),
    voicingExactRate: ratio(count(rows, (row) => row.afterExact), rows.length),
    notePrecision: rounded(precision),
    noteRecall: rounded(recall),
    noteF1: rounded(
      precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    ),
    extraNoteCount: sum(rows.map((row) => row.extraNoteCount)),
    missingNoteCount: sum(rows.map((row) => row.missingNoteCount)),
    finalPitchSetChangedRate: ratio(count(rows, (row) => row.pitchSetChanged), rows.length),
    sourceVoicingUsableRate: ratio(count(rows, (row) => row.afterStatus === "usable"), rows.length),
    reviewRate: ratio(count(rows, (row) => row.afterStatus === "review"), rows.length),
    generatedFallbackRate: ratio(count(rows, (row) => row.afterStatus !== "usable"), rows.length),
    statusOnlyChangeRate: ratio(count(rows, (row) => row.statusOnlyChanged), rows.length),
    averageConfidenceDelta: average(rows.map((row) => row.confidenceDelta)),
    averageWinnerDurationDelta: average(rows.map((row) => row.winnerDurationDelta)),
    bassAccuracy: ratio(count(rows, (row) => row.afterBassCorrect), rows.length),
    topNoteAccuracy: ratio(count(rows, (row) => row.afterTopCorrect), rows.length),
    registerExactRate: ratio(count(rows, (row) => row.afterRegisterExact), rows.length),
    octaveErrorRate: ratio(count(rows, (row) => row.afterOctaveError), rows.length),
    sourceNoteAdditionCount: sum(rows.map((row) => row.sourceNoteAdditionCount)),
    filterTriggerRate: ratio(count(rows, (row) => row.filterTriggered), rows.length),
  };
}

export function groupedSupportRows(rows: readonly SupportEvaluationRow[]) {
  return {
    overall: aggregateSupportRows(rows),
    bySubset: group(rows, (row) => row.evidence.subset),
    byVariant: group(rows, (row) => row.variant),
    bySupportCount: group(rows, (row) => String(row.declaredSupportCount)),
    bySupportDuration: group(rows, (row) => String(row.declaredSupportBeats)),
    byTexture: group(rows, (row) => row.mode),
    byScenario: group(rows, (row) => row.scenarioId),
  };
}

export function currentFrozenFilter(
  input: VoicingExtractionInput,
): ShadowFilterResult {
  return filterEventLocalMelodyContamination(input, frozenOptions);
}

function evaluateEvent(
  data: MidiSongData,
  file: HarmonySupportFile,
  event: HarmonySupportEvent,
  voices: readonly Voice[],
  ids: ReadonlyMap<TimedNote, string>,
  filter: ShadowFilter,
): SupportEvaluationRow {
  const chord = parseChordLabel(event.chordSymbol);
  if (!chord) throw new Error(`Unparseable chord: ${file.fileId}/${event.eventId}`);
  const input = {
    chord,
    segment: { startBeat: event.startBeat, endBeat: event.endBeat },
    notes: data.notes,
    ticksPerBeat: data.ticksPerBeat,
    voices,
  } satisfies VoicingExtractionInput;
  const target = targetNote(data, file, event);
  const evidence = supportEvidence(input, target, ids, file.scenarioParameters.mode);
  const shadow = filter(input, ids);
  const afterInput = { ...input, notes: shadow.notes };
  const before = extractVoicing(input);
  const after = extractVoicing(afterInput);
  const beforeNotes = before.snapshot?.midiNotes ?? [];
  const afterNotes = after.snapshot?.midiNotes ?? [];
  const beforeMetric = voicingNoteSetMetrics(beforeNotes, event.goldVoicingMidi);
  const afterMetric = voicingNoteSetMetrics(afterNotes, event.goldVoicingMidi);
  const register = voicingRegisterMetrics(afterNotes, event.goldVoicingMidi);
  const beforeLeaks = leakedPitches(
    beforeNotes,
    event.goldVoicingMidi,
    event.excludedDistractorMidi,
  );
  const afterLeaks = leakedPitches(
    afterNotes,
    event.goldVoicingMidi,
    event.excludedDistractorMidi,
  );
  const beforeDuration = winningDuration(input);
  const afterDuration = winningDuration(afterInput);
  const beforeConfidence = before.snapshot?.confidence ?? null;
  const afterConfidence = after.snapshot?.confidence ?? null;
  const pitchSetChanged = !sameSet(beforeNotes, afterNotes);
  const pitchFidelityChanged =
    beforeMetric.exact !== afterMetric.exact
    || !sameSet(beforeLeaks, afterLeaks)
    || beforeMetric.extraNoteCount !== afterMetric.extraNoteCount
    || beforeMetric.missingNoteCount !== afterMetric.missingNoteCount;
  const observed = inputPitches(data.notes, data.ticksPerBeat, event);
  return {
    key: `${file.fileId}/${event.eventId}`,
    fileId: file.fileId,
    scenarioId: file.scenarioId,
    scenarioSlug: file.scenarioSlug,
    split: file.split,
    variant: file.variant,
    mode: file.scenarioParameters.mode,
    declaredSupportCount: event.scenarioParameters.supportCount,
    declaredSupportBeats: event.scenarioParameters.supportBeats,
    eventId: event.eventId,
    chordSymbol: event.chordSymbol,
    evidence,
    filterTriggered: shadow.removed.length > 0,
    removedNoteInstanceIds: shadow.removed.map((entry) =>
      ids.get(entry.note) ?? "missing-id"),
    filterReasons: [...new Set(shadow.removed.flatMap((entry) => entry.reasons))],
    filterEvidence: shadow.evidenceByNoteId ?? {},
    beforeInputPitchSet: inputPitches(data.notes, data.ticksPerBeat, event),
    afterInputPitchSet: inputPitches(shadow.notes, data.ticksPerBeat, event),
    beforeFinalPitchSet: beforeNotes,
    afterFinalPitchSet: afterNotes,
    goldPitchSet: event.goldVoicingMidi,
    beforeStatus: before.status,
    afterStatus: after.status,
    beforeConfidence,
    afterConfidence,
    confidenceDelta: rounded((afterConfidence ?? 0) - (beforeConfidence ?? 0)),
    beforeWinnerDuration: beforeDuration,
    afterWinnerDuration: afterDuration,
    winnerDurationDelta: rounded((afterDuration ?? 0) - (beforeDuration ?? 0)),
    beforeExact: beforeMetric.exact,
    afterExact: afterMetric.exact,
    beforeMelodyLeakedPitches: beforeLeaks,
    afterMelodyLeakedPitches: afterLeaks,
    melodyOpportunityCount: new Set(event.excludedDistractorMidi).size,
    pitchSetChanged,
    pitchFidelityChanged,
    statusOnlyChanged: !pitchSetChanged && before.status !== after.status,
    sourceNoteAdditionCount: afterNotes.filter((pitch) => !observed.includes(pitch)).length,
    afterBassCorrect: register.bassNoteCorrect,
    afterTopCorrect: register.topNoteCorrect,
    afterRegisterExact: register.registerExact,
    afterOctaveError: register.octaveError,
    truePositive: afterMetric.truePositive,
    predictedCount: new Set(afterNotes).size,
    goldCount: new Set(event.goldVoicingMidi).size,
    extraNoteCount: afterMetric.extraNoteCount,
    missingNoteCount: afterMetric.missingNoteCount,
  };
}

function supportEvidence(
  input: VoicingExtractionInput,
  target: TimedNote,
  ids: ReadonlyMap<TimedNote, string>,
  mode: HarmonySupportMode,
): SupportEvidence {
  const voices = new Map(
    (input.voices ?? []).map((voice) => [`${voice.trackIndex}:${voice.channel}`, voice]),
  );
  const voice = target.channel === undefined
    ? undefined
    : voices.get(`${target.trackIndex}:${target.channel}`);
  const targetStart = Math.max(target.startTick / input.ticksPerBeat, input.segment.startBeat);
  const targetEnd = Math.min(
    (target.startTick + target.durationTick) / input.ticksPerBeat,
    input.segment.endBeat,
  );
  const supportNotes = input.notes.flatMap((note) => {
    if (note === target || note.channel === undefined) return [];
    const supportVoice = voices.get(`${note.trackIndex}:${note.channel}`);
    if (!supportVoice || !isSupportVoice(supportVoice)) return [];
    const start = note.startTick / input.ticksPerBeat;
    const end = (note.startTick + note.durationTick) / input.ticksPerBeat;
    if (end <= input.segment.startBeat || start >= input.segment.endBeat) return [];
    return [{ note, voice: supportVoice, start, end }];
  });
  const strongest = strongestSupport(supportNotes, targetStart, targetEnd);
  const available = new Set(supportNotes.map((entry) => entry.note.pitch));
  const overlapByPitch = new Map<number, number>();
  for (const entry of supportNotes) {
    const overlap = Math.max(
      0,
      Math.min(entry.end, targetEnd) - Math.max(entry.start, targetStart),
    );
    overlapByPitch.set(
      entry.note.pitch,
      Math.max(overlapByPitch.get(entry.note.pitch) ?? 0, overlap),
    );
  }
  const supportMass = sum([...overlapByPitch.values()]);
  const rejectionReasons: string[] = [];
  if (!voice) rejectionReasons.push("voice-not-found");
  if (voice && voice.inferredRole !== "melody") {
    rejectionReasons.push(`role-is-${voice.inferredRole}`);
  }
  if (voice && voice.roleConfidence < frozenOptions.minimumRoleConfidence) {
    rejectionReasons.push("role-confidence-too-low");
  }
  if (voice && voice.maxPolyphony > 1) rejectionReasons.push("voice-polyphonic");
  if (voice && voice.highestVoiceShare < 0.5) rejectionReasons.push("highest-share-too-low");
  if (voice && voice.highestVoiceShare <= voice.lowestVoiceShare) {
    rejectionReasons.push("highest-share-not-dominant");
  }
  if (strongest.pitches.length < frozenOptions.minimumConcurrentNonMelodyPitches) {
    rejectionReasons.push(`support-count-${strongest.pitches.length}`);
  }
  if (strongest.duration + Number.EPSILON < frozenOptions.minimumConcurrentSupportBeats) {
    rejectionReasons.push("support-duration-too-short");
  }
  const hasHarmonyVoice = supportNotes.length > 0;
  const supportOnlyRejection = rejectionReasons.every((reason) =>
    reason.startsWith("support-count-")
    || reason === "support-duration-too-short");
  const subset = mode === "status"
    || voice?.inferredRole === "bass"
    || !hasHarmonyVoice
    ? "diagnostic-only"
    : voice?.inferredRole === "melody"
      && (voice.roleConfidence >= frozenOptions.minimumRoleConfidence)
      && strongest.pitches.length >= 1
      && strongest.pitches.length <= 3
      && supportOnlyRejection
      ? "primary"
      : "other";
  return {
    targetNoteInstanceId: ids.get(target) ?? "missing-id",
    targetPitch: target.pitch,
    productRole: voice?.inferredRole ?? "missing",
    roleConfidence: rounded(voice?.roleConfidence ?? 0),
    maxPolyphony: voice?.maxPolyphony ?? 0,
    highestVoiceShare: rounded(voice?.highestVoiceShare ?? 0),
    lowestVoiceShare: rounded(voice?.lowestVoiceShare ?? 0),
    supportPitchCount: strongest.pitches.length,
    supportPitches: strongest.pitches,
    supportDurationBeats: rounded(strongest.duration),
    supportDurationRatio: rounded(
      strongest.duration / Math.max(Number.EPSILON, targetEnd - targetStart),
    ),
    supportMass: rounded(supportMass),
    repeatedSupportCount: supportNotes.length,
    eventAvailableSupportPitchCount: available.size,
    supportCoverageRatio: rounded(
      available.size === 0 ? 0 : strongest.pitches.length / available.size,
    ),
    polyphonicSupportVoiceCount: new Set(
      supportNotes.filter((entry) => entry.voice.maxPolyphony >= 2)
        .map((entry) => entry.voice.id),
    ).size,
    hasHarmonyVoice,
    baselineFilterTriggeredForTarget: rejectionReasons.length === 0,
    baselineFilterRejectionReasons: rejectionReasons,
    subset,
  };
}

function targetNote(
  data: MidiSongData,
  file: HarmonySupportFile,
  event: HarmonySupportEvent,
): TimedNote {
  const gold = file.notes.find((note) =>
    note.eventId === event.eventId && note.distractorKind === "melody");
  if (!gold) throw new Error(`Missing target melody Gold note: ${file.fileId}/${event.eventId}`);
  const track = file.tracks.find((candidate) => candidate.trackId === gold.trackId);
  const parsedTrack = data.tracks.find((candidate) =>
    candidate.name === track?.midiTrackName
    && candidate.channel === track?.channel);
  const match = data.notes.find((note) =>
    note.trackIndex === parsedTrack?.index
    && note.channel === track?.channel
    && note.pitch === gold.midi
    && Math.abs(note.startTick / data.ticksPerBeat - gold.startBeat) <= 0.02);
  if (!match) throw new Error(`Target note not found: ${file.fileId}/${event.eventId}`);
  return match;
}

function strongestSupport(
  notes: readonly { note: TimedNote; start: number; end: number }[],
  startBeat: number,
  endBeat: number,
): { pitches: number[]; duration: number } {
  const boundaries = [
    startBeat,
    endBeat,
    ...notes.flatMap((entry) => [
      Math.max(startBeat, entry.start),
      Math.min(endBeat, entry.end),
    ]),
  ].filter((beat) => beat >= startBeat && beat <= endBeat)
    .sort((left, right) => left - right);
  let best = { pitches: [] as number[], duration: 0 };
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const left = boundaries[index]!;
    const right = boundaries[index + 1]!;
    const pitches = sortedUnique(notes.filter(
      (entry) => entry.start <= left && entry.end >= right,
    ).map((entry) => entry.note.pitch));
    const duration = right - left;
    if (
      pitches.length > best.pitches.length
      || (pitches.length === best.pitches.length && duration > best.duration)
    ) {
      best = { pitches, duration };
    }
  }
  return best;
}

function winningDuration(input: VoicingExtractionInput): number | null {
  const candidates = extractSimultaneousCandidates(input);
  const winner = candidates.map((candidate) => ({
    candidate,
    score: scoreVoicingCandidate(input.chord, candidate).score,
  })).sort((left, right) =>
    right.score - left.score
    || right.candidate.durationBeats - left.candidate.durationBeats
    || left.candidate.onsetBeat - right.candidate.onsetBeat
  )[0];
  return winner ? rounded(winner.candidate.durationBeats) : null;
}

function isSupportVoice(voice: Voice): boolean {
  return voice.inferredRole === "harmony"
    || voice.inferredRole === "pad"
    || voice.inferredRole === "mixed"
    || voice.maxPolyphony >= 3;
}

function inputPitches(
  notes: readonly TimedNote[],
  ticksPerBeat: number,
  event: Pick<HarmonySupportEvent, "startBeat" | "endBeat">,
): number[] {
  return sortedUnique(notes.filter((note) => {
    const start = note.startTick / ticksPerBeat;
    const end = (note.startTick + note.durationTick) / ticksPerBeat;
    return end > event.startBeat && start < event.endBeat;
  }).map((note) => note.pitch));
}

function leakedPitches(
  predicted: readonly number[],
  gold: readonly number[],
  distractors: readonly number[],
): number[] {
  const goldSet = new Set(gold);
  const distractorSet = new Set(distractors);
  return sortedUnique(predicted).filter(
    (pitch) => !goldSet.has(pitch) && distractorSet.has(pitch),
  );
}

function noteInstanceId(note: TimedNote, index: number): string {
  return `n${index}:t${note.trackIndex}:c${note.channel ?? "x"}:`
    + `s${note.startTick}:d${note.durationTick}:p${note.pitch}`;
}

function group(
  rows: readonly SupportEvaluationRow[],
  keyFor: (row: SupportEvaluationRow) => string,
): Record<string, SupportAggregate> {
  return Object.fromEntries([...new Set(rows.map(keyFor))].sort().map((key) => [
    key,
    aggregateSupportRows(rows.filter((row) => keyFor(row) === key)),
  ]));
}

function sameSet<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value) => new Set(right).has(value));
}

function sortedUnique(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function count<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  return values.filter(predicate).length;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : rounded(sum(values) / values.length);
}

function ratio(value: number, total: number): number | null {
  return total === 0 ? null : rounded(value / total);
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}
