/** P5.40-02a private diagnostic and source-only blind packet; never prints source detail. */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, stderr, stdout } from "node:process";

import { makeChordSymbol } from "../../src/domain/chords";
import { chordPitchSet } from "../../src/domain/midi/candidateDiversity";
import { buildWeightedWindows, inferTrackRoles } from "../../src/domain/midi/legacy";
import { parseMidi } from "../../src/domain/midi/parser";
import { discoverLfMidi001Candidates } from "../p538/privateFixtureDiscovery";
import {
  buildBlindExcerptMidi,
  buildBlindRegionEvidence,
  type AnonymousRegionId,
  type LocalRegionBinding,
} from "../p539/groundTruthPacket";
import { selectSinglePrivateCandidate } from "../p539/privatePromotionRunner";
import { type LocalSafetyBinding } from "../p539/stage03cSafetyPacket";
import type { ShadowRankedCandidate } from "../p539/shadowCandidateRanking";
import { evaluateStage03bInteractions, projectedStateAt, projectStage03bTimeline } from "../p539/stage03bInteraction";
import type { ShadowRootRelativeIdentity } from "../p539/shadowRootRelativeIdentity";
import { rankStage01ShadowCandidates } from "./shadowCandidateGenerationCorrection";
import { isolateLocalFailure, isolateWindowDivergence, plannedWindowStates, renderStage02aSourceOnly } from "./stage02aFailureIsolation";

const ENTRYPOINT = /(?:^|\/)run-stage02a-failure-isolation\.(?:[cm]?js|ts)$/;
const NEW_REVIEW_ID = "FC-NEW-01";

function ignored(path: string): string {
  const absolute = resolve(path);
  execFileSync("git", ["check-ignore", "-q", "--", absolute], { stdio: "ignore" });
  return absolute;
}

function ignoredJson(path: string): unknown {
  return JSON.parse(readFileSync(ignored(path), "utf8")) as unknown;
}

function regions<T>(path: string, count: number): T[] {
  const value = ignoredJson(path);
  if (!value || typeof value !== "object" || !("regions" in value)
    || !Array.isArray(value.regions) || value.regions.length !== count) {
    throw new Error("Frozen anonymous binding unavailable");
  }
  return value.regions as T[];
}

function outputDirectory(path: string): string {
  const root = resolve(".local-evaluation");
  const output = ignored(path);
  if (!output.startsWith(`${root}\\`) || lstatSync(root).isSymbolicLink() || existsSync(output)) {
    throw new Error("Private output location unavailable");
  }
  return output;
}

function familyBW2Pcs(winner: ShadowRankedCandidate): number[] {
  if (winner.productionQuality) {
    return chordPitchSet(makeChordSymbol(winner.identity.rootPitchClass, winner.productionQuality));
  }
  return [...new Set(winner.upperIntervals.map((interval) => (
    (winner.identity.rootPitchClass + interval) % 12
  )))];
}

function main(): void {
  const entry = argv.findIndex((arg) => ENTRYPOINT.test(arg.replace(/\\/g, "/")));
  if (entry < 0 || argv.length !== entry + 2) throw new Error("One private input directory required");
  const diagnosisOutput = outputDirectory(".local-evaluation/p540-02a-private-diagnosis");
  const packetOutput = outputDirectory(".local-evaluation/p540-02a-source-review");
  const source = selectSinglePrivateCandidate(discoverLfMidi001Candidates(argv[entry + 1]!));
  const bytes = new Uint8Array(readFileSync(source));
  const originalParsed = JSON.stringify(parseMidi(bytes));
  const prior = regions<LocalRegionBinding>(".local-evaluation/p539-03a-review/sealed-binding.private.json", 2);
  const safety = regions<LocalSafetyBinding>(".local-evaluation/p539-03c-review/sealed-binding.private.json", 3);
  const truth = ignoredJson(".local-evaluation/p540-00-source-review/human-ground-truth.private.json") as {
    sourceOnlyReviewed?: boolean;
    frozenBeforeCurrentScoreReview?: boolean;
    decisions?: Record<string, { classification?: string; identity?: ShadowRootRelativeIdentity }>;
  };
  const stage02 = ignoredJson(".local-evaluation/p540-02-private-safety/safety-evaluation.private.json") as {
    aggregate?: { comparableRegions?: number; changedFinalBeatsVsFrozenShadow?: number;
      changedRegionsVsFrozenShadow?: number; unreviewedChangedRegions?: number };
    unreviewed?: Array<{ windowIndex: number; offset: number }>;
  };
  if (prior.map((row) => row.id).join(",") !== "FC-REAL-01,FC-REAL-02"
    || safety.map((row) => row.id).join(",") !== "FC-SAFETY-01,FC-SAFETY-02,FC-SAFETY-03"
    || !truth.sourceOnlyReviewed || !truth.frozenBeforeCurrentScoreReview
    || Object.keys(truth.decisions ?? {}).sort().join(",") !== "FC-SAFETY-03-L0,FC-SAFETY-03-L1"
    || stage02.aggregate?.comparableRegions !== 33
    || stage02.aggregate.changedFinalBeatsVsFrozenShadow !== 5
    || stage02.aggregate.changedRegionsVsFrozenShadow !== 3
    || stage02.aggregate.unreviewedChangedRegions !== 1) {
    throw new Error("Frozen Stage02 evidence or independent truth unavailable");
  }

  const frozen = evaluateStage03bInteractions(bytes);
  const shadow = evaluateStage03bInteractions(bytes, rankStage01ShadowCandidates);
  if (JSON.stringify(frozen.data) !== JSON.stringify(shadow.data)) {
    throw new Error("Source-derived window evidence changed between ranking paths");
  }
  const frozenFinal = projectStage03bTimeline(frozen.data, frozen.windows, "model-a");
  const shadowFinal = projectStage03bTimeline(shadow.data, shadow.windows, "model-a");
  const state = (spans: typeof frozenFinal, index: number, offset: number): string => {
    const found = projectedStateAt(spans, index * 2 + offset + 0.5);
    if (!found) throw new Error("Projected state unavailable");
    return found.identityKey;
  };
  const byIndex = new Map(shadow.windows.map((row) => [row.index, row]));
  const frozenByIndex = new Map(frozen.windows.map((row) => [row.index, row]));
  const reviewed = new Set([...prior, ...safety].map((row) => row.windowIndex));
  if (frozen.windows.length !== 33 || shadow.windows.length !== 33 || reviewed.size !== 5) {
    throw new Error("Frozen window set drift");
  }
  const changed = shadow.windows.flatMap((row) => [0, 1].flatMap((offset) => (
    state(frozenFinal, row.index, offset) === state(shadowFinal, row.index, offset)
      ? [] : [{ windowIndex: row.index, offset }]
  )));
  const unreviewed = changed.filter((item) => !reviewed.has(item.windowIndex));
  if (changed.length !== 5 || new Set(changed.map((item) => item.windowIndex)).size !== 3
    || new Set(unreviewed.map((item) => item.windowIndex)).size !== 1
    || JSON.stringify(unreviewed) !== JSON.stringify(stage02.unreviewed)) {
    throw new Error("Stage02 whole-file selection drift");
  }
  const newIndex = unreviewed[0]!.windowIndex;
  const selected = [prior[0]!.windowIndex, safety[2]!.windowIndex, newIndex];
  if (new Set(selected).size !== 3) throw new Error("Diagnostic region collision");
  const traces = selected.map((index) => {
    const old = frozenByIndex.get(index);
    const next = byIndex.get(index);
    if (!old || !next) throw new Error("Selected window unavailable");
    return { index, trace: isolateWindowDivergence(old, next,
      [0, 1].map((offset) => state(frozenFinal, index, offset)),
      [0, 1].map((offset) => state(shadowFinal, index, offset))) };
  });
  const confirmedTrace = traces[0]!.trace;
  const splitTrace = traces[1]!.trace;
  if (!confirmedTrace.rankingChanged || !splitTrace.rankingChanged
    || !splitTrace.frozenDecision.triggered || splitTrace.shadowDecision.triggered) {
    throw new Error("Frozen causal signature unavailable");
  }

  const roles = inferTrackRoles(shadow.data);
  const oneBeatWindows = buildWeightedWindows(shadow.data, roles, 1);
  const local = [0, 1].map((offset) => {
    const decision = truth.decisions?.[`FC-SAFETY-03-L${offset}`];
    if (decision?.classification !== "CONFIRMED-IDENTITY" || !decision.identity) {
      throw new Error("Frozen local classification unavailable");
    }
    const window = byIndex.get(safety[2]!.windowIndex)!;
    const pair = offset === 0 ? window.b0 : window.b1;
    if (!pair) throw new Error("Local ranking unavailable");
    return { id: `FC-SAFETY-03-L${offset}`,
      ...isolateLocalFailure(pair.result, decision.identity) };
  });
  const matrix = traces.map(({ index, trace }) => ({
    index,
    bucketEvidence: [0, 1].map((offset) => {
      const window = oneBeatWindows[index * 2 + offset];
      if (!window) throw new Error("Source bucket unavailable");
      return { histogram: window.histogram, bassHistogram: window.bassHistogram,
        totalWeight: window.totalWeight };
    }),
    frozen: { ranking: trace.frozenWinners, familyB: trace.frozenDecision,
      familyBW2Pcs: familyBW2Pcs(frozenByIndex.get(index)!.w2.expanded),
      smoothingInput: trace.frozenPlanned, smoothingOutput: trace.frozenFinal },
    shadow: { ranking: trace.shadowWinners, familyB: trace.shadowDecision,
      familyBW2Pcs: familyBW2Pcs(byIndex.get(index)!.w2.expanded),
      familyBOffSmoothingOff: [byIndex.get(index)!.w2.expanded.identityKey],
      familyBOnSmoothingOff: plannedWindowStates(byIndex.get(index)!),
      familyBOnSmoothingOn: trace.shadowFinal,
      smoothingInput: trace.shadowPlanned, smoothingOutput: trace.shadowFinal },
    trace,
  }));
  const repeated = Array.from({ length: 3 }, () => {
    const next = evaluateStage03bInteractions(bytes, rankStage01ShadowCandidates);
    return JSON.stringify(next.windows) === JSON.stringify(shadow.windows)
      && JSON.stringify(projectStage03bTimeline(next.data, next.windows, "model-a"))
        === JSON.stringify(shadowFinal);
  });
  const visits = shadow.windows.flatMap((row) => [row.w2, row.b0, row.b1]
    .filter((pair): pair is NonNullable<typeof pair> => pair !== null)
    .map((pair) => pair.result.candidateVisits));
  const afterBytes = new Uint8Array(readFileSync(source));
  const sourceUnchanged = bytes.length === afterBytes.length
    && bytes.every((value, index) => value === afterBytes[index])
    && JSON.stringify(parseMidi(afterBytes)) === originalParsed;
  if (!sourceUnchanged || !repeated.every(Boolean)
    || visits.some((value) => value < 276 || value > 300)) {
    throw new Error("Source fidelity, determinism or candidate bound failed");
  }

  // Review material is derived exclusively from the parsed source after the
  // anonymous location is selected. No candidate or origin enters this packet.
  const raw = parseMidi(bytes);
  const blind = buildBlindRegionEvidence(raw, newIndex * 2, NEW_REVIEW_ID as AnonymousRegionId);
  const html = renderStage02aSourceOnly([blind]);
  const excerpt = buildBlindExcerptMidi(blind, raw.tempo ?? 120);
  const categories = Object.fromEntries([...new Set(local.map((row) => row.category))].map((category) => (
    [category, local.filter((row) => row.category === category).length]
  )));
  const aggregate = {
    localStates: local.length,
    categories,
    generatedExact: local.filter((row) => row.literalGenerated).length,
    generatedButMisranked: local.filter((row) => row.category === "GENERATED-BUT-MISRANKED").length,
    confirmedRegionFirstDivergence: confirmedTrace.firstDivergence,
    confirmedRegionFamilyBTriggerChanged: confirmedTrace.triggerChanged,
    splitLossFirstCausalStage: splitTrace.firstDivergence,
    splitLossFamilyBTriggerChanged: splitTrace.triggerChanged,
    splitLossSmoothingCausal: splitTrace.smoothingCausal,
    splitLossTriggerInputChanges: {
      w2Winner: splitTrace.frozenWinners.w2 !== splitTrace.shadowWinners.w2,
      b0Winner: splitTrace.frozenWinners.b0 !== splitTrace.shadowWinners.b0,
      b1Winner: splitTrace.frozenWinners.b1 !== splitTrace.shadowWinners.b1,
      winnerWinsNeitherBeat: splitTrace.frozenDecision.winnerWinsNeitherBeat
        !== splitTrace.shadowDecision.winnerWinsNeitherBeat,
      bucketsDifferentIdentity: splitTrace.frozenDecision.bucketsDifferentIdentity
        !== splitTrace.shadowDecision.bucketsDifferentIdentity,
      supportSpansBothBeats: splitTrace.frozenDecision.supportSpansBothBeats
        !== splitTrace.shadowDecision.supportSpansBothBeats,
    },
    unreviewedRegions: 1,
    independentClassificationPending: true,
    candidateVisits: { min: Math.min(...visits), max: Math.max(...visits) },
    deterministicRepeats: repeated.filter(Boolean).length,
    sourceUnchanged,
  };
  mkdirSync(diagnosisOutput);
  mkdirSync(packetOutput);
  const diagnosisFile = ignored(resolve(diagnosisOutput, "failure-isolation.private.json"));
  const bindingFile = ignored(resolve(diagnosisOutput, "sealed-new-region.private.json"));
  const packetHtml = ignored(resolve(packetOutput, "source-evidence.html"));
  const packetMidi = ignored(resolve(packetOutput, `${NEW_REVIEW_ID}.mid`));
  writeFileSync(diagnosisFile, `${JSON.stringify({ schemaVersion: 1, aggregate, local, matrix,
    changed, unreviewed }, null, 2)}\n`);
  writeFileSync(bindingFile, `${JSON.stringify({ schemaVersion: 1, id: NEW_REVIEW_ID,
    windowIndex: newIndex, changedBeatOffsets: unreviewed.map((item) => item.offset) }, null, 2)}\n`);
  writeFileSync(packetHtml, html);
  writeFileSync(packetMidi, excerpt);
  stdout.write(`${JSON.stringify(aggregate)}\n`);
  stdout.write("privateDiagnosisIgnored=true\nsourceOnlyPacketIgnored=true\n");
}

try {
  main();
} catch {
  stderr.write("Stage02a private failure isolation could not complete.\n");
  process.exitCode = 1;
}
