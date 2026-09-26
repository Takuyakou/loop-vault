import { createHash } from "node:crypto";
import process from "node:process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const matrixPath = resolve(root, "docs/phase8.8.3-r/compatibility-matrix.jsonl");
const fixturePath = resolve(root, "docs/phase8.8.3/product-supported-matrix.json");
const sha = value => createHash("sha256").update(value).digest("hex");
const sourceMatrix = readFileSync(matrixPath, "utf8").replace(/\r\n/g, "\n");
const sourceMatrixSha256 = sha(sourceMatrix);
if (sourceMatrixSha256 !== "5255ebb8525735ada1918ad99d2a056d225300a85b6b0d9f82acd44d8b9966b0") {
  throw new Error("R matrix digest changed; do not silently regenerate the Product subset.");
}
const matrix = sourceMatrix.trim().split("\n").map(JSON.parse);
const rows = matrix.filter(row => row.productSupport === "SUPPORTED").map(row => ({
  rowId: row.rowId,
  familyId: row.vocabularyFamilyId,
  writtenLabel: row.writtenLabel,
  expectedRequiredPitchClasses: row.theoryRequiredPitchClasses,
  expectedOptionalPitchClasses: row.theoryOptionalPitchClasses,
  expectedProhibitedPitchClasses: row.theoryProhibitedPitchClasses,
  expectedBassPitchClass: row.theoryBassPitchClass,
  baselineClasses: row.mismatchClasses,
  baselineReasons: row.mismatchReasons,
}));
const rowManifestSha256 = sha(rows.map(row => JSON.stringify(row)).join("\n") + "\n");
const fixture = {
  schemaVersion: 1,
  corpusId: "p8.8.3-product-supported-r-v1",
  sourceMatrixSha256,
  sourceProductCommit: "c618479b88ccc44f1d749ec30416058fa27d1e23",
  theoryPolicyId: "p8.8.3-r-literal-degree-v1",
  rowManifestSha256,
  rows,
};
const serialized = JSON.stringify(fixture) + "\n";
if (process.argv.includes("--write")) writeFileSync(fixturePath, serialized);
else if (readFileSync(fixturePath, "utf8").replace(/\r\n/g, "\n") !== serialized) {
  throw new Error("Frozen Product-supported fixture differs from the R matrix.");
}
const classCounts = Object.fromEntries("ABCDEF".split("").map(key => [key, rows.filter(row => row.baselineClasses.includes(key)).length]));
if (rows.length !== 624 || classCounts.A !== 138 || classCounts.B !== 451 || classCounts.F !== 0) {
  throw new Error("Product-supported closure differs from frozen R evidence.");
}
process.stdout.write(JSON.stringify({ rows: rows.length, families: new Set(rows.map(row => row.familyId)).size, classCounts, rowManifestSha256 }) + "\n");
