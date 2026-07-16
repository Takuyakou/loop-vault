import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parseChordLabel } from "../src/domain/chords";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { deriveAcceptableAlternatives } from "../src/domain/midi/realEvaluation/acceptableAlternatives";
import { evaluateBronzeCases, evaluateGoldCases, evaluateSilverCases, type AnalyzedRealMidiCase } from "../src/domain/midi/realEvaluation/realMetrics";
import { midiDifferenceReviewSchema, realMidiEvaluationCaseSchema } from "../src/domain/midi/realEvaluation/schema";
import type { LocalMidiSourceIndexEntry, MidiDifferenceReview, RealMidiEvaluationCase } from "../src/domain/midi/realEvaluation/types";

const args = process.argv.slice(2);
const appData = process.env.APPDATA ?? resolve(homedir(), "AppData/Roaming");
const evaluationDir = resolve(appData, "com.takuyakou.loopvault/loopvault/evaluation");
const outputDir = resolve(optionValue("--output") ?? "artifacts/real-midi-evaluation");
const sourceIndex = await readJson<LocalMidiSourceIndexEntry[]>(
  resolve(optionValue("--source-index") ?? resolve(evaluationDir, "source-index.json")), [],
);
const sources = new Map(sourceIndex.map((entry) => [entry.fingerprint, entry]));
const stored = await readCases(resolve(optionValue("--stored") ?? "artifacts/stored-progressions/cases.jsonl"));
const promoted = await readCases(resolve(optionValue("--promoted") ?? resolve(evaluationDir, "promoted-corrections.jsonl")));
const reviews = await readReviews(resolve(optionValue("--reviews") ?? resolve(evaluationDir, "difference-reviews.jsonl")));
const reviewedCases = reviews.flatMap((review) => {
  const converted = reviewToGoldCase(review, sources.get(review.sourceFingerprint));
  return converted ? [converted] : [];
});
const cases = mergeCases([...stored, ...promoted, ...reviewedCases]);

await mkdir(evaluationDir, { recursive: true });
await writeFile(resolve(evaluationDir, "real-midi-cases.jsonl"), jsonLines(cases), "utf8");

const analyzed: AnalyzedRealMidiCase[] = [];
const missing: { caseId: string; fingerprint: string; reason: string }[] = [];
const cache = new Map<string, {
  legacy: ReturnType<typeof analyzeMidi>;
  reranker: ReturnType<typeof analyzeMidi>;
  voiceAware: ReturnType<typeof analyzeMidi>;
}>();
for (const definition of cases) {
  const source = sources.get(definition.source.fingerprint);
  if (!source?.lastKnownPath) {
    missing.push({ caseId: definition.id, fingerprint: definition.source.fingerprint, reason: "source-unresolved" });
    continue;
  }
  let result = cache.get(definition.source.fingerprint);
  if (!result) {
    try {
      const bytes = new Uint8Array(await readFile(source.lastKnownPath));
      result = {
        legacy: analyzeMidi(bytes, { mode: "legacy", fileName: source.fileName }),
        reranker: analyzeMidi(bytes, { mode: "legacy-boundary-rerank", fileName: source.fileName }),
        voiceAware: analyzeMidi(bytes, { mode: "voice-aware-rerank-v1", fileName: source.fileName }),
      };
      cache.set(definition.source.fingerprint, result);
    } catch {
      missing.push({ caseId: definition.id, fingerprint: definition.source.fingerprint, reason: "source-unreadable" });
      continue;
    }
  }
  analyzed.push({
    definition,
    legacy: result.legacy.fullTimeline,
    reranker: result.reranker.fullTimeline,
    voiceAware: result.voiceAware.fullTimeline,
  });
}

const gold = analyzed.filter((item) => item.definition.label.strength === "gold");
const silver = analyzed.filter((item) => item.definition.label.strength === "silver");
const bronze = analyzed.filter((item) => item.definition.label.strength === "bronze");
const report = {
  schemaVersion: 1,
  datasets: {
    realMidiGold: {
      legacy: evaluateGoldCases(gold, "legacy"),
      reranker: evaluateGoldCases(gold, "reranker"),
      voiceAware: evaluateGoldCases(gold, "voiceAware"),
    },
    realMidiSilver: evaluateSilverCases(silver),
    realMidiBronze: evaluateBronzeCases(bronze),
    unlabeled: { caseCount: 0 },
  },
};
const guardFailures = gold.length ? goldGuardFailures(report.datasets.realMidiGold.legacy, report.datasets.realMidiGold.reranker) : [];
const voiceAwareGuardFailures = gold.length
  ? goldGuardFailures(report.datasets.realMidiGold.legacy, report.datasets.realMidiGold.voiceAware)
  : [];

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "report.json"), `${JSON.stringify({ ...report, guardFailures, voiceAwareGuardFailures }, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDir, "summary.md"), summaryMarkdown(), "utf8"),
  writeFile(resolve(outputDir, "missing-sources.json"), `${JSON.stringify(missing, null, 2)}\n`, "utf8"),
]);
console.log(`Gold / Silver / Bronze: ${gold.length} / ${silver.length} / ${bronze.length}`);
console.log(`Missing sources: ${missing.length}`);
console.log(`Gold guard failures: ${guardFailures.length}`);
console.log(`Voice-aware Gold guard failures: ${voiceAwareGuardFailures.length}`);
if (guardFailures.length > 0 || voiceAwareGuardFailures.length > 0) process.exitCode = 1;

function optionValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readCases(path: string): Promise<RealMidiEvaluationCase[]> {
  return (await readJsonLines(path)).map((item) => realMidiEvaluationCaseSchema.parse(item));
}

async function readReviews(path: string): Promise<MidiDifferenceReview[]> {
  return (await readJsonLines(path)).map((item) => midiDifferenceReviewSchema.parse(item));
}

async function readJsonLines(path: string): Promise<unknown[]> {
  try {
    return (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; } catch { return fallback; }
}

function reviewToGoldCase(
  review: MidiDifferenceReview,
  source?: LocalMidiSourceIndexEntry,
): RealMidiEvaluationCase | undefined {
  if (review.judgment === "skip") return undefined;
  const selected = review.judgment === "legacy" || review.judgment === "both-acceptable"
    ? review.legacy.primary
    : review.judgment === "reranker" ? review.reranker.primary : review.correctedChord;
  if (!selected) return undefined;
  const chord = parseChordLabel(selected);
  if (!chord) return undefined;
  const alternatives = deriveAcceptableAlternatives(chord, { includeWeak: true });
  if (review.judgment === "both-acceptable" && !alternatives.some((item) => item.chord === review.reranker.primary)) {
    alternatives.push({ chord: review.reranker.primary, strength: "strong", reason: "manual" });
  }
  return realMidiEvaluationCaseSchema.parse({
    schemaVersion: 1,
    id: `review-${review.id}`,
    source: {
      fingerprint: review.sourceFingerprint,
      ...(source?.assetId ? { assetId: source.assetId } : {}),
      ...(source?.fileName ? { fileName: source.fileName } : {}),
    },
    range: { ...review.range },
    expected: {
      primary: [{ ...review.range, primary: chord.label, root: chord.root, quality: chord.quality,
        ...(chord.bass !== undefined ? { bass: chord.bass } : {}),
        ...(alternatives.length ? { acceptableAlternatives: alternatives.map((item) => item.chord) } : {}) }],
      ...(alternatives.length ? { alternatives: [{ ...review.range, alternatives }] } : {}),
    },
    label: { strength: "gold", origin: "difference-review", reviewedAt: review.reviewedAt, reviewer: "local-user" },
  });
}

function mergeCases(values: readonly RealMidiEvaluationCase[]): RealMidiEvaluationCase[] {
  const strength = { bronze: 0, silver: 1, gold: 2 } as const;
  const byId = new Map<string, RealMidiEvaluationCase>();
  values.forEach((item) => {
    const existing = byId.get(item.id);
    if (!existing || strength[item.label.strength] >= strength[existing.label.strength]) byId.set(item.id, item);
  });
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function goldGuardFailures(legacy: ReturnType<typeof evaluateGoldCases>, reranker: ReturnType<typeof evaluateGoldCases>): string[] {
  const failures: string[] = [];
  if (reranker.rootAccuracy < legacy.rootAccuracy) failures.push("root-accuracy-regressed");
  if (reranker.qualityAccuracy < legacy.qualityAccuracy) failures.push("quality-accuracy-regressed");
  if (reranker.boundaryPrecision < legacy.boundaryPrecision) failures.push("boundary-precision-regressed");
  if (reranker.boundaryRecall < legacy.boundaryRecall) failures.push("boundary-recall-regressed");
  if (reranker.correctionCost > legacy.correctionCost) failures.push("correction-cost-increased");
  if (reranker.operationCorrectionCost.mean > legacy.operationCorrectionCost.mean) {
    failures.push("operation-correction-cost-increased");
  }
  return failures;
}

function jsonLines(values: readonly unknown[]): string {
  return values.length ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "";
}

function summaryMarkdown(): string {
  return `# Real MIDI Evaluation\n\n`
    + `## Gold (accuracy and hard guard)\n\n\`\`\`json\n${JSON.stringify(report.datasets.realMidiGold, null, 2)}\n\`\`\`\n\n`
    + `Guard failures: ${guardFailures.length ? guardFailures.join(", ") : "none"}\n\n`
    + `Voice-aware guard failures: ${voiceAwareGuardFailures.length ? voiceAwareGuardFailures.join(", ") : "none"}\n\n`
    + `## Silver (saved-label agreement; not official accuracy)\n\n\`\`\`json\n${JSON.stringify(report.datasets.realMidiSilver, null, 2)}\n\`\`\`\n\n`
    + `## Bronze (agreement and review demand only)\n\n\`\`\`json\n${JSON.stringify(report.datasets.realMidiBronze, null, 2)}\n\`\`\`\n\n`
    + `## Unlabeled\n\nCase count: 0\n`;
}
