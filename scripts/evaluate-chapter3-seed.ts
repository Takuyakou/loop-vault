import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import {
  aggregateV2, evaluateCaseV2, pairedComparison, type CaseMetricsV2,
} from "../src/domain/midi/evaluation/metricsV2";
import type { MidiEvaluationCase } from "../src/domain/midi/evaluation/types";
import { parseChordLabel } from "../src/domain/chords";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";

/**
 * Independent evaluation against the Chapter 3 ground-truth seed.
 *
 * The Chord Drip corpus that drove Phase 4.0 is machine-generated from the same
 * theory engine that produced its own labels, and it carries no acceptable
 * alternatives. This set is hand-annotated, includes alternatives for genuinely
 * ambiguous pitch sets, and was never used to tune anything — so it is the first
 * real check on whether the promotion decision holds outside its own corpus.
 *
 * The MIDI is licence-unclear, so it lives under `.local-evaluation/` and is
 * never committed.
 */
const corpusRoot = resolve(cwd(), optionValue("--corpus") ?? ".local-evaluation/chapter3-seed");
const manifestPath = resolve(corpusRoot, "manifest.json");
const outputDir = resolve(cwd(), "docs/phase4.0");
const outputName = optionValue("--output") ?? "chapter3-seed-evaluation.json";

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

interface SeedSegment {
  startBeat: number;
  endBeat: number;
  primary: string;
  acceptableAlternatives?: string[];
  annotationConfidence?: string;
}

interface SeedCase {
  id: string;
  title: string;
  midiPath: string;
  category?: string[];
  difficulty?: string;
  expected: { chordTimeline: SeedSegment[] };
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
  set: string;
  fileCount: number;
  eventCount: number;
  cases: SeedCase[];
};

/** Bridges the seed manifest onto the shared evaluation case shape. */
function adapt(seed: SeedCase): MidiEvaluationCase {
  return {
    id: seed.id,
    title: seed.title,
    midiPath: seed.midiPath,
    recipeFamily: "chapter3-seed",
    // Nothing here was used for tuning, so the whole set is holdout.
    split: "holdout",
    category: ["chord-only"],
    difficulty: "medium",
    expected: {
      chordTimeline: seed.expected.chordTimeline.map((segment) => {
        const parsed = parseChordLabel(segment.primary);
        return {
          startBeat: segment.startBeat,
          endBeat: segment.endBeat,
          primary: segment.primary,
          root: parsed?.root ?? 0,
          quality: parsed?.quality ?? "maj",
          ...(parsed?.bass !== undefined ? { bass: parsed.bass } : {}),
          ...(segment.acceptableAlternatives?.length
            ? { acceptableAlternatives: segment.acceptableAlternatives }
            : {}),
        };
      }),
    },
  };
}

const definitions = manifest.cases.map(adapt);
const cases = await Promise.all(definitions.map(async (definition) => ({
  definition,
  bytes: new Uint8Array(await readFile(resolve(dirname(manifestPath), definition.midiPath))),
})));

const unparsable = definitions.flatMap((definition) =>
  definition.expected.chordTimeline
    .filter((segment) => parseChordLabel(segment.primary) === null)
    .map((segment) => segment.primary));
const withAlternatives = definitions.reduce((count, definition) =>
  count + definition.expected.chordTimeline.filter(
    (segment) => (segment.acceptableAlternatives?.length ?? 0) > 0).length, 0);
const totalEvents = definitions.reduce(
  (count, definition) => count + definition.expected.chordTimeline.length, 0);

stdout.write(`${manifest.set}\n`);
stdout.write(`cases ${cases.length}, annotated events ${totalEvents}\n`);
stdout.write(`events carrying acceptable alternatives: ${withAlternatives}\n`);
stdout.write(`labels this build cannot parse: ${unparsable.length}`
  + `${unparsable.length ? ` (${[...new Set(unparsable)].slice(0, 8).join(", ")})` : ""}\n\n`);

const modes: Array<{ key: string; mode: MidiAnalyzerMode }> = [
  { key: "legacy", mode: "legacy" },
  { key: "legacyBoundaryRerank", mode: "legacy-boundary-rerank" },
  { key: "voiceAwareRerank", mode: "voice-aware-rerank-v1" },
  { key: "phase4", mode: "phase4-v1" },
];

const results: Record<string, CaseMetricsV2[]> = {};
const runtimeMs: Record<string, number> = {};
for (const { key, mode } of modes) {
  const start = performance.now();
  results[key] = cases.map(({ definition, bytes }) =>
    evaluateCaseV2(definition, analyzeMidi(bytes, { mode }).fullTimeline));
  runtimeMs[key] = Number((performance.now() - start).toFixed(1));
}

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
const summaries: Record<string, unknown> = {};
for (const { key } of modes) {
  const aggregate = aggregateV2(results[key]);
  const value = aggregate.durationWeighted;
  summaries[key] = { runtimeMs: runtimeMs[key], ...aggregate };
  stdout.write(`${key} (${runtimeMs[key]} ms)\n`);
  stdout.write(`  root ${pct(value.rootAccuracy)}  triad ${pct(value.triadAccuracy)}  quality ${pct(value.qualityAccuracy)}  seventh ${pct(value.seventhAccuracy)}\n`);
  stdout.write(`  bass ${pct(value.bassSlashAccuracy)}  canonicalExact ${pct(value.canonicalExactAccuracy)}  pitchSet ${pct(value.pitchSetEquivalentAccuracy)}\n`);
  stdout.write(`  top3canon ${pct(value.top3CanonicalAccuracy)}  top3root ${pct(value.top3RootAccuracy)}  top3quality ${pct(value.top3QualityAccuracy)}\n`);
  const rep = aggregate.representabilityBeats;
  stdout.write(`  representable ${rep.representable}/${rep.total} beats  parser-unsupported ${rep.parserUnsupported}\n\n`);
}

const legacyValue = aggregateV2(results.legacy).durationWeighted;
const phase4Value = aggregateV2(results.phase4).durationWeighted;
const deltas = Object.fromEntries(
  (["rootAccuracy", "triadAccuracy", "qualityAccuracy", "seventhAccuracy", "bassSlashAccuracy",
    "canonicalExactAccuracy", "top3CanonicalAccuracy", "top3RootAccuracy", "top3QualityAccuracy",
  ] as const).map((metric) => [
    metric,
    Number(((phase4Value[metric] - legacyValue[metric]) * 100).toFixed(2)),
  ]),
);
stdout.write("phase4-v1 vs legacy (pp):\n");
for (const [metric, delta] of Object.entries(deltas)) {
  stdout.write(`  ${metric.padEnd(26)} ${delta >= 0 ? "+" : ""}${delta}\n`);
}

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify({
  schemaVersion: 1,
  corpus: manifest.set,
  corpusLocation: ".local-evaluation/chapter3-seed (not committed; licence unconfirmed)",
  caseCount: cases.length,
  annotatedEvents: totalEvents,
  eventsWithAcceptableAlternatives: withAlternatives,
  unparsableExpectedLabels: [...new Set(unparsable)],
  analyzers: summaries,
  phase4VsLegacyPp: deltas,
  paired: pairedComparison(results.legacy, results.phase4, "canonicalExactAccuracy"),
}, null, 2)}\n`, "utf8");
