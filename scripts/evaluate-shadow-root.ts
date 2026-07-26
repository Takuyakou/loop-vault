import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import type { NormalizedChordIdentity } from "../src/domain/chordIdentity";
import {
  shadowFactorizedRootIsIsolated,
  shadowFactorizedRootSequence,
} from "../src/domain/midi/shadowFactorizedRoot";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";
import { observeFile, stageFCorpus } from "./shadowCorpus";
import { parseGoldLabel } from "./syntheticGoldCorpus";

/**
 * Stage F2: measure the factorized root, connect nothing.
 *
 * Three numbers matter and they are reported separately rather than pooled.
 * Whether the root is isolated from the quality layer is the question F2 exists
 * to answer, and it is pass/fail. Whether the root is *better* is a research
 * result, not a gate — the product output is unchanged either way. And whether
 * plain triads got worse is the one that would sink the approach: a method that
 * helps pedals and hurts ordinary chords is not a method worth connecting.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const mode = (optionValue("--mode") ?? "phase4-v1") as MidiAnalyzerMode;
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/stage-f/02-shadow-root.json");
const extraFiles = argv.flatMap((value, index) => (
  value === "--file" && argv[index + 1]
    ? [{ source: `${optionValue("--label") ?? "private"}:${index}`, path: argv[index + 1] }]
    : []
));

/** Gold roots, per corpus file, keyed by the bar and beat the event starts on. */
async function goldRoots(): Promise<Map<string, Map<string, number>>> {
  const byFile = new Map<string, Map<string, number>>();
  for (const corpus of [
    { path: ".local-evaluation/synthetic-gold-v1", name: "synthetic-gold-v1" },
    { path: ".local-evaluation/long-form-v1.1", name: "long-form-v1.1" },
    { path: ".local-evaluation/holdout-v3", name: "regression-v3" },
  ]) {
    try {
      const manifest = JSON.parse(
        await readFile(resolve(cwd(), corpus.path, "manifest.json"), "utf8"),
      ) as {
        scenarios: Array<{
          scenarioId: string;
          variants: Array<{
            variant: string;
            events: Array<{ startBar: number; startBeatInBar: number; primary: string }>;
          }>;
        }>;
      };
      for (const scenario of manifest.scenarios) {
        for (const variant of scenario.variants) {
          const roots = new Map<string, number>();
          for (const event of variant.events) {
            const parsed = parseGoldLabel(event.primary) as NormalizedChordIdentity | null;
            if (!parsed || parsed.noChord) continue;
            // `startBeatInBar` is already 1-based, the same as a timeline item's
            // `beat`. Adding one shifted every gold key by a beat and produced a
            // silent zero-overlap join, which reads as "no gold" rather than as
            // a bug.
            roots.set(`${event.startBar}.${event.startBeatInBar}`, parsed.rootPitchClass);
          }
          byFile.set(`${corpus.name}:${scenario.scenarioId}_${variant.variant}`, roots);
        }
      }
    } catch { /* corpus not generated locally */ }
  }
  // The Chord Drip corpus carries its own generation record, which is gold in the
  // same sense: the generator wrote the chord before anything measured it.
  // Leaving it out would have meant reporting "no gold available" for the one
  // corpus the product's own non-regression gate runs on.
  try {
    const manifest = JSON.parse(
      await readFile(resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json"), "utf8"),
    ) as {
      files: Array<{
        caseId: string;
        chordTimeline?: Array<{
          barNumber: number;
          beatInBar: number;
          chordSymbol?: { root: number };
        }>;
      }>;
    };
    for (const entry of manifest.files) {
      const roots = new Map<string, number>();
      for (const event of entry.chordTimeline ?? []) {
        if (event.chordSymbol === undefined) continue;
        // `beatInBar` is 0-based here, unlike the synthetic corpora's 1-based
        // `startBeatInBar`. Assuming one convention for both is what produced a
        // silent zero-overlap join the first time.
        roots.set(`${event.barNumber}.${event.beatInBar + 1}`, ((event.chordSymbol.root % 12) + 12) % 12);
      }
      byFile.set(`chord-drip:${entry.caseId}`, roots);
    }
  } catch { /* not available */ }

  return byFile;
}

const gold = await goldRoots();
const corpus = await stageFCorpus(extraFiles);

interface SubsetTally {
  windows: number;
  productMatchesGold: number;
  shadowTop1MatchesGold: number;
  shadowTop3ContainsGold: number;
  goldWindows: number;
  productVsShadowDiffers: number;
  shadowRootless: number;
  correctionCostProduct: number;
  correctionCostShadow: number;
}

const emptyTally = (): SubsetTally => ({
  windows: 0,
  productMatchesGold: 0,
  shadowTop1MatchesGold: 0,
  shadowTop3ContainsGold: 0,
  goldWindows: 0,
  productVsShadowDiffers: 0,
  shadowRootless: 0,
  correctionCostProduct: 0,
  correctionCostShadow: 0,
});

const overall = emptyTally();
const subsets: Record<string, SubsetTally> = {};
const relationTally: Record<string, SubsetTally> = {};

let isolatedFiles = 0;
let perturbationEffective = 0;
const runtimes: number[] = [];
const margins: number[] = [];

for (const entry of corpus) {
  const observed = await observeFile(entry.source, entry.path, mode);
  runtimes.push(observed.runtimeMs);

  const sequence = shadowFactorizedRootSequence(observed.windows);
  const isolation = shadowFactorizedRootIsIsolated(observed.windows);
  if (isolation.isolated) isolatedFiles += 1;
  if (isolation.perturbationHadEffect) perturbationEffective += 1;

  const goldForFile = gold.get(entry.source);

  observed.windows.forEach((window, index) => {
    const shadow = sequence[index];
    margins.push(shadow.margin);

    const buckets: SubsetTally[] = [overall];
    for (const subset of entry.subsets) {
      subsets[subset] ??= emptyTally();
      buckets.push(subsets[subset]);
    }
    relationTally[shadow.relation] ??= emptyTally();
    buckets.push(relationTally[shadow.relation]);

    const goldRoot = goldForFile?.get(`${window.bar}.${window.beat}`);
    const productRoot = window.currentRoot;

    for (const bucket of buckets) {
      bucket.windows += 1;
      if (shadow.rootlessInferred) bucket.shadowRootless += 1;
      if (productRoot !== undefined && productRoot !== shadow.top1) {
        bucket.productVsShadowDiffers += 1;
      }
      if (goldRoot !== undefined) {
        bucket.goldWindows += 1;
        if (productRoot === goldRoot) bucket.productMatchesGold += 1;
        else bucket.correctionCostProduct += 1;
        if (shadow.top1 === goldRoot) bucket.shadowTop1MatchesGold += 1;
        else bucket.correctionCostShadow += 1;
        if (shadow.top3.some((candidate) => candidate.pitchClass === goldRoot)) {
          bucket.shadowTop3ContainsGold += 1;
        }
      }
    }
  });
}

const rate = (numerator: number, denominator: number) => (denominator === 0
  ? null
  : Number((numerator / denominator).toFixed(6)));

const summarise = (tally: SubsetTally) => ({
  windows: tally.windows,
  goldWindows: tally.goldWindows,
  productRootAccuracy: rate(tally.productMatchesGold, tally.goldWindows),
  shadowTop1Accuracy: rate(tally.shadowTop1MatchesGold, tally.goldWindows),
  shadowTop3Accuracy: rate(tally.shadowTop3ContainsGold, tally.goldWindows),
  productVsShadowDiffers: tally.productVsShadowDiffers,
  shadowRootless: tally.shadowRootless,
  correctionCostProduct: tally.correctionCostProduct,
  correctionCostShadow: tally.correctionCostShadow,
  correctionCostDelta: tally.correctionCostShadow - tally.correctionCostProduct,
});

const stats = (values: number[]) => (values.length === 0 ? null : {
  min: Number(Math.min(...values).toFixed(6)),
  mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)),
  max: Number(Math.max(...values).toFixed(6)),
});

const plainTriad = subsets["plain-triad"];
const gates = [
  {
    id: "quality-parameter-isolation",
    verdict: isolatedFiles === corpus.length ? "pass" : "fail",
    detail: `${isolatedFiles}/${corpus.length} files identical at 0.7 / 1.0 / 1.3`,
  },
  {
    id: "perturbation-not-vacuous",
    verdict: perturbationEffective === corpus.length ? "pass" : "fail",
    detail: `${perturbationEffective}/${corpus.length} files where the perturbation changed the quality score`,
  },
  {
    id: "plain-triad-no-severe-regression",
    verdict: plainTriad === undefined || plainTriad.goldWindows === 0
      ? "not-evaluated"
      : (plainTriad.correctionCostShadow <= plainTriad.correctionCostProduct ? "pass" : "fail"),
    detail: plainTriad === undefined
      ? "no plain-triad subset in this corpus"
      : `product ${plainTriad.correctionCostProduct} vs shadow ${plainTriad.correctionCostShadow} corrections`,
  },
];

const report = {
  schemaVersion: 1,
  stage: "Stage F2 (shadow)",
  mode,
  connectedToProduct: false,
  files: corpus.length,
  gates,
  verdict: gates.some((gate) => gate.verdict === "fail") ? "FAIL" : "PASS",
  overall: summarise(overall),
  subsets: Object.fromEntries(
    Object.entries(subsets).sort().map(([name, tally]) => [name, summarise(tally)]),
  ),
  byRelation: Object.fromEntries(
    Object.entries(relationTally).sort().map(([name, tally]) => [name, summarise(tally)]),
  ),
  shadowMargin: stats(margins),
  runtimeMs: stats(runtimes),
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`Stage F2 shadow root: ${report.verdict}  (${corpus.length} files)\n\n`);
for (const gate of gates) {
  const mark = gate.verdict === "pass" ? "PASS" : (gate.verdict === "fail" ? "FAIL" : "----");
  stdout.write(`${mark}  ${gate.id.padEnd(34)} ${gate.detail}\n`);
}

const line = (name: string, value: ReturnType<typeof summarise>) => stdout.write(
  `  ${name.padEnd(18)} gold ${String(value.goldWindows).padStart(5)}`
  + `  product ${value.productRootAccuracy === null ? "  -  " : (100 * value.productRootAccuracy).toFixed(1).padStart(5)}%`
  + `  shadow1 ${value.shadowTop1Accuracy === null ? "  -  " : (100 * value.shadowTop1Accuracy).toFixed(1).padStart(5)}%`
  + `  shadow3 ${value.shadowTop3Accuracy === null ? "  -  " : (100 * value.shadowTop3Accuracy).toFixed(1).padStart(5)}%`
  + `  cost ${String(value.correctionCostDelta).padStart(6)}\n`,
);

stdout.write("\noverall\n");
line("all", report.overall);
stdout.write("\nby subset\n");
for (const [name, value] of Object.entries(report.subsets)) line(name, value);
stdout.write("\nby bass relation\n");
for (const [name, value] of Object.entries(report.byRelation)) line(name, value);
stdout.write(`\nshadow margin ${JSON.stringify(report.shadowMargin)}\n`);
