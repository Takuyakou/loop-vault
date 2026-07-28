import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { parseChordLabel } from "../src/domain/chords";
import { analyzeMidi, buildVoiceFeatureInputs, buildVoices, parseMidi } from "../src/domain/midi";
import { normalizeNotes } from "../src/domain/midi/normalize";
import type { Voice, VoiceRole } from "../src/domain/midi/types";
import { beatsPerBar } from "../src/domain/midi/timing";
import { annotateVoiceRoles } from "../src/domain/midi/voiceRoles";
import type {
  ChordSymbol,
  ChordTimelineItem,
  MidiProgressionAnalysis,
  VoicingRepresentation,
} from "../src/domain/types";
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
type Condition = "A" | "B" | "C" | "D";

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
  condition: Condition;
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
const conditions = parseConditions(option("--conditions"));
const matrix = conditions.length > 1;
const output = resolve(cwd(), option("--output")
  ?? (matrix
    ? `docs/phase4.3/05-voicing-ablation-${split}.json`
    : `docs/phase4.3/04-oracle-voicing-${split}.json`));
const detailsOutput = resolve(cwd(), option("--details")
  ?? `.local-evaluation/phase4.3/${matrix ? "ablation" : "oracle"}-${split}-events.json`);
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
  const productVoices = annotateVoiceRoles(rawVoices, features);
  const productAnalysis = conditions.some((condition) => condition === "C" || condition === "D")
    ? analyzeMidi(bytes, { mode: "phase4-v1", fileName: file.path })
    : undefined;

  for (const event of file.events) {
    const chord = parseChordLabel(event.chordSymbol);
    const eventDistractors = distractors.get(`${file.fileId}/${event.eventId}`) ?? emptyDistractors();
    for (const condition of conditions) {
      const segment = usesProductBoundary(condition) && productAnalysis
        ? productSegment(productAnalysis, event)
        : { startBeat: event.startBeat, endBeat: event.endBeat };
      const voices = usesProductRoles(condition) ? productVoices : goldVoices;
      const extraction = chord
        ? extractVoicing({
            chord,
            segment,
            notes: data.notes,
            ticksPerBeat: data.ticksPerBeat,
            voices,
          })
        : { status: "not-found" as const, reasons: ["no-chord-gold"] };
      const predictedNotes = extraction.snapshot?.midiNotes ?? [];
      for (const policy of policies) {
        rows.push(evaluateEvent(
          condition,
          file,
          event,
          policy,
          extraction,
          predictedNotes,
          eventDistractors,
          chord,
        ));
      }
    }
  }
}

const baseReport = {
  schemaVersion: 1,
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  split,
  fileCount: files.length,
  eventCount: files.reduce((sum, file) => sum + file.events.length, 0),
  holdoutStatus: split === "holdout" ? "evaluated" : "not-evaluated",
};
const conditionReports = Object.fromEntries(conditions.map((condition) => [
  condition,
  buildConditionReport(condition, rows),
]));
const report = matrix
  ? {
      ...baseReport,
      conditions: conditionReports,
      deltas: buildAblationDeltas(conditionReports),
    }
  : {
      ...baseReport,
      condition: conditions[0],
      ...conditionReports[conditions[0]!],
    };

await mkdir(dirname(output), { recursive: true });
await mkdir(dirname(detailsOutput), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(detailsOutput, `${JSON.stringify({ schemaVersion: 1, split, rows }, null, 2)}\n`, "utf8");
stdout.write(`P4.3 ${matrix ? "Ablation A-D" : `Oracle ${conditions[0]}`}: ${files.length} files / ${report.eventCount} events (${split})\n`);
stdout.write(`${JSON.stringify(
  matrix
    ? {
        policies: Object.fromEntries(conditions.map((condition) => [
          condition,
          conditionReports[condition]!.policies.sourceFaithfulMidi,
        ])),
        deltas: "deltas" in report ? report.deltas : {},
      }
    : conditionReports[conditions[0]!],
  null,
  2,
)}\n`);

function evaluateEvent(
  condition: Condition,
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
    condition,
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

function buildConditionReport(condition: Condition, allRows: readonly EventEvaluation[]) {
  const conditionRows = allRows.filter((row) => row.condition === condition);
  return {
    boundary: usesProductBoundary(condition) ? "product" : "gold",
    roles: usesProductRoles(condition) ? "product" : "gold",
    policies: Object.fromEntries(policies.map((policy) => [
      policy,
      aggregate(conditionRows.filter((row) => row.policy === policy)),
    ])),
    byVariant: Object.fromEntries(
      (["clean", "stress"] as const).map((variant) => [
        variant,
        Object.fromEntries(policies.map((policy) => [
          policy,
          aggregate(conditionRows.filter((row) => row.variant === variant && row.policy === policy)),
        ])),
      ]),
    ),
    byRepresentationType: Object.fromEntries(
      (["simultaneous", "aggregated", "hybrid", "none"] as const).map((representation) => [
        representation,
        aggregate(conditionRows.filter(
          (row) => row.representationType === representation && row.policy === "sourceFaithfulMidi",
        )),
      ]),
    ),
    byScenario: Object.fromEntries(
      [...new Set(conditionRows.map((row) => row.scenarioId))].sort().map((scenarioId) => [
        scenarioId,
        {
          titleJa: conditionRows.find((row) => row.scenarioId === scenarioId)?.scenarioTitleJa,
          sourceFaithful: aggregate(conditionRows.filter(
            (row) => row.scenarioId === scenarioId && row.policy === "sourceFaithfulMidi",
          )),
        },
      ]),
    ),
  };
}

type ConditionReport = ReturnType<typeof buildConditionReport>;

function buildAblationDeltas(reports: Record<string, ConditionReport>) {
  const source = (condition: Condition) => reports[condition]!.policies.sourceFaithfulMidi;
  return {
    "B-A-role-loss": metricDelta(source("B"), source("A")),
    "C-A-boundary-loss": metricDelta(source("C"), source("A")),
    "D-B-interaction-vs-role": metricDelta(source("D"), source("B")),
    "D-C-interaction-vs-boundary": metricDelta(source("D"), source("C")),
    "D-A-total-loss": metricDelta(source("D"), source("A")),
  };
}

function metricDelta(
  current: ReturnType<typeof aggregate>,
  baseline: ReturnType<typeof aggregate>,
) {
  return {
    voicingExactRate: subtract(current.voicingExactRate, baseline.voicingExactRate),
    notePrecision: subtract(current.notePrecision, baseline.notePrecision),
    noteRecall: subtract(current.noteRecall, baseline.noteRecall),
    noteF1: subtract(current.noteF1, baseline.noteF1),
    registerExactRate: subtract(current.registerExactRate, baseline.registerExactRate),
    representationTypeAccuracy: subtract(
      current.representationTypeAccuracy,
      baseline.representationTypeAccuracy,
    ),
    sourceVoicingUsableRate: subtract(
      current.sourceVoicingUsableRate,
      baseline.sourceVoicingUsableRate,
    ),
    generatedFallbackRate: subtract(current.generatedFallbackRate, baseline.generatedFallbackRate),
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

function productSegment(
  analysis: MidiProgressionAnalysis,
  event: Pick<GoldEvent, "startBeat" | "endBeat">,
): { startBeat: number; endBeat: number } {
  const meter = beatsPerBar(analysis.timeSignature);
  const best = [...analysis.fullTimeline].sort((left, right) => {
    const leftRange = timelineRange(left, meter);
    const rightRange = timelineRange(right, meter);
    return intervalIou(rightRange.startBeat, rightRange.endBeat, event.startBeat, event.endBeat)
      - intervalIou(leftRange.startBeat, leftRange.endBeat, event.startBeat, event.endBeat)
      || leftRange.startBeat - rightRange.startBeat;
  })[0];
  return best ? timelineRange(best, meter) : { startBeat: event.startBeat, endBeat: event.endBeat };
}

function timelineRange(item: ChordTimelineItem, meter: number) {
  const startBeat = (item.bar - 1) * meter + item.beat - 1;
  return { startBeat, endBeat: startBeat + item.durationBeats };
}

function intervalIou(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): number {
  const intersection = Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
  const union = Math.max(leftEnd, rightEnd) - Math.min(leftStart, rightStart);
  return union > 0 ? intersection / union : 0;
}

function parseConditions(value: string | undefined): Condition[] {
  if (!value) return ["A"];
  if (value === "all") return ["A", "B", "C", "D"];
  const parsed = value.split(",").filter((entry): entry is Condition =>
    ["A", "B", "C", "D"].includes(entry));
  if (parsed.length === 0) throw new Error(`Invalid --conditions: ${value}`);
  return [...new Set(parsed)];
}

function usesProductBoundary(condition: Condition): boolean {
  return condition === "C" || condition === "D";
}

function usesProductRoles(condition: Condition): boolean {
  return condition === "B" || condition === "D";
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

function subtract(
  current: number | null,
  baseline: number | null,
): number | null {
  return current === null || baseline === null ? null : rounded(current - baseline);
}
