/** One-shot P5.40-02b private safety evaluation; emits aggregates only. */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, stderr, stdout } from "node:process";

import { parseMidi } from "../../src/domain/midi/parser";
import { discoverLfMidi001Candidates } from "../p538/privateFixtureDiscovery";
import type { LocalRegionBinding } from "../p539/groundTruthPacket";
import { selectSinglePrivateCandidate } from "../p539/privatePromotionRunner";
import type { LocalSafetyBinding } from "../p539/stage03cSafetyPacket";
import { projectedStateAt, projectStage03bTimeline } from "../p539/stage03bInteraction";
import { parseShadowChordLabel, shadowIdentityKey, type ShadowRootRelativeIdentity } from "../p539/shadowRootRelativeIdentity";
import { evaluateStage02bFinalShadow } from "./stage02bFinalShadow";

const ENTRYPOINT = /(?:^|\/)run-stage02b-private-safety\.(?:[cm]?js|ts)$/;

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
  const output = ignored(resolve(root, "p540-02b-private-safety"));
  if (lstatSync(root).isSymbolicLink() || existsSync(output)) {
    throw new Error("One-shot private output already exists");
  }
  return output;
}

function key(label: string): string {
  const parsed = parseShadowChordLabel(label, true);
  const identityKey = parsed && shadowIdentityKey(parsed);
  if (!identityKey) throw new Error("Frozen identity is outside Shadow grammar");
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
    throw new Error("Source-first temporal partition invalid");
  }
  return states;
}

function main(): void {
  const entry = argv.findIndex((arg) => ENTRYPOINT.test(arg.replace(/\\/g, "/")));
  if (entry < 0 || argv.length !== entry + 2) throw new Error("One private input directory required");
  const output = outputDirectory();
  const gtText = readFileSync(ignored(".local-evaluation/p540-02a-source-review/FC-NEW-01-ground-truth.private.md"), "utf8");
  const newStates = sourceFirstStates(gtText);
  const prior = bindings<LocalRegionBinding>(".local-evaluation/p539-03a-review/sealed-binding.private.json", 2);
  const safety = bindings<LocalSafetyBinding>(".local-evaluation/p539-03c-review/sealed-binding.private.json", 3);
  const newBinding = readPrivateJson(".local-evaluation/p540-02a-private-diagnosis/sealed-new-region.private.json") as {
    id?: string; windowIndex?: number;
  };
  const truth = readPrivateJson(".local-evaluation/p540-00-source-review/human-ground-truth.private.json") as {
    sourceOnlyReviewed?: boolean; frozenBeforeCurrentScoreReview?: boolean;
    decisions?: Record<string, { classification?: string; identity?: ShadowRootRelativeIdentity }>;
  };
  const stage02 = readPrivateJson(".local-evaluation/p540-02-private-safety/safety-evaluation.private.json") as {
    aggregate?: { comparableRegions?: number; changedFinalBeatsVsFrozenShadow?: number;
      changedRegionsVsFrozenShadow?: number; unreviewedChangedRegions?: number };
  };
  if (prior.map((row) => row.id).join(",") !== "FC-REAL-01,FC-REAL-02"
    || safety.map((row) => row.id).join(",") !== "FC-SAFETY-01,FC-SAFETY-02,FC-SAFETY-03"
    || newBinding.id !== "FC-NEW-01" || !Number.isInteger(newBinding.windowIndex)
    || !truth.sourceOnlyReviewed || !truth.frozenBeforeCurrentScoreReview
    || stage02.aggregate?.comparableRegions !== 33
    || stage02.aggregate.changedFinalBeatsVsFrozenShadow !== 5
    || stage02.aggregate.changedRegionsVsFrozenShadow !== 3
    || stage02.aggregate.unreviewedChangedRegions !== 1) {
    throw new Error("Frozen comparison input drift");
  }

  const source = selectSinglePrivateCandidate(discoverLfMidi001Candidates(argv[entry + 1]!));
  const bytes = new Uint8Array(readFileSync(source));
  const originalParsed = JSON.stringify(parseMidi(bytes));
  const evaluated = evaluateStage02bFinalShadow(bytes);
  const frozenFinal = projectStage03bTimeline(evaluated.data, evaluated.frozen, "model-a");
  const at = (index: number, relativeBeat: number): string => {
    const state = projectedStateAt(evaluated.final, index * 2 + relativeBeat);
    if (!state) throw new Error("Final state unavailable");
    return state.identityKey;
  };
  const real01Key = key(prior[0]!.choices.B.label);
  if (prior[0]!.choices.B.origin !== "shadow") throw new Error("Frozen first origin drift");
  const real01Protected = [0.5, 1.5].every((beat) => at(prior[0]!.windowIndex, beat) === real01Key);
  const real02TemporalProtected = at(prior[1]!.windowIndex, 0.5) !== at(prior[1]!.windowIndex, 1.5);
  const safetyProtected = safety.slice(0, 2).map((row) => {
    if (row.choices.B.origin !== "model-a") throw new Error("Frozen safety origin drift");
    return [0.5, 1.5].every((beat, offset) => (
      at(row.windowIndex, beat) === key(row.choices.B.beatLabels[offset]!)
    ));
  });
  const local = [0, 1].map((offset) => {
    const decision = truth.decisions?.[`FC-SAFETY-03-L${offset}`];
    if (decision?.classification !== "CONFIRMED-IDENTITY" || !decision.identity) {
      throw new Error("Frozen local identity unavailable");
    }
    const expected = shadowIdentityKey(decision.identity);
    const window = evaluated.corrected.find((row) => row.index === safety[2]!.windowIndex);
    const pair = offset === 0 ? window?.b0 : window?.b1;
    if (!expected || !pair) throw new Error("Local candidate unavailable");
    return {
      expected, generated: pair.result.rankedCandidates.some((candidate) => candidate.identityKey === expected),
      topRanked: pair.expanded.identityKey === expected,
      finalMatches: at(safety[2]!.windowIndex, offset + 0.5) === expected,
    };
  });
  const safetySplit = at(safety[2]!.windowIndex, 0.5) !== at(safety[2]!.windowIndex, 1.5);
  const newIndex = newBinding.windowIndex!;
  const newMatches = newStates.every((state) => (
    at(newIndex, (state.start + state.end) / 2) === state.identityKey
  ));
  const newTemporalProtected = new Set(newStates.map((state) => (
    at(newIndex, (state.start + state.end) / 2)
  ))).size > 1;

  const reviewed = new Set([...prior, ...safety].map((row) => row.windowIndex));
  reviewed.add(newIndex);
  if (reviewed.size !== 6 || evaluated.corrected.length !== 33) {
    throw new Error("Reviewed binding or whole-file window drift");
  }
  const changed = evaluated.corrected.flatMap((row) => [0.25, 0.75, 1.25, 1.75].flatMap((beat) => (
    at(row.index, beat) === projectedStateAt(frozenFinal, row.index * 2 + beat)?.identityKey
      ? [] : [{ windowIndex: row.index, offset: beat }]
  )));
  const unreviewed = changed.filter((item) => !reviewed.has(item.windowIndex));
  const visits = [
    ...evaluated.corrected.flatMap((row) => [row.w2, row.b0, row.b1]
      .filter((pair): pair is NonNullable<typeof pair> => pair !== null)
      .map((pair) => pair.result.candidateVisits)),
    ...evaluated.traces.flatMap((trace) => trace.halfBeatRankings.map((result) => result.candidateVisits)),
  ];
  const signature = (value: typeof evaluated): string => JSON.stringify({
    windows: value.corrected.map((row) => ({
      index: row.index,
      w2: row.w2.expanded.identityKey,
      b0: row.b0?.expanded.identityKey ?? null,
      b1: row.b1?.expanded.identityKey ?? null,
      decision: row.expandedDecision,
      visits: [row.w2, row.b0, row.b1].map((pair) => pair?.result.candidateVisits ?? null),
    })),
    traces: value.traces.map((trace) => ({
      index: trace.index, preSmoothing: trace.preSmoothing,
      halfTop: trace.halfBeatRankings.map((result) => result.topCandidate.identityKey),
      halfVisits: trace.halfBeatRankings.map((result) => result.candidateVisits),
    })),
    final: value.final,
  });
  const firstSignature = signature(evaluated);
  const repeated = Array.from({ length: 3 }, () => (
    signature(evaluateStage02bFinalShadow(bytes)) === firstSignature
  ));
  const afterBytes = new Uint8Array(readFileSync(source));
  const sourceUnchanged = bytes.length === afterBytes.length
    && bytes.every((value, index) => value === afterBytes[index])
    && JSON.stringify(parseMidi(afterBytes)) === originalParsed;
  const boundPass = visits.length > 0 && visits.every((value) => value >= 276 && value <= 300);
  const familyBProtected = evaluated.traces.every((trace) => trace.guardedTriggered === trace.frozenTriggered);
  const unsafeReviewed = [
    !real01Protected, !real02TemporalProtected, ...safetyProtected.map((pass) => !pass),
    !(local.every((row) => row.finalMatches) && safetySplit),
    !(newMatches && newTemporalProtected),
  ].filter(Boolean).length;
  const unreviewedRegions = new Set(unreviewed.map((item) => item.windowIndex)).size;
  const suspicious = unsafeReviewed + unreviewedRegions;
  const pass = suspicious === 0 && familyBProtected && boundPass
    && repeated.every(Boolean) && sourceUnchanged;
  const aggregate = {
    comparableRegions: evaluated.corrected.length,
    changedRegionsVsFrozenShadow: new Set(changed.map((item) => item.windowIndex)).size,
    changedHalfBeatsVsFrozenShadow: changed.length,
    newlyChangedUnreviewedRegions: unreviewedRegions,
    unresolvedSafetyDivergences: unsafeReviewed,
    suspicious,
    real01Protected, real02TemporalProtected,
    confirmedSafetyProtected: safetyProtected.filter(Boolean).length,
    confirmedSafetyTotal: safetyProtected.length,
    localTruthGenerated: local.filter((row) => row.generated).length,
    localTruthTopRanked: local.filter((row) => row.topRanked).length,
    localTruthFinalMatches: local.filter((row) => row.finalMatches).length,
    localTruthTotal: local.length,
    requiredSplitProtected: safetySplit,
    newTemporalProtected, newExactStatesMatch: newMatches,
    familyBProtected,
    candidateVisits: { min: Math.min(...visits), max: Math.max(...visits) },
    deterministicRepeats: repeated.filter(Boolean).length,
    sourceUnchanged,
    privateSafety: pass ? "PASS" : "FAIL",
  };
  mkdirSync(output);
  const artifact = ignored(resolve(output, "final-safety.private.json"));
  writeFileSync(artifact, `${JSON.stringify({
    schemaVersion: 1, aggregate, newStates, local, changed, unreviewed,
    frozenFinal,
    corrected: evaluated.corrected.map((row) => ({
      index: row.index,
      w2: row.w2.expanded,
      b0: row.b0?.expanded ?? null,
      b1: row.b1?.expanded ?? null,
      decision: row.expandedDecision,
      visits: [row.w2, row.b0, row.b1].map((pair) => pair?.result.candidateVisits ?? null),
    })),
    traces: evaluated.traces.map((trace) => ({
      index: trace.index,
      frozenTriggered: trace.frozenTriggered,
      correctedTriggered: trace.correctedTriggered,
      guardedTriggered: trace.guardedTriggered,
      microPartitioned: trace.microPartitioned,
      preSmoothing: trace.preSmoothing,
      halfTop: trace.halfBeatRankings.map((result) => result.topCandidate),
      halfVisits: trace.halfBeatRankings.map((result) => result.candidateVisits),
    })),
    final: evaluated.final,
  }, null, 2)}\n`);
  stdout.write(`${JSON.stringify(aggregate)}\n`);
  stdout.write("privateArtifactIgnored=true\n");
}

try {
  main();
} catch {
  stderr.write("Stage02b private Shadow safety evaluation could not complete.\n");
  process.exitCode = 1;
}
