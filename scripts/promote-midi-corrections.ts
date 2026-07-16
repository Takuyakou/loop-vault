import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { parseVaultFileJson } from "../src/domain/schema";
import type { SongIdea } from "../src/domain/types";
import { fingerprintMidiBytes, legacyFingerprintMidiBytes } from "../src/domain/midi/fingerprint";
import { promoteCorrectionEvents } from "../src/domain/midi/realEvaluation/correctionPromotion";
import { realMidiEvaluationCaseSchema } from "../src/domain/midi/realEvaluation/schema";
import type { LocalMidiSourceIndexEntry } from "../src/domain/midi/realEvaluation/types";
import { readPromotionFeedback } from "./promotionFeedback";

const args = process.argv.slice(2);
const appData = process.env.APPDATA ?? resolve(homedir(), "AppData/Roaming");
const loopVaultDir = resolve(appData, "com.takuyakou.loopvault/loopvault");
const evaluationDir = resolve(loopVaultDir, "evaluation");
const vaultPath = resolve(optionValue("--vault") ?? resolve(loopVaultDir, "data.json"));
const feedbackPath = resolve(optionValue("--feedback") ?? resolve(loopVaultDir, "analysis-feedback.jsonl"));
const outputDir = resolve(optionValue("--output") ?? "artifacts/correction-promotion");

const vaultRaw = await readFile(vaultPath, "utf8");
const parsedVault = parseVaultFileJson(vaultRaw);
if (!parsedVault.ok) throw new Error(`Vault could not be read: ${parsedVault.error.kind}`);

const { events, skippedPropagation, rejected } = await readFeedback(feedbackPath);
const sourceIndex = await buildSourceIndex(parsedVault.vault.ideas);
const result = promoteCorrectionEvents(events, sourceIndex);
const promoted = result.promoted.map((item) => realMidiEvaluationCaseSchema.parse(item));

await Promise.all([mkdir(evaluationDir, { recursive: true }), mkdir(outputDir, { recursive: true })]);
await Promise.all([
  writeFile(resolve(evaluationDir, "source-index.json"), `${JSON.stringify(sourceIndex, null, 2)}\n`, "utf8"),
  writeFile(resolve(evaluationDir, "promoted-corrections.jsonl"), jsonLines(promoted), "utf8"),
  writeFile(resolve(outputDir, "gold-cases.jsonl"), jsonLines(promoted), "utf8"),
  writeFile(resolve(outputDir, "orphan-corrections.jsonl"), jsonLines(result.orphans), "utf8"),
  writeFile(resolve(outputDir, "conflict-corrections.jsonl"), jsonLines(result.conflicts), "utf8"),
  writeFile(resolve(outputDir, "rejected-lines.json"), `${JSON.stringify(rejected, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDir, "summary.md"), summaryMarkdown(), "utf8"),
]);

console.log(`Feedback events: ${events.length}`);
console.log(`Propagation feedback skipped: ${skippedPropagation}`);
console.log(`Promoted Gold cases: ${promoted.length}`);
console.log(`Orphans: ${result.orphans.length}`);
console.log(`Conflicts: ${result.conflicts.length}`);
console.log(`Duplicates removed: ${result.duplicateCount}`);
console.log(`Live MIDI skipped: ${result.liveMidiSkipped}`);

function optionValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readFeedback(path: string): Promise<{
  events: ReturnType<typeof readPromotionFeedback>["events"];
  skippedPropagation: number;
  rejected: ReturnType<typeof readPromotionFeedback>["rejected"];
}> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return { events: [], skippedPropagation: 0, rejected: [] };
  }
  return readPromotionFeedback(raw);
}

async function buildSourceIndex(
  ideas: readonly SongIdea[],
): Promise<LocalMidiSourceIndexEntry[]> {
  const entries: LocalMidiSourceIndexEntry[] = [];
  for (const idea of ideas) {
    for (const asset of idea.assets.filter((item) => item.type === "midi" && item.path)) {
      try {
        const bytes = new Uint8Array(await readFile(asset.path!));
        const details = await stat(asset.path!);
        const shared = {
          assetId: asset.id,
          lastKnownPath: asset.path,
          fileName: basename(asset.path!),
          size: details.size,
          modifiedAt: details.mtime.toISOString(),
        };
        entries.push(
          { fingerprint: fingerprintMidiBytes(bytes), ...shared },
          { fingerprint: legacyFingerprintMidiBytes(bytes), ...shared },
        );
      } catch {
        // Unreadable assets cannot be indexed; the source stays unresolved.
      }
    }
  }
  return [...new Map(entries
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint) || (left.assetId ?? "").localeCompare(right.assetId ?? ""))
    .map((entry) => [entry.fingerprint, entry])).values()];
}

function jsonLines(values: readonly unknown[]): string {
  return values.length ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "";
}

function summaryMarkdown(): string {
  return `# Correction Promotion\n\n`
    + `- Valid feedback events: ${events.length}\n`
    + `- Rejected lines: ${rejected.length}\n`
    + `- Propagation feedback skipped: ${skippedPropagation}\n`
    + `- Source index fingerprints: ${sourceIndex.length}\n`
    + `- Promoted Gold cases: ${promoted.length}\n`
    + `- Orphan corrections: ${result.orphans.length}\n`
    + `- Conflicting ranges: ${result.conflicts.length}\n`
    + `- Exact duplicates removed: ${result.duplicateCount}\n`
    + `- Live MIDI events skipped: ${result.liveMidiSkipped}\n`
    + `- Invalid corrected chords: ${result.invalidChordCount}\n`;
}
