import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { parseVaultFileJson } from "../src/domain/schema";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { fingerprintMidiBytes } from "../src/domain/midi/fingerprint";
import { realMidiEvaluationCaseSchema } from "../src/domain/midi/realEvaluation/schema";
import {
  buildStoredProgressionCase,
  compareStoredProgression,
  enumerateStoredProgressions,
  resolveStoredProgressionRange,
} from "../src/domain/midi/realEvaluation/storedProgressions";
import type { RealMidiEvaluationCase } from "../src/domain/midi/realEvaluation/types";
import type { StoredProgressionMismatchRecord } from "../src/domain/midi/realEvaluation/differenceReview";

type MissingReason =
  | "source-asset-id-missing"
  | "source-asset-missing"
  | "source-path-missing"
  | "source-file-missing"
  | "range-unresolved"
  | "saved-chords-empty";

interface MissingSource {
  blockId: string;
  assetId?: string;
  fileName?: string;
  reason: MissingReason;
}

const args = process.argv.slice(2);
const vaultPath = resolve(optionValue("--vault") ?? defaultVaultPath());
const outputDir = resolve(optionValue("--output") ?? "artifacts/stored-progressions");

const rawVault = await readFile(vaultPath, "utf8");
const parsed = parseVaultFileJson(rawVault);
if (!parsed.ok) {
  throw new Error(`Vault could not be read: ${parsed.error.kind}`);
}

const references = enumerateStoredProgressions(parsed.vault)
  .sort((left, right) => left.block.id.localeCompare(right.block.id));
const cases: RealMidiEvaluationCase[] = [];
const missing: MissingSource[] = [];
const mismatches: StoredProgressionMismatchRecord[] = [];
let comparedSegments = 0;
let legacyMatches = 0;
let rerankerMatches = 0;

for (const reference of references) {
  const { block, asset } = reference;
  const base = {
    blockId: block.id,
    ...(block.sourceAssetId ? { assetId: block.sourceAssetId } : {}),
    ...(block.sourceFileName ? { fileName: block.sourceFileName } : {}),
  };
  if (block.chords.length === 0) {
    missing.push({ ...base, reason: "saved-chords-empty" });
    continue;
  }
  if (!resolveStoredProgressionRange(block)) {
    missing.push({ ...base, reason: "range-unresolved" });
    continue;
  }
  if (!block.sourceAssetId) {
    missing.push({ ...base, reason: "source-asset-id-missing" });
    continue;
  }
  if (!asset) {
    missing.push({ ...base, reason: "source-asset-missing" });
    continue;
  }
  if (!asset.path) {
    missing.push({ ...base, reason: "source-path-missing" });
    continue;
  }
  if (!(await canRead(asset.path))) {
    missing.push({ ...base, reason: "source-file-missing" });
    continue;
  }

  const bytes = new Uint8Array(await readFile(asset.path));
  const fingerprint = fingerprintMidiBytes(bytes);
  const definition = buildStoredProgressionCase(reference, fingerprint);
  if (!definition) {
    missing.push({ ...base, reason: "range-unresolved" });
    continue;
  }
  definition.source.fileName ??= basename(asset.path);
  const validated = realMidiEvaluationCaseSchema.parse(definition);
  const legacy = analyzeMidi(bytes, { mode: "legacy", fileName: validated.source.fileName });
  const reranker = analyzeMidi(bytes, { mode: "legacy-boundary-rerank", fileName: validated.source.fileName });
  const comparison = compareStoredProgression(
    validated.expected.primary,
    legacy.fullTimeline,
    reranker.fullTimeline,
  );
  comparedSegments += comparison.length;
  legacyMatches += comparison.filter((item) => item.legacyMatches).length;
  rerankerMatches += comparison.filter((item) => item.rerankerMatches).length;
  cases.push(validated);
  const disagreement = comparison.filter((item) => !item.legacyMatches || !item.rerankerMatches);
  if (disagreement.length > 0) {
    mismatches.push({
      caseId: validated.id,
      sourceFingerprint: fingerprint,
      assetId: block.sourceAssetId,
      range: validated.range,
      segments: disagreement,
    });
  }
}

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "summary.md"), buildSummary(), "utf8"),
  writeFile(resolve(outputDir, "cases.jsonl"), jsonLines(cases), "utf8"),
  writeFile(resolve(outputDir, "missing-sources.json"), `${JSON.stringify(missing, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDir, "mismatches.jsonl"), jsonLines(mismatches), "utf8"),
]);

console.log(`Stored blocks: ${references.length}`);
console.log(`Resolved cases: ${cases.length}`);
console.log(`Skipped sources: ${missing.length}`);
console.log(`Mismatch cases: ${mismatches.length}`);
console.log(`Report: ${outputDir}`);

function optionValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function defaultVaultPath(): string {
  const appData = process.env.APPDATA ?? resolve(homedir(), "AppData/Roaming");
  return resolve(appData, "com.takuyakou.loopvault/loopvault/data.json");
}

async function canRead(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function jsonLines(values: readonly unknown[]): string {
  return values.length === 0 ? "" : `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

function percentage(matches: number): string {
  return comparedSegments === 0 ? "n/a" : `${((matches / comparedSegments) * 100).toFixed(2)}%`;
}

function buildSummary(): string {
  const counts = (strength: "gold" | "silver" | "bronze") =>
    cases.filter((item) => item.label.strength === strength).length;
  return `# Stored Progression Regression\n\n`
    + `- 保存済みブロック: ${references.length}\n`
    + `- 解決・再解析済み: ${cases.length}\n`
    + `- スキップ: ${missing.length}\n`
    + `- 不一致ケース: ${mismatches.length}\n`
    + `- 比較セグメント: ${comparedSegments}\n`
    + `- Legacy 保存ラベル一致率: ${percentage(legacyMatches)}\n`
    + `- Reranker 保存ラベル一致率: ${percentage(rerankerMatches)}\n`
    + `- Gold / Silver / Bronze: ${counts("gold")} / ${counts("silver")} / ${counts("bronze")}\n`
    + `- Quarantine records: ${parsed.quarantine.length}\n`;
}
