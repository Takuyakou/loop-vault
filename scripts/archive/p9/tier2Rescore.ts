/** P9.4 public authored re-score of P8.6 candidate modes; source-note oracle is explicit. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { generateCandidates } from "../p7/candidateRepresentations";
import { tier2AuthoredGold } from "./tier2AuthoredGold";
import { scoreTier2Ranking, TIER2_METRIC_VERSION } from "./tier2Scorer";
const split = process.argv[2];
if (split !== "dev" && split !== "validation") throw new Error("Explicit dev or validation split required");
const examples = split === "dev" ? tier2AuthoredGold.slice(0, 4) : tier2AuthoredGold.slice(4);
const pc = (value: number) => (value % 12 + 12) % 12;
/** Frozen P8.6 factorization, mirrored here because its src/ research seam was not promoted. */
function p86Factors(candidate: {root:number;quality:string}, notes: readonly number[]): string[] {
  const relative = new Set(notes.map((note) => pc(note - candidate.root)));
  const factors: string[] = [];
  if (!relative.has(0)) factors.push("no-root");
  const third = candidate.quality.includes("min") || candidate.quality.includes("dim") ? 3 : 4;
  if (relative.has(third)) factors.push(third === 3 ? "b3" : "3");
  if (relative.has(7)) factors.push("5");
  else if (!["dim", "aug"].some((word) => candidate.quality.includes(word))) factors.push("no5");
  if (relative.has(10)) factors.push("b7");
  if (relative.has(11)) factors.push("7");
  if (relative.has(1)) factors.push("b9");
  if (relative.has(2)) factors.push("9");
  if (relative.has(5)) factors.push("11");
  if (relative.has(6)) factors.push("#11");
  if (relative.has(8)) factors.push("b13");
  if (relative.has(9)) factors.push(candidate.quality === "six" || candidate.quality === "min6" ? "6" : "13");
  return factors;
}
const manifestSha256 = createHash("sha256").update(JSON.stringify(tier2AuthoredGold)).digest("hex");
const codeCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const results = Object.fromEntries((["legacy-closed", "shortcut-factorized"] as const).map((mode) => {
  const metrics = { events: 0, structuralRecall: 0, acceptedRecallFull: 0,
    acceptedRecallBounded32: 0, acceptedTop3: 0, acceptedTop1: 0, canonicalTop1: 0,
    acceptedAlternateTop1: 0, rendererPlaybackAvailable: 0, top1DefiningToneLossAvailable: 0,
    top1RootAgreement: 0, top1QualityAgreement: 0, top1BassAgreement: 0, top1FactorAgreement: 0 };
  for (const gold of examples) {
    // This reproduces P8.6's authored source-note oracle, not operational Product extraction.
    const candidates = generateCandidates(gold.harmonic.notes, mode).map((row) => ({
      identity: { root: row.root, quality: row.quality, bass: row.bass,
        factors: p86Factors(row, gold.harmonic.notes) },
    }));
    const ranked = scoreTier2Ranking(gold, candidates, 32);
    metrics.events++;
    metrics.structuralRecall += candidates.some((candidate) => gold.harmonic.identities.some((identity) =>
      identity.root === candidate.identity.root && identity.quality === candidate.identity.quality
      && identity.bass === candidate.identity.bass)) ? 1 : 0;
    metrics.acceptedRecallFull += Number(ranked.fullAcceptedRecall);
    metrics.acceptedRecallBounded32 += Number(ranked.boundedAcceptedRecall);
    metrics.acceptedTop3 += Number(ranked.top3Accepted);
    metrics.acceptedTop1 += Number(ranked.top1Accepted);
    metrics.canonicalTop1 += Number(ranked.top1?.canonicalIdentityExact ?? false);
    metrics.acceptedAlternateTop1 += Number(ranked.top1?.acceptedAlternate ?? false);
    metrics.rendererPlaybackAvailable += Number(ranked.top1PlaybackAvailable);
    metrics.top1DefiningToneLossAvailable += Number(ranked.top1?.definingToneLoss !== null && ranked.top1?.definingToneLoss !== undefined);
    metrics.top1RootAgreement += Number(ranked.top1?.rootAgreement ?? false);
    metrics.top1QualityAgreement += Number(ranked.top1?.qualityAgreement ?? false);
    metrics.top1BassAgreement += Number(ranked.top1?.bassAgreementIdentity ?? false);
    metrics.top1FactorAgreement += Number(ranked.top1?.factorAgreement ?? false);
  }
  return [mode, metrics];
}));
process.stdout.write(JSON.stringify({ schemaVersion: 1, metricVersion: TIER2_METRIC_VERSION,
  provenance: { corpusId: "p7-public-authored-harmonic-truth", corpusVersion: "v1+p9.4-authored-roles-v1",
    manifestSha256, split, codeCommit, policyId: "p8.6-frozen-legacy-vs-shortcut-factorized",
    boundarySource: "AUTHORED_EVENT", identitySource: "P8.6_SOURCE_ORACLE_CANDIDATE",
    snapshotSource: "AUTHORED_SOURCE_NOTES_ORACLE", scoringContract: TIER2_METRIC_VERSION },
  availability: { acceptedIdentity: "AVAILABLE", rendererPlayback: "UNAVAILABLE_NO_RENDERED_CANDIDATE",
    definingToneLoss: "UNAVAILABLE_NO_RENDERED_CANDIDATE",
    harmonyCorpusFullTier2: "UNAVAILABLE_NO_INDEPENDENT_ACCEPTED_SETS" },
  results }, null, 2) + "\n");
