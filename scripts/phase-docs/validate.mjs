import process from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateRepository } from "./lib.mjs";

/**
 * CLI entry for `npm run validate:phase-docs`.
 *
 * Validates the phase-workflow template and every phase package under docs/
 * (any directory holding an execution-state.json). Exits non-zero on the first
 * batch of issues so CI and pre-merge gates fail loudly.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { repoIssues, packages, issueCount } = validateRepository(repoRoot);

const out = process.stdout;

out.write("Phase docs validation\n");
out.write(`  repo: ${repoRoot}\n`);
out.write(`  phase packages found: ${packages.length}\n\n`);

function printIssues(label, issues) {
  if (issues.length === 0) {
    out.write(`  ${label}: OK\n`);
    return;
  }
  out.write(`  ${label}: ${issues.length} issue(s)\n`);
  for (const issue of issues) {
    out.write(`    [${issue.check}] ${issue.file} — ${issue.message}\n`);
  }
}

printIssues("repository", repoIssues);
for (const pkg of packages) {
  out.write("\n");
  printIssues(`${pkg.dir} (phase ${pkg.phaseId ?? "?"})`, pkg.issues);
}

out.write("\n");
if (issueCount === 0) {
  out.write("PASS — phase docs are consistent.\n");
  process.exit(0);
}
out.write(`FAIL — ${issueCount} issue(s) found.\n`);
process.exit(1);
