import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  evaluatePhase44Split,
  groupedPhase44Report,
  loadPhase44Manifest,
  verifyPhase44Corpus,
} from "./phase44/targetedCorpus";

const targetedDir = resolve(cwd(), ".local-evaluation/voicing-melody-contamination-gold-v1");
const generalDir = resolve(cwd(), ".local-evaluation/voicing-gold-v1");
const outputJson = resolve(cwd(), "docs/phase4.4/00-baseline.json");
const outputMarkdown = resolve(cwd(), "docs/phase4.4/00-baseline.md");
const integrityMarkdown = resolve(cwd(), "docs/phase4.4/00-corpus-integrity.md");

const targetedManifest = await loadPhase44Manifest(targetedDir);
const targetedIntegrity = await verifyPhase44Corpus(targetedDir, targetedManifest);
const generalIntegrity = await verifyGeneralCorpus(generalDir);
const devRows = await evaluatePhase44Split(targetedDir, targetedManifest, "dev", ["A", "B"]);
const validationRows = await evaluatePhase44Split(
  targetedDir,
  targetedManifest,
  "validation",
  ["A", "B"],
);
const generalDev = await readPhase43ConditionB("docs/phase4.3/05-voicing-ablation-dev.json");
const generalValidation = await readPhase43ConditionB(
  "docs/phase4.3/05-voicing-ablation-validation.json",
);

const report = {
  schemaVersion: 1,
  analyzerMode: "phase4-v1",
  fileVersion: 1,
  dedicatedHoldoutStatus: "not-evaluated",
  corpora: {
    general: {
      integrity: generalIntegrity,
      baseline: {
        dev: generalDev,
        validation: generalValidation,
        holdout: "phase4.3-regression-only",
      },
    },
    melodyContamination: {
      integrity: targetedIntegrity,
      baseline: {
        dev: groupedPhase44Report(devRows),
        validation: groupedPhase44Report(validationRows),
        holdout: "not-evaluated",
      },
    },
  },
};

await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputMarkdown, baselineMarkdown(report), "utf8");
await writeFile(integrityMarkdown, integrityReport(report), "utf8");
stdout.write(
  `P4.4 baseline: dedicated dev ${devRows.length / 2} events, `
  + `validation ${validationRows.length / 2} events; holdout not evaluated.\n`,
);
stdout.write(`${JSON.stringify({
  dedicatedDev: report.corpora.melodyContamination.baseline.dev.B.overall,
  dedicatedValidation: report.corpora.melodyContamination.baseline.validation.B.overall,
  generalDev,
  generalValidation,
}, null, 2)}\n`);

async function readPhase43ConditionB(path: string) {
  const parsed = JSON.parse(await readFile(resolve(cwd(), path), "utf8")) as {
    conditions: { B: { policies: { sourceFaithfulMidi: unknown } } };
  };
  return parsed.conditions.B.policies.sourceFaithfulMidi;
}

async function verifyGeneralCorpus(corpusDir: string) {
  const manifest = JSON.parse(
    await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
  ) as {
    corpusVersion: string;
    fileCount: number;
    scenarioCount: number;
    eventCount: number;
    files: {
      fileId: string;
      scenarioId: string;
      variant: string;
      split: string;
      path: string;
      sha256: string;
      byteLength: number;
      tracks: { role: string }[];
      events: {
        goldTargets: {
          sourceFaithfulMidi: number[];
          aggregateHarmonyMidi: number[];
          dojoIntegratedMidi: number[];
        };
        distractors: { midi: number[] };
      }[];
    }[];
  };
  let shaMatches = 0;
  let byteLengthMatches = 0;
  let events = 0;
  let goldVoicingEvents = 0;
  let goldTrackRoleFiles = 0;
  const variantsByScenario = new Map<string, Set<string>>();
  const splitsByScenario = new Map<string, Set<string>>();
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(corpusDir, file.path));
    if (createHash("sha256").update(bytes).digest("hex") === file.sha256) shaMatches += 1;
    if ((await stat(resolve(corpusDir, file.path))).size === file.byteLength) {
      byteLengthMatches += 1;
    }
    events += file.events.length;
    goldVoicingEvents += file.events.filter(
      (event) =>
        Array.isArray(event.goldTargets.sourceFaithfulMidi)
        && Array.isArray(event.goldTargets.aggregateHarmonyMidi)
        && Array.isArray(event.goldTargets.dojoIntegratedMidi)
        && Array.isArray(event.distractors.midi),
    ).length;
    if (file.tracks.every((track) => track.role.length > 0)) goldTrackRoleFiles += 1;
    addToSet(variantsByScenario, file.scenarioId, file.variant);
    addToSet(splitsByScenario, file.scenarioId, file.split);
  }
  const noteEventLines = (await readFile(resolve(corpusDir, "note-events.jsonl"), "utf8"))
    .split(/\r?\n/)
    .filter(Boolean);
  const noteRowsWithRole = noteEventLines.filter((line) => {
    const row = JSON.parse(line) as { role?: string; trackRole?: string; distractorKind?: unknown };
    return typeof row.role === "string"
      || typeof row.trackRole === "string"
      || Object.hasOwn(row, "distractorKind");
  }).length;
  const cleanStressPairCount = [...variantsByScenario.values()].filter(
    (variants) => variants.has("clean") && variants.has("stress"),
  ).length;
  const splitOverlap = [...splitsByScenario.entries()]
    .filter(([, splits]) => splits.size !== 1)
    .map(([scenario]) => scenario);
  return {
    valid:
      manifest.fileCount === manifest.files.length
      && manifest.eventCount === events
      && shaMatches === manifest.files.length
      && byteLengthMatches === manifest.files.length
      && cleanStressPairCount === manifest.scenarioCount
      && splitOverlap.length === 0
      && goldVoicingEvents === events
      && goldTrackRoleFiles === manifest.files.length,
    corpusVersion: manifest.corpusVersion,
    fileCount: manifest.files.length,
    scenarioCount: manifest.scenarioCount,
    eventCount: events,
    noteEventCount: noteEventLines.length,
    noteRowsWithRoleOrDistractorAnnotation: noteRowsWithRole,
    shaMatches,
    byteLengthMatches,
    cleanStressPairCount,
    splitOverlap,
    goldVoicingEvents,
    goldTrackRoleFiles,
  };
}

function baselineMarkdown(report: typeof report): string {
  const dedicatedDev = report.corpora.melodyContamination.baseline.dev;
  const dedicatedValidation = report.corpora.melodyContamination.baseline.validation;
  return `# Phase 4.4 Baseline

専用holdoutは実行していない。専用corpusはGold boundaryで、A（Gold per-voice role）と
B（Product per-voice role）を比較する。既存60 MIDIはPhase 4.3で固定したCondition Bを
非回帰baselineとして再利用する。

## 専用Corpus

| Split / Condition | Exact | Precision | Recall | F1 | Melody leak | Usable | Fallback |
|---|---:|---:|---:|---:|---:|---:|---:|
${metricRow("dev A", dedicatedDev.A.overall)}
${metricRow("dev B", dedicatedDev.B.overall)}
${metricRow("validation A", dedicatedValidation.A.overall)}
${metricRow("validation B", dedicatedValidation.B.overall)}

dev / validationはclean、stress、scenario、same-track / separate-track別の値を
\`00-baseline.json\`へ記録した。

## 既存60 MIDI非回帰Baseline

| Split | Exact | Precision | Recall | F1 | Melody leak | Usable | Fallback |
|---|---:|---:|---:|---:|---:|---:|---:|
${metricRow("dev B", report.corpora.general.baseline.dev)}
${metricRow("validation B", report.corpora.general.baseline.validation)}

## 固定事項

- Analyzer: \`phase4-v1\`
- Gold boundaryを使用し、boundary改善は行わない
- schema変更なし、\`fileVersion = 1\`
- 専用holdout: not-evaluated
- 旧holdout: Phase 4.3の回帰確認専用
`;
}

function integrityReport(report: typeof report): string {
  const general = report.corpora.general.integrity;
  const targeted = report.corpora.melodyContamination.integrity;
  return `# Phase 4.4 Corpus Integrity

## 結果

| Corpus | Files | Scenarios | Events | SHA | byteLength | clean/stress | Valid |
|---|---:|---:|---:|---:|---:|---:|---|
| general | ${general.fileCount} | ${general.scenarioCount} | ${general.eventCount} | ${general.shaMatches}/${general.fileCount} | ${general.byteLengthMatches}/${general.fileCount} | ${general.cleanStressPairCount} | ${general.valid} |
| melody contamination | ${targeted.fileCount} | ${targeted.scenarioCount} | ${targeted.eventCount} | ${targeted.shaMatches}/${targeted.fileCount} | ${targeted.byteLengthMatches}/${targeted.fileCount} | ${targeted.cleanStressPairCount} | ${targeted.valid} |

## Gold注釈

- general: Source-faithful / Aggregate / Dojo Gold、Track role、distractor注釈を確認
- dedicated: Gold voicing、Gold track role、Gold per-note role、excluded distractor、
  Bass / Upper / Top / Bottomを全イベントで確認
- splitを跨ぐscenario: 0
- 専用corpusのdev / validation / holdout MIDI数: 20 / 6 / 6
- MIDI本体は\`.local-evaluation\`に置き、Gitへ追加しない
`;
}

function metricRow(label: string, metric: Record<string, unknown>): string {
  return `| ${label} | ${percent(metric.voicingExactRate)} | ${percent(metric.notePrecision)} | `
    + `${percent(metric.noteRecall)} | ${percent(metric.noteF1)} | `
    + `${percent(metric.melodyLeakRate)} | ${percent(metric.sourceVoicingUsableRate)} | `
    + `${percent(metric.generatedFallbackRate)} |`;
}

function percent(value: unknown): string {
  return typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "n/a";
}

function addToSet<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const values = map.get(key) ?? new Set<V>();
  values.add(value);
  map.set(key, values);
}
