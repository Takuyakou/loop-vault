import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type { VoiceRole } from "../../src/domain/midi/types";
import { scanMidiForGroundTruth } from "./roleGroundTruthScan";
import {
  expectedRoleOptions,
  type ExpectedRole,
  type GroundTruthTemplate,
} from "./roleGroundTruthTemplate";

const defaultPackDirectory = ".local-evaluation/p521-supplied-role-fixtures";
const defaultOutputDirectory = ".local-evaluation/p521-role-ground-truth/supplied-fixture-baseline";
const expectedRoles = new Set<string>(expectedRoleOptions);

export interface SuppliedFixtureRole {
  voiceKey: string;
  expectedRole: ExpectedRole;
}

export interface SuppliedFixtureDefinition {
  fixtureId: string;
  file: string;
  groundTruth: readonly SuppliedFixtureRole[];
}

export interface SuppliedFixturePack {
  manifest: {
    schemaVersion: "p5.21-generated-fixture-manifest-v1";
    fixtures: readonly SuppliedFixtureDefinition[];
  };
  groundTruth: {
    schemaVersion: "p5.21-role-ground-truth-v1";
    fixtures: readonly SuppliedFixtureDefinition[];
  };
}

export interface ApprovedFixtureRegistry {
  schemaVersion: 1;
  kind: "p521-approved-synthetic-role-fixture-registry";
  provenance: {
    fixturePack: "p5.21-supplied-synthetic";
    expectedRoles: "fixture-defined-ground-truth";
    currentPredictionIsNotTruth: true;
    sourcePathsIncluded: false;
    rawMidiIncluded: false;
  };
  fixtures: readonly GroundTruthTemplate[];
}

export interface RoleBaselineMetrics {
  totalVoices: number;
  evaluatedVoices: number;
  ambiguousVoices: number;
  exactRoleAccuracy: number | null;
  manualCorrectionCount: number;
  manualCorrectionBurden: number | null;
  mixedPredictionRate: number | null;
  melodyRecall: number | null;
  harmonyPrecision: number | null;
  bassPrecision: number | null;
  percussionPrecision: number | null;
  confusionMatrix: Readonly<Record<ExpectedRole, Readonly<Record<VoiceRole, number>>>>;
}

export interface ImportedFixtureBaseline {
  registry: ApprovedFixtureRegistry;
  metrics: RoleBaselineMetrics;
  checksum: { expectedMidiCount: number; matchedMidiCount: number };
}

interface CliOptions {
  packDirectory?: string;
  outputDirectory?: string;
}

export async function importSuppliedRoleFixturePack(packDirectory: string): Promise<ImportedFixtureBaseline> {
  const packRoot = resolve(packDirectory);
  const pack = await loadSuppliedFixturePack(packRoot);
  const checksum = await verifyPackChecksums(packRoot, pack.manifest.fixtures);
  const fixtures: GroundTruthTemplate[] = [];

  for (const fixture of pack.manifest.fixtures) {
    const midiPath = resolvePackFile(packRoot, fixture.file);
    const template = scanMidiForGroundTruth(new Uint8Array(await readFile(midiPath)), anonymousFixtureId(fixture.fixtureId));
    fixtures.push(applyFixtureDefinedExpectedRoles(template, fixture.groundTruth));
  }

  const registry: ApprovedFixtureRegistry = {
    schemaVersion: 1,
    kind: "p521-approved-synthetic-role-fixture-registry",
    provenance: {
      fixturePack: "p5.21-supplied-synthetic",
      expectedRoles: "fixture-defined-ground-truth",
      currentPredictionIsNotTruth: true,
      sourcePathsIncluded: false,
      rawMidiIncluded: false,
    },
    fixtures,
  };
  return { registry, metrics: calculateRoleBaseline(registry), checksum };
}

export function applyFixtureDefinedExpectedRoles(
  template: GroundTruthTemplate,
  expected: readonly SuppliedFixtureRole[],
): GroundTruthTemplate {
  const expectedByPosition = new Map(expected.map((entry) => {
    const position = parseSuppliedVoiceKey(entry.voiceKey);
    if (!expectedRoles.has(entry.expectedRole)) throw new Error("fixture expectedRole is invalid");
    if (expectedByDuplicate(position, expected.map((item) => item.voiceKey))) {
      throw new Error("fixture ground truth repeats a Voice position");
    }
    return [position, entry.expectedRole] as const;
  }));
  if (expectedByPosition.size !== template.voices.length) {
    throw new Error("fixture ground truth Voice count does not match scanned MIDI");
  }

  const voices = template.voices.map((voice) => {
    const expectedRole = expectedByPosition.get(`${voice.trackIndex}:${voice.channelIndex}`);
    if (!expectedRole) throw new Error("fixture ground truth does not cover every scanned Voice");
    return {
      ...voice,
      expectedRole,
      humanReviewNote: "fixture-defined synthetic ground truth",
    };
  });
  return { ...template, voices };
}

/** Parses only the pack's anonymous track/channel key shape, never a title or path. */
export function anonymousFixtureId(suppliedFixtureId: string): string {
  return `fixture-${createHash("sha256").update(suppliedFixtureId).digest("hex").slice(0, 12)}`;
}
export function parseSuppliedVoiceKey(value: string): string {
  const match = /^[a-z-]+:(\d+)\/[a-z-]+:(\d+)$/.exec(value);
  if (!match) throw new Error("fixture Voice key is not an anonymous track/channel position");
  const track = Number(match[1]);
  const channel = Number(match[2]);
  if (!Number.isInteger(track) || !Number.isInteger(channel) || track < 0 || channel < 0 || channel > 15) {
    throw new Error("fixture Voice key is outside MIDI track/channel bounds");
  }
  return `${track}:${channel}`;
}

export function calculateRoleBaseline(registry: ApprovedFixtureRegistry): RoleBaselineMetrics {
  const voices = registry.fixtures.flatMap((fixture) => fixture.voices);
  const evaluated = voices.filter((voice) => voice.expectedRole !== "ambiguous");
  const matrix = emptyConfusionMatrix();
  for (const voice of evaluated) {
    const expected = requiredExpectedRole(voice.expectedRole);
    matrix[expected][voice.currentAutomaticRole] += 1;
  }
  const correctionCount = evaluated.filter((voice) => voice.currentAutomaticRole !== voice.expectedRole).length;
  return {
    totalVoices: voices.length,
    evaluatedVoices: evaluated.length,
    ambiguousVoices: voices.length - evaluated.length,
    exactRoleAccuracy: ratio(evaluated.filter((voice) => voice.currentAutomaticRole === voice.expectedRole).length, evaluated.length),
    manualCorrectionCount: correctionCount,
    manualCorrectionBurden: ratio(correctionCount, evaluated.length),
    mixedPredictionRate: ratio(evaluated.filter((voice) => voice.currentAutomaticRole === "mixed").length, evaluated.length),
    melodyRecall: recall(matrix, "melody"),
    harmonyPrecision: precision(matrix, "harmony"),
    bassPrecision: precision(matrix, "bass"),
    percussionPrecision: precision(matrix, "percussion"),
    confusionMatrix: matrix,
  };
}

export async function loadSuppliedFixturePack(packRoot: string): Promise<SuppliedFixturePack> {
  const manifest = await readJson(resolve(packRoot, "fixture-manifest.json"));
  const groundTruth = await readJson(resolve(packRoot, "ground-truth.json"));
  if (!isFixtureManifest(manifest) || !isGroundTruth(groundTruth)) {
    throw new Error("supplied fixture pack schema is invalid");
  }
  const groundById = new Map(groundTruth.fixtures.map((fixture) => [fixture.fixtureId, fixture]));
  if (groundById.size !== groundTruth.fixtures.length || manifest.fixtures.length !== groundTruth.fixtures.length) {
    throw new Error("supplied fixture IDs are not one-to-one");
  }
  for (const fixture of manifest.fixtures) {
    const ground = groundById.get(fixture.fixtureId);
    if (!ground || !sameExpectedRoles(fixture.groundTruth, ground.groundTruth)) {
      throw new Error("fixture manifest and ground truth disagree");
    }
    resolvePackFile(packRoot, fixture.file);
  }
  return { manifest, groundTruth };
}

export async function verifyPackChecksums(
  packRoot: string,
  fixtures: readonly SuppliedFixtureDefinition[],
): Promise<{ expectedMidiCount: number; matchedMidiCount: number }> {
  const text = await readFile(resolve(packRoot, "sha256.txt"), "utf8");
  const expected = new Set([...text.matchAll(/\b([a-f0-9]{64})\b/gi)].map((match) => match[1].toLowerCase()));
  if (expected.size !== fixtures.length) throw new Error("checksum file does not contain one hash per fixture MIDI");
  const actual = new Set(await Promise.all(fixtures.map(async (fixture) => hashFile(resolvePackFile(packRoot, fixture.file)))));
  if (actual.size !== fixtures.length || [...actual].some((hash) => !expected.has(hash))) {
    throw new Error("fixture MIDI checksum mismatch");
  }
  return { expectedMidiCount: expected.size, matchedMidiCount: actual.size };
}

export async function importAndWriteSuppliedRoleFixtureBaseline(
  packDirectory: string,
  outputDirectory: string,
): Promise<ImportedFixtureBaseline> {
  const target = resolveIgnoredOutputDirectory(outputDirectory);
  const result = await importSuppliedRoleFixturePack(packDirectory);
  await mkdir(target, { recursive: true });
  await writeFile(resolve(target, "approved-role-registry.json"), stableJson(result.registry), "utf8");
  await writeFile(resolve(target, "role-baseline.json"), stableJson({
    schemaVersion: 1,
    kind: "p521-current-role-v1-synthetic-baseline",
    expectedRoles: "fixture-defined-ground-truth",
    currentPredictionIsNotTruth: true,
    checksum: result.checksum,
    metrics: result.metrics,
  }), "utf8");
  await writeFile(resolve(target, "role-baseline-review.html"), renderApprovedFixtureReviewHtml(result.registry, result.metrics), "utf8");
  return result;
}

export function renderApprovedFixtureReviewHtml(
  registry: ApprovedFixtureRegistry,
  metrics: RoleBaselineMetrics,
): string {
  const payload = JSON.stringify({ registry, metrics }).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P5.21 Synthetic Role Baseline</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#09121e;color:#e7eff8}main{max-width:1100px;margin:auto;padding:24px}.notice{padding:12px;border:1px solid #377aa8;background:#10283a;border-radius:8px}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{padding:8px;border:1px solid #294158;text-align:left}.muted{color:#a8bbca}</style></head><body><main><h1>P5.21 Synthetic Role Baseline</h1><p class="notice">Expected roles come from the supplied synthetic fixture pack. Current product predictions are measured separately and are not adopted as truth. No MIDI paths, titles, or raw notes are included.</p><div id="summary"></div><div id="fixtures"></div><script>const data=${payload};const percent=v=>v===null?"n/a":(v*100).toFixed(1)+"%";document.getElementById("summary").innerHTML="<p>Voices: "+data.metrics.totalVoices+"; evaluated: "+data.metrics.evaluatedVoices+"; ambiguous: "+data.metrics.ambiguousVoices+"; exact: "+percent(data.metrics.exactRoleAccuracy)+"; correction burden: "+percent(data.metrics.manualCorrectionBurden)+"</p>";document.getElementById("fixtures").innerHTML=data.registry.fixtures.map(f=>"<section><h2>Anonymous fixture "+f.fixture.id+"</h2><table><thead><tr><th>Voice</th><th>Expected role</th><th>Current prediction</th><th>Safe evidence</th></tr></thead><tbody>"+f.voices.map(v=>"<tr><td>Voice "+v.voiceIndex+" / Channel "+v.midiChannel+"</td><td>"+v.expectedRole+"</td><td>"+v.currentAutomaticRole+"</td><td>"+v.evidence.map(e=>e.kind+": "+e.role).join(", ")+"</td></tr>").join("")+"</tbody></table></section>").join("");</script></main></body></html>`;
}

export function parseCliOptions(args: readonly string[]): CliOptions {
  if (args.length === 0) return {};
  if (args.length === 2 && args[0] === "--out" && !args[1].startsWith("--")) return { outputDirectory: args[1] };
  if (args.length === 2 && args[0] === "--pack" && !args[1].startsWith("--")) return { packDirectory: args[1] };
  if (args.length === 4 && args[0] === "--pack" && args[2] === "--out" && !args[1].startsWith("--") && !args[3].startsWith("--")) {
    return { packDirectory: args[1], outputDirectory: args[3] };
  }
  throw new Error("Usage: --run-cli [--pack <ignored-local-directory>] [--out <ignored-local-directory>]");
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2).filter((argument) => argument !== "--run-cli"));
  const packDirectory = options.packDirectory ?? await findSinglePackDirectory(defaultPackDirectory);
  const outputDirectory = options.outputDirectory ?? defaultOutputDirectory;
  const result = await importAndWriteSuppliedRoleFixtureBaseline(packDirectory, outputDirectory);
  process.stdout.write(`P5.21 supplied synthetic baseline: fixtures=${result.registry.fixtures.length}; voices=${result.metrics.totalVoices}; evaluated=${result.metrics.evaluatedVoices}; output=${relative(process.cwd(), resolve(outputDirectory)) || "."}.\n`);
}

async function findSinglePackDirectory(root: string): Promise<string> {
  const directories = (await readdir(resolve(root), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => resolve(root, entry.name));
  if (directories.length !== 1) throw new Error("expected exactly one supplied fixture pack directory");
  return directories[0];
}

function isFixtureManifest(value: unknown): value is SuppliedFixturePack["manifest"] {
  return isPackObject(value, "p5.21-generated-fixture-manifest-v1");
}

function isGroundTruth(value: unknown): value is SuppliedFixturePack["groundTruth"] {
  return isPackObject(value, "p5.21-role-ground-truth-v1");
}

function isPackObject(value: unknown, schemaVersion: string): value is { schemaVersion: string; fixtures: SuppliedFixtureDefinition[] } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { schemaVersion?: unknown; fixtures?: unknown };
  return candidate.schemaVersion === schemaVersion
    && Array.isArray(candidate.fixtures)
    && candidate.fixtures.length > 0
    && candidate.fixtures.every(isFixtureDefinition);
}

function isFixtureDefinition(value: unknown): value is SuppliedFixtureDefinition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { fixtureId?: unknown; file?: unknown; groundTruth?: unknown };
  return typeof candidate.fixtureId === "string"
    && /^[a-z0-9][a-z0-9_-]{5,64}$/.test(candidate.fixtureId)
    && typeof candidate.file === "string"
    && Array.isArray(candidate.groundTruth)
    && candidate.groundTruth.length > 0
    && candidate.groundTruth.every((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const role = entry as { voiceKey?: unknown; expectedRole?: unknown };
      return typeof role.voiceKey === "string" && typeof role.expectedRole === "string" && expectedRoles.has(role.expectedRole);
    });
}

function sameExpectedRoles(left: readonly SuppliedFixtureRole[], right: readonly SuppliedFixtureRole[]): boolean {
  const encode = (entries: readonly SuppliedFixtureRole[]) => [...entries]
    .map((entry) => `${entry.voiceKey}\u0000${entry.expectedRole}`)
    .sort((a, b) => a.localeCompare(b));
  return JSON.stringify(encode(left)) === JSON.stringify(encode(right));
}

function expectedByDuplicate(position: string, originalKeys: readonly string[]): boolean {
  return originalKeys.filter((key) => parseSuppliedVoiceKey(key) === position).length > 1;
}

function resolvePackFile(packRoot: string, file: string): string {
  if (!/\.(mid|midi)$/i.test(file)) throw new Error("fixture pack file must be MIDI");
  const target = resolve(packRoot, file);
  const normalizedRoot = resolve(packRoot).toLocaleLowerCase();
  if (!target.toLocaleLowerCase().startsWith(`${normalizedRoot}${sep}`)) throw new Error("fixture MIDI escapes the supplied pack directory");
  return target;
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function resolveIgnoredOutputDirectory(value: string): string {
  const root = resolve(".local-evaluation").toLocaleLowerCase();
  const target = resolve(value);
  if (target.toLocaleLowerCase() === root || target.toLocaleLowerCase().startsWith(`${root}${sep}`)) return target;
  throw new Error("output directory must remain inside .local-evaluation");
}

function requiredExpectedRole(value: ExpectedRole | null): Exclude<ExpectedRole, "ambiguous"> {
  if (!value || value === "ambiguous") throw new Error("ambiguous role cannot enter the evaluated confusion matrix");
  return value;
}

function emptyConfusionMatrix(): Record<ExpectedRole, Record<VoiceRole, number>> {
  const predicted: Record<VoiceRole, number> = { bass: 0, harmony: 0, pad: 0, melody: 0, percussion: 0, mixed: 0 };
  return Object.fromEntries(expectedRoleOptions.map((role) => [role, { ...predicted }])) as Record<ExpectedRole, Record<VoiceRole, number>>;
}

function recall(matrix: RoleBaselineMetrics["confusionMatrix"], role: VoiceRole): number | null {
  const row = matrix[role];
  return ratio(row[role], sum(Object.values(row)));
}

function precision(matrix: RoleBaselineMetrics["confusionMatrix"], role: VoiceRole): number | null {
  return ratio(matrix[role][role], sum(expectedRoleOptions.filter((expected) => expected !== "ambiguous").map((expected) => matrix[expected][role])));
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : round(numerator / denominator);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

if (process.argv[1]?.endsWith("importSuppliedRoleFixturePack.ts") && process.argv.includes("--run-cli")) {
  await main();
}
