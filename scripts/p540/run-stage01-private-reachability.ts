/** Focused ignored-local reachability only; never performs Promotion evaluation. */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, stderr, stdout } from "node:process";

import { buildWeightedWindows, inferTrackRoles } from "../../src/domain/midi/legacy";
import { parseMidi } from "../../src/domain/midi/parser";
import { selectChordEvidenceNotes } from "../../src/domain/midi/voices";
import { discoverLfMidi001Candidates } from "../p538/privateFixtureDiscovery";
import { selectSinglePrivateCandidate } from "../p539/privatePromotionRunner";
import { shadowIdentityKey, type ShadowRootRelativeIdentity } from "../p539/shadowRootRelativeIdentity";
import { rankStage01ShadowCandidates } from "./shadowCandidateGenerationCorrection";

const ENTRYPOINT = /(?:^|\/)run-stage01-private-reachability\.(?:[cm]?js|ts)$/;

interface FrozenDecision {
  id: string;
  identity: ShadowRootRelativeIdentity;
}

function ignored(path: string): void {
  execFileSync("git", ["check-ignore", "-q", "--", path], { stdio: "ignore" });
}

function inputDirectory(): string {
  const index = argv.findIndex((entry) => ENTRYPOINT.test(entry.replace(/\\/g, "/")));
  const supplied = index < 0 ? [] : argv.slice(index + 1);
  if (supplied.length !== 1 || !supplied[0]) throw new Error("One private input directory required");
  return supplied[0];
}

function frozenTruth(): { decisions: readonly FrozenDecision[]; regionId: string } {
  const path = resolve(".local-evaluation/p540-00-source-review/human-ground-truth.private.json");
  ignored(path);
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    sourceOnlyReviewed?: boolean;
    frozenBeforeCurrentScoreReview?: boolean;
    decisions?: Record<string, { classification?: string; identity?: ShadowRootRelativeIdentity }>;
  };
  const ids = Object.keys(data.decisions ?? {}).sort();
  const regionId = ids[0]?.replace(/-L0$/, "");
  if (!data.sourceOnlyReviewed || !data.frozenBeforeCurrentScoreReview
    || !data.decisions || !regionId || ids.length !== 2
    || ids[0] !== `${regionId}-L0` || ids[1] !== `${regionId}-L1`) {
    throw new Error("Independent source-first truth unavailable");
  }
  const decisions = ids.map((id) => {
    const decision = data.decisions?.[id];
    if (decision?.classification !== "CONFIRMED-IDENTITY" || !decision.identity) {
      throw new Error("Frozen local identity unavailable");
    }
    return { id, identity: decision.identity };
  });
  return { decisions, regionId };
}

function frozenWindowIndex(regionId: string): number {
  const path = resolve(".local-evaluation/p539-03c-review/sealed-binding.private.json");
  ignored(path);
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    regions?: Array<{ id?: string; windowIndex?: number }>;
  };
  const region = data.regions?.find((item) => item.id === regionId);
  if (!region || !Number.isInteger(region.windowIndex) || region.windowIndex! < 0) {
    throw new Error("Frozen local locator unavailable");
  }
  return region.windowIndex!;
}

function outputDirectory(): string {
  const root = resolve(".local-evaluation");
  const output = resolve(root, "p540-01-private-reachability-v2");
  if (lstatSync(root).isSymbolicLink() || existsSync(output)) {
    throw new Error("Private output location unavailable");
  }
  ignored(output);
  return output;
}

function maxIndex(values: readonly number[]): number {
  return values.reduce((best, value, index) => value > values[best] ? index : best, 0);
}

function main(): void {
  const truth = frozenTruth();
  const windowIndex = frozenWindowIndex(truth.regionId);
  const output = outputDirectory();
  const source = selectSinglePrivateCandidate(discoverLfMidi001Candidates(inputDirectory()));
  const bytes = new Uint8Array(readFileSync(source));
  const parsed = parseMidi(bytes);
  const notesBefore = JSON.stringify(parsed.notes);
  const data = { ...parsed, notes: selectChordEvidenceNotes(parsed.notes) };
  const windows = buildWeightedWindows(data, inferTrackRoles(data), 1);
  const details = truth.decisions.map(({ id, identity }, offset) => {
    const window = windows[windowIndex * 2 + offset];
    if (!window || window.totalWeight <= 0) throw new Error("Local state unavailable");
    const evidence = {
      histogram: window.histogram,
      bassPitchClass: maxIndex(window.bassHistogram),
    };
    const first = rankStage01ShadowCandidates(evidence);
    const second = rankStage01ShadowCandidates(evidence);
    if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("Nondeterministic Shadow output");
    const key = shadowIdentityKey(identity);
    if (!key) throw new Error("Frozen identity invalid");
    return {
      id,
      exactGenerated: first.generatedCandidates.some((entry) => entry.identityKey === key),
      exactRank: first.rankedCandidates.find((entry) => entry.identityKey === key)?.rank ?? null,
      candidateVisits: first.candidateVisits,
    };
  });
  const after = new Uint8Array(readFileSync(source));
  const sourceUnchanged = bytes.length === after.length
    && bytes.every((value, index) => value === after[index]);
  const notesUnchanged = JSON.stringify(parsed.notes) === notesBefore;
  if (!sourceUnchanged || !notesUnchanged || details.some((row) => row.candidateVisits > 300)) {
    throw new Error("Stage01 fidelity or candidate bound failed");
  }
  mkdirSync(output);
  const artifact = resolve(output, "focused-reachability.private.json");
  ignored(artifact);
  writeFileSync(artifact, `${JSON.stringify({
    schemaVersion: 1,
    sourceUnchanged,
    notesUnchanged,
    deterministic: true,
    details,
  }, null, 2)}\n`);
  stdout.write(`localStates=${details.length}\n`);
  stdout.write(`exactGeneratedCount=${details.filter((row) => row.exactGenerated).length}\n`);
  stdout.write(`candidateVisitsMax=${Math.max(...details.map((row) => row.candidateVisits))}\n`);
  stdout.write(`sourceUnchanged=${sourceUnchanged}\n`);
  stdout.write(`notesUnchanged=${notesUnchanged}\n`);
  stdout.write("focusedPrivateArtifactIgnored=true\n");
}

try {
  main();
} catch {
  stderr.write("Stage01 focused private reachability could not be prepared.\n");
  process.exitCode = 1;
}
