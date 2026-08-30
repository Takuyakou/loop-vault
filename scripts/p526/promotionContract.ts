export const p526FlagsContract = {
  existing: {
    name: "enableHarmonicStateConsolidation",
    enabledOnlyWhen: "literal true",
    default: false,
  },
  futureTrackA: {
    name: "enableLocalHarmonicStateConsolidation",
    default: false,
    off: "deep-equal current production output",
  },
  futureTrackB: {
    name: "enableKeyAwareChordSpelling",
    default: false,
    off: "deep-equal current production output",
  },
  trackC: {
    mode: "shadow",
    defaultProductionPromotion: false,
    productionPromotionFlag: null,
  },
  userFacingSetting: false,
} as const;

export const p526PromotionContract = {
  trackA: {
    inheritedFixtures: "A-K exact pass",
    addedFixtures: "L-Q exact pass",
    hardFalseMergeFixtures: ["M", "O", "Q"],
    maximumHardFalseMerges: 0,
    requireGlobalSufficientUnchanged: true,
    requireUnknownFallback: true,
    requireDeterministic: true,
    requireBounded: true,
    requireFlagOffDeepEqual: true,
  },
  trackB: {
    requirePitchClassIdentityUnchanged: true,
    requireUnknownKeyFallback: true,
    requireNoPersistenceMigration: true,
  },
  trackC: {
    productionPromotionRequiredForPhasePass: false,
    acceptableTerminalState: "SHADOW PASS — NOT PROMOTED",
    requirePlainDominantNegative: true,
  },
} as const;

export const p526PerformancePolicy = {
  benchmarkComputationBudgetMs: 10_000,
  childProcessWatchdogMs: 30_000,
  maximumSampleMs: 2_000,
  maximumMedianRatio: 2,
  warmups: 3,
  samples: 7,
  denseMixedRepetitions: 4,
  contextRadiusBars: 1,
  maximumCandidateCellsPerBar: 4,
  complexity: "sorted events plus bar index plus bounded neighboring context",
  prohibited: "global all-event O(N^2)",
} as const;

export const p526PrivacyPolicy = {
  realFixtureId: "p526-real-001",
  storage: ".local-evaluation only",
  committedPrivateInputs: 0,
  allowPersonalAbsolutePaths: false,
  allowRawNoteDumps: false,
} as const;

export interface P526ExecutedPerformanceGate {
  readonly status: "completed";
  readonly timeoutEnforced: true;
  readonly timedOut: false;
  readonly benchmarkComputationBudgetMs: 10_000;
  readonly childProcessWatchdogMs: 30_000;
  readonly computationElapsedMs: number;
  readonly outerProcessElapsedMs: number;
  readonly sampleCount: 7;
  readonly warmupCount: 3;
  readonly noteCount: number;
  readonly medianRatio: number;
  readonly maximumSampleMs: number;
}

export function decideP526TrackAPromotion(input: {
  readonly inheritedAKPass: boolean;
  readonly addedLQPass: boolean;
  readonly hardFalseMergeCount: number;
  readonly globalSufficientUnchanged: boolean;
  readonly unknownFallback: boolean;
  readonly deterministic: boolean;
  readonly bounded: boolean;
  readonly flagOffDeepEqual: boolean;
}): "promotable" | "fail-stop-promotion" {
  if (!Number.isInteger(input.hardFalseMergeCount) || input.hardFalseMergeCount < 0) return "fail-stop-promotion";
  return input.inheritedAKPass
    && input.addedLQPass
    && input.hardFalseMergeCount === 0
    && input.globalSufficientUnchanged
    && input.unknownFallback
    && input.deterministic
    && input.bounded
    && input.flagOffDeepEqual
    ? "promotable"
    : "fail-stop-promotion";
}
