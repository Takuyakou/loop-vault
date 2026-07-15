import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { buildActiveReviewQueue } from "../src/domain/midi/realEvaluation/reviewQueue";
import { midiDifferenceReviewSchema } from "../src/domain/midi/realEvaluation/schema";
import type { MidiDifferenceReview, MidiDifferenceReviewCase } from "../src/domain/midi/realEvaluation/types";

const args = process.argv.slice(2);
const casesPath = resolve(optionValue("--cases") ?? "artifacts/midi-difference-review/cases.json");
const outputDir = resolve(optionValue("--output") ?? "artifacts/midi-review-queue");
const appData = process.env.APPDATA ?? resolve(homedir(), "AppData/Roaming");
const reviewsPath = resolve(optionValue("--reviews")
  ?? resolve(appData, "com.takuyakou.loopvault/loopvault/evaluation/difference-reviews.jsonl"));
const cases = JSON.parse(await readFile(casesPath, "utf8")) as MidiDifferenceReviewCase[];
const reviews = await readReviews(reviewsPath);
const queue = buildActiveReviewQueue(cases, reviews);

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "review-queue.json"), `${JSON.stringify(queue, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDir, "review-queue.md"), queueMarkdown(queue), "utf8"),
]);
console.log(`Available cases: ${cases.length}`);
console.log(`Already reviewed: ${reviews.length}`);
console.log(`Review queue: ${queue.length}`);

function optionValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readReviews(path: string): Promise<MidiDifferenceReview[]> {
  try {
    return (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean)
      .map((line) => midiDifferenceReviewSchema.parse(JSON.parse(line)));
  } catch {
    return [];
  }
}

function queueMarkdown(values: readonly MidiDifferenceReviewCase[]): string {
  return `# MIDI Active Review Queue\n\n${values.map((item, index) =>
    `${index + 1}. **${item.saved.primary} / ${item.legacy.primary} / ${item.reranker.primary}**`
    + ` — beat ${item.range.startBeat}-${item.range.endBeat}, score ${item.priority.score}`
    + ` (${item.priority.reasons.join(", ") || "baseline"})`).join("\n")}\n`;
}
