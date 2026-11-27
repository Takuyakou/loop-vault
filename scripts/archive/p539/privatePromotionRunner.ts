import type { FamilyCPromotionPrivateAggregate } from "./privatePromotionEvaluation";

const PRIVATE_AGGREGATE_KEYS = [
  "fixtureId",
  "candidateCount",
  "candidateVisitDefinition",
  "candidateVisits",
  "totalComparableRegions",
  "existingRepresentableRegions",
  "newFamilyCCandidateWins",
  "legacyIdentitiesUnchanged",
  "changedIdentities",
  "knownImprovements",
  "changeReview",
  "targetFamilies",
  "ambiguityAssessment",
  "classificationConserved",
  "deterministic",
  "sourceBytesUnchanged",
  "sourceNotesAndTimingUnchanged",
] as const;

const FORBIDDEN_OUTPUT_KEY = /(?:file(?:name)?|path|checksum|hash|rawNotes|audio|progression|sourcePosition|timelinePosition|chordRoot)$/i;

const CHANGE_REVIEW_KEYS = [
  "CONFIRMED-KNOWN-TARGET",
  "SUPPORTED-LIKELY-CORRECTION",
  "UNRESOLVED",
  "SUSPICIOUS",
] as const;

const TARGET_FAMILY_KEYS = [
  "anonymousFamily",
  "independentGroundTruthBinding",
  "privateRepresentability",
  "privateCandidatePresence",
  "privateRankMovement",
  "canonicalPrivateResult",
] as const;

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Private evaluation output ${label} must be an object`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const allowed = [...allowedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(allowed)) {
    throw new Error(`Private evaluation output ${label} does not match its allowlist`);
  }
}

function assertNonNegativeInteger(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Private evaluation output ${label} must be a non-negative integer`);
  }
}

function assertBoolean(value: unknown, label: string): void {
  if (typeof value !== "boolean") {
    throw new Error(`Private evaluation output ${label} must be a boolean`);
  }
}

function assertPrivateAggregateShape(value: unknown): asserts value is FamilyCPromotionPrivateAggregate {
  assertRecord(value, "aggregate");
  assertExactKeys(value, PRIVATE_AGGREGATE_KEYS, "aggregate");

  if (value.fixtureId !== "LF-MIDI-001") {
    throw new Error("Private evaluation output fixtureId is invalid");
  }
  if (value.candidateCount !== 276) {
    throw new Error("Private evaluation output candidateCount is invalid");
  }
  if (value.candidateVisitDefinition
    !== "one score evaluation for one fixed generated candidate in one harmonic window") {
    throw new Error("Private evaluation output candidateVisitDefinition is invalid");
  }

  assertRecord(value.candidateVisits, "candidateVisits");
  assertExactKeys(value.candidateVisits, ["min", "max"], "candidateVisits");
  assertNonNegativeInteger(value.candidateVisits.min, "candidateVisits.min");
  assertNonNegativeInteger(value.candidateVisits.max, "candidateVisits.max");

  for (const key of [
    "totalComparableRegions",
    "existingRepresentableRegions",
    "newFamilyCCandidateWins",
    "legacyIdentitiesUnchanged",
    "changedIdentities",
    "knownImprovements",
  ] as const) {
    assertNonNegativeInteger(value[key], key);
  }

  assertRecord(value.changeReview, "changeReview");
  assertExactKeys(value.changeReview, CHANGE_REVIEW_KEYS, "changeReview");
  for (const key of CHANGE_REVIEW_KEYS) {
    assertNonNegativeInteger(value.changeReview[key], `changeReview.${key}`);
  }

  if (!Array.isArray(value.targetFamilies)) {
    throw new Error("Private evaluation output targetFamilies must be an array");
  }
  value.targetFamilies.forEach((target, index) => {
    const label = `targetFamilies[${index}]`;
    assertRecord(target, label);
    assertExactKeys(target, TARGET_FAMILY_KEYS, label);
    if (target.anonymousFamily !== "altered-dominant-omission"
      && target.anonymousFamily !== "dominant-11-omission") {
      throw new Error(`Private evaluation output ${label}.anonymousFamily is invalid`);
    }
    if (target.independentGroundTruthBinding !== "UNAVAILABLE"
      || target.privateRepresentability !== "NOT_VERIFIABLE"
      || target.privateCandidatePresence !== null
      || target.privateRankMovement !== null
      || target.canonicalPrivateResult !== null) {
      throw new Error(`Private evaluation output ${label} has an invalid assessment shape`);
    }
  });

  if (value.ambiguityAssessment !== "UNVERIFIED") {
    throw new Error("Private evaluation output ambiguityAssessment is invalid");
  }
  if (value.classificationConserved !== true) {
    throw new Error("Private evaluation output classificationConserved is invalid");
  }
  for (const key of [
    "deterministic",
    "sourceBytesUnchanged",
    "sourceNotesAndTimingUnchanged",
  ] as const) {
    assertBoolean(value[key], key);
  }
}

function assertPrivacySafeValue(value: unknown, key?: string): void {
  if (key && FORBIDDEN_OUTPUT_KEY.test(key)) {
    throw new Error("Private evaluation output contains a forbidden field");
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => assertPrivacySafeValue(entry));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([entryKey, entryValue]) => {
      assertPrivacySafeValue(entryValue, entryKey);
    });
  }
}

export function selectSinglePrivateCandidate(candidates: readonly string[]): string {
  if (candidates.length !== 1) {
    throw new Error("LF-MIDI-001 could not be selected uniquely from privacy-safe metadata");
  }
  return candidates[0]!;
}

const PRIVATE_EVALUATION_ENTRYPOINT = /(?:^|\/)run-stage03-private-evaluation\.(?:[cm]?js|ts)$/;

export function selectPrivateEvaluationDirectory(processArgv: readonly string[]): string {
  const entrypointIndex = processArgv.findIndex((entry) => (
    PRIVATE_EVALUATION_ENTRYPOINT.test(entry.replace(/\\/g, "/"))
  ));
  if (entrypointIndex < 0) {
    throw new Error("private evaluation entrypoint could not be identified");
  }
  const userArgs = processArgv.slice(entrypointIndex + 1);
  if (userArgs.length !== 1 || !userArgs[0]) {
    throw new Error("private evaluation directory argument required");
  }
  return userArgs[0];
}

export function serializePrivatePromotionAggregate(
  aggregate: FamilyCPromotionPrivateAggregate,
): string {
  assertPrivateAggregateShape(aggregate);
  assertPrivacySafeValue(aggregate);
  return JSON.stringify(aggregate);
}
