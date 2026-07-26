import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import type { NormalizedChordIdentity } from "../src/domain/chordIdentity";
import {
  correctedRoot,
  preregisteredThresholds,
  proposeRootCorrections,
} from "../src/domain/midi/selectiveRootCorrection";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";
import { observeFile, stageFCorpus } from "./shadowCorpus";
import { parseGoldLabel } from "./syntheticGoldCorpus";
/**
 * Stage F2R: how often would a narrow correction rule help, and how often hurt?
 *
 * The only number that decides anything is the net: corrections that turn a
 * wrong root right, minus corrections that turn a right root wrong. A rule can
 * have excellent precision and still be worth nothing if it fires twice, and can
 * fire constantly and be worth less than nothing. Both directions are counted
 * and reported separately.
 *
 * Thresholds come from `docs/stage-f/03-f2r-preregistered-thresholds.json`,
 * frozen before this ran. Nothing here touches the product.
 */
function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
const mode = (optionValue("--mode") ?? "phase4-v1") as MidiAnalyzerMode;
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/stage-f/03-f2r-results.json");
const extraFiles = argv.flatMap((value, index) => (
  value === "--file" && argv[index + 1]
    ? [{ source: `${optionValue("--label") ?? "private"}:${index}`, path: argv[index + 1] }]
    : []
));
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
            roots.set(`${event.startBar}.${event.startBeatInBar}`, parsed.rootPitchClass);
          }
          byFile.set(`${corpus.name}:${scenario.scenarioId}_${variant.variant}`, roots);
        }
      }
    } catch { /* not generated locally */ }
  }
  try {
    const manifest = JSON.parse(
      await readFile(resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json"), "utf8"),
    ) as {
      files: Array<{
        caseId: string;
        chordTimeline?: Array<{ barNumber: number; beatInBar: number; chordSymbol?: { root: number } }>;
      }>;
    };
    for (const entry of manifest.files) {
      const roots = new Map<string, number>();
      for (const event of entry.chordTimeline ?? []) {
        if (event.chordSymbol === undefined) continue;
        roots.set(`${event.barNumber}.${event.beatInBar + 1}`, ((event.chordSymbol.root % 12) + 12) % 12);
      }
      byFile.set(`chord-drip:${entry.caseId}`, roots);
    }
  } catch { /* not available */ }
  return byFile;
}
interface Tally {
  windows: number;
  goldWindows: number;
  overrides: number;
  overridesWithGold: number;
  wrongToCorrect: number;
  correctToWrong: number;
  wrongToWrong: number;
  correctToCorrect: number;
  abstained: number;
  correctionCostProduct: number;
  correctionCostF2R: number;
}
const empty = (): Tally => ({
  windows: 0, goldWindows: 0, overrides: 0, overridesWithGold: 0,
  wrongToCorrect: 0, correctToWrong: 0, wrongToWrong: 0, correctToCorrect: 0,
  abstained: 0, correctionCostProduct: 0, correctionCostF2R: 0,
});
const overall = empty();
const subsets: Record<string, Tally> = {};
const caseKinds: Record<string, Tally> = {};
const abstentionReasons: Record<string, number> = {};
const gold = await goldRoots();
const corpus = await stageFCorpus(extraFiles);
const overrideSamples: Array<Record<string, unknown>> = [];
/**
 * How far apart the incumbent and the alternative actually are.
 *
 * Recorded as an observation, not used to move anything. The pre-registered
 * `contestBand` was derived from the published rootMargin distribution, which is
 * the gap between the shadow's own first and second candidate — a different
 * quantity from the gap between the *product's* root and the shadow's
 * alternative. Publishing the right distribution is what a future stage would
 * pre-register against; retuning against it here would be the Gold-fitting the
 * contract forbids.
 */
const contestGaps: number[] = [];
/** Windows stopped only by condition 1, so the band's cost is visible. */
let blockedOnlyByContest = 0;
for (const entry of corpus) {
  const observed = await observeFile(entry.source, entry.path, mode);
  const proposals = proposeRootCorrections(
    observed.windows.map((window) => ({
      observation: window,
      productRoot: window.currentRoot,
    })),
  );
  const goldForFile = gold.get(entry.source);
  observed.windows.forEach((window, index) => {
    const proposal = proposals[index];
    const buckets: Tally[] = [overall];
    for (const subset of entry.subsets) {
      subsets[subset] ??= empty();
      buckets.push(subsets[subset]);
    }
    if (proposal.caseKind) {
      caseKinds[proposal.caseKind] ??= empty();
      buckets.push(caseKinds[proposal.caseKind]);
    }
    if (proposal.abstentionReason) {
      abstentionReasons[proposal.abstentionReason] =
        (abstentionReasons[proposal.abstentionReason] ?? 0) + 1;
      if (proposal.abstentionReason === "not-contested") {
        blockedOnlyByContest += 1;
        contestGaps.push(proposal.contestGap);
      }
    } else if (!proposal.abstained) {
      contestGaps.push(proposal.contestGap);
    }
    const goldRoot = goldForFile?.get(`${window.bar}.${window.beat}`);
    const productRoot = window.currentRoot;
    const finalRoot = correctedRoot(proposal);
    const overrode = !proposal.abstained && proposal.proposedRoot !== null;
    for (const bucket of buckets) {
      bucket.windows += 1;
      if (proposal.abstained) bucket.abstained += 1;
      if (overrode) bucket.overrides += 1;
      if (goldRoot === undefined) continue;
      bucket.goldWindows += 1;
      const productRight = productRoot === goldRoot;
      const finalRight = finalRoot === goldRoot;
      if (!productRight) bucket.correctionCostProduct += 1;
      if (!finalRight) bucket.correctionCostF2R += 1;
      if (overrode) {
        bucket.overridesWithGold += 1;
        if (!productRight && finalRight) bucket.wrongToCorrect += 1;
        else if (productRight && !finalRight) bucket.correctToWrong += 1;
        else if (!productRight && !finalRight) bucket.wrongToWrong += 1;
        else bucket.correctToCorrect += 1;
      }
    }
    if (overrode && overrideSamples.length < 60) {
      overrideSamples.push({
        source: entry.source,
        bar: window.bar,
        beat: window.beat,
        caseKind: proposal.caseKind,
        productRoot: productRoot ?? null,
        proposedRoot: proposal.proposedRoot,
        goldRoot: goldRoot ?? null,
        outcome: goldRoot === undefined
          ? "no-gold"
          : (productRoot === goldRoot
            ? (finalRoot === goldRoot ? "correct-to-correct" : "correct-to-wrong")
            : (finalRoot === goldRoot ? "wrong-to-correct" : "wrong-to-wrong")),
        contestGap: proposal.contestGap,
        relationMargin: proposal.relationMargin,
      });
    }
  });
}
const rate = (numerator: number, denominator: number) => (denominator === 0
  ? null
  : Number((numerator / denominator).toFixed(6)));
const summarise = (tally: Tally) => ({
  windows: tally.windows,
  goldWindows: tally.goldWindows,
  overrideCount: tally.overrides,
  overrideRate: rate(tally.overrides, tally.windows),
  abstentionRate: rate(tally.abstained, tally.windows),
  overridesWithGold: tally.overridesWithGold,
  // Precision counts an override as correct only when it lands on the gold root.
  // A "wrong to differently wrong" override is not a partial success.
  overridePrecision: rate(
    tally.wrongToCorrect + tally.correctToCorrect, tally.overridesWithGold,
  ),
  wrongToCorrect: tally.wrongToCorrect,
  correctToWrong: tally.correctToWrong,
  wrongToWrong: tally.wrongToWrong,
  correctToCorrect: tally.correctToCorrect,
  netCorrectionGain: tally.wrongToCorrect - tally.correctToWrong,
  correctionCostProduct: tally.correctionCostProduct,
  correctionCostF2R: tally.correctionCostF2R,
  correctionCostDelta: tally.correctionCostF2R - tally.correctionCostProduct,
});
const plainTriadOverrides = subsets["plain-triad"]?.overrides ?? 0;
const gates = [
  {
    id: "plain-triad-never-touched",
    verdict: plainTriadOverrides === 0 ? "pass" : "fail",
    detail: `${plainTriadOverrides} overrides on plain triads`,
  },
  {
    id: "walking-never-touched",
    verdict: (caseKinds["walking"] === undefined) ? "pass" : "fail",
    detail: "walking is Stage F2W and out of scope here",
  },
  {
    id: "net-correction-gain-positive",
    verdict: summarise(overall).netCorrectionGain > 0
      ? "pass"
      : (summarise(overall).netCorrectionGain === 0 ? "neutral" : "fail"),
    detail: `${summarise(overall).netCorrectionGain} net`,
  },
];
const report = {
  schemaVersion: 1,
  stage: "Stage F2R (shadow)",
  contract: "docs/stage-f/03-f2r-preregistered-thresholds.json",
  thresholds: preregisteredThresholds,
  mode,
  connectedToProduct: false,
  files: corpus.length,
  gates,
  overall: summarise(overall),
  byCaseKind: Object.fromEntries(
    Object.entries(caseKinds).sort().map(([name, tally]) => [name, summarise(tally)]),
  ),
  subsets: Object.fromEntries(
    Object.entries(subsets).sort().map(([name, tally]) => [name, summarise(tally)]),
  ),
  abstentionReasons,
  contestGapObservation: {
    note: "Observation only. No threshold was changed after seeing this.",
    windowsReachingTheContestCheck: contestGaps.length,
    blockedOnlyByContest,
    preRegisteredBand: preregisteredThresholds.contestBand,
    percentiles: (() => {
      if (contestGaps.length === 0) return null;
      const sorted = [...contestGaps].sort((left, right) => left - right);
      const at = (fraction: number) => Number(
        sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))].toFixed(6),
      );
      return { p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9) };
    })(),
  },
  overrideSamples,
};
await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
const line = (name: string, value: ReturnType<typeof summarise>) => stdout.write(
  `  ${name.padEnd(18)} win ${String(value.windows).padStart(5)}`
  + `  override ${String(value.overrideCount).padStart(4)}`
  + `  W→C ${String(value.wrongToCorrect).padStart(4)}`
  + `  C→W ${String(value.correctToWrong).padStart(4)}`
  + `  net ${String(value.netCorrectionGain).padStart(5)}`
  + `  prec ${value.overridePrecision === null ? "  -  " : (100 * value.overridePrecision).toFixed(1).padStart(5)}%`
  + `  abstain ${value.abstentionRate === null ? "-" : (100 * value.abstentionRate).toFixed(1).padStart(5)}%\n`,
);
stdout.write(`Stage F2R selective root correction  (${corpus.length} files)\n\n`);
for (const gate of gates) {
  const mark = gate.verdict === "pass" ? "PASS" : (gate.verdict === "fail" ? "FAIL" : "----");
  stdout.write(`${mark}  ${gate.id.padEnd(30)} ${gate.detail}\n`);
}
stdout.write("\noverall\n");
line("all", report.overall);
stdout.write("\nby case kind\n");
for (const [name, value] of Object.entries(report.byCaseKind)) line(name, value);
stdout.write("\nby subset\n");
for (const [name, value] of Object.entries(report.subsets)) line(name, value);
stdout.write("\nabstention reasons\n");
for (const [name, value] of Object.entries(abstentionReasons).sort((a, b) => b[1] - a[1])) {
  stdout.write(`  ${name.padEnd(36)} ${String(value).padStart(6)}\n`);
}
