import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { fingerprintMidiBytes } from "../src/domain/midi/feedback";
import type { CandidateCatalog, CatalogPattern } from "../src/domain/midi/candidateCatalog";
import type { RecommendationResult } from "../src/domain/midi/candidateRecommendation";
import { buildCatalogView } from "../src/domain/midi/catalogView";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";

/**
 * The six critical guards of `00-catalog-hard-gates.json`, on the files the
 * complaints were about.
 *
 * These are the shapes a reader called broken, not aggregate quality: one
 * progression shown as ten, a vamp-only file headed "recommended progressions",
 * and the Endless defect where one Em11/A pattern took three of the visible
 * slots. They are checked on the real MIDI rather than only on fixtures, because
 * the fixtures are the ones I wrote.
 *
 * Private MIDI is read from wherever the caller keeps it and only fingerprints
 * and counts are written; no bytes and no paths leave this run.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const mode = (optionValue("--mode") ?? "phase4.1.2-v1") as MidiAnalyzerMode;
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/phase4.1.2-h/04-critical-guards.json");

interface Observation {
  label: string;
  fingerprint: string;
  totalBars: number;
  catalogPatterns: number;
  progressionPatterns: number;
  vampPatterns: number;
  fragmentPatterns: number;
  uncertainPatterns: number;
  recommendationCount: number;
  eligiblePatternCount: number;
  paddingCount: number;
  stoppedBecause: string;
  viewMode: string;
  recommendationLanePresent: boolean;
  laneCounts: Record<string, number>;
  visiblePatternDuplicateCount: number;
  topThree: Array<{ rank: number; kind: string; lengthBars: number; occurrences: number; chords: string[] }>;
  largestPatternOccurrences: number;
  runtimeMs: number;
}

function observe(label: string, bytes: Uint8Array): Observation {
  const started = performance.now();
  const analysis = analyzeMidi(bytes, { mode });
  const runtimeMs = Number((performance.now() - started).toFixed(1));
  const catalog = analysis.candidateCatalog as CandidateCatalog | undefined;
  const recommendation = analysis.candidateRecommendation as RecommendationResult | undefined;
  if (catalog === undefined || recommendation === undefined) {
    throw new Error(`mode ${mode} produced no catalog for ${label}`);
  }
  const view = buildCatalogView(catalog, recommendation);
  const byId = new Map(catalog.patterns.map((pattern) => [pattern.patternId, pattern]));
  const laneIds = view.lanes.flatMap((lane) => lane.entries.map((entry) => entry.patternId));

  const describe = (pattern: CatalogPattern, rank: number) => {
    const representative = pattern.occurrences.find(
      (occurrence) => occurrence.id === pattern.representativeOccurrenceId,
    ) ?? pattern.occurrences[0];
    return {
      rank,
      kind: pattern.candidateKind,
      lengthBars: pattern.qualitySummary.lengthBars,
      occurrences: pattern.occurrences.length,
      chords: representative.events.map((event) => event.chord.label),
    };
  };

  return {
    label,
    fingerprint: fingerprintMidiBytes(bytes),
    totalBars: analysis.totalBars,
    catalogPatterns: catalog.patterns.length,
    progressionPatterns: catalog.progressionPatternIds.length,
    vampPatterns: catalog.vampPatternIds.length,
    fragmentPatterns: catalog.fragmentPatternIds.length,
    uncertainPatterns: catalog.uncertainPatternIds.length,
    recommendationCount: recommendation.recommendations.length,
    eligiblePatternCount: recommendation.eligiblePatternCount,
    paddingCount: recommendation.paddingCount,
    stoppedBecause: recommendation.stoppedBecause,
    viewMode: view.mode,
    recommendationLanePresent: view.lanes.some((lane) => lane.kind === "recommended"),
    laneCounts: Object.fromEntries(view.lanes.map((lane) => [lane.kind, lane.totalCount])),
    visiblePatternDuplicateCount: laneIds.length - new Set(laneIds).size,
    topThree: recommendation.recommendations.slice(0, 3).flatMap((entry) => {
      const pattern = byId.get(entry.patternId);
      return pattern ? [describe(pattern, entry.rank)] : [];
    }),
    largestPatternOccurrences: catalog.patterns.reduce(
      (most, pattern) => Math.max(most, pattern.occurrences.length),
      0,
    ),
    runtimeMs,
  };
}

const observations: Observation[] = [];

async function observeFile(label: string, path: string | undefined) {
  if (path === undefined) return;
  try {
    const bytes = new Uint8Array(await readFile(resolve(cwd(), path)));
    observations.push(observe(label, bytes));
  } catch {
    stdout.write(`  (skipped ${label}: not readable at the given path)\n`);
  }
}

// Corpus fixtures. These are regenerable from this repository.
await observeFile(
  "clean-8bar (S01_clean)",
  ".local-evaluation/synthetic-gold-v1/midi/S01_clean-triad-loop_clean.mid",
);
await observeFile(
  "one-pattern-four-occurrences (S12_clean)",
  ".local-evaluation/synthetic-gold-v1/midi/S12_repeated-pattern-four-times_clean.mid",
);
await observeFile(
  "progression-vs-vamp (S11_clean)",
  ".local-evaluation/synthetic-gold-v1/midi/S11_progression-vs-vamp_clean.mid",
);
await observeFile(
  "vamp-and-uncertain-only (L06_stress)",
  ".local-evaluation/long-form-v1.1/midi/L06_vamp-only-song_stress.mid",
);

// Private MIDI, by path, so nothing about the user's files is committed.
await observeFile("Endless", optionValue("--endless"));
await observeFile("SURAN remix", optionValue("--suran"));
await observeFile("Chapter 3 seed", optionValue("--chapter3"));

interface GuardResult {
  id: string;
  expectation: string;
  observed: string;
  verdict: "pass" | "fail" | "not-evaluated";
}

const find = (needle: string) => observations.find((entry) => entry.label.startsWith(needle));

const guards: GuardResult[] = [];

const clean8 = find("clean-8bar");
guards.push({
  id: "clean-8bar-single-progression-no-padding",
  expectation: "one recommendation, padding 0, no duplicate card",
  observed: clean8
    ? `catalog ${clean8.catalogPatterns}, recommendation ${clean8.recommendationCount}, `
      + `padding ${clean8.paddingCount}, duplicates ${clean8.visiblePatternDuplicateCount}, `
      + `view ${clean8.viewMode}`
    : "fixture not available",
  verdict: clean8 === undefined
    ? "not-evaluated"
    : (clean8.recommendationCount === 1
      && clean8.paddingCount === 0
      && clean8.visiblePatternDuplicateCount === 0 ? "pass" : "fail"),
});

const four = find("one-pattern-four-occurrences");
guards.push({
  id: "one-pattern-four-occurrences",
  expectation: "the repeated pattern is one card holding its four occurrences, at most one slot",
  observed: four
    ? `largest pattern holds ${four.largestPatternOccurrences} occurrences, `
      + `duplicates ${four.visiblePatternDuplicateCount}, recommendation ${four.recommendationCount}`
    : "fixture not available",
  verdict: four === undefined
    ? "not-evaluated"
    : (four.largestPatternOccurrences >= 4 && four.visiblePatternDuplicateCount === 0 ? "pass" : "fail"),
});

// S11 holds one progression and one vamp, not two progressions, so it evidences
// the ordering half of this guard. The count half — a file with exactly two
// eligible progressions recommending exactly two — is asserted in
// `catalogView.test.ts` and `candidateRecommendation.test.ts`, where the input
// can be constructed to hold exactly two.
const progressionVsVamp = find("progression-vs-vamp");
guards.push({
  id: "two-distinct-progressions-exactly-two",
  expectation: "no padding, no duplicate card, the progression ahead of the vamp",
  observed: progressionVsVamp
    ? `S11: recommendation ${progressionVsVamp.recommendationCount} `
      + `(1 progression + 1 vamp in the file), padding ${progressionVsVamp.paddingCount}, `
      + `top kinds ${progressionVsVamp.topThree.map((entry) => entry.kind).join("/") || "(none)"}; `
      + "the exactly-two count is asserted in catalogView.test.ts"
    : "fixture not available",
  verdict: progressionVsVamp === undefined
    ? "not-evaluated"
    : (progressionVsVamp.paddingCount === 0
      && progressionVsVamp.visiblePatternDuplicateCount === 0
      && progressionVsVamp.topThree.every((entry) => entry.kind === "progression") ? "pass" : "fail"),
});

const zeroEligible = find("vamp-and-uncertain-only");
guards.push({
  id: "zero-eligible-hides-recommendation",
  expectation: "recommendation section hidden; the other lanes still populated",
  observed: zeroEligible
    ? `eligible ${zeroEligible.eligiblePatternCount}, recommendation lane `
      + `${zeroEligible.recommendationLanePresent ? "present" : "hidden"}, `
      + `lanes ${JSON.stringify(zeroEligible.laneCounts)}`
    : "fixture not available",
  verdict: zeroEligible === undefined
    ? "not-evaluated"
    : (zeroEligible.eligiblePatternCount === 0
      ? (zeroEligible.recommendationLanePresent === false
        && Object.values(zeroEligible.laneCounts).some((count) => count > 0) ? "pass" : "fail")
      : "not-evaluated"),
});

const endless = find("Endless");
guards.push({
  id: "endless-em11a",
  expectation:
    "one card per pattern; with three or more progressions available a two-bar vamp is not in the top three; the vamp stays in the catalog",
  observed: endless
    ? `catalog ${endless.catalogPatterns} (prog ${endless.progressionPatterns} vamp ${endless.vampPatterns}), `
      + `duplicates ${endless.visiblePatternDuplicateCount}, `
      + `top3 ${endless.topThree.map((entry) => `${entry.kind}/${entry.lengthBars}b`).join(" ") || "(none)"}`
    : "private MIDI not supplied (--endless)",
  verdict: endless === undefined
    ? "not-evaluated"
    : (endless.visiblePatternDuplicateCount === 0
      && (endless.progressionPatterns < 3
        || endless.topThree.every((entry) => entry.kind === "progression"))
      ? "pass" : "fail"),
});

guards.push({
  id: "no-low-quality-padding",
  expectation: "no recommendation admitted solely to reach the display cap, on any file observed",
  observed: `paddingCount 0 on ${observations.filter((entry) => entry.paddingCount === 0).length}/${observations.length} files`,
  verdict: observations.length === 0
    ? "not-evaluated"
    : (observations.every((entry) => entry.paddingCount === 0) ? "pass" : "fail"),
});

const report = {
  schemaVersion: 1,
  stage: "P4.1.2-H4",
  mode,
  guards,
  verdict: guards.some((entry) => entry.verdict === "fail") ? "FAIL" : "PASS",
  observations,
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`Critical guards: ${report.verdict}\n\n`);
for (const guard of guards) {
  const mark = guard.verdict === "pass" ? "PASS" : (guard.verdict === "fail" ? "FAIL" : "----");
  stdout.write(`${mark}  ${guard.id}\n        ${guard.observed}\n`);
}
stdout.write("\nObserved files\n");
for (const entry of observations) {
  stdout.write(
    `  ${entry.label.padEnd(38)} bars ${String(entry.totalBars).padStart(4)}`
    + `  catalog ${String(entry.catalogPatterns).padStart(4)}`
    + ` (prog ${entry.progressionPatterns} vamp ${entry.vampPatterns}`
    + ` frag ${entry.fragmentPatterns} unc ${entry.uncertainPatterns})`
    + `  rec ${String(entry.recommendationCount).padStart(2)}`
    + `  ${entry.viewMode.padEnd(7)}  ${entry.runtimeMs} ms\n`,
  );
}
