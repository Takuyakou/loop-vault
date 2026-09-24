import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classifyVerifiedSha, validateHandoffDocs } from "./lib.mjs";

/**
 * CLI entry for `npm run validate:ai-handoff`.
 *
 * Validates the docs/ai-handoff/ package, its verified-SHA freshness against
 * git, and private-media tracking. Warnings do not fail the build; issues do.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function gitOk(args) {
  try {
    execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function listTrackedFiles() {
  const output = execFileSync("git", ["-C", repoRoot, "ls-files"], { encoding: "utf8" });
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

const { issues, warnings, verifiedSha } = validateHandoffDocs(repoRoot, { listTrackedFiles });

// Verified-SHA ancestry against git reality.
if (verifiedSha) {
  const exists = gitOk(["cat-file", "-e", `${verifiedSha}^{commit}`]);
  const isAncestor = gitOk(["merge-base", "--is-ancestor", verifiedSha, "HEAD"]);
  const result = classifyVerifiedSha(verifiedSha, exists, isAncestor);
  if (result.status === "fail") issues.push({ check: "verified-sha", file: "docs/ai-handoff/HANDOFF.md", message: result.message });
  else if (result.status === "warn") warnings.push({ check: "verified-sha", file: "docs/ai-handoff/HANDOFF.md", message: result.message });
}

const out = process.stdout;

out.write("AI handoff validation\n");
out.write(`  repo: ${repoRoot}\n\n`);

if (issues.length === 0) {
  out.write("  issues: OK\n");
} else {
  out.write(`  issues: ${issues.length}\n`);
  for (const issue of issues) {
    out.write(`    [${issue.check}] ${issue.file} — ${issue.message}\n`);
  }
}

if (warnings.length === 0) {
  out.write("  warnings: OK\n");
} else {
  out.write(`  warnings: ${warnings.length}\n`);
  for (const warning of warnings) {
    out.write(`    [${warning.check}] ${warning.file} — ${warning.message}\n`);
  }
}

out.write("\n");
if (issues.length === 0) {
  out.write("PASS — AI handoff material is valid.\n");
  process.exit(0);
}
out.write(`FAIL — ${issues.length} issue(s) found.\n`);
process.exit(1);
