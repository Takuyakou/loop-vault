interface SummaryStats {
  median: number;
  p95: number;
  max: number;
}

interface RuntimeFileObservation {
  exists: boolean;
  runtimeMs?: number;
}

interface RuntimeObservation {
  threeMinute: {
    caseId: string;
    runtimeMs: SummaryStats;
    maxObservedPostAnalysisRssBytes: number;
    repeatedAnalysis: {
      iterations: number;
      heapDeltaBytes: number;
      rssDeltaBytes: number;
      rssBytes: SummaryStats;
      heapUsedBytes: SummaryStats;
    };
  };
  fortyFileBatch:
    | {
      status: "SKIPPED";
      requested: number;
      completed: null;
    }
    | {
      status: "COMPLETED";
      requested: number;
      completed: number;
      totalMs: number;
      perFileMs: SummaryStats;
    };
  namedRuntimeOnly: {
    suran: RuntimeFileObservation;
    endless: RuntimeFileObservation;
    allInstruments: RuntimeFileObservation;
  };
  liveMidi: unknown;
  chordDojo: unknown;
}

function namedStatus(observation: RuntimeFileObservation) {
  return observation.exists
    ? {
      status: "COMPLETED" as const,
      runtimeMs: observation.runtimeMs,
    }
    : {
      status: "SKIPPED" as const,
      runtimeMs: null,
    };
}

export function buildRuntimeObservationSummary(
  runtime: RuntimeObservation,
  mode: "read-only" | "reviewed-write" | "candidate-write" = "read-only",
) {
  return {
    schemaVersion: 1,
    phase: "P5.15-00",
    mode: `${mode}-current-observations`,
    case36: {
      caseId: runtime.threeMinute.caseId,
      runtimeMs: runtime.threeMinute.runtimeMs,
      maxObservedPostAnalysisRssBytes:
        runtime.threeMinute.maxObservedPostAnalysisRssBytes,
      repeatedMemory: runtime.threeMinute.repeatedAnalysis,
    },
    fortyFileBatch: runtime.fortyFileBatch,
    namedRuntimeOnly: {
      suran: namedStatus(runtime.namedRuntimeOnly.suran),
      endless: namedStatus(runtime.namedRuntimeOnly.endless),
      allInstruments: namedStatus(runtime.namedRuntimeOnly.allInstruments),
    },
    liveMidi: runtime.liveMidi,
    chordDojo: runtime.chordDojo,
  };
}

export function renderRuntimeObservationSummary(
  runtime: RuntimeObservation,
  mode: "read-only" | "reviewed-write" | "candidate-write" = "read-only",
): string {
  return `${JSON.stringify(buildRuntimeObservationSummary(runtime, mode))}\n`;
}
