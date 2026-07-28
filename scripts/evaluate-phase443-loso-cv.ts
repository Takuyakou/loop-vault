import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  filterRelativeSupportMelodyContamination,
  type RelativeSupportFilterOptions,
} from "../src/domain/voicing/relativeSupportMelodyFilter";
import {
  voicingNoteSetMetrics,
  voicingRegisterMetrics,
} from "../src/domain/voicing";
import { evaluateGeneralRegression } from "./phase44/generalRegression";
import { loadHarmonySupportManifest } from "./phase442/harmonySupportCorpus";
import {
  aggregateSupportRows,
  evaluateSupportSplit,
  type ShadowFilter,
  type SupportAggregate,
  type SupportEvaluationRow,
} from "./phase442/supportEvaluation";
import {
  classifyApplicability,
  type ApplicabilityClass,
} from "./phase443/applicability";

interface EvaluationContract {
  candidate: {
    id: string;
    minimumRoleConfidence: number;
    minimumSupportPitchCount: number;
    minimumCoverageRatio: number;
  };
  gates: {
    minimumApplicability: number;
    minimumContaminationReduction: number;
    melodyLeakMustImprove: boolean;
    minimumNoteRecallDelta: number;
    minimumBassAccuracyDelta: number;
    minimumTopNoteAccuracyDelta: number;
    minimumRegisterExactDelta: number;
    inertness: number;
    maximumSourceNoteAdditions: number;
    minimumGeneralF1Delta: number;
    minimumPlainBlockExactDelta: number;
    minimumRootlessExactDelta: number;
    minimumArpeggioF1Delta: number;
  };
  exit: {
    promotion: {
      minimumImprovedFolds: number;
      maximumRegressedFolds: number;
    };
    conditionalPromotion: {
      minimumImprovedFolds: number;
      maximumImprovedFolds: number;
      maximumRegressedFolds: number;
    };
  };
}

const root = cwd();
const corpusDir = resolve(root, "test/loop-vault-voicing-harmony-support-gold-v1");
const generalDir = resolve(root, ".local-evaluation/voicing-gold-v1");
const contract = JSON.parse(
  await readFile(
    resolve(root, "docs/phase4.4.3/00-evaluation-contract.json"),
    "utf8",
  ),
) as EvaluationContract;
const options: RelativeSupportFilterOptions = {
  minimumRoleConfidence: contract.candidate.minimumRoleConfidence,
  minimumSupportPitchCount: contract.candidate.minimumSupportPitchCount,
  minimumCoverageRatio: contract.candidate.minimumCoverageRatio,
};
const manifest = await loadHarmonySupportManifest(corpusDir);
const rows = (
  await Promise.all((["dev", "validation", "holdout"] as const).map(
    (split) => evaluateSupportSplit(
      corpusDir,
      manifest,
      split,
      relativeFilter(options),
    ),
  ))
).flat();
if (rows.length !== 256) {
  throw new Error(`Expected 256 CV rows, received ${rows.length}.`);
}
const scenarioIds = [...new Set(rows.map((row) => row.scenarioId))]
  .sort((left, right) => left.localeCompare(right));
if (scenarioIds.length !== 16) {
  throw new Error(`Expected 16 scenarios, received ${scenarioIds.length}.`);
}

const folds = scenarioIds.map((scenarioId) => evaluateFold(
  rows.filter((row) => row.scenarioId === scenarioId),
  rows.filter((row) => row.scenarioId !== scenarioId),
  contract,
));
const generalDev = await evaluateGeneralRegression(
  generalDir,
  "dev",
  {
    minimumRoleConfidence: 0.65,
    minimumConcurrentNonMelodyPitches: 4,
    minimumConcurrentSupportBeats: 0.2,
  },
  (input) => filterRelativeSupportMelodyContamination(input, options),
);
const generalValidation = await evaluateGeneralRegression(
  generalDir,
  "validation",
  {
    minimumRoleConfidence: 0.65,
    minimumConcurrentNonMelodyPitches: 4,
    minimumConcurrentSupportBeats: 0.2,
  },
  (input) => filterRelativeSupportMelodyContamination(input, options),
);
const generalChecks = generalRegressionChecks(
  generalDev,
  generalValidation,
  contract,
);
const decisionFolds = folds.filter((fold) => fold.decisionEligible);
const counts = {
  improved: decisionFolds.filter((fold) => fold.verdict === "improved").length,
  inconclusive:
    decisionFolds.filter((fold) => fold.verdict === "inconclusive").length,
  regressed: decisionFolds.filter((fold) => fold.verdict === "regressed").length,
  burnedDiagnostic: folds.filter((fold) => !fold.decisionEligible).length,
};
const generalPassed = Object.values(generalChecks).every(Boolean);
const decision = decide(counts, generalPassed, contract);
const report = {
  schemaVersion: 1,
  phase: "4.4.3-03",
  candidate: {
    id: "A1-prime",
    options,
  },
  protocol: {
    kind: "leave-one-scenario-out",
    folds: 16,
    events: rows.length,
    cleanStressKeptTogether: true,
    parametersSelectedPerFold: false,
    burnedHoldoutFoldsExcludedFromDecision: true,
  },
  counts,
  generalRegression: {
    dev: generalDev,
    validation: generalValidation,
    checks: generalChecks,
    passed: generalPassed,
  },
  invariants: {
    chordLabelsExact: true,
    timelineExact: true,
    defaultAnalyzerMode: "phase4-v1",
    fileVersion: 1,
    schemaChanged: false,
    productPathChanged: false,
  },
  decision,
  folds,
};
const outputJson = resolve(root, "docs/phase4.4.3/03-loso-cv-results.json");
const outputMarkdown = resolve(root, "docs/phase4.4.3/03-loso-cv-results.md");
await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputMarkdown, markdown(report), "utf8");
stdout.write(`P4.4.3-03 LOSO CV: ${JSON.stringify({
  counts,
  generalPassed,
  decision,
  folds: folds.map((fold) => ({
    scenarioId: fold.scenarioId,
    split: fold.originalSplit,
    classes: fold.classes,
    applicability: fold.applicability,
    inertness: fold.inertness,
    verdict: fold.verdict,
    decisionEligible: fold.decisionEligible,
  })),
}, null, 2)}\n`);

function evaluateFold(
  testRows: SupportEvaluationRow[],
  trainingRows: SupportEvaluationRow[],
  value: EvaluationContract,
) {
  const classified = testRows.map((row) => ({
    row,
    classification: classifyApplicability(row, {
      minimumRoleConfidence: value.candidate.minimumRoleConfidence,
    }),
  }));
  const hRows = classified
    .filter((entry) => entry.classification.class === "H")
    .map((entry) => entry.row);
  const applicableRows = hRows.filter((row) => row.filterTriggered);
  const nxRows = classified
    .filter((entry) =>
      entry.classification.class === "N"
      || entry.classification.class === "X")
    .map((entry) => entry.row);
  const unclassified = classified.filter(
    (entry) => entry.classification.class === "unclassified",
  );
  const applicability = ratio(applicableRows.length, hRows.length);
  const baseline = aggregateSupportRows(asProductRows(applicableRows));
  const candidate = aggregateSupportRows(applicableRows);
  const efficacy = efficacyChecks(baseline, candidate, value);
  const inertRows = nxRows.filter(isInert);
  const inertness = ratio(inertRows.length, nxRows.length);
  const inertnessPassed = nxRows.length === 0
    || (inertness === value.gates.inertness && unclassified.length === 0);
  const applicable = applicability !== null
    && applicability >= value.gates.minimumApplicability;
  const efficacyPassed = Object.values(efficacy).every(Boolean);
  const verdict = !inertnessPassed || (applicable && !efficacyPassed)
    ? "regressed"
    : applicable
      ? "improved"
      : "inconclusive";
  const classes = countClasses(classified.map(
    (entry) => entry.classification.class,
  ));
  const originalSplits = [...new Set(testRows.map((row) => row.split))];
  if (originalSplits.length !== 1) {
    throw new Error(`Scenario ${testRows[0]?.scenarioId} crosses splits.`);
  }
  return {
    scenarioId: testRows[0]!.scenarioId,
    scenarioSlug: testRows[0]!.scenarioSlug,
    originalSplit: originalSplits[0]!,
    decisionEligible: originalSplits[0] !== "holdout",
    testEvents: testRows.length,
    trainingEvents: trainingRows.length,
    classes,
    applicability,
    applicableHEvents: applicableRows.length,
    efficacy: {
      baseline,
      candidate,
      checks: efficacy,
      passed: applicable ? efficacyPassed : null,
    },
    inertness,
    inertEvents: inertRows.length,
    inertnessPassed,
    verdict,
    events: classified.map((entry) => ({
      key: entry.row.key,
      variant: entry.row.variant,
      class: entry.classification.class,
      classReasons: entry.classification.reasons,
      filterTriggered: entry.row.filterTriggered,
      inert: entry.classification.class === "N"
        || entry.classification.class === "X"
        ? isInert(entry.row)
        : null,
      beforeFinalPitchSet: entry.row.beforeFinalPitchSet,
      afterFinalPitchSet: entry.row.afterFinalPitchSet,
      beforeStatus: entry.row.beforeStatus,
      afterStatus: entry.row.afterStatus,
      beforeConfidence: entry.row.beforeConfidence,
      afterConfidence: entry.row.afterConfidence,
    })),
  };
}

function efficacyChecks(
  baseline: SupportAggregate,
  candidate: SupportAggregate,
  value: EvaluationContract,
) {
  return {
    contaminationReduction:
      reduction(
        candidate.contaminationEventCount,
        baseline.contaminationEventCount,
      ) >= value.gates.minimumContaminationReduction,
    melodyLeakImproved:
      !value.gates.melodyLeakMustImprove
      || reduction(
        candidate.melodyLeakRate ?? 0,
        baseline.melodyLeakRate ?? 0,
      ) > 0,
    noteRecall:
      difference(candidate.noteRecall, baseline.noteRecall)
      >= value.gates.minimumNoteRecallDelta,
    bassAccuracy:
      difference(candidate.bassAccuracy, baseline.bassAccuracy)
      >= value.gates.minimumBassAccuracyDelta,
    topNoteAccuracy:
      difference(candidate.topNoteAccuracy, baseline.topNoteAccuracy)
      >= value.gates.minimumTopNoteAccuracyDelta,
    registerExact:
      difference(candidate.registerExactRate, baseline.registerExactRate)
      >= value.gates.minimumRegisterExactDelta,
    noSourceNoteAdditions:
      candidate.sourceNoteAdditionCount
      <= value.gates.maximumSourceNoteAdditions,
  };
}

function generalRegressionChecks(
  dev: Awaited<ReturnType<typeof evaluateGeneralRegression>>,
  validation: Awaited<ReturnType<typeof evaluateGeneralRegression>>,
  value: EvaluationContract,
) {
  return {
    devOverallF1:
      dev.shadow.overall.noteF1 - dev.product.overall.noteF1
      >= value.gates.minimumGeneralF1Delta,
    validationOverallF1:
      validation.shadow.overall.noteF1 - validation.product.overall.noteF1
      >= value.gates.minimumGeneralF1Delta,
    plainBlockExact:
      notApplicable(dev.product.plainBlock.events, dev.shadow.plainBlock.events)
      || difference(
        dev.shadow.plainBlock.voicingExactRate,
        dev.product.plainBlock.voicingExactRate,
      ) >= value.gates.minimumPlainBlockExactDelta,
    rootlessExact:
      notApplicable(dev.product.rootless.events, dev.shadow.rootless.events)
      || difference(
        dev.shadow.rootless.voicingExactRate,
        dev.product.rootless.voicingExactRate,
      ) >= value.gates.minimumRootlessExactDelta,
    arpeggioF1:
      notApplicable(dev.product.arpeggio.events, dev.shadow.arpeggio.events)
      || dev.shadow.arpeggio.noteF1 - dev.product.arpeggio.noteF1
        >= value.gates.minimumArpeggioF1Delta,
    noSourceNoteAdditions:
      dev.shadow.overall.sourceNoteAdditionCount === 0
      && validation.shadow.overall.sourceNoteAdditionCount === 0,
  };
}

function asProductRows(rows: readonly SupportEvaluationRow[]) {
  return rows.map((row) => {
    const noteSet = voicingNoteSetMetrics(
      row.beforeFinalPitchSet,
      row.goldPitchSet,
    );
    const register = voicingRegisterMetrics(
      row.beforeFinalPitchSet,
      row.goldPitchSet,
    );
    return {
      ...row,
      filterTriggered: false,
      afterInputPitchSet: row.beforeInputPitchSet,
      afterFinalPitchSet: row.beforeFinalPitchSet,
      afterStatus: row.beforeStatus,
      afterConfidence: row.beforeConfidence,
      confidenceDelta: 0,
      afterWinnerDuration: row.beforeWinnerDuration,
      winnerDurationDelta: 0,
      afterExact: row.beforeExact,
      afterMelodyLeakedPitches: row.beforeMelodyLeakedPitches,
      pitchSetChanged: false,
      pitchFidelityChanged: false,
      statusOnlyChanged: false,
      sourceNoteAdditionCount: 0,
      afterBassCorrect: register.bassNoteCorrect,
      afterTopCorrect: register.topNoteCorrect,
      afterRegisterExact: register.registerExact,
      afterOctaveError: register.octaveError,
      truePositive: noteSet.truePositive,
      predictedCount: new Set(row.beforeFinalPitchSet).size,
      extraNoteCount: noteSet.extraNoteCount,
      missingNoteCount: noteSet.missingNoteCount,
    };
  });
}

function isInert(row: SupportEvaluationRow): boolean {
  return !row.filterTriggered
    && same(row.beforeInputPitchSet, row.afterInputPitchSet)
    && same(row.beforeFinalPitchSet, row.afterFinalPitchSet)
    && row.beforeStatus === row.afterStatus
    && row.beforeConfidence === row.afterConfidence
    && row.beforeWinnerDuration === row.afterWinnerDuration
    && row.sourceNoteAdditionCount === 0;
}

function countClasses(classes: readonly ApplicabilityClass[]) {
  return {
    H: classes.filter((value) => value === "H").length,
    N: classes.filter((value) => value === "N").length,
    X: classes.filter((value) => value === "X").length,
    unclassified: classes.filter((value) => value === "unclassified").length,
  };
}

function decide(
  counts: {
    improved: number;
    inconclusive: number;
    regressed: number;
  },
  generalPassed: boolean,
  value: EvaluationContract,
) {
  if (
    generalPassed
    && counts.regressed <= value.exit.promotion.maximumRegressedFolds
    && counts.improved >= value.exit.promotion.minimumImprovedFolds
  ) {
    return "eligible-for-promotion";
  }
  if (
    generalPassed
    && counts.regressed
      <= value.exit.conditionalPromotion.maximumRegressedFolds
    && counts.improved
      >= value.exit.conditionalPromotion.minimumImprovedFolds
    && counts.improved
      <= value.exit.conditionalPromotion.maximumImprovedFolds
  ) {
    return "conditional-promotion";
  }
  return "stop-automatic-removal";
}

function relativeFilter(options: RelativeSupportFilterOptions): ShadowFilter {
  return (input, ids) => {
    const result = filterRelativeSupportMelodyContamination(input, options);
    return {
      notes: result.notes,
      removed: result.removed,
      evidenceByNoteId: Object.fromEntries([...result.evidenceByNote.entries()].map(
        ([note, evidence]) => [ids.get(note) ?? "missing-id", evidence],
      )),
    };
  };
}

function markdown(value: typeof report): string {
  return `# P4.4.3-03 Leave-one-scenario-out CV

- Candidate: A1-prime
- Folds: 16
- Events: 256
- Decision-eligible folds: ${value.folds.filter((fold) => fold.decisionEligible).length}
- Burned diagnostic folds: ${value.counts.burnedDiagnostic}
- Improved / inconclusive / regressed:
  **${value.counts.improved} / ${value.counts.inconclusive} / ${value.counts.regressed}**
- General regression: **${value.generalRegression.passed ? "PASS" : "FAIL"}**
- Decision: **${value.decision}**

| Scenario | Split | H/N/X/U | Applicability | Inertness | Verdict | Decision use |
|---|---|---|---:|---:|---|---|
${value.folds.map((fold) =>
    `| ${fold.scenarioId} ${fold.scenarioSlug} | ${fold.originalSplit} | `
    + `${fold.classes.H}/${fold.classes.N}/${fold.classes.X}/`
    + `${fold.classes.unclassified} | ${percentNullable(fold.applicability)} | `
    + `${percentNullable(fold.inertness)} | ${fold.verdict} | `
    + `${fold.decisionEligible ? "yes" : "diagnostic only"} |`,
  ).join("\n")}

The former holdout scenarios are reported but excluded from promotion counts.
No fold selected parameters, and no old dedicated holdout was opened.
`;
}

function same(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function notApplicable(productEvents: number, shadowEvents: number): boolean {
  return productEvents === 0 && shadowEvents === 0;
}

function reduction(current: number, baseline: number): number {
  return baseline === 0 ? 0 : (baseline - current) / baseline;
}

function difference(current: number | null, baseline: number | null): number {
  return current === null || baseline === null
    ? Number.NEGATIVE_INFINITY
    : current - baseline;
}

function ratio(value: number, total: number): number | null {
  return total === 0 ? null : Number((value / total).toFixed(6));
}

function percentNullable(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
}
