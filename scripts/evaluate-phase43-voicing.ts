import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { parseChordLabel } from "../src/domain/chords";
import { buildVoiceFeatureInputs, buildVoices, parseMidi } from "../src/domain/midi";
import { normalizeNotes } from "../src/domain/midi/normalize";
import type { Voice, VoiceRole } from "../src/domain/midi/types";
import { annotateVoiceRoles } from "../src/domain/midi/voiceRoles";
import type { ChordSymbol, VoicingRepresentation } from "../src/domain/types";
import {
  extractVoicing,
  leakedNotes,
  voicingCompatibility,
  voicingNoteSetMetrics,
  voicingRegisterMetrics,
  voicingRepresentationMetrics,
  type GoldRepresentation,
  type VoicingExtractionResult,
} from "../src/domain/voicing";

type Split = "dev" | "validation" | "holdout";
type GoldPolicy = "sourceFaithfulMidi" | "aggregateHarmonyMidi" | "dojoIntegratedMidi";

interface GoldTargets {
  sourceFaithfulMidi: number[];
  aggregateHarmonyMidi: number[];
  dojoIntegratedMidi: number[];
}

interface GoldEvent {
  eventId: string;
  startBeat: number;
  endBeat: number;
  chordSymbol: string;
  representationType: GoldRepresentation;
  goldTargets: GoldTargets;
  distractors: { midi: number[] };
}

interface CorpusTrack {
  midiTrackName: string;
  channel: number;
  role: string;
}

interface CorpusFile {
  fileId: string;
  scenarioId: string;
  scenarioTitleJa: string;
  variant: "clean" | "stress";
  split: Split;
  path: string;
  tracks: CorpusTrack[];
  events: GoldEvent[];
}

interface CorpusManifest {
  corpusVersion: string;
  files: CorpusFile[];
}

interface NoteEventRow {
  fileId: string;
  midi: number;
  startBeat: number;
  durationBeats: number;
  sourceEventIds: string[];
  distractorKind: string | null;
}

interface EventEvaluation {
  fileId: string;
  scenarioId: string;
  scenarioTitleJa: string;
  variant: "clean" | "stress";
  eventId: string;
  representationType: GoldRepresentation;
  policy: GoldPolicy;
  goldNotes: number[];
  predictedNotes: number[];
  actualRepresentation: VoicingRepresentation | "none";
  status: VoicingExtractionResult["status"];
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
  lowestNoteAbsoluteError?: number;
  highestNoteAbsoluteError?: number;
  registerExact: boolean;
  octaveError: boolean;
  representationAccurate: boolean;
  simultaneousMiss: boolean;
  aggregatedAsSimultaneous: boolean;
  distractorOpportunityCount: number;
  distractorLeakCount: number;
  melodyOpportunityCount: number;
  melodyLeakCount: number;
  passingToneOpportunityCount: number;
  passingToneLeakCount: number;
  sustainCarryOpportunityCount: number;
  sustainCarryLeakCount: number;
  voiceDuplicateOpportunityCount: number;
  voiceDuplicateLeakCount: number;
  staleAfterEditCorrect?: boolean;
}

const policies: readonly GoldPolicy[] = [
  "sourceFaithfulMidi",
  "aggregateHarmonyMidi",
  "dojoIntegratedMidi",
];
const corpusDir = resolve(cwd(), option("--corpus")
  ?? "test/loop-vault-voicing-gold-corpus-v1");
const split = (option("--split") ?? "dev") as Split;
const output = resolve(cwd(), option("--output")
  ?? `docs/phase4.3/04-oracle-voicing-${split}.json`);
const detailsOutput = resolve(cwd(), option("--details")
  ?? `.local-evaluation/phase4.3/oracle-${split}-events.json`);
const manifest = JSON.parse(
  await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
) as CorpusManifest;
const noteRows = (await readFile(resolve(corpusDir, "note-events.jsonl"), "utf8"))
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line) as NoteEventRow);
const files = manifest.files.filter((file) => file.split === split);
const distractors = buildDistractorIndex(noteRows, files);
const rows: EventEvaluation[] = [];

for (const file of files) {
  const bytes = new Uint8Array(await readFile(resolve(corpusDir, file.path)));
  const data = parseMidi(bytes);
  const rawVoices = buildVoices(data);
  const features = buildVoiceFeatureInputs(rawVoices, normalizeNotes(data));
  const goldVoices = annotateVoiceRoles(rawVoices, features, goldRoleOverrides(rawVoices, file.tracks));

  for (const event of file.events) {
    const chord = parseChordLabel(event.chordSymbol);
    const extraction = chord
      ? extractVoicing({
          chord,
          segment: { startBeat: event.startBeat, endBeat: event.endBeat },
          notes: data.notes,
          ticksPerBeat: data.ticksPerBeat,
          voices: goldVoices,
        })
      : { status: "not-found" as const, reasons: ["no-chord-gold"] };
    const predictedNotes = extraction.snapshot?.midiNotes ?? [];
    const eventDistractors = distractors.get(`${file.fileId}/${event.eventId}`) ?? emptyDistractors();

    for (const policy of policies) {
      rows.push(evaluateEvent(file, event, policy, extraction, predictedNotes, eventDistractors, chord));
    }
  }
}

const report = {
  schemaVersion: 1,
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  condition: "A",
  boundary: "gold",
  roles: "gold",
  split,
  fileCount: files.length,
  eventCount: files.reduce((sum, file) => sum + file.events.length, 0),
  policies: Object.fromEntries(policies.map((policy) => [
    policy,
    aggregate(rows.filter((row) => row.policy === policy)),
  ])),
  byVariant: Object.fromEntries(
    (["clean", "stress"] as const).map((variant) => [
      variant,
      Object.fromEntries(policies.map((policy) => [
        policy,
        aggregate(rows.filter((row) => row.variant === variant && row.policy === policy)),
      ])),
    ]),
  ),
  byRepresentationType: Object.fromEntries(
    (["simultaneous", "aggregated", "hybrid", "none"] as const).map((representation) => [
      representation,
      aggregate(rows.filter(
        (row) => row.representationType === representation && row.policy === "sourceFaithfulMidi",
      )),
    ]),
  ),
  byScenario: Object.fromEntries(
    [...new Set(rows.map((row) => row.scenarioId))].sort().map((scenarioId) => [
      scenarioId,
      {
        titleJa: rows.find((row) => row.scenarioId === scenarioId)?.scenarioTitleJa,
        sourceFaithful: aggregate(rows.filter(
          (row) => row.scenarioId === scenarioId && row.policy === "sourceFaithfulMidi",
        )),
      },
    ]),
  ),
  holdoutStatus: split === "holdout" ? "evaluated" : "not-evaluated",
};

await mkdir(dirname(output), { recursive: true });
await mkdir(dirname(detailsOutput), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(detailsOutput, `${JSON.stringify({ schemaVersion: 1, split, rows }, null, 2)}\n`, "utf8");
stdout.write(`P4.3 Oracle A: ${files.length} files / ${report.eventCount} events (${split})\n`);
stdout.write(`${JSON.stringify(report.policies, null, 2)}\n`);

function evaluateEvent(
  file: CorpusFile,
  event: GoldEvent,
  policy: GoldPolicy,
  extraction: VoicingExtractionResult,
  predictedNotes: number[],
  eventDistractors: DistractorIndex,
  chord: ChordSymbol | null,
): EventEvaluation {
  const goldNotes = event.goldTargets[policy];
  const note = voicingNoteSetMetrics(predictedNotes, goldNotes);
  const register = voicingRegisterMetrics(predictedNotes, goldNotes);
  const representation = voicingRepresentationMetrics(
    extraction.snapshot?.representation,
    event.representationType,
  );
  const leak = leakCounts(predictedNotes, goldNotes, eventDistractors);
  const staleAfterEditCorrect = extraction.snapshot && chord
    ? voicingCompatibility(extraction.snapshot, {
        ...chord,
        root: (chord.root + 1) % 12,
      }) === "stale"
    : undefined;
  return {
    fileId: file.fileId,
    scenarioId: file.scenarioId,
    scenarioTitleJa: file.scenarioTitleJa,
    variant: file.variant,
    eventId: event.eventId,
    representationType: event.representationType,
    policy,
    goldNotes,
    predictedNotes,
    actualRepresentation: extraction.snapshot?.representation ?? "none",
    status: extraction.status,
    reasons: extraction.reasons,
    exact: note.exact,
    truePositive: note.truePositive,
    predictedCount: new Set(predictedNotes).size,
    goldCount: new Set(goldNotes).size,
    extraNoteCount: note.extraNoteCount,
    missingNoteCount: note.missingNoteCount,
    precision: note.precision,
    recall: note.recall,
    f1: note.f1,
    bassNoteCorrect: register.bassNoteCorrect,
    topNoteCorrect: register.topNoteCorrect,
    ...(register.lowestNoteAbsoluteError === undefined
      ? {}
      : { lowestNoteAbsoluteError: register.lowestNoteAbsoluteError }),
    ...(register.highestNoteAbsoluteError === undefined
      ? {}
      : { highestNoteAbsoluteError: register.highestNoteAbsoluteError }),
    registerExact: register.registerExact,
    octaveError: register.octaveError,
    representationAccurate: representation.accurate,
    simultaneousMiss: representation.simultaneousMiss,
    aggregatedAsSimultaneous: representation.aggregatedAsSimultaneous,
    ...leak,
    ...(staleAfterEditCorrect === undefined ? {} : { staleAfterEditCorrect }),
  };
}

function aggregate(rowsToAggregate: readonly EventEvaluation[]) {
  const events = rowsToAggregate.length;
  const predictedNotes = sum(rowsToAggregate.map((row) => row.predictedCount));
  const goldNotes = sum(rowsToAggregate.map((row) => row.goldCount));
  const truePositive = sum(rowsToAggregate.map((row) => row.truePositive));
  const precision = predictedNotes === 0 ? (goldNotes === 0 ? 1 : 0) : truePositive / predictedNotes;
  const recall = goldNotes === 0 ? (predictedNotes === 0 ? 1 : 0) : truePositive / goldNotes;
  const registerRows = rowsToAggregate.filter(
    (row) => row.lowestNoteAbsoluteError !== undefined && row.highestNoteAbsoluteError !== undefined,
  );
  const simultaneous = rowsToAggregate.filter(
    (row) => row.representationType === "simultaneous" || row.representationType === "hybrid",
  );
  const aggregated = rowsToAggregate.filter((row) => row.representationType === "aggregated");
  const staleRows = rowsToAggregate.filter((row) => row.staleAfterEditCorrect !== undefined);
  return {
    events,
    voicingExactRate: ratio(rowsToAggregate.filter((row) => row.exact).length, events),
    notePrecision: rounded(precision),
    noteRecall: rounded(recall),
    noteF1: rounded(precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)),
    extraNoteCount: sum(rowsToAggregate.map((row) => row.extraNoteCount)),
    missingNoteCount: sum(rowsToAggregate.map((row) => row.missingNoteCount)),
    bassNoteAccuracy: ratio(rowsToAggregate.filter((row) => row.bassNoteCorrect).length, events),
    topNoteAccuracy: ratio(rowsToAggregate.filter((row) => row.topNoteCorrect).length, events),
    lowestNoteAbsoluteError: mean(registerRows.map((row) => row.lowestNoteAbsoluteError!)),
    highestNoteAbsoluteError: mean(registerRows.map((row) => row.highestNoteAbsoluteError!)),
    registerExactRate: ratio(rowsToAggregate.filter((row) => row.registerExact).length, events),
    octaveErrorRate: ratio(rowsToAggregate.filter((row) => row.octaveError).length, events),
    representationTypeAccuracy: ratio(
      rowsToAggregate.filter((row) => row.representationAccurate).length,
      events,
    ),
    simultaneousExactRate: ratio(simultaneous.filter((row) => row.exact).length, simultaneous.length),
    aggregateF1: mean(aggregated.map((row) => row.f1)),
    simultaneousMissRate: ratio(
      simultaneous.filter((row) => row.simultaneousMiss).length,
      simultaneous.length,
    ),
    aggregatedAsSimultaneousRate: ratio(
      aggregated.filter((row) => row.aggregatedAsSimultaneous).length,
      aggregated.length,
    ),
    distractorLeakRate: leakRate(rowsToAggregate, "distractor"),
    melodyLeakRate: leakRate(rowsToAggregate, "melody"),
    passingToneLeakRate: leakRate(rowsToAggregate, "passingTone"),
    sustainCarryLeakRate: leakRate(rowsToAggregate, "sustainCarry"),
    voiceDuplicateLeakRate: leakRate(rowsToAggregate, "voiceDuplicate"),
    sourceVoicingUsableRate: ratio(
      rowsToAggregate.filter((row) => row.status === "usable").length,
      events,
    ),
    generatedFallbackRate: ratio(
      rowsToAggregate.filter((row) => row.status !== "usable").length,
      events,
    ),
    requiresReviewRate: ratio(
      rowsToAggregate.filter((row) => row.status === "review").length,
      events,
    ),
    staleAfterChordEditAccuracy: ratio(
      staleRows.filter((row) => row.staleAfterEditCorrect).length,
      staleRows.length,
    ),
  };
}

interface DistractorIndex {
  all: number[];
  melody: number[];
  passingTone: number[];
  sustainCarry: number[];
  voiceDuplicate: number[];
}

function buildDistractorIndex(
  rowsToIndex: readonly NoteEventRow[],
  corpusFiles: readonly CorpusFile[],
): Map<string, DistractorIndex> {
  const result = new Map<string, DistractorIndex>();
  const eventsByFile = new Map(corpusFiles.map((file) => [file.fileId, file.events]));
  for (const row of rowsToIndex) {
    if (!row.distractorKind) continue;
    const overlappingEventIds = (eventsByFile.get(row.fileId) ?? [])
      .filter((event) => intervalsOverlap(
        row.startBeat,
        row.startBeat + row.durationBeats,
        event.startBeat,
        event.endBeat,
      ))
      .map((event) => event.eventId);
    for (const eventId of new Set([...row.sourceEventIds, ...overlappingEventIds])) {
      const key = `${row.fileId}/${eventId}`;
      const index = result.get(key) ?? emptyDistractors();
      index.all.push(row.midi);
      if (/melody|lead/i.test(row.distractorKind)) index.melody.push(row.midi);
      if (/passing/i.test(row.distractorKind)) index.passingTone.push(row.midi);
      if (/sustain/i.test(row.distractorKind)) index.sustainCarry.push(row.midi);
      if (/duplicate/i.test(row.distractorKind)) index.voiceDuplicate.push(row.midi);
      result.set(key, index);
    }
  }
  return result;
}

function intervalsOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return Math.min(leftEnd, rightEnd) > Math.max(leftStart, rightStart);
}

function emptyDistractors(): DistractorIndex {
  return { all: [], melody: [], passingTone: [], sustainCarry: [], voiceDuplicate: [] };
}

function leakCounts(
  predicted: readonly number[],
  gold: readonly number[],
  distractor: DistractorIndex,
) {
  return {
    distractorOpportunityCount: new Set(distractor.all).size,
    distractorLeakCount: leakedNotes(predicted, gold, distractor.all).length,
    melodyOpportunityCount: new Set(distractor.melody).size,
    melodyLeakCount: leakedNotes(predicted, gold, distractor.melody).length,
    passingToneOpportunityCount: new Set(distractor.passingTone).size,
    passingToneLeakCount: leakedNotes(predicted, gold, distractor.passingTone).length,
    sustainCarryOpportunityCount: new Set(distractor.sustainCarry).size,
    sustainCarryLeakCount: leakedNotes(predicted, gold, distractor.sustainCarry).length,
    voiceDuplicateOpportunityCount: new Set(distractor.voiceDuplicate).size,
    voiceDuplicateLeakCount: leakedNotes(predicted, gold, distractor.voiceDuplicate).length,
  };
}

function leakRate(rowsToAggregate: readonly EventEvaluation[], name: LeakName): number | null {
  const opportunityKey = `${name}OpportunityCount` as const;
  const leakKey = `${name}LeakCount` as const;
  const opportunities = sum(rowsToAggregate.map((row) => row[opportunityKey]));
  return opportunities === 0 ? null : rounded(
    sum(rowsToAggregate.map((row) => row[leakKey])) / opportunities,
  );
}

type LeakName = "distractor" | "melody" | "passingTone" | "sustainCarry" | "voiceDuplicate";

function goldRoleOverrides(
  voices: readonly Voice[],
  tracks: readonly CorpusTrack[],
): Record<string, VoiceRole> {
  return Object.fromEntries(voices.flatMap((voice) => {
    const track = tracks.find((candidate) =>
      candidate.channel === voice.channel
      && candidate.midiTrackName === voice.trackName);
    return track ? [[voice.id, mapGoldRole(track.role)]] : [];
  }));
}

function mapGoldRole(role: string): VoiceRole {
  if (role === "bass") return "bass";
  if (role === "percussion") return "percussion";
  if (role === "melody" || role === "voice") return "melody";
  return "harmony";
}

function option(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: readonly number[]): number | null {
  return values.length ? rounded(sum(values) / values.length) : null;
}

function ratio(value: number, total: number): number | null {
  return total ? rounded(value / total) : null;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}
