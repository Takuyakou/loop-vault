import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
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
  VoiceRole,
} from "../../src/domain/midi/types";
import { annotateVoiceRoles } from "../../src/domain/midi/voiceRoles";
import {
  extractVoicing,
  voicingNoteSetMetrics,
  voicingRegisterMetrics,
} from "../../src/domain/voicing";

export type Phase44Split = "dev" | "validation" | "holdout";
export type Phase44Condition = "A" | "A+" | "B";

export interface Phase44Track {
  trackId: string;
  midiTrackName: string;
  channel: number;
  program: number;
  goldRole: string;
}

export interface Phase44GoldEvent {
  eventId: string;
  bar: number;
  startBeat: number;
  endBeat: number;
  chordSymbol: string;
  goldVoicingMidi: number[];
  goldBassMidi: number[];
  goldUpperMidi: number[];
  excludedDistractorMidi: number[];
  goldTopNote: number;
  goldBottomNote: number;
}

export interface Phase44GoldNote {
  trackId: string;
  role: string;
  midi: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  eventId: string;
  goldVoicing: boolean;
  distractorKind: string | null;
}

export interface Phase44CorpusFile {
  fileId: string;
  scenarioId: string;
  scenarioSlug: string;
  scenarioTitleJa: string;
  variant: "clean" | "stress";
  split: Phase44Split;
  path: string;
  sha256: string;
  byteLength: number;
  ppq: number;
  tracks: Phase44Track[];
  events: Phase44GoldEvent[];
  notes: Phase44GoldNote[];
}

export interface Phase44Manifest {
  corpusVersion: string;
  scenarioCount: number;
  fileCount: number;
  eventCount: number;
  splitCounts: Record<Phase44Split, number>;
  files: Phase44CorpusFile[];
}

export interface Phase44EventEvaluation {
  condition: Phase44Condition;
  fileId: string;
  scenarioId: string;
  scenarioSlug: string;
  variant: "clean" | "stress";
  split: Phase44Split;
  eventId: string;
  trackLayout: "same-track" | "separate-track";
  goldNotes: number[];
  predictedNotes: number[];
  observedNotes: number[];
  status: "usable" | "review" | "not-found";
  reasons: string[];
  exact: boolean;
  truePositive: number;
  predictedCount: number;
  goldCount: number;
  extraNoteCount: number;
  missingNoteCount: number;
  precision: number;
  recall: number;
  f1: number;
  bassNoteCorrect: boolean;
  topNoteCorrect: boolean;
  registerExact: boolean;
  octaveError: boolean;
  melodyOpportunityCount: number;
  melodyLeakCount: number;
  contaminationEvent: boolean;
  sourceNoteAdditionCount: number;
}

export interface Phase44Aggregate {
  events: number;
  voicingExactRate: number | null;
  notePrecision: number;
  noteRecall: number;
  noteF1: number;
  extraNoteCount: number;
  missingNoteCount: number;
  bassNoteAccuracy: number | null;
  topNoteAccuracy: number | null;
  registerExactRate: number | null;
  octaveErrorRate: number | null;
  melodyLeakRate: number | null;
  melodyContaminationEventCount: number;
  sourceVoicingUsableRate: number | null;
  generatedFallbackRate: number | null;
  sourceNoteAdditionCount: number;
}

export async function loadPhase44Manifest(corpusDir: string): Promise<Phase44Manifest> {
  return JSON.parse(
    await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
  ) as Phase44Manifest;
}

export async function verifyPhase44Corpus(corpusDir: string, manifest: Phase44Manifest) {
  const fileIds = new Set<string>();
  const paths = new Set<string>();
  const scenarioSplits = new Map<string, Set<Phase44Split>>();
  const scenarioVariants = new Map<string, Set<string>>();
  let shaMatches = 0;
  let byteLengthMatches = 0;
  let events = 0;
  let notes = 0;
  let filesWithGoldTrackRole = 0;
  let filesWithGoldPerNoteRole = 0;
  let eventsWithExcludedDistractors = 0;
  let eventsWithBassUpperTopBottom = 0;

  for (const file of manifest.files) {
    if (fileIds.has(file.fileId)) throw new Error(`Duplicate fileId: ${file.fileId}`);
    if (paths.has(file.path)) throw new Error(`Duplicate path: ${file.path}`);
    fileIds.add(file.fileId);
    paths.add(file.path);
    addToSet(scenarioSplits, file.scenarioId, file.split);
    addToSet(scenarioVariants, file.scenarioId, file.variant);
    const midiPath = resolve(corpusDir, file.path);
    const bytes = await readFile(midiPath);
    const actualSha = createHash("sha256").update(bytes).digest("hex");
    const actualSize = (await stat(midiPath)).size;
    if (actualSha === file.sha256) shaMatches += 1;
    if (actualSize === file.byteLength) byteLengthMatches += 1;
    events += file.events.length;
    notes += file.notes.length;
    if (file.tracks.every((track) => track.goldRole.length > 0)) filesWithGoldTrackRole += 1;
    if (file.notes.every((note) => note.role.length > 0)) filesWithGoldPerNoteRole += 1;
    eventsWithExcludedDistractors += file.events.filter(
      (event) => Array.isArray(event.excludedDistractorMidi),
    ).length;
    eventsWithBassUpperTopBottom += file.events.filter(
      (event) =>
        Array.isArray(event.goldBassMidi)
        && Array.isArray(event.goldUpperMidi)
        && Number.isInteger(event.goldTopNote)
        && Number.isInteger(event.goldBottomNote),
    ).length;
  }

  const badPairs = [...scenarioVariants.entries()]
    .filter(([, variants]) => !variants.has("clean") || !variants.has("stress"))
    .map(([scenarioId]) => scenarioId);
  const splitOverlap = [...scenarioSplits.entries()]
    .filter(([, splits]) => splits.size !== 1)
    .map(([scenarioId]) => scenarioId);
  const valid =
    manifest.fileCount === manifest.files.length
    && manifest.eventCount === events
    && shaMatches === manifest.files.length
    && byteLengthMatches === manifest.files.length
    && badPairs.length === 0
    && splitOverlap.length === 0
    && filesWithGoldTrackRole === manifest.files.length
    && filesWithGoldPerNoteRole === manifest.files.length
    && eventsWithExcludedDistractors === events
    && eventsWithBassUpperTopBottom === events;

  return {
    valid,
    corpusVersion: manifest.corpusVersion,
    fileCount: manifest.files.length,
    scenarioCount: new Set(manifest.files.map((file) => file.scenarioId)).size,
    eventCount: events,
    noteCount: notes,
    splitCounts: countBy(manifest.files, (file) => file.split),
    variantCounts: countBy(manifest.files, (file) => file.variant),
    shaMatches,
    byteLengthMatches,
    cleanStressPairCount: scenarioVariants.size - badPairs.length,
    badPairs,
    splitOverlap,
    filesWithGoldTrackRole,
    filesWithGoldPerNoteRole,
    eventsWithExcludedDistractors,
    eventsWithBassUpperTopBottom,
  };
}

export async function evaluatePhase44Split(
  corpusDir: string,
  manifest: Phase44Manifest,
  split: Phase44Split,
  conditions: readonly Phase44Condition[],
): Promise<Phase44EventEvaluation[]> {
  const rows: Phase44EventEvaluation[] = [];
  for (const file of manifest.files.filter((candidate) => candidate.split === split)) {
    const bytes = new Uint8Array(await readFile(resolve(corpusDir, file.path)));
    const data = parseMidi(bytes);
    const rawVoices = buildVoices(data);
    const features = buildVoiceFeatureInputs(rawVoices, normalizeNotes(data));
    const productVoices = annotateVoiceRoles(rawVoices, features);
    const goldVoices = annotateVoiceRoles(
      rawVoices,
      features,
      goldRoleOverrides(rawVoices, file.tracks),
    );
    const perNoteGoldNotes = buildPerNoteGoldNotes(data, file);

    for (const event of file.events) {
      const chord = parseChordLabel(event.chordSymbol);
      if (!chord) throw new Error(`Unparseable Gold chord: ${file.fileId}/${event.eventId}`);
      for (const condition of conditions) {
        const notes = condition === "A+" ? perNoteGoldNotes : data.notes;
        const voices = condition === "B" ? productVoices : goldVoices;
        const extraction = extractVoicing({
          chord,
          segment: { startBeat: event.startBeat, endBeat: event.endBeat },
          notes,
          ticksPerBeat: data.ticksPerBeat,
          voices,
        });
        const predicted = extraction.snapshot?.midiNotes ?? [];
        const observed = observedPitches(data, event);
        const noteMetrics = voicingNoteSetMetrics(predicted, event.goldVoicingMidi);
        const register = voicingRegisterMetrics(predicted, event.goldVoicingMidi);
        const leaked = leakedPitches(
          predicted,
          event.goldVoicingMidi,
          event.excludedDistractorMidi,
        );
        rows.push({
          condition,
          fileId: file.fileId,
          scenarioId: file.scenarioId,
          scenarioSlug: file.scenarioSlug,
          variant: file.variant,
          split: file.split,
          eventId: event.eventId,
          trackLayout: eventTrackLayout(file, event),
          goldNotes: event.goldVoicingMidi,
          predictedNotes: predicted,
          observedNotes: observed,
          status: extraction.status,
          reasons: extraction.reasons,
          exact: noteMetrics.exact,
          truePositive: noteMetrics.truePositive,
          predictedCount: new Set(predicted).size,
          goldCount: new Set(event.goldVoicingMidi).size,
          extraNoteCount: noteMetrics.extraNoteCount,
          missingNoteCount: noteMetrics.missingNoteCount,
          precision: noteMetrics.precision,
          recall: noteMetrics.recall,
          f1: noteMetrics.f1,
          bassNoteCorrect: register.bassNoteCorrect,
          topNoteCorrect: register.topNoteCorrect,
          registerExact: register.registerExact,
          octaveError: register.octaveError,
          melodyOpportunityCount: new Set(event.excludedDistractorMidi).size,
          melodyLeakCount: leaked.length,
          contaminationEvent: leaked.length > 0,
          sourceNoteAdditionCount: predicted.filter((pitch) => !observed.includes(pitch)).length,
        });
      }
    }
  }
  return rows;
}

export function aggregatePhase44Rows(
  rows: readonly Phase44EventEvaluation[],
): Phase44Aggregate {
  const events = rows.length;
  const truePositive = sum(rows.map((row) => row.truePositive));
  const predictedCount = sum(rows.map((row) => row.predictedCount));
  const goldCount = sum(rows.map((row) => row.goldCount));
  const precision = predictedCount === 0 ? (goldCount === 0 ? 1 : 0) : truePositive / predictedCount;
  const recall = goldCount === 0 ? (predictedCount === 0 ? 1 : 0) : truePositive / goldCount;
  const opportunities = sum(rows.map((row) => row.melodyOpportunityCount));
  return {
    events,
    voicingExactRate: ratio(rows.filter((row) => row.exact).length, events),
    notePrecision: rounded(precision),
    noteRecall: rounded(recall),
    noteF1: rounded(precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)),
    extraNoteCount: sum(rows.map((row) => row.extraNoteCount)),
    missingNoteCount: sum(rows.map((row) => row.missingNoteCount)),
    bassNoteAccuracy: ratio(rows.filter((row) => row.bassNoteCorrect).length, events),
    topNoteAccuracy: ratio(rows.filter((row) => row.topNoteCorrect).length, events),
    registerExactRate: ratio(rows.filter((row) => row.registerExact).length, events),
    octaveErrorRate: ratio(rows.filter((row) => row.octaveError).length, events),
    melodyLeakRate: opportunities === 0
      ? null
      : rounded(sum(rows.map((row) => row.melodyLeakCount)) / opportunities),
    melodyContaminationEventCount: rows.filter((row) => row.contaminationEvent).length,
    sourceVoicingUsableRate: ratio(rows.filter((row) => row.status === "usable").length, events),
    generatedFallbackRate: ratio(rows.filter((row) => row.status !== "usable").length, events),
    sourceNoteAdditionCount: sum(rows.map((row) => row.sourceNoteAdditionCount)),
  };
}

export function groupedPhase44Report(rows: readonly Phase44EventEvaluation[]) {
  const conditionRows = (condition: Phase44Condition) =>
    rows.filter((row) => row.condition === condition);
  return Object.fromEntries(
    [...new Set(rows.map((row) => row.condition))].map((condition) => [
      condition,
      {
        overall: aggregatePhase44Rows(conditionRows(condition)),
        byVariant: Object.fromEntries(
          (["clean", "stress"] as const).map((variant) => [
            variant,
            aggregatePhase44Rows(conditionRows(condition).filter((row) => row.variant === variant)),
          ]),
        ),
        byTrackLayout: Object.fromEntries(
          (["separate-track", "same-track"] as const).map((layout) => [
            layout,
            aggregatePhase44Rows(
              conditionRows(condition).filter((row) => row.trackLayout === layout),
            ),
          ]),
        ),
        byScenario: Object.fromEntries(
          [...new Set(conditionRows(condition).map((row) => row.scenarioId))]
            .sort()
            .map((scenarioId) => [
              scenarioId,
              {
                slug: conditionRows(condition).find((row) => row.scenarioId === scenarioId)
                  ?.scenarioSlug,
                metrics: aggregatePhase44Rows(
                  conditionRows(condition).filter((row) => row.scenarioId === scenarioId),
                ),
              },
            ]),
        ),
      },
    ]),
  );
}

function goldRoleOverrides(
  voices: readonly Voice[],
  tracks: readonly Phase44Track[],
): Record<string, VoiceRole> {
  return Object.fromEntries(voices.flatMap((voice) => {
    const track = tracks.find((candidate) =>
      candidate.channel === voice.channel
      && candidate.midiTrackName === voice.trackName);
    return track ? [[voice.id, mapGoldRole(track.goldRole)]] : [];
  }));
}

function mapGoldRole(role: string): VoiceRole {
  if (role === "bass") return "bass";
  if (role === "percussion") return "percussion";
  if (role === "melody" || role === "voice") return "melody";
  if (role === "pad") return "pad";
  if (role === "mixed") return "mixed";
  return "harmony";
}

function buildPerNoteGoldNotes(
  data: MidiSongData,
  file: Phase44CorpusFile,
): TimedNote[] {
  const tracksById = new Map(file.tracks.map((track) => [track.trackId, track]));
  return file.notes
    .filter((note) => note.goldVoicing)
    .flatMap((note) => {
      const track = tracksById.get(note.trackId);
      if (!track) return [];
      const parsedTrack = data.tracks.find((candidate) =>
        candidate.name === track.midiTrackName
        && candidate.channel === track.channel);
      if (!parsedTrack) return [];
      return [{
        pitch: note.midi,
        startTick: Math.round(note.startBeat * data.ticksPerBeat),
        durationTick: Math.max(1, Math.round(note.durationBeats * data.ticksPerBeat)),
        velocity: note.velocity,
        trackIndex: parsedTrack.index,
        channel: track.channel,
        program: track.program,
        programExplicit: true,
      }];
    });
}

function observedPitches(
  data: MidiSongData,
  event: Pick<Phase44GoldEvent, "startBeat" | "endBeat">,
): number[] {
  return [...new Set(data.notes.filter((note) => {
    const start = note.startTick / data.ticksPerBeat;
    const end = (note.startTick + note.durationTick) / data.ticksPerBeat;
    return end > event.startBeat && start < event.endBeat;
  }).map((note) => note.pitch))];
}

function leakedPitches(
  predicted: readonly number[],
  gold: readonly number[],
  distractors: readonly number[],
): number[] {
  const goldSet = new Set(gold);
  const distractorSet = new Set(distractors);
  return [...new Set(predicted)].filter(
    (pitch) => !goldSet.has(pitch) && distractorSet.has(pitch),
  );
}

function eventTrackLayout(
  file: Phase44CorpusFile,
  event: Phase44GoldEvent,
): "same-track" | "separate-track" {
  const relevant = file.notes.filter((note) => note.eventId === event.eventId);
  const rolesByTrack = new Map<string, Set<string>>();
  for (const note of relevant) addToSet(rolesByTrack, note.trackId, note.role);
  return [...rolesByTrack.values()].some(
    (roles) =>
      roles.has("harmony")
      && (roles.has("melody") || roles.has("voice")),
  )
    ? "same-track"
    : "separate-track";
}

function addToSet<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const values = map.get(key) ?? new Set<V>();
  values.add(value);
  map.set(key, values);
}

function countBy<T>(values: readonly T[], keyFor: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function ratio(value: number, total: number): number | null {
  return total === 0 ? null : rounded(value / total);
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}
