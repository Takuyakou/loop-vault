/* global process, console */
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { selectForFiles } from "./selection.mjs";
import { cacheEnabled, cacheKey, fingerprint, readPass, writePass } from "./cache.mjs";
import { diagnostics, summaryCounts } from "./reporting.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(root);
const logRoot = join(root, ".local-evaluation", "test-logs");
const cacheRoot = join(root, ".local-evaluation", "gate-cache");
mkdirSync(logRoot, { recursive: true });
const session = new Date().toISOString().replace(/[:.]/g, "-");
const level = process.argv[2];
const options = process.argv.slice(3).filter((arg) => arg !== "--");
const explain = options.includes("--explain");
const autoChanged = options.includes("--changed");
const useCache = cacheEnabled(level, options.includes("--fresh"));
const explicitFiles = options.filter((arg) => !arg.startsWith("--"));
const env = { ...process.env, NO_COLOR: "1" };
delete env.FORCE_COLOR;
delete env.LV_DX_PRECHECKED_TSC;
let rawBytes = 0;
const started = performance.now();
const combinedLog = join(logRoot, `${session}-${level}.log`);
writeFileSync(combinedLog, "", "utf8");

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(result.stderr || result.error?.message || "git failed");
  return result.stdout;
}

function changedFiles() {
  const tracked = [
    ...git(["diff", "--name-only", "-z", "master...HEAD"]).split("\0"),
    ...git(["diff", "--name-only", "-z", "HEAD"]).split("\0"),
  ];
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0")
    .filter((path) => /^(src|e2e|scripts)\//.test(path) || /^(package(-lock)?\.json|.*config.*\.[cm]?[jt]s)$/.test(path));
  return [...new Set([...tracked, ...untracked].filter(Boolean))].sort();
}

function runStep(label, args, kind = "static", extraEnv = {}) {
  const before = useCache ? fingerprint(root) : null;
  const key = before ? cacheKey(before, label, { args, extraEnv }) : null;
  const cached = key ? readPass(cacheRoot, key) : null;
  if (cached) {
    console.log(`${label}: PASS (same-state cache)${cached.counts ? ` — ${cached.counts}` : ""} — ${cached.seconds}s saved`);
    appendFileSync(combinedLog, `\n## ${label}: cached PASS\n`, "utf8");
    return { cached: true, seconds: 0, bytes: 0 };
  }
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const log = join(logRoot, `${session}-${slug}.log`);
  const begun = performance.now();
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...env, ...extraEnv },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  writeFileSync(log, output, "utf8");
  appendFileSync(combinedLog, `\n## ${label}\n${output}`, "utf8");
  rawBytes += Buffer.byteLength(output);
  const seconds = ((performance.now() - begun) / 1000).toFixed(1);
  if (result.error || result.status !== 0) {
    console.error(`${label}: FAIL — ${seconds}s`);
    console.error(diagnostics(output || result.error?.message || "No command output"));
    console.error(`Full log: ${log.replace(root + "\\", "").replaceAll("\\", "/")}`);
    throw new Error(`${label} exited ${result.status ?? "without status"}`);
  }
  const counts = summaryCounts(output, kind);
  if (before && key) {
    const after = fingerprint(root);
    if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error(`${label} changed tracked/config inputs while running; PASS not cached`);
    writePass(cacheRoot, key, { status: "pass", counts, seconds: Number(seconds) });
  }
  console.log(`${label}: PASS${counts ? ` — ${counts}` : ""} — ${seconds}s`);
  return { seconds: Number(seconds), bytes: Buffer.byteLength(output), output };
}

function nodeStep(label, script, args = [], kind = "static", extraEnv = {}) {
  return runStep(label, [script, ...args], kind, extraEnv);
}

function runSelected(selection, mode) {
  const reason = selection.reasons.length
    ? selection.reasons.slice(0, 3).join("; ") + (selection.reasons.length > 3 ? `; +${selection.reasons.length - 3} more` : "")
    : "default critical UI selection";
  console.log(`Selection: ${reason}`);
  if (explain) selection.reasons.forEach((item) => console.log(`  ${item}`));
  if (selection.broad) console.log("Selection expanded: shared or unknown source owner");
  if (mode !== "ui") {
    nodeStep("App TypeScript", "node_modules/typescript/bin/tsc");
    nodeStep("Source contracts", "scripts/lint-source-contracts.mjs");
    if (selection.documentation) {
      nodeStep("Phase docs", "scripts/phase-docs/validate.mjs");
      nodeStep("AI handoff", "scripts/ai-handoff/validate.mjs");
    }
    if (selection.areas.includes("privacy/security")) nodeStep("Privacy scan", "scripts/security/trackedSecurityScan.mjs");
    if (selection.browserChanged) nodeStep("Class lint", "scripts/lint-tailwind-classes.mjs");
    const lintable = selection.changed.filter((file) => /\.[cm]?[jt]sx?$/.test(file) && !file.endsWith(".json"));
    if (lintable.length) nodeStep("Changed ESLint", "node_modules/eslint/bin/eslint.js", lintable);
    if (selection.nodeTests.length) nodeStep("Changed Node tests", "--test", selection.nodeTests, "node");
    if (selection.vitest.length || selection.broad) {
      const args = selection.broad
        ? ["run"]
        : ["related", "--run", ...selection.vitest];
      nodeStep("Vitest selected", "node_modules/vitest/vitest.mjs", [
        ...args, "--maxWorkers=4", "--testTimeout=30000", "--reporter=dot",
      ], "vitest");
    }
  }
  if (selection.browser.length || (selection.broad && mode !== "fast") || mode === "ui") {
    const browserFiles = selection.broad ? [] : selection.browser;
    nodeStep("Playwright selected", "scripts/run-playwright-visual-tests.mjs", [
      ...browserFiles, "--reporter=dot",
    ], "browser");
  }
}

function runFull() {
  nodeStep("Repository ESLint", "node_modules/eslint/bin/eslint.js", ["."]);
  nodeStep("Class lint", "scripts/lint-tailwind-classes.mjs");
  nodeStep("Source contracts", "scripts/lint-source-contracts.mjs");
  nodeStep("E2E TypeScript", "node_modules/typescript/bin/tsc", ["-p", "tsconfig.e2e.json"]);
  nodeStep("Phase docs", "scripts/phase-docs/validate.mjs");
  nodeStep("AI handoff", "scripts/ai-handoff/validate.mjs");
  nodeStep("Privacy scan", "scripts/security/trackedSecurityScan.mjs");
  nodeStep("App TypeScript", "node_modules/typescript/bin/tsc");
  nodeStep("Production build", "node_modules/vite/bin/vite.js", ["build"]);
  nodeStep("Gallery excluded", "scripts/test-dx/check-gallery-excluded.mjs");
  nodeStep("Runner contracts", "--test", [
    "scripts/test-dx/selection.node-test.mjs",
    "scripts/test-dx/cache.node-test.mjs",
    "scripts/test-dx/reporting.node-test.mjs",
    "scripts/test-dx/check-gallery-excluded.node-test.mjs",
    "scripts/run-playwright-visual-tests.node-test.mjs",
  ], "node");
  nodeStep("Vitest full", "node_modules/vitest/vitest.mjs", [
    "run", "--maxWorkers=4", "--testTimeout=30000", "--reporter=dot",
  ], "vitest");
  nodeStep("Playwright full", "scripts/run-playwright-visual-tests.mjs", [
    "--reporter=dot",
  ], "browser", { LV_DX_PRECHECKED_TSC: "1" });
  for (const range of ["master...HEAD", "HEAD"]) {
    const diff = spawnSync("git", ["diff", "--check", range], { cwd: root, encoding: "utf8" });
    if (diff.status !== 0) throw new Error(`Git diff check failed: ${diff.stdout}${diff.stderr}`);
  }
  console.log("Git diff check: PASS");
}

try {
  if (!["fast", "feature", "ui", "full"].includes(level)) throw new Error("Usage: run.mjs <fast|feature|ui|full> [changed paths]");
  if (level === "full") runFull();
  else {
    const files = explicitFiles.length ? explicitFiles : level === "ui" && !autoChanged ? [] : changedFiles();
    if (level === "feature" && files.length === 0) throw new Error("FEATURE needs a changed source/test path or branch change");
    runSelected(selectForFiles(files, level), level);
  }
  console.log(`${level.toUpperCase()}: PASS — ${((performance.now() - started) / 1000).toFixed(1)}s — raw logs ${rawBytes} B; local log ${combinedLog.replace(root + "\\", "").replaceAll("\\", "/")}`);
} catch (error) {
  console.error(`${level?.toUpperCase() ?? "TEST"}: FAIL — ${error.message}`);
  process.exitCode = 1;
}
