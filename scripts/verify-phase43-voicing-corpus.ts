import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";

type Split = "dev" | "validation" | "holdout";
type Representation = "simultaneous" | "aggregated" | "hybrid" | "none";

interface GoldTargets {
  sourceFaithfulMidi: number[];
  aggregateHarmonyMidi: number[];
  dojoIntegratedMidi: number[];
}

interface GoldEvent {
  eventId: string;
  representationType: Representation;
  goldTargets: GoldTargets;
}

interface CorpusFile {
  fileId: string;
  scenarioId: string;
  variant: "clean" | "stress";
  split: Split;
  path: string;
  sha256: string;
  byteLength: number;
  events: GoldEvent[];
}

interface CorpusManifest {
  corpusVersion: string;
  generatorVersion: string;
  fileCount: number;
  scenarioCount: number;
  eventCount: number;
  splitCounts: Record<Split, number>;
  files: CorpusFile[];
}

interface CorpusSummary {
  noteInstanceCount: number;
}

const corpusDir = resolve(cwd(), option("--corpus")
  ?? "test/loop-vault-voicing-gold-corpus-v1");
const output = resolve(cwd(), option("--output")
  ?? "docs/phase4.3/03-voicing-corpus-integrity.json");
const manifest = JSON.parse(
  await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
) as CorpusManifest;
const summary = JSON.parse(
  await readFile(resolve(corpusDir, "corpus-summary.json"), "utf8"),
) as CorpusSummary;
const failures: string[] = [];
const fileIds = new Set<string>();
const paths = new Set<string>();
const scenarioSplits = new Map<string, Set<Split>>();
const scenarioVariants = new Map<string, Set<string>>();
const representationCounts: Record<Representation, number> = {
  simultaneous: 0,
  aggregated: 0,
  hybrid: 0,
  none: 0,
};
const splitCounts: Record<Split, number> = { dev: 0, validation: 0, holdout: 0 };
let eventCount = 0;
let byteLengthVerified = 0;
let sha256Verified = 0;
let goldPolicyComplete = 0;

for (const file of manifest.files) {
  if (fileIds.has(file.fileId)) failures.push(`duplicate fileId: ${file.fileId}`);
  if (paths.has(file.path)) failures.push(`duplicate path: ${file.path}`);
  fileIds.add(file.fileId);
  paths.add(file.path);
  splitCounts[file.split] += 1;
  addToSet(scenarioSplits, file.scenarioId, file.split);
  addToSet(scenarioVariants, file.scenarioId, file.variant);

  const bytes = await readFile(resolve(corpusDir, file.path));
  if (bytes.byteLength === file.byteLength) byteLengthVerified += 1;
  else failures.push(`byteLength mismatch: ${file.fileId}`);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest === file.sha256) sha256Verified += 1;
  else failures.push(`sha256 mismatch: ${file.fileId}`);

  for (const event of file.events) {
    eventCount += 1;
    representationCounts[event.representationType] += 1;
    const targets = event.goldTargets;
    if (targets
      && Array.isArray(targets.sourceFaithfulMidi)
      && Array.isArray(targets.aggregateHarmonyMidi)
      && Array.isArray(targets.dojoIntegratedMidi)) {
      goldPolicyComplete += 1;
    } else {
      failures.push(`missing Gold policy: ${file.fileId}/${event.eventId}`);
    }
  }
}

for (const [scenario, splits] of scenarioSplits) {
  if (splits.size !== 1) failures.push(`scenario crosses splits: ${scenario}`);
  const variants = scenarioVariants.get(scenario);
  if (!variants?.has("clean") || !variants.has("stress") || variants.size !== 2) {
    failures.push(`scenario pair invalid: ${scenario}`);
  }
}

const jsonl = await readFile(resolve(corpusDir, "note-events.jsonl"), "utf8");
const noteEventRows = jsonl.split(/\r?\n/).filter(Boolean).length;
if (noteEventRows !== summary.noteInstanceCount) {
  failures.push(`note-events rows ${noteEventRows} != summary note instances ${summary.noteInstanceCount}`);
}
if (manifest.fileCount !== manifest.files.length) failures.push("manifest fileCount mismatch");
if (manifest.scenarioCount !== scenarioSplits.size) failures.push("manifest scenarioCount mismatch");
if (manifest.eventCount !== eventCount) failures.push("manifest eventCount mismatch");
for (const split of ["dev", "validation", "holdout"] as const) {
  if (manifest.splitCounts[split] !== splitCounts[split]) {
    failures.push(`manifest split count mismatch: ${split}`);
  }
}

const report = {
  schemaVersion: 1,
  corpusVersion: manifest.corpusVersion,
  generatorVersion: manifest.generatorVersion,
  corpusPathPersisted: false,
  checks: {
    passed: failures.length === 0,
    failures,
    fileCount: manifest.files.length,
    scenarioCount: scenarioSplits.size,
    eventCount,
    noteInstanceCount: summary.noteInstanceCount,
    noteEventRows,
    uniqueFileIds: fileIds.size,
    uniquePaths: paths.size,
    sha256Verified,
    byteLengthVerified,
    scenarioPairsVerified: [...scenarioVariants.values()]
      .filter((variants) => variants.has("clean") && variants.has("stress") && variants.size === 2).length,
    splitIsolationVerified: [...scenarioSplits.values()].every((splits) => splits.size === 1),
    goldPolicyComplete,
  },
  splitCounts,
  representationCounts,
  holdoutStatus: "not-evaluated",
};

await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;

function option(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function addToSet<T>(
  map: Map<string, Set<T>>,
  key: string,
  value: T,
) {
  const values = map.get(key) ?? new Set<T>();
  values.add(value);
  map.set(key, values);
}
