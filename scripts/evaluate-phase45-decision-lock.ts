import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { decidePhase45 } from "./phase45/decisionLock";

interface D1 {
  rank3: { rate: number };
}

interface D2 {
  metrics: {
    rawCandidateRecall: number;
    canonicalCandidateRecall: number;
    eligibleCandidateRecall: number;
    sameRootCandidateRecall: number;
    sameRootGoldMeanRank: number | null;
  };
}

interface D3 {
  metrics: {
    allocationEditableShare: number;
    ambiguousOrAnnotationShare: number;
  };
}

interface D4 {
  metrics: {
    oracleSameRootGain: number;
    netRescueCount: number;
    lostRootToGainedRatio: number | null;
    correctionCostMeanDelta: number;
    manualInputRequiredDelta: number;
    rank1ChangeCount: number;
  };
}

interface D5 {
  highConfidenceBandExists: boolean;
}

const [d1, d2, d3, d4, d5] = await Promise.all([
  readJson<D1>("docs/phase4.5/01-rank-distribution.json"),
  readJson<D2>("docs/phase4.5/02-candidate-recall-funnel.json"),
  readJson<D3>("docs/phase4.5/03-top3-miss-taxonomy.json"),
  readJson<D4>("docs/phase4.5/04-same-root-oracle.json"),
  readJson<D5>("docs/phase4.5/05-root-confidence-calibration.json"),
]);
const result = decidePhase45({
  rank3Rate: d1.rank3.rate,
  rawCandidateRecall: d2.metrics.rawCandidateRecall,
  canonicalCandidateRecall: d2.metrics.canonicalCandidateRecall,
  eligibleCandidateRecall: d2.metrics.eligibleCandidateRecall,
  sameRootCandidateRecall: d2.metrics.sameRootCandidateRecall,
  sameRootMeanRank: d2.metrics.sameRootGoldMeanRank,
  allocationEditableShare: d3.metrics.allocationEditableShare,
  ambiguousOrAnnotationShare: d3.metrics.ambiguousOrAnnotationShare,
  oracleGain: d4.metrics.oracleSameRootGain,
  netRescueCount: d4.metrics.netRescueCount,
  lostRootToGainedRatio: d4.metrics.lostRootToGainedRatio,
  correctionCostMeanDelta: d4.metrics.correctionCostMeanDelta,
  manualInputRequiredDelta: d4.metrics.manualInputRequiredDelta,
  highConfidenceBandExists: d5.highConfidenceBandExists,
  rank1ChangeCount: d4.metrics.rank1ChangeCount,
});
const report = {
  schemaVersion: 1,
  phase: "4.5-06",
  decidedAt: "preregistered-D1-D5-completion",
  ...result,
  nextAction: result.decision === "B-candidate-generation"
    ? "Close Phase 4.5 as diagnostic-complete and open a separate Candidate Generation phase."
    : result.decision === "A-allocation"
      ? "Proceed to P4.5-07 allocation shadow."
      : "Stop automatic label research until correction-log evidence accumulates.",
  stages: {
    allocationShadow07: result.allocationAllowed ? "eligible" : "not-run",
    devLoso08: "not-run",
    validation09: "not-run",
    holdout10: "not-run",
  },
  invariants: {
    productAllocationChanged: false,
    rank1Changed: false,
    analyzerChanged: false,
    schemaChanged: false,
    fileVersionChanged: false,
  },
};

await writeFile(
  resolve(cwd(), "docs/phase4.5/06-decision-lock.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(cwd(), "docs/phase4.5/06-decision-lock.md"),
  `# Phase 4.5-06 Decision Lock

## Decision

**B. Candidate Generationへ仕切り直し**

Allocation Shadowには進まない。Phase 4.5は診断完了として閉じ、候補生成を別Phaseで扱う。

## D1-D5 evidence

| Condition | Value | Frozen gate | Result |
|---|---:|---:|---|
${Object.entries(result.evidence).map(([name, evidence]) =>
    `| ${name} | ${format(evidence.value)} | ${evidence.gate} | ${evidence.pass ? "PASS" : "FAIL"} |`)
  .join("\n")}

## Why B

- raw / canonical / eligible / same-root candidate recallはすべて78.75%で、90% Gate未達。
- Top-3 missのうちallocation編集可能なのは26/94件（27.66%）で、50% Gate未達。
- Same-root Oracleは+2.5ppに留まり、root rescueを11件失い、net rescueは-3件。
- 全Gateを満たすhigh-confidence root帯は存在しない。
- ambiguous / annotation issueは0件のため、根拠不足による研究停止Cではなく、候補生成不足Bと判断する。

## Stop conditions applied

- P4.5-07 Allocation Shadow: 未実行
- P4.5-08 Dev / LOSO: 未実行
- P4.5-09 Validation: 未実行
- P4.5-10 Holdout: 未実行
- Product rank 2-3 allocation: 未変更

rank 1、Analyzer、Timeline、voicing、boundary、aggregate/fallback、schema、fileVersionは変更していない。
`,
  "utf8",
);
stdout.write(`${JSON.stringify(report, null, 2)}\n`);

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(cwd(), path), "utf8")) as T;
}

function format(value: number | boolean | null): string {
  if (typeof value === "number") return value.toFixed(6);
  return String(value);
}
