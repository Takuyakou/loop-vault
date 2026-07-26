import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { readFile } from "node:fs/promises";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";
import { observeFile, stageFCorpus } from "./shadowCorpus";

/**
 * Stage F1: compute the evidence, change nothing.
 *
 * Two things are recorded side by side. The distributions say what the material
 * actually contains — how often the bass is a pedal, how often a quality is
 * undetermined rather than denied. The ledger says where the shadow root
 * disagrees with the product's, which is the list a later stage would have to
 * be right about to be worth shipping.
 *
 * The product is also run twice per file and compared to itself, so "the
 * timeline did not change" is measured rather than asserted from the fact that
 * nothing was wired in.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const mode = (optionValue("--mode") ?? "phase4-v1") as MidiAnalyzerMode;
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/stage-f/01-shadow-diagnostics.json");
const extraFiles = argv.flatMap((value, index) => (
  value === "--file" && argv[index + 1]
    ? [{ source: `${optionValue("--label") ?? "private"}:${index}`, path: argv[index + 1] }]
    : []
));

const corpus = await stageFCorpus(extraFiles);

interface Tally { [key: string]: number }

const bump = (tally: Tally, key: string, by = 1) => { tally[key] = (tally[key] ?? 0) + by; };

const relationTally: Tally = {};
const ambiguityTally: Tally = {};
const triadVerdictTally: Tally = {};
const seventhVerdictTally: Tally = {};
const subsetTally: Record<string, { windows: number; rootDiffers: number; rootless: number }> = {};

let windows = 0;
let rootDiffers = 0;
let rootMissingFromProduct = 0;
const bassMargins: number[] = [];
const rootMargins: number[] = [];
const bassEvidenceAmounts: number[] = [];
const runtimes: number[] = [];
const ledger: Array<{
  source: string; bar: number; beat: number;
  currentLabel: string; currentRoot: number | null;
  shadowTop1: number; shadowTop3: number[]; margin: number;
  relation: string; ambiguities: string[];
}> = [];

let timelineStable = 0;
let candidatesStable = 0;
let warningsStable = 0;

for (const entry of corpus) {
  const observed = await observeFile(entry.source, entry.path, mode);
  runtimes.push(observed.runtimeMs);

  // Determinism of the product itself, measured rather than assumed.
  const bytes = new Uint8Array(await readFile(entry.path));
  const first = analyzeMidi(bytes, { mode });
  const second = analyzeMidi(bytes, { mode });
  const timelineOf = (result: typeof first) => JSON.stringify(
    result.fullTimeline.map((item) => [item.bar, item.beat, item.durationBeats, item.chord.label]),
  );
  if (timelineOf(first) === timelineOf(second)) timelineStable += 1;
  if (JSON.stringify(first.blockCandidates.map((c) => c.id))
    === JSON.stringify(second.blockCandidates.map((c) => c.id))) candidatesStable += 1;
  if (JSON.stringify(first.fullTimeline.map((item) => item.warnings))
    === JSON.stringify(second.fullTimeline.map((item) => item.warnings))) warningsStable += 1;

  for (const subset of entry.subsets) {
    subsetTally[subset] ??= { windows: 0, rootDiffers: 0, rootless: 0 };
  }

  observed.diagnostics.forEach((shadow, index) => {
    const window = observed.windows[index];
    windows += 1;
    bump(relationTally, shadow.relation.relation);
    for (const ambiguity of shadow.ambiguities) bump(ambiguityTally, ambiguity);
    for (const [triad, verdict] of Object.entries(shadow.definingTones.triad)) {
      bump(triadVerdictTally, `${triad}:${verdict}`);
    }
    for (const [seventh, verdict] of Object.entries(shadow.definingTones.seventh)) {
      bump(seventhVerdictTally, `${seventh}:${verdict}`);
    }
    bassMargins.push(shadow.bass.margin);
    rootMargins.push(shadow.root.margin);
    bassEvidenceAmounts.push(shadow.bass.evidenceAmount);

    const shadowTop1 = shadow.root.top3[0]?.pitchClass ?? -1;
    const differs = window.currentRoot !== undefined && window.currentRoot !== shadowTop1;
    if (differs) rootDiffers += 1;
    if (window.currentRoot === undefined) rootMissingFromProduct += 1;

    for (const subset of entry.subsets) {
      subsetTally[subset].windows += 1;
      if (differs) subsetTally[subset].rootDiffers += 1;
      if (shadow.root.rootlessInferred) subsetTally[subset].rootless += 1;
    }

    // Only the disagreements go in the ledger, capped, and with no file paths.
    if (differs && ledger.length < 400) {
      ledger.push({
        source: entry.source,
        bar: window.bar,
        beat: window.beat,
        currentLabel: window.currentLabel,
        currentRoot: window.currentRoot ?? null,
        shadowTop1,
        shadowTop3: shadow.root.top3.map((candidate) => candidate.pitchClass),
        margin: shadow.root.margin,
        relation: shadow.relation.relation,
        ambiguities: shadow.ambiguities,
      });
    }
  });
}

const stats = (values: number[]) => (values.length === 0 ? null : {
  min: Number(Math.min(...values).toFixed(6)),
  mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)),
  max: Number(Math.max(...values).toFixed(6)),
});

const shadowTop3Contains = ledger.filter(
  (row) => row.currentRoot !== null && row.shadowTop3.includes(row.currentRoot),
).length;

const gates = [
  {
    id: "product-timeline-unchanged",
    verdict: timelineStable === corpus.length ? "pass" : "fail",
    detail: `${timelineStable}/${corpus.length}`,
  },
  {
    id: "candidate-rank-unchanged",
    verdict: candidatesStable === corpus.length ? "pass" : "fail",
    detail: `${candidatesStable}/${corpus.length}`,
  },
  {
    id: "warnings-unchanged",
    verdict: warningsStable === corpus.length ? "pass" : "fail",
    detail: `${warningsStable}/${corpus.length}`,
  },
];

const report = {
  schemaVersion: 1,
  stage: "Stage F1",
  mode,
  connectedToProduct: false,
  files: corpus.length,
  windows,
  gates,
  verdict: gates.some((gate) => gate.verdict === "fail") ? "FAIL" : "PASS",
  distributions: {
    relation: relationTally,
    ambiguity: ambiguityTally,
    triadVerdict: triadVerdictTally,
    seventhVerdict: seventhVerdictTally,
  },
  evidence: {
    bassMargin: stats(bassMargins),
    rootMargin: stats(rootMargins),
    bassEvidenceAmount: stats(bassEvidenceAmounts),
  },
  rootLedger: {
    windowsWithProductRoot: windows - rootMissingFromProduct,
    differs: rootDiffers,
    agreementRate: Number(((windows - rootMissingFromProduct - rootDiffers)
      / Math.max(1, windows - rootMissingFromProduct)).toFixed(6)),
    productRootInShadowTop3AmongDisagreements: shadowTop3Contains,
    sample: ledger.slice(0, 80),
  },
  subsets: subsetTally,
  runtimeMs: stats(runtimes),
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`Stage F1 shadow diagnostics: ${report.verdict}\n`);
stdout.write(`${corpus.length} files, ${windows} windows\n\n`);
for (const gate of gates) {
  stdout.write(`${gate.verdict === "pass" ? "PASS" : "FAIL"}  ${gate.id.padEnd(28)} ${gate.detail}\n`);
}
stdout.write("\nbass-upper relation\n");
for (const [key, value] of Object.entries(relationTally).sort((a, b) => b[1] - a[1])) {
  stdout.write(`  ${key.padEnd(10)} ${String(value).padStart(6)}  ${(100 * value / windows).toFixed(1)}%\n`);
}
stdout.write("\nambiguity\n");
for (const [key, value] of Object.entries(ambiguityTally).sort((a, b) => b[1] - a[1])) {
  stdout.write(`  ${key.padEnd(26)} ${String(value).padStart(6)}  ${(100 * value / windows).toFixed(1)}%\n`);
}
stdout.write("\ntriad verdicts (major/minor only)\n");
for (const key of ["major:supported", "major:contradicted", "major:underdetermined",
  "minor:supported", "minor:contradicted", "minor:underdetermined"]) {
  const value = triadVerdictTally[key] ?? 0;
  stdout.write(`  ${key.padEnd(26)} ${String(value).padStart(6)}  ${(100 * value / windows).toFixed(1)}%\n`);
}
stdout.write("\nseventh verdicts\n");
for (const key of Object.keys(seventhVerdictTally).sort()) {
  const value = seventhVerdictTally[key];
  stdout.write(`  ${key.padEnd(26)} ${String(value).padStart(6)}  ${(100 * value / windows).toFixed(1)}%\n`);
}
stdout.write(
  `\nroot ledger: ${report.rootLedger.differs} disagreements`
  + ` of ${report.rootLedger.windowsWithProductRoot} windows`
  + ` (agreement ${(100 * report.rootLedger.agreementRate).toFixed(1)}%)\n`,
);
stdout.write("\nsubsets\n");
for (const [name, value] of Object.entries(subsetTally).sort()) {
  stdout.write(
    `  ${name.padEnd(18)} windows ${String(value.windows).padStart(6)}`
    + `  root differs ${String(value.rootDiffers).padStart(5)}`
    + ` (${(100 * value.rootDiffers / Math.max(1, value.windows)).toFixed(1)}%)`
    + `  rootless ${String(value.rootless).padStart(5)}\n`,
  );
}
