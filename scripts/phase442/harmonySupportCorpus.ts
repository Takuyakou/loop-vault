import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  aggregatePhase44Rows,
  evaluatePhase44Split,
  type Phase44Aggregate,
  type Phase44CorpusFile,
  type Phase44EventEvaluation,
  type Phase44GoldEvent,
  type Phase44Manifest,
  type Phase44Split,
} from "../phase44/targetedCorpus";

export type HarmonySupportMode =
  | "block"
  | "arp"
  | "rootless"
  | "allch0"
  | "allch0clear"
  | "duration"
  | "status";

export interface HarmonySupportScenarioParameters {
  mode: HarmonySupportMode;
  supportCount: number;
  supportBeats: number;
}

export interface HarmonySupportEvent extends Phase44GoldEvent {
  scenarioParameters: HarmonySupportScenarioParameters & {
    targetMelodyOnsetBeat?: number;
  };
  concurrentHarmonySupportMidiAtTarget: number[];
  actualConcurrentHarmonySupportCount: number;
}

export interface HarmonySupportFile extends Phase44CorpusFile {
  scenarioParameters: HarmonySupportScenarioParameters;
  events: HarmonySupportEvent[];
}

export interface HarmonySupportManifest extends Phase44Manifest {
  description: string;
  seed: number;
  ppq: number;
  variantCounts: Record<"clean" | "stress", number>;
  files: HarmonySupportFile[];
}

export interface ProductBaselineMetric extends Phase44Aggregate {
  reviewRate: number | null;
  finalPitchSetChangedRate: 0;
  statusOnlyChangeRate: 0;
  confidenceDelta: 0;
  winnerDurationDelta: 0;
}

export async function loadHarmonySupportManifest(
  corpusDir: string,
): Promise<HarmonySupportManifest> {
  return JSON.parse(
    await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
  ) as HarmonySupportManifest;
}

export async function verifyHarmonySupportCorpus(
  corpusDir: string,
  manifest: HarmonySupportManifest,
) {
  const fileIds = new Set<string>();
  const paths = new Set<string>();
  const scenarioSplits = new Map<string, Set<string>>();
  const scenarioVariants = new Map<string, Set<string>>();
  let shaMatches = 0;
  let byteLengthMatches = 0;
  let eventCount = 0;
  let noteCount = 0;
  let goldTrackRoleCount = 0;
  let goldPerNoteRoleCount = 0;
  let goldVoicingCount = 0;
  let excludedDistractorCount = 0;
  let supportCountMetadata = 0;
  let supportDurationMetadata = 0;

  for (const file of manifest.files) {
    if (fileIds.has(file.fileId)) throw new Error(`Duplicate fileId: ${file.fileId}`);
    if (paths.has(file.path)) throw new Error(`Duplicate path: ${file.path}`);
    fileIds.add(file.fileId);
    paths.add(file.path);
    addToSet(scenarioSplits, file.scenarioId, file.split);
    addToSet(scenarioVariants, file.scenarioId, file.variant);
    const midiPath = resolve(corpusDir, file.path);
    const bytes = await readFile(midiPath);
    if (createHash("sha256").update(bytes).digest("hex") === file.sha256) {
      shaMatches += 1;
    }
    if ((await stat(midiPath)).size === file.byteLength) byteLengthMatches += 1;
    eventCount += file.events.length;
    noteCount += file.notes.length;
    goldTrackRoleCount += file.tracks.every((track) => track.goldRole.length > 0) ? 1 : 0;
    goldPerNoteRoleCount += file.notes.every((note) => note.role.length > 0) ? 1 : 0;
    goldVoicingCount += file.events.filter(
      (event) => Array.isArray(event.goldVoicingMidi) && event.goldVoicingMidi.length > 0,
    ).length;
    excludedDistractorCount += file.events.filter(
      (event) => Array.isArray(event.excludedDistractorMidi),
    ).length;
    supportCountMetadata += file.events.filter(
      (event) =>
        Number.isInteger(event.actualConcurrentHarmonySupportCount)
        && event.actualConcurrentHarmonySupportCount
          === event.concurrentHarmonySupportMidiAtTarget.length,
    ).length;
    supportDurationMetadata += file.events.filter(
      (event) =>
        Number.isFinite(event.scenarioParameters.supportBeats)
        && event.scenarioParameters.supportBeats > 0,
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
    && manifest.eventCount === eventCount
    && shaMatches === manifest.fileCount
    && byteLengthMatches === manifest.fileCount
    && badPairs.length === 0
    && splitOverlap.length === 0
    && goldTrackRoleCount === manifest.fileCount
    && goldPerNoteRoleCount === manifest.fileCount
    && goldVoicingCount === manifest.eventCount
    && excludedDistractorCount === manifest.eventCount
    && supportCountMetadata === manifest.eventCount
    && supportDurationMetadata === manifest.eventCount;
  return {
    valid,
    corpusVersion: manifest.corpusVersion,
    fileCount: manifest.fileCount,
    eventCount,
    noteCount,
    scenarioCount: new Set(manifest.files.map((file) => file.scenarioId)).size,
    splitCounts: countBy(manifest.files, (file) => file.split),
    variantCounts: countBy(manifest.files, (file) => file.variant),
    shaMatches,
    byteLengthMatches,
    cleanStressPairCount: scenarioVariants.size - badPairs.length,
    badPairs,
    splitOverlap,
    goldTrackRoleCount,
    goldPerNoteRoleCount,
    goldVoicingCount,
    excludedDistractorCount,
    supportCountMetadata,
    supportDurationMetadata,
  };
}

export async function evaluateProductBaseline(
  corpusDir: string,
  manifest: HarmonySupportManifest,
  split: Phase44Split,
): Promise<Phase44EventEvaluation[]> {
  return evaluatePhase44Split(
    corpusDir,
    manifest,
    split,
    ["B"],
  );
}

export function productBaselineMetric(
  rows: readonly Phase44EventEvaluation[],
): ProductBaselineMetric {
  const aggregate = aggregatePhase44Rows(rows);
  return {
    ...aggregate,
    reviewRate: ratio(rows.filter((row) => row.status === "review").length, rows.length),
    finalPitchSetChangedRate: 0,
    statusOnlyChangeRate: 0,
    confidenceDelta: 0,
    winnerDurationDelta: 0,
  };
}

export function groupedProductBaseline(
  rows: readonly Phase44EventEvaluation[],
  manifest: HarmonySupportManifest,
) {
  const metadata = eventMetadata(manifest);
  return {
    overall: productBaselineMetric(rows),
    byVariant: grouped(rows, (row) => row.variant, productBaselineMetric),
    bySupportCount: grouped(
      rows,
      (row) => String(metadata.get(eventKey(row))?.supportCount ?? "unknown"),
      productBaselineMetric,
    ),
    bySupportDuration: grouped(
      rows,
      (row) => String(metadata.get(eventKey(row))?.supportBeats ?? "unknown"),
      productBaselineMetric,
    ),
    byTexture: grouped(
      rows,
      (row) => metadata.get(eventKey(row))?.mode ?? "unknown",
      productBaselineMetric,
    ),
    bySubset: grouped(
      rows,
      (row) => preliminarySubset(metadata.get(eventKey(row))),
      productBaselineMetric,
    ),
  };
}

export function eventMetadata(manifest: HarmonySupportManifest) {
  return new Map(manifest.files.flatMap((file) =>
    file.events.map((event) => [
      `${file.fileId}/${event.eventId}`,
      {
        scenarioId: file.scenarioId,
        scenarioSlug: file.scenarioSlug,
        split: file.split,
        variant: file.variant,
        ...event.scenarioParameters,
      },
    ])));
}

export function eventKey(
  row: Pick<Phase44EventEvaluation, "fileId" | "eventId">,
): string {
  return `${row.fileId}/${row.eventId}`;
}

function preliminarySubset(
  metadata: (HarmonySupportScenarioParameters & { scenarioId: string }) | undefined,
): "primary-candidate" | "diagnostic-only" {
  if (!metadata) return "diagnostic-only";
  return metadata.mode === "allch0"
    || metadata.mode === "allch0clear"
    || metadata.mode === "status"
    ? "diagnostic-only"
    : "primary-candidate";
}

function grouped<T, R>(
  rows: readonly T[],
  keyFor: (row: T) => string,
  aggregate: (rows: readonly T[]) => R,
): Record<string, R> {
  const keys = [...new Set(rows.map(keyFor))].sort((a, b) => a.localeCompare(b));
  return Object.fromEntries(keys.map((key) => [
    key,
    aggregate(rows.filter((row) => keyFor(row) === key)),
  ]));
}

function addToSet<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const values = map.get(key) ?? new Set<V>();
  values.add(value);
  map.set(key, values);
}

function countBy<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) {
    const key = keyFor(value);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function ratio(value: number, total: number): number | null {
  return total === 0 ? null : Number((value / total).toFixed(6));
}
