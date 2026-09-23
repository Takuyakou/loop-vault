/** P5.40-02 evaluation only. Private identities stay in Git-ignored output. */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, stderr, stdout } from "node:process";

import { parseMidi } from "../../src/domain/midi/parser";
import { discoverLfMidi001Candidates } from "../p538/privateFixtureDiscovery";
import { type LocalRegionBinding } from "../p539/groundTruthPacket";
import { selectSinglePrivateCandidate } from "../p539/privatePromotionRunner";
import { type LocalSafetyBinding } from "../p539/stage03cSafetyPacket";
import { evaluateStage03bInteractions, projectedStateAt, projectStage03bTimeline } from "../p539/stage03bInteraction";
import { parseShadowChordLabel, shadowIdentityKey, type ShadowRootRelativeIdentity } from "../p539/shadowRootRelativeIdentity";
import { rankStage01ShadowCandidates } from "./shadowCandidateGenerationCorrection";

const ENTRYPOINT = /(?:^|\/)run-stage02-private-safety\.(?:[cm]?js|ts)$/;

function ignoredJson(path: string): unknown {
  const absolute = resolve(path);
  execFileSync("git", ["check-ignore", "-q", "--", absolute], { stdio: "ignore" });
  return JSON.parse(readFileSync(absolute, "utf8")) as unknown;
}

function regions<T>(path: string, count: number): T[] {
  const value = ignoredJson(path);
  if (!value || typeof value !== "object" || !("regions" in value)
    || !Array.isArray(value.regions) || value.regions.length !== count) {
    throw new Error("Frozen binding unavailable");
  }
  return value.regions as T[];
}

function labelKey(label: string): string {
  const parsed = parseShadowChordLabel(label);
  const key = parsed && shadowIdentityKey(parsed);
  if (!key) throw new Error("Frozen identity unavailable");
  return key;
}

function outputDirectory(): string {
  const root = resolve(".local-evaluation");
  const output = resolve(root, "p540-02-private-safety");
  if (lstatSync(root).isSymbolicLink() || existsSync(output)) {
    throw new Error("Private output location unavailable");
  }
  execFileSync("git", ["check-ignore", "-q", "--", output], { stdio: "ignore" });
  return output;
}

function main(): void {
  const entry = argv.findIndex((arg) => ENTRYPOINT.test(arg.replace(/\\/g, "/")));
  if (entry < 0 || argv.length !== entry + 2) throw new Error("One private input directory required");
  const output = outputDirectory();
  const source = selectSinglePrivateCandidate(discoverLfMidi001Candidates(argv[entry + 1]!));
  const bytes = new Uint8Array(readFileSync(source));
  const originalBytes = Uint8Array.from(bytes);
  const originalParsed = JSON.stringify(parseMidi(bytes));
  const prior = regions<LocalRegionBinding>(
    ".local-evaluation/p539-03a-review/sealed-binding.private.json", 2,
  );
  const safety = regions<LocalSafetyBinding>(
    ".local-evaluation/p539-03c-review/sealed-binding.private.json", 3,
  );
  const truth = ignoredJson(".local-evaluation/p540-00-source-review/human-ground-truth.private.json") as {
    sourceOnlyReviewed?: boolean;
    frozenBeforeCurrentScoreReview?: boolean;
    decisions?: Record<string, { classification?: string; identity?: ShadowRootRelativeIdentity }>;
  };
  const localPrefix = safety[2]?.id;
  if (prior[0]?.id !== "FC-REAL-01" || prior[1]?.id !== "FC-REAL-02"
    || safety.map((row) => row.id).join(",") !== "FC-SAFETY-01,FC-SAFETY-02,FC-SAFETY-03"
    || !truth.sourceOnlyReviewed || !truth.frozenBeforeCurrentScoreReview || !localPrefix
    || Object.keys(truth.decisions ?? {}).sort().join(",")
      !== `${localPrefix}-L0,${localPrefix}-L1`) {
    throw new Error("Frozen independent truth unavailable");
  }

  const baseline = evaluateStage03bInteractions(bytes);
  const shadow = evaluateStage03bInteractions(bytes, rankStage01ShadowCandidates);
  if (JSON.stringify(baseline.data) !== JSON.stringify(shadow.data)
    || baseline.windows.length !== shadow.windows.length) {
    throw new Error("Shadow window evidence drift");
  }
  const baselineFinal = projectStage03bTimeline(baseline.data, baseline.windows, "model-a");
  const shadowFinal = projectStage03bTimeline(shadow.data, shadow.windows, "model-a");
  const state = (spans: typeof shadowFinal, index: number, offset: number): string => {
    const found = projectedStateAt(spans, index * 2 + offset + 0.5);
    if (!found) throw new Error("Final state unavailable");
    return found.identityKey;
  };
  const byIndex = new Map(shadow.windows.map((row) => [row.index, row]));
  const reviewed = new Set([...prior, ...safety].map((row) => row.windowIndex));
  if (reviewed.size !== 5 || [...reviewed].some((index) => !byIndex.has(index))) {
    throw new Error("Frozen region binding drift");
  }
  const firstChoice = prior[0]!.choices.B;
  if (firstChoice.origin !== "shadow") throw new Error("Frozen first choice drift");
  const real01 = [0, 1].every((offset) => state(shadowFinal, prior[0]!.windowIndex, offset)
    === labelKey(firstChoice.label));
  const real02 = state(shadowFinal, prior[1]!.windowIndex, 0)
    !== state(shadowFinal, prior[1]!.windowIndex, 1);
  const safetyResults = safety.slice(0, 2).map((binding) => {
    const selected = binding.choices.B;
    if (selected.origin !== "model-a") throw new Error("Frozen safety choice drift");
    return [0, 1].every((offset) => state(shadowFinal, binding.windowIndex, offset)
      === labelKey(selected.beatLabels[offset]!));
  });
  const local = [0, 1].map((offset) => {
    const decision = truth.decisions?.[`${localPrefix}-L${offset}`];
    if (decision?.classification !== "CONFIRMED-IDENTITY" || !decision.identity) {
      throw new Error("Frozen local truth unavailable");
    }
    const expected = shadowIdentityKey(decision.identity);
    if (!expected) throw new Error("Frozen local identity invalid");
    const row = byIndex.get(safety[2]!.windowIndex)!;
    const pair = offset === 0 ? row.b0 : row.b1;
    if (!pair) throw new Error("Local candidate evidence unavailable");
    const matched = pair.result.rankedCandidates.find((candidate) => candidate.identityKey === expected);
    return {
      id: `${localPrefix}-L${offset}`,
      expected,
      generated: !!matched,
      rank: matched?.rank ?? null,
      winner: pair.expanded.identityKey,
      winnerMatchesTruth: pair.expanded.identityKey === expected,
      finalMatchesTruth: state(shadowFinal, safety[2]!.windowIndex, offset) === expected,
    };
  });
  const changed = shadow.windows.flatMap((row) => [0, 1].flatMap((offset) => (
    state(shadowFinal, row.index, offset) === state(baselineFinal, row.index, offset)
      ? [] : [{ windowIndex: row.index, offset }]
  )));
  const unreviewed = changed.filter((entry) => !reviewed.has(entry.windowIndex));
  const visits = shadow.windows.flatMap((row) => [row.w2, row.b0, row.b1]
    .filter((pair): pair is NonNullable<typeof pair> => pair !== null)
    .map((pair) => pair.result.candidateVisits));
  const repeated = Array.from({ length: 3 }, () => {
    const again = evaluateStage03bInteractions(bytes, rankStage01ShadowCandidates);
    return JSON.stringify(again.windows) === JSON.stringify(shadow.windows)
      && JSON.stringify(projectStage03bTimeline(again.data, again.windows, "model-a"))
        === JSON.stringify(shadowFinal);
  });
  const sourceUnchanged = bytes.length === originalBytes.length
    && bytes.every((value, index) => value === originalBytes[index])
    && JSON.stringify(parseMidi(bytes)) === originalParsed;
  if (visits.some((value) => value < 276 || value > 300)
    || !repeated.every(Boolean) || !sourceUnchanged) {
    throw new Error("Bound, determinism, or source fidelity failed");
  }
  const aggregate = {
    comparableRegions: shadow.windows.length,
    candidateVisits: { min: Math.min(...visits), max: Math.max(...visits) },
    changedFinalBeatsVsFrozenShadow: changed.length,
    changedRegionsVsFrozenShadow: new Set(changed.map((entry) => entry.windowIndex)).size,
    unreviewedChangedRegions: new Set(unreviewed.map((entry) => entry.windowIndex)).size,
    real01Protected: real01,
    real02TemporalProtected: real02,
    confirmedSafetyProtected: safetyResults.filter(Boolean).length,
    confirmedSafetyTotal: safetyResults.length,
    localTruthFinalMatches: local.filter((row) => row.finalMatchesTruth).length,
    localTruthTotal: local.length,
    localTruthGenerated: local.filter((row) => row.generated).length,
    localTruthTopRanked: local.filter((row) => row.winnerMatchesTruth).length,
    finalTemporalSplit: state(shadowFinal, safety[2]!.windowIndex, 0)
      !== state(shadowFinal, safety[2]!.windowIndex, 1),
    deterministicRepeats: repeated.filter(Boolean).length,
    sourceUnchanged,
  };
  mkdirSync(output);
  const artifact = resolve(output, "safety-evaluation.private.json");
  execFileSync("git", ["check-ignore", "-q", "--", artifact], { stdio: "ignore" });
  writeFileSync(artifact, `${JSON.stringify({
    schemaVersion: 1, aggregate, local, changed, unreviewed, baselineFinal, shadowFinal,
  }, null, 2)}\n`);
  stdout.write(`${JSON.stringify(aggregate)}\n`);
  stdout.write("privateArtifactIgnored=true\n");
}

try {
  main();
} catch {
  stderr.write("Stage02 private Shadow safety evaluation could not complete.\n");
  process.exitCode = 1;
}
