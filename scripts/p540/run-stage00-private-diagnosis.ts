/** Private Stage00 diagnostic. Refuses to score until source-first human truth is frozen. */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, stderr, stdout } from "node:process";

import { buildWeightedWindows, inferTrackRoles } from "../../src/domain/midi/legacy";
import { parseMidi } from "../../src/domain/midi/parser";
import { selectChordEvidenceNotes } from "../../src/domain/midi/voices";
import { discoverLfMidi001Candidates } from "../p538/privateFixtureDiscovery";
import { selectSinglePrivateCandidate } from "../p539/privatePromotionRunner";
import { evaluateStage03bInteractions } from "../p539/stage03bInteraction";
import { shadowIdentityKey, type ShadowRootRelativeIdentity } from "../p539/shadowRootRelativeIdentity";
import {
  buildCandidateScoreBreakdown,
  compareWinnerWithCorrect,
} from "./candidateScoreBreakdown";

const ENTRYPOINT = /(?:^|\/)run-stage00-private-diagnosis\.(?:[cm]?js|ts)$/;
const IDS = ["FC-SAFETY-03-L0", "FC-SAFETY-03-L1"] as const;
const CLASSIFICATIONS = new Set([
  "CONFIRMED-IDENTITY", "TEMPORAL-MIXTURE", "MULTIPLE-PLAUSIBLE",
  "INSUFFICIENT-EVIDENCE", "NEITHER-PROPOSED",
]);

interface HumanDecision {
  classification: string;
  identity: ShadowRootRelativeIdentity | null;
  confidence: string;
}

function inputDirectory(args: readonly string[]): string {
  const index = args.findIndex((entry) => ENTRYPOINT.test(entry.replace(/\\/g, "/")));
  const supplied = index < 0 ? [] : args.slice(index + 1);
  if (supplied.length !== 1 || !supplied[0]) throw new Error("One private input directory required");
  return supplied[0];
}

function ignored(path: string): void {
  execFileSync("git", ["check-ignore", "-q", "--", path], { stdio: "ignore" });
}

function readFrozenTruth(): {
  decisions: Record<typeof IDS[number], HumanDecision>;
  priorCandidateExposure: boolean;
} {
  const path = resolve(".local-evaluation/p540-00-source-review/human-ground-truth.private.json");
  ignored(path);
  const data: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!data || typeof data !== "object" || !("schemaVersion" in data)
    || data.schemaVersion !== 1 || !("sourceOnlyReviewed" in data)
    || data.sourceOnlyReviewed !== true || !("frozenBeforeCurrentScoreReview" in data)
    || data.frozenBeforeCurrentScoreReview !== true || !("decisions" in data)
    || !("priorCandidateExposure" in data)
    || typeof data.priorCandidateExposure !== "boolean"
    || !data.decisions || typeof data.decisions !== "object") {
    throw new Error("Source-first human decisions are not frozen");
  }
  const decisions = data.decisions as Record<string, unknown>;
  if (Object.keys(decisions).sort().join(",") !== [...IDS].sort().join(",")) {
    throw new Error("Human local-state IDs mismatch");
  }
  for (const id of IDS) {
    const decision = decisions[id];
    if (!decision || typeof decision !== "object" || !("classification" in decision)
      || !CLASSIFICATIONS.has(String(decision.classification))
      || !("confidence" in decision) || typeof decision.confidence !== "string"
      || !("identity" in decision)) throw new Error("Human decision incomplete");
    if (decision.classification === "CONFIRMED-IDENTITY") {
      if (!decision.identity || typeof decision.identity !== "object") {
        throw new Error("Confirmed local identity missing");
      }
    } else if (decision.identity !== null) {
      throw new Error("Uncertain local identity must remain unset");
    }
  }
  return {
    decisions: decisions as Record<typeof IDS[number], HumanDecision>,
    priorCandidateExposure: data.priorCandidateExposure,
  };
}

function frozenWindowIndex(): number {
  const path = resolve(".local-evaluation/p539-03c-review/sealed-binding.private.json");
  ignored(path);
  const data: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!data || typeof data !== "object" || !("regions" in data)
    || !Array.isArray(data.regions) || data.regions.length !== 3) {
    throw new Error("Frozen safety locator unavailable");
  }
  const region = data.regions.find((item: unknown) => item && typeof item === "object"
    && "id" in item && item.id === "FC-SAFETY-03");
  if (!region || typeof region !== "object" || !("windowIndex" in region)
    || !Number.isInteger(region.windowIndex) || region.windowIndex < 0) {
    throw new Error("Frozen safety locator mismatch");
  }
  return region.windowIndex as number;
}

function outputDirectory(): string {
  const root = resolve(".local-evaluation");
  const output = resolve(root, "p540-00-private-diagnosis");
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) {
    throw new Error("Ignored evaluation root must not be a link");
  }
  ignored(output);
  if (existsSync(output)) throw new Error("Private diagnosis already exists");
  return output;
}

function maxIndex(values: readonly number[]): number {
  return values.reduce((best, value, index) => value > values[best] ? index : best, 0);
}

function main(): void {
  const groundTruth = readFrozenTruth();
  const windowIndex = frozenWindowIndex();
  const output = outputDirectory();
  const source = selectSinglePrivateCandidate(discoverLfMidi001Candidates(inputDirectory(argv)));
  const bytes = new Uint8Array(readFileSync(source));
  const parsed = parseMidi(bytes);
  const data = { ...parsed, notes: selectChordEvidenceNotes(parsed.notes) };
  const windows = buildWeightedWindows(data, inferTrackRoles(data), 1);
  const interaction = evaluateStage03bInteractions(bytes).windows.find((row) => row.index === windowIndex);
  if (!interaction || !interaction.expandedDecision.triggered) {
    throw new Error("Frozen temporal split unavailable");
  }
  const diagnostics = IDS.map((id, offset) => {
    const window = windows[windowIndex * 2 + offset];
    const frozenBeat = offset === 0 ? interaction.b0 : interaction.b1;
    if (!window || !frozenBeat || window.totalWeight <= 0) {
      throw new Error("Local beat evidence unavailable");
    }
    const evidence = {
      histogram: window.histogram,
      bassPitchClass: maxIndex(window.bassHistogram),
    };
    const full = buildCandidateScoreBreakdown(id, evidence);
    if (full.rows[0]?.identityKey !== frozenBeat.expanded.identityKey
      || full.candidateVisits !== 276) throw new Error("Frozen ranking seam mismatch");
    const repeated = buildCandidateScoreBreakdown(id, evidence);
    if (JSON.stringify(full) !== JSON.stringify(repeated)) {
      throw new Error("Private breakdown is not deterministic");
    }
    const decision = groundTruth.decisions[id];
    const correctKey = decision.classification === "CONFIRMED-IDENTITY"
      ? shadowIdentityKey(decision.identity!) : null;
    const comparison = correctKey ? compareWinnerWithCorrect(full, correctKey) : null;
    return {
      id, human: decision,
      correctRepresentableByGrammar: decision.classification === "CONFIRMED-IDENTITY"
        ? correctKey !== null : null,
      correctGenerated: decision.classification === "CONFIRMED-IDENTITY"
        ? comparison !== null : null,
      top10: full.rows.slice(0, 10), comparison, full,
    };
  });
  const after = new Uint8Array(readFileSync(source));
  const sourceUnchanged = bytes.length === after.length
    && bytes.every((value, index) => value === after[index]);
  if (!sourceUnchanged) throw new Error("Private source changed");
  mkdirSync(resolve(".local-evaluation"), { recursive: true });
  mkdirSync(output);
  const artifact = resolve(output, "full-score-diagnosis.private.json");
  ignored(artifact);
  writeFileSync(artifact, `${JSON.stringify({ schemaVersion: 1,
    priorCandidateExposure: groundTruth.priorCandidateExposure, diagnostics }, null, 2)}\n`);
  stdout.write(`localStates=${diagnostics.length}\n`);
  stdout.write("candidateVisitsPerState=276\n");
  stdout.write(`sourceUnchanged=${sourceUnchanged}\n`);
  stdout.write("diagnosisStoredIgnoredLocal=true\n");
}

try {
  main();
} catch {
  // Private paths, notes and candidate identities must not escape via errors.
  stderr.write("Stage00 private diagnosis could not be prepared.\n");
  process.exitCode = 1;
}
