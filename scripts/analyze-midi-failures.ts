import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import type { ChordTimelineItem } from "../src/domain/types";
import type { ChordCandidateScore } from "../src/domain/midi/candidates";
import { evaluateCase } from "../src/domain/midi/evaluation/evaluate";
import { adaptChordDripManifest, type ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import type { EvaluationCaseInput, ExpectedChordSegment, MidiEvaluationCategory } from "../src/domain/midi/evaluation/types";
import { buildHybridPipeline } from "../src/domain/midi/hybrid";
import { analyzeMidi as analyzeLegacy } from "../src/domain/midi/legacy";
import type { DecodedSegment } from "../src/domain/midi/decoder";

const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const outputDir = resolve(cwd(), "artifacts/midi-failure-analysis");
const docsPath = resolve(cwd(), "docs/phase3.6.1-failure-analysis.md");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;
const definitions = adaptChordDripManifest(manifest);
const cases: EvaluationCaseInput[] = await Promise.all(definitions.map(async (definition) => ({
  definition,
  bytes: new Uint8Array(await readFile(resolve(dirname(manifestPath), definition.midiPath))),
})));

const analyzed = cases.map((input) => analyzeCase(input));
const categories = [...new Set(definitions.flatMap((definition) => definition.category))].sort();
const representatives = categories.map((category) => selectRepresentative(analyzed, category));
const report = {
  schemaVersion: 1,
  datasetId: manifest.recipeSha256,
  caseCount: analyzed.length,
  categories,
  failureSummary: summarizeFailures(analyzed),
  representatives,
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(docsPath, markdown(report), "utf8");
stdout.write(`Wrote ${representatives.length} category representatives to ${docsPath}\n`);

function analyzeCase(input: EvaluationCaseInput) {
  const legacy = analyzeLegacy(input.bytes).fullTimeline;
  const pipeline = buildHybridPipeline(input.bytes);
  const hybrid = pipeline.merged.map((segment): ChordTimelineItem => ({
    bar: Math.floor(segment.startBeat / pipeline.beatsPerBar) + 1,
    beat: segment.startBeat % pipeline.beatsPerBar + 1,
    durationBeats: segment.endBeat - segment.startBeat,
    chord: segment.candidate.chord,
    confidence: segment.confidence,
    alternatives: segment.alternatives.map((candidate) => ({ chord: candidate.chord, confidence: 0 })),
    warnings: segment.warnings,
  }));
  const legacyMetrics = evaluateCase(input.definition, legacy);
  const hybridMetrics = evaluateCase(input.definition, hybrid);
  const segments = input.definition.expected.chordTimeline.map((expected) => {
    const beat = expected.startBeat + Math.min(0.01, (expected.endBeat - expected.startBeat) / 2);
    const legacyItem = timelineAt(legacy, beat, pipeline.beatsPerBar);
    const decoded = decodedAt(pipeline.decoded, beat);
    const hybridSegment = pipeline.merged.find((segment) => beat >= segment.startBeat && beat < segment.endBeat);
    return {
      range: `${expected.startBeat}-${expected.endBeat}`,
      expected: expected.primary,
      legacy: legacyItem?.chord.label,
      hybrid: hybridSegment?.candidate.chord.label,
      legacyCorrect: accepted(expected, legacyItem?.chord.label),
      hybridCorrect: accepted(expected, hybridSegment?.candidate.chord.label),
      topKContainsExpected: decoded?.scored.candidates.some((candidate) => accepted(expected, candidate.chord.label)) ?? false,
      topKContainsExpectedRoot: decoded?.scored.candidates.some((candidate) => candidate.chord.root === expected.root) ?? false,
      topKContainsExpectedRootQuality: decoded?.scored.candidates.some((candidate) =>
        candidate.chord.root === expected.root && candidate.chord.quality === expected.quality) ?? false,
      topK: decoded?.scored.candidates.map(scoreBreakdown) ?? [],
    };
  });
  return {
    id: input.definition.id,
    recipeFamily: input.definition.recipeFamily,
    split: input.definition.split,
    category: input.definition.category,
    difficulty: input.definition.difficulty,
    legacyMetrics,
    hybridMetrics,
    segments,
  };
}

function selectRepresentative(cases: ReturnType<typeof analyzeCase>[], category: MidiEvaluationCategory) {
  return cases.filter((entry) => entry.category.includes(category)).sort((left, right) =>
    failureRank(right) - failureRank(left) || left.id.localeCompare(right.id))[0];
}

function failureRank(entry: ReturnType<typeof analyzeCase>): number {
  const missingTopK = entry.segments.filter((segment) => !segment.topKContainsExpected).length;
  return entry.hybridMetrics.correctionCost * 10 + missingTopK * 3
    + (entry.hybridMetrics.correctionCost - entry.legacyMetrics.correctionCost) * 5;
}

function summarizeFailures(cases: ReturnType<typeof analyzeCase>[]) {
  const segments = cases.flatMap((entry) => entry.segments);
  return {
    totalExpectedSegments: segments.length,
    legacyWrong: segments.filter((segment) => !segment.legacyCorrect).length,
    hybridWrong: segments.filter((segment) => !segment.hybridCorrect).length,
    expectedMissingFromTopK: segments.filter((segment) => !segment.topKContainsExpected).length,
    expectedRootMissingFromTopK: segments.filter((segment) => !segment.topKContainsExpectedRoot).length,
    expectedRootQualityMissingFromTopK: segments.filter((segment) => !segment.topKContainsExpectedRootQuality).length,
    hybridWrongDespiteExpectedInTopK: segments.filter((segment) => !segment.hybridCorrect && segment.topKContainsExpected).length,
  };
}

function scoreBreakdown(candidate: ChordCandidateScore) {
  return {
    label: candidate.chord.label,
    total: round(candidate.totalScore),
    template: round(candidate.templateScore),
    core: round(candidate.coreCoverageScore),
    extension: round(candidate.extensionCoverageScore),
    bass: round(candidate.bassCompatibilityScore),
    slash: round(candidate.slashCompatibilityScore),
    key: round(candidate.keyCompatibilityScore),
    foreignPenalty: round(candidate.foreignNotePenalty),
    missingCorePenalty: round(candidate.missingCoreTonePenalty),
    ambiguityPenalty: round(candidate.ambiguityPenalty),
  };
}

function decodedAt(decoded: readonly DecodedSegment[], beat: number): DecodedSegment | undefined {
  return decoded.find((entry) => beat >= entry.scored.segment.startBeat && beat < entry.scored.segment.endBeat);
}

function timelineAt(timeline: readonly ChordTimelineItem[], beat: number, beatsPerBar: number) {
  return timeline.find((item) => {
    const start = (item.bar - 1) * beatsPerBar + item.beat - 1;
    return beat >= start && beat < start + item.durationBeats;
  });
}

function accepted(expected: ExpectedChordSegment, label?: string): boolean {
  return label === expected.primary || (!!label && (expected.acceptableAlternatives ?? []).includes(label));
}

function round(value: number): number { return Number(value.toFixed(4)); }

function markdown(report: typeof report): string {
  const lines = [
    "# Phase 3.6.1 MIDI失敗分析",
    "",
    `- Dataset: \`${report.datasetId}\``,
    `- Cases: ${report.caseCount}`,
    `- Expected segments: ${report.failureSummary.totalExpectedSegments}`,
    `- Legacy wrong: ${report.failureSummary.legacyWrong}`,
    `- Raw hybrid wrong: ${report.failureSummary.hybridWrong}`,
    `- Expected absent from Top-K: ${report.failureSummary.expectedMissingFromTopK}`,
    `- Expected root absent from Top-K: ${report.failureSummary.expectedRootMissingFromTopK}`,
    `- Expected root + quality absent from Top-K: ${report.failureSummary.expectedRootQualityMissingFromTopK}`,
    `- Expected in Top-K but hybrid selected another chord: ${report.failureSummary.hybridWrongDespiteExpectedInTopK}`,
    "",
    "## Category Representatives",
    "",
    "| Category | Case | Legacy corrections | Hybrid corrections | Missing from Top-K |",
    "|---|---|---:|---:|---:|",
    ...report.representatives.map((entry, index) => `| ${report.categories[index]} | ${entry.id} | ${entry.legacyMetrics.correctionCost} | ${entry.hybridMetrics.correctionCost} | ${entry.segments.filter((segment) => !segment.topKContainsExpected).length} |`),
  ];
  report.representatives.forEach((entry, index) => {
    lines.push("", `## ${report.categories[index]}: ${entry.id}`, "", `Recipe family: \`${entry.recipeFamily}\``, "");
    entry.segments.filter((segment) => !segment.hybridCorrect || !segment.legacyCorrect).slice(0, 6).forEach((segment) => {
      lines.push(`### Beats ${segment.range}`, "", `Expected: **${segment.expected}** / Legacy: **${segment.legacy ?? "none"}** / Hybrid: **${segment.hybrid ?? "none"}**`, "", "| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |", "|---:|---|---:|---:|---:|---:|---:|---:|---:|");
      segment.topK.slice(0, 5).forEach((candidate, rank) => lines.push(`| ${rank + 1} | ${candidate.label} | ${candidate.total} | ${candidate.template} | ${candidate.core} | ${candidate.bass} | ${candidate.key} | ${candidate.foreignPenalty} | ${candidate.missingCorePenalty} |`));
      lines.push("");
    });
  });
  lines.push("", "## Reading the result", "", "- Exact-label absence can include unsupported tension or slash notation, so root and root + quality counts must be read alongside it.", "- Root absence is a candidate-generation/scoring failure.", "- Expected root + quality in Top-K but another chord selected is primarily a temporal decoding/reranking failure.", "- This report uses raw hybrid decisions, not the product integration that keeps legacy primary chords.");
  return `${lines.join("\n")}\n`;
}
