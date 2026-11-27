import { test } from "node:test";
import assert from "node:assert/strict";
import { compareProvenance, validateProvenance } from "./provenance.mjs";

const base = {
  corpusId: "synthetic-usage", corpusVersion: "1", manifestSha: "a".repeat(64),
  split: "dev", codeCommit: "abc1234", policyId: "product-current",
  boundarySource: "gold", identitySource: "product",
  snapshotSource: "product", scoringContract: "tier1-v1", metricVersion: "1",
};
test("requires every provenance field", () => {
  assert.deepEqual(validateProvenance({ ...base, manifestSha: "" }), ["missing or invalid: manifestSha"]);
});
test("matched comparison is valid", () => {
  assert.equal(compareProvenance(base, { ...base }).status, "COMPARABLE");
});
test("unintended changed identity source invalidates comparison", () => {
  assert.deepEqual(compareProvenance(base, { ...base, identitySource: "gold" }).status, "COMPARISON_INVALID");
});
test("explicit single-field ablation is allowed; additional mismatch is not", () => {
  assert.equal(compareProvenance(base, { ...base, snapshotSource: "research" }, ["snapshotSource"]).status, "COMPARABLE");
  assert.equal(compareProvenance(base, { ...base, snapshotSource: "research", split: "validation" }, ["snapshotSource"]).status, "COMPARISON_INVALID");
});
test("unknown ablation field is invalid", () => {
  assert.equal(compareProvenance(base, base, ["madeUp"]).status, "COMPARISON_INVALID");
});
