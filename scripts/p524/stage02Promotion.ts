import { aggregateP524Metrics, evaluateP524Fixture } from "./harmonicFragmentMetrics";
import { consolidateP524PerformanceFragments } from "./fragmentConsolidator";
import {
  runP524Stage02BenchmarkEnforced,
  type P524Stage02BenchmarkCompleted,
} from "./fragmentConsolidatorBenchmark";
import { generateP524SyntheticFixtures } from "./harmonicFragmentFixtures";
import {
  measureP524FreshOfficialEvidence,
  type P524FreshOfficialEvidence,
} from "./officialEvidence";
import {
  decideP524Promotion,
  type P524PromotionDecision,
  type P524PromotionInput,
} from "./promotionContract";
import {
  estimateP524BassLane,
  estimateP524HarmonicRhythm,
  toP524ShadowNotes,
  type P524ShadowInput,
} from "./shadowEvidence";

export interface P524Stage02PromotionEvidence {
  readonly input: P524PromotionInput;
  readonly decision: P524PromotionDecision;
  readonly statesByFixture: Readonly<Record<string, unknown>>;
  readonly officialEvidence: P524FreshOfficialEvidence;
}

export interface P524Stage02PromotionFailure {
  readonly decision: P524PromotionDecision;
  readonly officialEvidence: P524FreshOfficialEvidence;
}

export type P524Stage02PromotionOutcome = P524Stage02PromotionEvidence | P524Stage02PromotionFailure;

/** The authoritative path has no official-candidate argument; it always measures afresh. */
export async function runP524Stage02Promotion(): Promise<P524Stage02PromotionOutcome> {
  const officialEvidence = await measureP524FreshOfficialEvidence();
  if (officialEvidence.status !== "pass" || officialEvidence.metrics === null
    || !officialEvidence.deterministic || !officialEvidence.productionOutputsUnchanged) {
    return {
      officialEvidence,
      decision: {
        status: "fail-stop-promotion",
        reasons: officialEvidence.reasons.length > 0
          ? officialEvidence.reasons
          : ["fresh official production-equivalence evidence is unavailable"],
      },
    };
  }
  const benchmark = await runP524Stage02BenchmarkEnforced();
  if (benchmark.status !== "completed") {
    return {
      officialEvidence,
      decision: { status: "fail-stop-promotion", reasons: ["locked Stage02 benchmark timed out"] },
    };
  }
  return evaluateP524Stage02WithVerifiedOfficial(officialEvidence, benchmark);
}

export function evaluateP524Stage02WithVerifiedOfficial(
  officialEvidence: P524FreshOfficialEvidence,
  benchmark: P524Stage02BenchmarkCompleted,
): P524Stage02PromotionOutcome {
  if (officialEvidence.status !== "pass" || officialEvidence.metrics === null
    || officialEvidence.deterministic !== true || officialEvidence.productionOutputsUnchanged !== true) {
    return {
      officialEvidence,
      decision: { status: "fail-stop-promotion", reasons: ["official evidence is not freshly verified"] },
    };
  }
  const fixtures = generateP524SyntheticFixtures();
  const statesByFixture: Record<string, unknown> = {};
  const harmonicRhythmByFixture: Record<string, 1 | 2 | 4 | 8 | "unknown"> = {};
  const legacyFallbackFixtures: string[] = [];
  let deterministic = true;
  let rawMidiUnchanged = true;
  const metrics = fixtures.map((fixture) => {
    const input: P524ShadowInput = {
      notes: toP524ShadowNotes(fixture.notes), meter: fixture.meter, totalBeats: fixture.totalBeats,
    };
    const before = structuredClone(input);
    const bassLane = estimateP524BassLane(input);
    const harmonicRhythm = estimateP524HarmonicRhythm(input, bassLane);
    const result = consolidateP524PerformanceFragments(input, { bassLane, harmonicRhythm });
    const repeated = consolidateP524PerformanceFragments({ ...input, notes: [...input.notes].reverse() });
    if (result.status === "unavailable") throw new Error(`fixture ${fixture.id} consolidation unavailable`);
    deterministic = deterministic && JSON.stringify(result) === JSON.stringify(repeated);
    rawMidiUnchanged = rawMidiUnchanged && JSON.stringify(input) === JSON.stringify(before);
    harmonicRhythmByFixture[fixture.id] = harmonicRhythm.quarterBeats;
    if (harmonicRhythm.legacyFallback) legacyFallbackFixtures.push(fixture.id);
    statesByFixture[fixture.id] = result.states;
    return evaluateP524Fixture(fixture, result.states, bassLane.states);
  });
  const input: P524PromotionInput = {
    aggregate: aggregateP524Metrics(metrics),
    fixtures: metrics,
    harmonicRhythmByFixture,
    legacyFallbackFixtures,
    deterministic: deterministic && officialEvidence.deterministic,
    rawMidiUnchanged,
    productionOutputsUnchanged: officialEvidence.productionOutputsUnchanged,
    officialCandidate: officialEvidence.metrics,
    benchmark: {
      medianRatio: benchmark.medianRatio,
      maximumSampleMs: benchmark.maximumSampleMs,
      timedOut: benchmark.timedOut,
      measured: benchmark.measured,
      warmupCount: benchmark.warmupCount,
      sampleCount: benchmark.sampleCount,
      warmupDurationsMs: benchmark.warmupDurationsMs,
      sampleDurationsMs: benchmark.sampleDurationsMs,
      sampleRatios: benchmark.sampleRatios,
      timeoutMs: benchmark.timeoutMs,
      timeoutEnforced: benchmark.timeoutEnforced,
      provenance: benchmark.provenance,
      sourceFixture: benchmark.sourceFixture,
      repetitions: benchmark.repetitions,
      noteCount: benchmark.noteCount,
    },
  };
  return { input, decision: decideP524Promotion(input), statesByFixture, officialEvidence };
}

if (process.argv.includes("--run-cli")) {
  void runP524Stage02Promotion().then((evidence) => {
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
    if (evidence.decision.status !== "pass-to-integration") process.exitCode = 1;
  }).catch(() => {
    process.stderr.write("P5.24 Stage02 promotion failed closed.\n");
    process.exitCode = 1;
  });
}
