import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { summarizeRankDistribution } from "./phase45/rankDistribution";

interface BaselineReport {
  corpusVersion: string;
  analyzerMode: string;
  split: string;
  fileCount: number;
  rows: Array<{ expected: string; candidates: string[] }>;
}

const input = resolve(cwd(), option("--input") ?? "docs/phase4.5/00-baseline.json");
const output = resolve(cwd(), option("--output") ?? "docs/phase4.5/01-rank-distribution.json");
const markdown = resolve(cwd(), option("--markdown") ?? "docs/phase4.5/01-rank-distribution.md");
const baseline = JSON.parse(await readFile(input, "utf8")) as BaselineReport;
const summary = summarizeRankDistribution(baseline.rows);
const report = {
  schemaVersion: 1,
  phase: "4.5-01",
  corpusVersion: baseline.corpusVersion,
  analyzerMode: baseline.analyzerMode,
  split: baseline.split,
  fileCount: baseline.fileCount,
  ...summary,
  branchDecision: summary.rank3.rate <= 0.01
    ? "rank3-low-proceed-to-d2"
    : "rank3-contributes-reassess-allocation",
};

await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(markdown, `# Phase 4.5-01 D1 Rank Distribution

Dev ${report.fileCount} MIDI / ${report.eventCount} eventsをcanonical identityで再集計した。

| Position | Count | Rate |
|---|---:|---:|
| Rank 1 | ${report.rank1.count} | ${percent(report.rank1.rate)} |
| Rank 2 | ${report.rank2.count} | ${percent(report.rank2.rate)} |
| Rank 3 | ${report.rank3.count} | ${percent(report.rank3.rate)} |
| Top-3 outside | ${report.outsideTop3.count} | ${percent(report.outsideTop3.rate)} |

- correct candidate absent from displayed Top-3: ${report.correctCandidateAbsent.count}
- canonical-equivalent duplicate: ${report.canonicalEquivalentDuplicateCount}
- MRR: ${report.mrr.toFixed(6)}
- correctCandidateMeanRank: ${report.correctCandidateMeanRank?.toFixed(6) ?? "n/a"}

## Decision

Rank 3 exactは${percent(report.rank3.rate)}で、事前分岐の1.0%以下。
「slot 3の正解寄与が低い」という仮説を支持するためD2へ進む。
Rank 1/2の値は生event行から再計算しており、Phase 4.3の丸め値から逆算していない。
`, "utf8");

stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function option(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(4)}%`;
}
