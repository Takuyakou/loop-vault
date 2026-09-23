/** One-shot P5.40-02c private safety evaluation; stdout is anonymous aggregates only. */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, stderr, stdout } from "node:process";

import { parseMidi } from "../../src/domain/midi/parser";
import { discoverLfMidi001Candidates } from "../p538/privateFixtureDiscovery";
import type { LocalRegionBinding } from "../p539/groundTruthPacket";
import { selectSinglePrivateCandidate } from "../p539/privatePromotionRunner";
import type { LocalSafetyBinding } from "../p539/stage03cSafetyPacket";
import { projectedStateAt } from "../p539/stage03bInteraction";
import { parseShadowChordLabel, shadowIdentityKey, type ShadowRootRelativeIdentity } from "../p539/shadowRootRelativeIdentity";
import { evaluateStage02cSafeActivation } from "./stage02cSafeActivation";

const ENTRYPOINT = /(?:^|\/)run-stage02c-private-safety\.(?:[cm]?js|ts)$/;

function ignored(path: string): string {
  const absolute = resolve(path);
  execFileSync("git", ["check-ignore", "-q", "--", absolute], { stdio: "ignore" });
  return absolute;
}

function readPrivateJson(path: string): unknown {
  return JSON.parse(readFileSync(ignored(path), "utf8")) as unknown;
}

function bindings<T>(path: string, count: number): T[] {
  const value = readPrivateJson(path);
  if (!value || typeof value !== "object" || !("regions" in value)
    || !Array.isArray(value.regions) || value.regions.length !== count) {
    throw new Error("Frozen binding unavailable");
  }
  return value.regions as T[];
}

function outputDirectory(): string {
  const root = resolve(".local-evaluation");
  const output = ignored(resolve(root, "p540-02c-private-safety"));
  if (lstatSync(root).isSymbolicLink() || existsSync(output)) {
    throw new Error("One-shot private output already exists");
  }
  return output;
}

function key(label: string): string {
  const parsed = parseShadowChordLabel(label, true);
  const identityKey = parsed && shadowIdentityKey(parsed);
  if (!identityKey) throw new Error("Frozen identity unavailable");
  return identityKey;
}

function sourceFirstStates(text: string): Array<{ start: number; end: number; identityKey: string }> {
  if (!text.includes("TEMPORAL-MIXTURE") || !text.includes("Candidate origin remains sealed.")) {
    throw new Error("Independent source-first freeze unavailable");
  }
  const sections = [...text.matchAll(/### Beat ([0-9.]+)–([0-9.]+)\r?\n([\s\S]*?)(?=\r?\n### Beat |\r?\n## Scope of freeze)/g)];
  const states = sections.map((match) => {
    const label = /^- Identity: (.+)$/m.exec(match[3]!)?.[1]?.trim();
    if (!label) throw new Error("Source-first identity unavailable");
    return { start: Number(match[1]), end: Number(match[2]), identityKey: key(label) };
  });
  if (states.length < 2 || states[0]!.start !== 0 || states.at(-1)!.end !== 2
    || states.some((state, index) => !Number.isFinite(state.start)
      || !Number.isFinite(state.end) || state.start >= state.end
      || (index > 0 && states[index - 1]!.end !== state.start))) {
    throw new Error("Frozen temporal states invalid");
  }
  return states;
}

function main(): void {
  const entry = argv.findIndex((arg) => ENTRYPOINT.test(arg.replace(/\\/g, "/")));
  if (entry < 0 || argv.length !== entry + 2) throw new Error("One private input directory required");
  const output = outputDirectory();
  const newStates = sourceFirstStates(readFileSync(ignored(
    ".local-evaluation/p540-02a-source-review/FC-NEW-01-ground-truth.private.md",
  ), "utf8"));
  const prior = bindings<LocalRegionBinding>(".local-evaluation/p539-03a-review/sealed-binding.private.json", 2);
  const safety = bindings<LocalSafetyBinding>(".local-evaluation/p539-03c-review/sealed-binding.private.json", 3);
  const newBinding = readPrivateJson(".local-evaluation/p540-02a-private-diagnosis/sealed-new-region.private.json") as {
    id?: string; windowIndex?: number;
  };
  const truth = readPrivateJson(".local-evaluation/p540-00-source-review/human-ground-truth.private.json") as {
    sourceOnlyReviewed?: boolean; frozenBeforeCurrentScoreReview?: boolean;
    decisions?: Record<string, { classification?: string; identity?: ShadowRootRelativeIdentity }>;
  };
  const stage02b = readPrivateJson(".local-evaluation/p540-02b-private-safety/final-safety.private.json") as {
    aggregate?: { comparableRegions?: number; newlyChangedUnreviewedRegions?: number;
      unresolvedSafetyDivergences?: number; localTruthFinalMatches?: number };
  };
  if (prior.map((row) => row.id).join(",") !== "FC-REAL-01,FC-REAL-02"
    || safety.map((row) => row.id).join(",") !== "FC-SAFETY-01,FC-SAFETY-02,FC-SAFETY-03"
    || newBinding.id !== "FC-NEW-01" || !Number.isInteger(newBinding.windowIndex)
    || !truth.sourceOnlyReviewed || !truth.frozenBeforeCurrentScoreReview
    || stage02b.aggregate?.comparableRegions !== 33
    || stage02b.aggregate.newlyChangedUnreviewedRegions !== 8
    || stage02b.aggregate.unresolvedSafetyDivergences !== 2
    || stage02b.aggregate.localTruthFinalMatches !== 2) {
    throw new Error("Frozen comparison input drift");
  }

  const source = selectSinglePrivateCandidate(discoverLfMidi001Candidates(argv[entry + 1]!));
  const bytes = new Uint8Array(readFileSync(source));
  const originalParsed = JSON.stringify(parseMidi(bytes));
  const evaluated = evaluateStage02cSafeActivation(bytes);
  const at = (index: number, relativeBeat: number): string => {
    const state = projectedStateAt(evaluated.final, index * 2 + relativeBeat);
    if (!state) throw new Error("Final state unavailable");
    return state.identityKey;
  };
  if (prior[0]!.choices.B.origin !== "shadow"
    || safety.slice(0, 2).some((row) => row.choices.B.origin !== "model-a")) {
    throw new Error("Frozen reviewed origin drift");
  }
  const real01Protected = [0.5, 1.5].every((beat) => at(prior[0]!.windowIndex, beat)
    === key(prior[0]!.choices.B.label));
  const real02TemporalProtected = at(prior[1]!.windowIndex, 0.5)
    !== at(prior[1]!.windowIndex, 1.5);
  const confirmedProtected = safety.slice(0, 2).map((row) => [0.5, 1.5].every((beat, offset) => (
    at(row.windowIndex, beat) === key(row.choices.B.beatLabels[offset]!)
  )));
  const local = [0, 1].map((offset) => {
    const decision = truth.decisions?.[`FC-SAFETY-03-L${offset}`];
    if (decision?.classification !== "CONFIRMED-IDENTITY" || !decision.identity) {
      throw new Error("Frozen local identity unavailable");
    }
    const expected = shadowIdentityKey(decision.identity);
    const window = evaluated.windows.find((row) => row.index === safety[2]!.windowIndex);
    const pair = offset === 0 ? window?.b0 : window?.b1;
    if (!expected || !pair) throw new Error("Local candidate unavailable");
    return {
      expected,
      generated: pair.result.rankedCandidates.some((candidate) => candidate.identityKey === expected),
      topRanked: pair.expanded.identityKey === expected,
      finalMatches: at(safety[2]!.windowIndex, offset + 0.5) === expected,
    };
  });
  const requiredSplit = at(safety[2]!.windowIndex, 0.5) !== at(safety[2]!.windowIndex, 1.5);
  const newIndex = newBinding.windowIndex!;
  const newExactStatesMatch = newStates.every((state) => (
    at(newIndex, (state.start + state.end) / 2) === state.identityKey
  ));
  const newTemporalProtected = new Set(newStates.map((state) => (
    at(newIndex, (state.start + state.end) / 2)
  ))).size > 1;

  const reviewed = new Set([...prior, ...safety].map((row) => row.windowIndex));
  reviewed.add(newIndex);
  if (reviewed.size !== 6 || evaluated.windows.length !== 33) {
    throw new Error("Reviewed binding or whole-file window drift");
  }
  const changed = evaluated.windows.flatMap((row) => [0.25, 0.75, 1.25, 1.75].flatMap((beat) => (
    at(row.index, beat) === projectedStateAt(evaluated.baselineFinal, row.index * 2 + beat)?.identityKey
      ? [] : [{ windowIndex: row.index, offset: beat }]
  )));
  const changedBeats = evaluated.windows.flatMap((row) => [0.5, 1.5].filter((beat) => (
    at(row.index, beat) !== projectedStateAt(evaluated.baselineFinal, row.index * 2 + beat)?.identityKey
  ))).length;
  const unreviewed = changed.filter((item) => !reviewed.has(item.windowIndex));
  const unreviewedRegions = new Set(unreviewed.map((item) => item.windowIndex)).size;
  const visits = evaluated.traces.flatMap((trace) => trace.candidateVisits);
  const boundPass = visits.length > 0 && visits.every((count) => count >= 276 && count <= 300);
  const signature = (value: typeof evaluated): string => JSON.stringify({
    windows: value.windows.map((row) => ({
      index: row.index, w2: row.w2.expanded.identityKey,
      b0: row.b0?.expanded.identityKey ?? null,
      b1: row.b1?.expanded.identityKey ?? null,
      visits: [row.w2, row.b0, row.b1].map((pair) => pair?.result.candidateVisits ?? null),
    })),
    traces: value.traces,
    baselineFinal: value.baselineFinal,
    final: value.final,
  });
  const firstSignature = signature(evaluated);
  const repeated = Array.from({ length: 3 }, () => (
    signature(evaluateStage02cSafeActivation(bytes)) === firstSignature
  ));
  const afterBytes = new Uint8Array(readFileSync(source));
  const sourceUnchanged = bytes.length === afterBytes.length
    && bytes.every((value, index) => value === afterBytes[index])
    && JSON.stringify(parseMidi(afterBytes)) === originalParsed;
  const familyBChanged = evaluated.traces.filter((trace) => (
    trace.finalTriggered !== trace.baselineTriggered
  ));
  const uncertifiedPartitionChanges = familyBChanged.filter((trace) => !trace.temporalCertified).length;
  const unresolvedReviewed = [
    !real01Protected, !real02TemporalProtected, ...confirmedProtected.map((pass) => !pass),
    !(local.every((row) => row.finalMatches) && requiredSplit),
    !(newTemporalProtected && newExactStatesMatch),
  ].filter(Boolean).length;
  const suspicious = unresolvedReviewed + unreviewedRegions;
  const changedClasses = { identity: 0, partition: 0, micro: 0, smoothingOnly: 0 };
  for (const index of new Set(changed.map((item) => item.windowIndex))) {
    const trace = evaluated.traces.find((item) => item.index === index)!;
    if (trace.microPartitioned) changedClasses.micro += 1;
    else if (trace.finalTriggered !== trace.baselineTriggered) changedClasses.partition += 1;
    else if (trace.selectedPlan.some((span, ordinal) => span.identityKey !== trace.baselinePlan[ordinal]?.identityKey)) {
      changedClasses.identity += 1;
    } else changedClasses.smoothingOnly += 1;
  }
  const reasons = { certified: 0, structural: 0, conflict: 0, noImprovement: 0 };
  for (const trace of evaluated.traces) {
    for (const reason of [trace.w2, trace.b0, trace.b1, ...trace.halfReasons]) {
      if (reason === "certified") reasons.certified += 1;
      else if (reason === "structural") reasons.structural += 1;
      else if (reason === "conflict") reasons.conflict += 1;
      else if (reason === "no-improvement") reasons.noImprovement += 1;
    }
  }
  const pass = suspicious === 0 && local.every((row) => row.finalMatches)
    && requiredSplit && newTemporalProtected && newExactStatesMatch
    && real01Protected && real02TemporalProtected && confirmedProtected.every(Boolean)
    && uncertifiedPartitionChanges === 0 && boundPass
    && repeated.every(Boolean) && sourceUnchanged;
  const aggregate = {
    comparableRegions: evaluated.windows.length,
    changedFinalRegions: new Set(changed.map((item) => item.windowIndex)).size,
    changedFinalBeats: changedBeats,
    changedFinalHalfBeats: changed.length,
    newlyChangedUnreviewedRegions: unreviewedRegions,
    unresolvedReviewedDivergences: unresolvedReviewed,
    suspicious,
    confirmedRegionsPreserved: Number(real01Protected) + confirmedProtected.filter(Boolean).length,
    confirmedRegionsTotal: 3,
    protectedTemporalRegionsPreserved: Number(real02TemporalProtected) + Number(requiredSplit)
      + Number(newTemporalProtected),
    protectedTemporalRegionsTotal: 3,
    localTruthGenerated: local.filter((row) => row.generated).length,
    localTruthTopRanked: local.filter((row) => row.topRanked).length,
    localTruthFinalMatches: local.filter((row) => row.finalMatches).length,
    localTruthTotal: local.length,
    newExactStatesMatch,
    familyBPartitionChanges: familyBChanged.length,
    uncertifiedPartitionChanges,
    changedClasses,
    certificateReasons: reasons,
    microPartitions: evaluated.traces.filter((trace) => trace.microPartitioned).length,
    candidateVisits: { min: Math.min(...visits), max: Math.max(...visits) },
    deterministicRepeats: repeated.filter(Boolean).length,
    sourceUnchanged,
    shadowSafety: pass ? "PASS" : "FAIL",
  };
  mkdirSync(output);
  writeFileSync(ignored(resolve(output, "final-safety.private.json")), `${JSON.stringify({
    schemaVersion: 1,
    aggregate,
    local,
    newStates,
    changed,
    unreviewed,
    baselineFinal: evaluated.baselineFinal,
    final: evaluated.final,
    traces: evaluated.traces,
  }, null, 2)}\n`);
  stdout.write(`${JSON.stringify(aggregate)}\n`);
  stdout.write("privateArtifactIgnored=true\n");
}

try {
  main();
} catch {
  stderr.write("Stage02c private Shadow safety evaluation could not complete.\n");
  process.exitCode = 1;
}
