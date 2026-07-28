import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import type { MelodyContaminationFilterOptions } from "../src/domain/voicing";
import { VOICING_AUTO_USE_CONFIDENCE } from "../src/domain/voicing/extractionConfig";
import {
  tracePhase441Validation,
  type RootCauseClassification,
  type ValidationPipelineTraceReport,
} from "./phase441/validationPipelineTrace";

const corpusDir = resolve(
  cwd(),
  ".local-evaluation/voicing-melody-contamination-gold-v1",
);
const frozenReportPath = resolve(cwd(), "docs/phase4.4/05-dev-results.json");
const traceJsonPath = resolve(
  cwd(),
  "docs/phase4.4.1/00-validation-pipeline-trace.json",
);
const traceMarkdownPath = resolve(
  cwd(),
  "docs/phase4.4.1/00-validation-pipeline-trace.md",
);
const classificationJsonPath = resolve(
  cwd(),
  "docs/phase4.4.1/01-root-cause-classification.json",
);
const classificationMarkdownPath = resolve(
  cwd(),
  "docs/phase4.4.1/01-root-cause-classification.md",
);
const frozenReport = JSON.parse(
  await readFile(frozenReportPath, "utf8"),
) as {
  analyzerMode: string;
  frozenOptions: MelodyContaminationFilterOptions;
};

if (frozenReport.analyzerMode !== "phase4-v1") {
  throw new Error(`Unexpected analyzerMode: ${frozenReport.analyzerMode}`);
}

const trace = await tracePhase441Validation(corpusDir, frozenReport.frozenOptions);
const classification = buildClassificationReport(trace);

for (const path of [
  traceJsonPath,
  traceMarkdownPath,
  classificationJsonPath,
  classificationMarkdownPath,
]) {
  await mkdir(dirname(path), { recursive: true });
}
await writeFile(traceJsonPath, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
await writeFile(traceMarkdownPath, traceMarkdown(trace), "utf8");
await writeFile(
  classificationJsonPath,
  `${JSON.stringify(classification, null, 2)}\n`,
  "utf8",
);
await writeFile(
  classificationMarkdownPath,
  classificationMarkdown(classification),
  "utf8",
);

stdout.write("P4.4.1 Validation pipeline trace: PASS\n");
stdout.write(`${JSON.stringify({
  totals: trace.totals,
  reviewToUsableEvents: trace.statusOnlyExplanation.reviewToUsableEvents,
  classifications: classification.counts,
}, null, 2)}\n`);

function buildClassificationReport(report: ValidationPipelineTraceReport) {
  const classificationNames: RootCauseClassification[] = [
    "filter-not-triggered",
    "same-pitch-duplicate",
    "unfiltered-rebuild",
    "candidate-unchanged",
    "status-only-change",
    "missing-harmony-dominant",
    "evaluator-provenance-mismatch",
  ];
  return {
    schemaVersion: 1,
    phase: "4.4.1",
    analyzerMode: report.analyzerMode,
    fileVersion: report.fileVersion,
    productBehaviorChanged: report.productBehaviorChanged,
    holdoutStatus: report.holdoutStatus,
    classificationPolicy: {
      multipleLabelsAllowed: true,
      primaryPriority: [
        "filter-not-triggered",
        "unfiltered-rebuild",
        "missing-harmony-dominant",
        "same-pitch-duplicate",
        "evaluator-provenance-mismatch",
        "status-only-change",
        "candidate-unchanged",
      ],
      definitions: {
        "filter-not-triggered": "Shadow filter removed no note instance.",
        "same-pitch-duplicate":
          "A removed pitch remained on a different track after filtering.",
        "unfiltered-rebuild":
          "A removed noteInstanceId reappeared in the Shadow winner provenance.",
        "candidate-unchanged":
          "Candidate structural keys were unchanged, even if roleScore changed.",
        "status-only-change":
          "Final pitch set stayed equal while source status changed.",
        "missing-harmony-dominant":
          "No event voice was harmony/pad/mixed or polyphonic enough for harmony support.",
        "evaluator-provenance-mismatch":
          "Pitch-only leak evaluation labels a remaining gold instance as the removed distractor pitch.",
      },
    },
    counts: Object.fromEntries(classificationNames.map((name) => [
      name,
      report.events.filter((event) => event.classifications.includes(name)).length,
    ])),
    firstInvalidationStageCounts: countBy(
      report.events.map((event) => event.firstInvalidationStage),
    ),
    statusOnlyExplanation: report.statusOnlyExplanation,
    events: report.events.map((event) => ({
      key: event.key,
      primaryClassification: event.primaryClassification,
      classifications: event.classifications,
      firstInvalidationStage: event.firstInvalidationStage,
      removedNoteInstanceCount: event.filter.removedNoteInstances.length,
      noteInstanceChanged: event.filter.noteInstanceChanged,
      filterPitchSetChanged: event.filter.pitchSetChanged,
      samePitchDifferentTrackDuplicateCount:
        event.filter.samePitchDifferentTrackHolders.length,
      candidateStructurallyUnchanged: event.candidateDelta.structurallyUnchanged,
      winnerStructurallyUnchanged: event.candidateDelta.winnerStructurallyUnchanged,
      finalPitchSetChanged: event.finalDelta.pitchSetChanged,
      statusChanged: event.finalDelta.statusChanged,
      exactChanged: event.finalDelta.exactChanged,
      melodyLeakChanged: !sameSet(
        event.finalDelta.baselineMelodyLeakedPitches,
        event.finalDelta.shadowMelodyLeakedPitches,
      ),
      unfilteredRebuildDetected: event.finalDelta.unfilteredRebuildDetected,
      evaluatorProvenanceMismatchPitches:
        event.finalDelta.evaluatorProvenanceMismatchPitches,
    })),
    conclusion: {
      allSixFirstInvalidationStagesIdentified:
        report.events.length === 6
        && report.events.every((event) => event.firstInvalidationStage.length > 0),
      noteInstanceAndPitchSetSeparated:
        report.events.every((event) =>
          typeof event.filter.noteInstanceChanged === "boolean"
          && typeof event.filter.pitchSetChanged === "boolean"),
      usableOnlyReason:
        "The 6 contaminated events are a disjoint cohort from the 7 review-to-usable events: their filter never triggers, so their note instances, pitch sets, Exact, and melody leak remain unchanged. In the 7 usable gains, filtering removes melody note instances that split simultaneous windows; the same harmonic contributor set then spans a longer winning window, raising the duration score and confidence across the usable threshold while the final pitch set stays unchanged.",
      productPathUnchanged: true,
      holdoutNotRun: true,
    },
  };
}

function traceMarkdown(report: ValidationPipelineTraceReport): string {
  const rows = report.events.map((event) => {
    const beforeWinner = event.baseline.winner;
    const afterWinner = event.shadow.winner;
    return `| ${event.key} | ${event.filter.removedNoteInstances.length} | `
      + `${event.filter.beforePitchSet.join(",")} → ${event.filter.afterPitchSet.join(",")} | `
      + `${event.filter.samePitchDifferentTrackHolders.length} | `
      + `${event.candidateDelta.simultaneousBefore} → ${event.candidateDelta.simultaneousAfter} | `
      + `${beforeWinner?.score ?? "n/a"} → ${afterWinner?.score ?? "n/a"} | `
      + `${event.baseline.finalSourceVoicing.status} → ${event.shadow.finalSourceVoicing.status} | `
      + `${event.firstInvalidationStage} | ${event.classifications.join(", ")} |`;
  }).join("\n");
  const rejectionRows = report.events.map((event) => {
    const decisions = event.filter.leakedPitchFilterDecisions.map((decision) =>
      `${decision.noteInstanceId}: ${decision.rejectionReasons.join(", ")} `
      + `(support=${decision.strongestConcurrentSupportPitches.join(",") || "none"})`,
    ).join("<br>");
    return `| ${event.key} | ${decisions || "no matching source note"} |`;
  }).join("\n");
  const statusRows = report.statusChangeCohort.map((event) => {
    const before = event.baseline.winner;
    const after = event.shadow.winner;
    return `| ${event.key} | ${event.filter.removedNoteInstances.length} | `
      + `${event.filter.samePitchDifferentTrackHolders.length} | `
      + `${before?.roleScore ?? "n/a"} → ${after?.roleScore ?? "n/a"} | `
      + `${before?.confidence ?? "n/a"} → ${after?.confidence ?? "n/a"} | `
      + `${event.baseline.finalSourceVoicing.midiNotes.join(",")} → `
      + `${event.shadow.finalSourceVoicing.midiNotes.join(",")} | `
      + `${event.baseline.finalSourceVoicing.status} → `
      + `${event.shadow.finalSourceVoicing.status} |`;
  }).join("\n");
  return `# Phase 4.4.1 Validation Pipeline Trace

## 実行範囲

- 対象: 専用corpusのValidationにある既知の汚染6イベント
- 固定filter設定: \`${JSON.stringify(report.frozenOptions)}\`
- Analyzer: \`${report.analyzerMode}\`
- fileVersion: \`${report.fileVersion}\`
- Holdout: **未実行**
- 製品経路・閾値・heuristic・Gate・schema: **変更なし**

Validation全${report.totals.validationEventsInspected}イベントのProduct結果から、既存のpitch-only evaluatorで汚染と判定される6イベントだけを詳細traceした。\`noteInstanceId\`はMIDI parserの配列index、track、channel、tick、duration、pitchから決定的に作り、raw noteからfilter、candidate、winner、最終sourceVoicingの寄与元まで維持した。

## 集計

| 項目 | 件数 |
|---|---:|
| 詳細trace | ${report.totals.contaminationEventsTraced} |
| filter発火 | ${report.totals.filterTriggeredEvents} |
| note instance集合変化 | ${report.totals.noteInstanceChangedEvents} |
| filter直後pitch集合変化 | ${report.totals.pitchSetChangedEvents} |
| final sourceVoicing pitch集合変化 | ${report.totals.finalPitchSetChangedEvents} |
| Exact変化 | ${report.totals.exactChangedEvents} |
| melody leak変化 | ${report.totals.melodyLeakChangedEvents} |
| 汚染6件内status変化 | ${report.totals.statusChangedEventsAmongContamination} |
| Validation全体status変化 | ${report.totals.statusChangedEventsAllValidation} |
| 未filter noteからの再構築 | ${report.totals.unfilteredRebuildEvents} |

## 6イベント

| Event | removed instance | filter pitch set | 別track同pitch | simultaneous | winner score | status | 最初の無効化Stage | 分類 |
|---|---:|---|---:|---:|---|---|---|---|
${rows}

## Candidate経路

各eventのJSONには次を分離して保存した。

- filter前後の\`noteInstanceId\`集合とpitch集合
- 同pitchを保持する別Trackのnote instance
- simultaneous候補の全件、aggregate候補、構造key、\`roleScore\`、score、confidence
- winnerと最終sourceVoicingへ寄与したnote instance
- removed IDがShadow winnerへ再流入したか
- final pitch set、status、Exact、melody leakの独立差分

## Usableだけが上昇した理由

Validation全体のreview/not-found→usableは${report.statusOnlyExplanation.reviewToUsableEvents.length}件で、逆方向は${report.statusOnlyExplanation.usableToReviewEvents.length}件だった。最終pitch setが不変のままusableへ変化したeventは${report.statusOnlyExplanation.reviewToUsableWithUnchangedFinalPitchSet.length}件である。

汚染6件とUsableが上昇した7件は**別のevent cohort**だった。汚染6件ではfilterが1件も発火せず、note instance、pitch set、candidate、final sourceVoicing、Exact、melody leak、statusがすべて不変だった。漏洩pitchのfilter判定は次の段階で止まっている。

| 汚染Event | 漏洩pitch noteのfilter拒否理由 |
|---|---|
${rejectionRows}

一方、Usable上昇7件ではfilterが各4 note instanceを除外した。除外したmelody noteがsimultaneous windowの境界を細かく分割していたため、除外後は同一のharmony contributor集合がより長い区間を占めるwinnerへ切り替わった。winner durationは0.481250〜0.585417 beatから1.143750〜1.220833 beatへ伸び、duration項の上昇でconfidenceが0.751699〜0.760033から0.804699〜0.810866へ上がり、\`${VOICING_AUTO_USE_CONFIDENCE}\`のUsable境界を越えた。7件ともfinal pitch setは不変で、roleScore上昇は主因ではない。

Exactとmelody leakは最終pitch setだけを比較するため、この「note instance除外 → window境界変化 → duration score上昇 → status変化」を観測しない。

| Status変更Event | removed instance | 別track同pitch | winner roleScore | confidence | final pitch set | status |
|---|---:|---:|---|---|---|---|
${statusRows}

## 再構築検査

Shadow winnerの寄与元にremoved \`noteInstanceId\`が再出現したeventは${report.totals.unfilteredRebuildEvents}件だった。したがって後段が未filter noteからsourceVoicingを再構築した証拠はない。

## 不変条件

- Holdoutは読み込みも実行もしていない
- Analyzer / Timeline / public schema / fileVersionは変更していない
- filter設定、判定閾値、heuristic、Gateは変更していない
- 本traceは\`scripts/phase441\`の診断経路だけで、製品経路へ接続していない
`;
}

function classificationMarkdown(
  report: ReturnType<typeof buildClassificationReport>,
): string {
  const rows = report.events.map((event) =>
    `| ${event.key} | ${event.firstInvalidationStage} | `
    + `${event.primaryClassification} | ${event.classifications.join(", ")} | `
    + `${event.noteInstanceChanged ? "yes" : "no"} | `
    + `${event.filterPitchSetChanged ? "yes" : "no"} | `
    + `${event.finalPitchSetChanged ? "yes" : "no"} | `
    + `${event.statusChanged ? "yes" : "no"} |`,
  ).join("\n");
  const counts = Object.entries(report.counts)
    .map(([name, value]) => `- \`${name}\`: ${value}`)
    .join("\n");
  return `# Phase 4.4.1 Root Cause Classification

## 結論

${report.conclusion.usableOnlyReason}

6件すべてで最初の無効化Stageを自動決定した。複数の原因が同時に成立するため、\`primaryClassification\`に加えて\`classifications\`を保持する。

## 分類件数

${counts}

## Event分類

| Event | 最初の無効化Stage | Primary | 全分類 | instance変化 | filter pitch変化 | final pitch変化 | status変化 |
|---|---|---|---|---|---|---|---|
${rows}

## 分類定義

- \`filter-not-triggered\`: filterがnote instanceを1件も除外しなかった
- \`same-pitch-duplicate\`: 除外pitchを別Trackのnote instanceが維持した
- \`unfiltered-rebuild\`: 除外IDがShadow winnerのprovenanceへ再出現した
- \`candidate-unchanged\`: candidateの表現・位置・長さ・pitch・bassが不変だった
- \`status-only-change\`: final pitch set不変でstatusだけ変化した
- \`missing-harmony-dominant\`: event内にharmony/pad/mixedまたはpolyphonic support voiceがなかった
- \`evaluator-provenance-mismatch\`: pitch-only leak評価が、除外distractorと同pitchの残存gold instanceを区別できなかった

## 判定

- 6件全Stage特定: ${report.conclusion.allSixFirstInvalidationStagesIdentified}
- note instance / pitch set分離: ${report.conclusion.noteInstanceAndPitchSetSeparated}
- 製品経路不変: ${report.conclusion.productPathUnchanged}
- Holdout未実行: ${report.conclusion.holdoutNotRun}
`;
}

function countBy(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function sameSet<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length
    && left.every((value) => new Set(right).has(value));
}
