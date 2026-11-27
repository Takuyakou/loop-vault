export const requiredProvenance = Object.freeze([
  "corpusId", "corpusVersion", "manifestSha", "split", "codeCommit",
  "policyId", "boundarySource", "identitySource", "snapshotSource",
  "scoringContract", "metricVersion",
]);

export function validateProvenance(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["provenance must be an object"];
  return requiredProvenance.flatMap((key) =>
    typeof value[key] === "string" && value[key].trim().length > 0
      ? [] : ["missing or invalid: " + key]);
}

export function compareProvenance(left, right, ablation = []) {
  const issues = [...validateProvenance(left), ...validateProvenance(right)];
  const allowed = new Set(ablation);
  for (const key of allowed) if (!requiredProvenance.includes(key)) issues.push("unknown ablation field: " + key);
  if (issues.length) return { status: "COMPARISON_INVALID", reasons: issues };
  const mismatches = requiredProvenance.filter((key) => left[key] !== right[key] && !allowed.has(key));
  return mismatches.length
    ? { status: "COMPARISON_INVALID", reasons: mismatches.map((key) => "unintended mismatch: " + key) }
    : { status: "COMPARABLE", reasons: [] };
}
