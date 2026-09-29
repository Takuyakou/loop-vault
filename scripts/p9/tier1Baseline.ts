/** Provenance wrapper around the versioned P7 Tier 1 Product/Copy-Oracle harness. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateGroups, harmonyFiles, syntheticFiles } from "../p7/tier1Harness";
import { temporalGoldCases } from "../p7/temporalGold";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
const split = arg("--split") ?? "dev";
if (split !== "dev" && split !== "validation") throw new Error("Only public dev/validation allowed.");
const corpusDir = arg("--corpus");
const files = corpusDir ? await harmonyFiles(corpusDir, split) : syntheticFiles();
const manifestSha = corpusDir
  ? createHash("sha256").update(await readFile(resolve(corpusDir, "manifest.json"))).digest("hex")
  : createHash("sha256").update(JSON.stringify(temporalGoldCases)).digest("hex");
const codeCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const base = {
  corpusId: corpusDir ? "harmony-support" : "p7-temporal-synthetic",
  corpusVersion: corpusDir ? "1.0.0" : "p7-temporal-gold-v1",
  manifestSha, split: corpusDir ? split : "authored-regression",
  codeCommit, policyId: "current-product-default-filter-off",
  boundarySource: "gold", identitySource: "gold",
  scoringContract: "p7-tier1-checkpoints-v1", metricVersion: "1",
};
const scored = await evaluateGroups([{ name: corpusDir ? "harmony-support-" + split : "p7-temporal-synthetic", files }]);
process.stdout.write(JSON.stringify({
  provenanceByArm: {
    "product-extractor": { ...base, snapshotSource: "product-extractor" },
    "copy-oracle": { ...base, snapshotSource: "copy-oracle" },
  },
  ...scored,
}, null, 2) + "\n");
