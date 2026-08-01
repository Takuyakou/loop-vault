import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  lstat,
  readFile,
  stat,
} from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { argv, cwd, stdout } from "node:process";
import { benchmarkLiveMidiLatency } from "../../src/liveMidi/latencyBenchmark";
import { chordIdentityKey, normalizeChordLabel } from "../../src/domain/chordIdentity";
import { classifyRepresentability } from "../../src/domain/midi/evaluation/metricsV2";
import { makeChordSymbol } from "../../src/domain/chords";
import {
  analyzeMidi,
  analyzerVersion,
  defaultAnalyzerMode,
} from "../../src/domain/midi/analysis";
import { buildProgressionMidi } from "../../src/domain/midiExport";
import {
  buildPracticeChordRequirements,
  matchPerformance,
  type PracticeInputSnapshot,
} from "../../src/domain/practice";
import type {
  ChordQuality,
  ChordSymbol,
  ChordTimelineItem,
  MidiProgressionAnalysis,
  SavedProgressionBlock,
} from "../../src/domain/types";
import type {
  Phase515ContractCase,
  Phase515CorpusContract,
  Phase515ExpectedSegment,
} from "./corpusContract";
import {
  compareCodePoints,
  renderContractMidi,
  sha256,
} from "./corpusContract";
import {
  loadPhase515CorpusContract,
} from "./validateCorpusContract";
import {
  corpusWorkspaceExists,
  validateCorpusWorkspaceReadOnly,
  validateGeneratedCorpusReadOnly,
} from "./corpusWorkspace";
import { safeResolveExistingWithinRoot } from "./safePath";
import {
  computeHoldoutLock,
  verifyFrozenHoldout,
} from "./holdoutLock";
import {
  comparisonEligibility,
  comparisonPass,
  boundaryMetrics,
  exactEventPass,
  noChordComparisonPass,
} from "./comparisonPolicy";
import {
  assertCanonicalLockEqual,
  baselineLockSchema,
  existingCorpusBaselinesSchema,
  fingerprintDependencyGraph,
  inspectBuildArtifacts,
  partitionLockSchema,
  trackedSafetyCounts,
  type BaselineLock,
  type PartitionLock,
} from "./lockContract";
import {
  scanPrivacyArtifacts,
} from "./privacy";
import {
  freezeAvailableExternalSuites,
  verifyFrozenExternalSuites,
} from "./externalSuites";
import {
  promotePrivacySafeReports,
  recoverPhase515ReportTransaction,
  validateBaselineWriteMode,
  writeReviewedLockCandidate,
} from "./artifactWriter";
import { selectReviewedBuildArtifactFingerprints } from "./buildArtifactLockPolicy";
import { renderRuntimeObservationSummary } from "./runtimeSummary";
import { evaluateFortyFileBatch } from "./fortyFileBatch";
import {
  captureFrozenBaselineLock,
  frozenSafeEvaluatorArgs,
} from "./safeEvaluatorContract";

const root = cwd();
const outputRoot = resolve(root, "docs/phase5.15");
const supportedOptions = new Set([
  "--refresh-reports",
  "--emit-reviewed-lock-candidate",
  "--recover-reports",
]);
const unsupportedOptions = argv.slice(2)
  .filter((option) => option.startsWith("--") && !supportedOptions.has(option));
if (unsupportedOptions.length > 0) {
  throw new Error(`Unknown P5.15 baseline option: ${unsupportedOptions.join(", ")}.`);
}
const refreshReports = argv.includes("--refresh-reports");
const emitReviewedLockCandidate = argv.includes("--emit-reviewed-lock-candidate");
const recoverReports = argv.includes("--recover-reports");
validateBaselineWriteMode({
  refreshReports,
  emitReviewedLockCandidate,
});
const contractPath = resolve(root, "scripts/phase515/fixtures/manifest-v2.json");
if (
  recoverReports
  && (refreshReports || emitReviewedLockCandidate)
) {
  throw new Error("--recover-reports must be used by itself.");
}
if (recoverReports) {
  const recovered = await recoverPhase515ReportTransaction(root, outputRoot);
  stdout.write(`${JSON.stringify({
    phase: "P5.15-00",
    mode: "explicit-recovery",
    recovered,
  })}\n`);
} else {
  const journalPath = resolve(
    outputRoot,
    ".p515-report-refresh.journal.json",
  );
  if (await lstat(journalPath).then(() => true, (cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT") return false;
    throw cause;
  })) {
    throw new Error(
      "Interrupted report transaction detected; run the explicit "
      + "--recover-reports mode before baseline evaluation.",
    );
  }
  await runBaselineEvaluation();
}

async function runBaselineEvaluation() {
const contract = await loadPhase515CorpusContract(contractPath);
const generatedValidation = validateGeneratedCorpusReadOnly(contract);
const localCorpusPresent = await corpusWorkspaceExists(root);
const localValidation = localCorpusPresent
  ? await validateCorpusWorkspaceReadOnly(root, contract)
  : null;
if (!generatedValidation.valid || (localValidation && !localValidation.valid)) {
  throw new Error(
    "Manifest validation failed; analyzer was not executed: "
    + JSON.stringify({
      generatedValidation,
      localValidation,
    }),
  );
}

// Freeze data inventory and Holdout hashes before the first Analyzer call.
const partitionPath = resolve(outputRoot, "00-partition-lock.json");
const frozenPartition: PartitionLock = partitionLockSchema.parse(
  JSON.parse(await readFile(partitionPath, "utf8")),
);
const capturedBaseline = await captureFrozenBaselineLock(root);
const frozenBaseline: BaselineLock = capturedBaseline.lock;
const holdout: Awaited<ReturnType<typeof computeHoldoutLock>> =
  frozenPartition.holdout;
const holdoutVerification = await verifyFrozenHoldout(root, holdout);
const externalSuiteStatus = await verifyFrozenExternalSuites(
  root,
  frozenBaseline.externalSuites,
);
const requiredExistingSuiteIds = new Set([
  "chord-drip-100",
  "chapter3",
  "voicing-gold-development",
  "voicing-gold-validation",
  "phase4.7-development",
  "phase4.7-validation",
]);
const unavailableExistingSuites = externalSuiteStatus
  .filter((item) => requiredExistingSuiteIds.has(item.id) && !item.exists)
  .map((item) => item.id);
const canEvaluateExistingCorpora = unavailableExistingSuites.length === 0;
const existingCorpusBaselines = canEvaluateExistingCorpora
  ? evaluateExistingCorpusBaselines(capturedBaseline.sha256)
  : frozenBaseline.existingCorpusBaselines;
const existingCorpusExecution = canEvaluateExistingCorpora
  ? { status: "COMPLETED", unavailableSuites: [] }
  : {
    status: "SKIPPED (ignored inputs absent; locked metrics retained)",
    unavailableSuites: unavailableExistingSuites,
  };
const validation = generatedValidation.contract;
const currentBuildArtifacts = await inspectBuildArtifacts(root);
const inventory = await buildInventory(
  contract,
  validation,
  currentBuildArtifacts,
  frozenBaseline,
  existingCorpusBaselines,
  existingCorpusExecution,
  generatedValidation,
  localValidation,
);
const caseIdsToEvaluate = new Set<string>([
  ...contract.partitions.development,
  ...contract.partitions.validation,
  ...contract.partitions.roundTripBaseline,
  ...Object.values(contract.invariantGroups).flat(),
]);
const evaluations = [];
for (const item of contract.cases) {
  if (!caseIdsToEvaluate.has(item.id)) continue;
  const bytes = await readCaseBytes(item);
  evaluations.push(evaluateSyntheticCase(item, bytes));
}

const roundTrip = evaluatePhase514RoundTrip();
const runtime = await evaluateRuntime(contract, evaluations);
const invariance = buildInvariance(contract, evaluations);
const currentFailureMatrix = {
  schemaVersion: 1,
  phase: "P5.15-00",
  analyzer: {
    mode: defaultAnalyzerMode,
    version: analyzerVersion,
  },
  manifestGate: {
    valid: generatedValidation.valid && (localValidation?.valid ?? true),
    contract: validation,
    generatedTemp: generatedValidation,
    localExternalCorpus: localValidation ?? {
      status: "SKIPPED (ignored corpus not present)",
    },
  },
  holdoutVerification,
  holdoutEvaluated: false,
  existingCorpusBaselines,
  existingCorpusExecution,
  evaluatedPartitions: [
    "Development",
    "Validation",
    "Invariant Pairs",
    "Round-trip Baseline",
    "Runtime-only",
  ],
  excludedPartitions: ["Holdout", "Final Real-song Smoke"],
  aggregates: {
    development: aggregate(
      evaluations.filter((item) =>
        contract.partitions.development.includes(
          item.id as (typeof contract.partitions.development)[number],
        )),
    ),
    validation: aggregate(
      evaluations.filter((item) =>
        contract.partitions.validation.includes(
          item.id as (typeof contract.partitions.validation)[number],
        )),
    ),
    roundTripFiles: aggregate(
      evaluations.filter((item) =>
        contract.partitions.roundTripBaseline.includes(
          item.id as (typeof contract.partitions.roundTripBaseline)[number],
        )),
    ),
  },
  invariance,
  cases: evaluations,
  knownDiagnosticGaps: {
    exactDuplicateNoteCount: "not exposed by current Analyzer diagnostics",
    eventLocalTensionSupport: "not exposed by current Analyzer diagnostics",
    adjacentOnlyTensionCount: "not exposed by current Analyzer diagnostics",
    passingToneClassification: "not exposed by current Analyzer diagnostics",
    shellCoreSupport: "not exposed by current Analyzer diagnostics",
    boundaryProposalProvenance: "not exposed by current Analyzer diagnostics",
    boundaryRejectionReason: "not exposed by current Analyzer diagnostics",
  },
};
const partitionLock = partitionLockSchema.parse({
  schemaVersion: 2,
  phase: "P5.15-00",
  policy: {
    frozenBeforeAnalyzerChanges: true,
    holdoutResultsVisibleBeforeP51506: false,
    thresholdTuningAgainstHoldout: false,
  },
  development: contract.partitions.development,
  validation: contract.partitions.validation,
  roundTrip: contract.partitions.roundTripBaseline,
  invariant: contract.invariantGroups,
  runtime: contract.partitions.runtimeOnly,
  holdout,
  finalRealSongSmoke: {
    maximumFiles: 3,
    selection: "deferred until all automated gates pass",
    reusedForTuning: false,
  },
});
const baselineLock = await buildBaselineLock(
  contract,
  roundTrip,
  holdout,
  currentBuildArtifacts,
  frozenBaseline,
  existingCorpusBaselines,
);
assertCanonicalLockEqual(
  frozenPartition,
  partitionLock,
  partitionLockSchema,
  "Partition lock",
);
if (!emitReviewedLockCandidate) {
  assertCanonicalLockEqual(
    frozenBaseline,
    baselineLock,
    baselineLockSchema,
    "Baseline lock",
  );
}
const reports = {
  "00-data-inventory.json": inventory,
  "00-current-failure-matrix.json": currentFailureMatrix,
  "00-roundtrip-baseline.json": roundTrip,
  "00-runtime-baseline.json": runtime,
};
if (refreshReports) {
  await promotePrivacySafeReports(root, outputRoot, reports);
} else if (emitReviewedLockCandidate) {
  await writeReviewedLockCandidate(
    root,
    resolve(root, "p515-baseline-lock.reviewed-candidate.json"),
    baselineLock,
  );
} else {
  for (const [name, value] of Object.entries(reports)) {
    await verifyTrackedReport(name, value);
  }
}
stdout.write(renderRuntimeObservationSummary(
  runtime,
  refreshReports
    ? "reviewed-write"
    : emitReviewedLockCandidate
      ? "candidate-write"
      : "read-only",
));
}

interface EventEvaluation {
  expectedStartBeat: number;
  expectedDurationBeats: number;
  expected: string;
  actual?: string;
  canonicalExact: boolean;
  exactEvent: boolean;
  comparisonPass: boolean | null;
  usable: boolean;
  root: boolean;
  quality: boolean;
  seventh: boolean;
  tension: boolean;
  slashBass: boolean;
  rank1: boolean;
  top3Canonical: boolean;
  top3Root: boolean;
  candidateRecall: boolean;
  manualInput: boolean;
  identityMetricEligible: boolean;
  exactEventMetricEligible: boolean;
  slashMetricEligible: boolean;
  timingMetricEligible: boolean;
  matched: boolean;
  onsetErrorBeats?: number;
  durationErrorBeats?: number;
  representability:
    | "representable"
    | "parser-unsupported"
    | "detector-vocabulary-unsupported"
    | "no-chord";
}

interface CaseEvaluation {
  id: string;
  comparisonMode: Phase515ContractCase["comparisonMode"];
  analyzerVersion: string;
  runtimeMs: number;
  deterministic: boolean;
  deterministicHash: string;
  outputEventCount: number;
  candidateCatalogSize: number;
  duplicateCandidateCount: number;
  comparisonPass: boolean | null;
  boundary: {
    expected: number;
    actual: number;
    truePositive: number;
    precision: number | null;
    recall: number | null;
    f1: number | null;
  };
  events: EventEvaluation[];
  normalizedOutput: unknown;
}

function evaluateSyntheticCase(
  item: Phase515ContractCase,
  bytes: Uint8Array,
): CaseEvaluation {
  const started = performance.now();
  const first = analyzeMidi(bytes, { fileName: item.filename });
  const runtimeMs = performance.now() - started;
  const second = analyzeMidi(bytes, { fileName: item.filename });
  const normalizedOutput = normalizedAnalysis(first, item.midi.timeSignature);
  const deterministicHash = sha256(JSON.stringify(normalizedOutput));
  const deterministic = deterministicHash ===
    sha256(JSON.stringify(normalizedAnalysis(second, item.midi.timeSignature)));
  const ranges = timelineRanges(first, item.midi.timeSignature);
  const tolerance = 1 / item.midi.ppq + 1e-9;
  const events = item.expectedSegments.map((expected) =>
    evaluateEvent(expected, ranges, tolerance, item.comparisonMode));
  const boundaryPolicy = comparisonEligibility(
    item.comparisonMode,
    "representable",
    false,
  );
  const boundary = !boundaryPolicy.boundaryMetricEligible
    ? {
      expected: 0,
      actual: 0,
      truePositive: 0,
      precision: null,
      recall: null,
      f1: null,
    }
    : boundaryMetrics(item.expectedSegments, ranges, tolerance);
  const eligibleEventComparisons = events
    .filter((event) => event.comparisonPass !== null);
  const noChordSilent = events
    .filter((event) => event.representability === "no-chord")
    .every((event) => event.canonicalExact);
  const caseComparisonPass = item.comparisonMode === "boundary-only"
    ? boundary.f1 === 1 && noChordSilent
    : item.comparisonMode === "invariant-deep-equal"
      ? null
      : eligibleEventComparisons.length === 0
        ? null
        : eligibleEventComparisons.every((event) =>
          event.comparisonPass === true);
  return {
    id: item.id,
    comparisonMode: item.comparisonMode,
    analyzerVersion: first.analyzerVersion,
    runtimeMs: rounded(runtimeMs),
    deterministic,
    deterministicHash,
    outputEventCount: first.fullTimeline.length,
    candidateCatalogSize: first.candidateCatalog?.patterns.length ?? 0,
    duplicateCandidateCount: countDuplicateCandidates(first.fullTimeline),
    comparisonPass: caseComparisonPass,
    boundary,
    events,
    normalizedOutput,
  };
}

function evaluateEvent(
  expected: Phase515ExpectedSegment,
  ranges: ReturnType<typeof timelineRanges>,
  tolerance: number,
  comparisonMode: Phase515ContractCase["comparisonMode"],
): EventEvaluation {
  const classified = classifyRepresentability(expected.label);
  const expectedIdentity = classified.identity;
  const representability = classified.representability;
  const match = comparisonMode === "probe-beat"
    ? rangeAtBeat(expected.startBeat + expected.durationBeats / 2, ranges)
    : bestOverlap(expected, ranges);
  const policy = comparisonEligibility(
    comparisonMode,
    representability,
    expectedIdentity?.bassPitchClass !== undefined
      && expectedIdentity.bassPitchClass !== expectedIdentity.rootPitchClass,
  );
  const {
    identityMetricEligible,
    exactEventMetricEligible,
    slashMetricEligible,
    timingMetricEligible,
  } = policy;
  if (representability === "no-chord") {
    const silent = !ranges.some((range) =>
      range.startBeat < expected.endBeat
      && range.endBeat > expected.startBeat);
    return {
      expectedStartBeat: expected.startBeat,
      expectedDurationBeats: expected.durationBeats,
      expected: expected.label,
      canonicalExact: silent,
      exactEvent: false,
      comparisonPass:
        comparisonMode === "boundary-only"
        || comparisonMode === "invariant-deep-equal"
          ? null
          : noChordComparisonPass(silent),
      usable: silent,
      root: silent,
      quality: silent,
      seventh: silent,
      tension: silent,
      slashBass: silent,
      rank1: silent,
      top3Canonical: silent,
      top3Root: silent,
      candidateRecall: silent,
      manualInput: !silent,
      identityMetricEligible: false,
      exactEventMetricEligible: false,
      slashMetricEligible: false,
      timingMetricEligible: false,
      matched: silent,
      representability,
    };
  }
  if (!expectedIdentity || !match) {
    return {
      expectedStartBeat: expected.startBeat,
      expectedDurationBeats: expected.durationBeats,
      expected: expected.label,
      canonicalExact: false,
      exactEvent: false,
      comparisonPass: comparisonPass(policy, false, false),
      usable: false,
      root: false,
      quality: false,
      seventh: false,
      tension: false,
      slashBass: false,
      rank1: false,
      top3Canonical: false,
      top3Root: false,
      candidateRecall: false,
      manualInput: true,
      identityMetricEligible,
      exactEventMetricEligible,
      slashMetricEligible,
      timingMetricEligible: false,
      matched: false,
      representability,
    };
  }
  const candidates = [
    match.item.chord,
    ...match.item.alternatives.map((alternative) => alternative.chord),
  ];
  const identities = candidates.map((candidate) => normalizeChordLabel(candidate.label));
  const actual = identities[0];
  const expectedKey = chordIdentityKey(expectedIdentity);
  const keys = identities.map((identity) => identity ? chordIdentityKey(identity) : "");
  const root = actual?.rootPitchClass === expectedIdentity.rootPitchClass;
  const quality = actual?.triad === expectedIdentity.triad
    && actual.seventh === expectedIdentity.seventh;
  const seventh = actual?.seventh === expectedIdentity.seventh;
  const tension = JSON.stringify(actual?.extensions ?? []) ===
    JSON.stringify(expectedIdentity.extensions)
    && JSON.stringify(actual?.alterations ?? []) ===
      JSON.stringify(expectedIdentity.alterations);
  const slashBass = slashMetricEligible
    && actual?.bassPitchClass === expectedIdentity.bassPitchClass;
  const onsetErrorBeats = Math.abs(match.startBeat - expected.startBeat);
  const durationErrorBeats = Math.abs(
    match.endBeat - match.startBeat - expected.durationBeats,
  );
  const canonicalExact = keys[0] === expectedKey;
  return {
    expectedStartBeat: expected.startBeat,
    expectedDurationBeats: expected.durationBeats,
    expected: expected.label,
    actual: match.item.chord.label,
    canonicalExact,
    exactEvent: exactEventPass(
      policy,
      canonicalExact,
      onsetErrorBeats <= tolerance && durationErrorBeats <= tolerance,
    ),
    comparisonPass: comparisonPass(
      policy,
      canonicalExact,
      onsetErrorBeats <= tolerance && durationErrorBeats <= tolerance,
    ),
    usable: Boolean(root && actual?.triad === expectedIdentity.triad),
    root,
    quality,
    seventh,
    tension,
    slashBass,
    rank1: canonicalExact,
    top3Canonical: keys.slice(0, 3).includes(expectedKey),
    top3Root: identities.slice(0, 3).some((identity) =>
      identity?.rootPitchClass === expectedIdentity.rootPitchClass),
    candidateRecall: keys.slice(0, 5).includes(expectedKey),
    manualInput: !keys.slice(0, 5).includes(expectedKey),
    identityMetricEligible,
    exactEventMetricEligible,
    slashMetricEligible,
    timingMetricEligible,
    matched: true,
    ...(timingMetricEligible
      ? {
        onsetErrorBeats: rounded(onsetErrorBeats),
        durationErrorBeats: rounded(durationErrorBeats),
      }
      : {}),
    representability,
  };
}

function rangeAtBeat(
  beat: number,
  ranges: ReturnType<typeof timelineRanges>,
) {
  return ranges.find((range) => range.startBeat <= beat && beat < range.endBeat);
}

function timelineRanges(analysis: MidiProgressionAnalysis, timeSignature: string) {
  const [numerator = 4, denominator = 4] = timeSignature.split("/").map(Number);
  const beatsPerBar = numerator * 4 / denominator;
  return analysis.fullTimeline.map((item) => {
    const startBeat = (item.bar - 1) * beatsPerBar + item.beat - 1;
    return {
      startBeat,
      endBeat: startBeat + item.durationBeats,
      item,
    };
  });
}

function bestOverlap(
  expected: Phase515ExpectedSegment,
  ranges: ReturnType<typeof timelineRanges>,
) {
  const ranked = ranges.map((range) => ({
    ...range,
    overlap: Math.max(
      0,
      Math.min(expected.endBeat, range.endBeat)
        - Math.max(expected.startBeat, range.startBeat),
    ),
  })).sort((left, right) =>
    right.overlap - left.overlap || left.startBeat - right.startBeat);
  return ranked[0]?.overlap ? ranked[0] : undefined;
}

function aggregate(cases: readonly CaseEvaluation[]) {
  const events = cases.flatMap((item) => item.events);
  const boundaries = cases.map((item) => item.boundary)
    .filter((item) => item.f1 !== null);
  const ratio = (
    key: keyof EventEvaluation,
    eligibility: "identityMetricEligible" | "slashMetricEligible" = "identityMetricEligible",
  ) => {
    const eligible = events.filter((event) => event[eligibility]);
    return eligible.length === 0
      ? 0
      : rounded(eligible.filter((event) => event[key] === true).length / eligible.length);
  };
  const exactEligible = events.filter((event) => event.exactEventMetricEligible);
  const timingEligible = events.filter((event) => event.timingMetricEligible);
  const onsetErrors = timingEligible.flatMap((event) =>
    event.onsetErrorBeats === undefined ? [] : [event.onsetErrorBeats]);
  const durationErrors = timingEligible.flatMap((event) =>
    event.durationErrorBeats === undefined ? [] : [event.durationErrorBeats]);
  return {
    caseCount: cases.length,
    eventCount: events.length,
    identityDenominator: events.filter((event) => event.identityMetricEligible).length,
    exactEventDenominator: exactEligible.length,
    slashDenominator: events.filter((event) => event.slashMetricEligible).length,
    noChordExcluded: events.filter((event) => event.representability === "no-chord").length,
    unmatchedIdentityEvents: events.filter((event) =>
      event.identityMetricEligible && !event.matched).length,
    timingDenominator: timingEligible.length,
    timingErrorPolicy: "timingMetricEligible matched exact-event rows only; unmatched rows are counted separately",
    exactEvent: exactEligible.length === 0
      ? 0
      : rounded(exactEligible.filter((event) => event.exactEvent).length
        / exactEligible.length),
    comparisonPass: (() => {
      const eligible = events.filter((event) => event.comparisonPass !== null);
      return eligible.length === 0
        ? null
        : rounded(eligible.filter((event) => event.comparisonPass).length
          / eligible.length);
    })(),
    canonicalExact: ratio("canonicalExact"),
    usable: ratio("usable"),
    rootAccuracy: ratio("root"),
    qualityAccuracy: ratio("quality"),
    seventhAccuracy: ratio("seventh"),
    tensionAccuracy: ratio("tension"),
    slashBassAccuracy: ratio("slashBass", "slashMetricEligible"),
    rank1: ratio("rank1"),
    top3Canonical: ratio("top3Canonical"),
    top3Root: ratio("top3Root"),
    candidateRecall: ratio("candidateRecall"),
    manualInputRate: ratio("manualInput"),
    duplicateOutputCount: cases.reduce(
      (total, item) => total + item.duplicateCandidateCount,
      0,
    ),
    boundary: {
      precision: average(boundaries.map((item) => item.precision!)),
      recall: average(boundaries.map((item) => item.recall!)),
      f1: average(boundaries.map((item) => item.f1!)),
    },
    onsetErrorBeats: summarizeErrors(onsetErrors),
    durationErrorBeats: summarizeErrors(durationErrors),
    runtimeMs: summarize(cases.map((item) => item.runtimeMs)),
    deterministic: cases.every((item) => item.deterministic),
  };
}

function buildInvariance(
  corpus: Phase515CorpusContract,
  cases: readonly CaseEvaluation[],
) {
  const byId = new Map(cases.map((item) => [item.id, item]));
  return Object.entries(corpus.invariantGroups).map(([name, ids]) => {
    const members = ids.map((id) => byId.get(id)).filter(
      (item): item is CaseEvaluation => item !== undefined,
    );
    if (members.length === 1) {
      const canonicalIdentityPass = members[0]!.events
        .filter((event) => event.identityMetricEligible)
        .every((event) => event.canonicalExact);
      const boundaryPass = members[0]!.boundary.f1 === null
        || members[0]!.boundary.f1 === 1;
      return {
        name,
        caseIds: ids,
        pass: canonicalIdentityPass && boundaryPass && members[0]!.deterministic,
        comparison: "canonical-identity-boundary-and-determinism",
        canonicalIdentityPass,
        boundaryPass,
        deterministicPass: members[0]!.deterministic,
      };
    }
    return {
      name,
      caseIds: ids,
      pass: members.length === ids.length
        && members.every((item) =>
          item.deterministicHash === members[0]!.deterministicHash),
      comparison: "normalized-output-deep-equal",
      hashes: members.map((item) => item.deterministicHash),
    };
  });
}

function normalizedAnalysis(
  analysis: MidiProgressionAnalysis,
  timeSignature: string,
) {
  return timelineRanges(analysis, timeSignature).map((range) => ({
    startBeat: rounded(range.startBeat),
    durationBeats: rounded(range.endBeat - range.startBeat),
    primary: range.item.chord.label,
    confidence: rounded(range.item.confidence),
    alternatives: range.item.alternatives.map((alternative) => ({
      label: alternative.chord.label,
      confidence: rounded(alternative.confidence),
    })),
  }));
}

function countDuplicateCandidates(timeline: readonly ChordTimelineItem[]): number {
  return timeline.reduce((total, item) => {
    const keys = [item.chord, ...item.alternatives.map((entry) => entry.chord)]
      .map((chord) => normalizeChordLabel(chord.label))
      .filter((identity) => identity !== null)
      .map(chordIdentityKey);
    return total + keys.length - new Set(keys).size;
  }, 0);
}

async function buildInventory(
  corpus: Phase515CorpusContract,
  manifestValidation:
    ReturnType<typeof validateGeneratedCorpusReadOnly>["contract"],
  buildArtifactInspection: Awaited<ReturnType<typeof inspectBuildArtifacts>>,
  frozenBaseline: BaselineLock,
  existingCorpusBaselines: ReturnType<typeof evaluateExistingCorpusBaselines>,
  existingCorpusExecution: {
    status: string;
    unavailableSuites: string[];
  },
  generatedValidation: ReturnType<typeof validateGeneratedCorpusReadOnly>,
  localValidation:
    Awaited<ReturnType<typeof validateCorpusWorkspaceReadOnly>> | null,
) {
  const existingCorpora = await existingCorpusInventory();
  const externalSuiteVerification = await verifyFrozenExternalSuites(
    root,
    frozenBaseline.externalSuites,
  );
  const combinedMidi = createHash("sha256");
  for (const item of corpus.cases) combinedMidi.update(await readCaseBytes(item));
  return {
    schemaVersion: 1,
    phase: "P5.15-00",
    canonicalManifest: {
      path: "scripts/phase515/fixtures/manifest-v2.json",
      sha256: await hashFile(contractPath),
      validation: manifestValidation,
      generatedTempValidation: generatedValidation,
      localExternalValidation: localValidation ?? {
        status: "SKIPPED (ignored corpus not present)",
      },
    },
    syntheticCorpus: {
      caseCount: corpus.cases.length,
      combinedMidiSha256: combinedMidi.digest("hex"),
      trackedBinaryPolicy: "MIDI remains ignored; semantic manifest and generator are tracked.",
      cases: corpus.cases.map((item) => ({
        id: item.id,
        sourceManifest: item.sourceManifest,
        filename: item.filename,
        sha256: item.midi.sha256,
        byteLength: item.midi.byteLength,
        smfFormat: item.midi.smfFormat,
        ppq: item.midi.ppq,
        bpm: item.midi.bpm,
        timeSignature: item.midi.timeSignature,
        trackCount: item.midi.trackCount,
        noteCount: item.midi.noteCount,
        expectedSegmentCount: item.expectedSegments.length,
        comparisonMode: item.comparisonMode,
      })),
    },
    existingCorpora,
    externalSuiteVerification,
    existingCorpusBaselines,
    existingCorpusExecution,
    buildArtifacts: {
      productName: buildArtifactInspection.productName,
      version: buildArtifactInspection.version,
      packageVersion: buildArtifactInspection.packageVersion,
      current: buildArtifactInspection.current,
      frozenFingerprints: frozenBaseline?.buildArtifacts.frozenFingerprints ?? [],
    },
    aliasesAndSuites: {
      phase45: "Voicing Gold development split; not an independent corpus.",
      phase5AccuracyFirst:
        "Suite over Chord Drip, Chapter 3, Voicing Gold dev, and Phase 4.7; not independent.",
      candidateUnion:
        "Feature evaluation over the Phase 5 Accuracy First suite; not independent.",
      fortyFileBatch: "Voicing Gold development split; not independent.",
    },
  };
}

async function existingCorpusInventory() {
  const descriptors = [
    {
      id: "chord-drip-100",
      path: "docs/loop-vault-evaluation-corpus/manifest.json",
      status: "canonical",
    },
    {
      id: "chapter3-seed",
      path: ".local-evaluation/chapter3-seed/manifest.json",
      fallback: "test/loop-vault-chapter3-seed/manifest.json",
      status: "canonical-local",
    },
    {
      id: "voicing-gold-v1",
      path: "test/loop-vault-voicing-gold-corpus-v1/manifest.json",
      status: "canonical; holdout burned and diagnostic-only",
    },
    {
      id: "phase4.7-bass-companion",
      path: ".local-evaluation/loop-vault-bass-companion-identity-gold-v1/manifest.json",
      status: "canonical; holdout hash-locked for P5.15",
    },
    {
      id: "suran",
      path: ".local-evaluation/phase4.1/fixtures/suran-remix.mid",
      status: "runtime-only",
    },
    {
      id: "endless",
      path: ".local-evaluation/phase4.1.1/fixtures/endless.mid",
      status: "runtime-only",
    },
    {
      id: "all-instruments",
      path: ".local-evaluation/midi/all_instruments.mid",
      status: "runtime-only",
    },
  ];
  return Promise.all(descriptors.map(async (descriptor) => {
    const primary = resolve(root, descriptor.path);
    const fallback = "fallback" in descriptor && descriptor.fallback
      ? resolve(root, descriptor.fallback)
      : undefined;
    const selected = await exists(primary) ? primary : fallback;
    return {
      ...descriptor,
      exists: selected ? await exists(selected) : false,
      sha256: selected && await exists(selected) ? await hashFile(selected) : null,
    };
  }));
}

async function buildBaselineLock(
  corpus: Phase515CorpusContract,
  roundTrip: ReturnType<typeof evaluatePhase514RoundTrip>,
  holdout: Awaited<ReturnType<typeof computeHoldoutLock>>,
  buildArtifactInspection: Awaited<ReturnType<typeof inspectBuildArtifacts>>,
  frozen: BaselineLock,
  existingCorpusBaselines: ReturnType<typeof evaluateExistingCorpusBaselines>,
): Promise<BaselineLock> {
  const currentFingerprints = buildArtifactInspection.current.flatMap((item) =>
    item.exists && item.path && item.sha256 && item.byteLength
      ? [{
        kind: item.kind,
        path: item.path,
        sha256: item.sha256,
        byteLength: item.byteLength,
      }]
      : []);
  const frozenBuildFingerprints = frozen.buildArtifacts.frozenFingerprints;
  if (
    buildArtifactInspection.productName !== frozen.buildArtifacts.productName
    || buildArtifactInspection.version !== frozen.buildArtifacts.version
    || buildArtifactInspection.packageVersion !== frozen.buildArtifacts.packageVersion
  ) {
    throw new Error("Build artifact product metadata drift.");
  }
  const reviewedBuildFingerprints = selectReviewedBuildArtifactFingerprints({
    emitReviewedLockCandidate,
    current: currentFingerprints,
    frozen: frozenBuildFingerprints,
  });
  const privacyIssues = await scanPrivacyArtifacts(root);
  if (privacyIssues.length > 0) {
    throw new Error(`P5.15 artifact privacy scan failed: ${JSON.stringify(privacyIssues)}`);
  }
  const trackedPaths = gitNulPaths(["ls-files", "-z"]);
  const {
    trackedMidi,
    trackedLocalEvaluation,
    trackedBuildArtifacts,
    trackedReviewedArtifactFiles,
  } = trackedSafetyCounts(trackedPaths);
  const sourceFingerprints = {
    packageLockSha256: await hashFile(resolve(root, "package-lock.json")),
    cargoLockSha256: await hashFile(resolve(root, "src-tauri/Cargo.lock")),
    corpusContractSha256: await hashFile(contractPath),
    evaluationContractSha256: await hashFile(
      resolve(root, "docs/phase5.15/00-evaluation-contract.md"),
    ),
    manifestValidatorSha256: await hashFile(
      resolve(root, "scripts/phase515/manifestValidation.ts"),
    ),
    contractValidatorSha256: await hashFile(
      resolve(root, "scripts/phase515/validateCorpusContract.ts"),
    ),
    evaluatorSelfSha256: await hashFile(
      resolve(root, "scripts/phase515/evaluate-baseline.ts"),
    ),
    comparisonPolicySha256: await hashFile(
      resolve(root, "scripts/phase515/comparisonPolicy.ts"),
    ),
    holdoutPolicySha256: await hashFile(
      resolve(root, "scripts/phase515/holdoutLock.ts"),
    ),
    safePathSha256: await hashFile(resolve(root, "scripts/phase515/safePath.ts")),
    privacyPolicySha256: await hashFile(resolve(root, "scripts/phase515/privacy.ts")),
    externalSuitePolicySha256: await hashFile(
      resolve(root, "scripts/phase515/externalSuites.ts"),
    ),
    vaultSchemaSha256: await hashFile(resolve(root, "src/domain/schema.ts")),
    vaultRepositorySha256: await hashFile(resolve(root, "src/domain/repository.ts")),
    vaultStoreSha256: await hashFile(resolve(root, "src/store/vaultStore.ts")),
  };
  const productContract = await deriveProductContract();
  const availableExternalSuites = await freezeAvailableExternalSuites(root);
  const externalSuites = [
    ...availableExternalSuites,
    ...frozen.externalSuites.filter((locked) =>
      !availableExternalSuites.some((current) => current.id === locked.id)),
  ].sort((left, right) => compareCodePoints(left.id, right.id));
  return baselineLockSchema.parse({
    schemaVersion: 2,
    phase: "P5.15-00",
    capturedAt: "2026-07-30",
    // Provenance is the reviewed capture point, not the current execution
    // branch. Stacked branches and detached verification must compare against
    // exactly the same immutable baseline.
    git: frozen.git,
    product: {
      defaultAnalyzerMode: productContract.defaultAnalyzerMode,
      analyzerVersion: productContract.analyzerVersion,
      fileVersion: productContract.fileVersion,
      analyzerProductCodeChanged: false,
      vaultSchemaChanged: false,
      midiExporterChanged: false,
      featureFlags: {
        enableExactNoteEvidenceDedup: false,
        enableEventLocalTensionEvidence: false,
        enableSyncopatedShellBoundary: false,
        enableShellSeventhPreference: false,
        enableSuspendedQualityDisambiguation: false,
        implementedAtBaseline: false,
      },
    },
    roundTripBaseline: {
      timelineEvents: roundTrip.timelineEvents,
      exact: roundTrip.counts.exact,
      ambiguity: roundTrip.counts["same-root-different-quality"],
    },
    sourceFingerprints,
    analyzerDependencyGraph: await fingerprintDependencyGraph(
      root,
      ["src/domain/midi/analysis.ts"],
    ),
    evaluatorDependencyGraph: await fingerprintDependencyGraph(
      root,
      [
        "scripts/phase515/evaluate-baseline.ts",
        "scripts/phase515/comparisonPolicy.ts",
        "scripts/phase515/privacy.ts",
        "scripts/phase515/externalSuites.ts",
        "scripts/phase515/regressionComparison.ts",
        "scripts/evaluate-phase5-accuracy-first.ts",
        "scripts/evaluate-phase43-voicing.ts",
        "docs/phase5.15/00-evaluation-contract.md",
      ],
    ),
    externalSuites,
    // Accuracy/correctness fields are recomputed and compared, while noisy
    // wall-clock observations remain the reviewed Stage-00 capture even when
    // emitting a source-fingerprint candidate.
    existingCorpusBaselines: preserveFrozenRuntimeObservations(
      existingCorpusBaselines,
      frozen.existingCorpusBaselines,
    ),
    buildArtifacts: {
      productName: buildArtifactInspection.productName,
      version: buildArtifactInspection.version,
      packageVersion: buildArtifactInspection.packageVersion,
      frozenFingerprints: reviewedBuildFingerprints,
    },
    privacy: {
      trackedMidi: trackedMidi as 0,
      trackedLocalEvaluation: trackedLocalEvaluation as 0,
      trackedBuildArtifacts: trackedBuildArtifacts as 0,
      trackedReviewedArtifactFiles,
      artifactScanIssueCount: privacyIssues.length as 0,
    },
    preflight: {
      phase514StackIntegrated: true,
      phase514FlStudioSmoke: "PASS (user-confirmed 2026-07-30)",
      manifestValidation: "PASS",
    },
    syntheticInventory: {
      caseCount: corpus.cases.length as 36,
      cases: corpus.cases.map((item) => ({
        id: item.id,
        midiSha256: item.midi.sha256,
        byteLength: item.midi.byteLength,
      })),
    },
    holdout,
  });
}

function evaluatePhase514RoundTrip() {
  const qualities: readonly ChordQuality[] = [
    "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7",
    "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4", "dom7sus4",
    "add9", "six", "min6", "sixNine",
  ];
  const vocabulary = qualities.map((quality, index) =>
    makeChordSymbol((index * 5) % 12, quality));
  const exported = buildProgressionMidi(blockFromChords(vocabulary));
  const analysis = analyzeMidi(exported.bytes, {
    mode: "legacy",
    fileName: "phase5.14-round-trip.mid",
  });
  const comparisons = vocabulary.map((expected, index) => {
    const startBeat = index * 4;
    const actual = analysis.fullTimeline.find((item) => {
      const itemStart = (item.bar - 1) * 4 + item.beat - 1;
      return itemStart <= startBeat && startBeat < itemStart + item.durationBeats;
    });
    return {
      index,
      expected: expected.label,
      actual: actual?.chord.label,
      classification: classifyRoundTrip(expected, actual?.chord),
    };
  });
  const classifications = [
    "exact",
    "same-root-different-quality",
    "same-family",
    "mismatch",
    "missing",
  ] as const;
  return {
    schemaVersion: 1,
    analyzerMode: "legacy",
    analyzerVersion: analysis.analyzerVersion,
    exporterVersion: "p5.14-v1",
    vocabularySize: vocabulary.length,
    timelineEvents: analysis.fullTimeline.length,
    counts: Object.fromEntries(classifications.map((classification) => [
      classification,
      comparisons.filter((item) => item.classification === classification).length,
    ])) as Record<(typeof classifications)[number], number>,
    comparisons,
    gate: {
      timeline21Of21: analysis.fullTimeline.length === 21,
      exact19: comparisons.filter((item) => item.classification === "exact").length === 19,
      ambiguity2: comparisons.filter((item) =>
        item.classification === "same-root-different-quality").length === 2,
    },
  };
}

function blockFromChords(chords: readonly ChordSymbol[]): SavedProgressionBlock {
  return {
    id: "phase5.14-round-trip",
    summaryText: "Synthetic round trip",
    chords: chords.map((chord, index) => ({
      eventId: `event-${index + 1}`,
      bar: index + 1,
      beat: 1,
      durationBeats: 4,
      chord,
      confidence: 1,
      alternatives: [],
      warnings: [],
    })),
    bpm: 120,
    timeSignature: "4/4",
    tags: [],
    capturedAt: "2026-07-30T00:00:00.000Z",
    analyzerVersion: "synthetic",
  };
}

function classifyRoundTrip(
  expected: ChordSymbol,
  actual: ChordSymbol | undefined,
): "exact" | "same-root-different-quality" | "same-family" | "mismatch" | "missing" {
  if (!actual) return "missing";
  if (
    expected.root === actual.root
    && expected.quality === actual.quality
    && (expected.bass ?? expected.root) === (actual.bass ?? actual.root)
  ) return "exact";
  if (expected.root === actual.root) return "same-root-different-quality";
  if (qualityFamily(expected.quality) === qualityFamily(actual.quality)) return "same-family";
  return "mismatch";
}

function qualityFamily(quality: ChordQuality): string {
  if (["maj", "maj7", "maj9", "add9", "six", "sixNine"].includes(quality)) return "major";
  if (["min", "min7", "min9", "min11", "min6"].includes(quality)) return "minor";
  if (["dom7", "dom9", "dom13", "dom7sus4"].includes(quality)) return "dominant";
  if (["dim", "dim7", "min7b5"].includes(quality)) return "diminished";
  if (["sus2", "sus4"].includes(quality)) return "suspended";
  return quality;
}

async function evaluateRuntime(
  corpus: Phase515CorpusContract,
  caseEvaluations: readonly CaseEvaluation[],
) {
  const runtimeCase = corpus.cases.find((item) =>
    item.id === corpus.partitions.runtimeOnly[0])!;
  const runtimeBytes = await readCaseBytes(runtimeCase);
  const warmup = analyzeMidi(runtimeBytes, { fileName: runtimeCase.filename });
  const deterministicReference = sha256(JSON.stringify(
    normalizedAnalysis(warmup, runtimeCase.midi.timeSignature),
  ));
  let deterministicRuntimeCase = true;
  let maxObservedPostAnalysisRssBytes = process.memoryUsage().rss;
  const samples = Array.from({ length: 7 }, () => {
    const started = performance.now();
    const analysis = analyzeMidi(runtimeBytes, { fileName: runtimeCase.filename });
    deterministicRuntimeCase &&= sha256(JSON.stringify(
      normalizedAnalysis(analysis, runtimeCase.midi.timeSignature),
    )) === deterministicReference;
    maxObservedPostAnalysisRssBytes = Math.max(
      maxObservedPostAnalysisRssBytes,
      process.memoryUsage().rss,
    );
    return performance.now() - started;
  });
  const heapBefore = process.memoryUsage().heapUsed;
  const rssBefore = process.memoryUsage().rss;
  let maximumCatalogSize = 0;
  const repeatedRssBytes: number[] = [rssBefore];
  const repeatedHeapBytes: number[] = [heapBefore];
  for (let index = 0; index < 20; index += 1) {
    const analysis = analyzeMidi(runtimeBytes, { fileName: runtimeCase.filename });
    maximumCatalogSize = Math.max(
      maximumCatalogSize,
      analysis.candidateCatalog?.patterns.length ?? 0,
    );
    const usage = process.memoryUsage();
    maxObservedPostAnalysisRssBytes = Math.max(
      maxObservedPostAnalysisRssBytes,
      usage.rss,
    );
    repeatedRssBytes.push(usage.rss);
    repeatedHeapBytes.push(usage.heapUsed);
  }
  const heapAfter = process.memoryUsage().heapUsed;
  const rssAfter = process.memoryUsage().rss;
  const fortyFile = await evaluateFortyFileBatch(root);
  const suran = await runtimeFile(
    ".local-evaluation/phase4.1/fixtures/suran-remix.mid",
  );
  const endless = await runtimeFile(
    ".local-evaluation/phase4.1.1/fixtures/endless.mid",
  );
  const allInstruments = await runtimeFile(
    ".local-evaluation/midi/all_instruments.mid",
  );
  return {
    schemaVersion: 1,
    phase: "P5.15-00",
    analyzer: { mode: defaultAnalyzerMode, version: analyzerVersion },
    syntheticNonHoldout: {
      caseCount: caseEvaluations.length,
      runtimeMs: summarize(caseEvaluations.map((item) => item.runtimeMs)),
    },
    threeMinute: {
      caseId: runtimeCase.id,
      iterations: samples.length,
      runtimeMs: summarize(samples),
      maxObservedPostAnalysisRssBytes,
      maxObservedPostAnalysisRssMiB: rounded(
        maxObservedPostAnalysisRssBytes / 1024 / 1024,
      ),
      underTenSeconds: Math.max(...samples) < 10_000,
      maximumCandidateCatalogSize: maximumCatalogSize,
      repeatedAnalysis: {
        iterations: 20,
        heapDeltaBytes: heapAfter - heapBefore,
        rssDeltaBytes: rssAfter - rssBefore,
        rssBytes: summarize(repeatedRssBytes),
        heapUsedBytes: summarize(repeatedHeapBytes),
        firstHalfRssMedian: percentile(
          [...repeatedRssBytes.slice(1, 11)].sort((left, right) => left - right),
          0.5,
        ),
        secondHalfRssMedian: percentile(
          [...repeatedRssBytes.slice(11)].sort((left, right) => left - right),
          0.5,
        ),
        note: "In-process Windows-compatible RSS observations; Node GC is not forced.",
      },
    },
    fortyFileBatch: fortyFile,
    namedRuntimeOnly: { suran, endless, allInstruments },
    liveMidi: benchmarkLiveMidiLatency(),
    chordDojo: benchmarkChordDojo(),
    gates: {
      threeMinuteUnderTenSeconds: Math.max(...samples) < 10_000,
      fortyFileBatchCompletedOrSkipped:
        fortyFile.status === "SKIPPED" || fortyFile.completed === 40,
      deterministicRuntimeCase,
      memoryLeakConclusion:
        "No leak conclusion from one process; freeze observational deltas for regression comparison.",
    },
  };
}

async function runtimeFile(path: string) {
  const absolute = resolve(root, path);
  if (!await exists(absolute)) return { path, exists: false };
  const bytes = new Uint8Array(await readFile(
    await safeResolveExistingWithinRoot(root, path),
  ));
  const started = performance.now();
  const analysis = analyzeMidi(bytes);
  return {
    path,
    exists: true,
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    runtimeMs: rounded(performance.now() - started),
    timelineEvents: analysis.fullTimeline.length,
    candidateCatalogSize: analysis.candidateCatalog?.patterns.length ?? 0,
  };
}

function benchmarkChordDojo() {
  const requirements = [
    makeChordSymbol(0, "maj7"),
    makeChordSymbol(2, "min7"),
    makeChordSymbol(7, "dom7", ["b9"]),
    makeChordSymbol(5, "maj9"),
  ].map((chord) => buildPracticeChordRequirements(chord, "normal"));
  const inputs: PracticeInputSnapshot[] = [
    practiceSnapshot([48, 52, 55, 59], 1),
    practiceSnapshot([50, 53, 57, 60], 2),
    practiceSnapshot([43, 47, 50, 53, 56], 3),
    practiceSnapshot([53, 57, 60, 64, 67], 4),
  ];
  for (let warmup = 0; warmup < 10_000; warmup += 1) {
    matchPerformance(
      requirements[warmup % requirements.length]!,
      inputs[warmup % inputs.length]!,
    );
  }
  const batchSize = 1_000;
  const samples = Array.from({ length: 50 }, (_, batch) => {
    const started = performance.now();
    for (let index = 0; index < batchSize; index += 1) {
      const offset = batch * batchSize + index;
      matchPerformance(
        requirements[offset % requirements.length]!,
        inputs[offset % inputs.length]!,
      );
    }
    return (performance.now() - started) / batchSize;
  });
  return {
    operations: samples.length * batchSize,
    millisecondsPerOperation: summarize(samples),
  };
}

function practiceSnapshot(
  heldMidiNotes: number[],
  attackRevision: number,
): PracticeInputSnapshot {
  return {
    heldMidiNotes,
    sustainedMidiNotes: [],
    attackRevision,
    timestampMs: attackRevision * 10,
  };
}

async function readCaseBytes(item: Phase515ContractCase): Promise<Uint8Array> {
  return renderContractMidi(item);
}

async function verifyTrackedReport(name: string, current: unknown) {
  const path = resolve(outputRoot, name);
  const frozen: unknown = JSON.parse(await readFile(path, "utf8"));
  const expected = deterministicReportProjection(name, frozen);
  const actual = deterministicReportProjection(name, current);
  if (stableJson(expected) !== stableJson(actual)) {
    throw new Error(`Tracked baseline report deterministic-field drift: ${name}.`);
  }
}

function deterministicReportProjection(name: string, value: unknown): unknown {
  const cloned = structuredClone(value) as Record<string, unknown>;
  const runtimeObservationKeys = new Set([
    "runtimeMs",
    "runtimePerFileP50Ms",
    "runtimePerFileP90Ms",
  ]);
  if (name === "00-data-inventory.json") {
    if (Array.isArray(cloned.existingCorpora)) {
      cloned.existingCorpora = cloned.existingCorpora.map((item) => {
        const record = { ...(item as Record<string, unknown>) };
        delete record.exists;
        delete record.sha256;
        return record;
      });
    }
    if (Array.isArray(cloned.externalSuiteVerification)) {
      cloned.externalSuiteVerification = cloned.externalSuiteVerification.map((item) => {
        const record = { ...(item as Record<string, unknown>) };
        delete record.exists;
        delete record.status;
        return record;
      });
    }
    delete cloned.existingCorpusExecution;
    const artifacts = cloned.buildArtifacts as Record<string, unknown> | undefined;
    if (artifacts) {
      delete artifacts.current;
      delete artifacts.frozenFingerprints;
    }
    const canonical = cloned.canonicalManifest as Record<string, unknown> | undefined;
    if (canonical) delete canonical.localExternalValidation;
    return omitKeysRecursively(cloned, runtimeObservationKeys);
  }
  if (name === "00-current-failure-matrix.json") {
    const manifestGate = cloned.manifestGate as Record<string, unknown> | undefined;
    if (manifestGate) delete manifestGate.localExternalCorpus;
    delete cloned.existingCorpusExecution;
    delete cloned.holdoutVerification;
    return omitKeysRecursively(cloned, runtimeObservationKeys);
  }
  if (name === "00-runtime-baseline.json") {
    const threeMinute = cloned.threeMinute as Record<string, unknown> | undefined;
    return {
      schemaVersion: cloned.schemaVersion,
      phase: cloned.phase,
      analyzer: cloned.analyzer,
      syntheticNonHoldout: omitKeysRecursively(
        cloned.syntheticNonHoldout,
        new Set(["runtimeMs"]),
      ),
      threeMinute: threeMinute
        ? {
          caseId: threeMinute.caseId,
          iterations: threeMinute.iterations,
          underTenSeconds: threeMinute.underTenSeconds,
          maximumCandidateCatalogSize: threeMinute.maximumCandidateCatalogSize,
          repeatedIterations:
            (threeMinute.repeatedAnalysis as Record<string, unknown> | undefined)
              ?.iterations,
        }
        : undefined,
      liveMidi: cloned.liveMidi,
      gates: {
        deterministicRuntimeCase:
          (cloned.gates as Record<string, unknown> | undefined)
            ?.deterministicRuntimeCase,
      },
    };
  }
  return cloned;
}

function omitKeysRecursively(value: unknown, keys: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => omitKeysRecursively(item, keys));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !keys.has(key))
      .map(([key, child]) => [key, omitKeysRecursively(child, keys)]));
  }
  return value;
}

function gitNulPaths(args: string[]): string[] {
  const output = execFileSync("git", args, { cwd: root });
  return output.toString("utf8").split("\0").filter((path) => path.length > 0);
}

function evaluateExistingCorpusBaselines(frozenContractSha256: string) {
  const output = execFileSync(process.execPath, [
    resolve(root, "node_modules/vite-node/vite-node.mjs"),
    resolve(root, "scripts/evaluate-phase5-accuracy-first.ts"),
    "--p515-safe-non-holdout",
    ...frozenSafeEvaluatorArgs(frozenContractSha256),
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const marker = "P515_SAFE_RESULT=";
  const line = output.split(/\r?\n/).find((item) => item.startsWith(marker));
  if (!line) {
    throw new Error("Safe existing-corpus evaluator did not emit its result.");
  }
  const raw = JSON.parse(line.slice(marker.length)) as {
    holdoutEvaluated: boolean;
    aliases: {
      phase45Development40: string;
      phase5AccuracyFirst: string;
      candidateUnion: string;
    };
    corpora: Array<{
      id: string;
      sourceKind: string;
      caseCount: number;
      eventCount: number;
      modes: Array<Record<string, unknown>>;
    }>;
    voicingGold: {
      evaluator: string;
      splits: Array<{
        split: "dev" | "validation";
        fileCount: number;
        eventCount: number;
        condition: "D";
        policy: "sourceFaithfulMidi";
        metrics: Record<string, number>;
      }>;
    };
  };
  if (raw.holdoutEvaluated !== false) {
    throw new Error("Safe existing-corpus evaluator opened Holdout.");
  }
  const metric = (mode: Record<string, unknown>) => ({
    id: String(mode.id),
    analyzerVersion: String(mode.analyzerVersion),
    canonicalExact: Number(mode.canonicalExact),
    usableAccuracy: Number(mode.usableAccuracy),
    rootAccuracy: Number(mode.rootAccuracy),
    qualityAccuracy: Number(mode.qualityAccuracy),
    seventhAccuracy: Number(mode.seventhAccuracy),
    tensionAccuracy: Number(mode.tensionAccuracy),
    slashBassAccuracy: Number(mode.slashBassAccuracy),
    rank1: Number(mode.rank1Adoption),
    top3Canonical: Number(mode.top3Canonical),
    top3Root: Number(mode.top3Root),
    candidateRecall: Number(mode.candidateRecall),
    unionCandidateRecall: Number(mode.unionCandidateRecall),
    candidateCatalogRescueCount: Number(mode.candidateCatalogRescueCount),
    correctionCostTotal: Number(mode.correctionCostTotal),
    correctionCostMean: Number(mode.correctionCostMean),
    manualInputRate: Number(mode.manualInputRate),
    catalogManualInputRate: Number(mode.catalogManualInputRate),
    rank2Or3RescueRate: Number(mode.rank2Or3RescueRate),
    correctionsPerEightEvents: Number(mode.correctionsPerEightEvents),
    duplicateCandidates: Number(mode.duplicateCandidates),
    maxCandidatesPerEvent: Number(mode.maxCandidatesPerEvent),
    deterministic: mode.deterministic === true,
    runtimeMs: Number(mode.runtimeMs),
    runtimePerFileP50Ms: Number(mode.runtimePerFileP50Ms),
    runtimePerFileP90Ms: Number(mode.runtimePerFileP90Ms),
  });
  return existingCorpusBaselinesSchema.parse({
    schemaVersion: 1,
    holdoutEvaluated: false,
    aliases: raw.aliases,
    corpora: raw.corpora.map((corpus) => ({
      id: corpus.id,
      sourceKind: corpus.sourceKind,
      caseCount: corpus.caseCount,
      eventCount: corpus.eventCount,
      conditions: corpus.modes.map(metric),
    })),
    voicingGold: raw.voicingGold.splits.map((split) => ({
      split: split.split,
      fileCount: split.fileCount,
      eventCount: split.eventCount,
      condition: split.condition,
      policy: split.policy,
      metrics: split.metrics,
    })),
  });
}

function preserveFrozenRuntimeObservations(
  current: ReturnType<typeof evaluateExistingCorpusBaselines>,
  frozen: BaselineLock["existingCorpusBaselines"],
): ReturnType<typeof evaluateExistingCorpusBaselines> {
  const result = structuredClone(current);
  const frozenCorpora = new Map(frozen.corpora.map((item) => [item.id, item]));
  for (const corpus of result.corpora) {
    const locked = frozenCorpora.get(corpus.id);
    if (!locked) continue;
    const lockedConditions = new Map(
      locked.conditions.map((item) => [item.id, item]),
    );
    for (const condition of corpus.conditions) {
      const lockedCondition = lockedConditions.get(condition.id);
      if (!lockedCondition) continue;
      condition.runtimeMs = lockedCondition.runtimeMs;
      condition.runtimePerFileP50Ms = lockedCondition.runtimePerFileP50Ms;
      condition.runtimePerFileP90Ms = lockedCondition.runtimePerFileP90Ms;
    }
  }
  return result;
}

async function deriveProductContract() {
  const schemaSource = await readFile(resolve(root, "src/domain/schema.ts"), "utf8");
  const repositorySource = await readFile(
    resolve(root, "src/domain/repository.ts"),
    "utf8",
  );
  const vaultStoreSource = await readFile(resolve(root, "src/store/vaultStore.ts"), "utf8");
  const schemaMatch = schemaSource.match(/fileVersion:\s*z\.literal\((\d+)\)/);
  const repositoryMatches = [...repositorySource.matchAll(/fileVersion:\s*(\d+)/g)]
    .map((match) => Number(match[1]));
  const storeMatches = [...vaultStoreSource.matchAll(/fileVersion:\s*(\d+)/g)]
    .map((match) => Number(match[1]));
  if (!schemaMatch) throw new Error("Unable to derive vault fileVersion from schema.ts.");
  const fileVersion = Number(schemaMatch[1]);
  if (
    !Number.isInteger(fileVersion)
    || !repositoryMatches.includes(fileVersion)
    || !storeMatches.includes(fileVersion)
  ) {
    throw new Error("Vault fileVersion sources disagree.");
  }
  return {
    defaultAnalyzerMode,
    analyzerVersion,
    fileVersion,
  };
}

async function hashFile(path: string): Promise<string> {
  return sha256(new Uint8Array(await readFile(path)));
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function summarize(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: values.length,
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: rounded(sorted.at(-1) ?? 0),
  };
}

function summarizeErrors(values: readonly number[]) {
  return {
    count: values.length,
    mae: average(values),
    p95: percentile([...values].sort((left, right) => left - right), 0.95),
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return rounded(sorted[index] ?? 0);
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return rounded(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item)
          .sort(([left], [right]) => compareCodePoints(left, right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}
