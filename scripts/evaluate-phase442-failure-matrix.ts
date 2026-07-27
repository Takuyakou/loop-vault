import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  loadHarmonySupportManifest,
} from "./phase442/harmonySupportCorpus";
import {
  evaluateSupportSplit,
  groupedSupportRows,
} from "./phase442/supportEvaluation";

const corpusDir = resolve(
  cwd(),
  "test/loop-vault-voicing-harmony-support-gold-v1",
);
const outputJson = resolve(cwd(), "docs/phase4.4.2/01-failure-matrix.json");
const outputMarkdown = resolve(cwd(), "docs/phase4.4.2/01-failure-matrix.md");
const manifest = await loadHarmonySupportManifest(corpusDir);
const rows = await evaluateSupportSplit(corpusDir, manifest, "dev");
const report = {
  schemaVersion: 1,
  phase: "4.4.2-01",
  split: "dev",
  analyzerMode: "phase4-v1",
  fileVersion: 1,
  productPathChanged: false,
  validationStatus: "not-run",
  holdoutStatus: "not-run",
  categories: categoryCounts(rows),
  metrics: groupedSupportRows(rows),
  events: rows,
};

await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputMarkdown, markdown(report), "utf8");
stdout.write("P4.4.2-01 dev failure matrix: PASS\n");
stdout.write(`${JSON.stringify({
  categories: report.categories,
  subset: report.metrics.bySubset,
}, null, 2)}\n`);

function categoryCounts(input: typeof rows) {
  const categories = {
    "support-count-0": 0,
    "support-count-1": 0,
    "support-count-2": 0,
    "support-count-3": 0,
    "support-count-4-plus": 0,
    "support-duration-too-short": 0,
    "role-is-bass": 0,
    "no-harmony-voice": 0,
    "status-only-change": 0,
    "pitch-fidelity-change": 0,
  };
  for (const row of input) {
    const count = row.evidence.supportPitchCount;
    if (count === 0) categories["support-count-0"] += 1;
    else if (count === 1) categories["support-count-1"] += 1;
    else if (count === 2) categories["support-count-2"] += 1;
    else if (count === 3) categories["support-count-3"] += 1;
    else categories["support-count-4-plus"] += 1;
    if (row.evidence.baselineFilterRejectionReasons.includes("support-duration-too-short")) {
      categories["support-duration-too-short"] += 1;
    }
    if (row.evidence.productRole === "bass") categories["role-is-bass"] += 1;
    if (!row.evidence.hasHarmonyVoice) categories["no-harmony-voice"] += 1;
    if (row.statusOnlyChanged) categories["status-only-change"] += 1;
    if (row.pitchFidelityChanged) categories["pitch-fidelity-change"] += 1;
  }
  return categories;
}

function markdown(matrix: typeof report): string {
  const categoryRows = Object.entries(matrix.categories)
    .map(([name, value]) => `| ${name} | ${value} |`)
    .join("\n");
  const subsetRows = Object.entries(matrix.metrics.bySubset)
    .map(([name, metric]) =>
      `| ${name} | ${metric.events} | ${metric.contaminationEventCount} | `
      + `${percent(metric.melodyLeakRate)} | ${percent(metric.voicingExactRate)} | `
      + `${percent(metric.noteRecall)} | ${percent(metric.sourceVoicingUsableRate)} | `
      + `${percent(metric.filterTriggerRate)} |`)
    .join("\n");
  return `# P4.4.2-01 Dev Failure Matrix

- split: dev only
- Validation / Holdout: 未実行
- Product role推論だけでPrimary / Diagnostic-onlyを分離
- Gold roleは評価分類にだけ使用し、filter判定へ渡していない

## Failure categories

| Category | Events |
|---|---:|
${categoryRows}

## Subset

| Subset | Events | Contamination | Leak | Exact | Recall | Usable | Filter trigger |
|---|---:|---:|---:|---:|---:|---:|---:|
${subsetRows}

各eventのProduct role / confidence、support pitch count、duration、mass、rejection reasons、noteInstanceId、input/final pitch set、selected sourceVoicing、statusはJSONへ保存した。

Bass誤分類とsupport count 0はDiagnostic-onlyであり、P4.4.2の改善Gateへ含めない。
`;
}

function percent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
}
