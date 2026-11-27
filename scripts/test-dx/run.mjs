/* global process, console */
import { Buffer } from "node:buffer";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { selectForFiles } from "./selection.mjs";
import { cacheEnabled, cacheKey, fingerprint, readPass, writePass, sha256 } from "./cache.mjs";
import { diagnostics, summaryCounts } from "./reporting.mjs";
import { partitionE2eSpecs } from "./tiers.mjs";

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
const steps = [];
const startedAt = new Date().toISOString();
const started = performance.now();
const combinedLog = join(logRoot, `${session}-${level}.log`);
writeFileSync(combinedLog, "", "utf8");

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(result.error.message === undefined || result.error.message === "" ? "git failed" : result.error.message);
  if (result.status !== 0) throw new Error(result.stderr || "git failed");
  return result.stdout;
}

const executionHead = git(["rev-parse", "HEAD"]).trim();
// R-01: a dirty-state hash that never reads binary content into memory. `git diff --binary` used to overflow the spawn
// buffer (ENOBUFS) whenever tracked report screenshots carried a large binary diff; the plain text diff keeps the same
// dirty-state semantics for text edits and reduces a binary edit to one line.
const trackedDiffHash = sha256(git(["diff", "HEAD"]));
const dirtyTrackedPaths = git(["diff", "--name-only", "HEAD"]).trim().split("\n").filter(Boolean);

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
    steps.push({ label, status: "pass", cached: true, seconds: 0, counts: cached.counts });
    return { cached: true, seconds: 0, bytes: 0 };
  }
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const log = join(logRoot, `${session}-${slug}.log`);
  const begun = performance.now();
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: stepEnvironment(slug, kind, extraEnv),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const { seconds, counts } = finishStep({ label, kind, log, begun, output, status: result.status, error: result.error });
  if (before && key) {
    const after = fingerprint(root);
    if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error(`${label} changed tracked/config inputs while running; PASS not cached`);
    writePass(cacheRoot, key, { status: "pass", counts, seconds });
  }
  steps.push({ label, status: "pass", cached: false, seconds, counts, bytes: Buffer.byteLength(output), log: log.replace(root, ".") });
  console.log(`${label}: PASS${counts ? ` — ${counts}` : ""} — ${seconds}s`);
  return { seconds, bytes: Buffer.byteLength(output), output };
}

function stepEnvironment(slug, kind, extraEnv) {
  return { ...env, ...extraEnv, ...(kind === "browser" ? {
    LV_TEST_PERFORMANCE_OUTPUT: join(logRoot, `${session}-${slug}-timing.json`),
  } : {}) };
}

/** Writes the step's logs and throws (with diagnostics) when it failed; otherwise returns its duration and counts. */
function finishStep({ label, kind, log, begun, output, status, error }) {
  writeFileSync(log, output, "utf8");
  appendFileSync(combinedLog, `\n## ${label}\n${output}`, "utf8");
  rawBytes += Buffer.byteLength(output);
  const seconds = Number(((performance.now() - begun) / 1000).toFixed(1));
  if (error || status !== 0) {
    steps.push({ label, status: "fail", cached: false, seconds, log: log.replace(root, ".") });
    console.error(`${label}: FAIL — ${seconds}s`);
    console.error(diagnostics(output || error?.message || "No command output"));
    console.error(`Full log: ${log.replace(root + "\\", "").replaceAll("\\", "/")}`);
    throw new Error(`${label} exited ${status ?? "without status"}`);
  }
  const counts = summaryCounts(output, kind);
  if (["vitest", "browser", "node"].includes(kind) && (!counts || counts.startsWith("0/"))) {
    steps.push({ label, status: "fail", cached: false, seconds, reason: "zero passing tests" });
    throw new Error(`${label} reported no passing tests; see ${log}`);
  }
  return { seconds, counts };
}

/**
 * FULL only (no PASS cache): independent steps run side by side. Each keeps its own log, count check and failure
 * diagnostics; every step is allowed to finish before the first failure is thrown, so no log is cut short.
 */
async function runStepsTogether(specs) {
  const outcomes = await Promise.allSettled(specs.map(({ label, script, args = [], kind = "static" }) => new Promise((done, fail) => {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const log = join(logRoot, `${session}-${slug}.log`);
    const begun = performance.now();
    const child = spawn(process.execPath, [script, ...args], { cwd: root, env: stepEnvironment(slug, kind, {}) });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) { stream.setEncoding("utf8"); stream.on("data", (chunk) => { output += chunk; }); }
    child.on("error", (error) => { try { finishStep({ label, kind, log, begun, output, status: null, error }); } catch (thrown) { fail(thrown); } });
    child.on("close", (status) => {
      try {
        const { seconds, counts } = finishStep({ label, kind, log, begun, output, status });
        steps.push({ label, status: "pass", cached: false, seconds, counts, bytes: Buffer.byteLength(output), log: log.replace(root, ".") });
        console.log(`${label}: PASS${counts ? ` — ${counts}` : ""} — ${seconds}s`);
        done();
      } catch (thrown) { fail(thrown); }
    });
  })));
  const failed = outcomes.find((outcome) => outcome.status === "rejected");
  if (failed) throw failed.reason;
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
      nodeStep("Docs layout", "scripts/docs-layout/validate.mjs");
    }
    if (selection.areas.includes("privacy/security")) nodeStep("Privacy scan", "scripts/security/trackedSecurityScan.mjs");
    if (selection.browserChanged) nodeStep("Class lint", "scripts/lint-tailwind-classes.mjs");
    const lintable = selection.changed.filter((file) => /\.[cm]?[jt]sx?$/.test(file) && !file.endsWith(".json") && existsSync(file));
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
  if (mode === "ui" && !selection.broad && selection.browser.length === 0) {
    throw new Error("UI selection has no browser tests; supply a spec or owning source path");
  }
  if (selection.browser.length || (selection.broad && mode !== "fast") || mode === "ui") {
    const browserFiles = selection.broad ? [] : selection.browser;
    nodeStep("Playwright selected", "scripts/run-playwright-visual-tests.mjs", [
      ...browserFiles, "--reporter=dot,./scripts/test-dx/performance-reporter.mjs",
    ], "browser", mode === "ui" ? {} : { LV_DX_PRECHECKED_TSC: "1" });
  }
}

async function runFull({ includeExtended = false } = {}) {
  // R-01: report screenshots belong out of the tracked tree during daily runs. Any tracked PNG that is modified when
  // FULL starts, or that a test changes while FULL runs, fails here with the paths named (the runner used to die on
  // the following git diff with ENOBUFS instead of saying this). Untracked PNG files (`??`) are checked too, but only
  // when they appear during FULL: a test must not place a new PNG into a tracked directory either. Files that were
  // already untracked before FULL (left in the working tree by hand) are left to the user.
  const pngPaths = (untracked) => git(["status", "--porcelain", "--", "*.png"]).trim().split("\n").filter(Boolean)
    .filter((line) => (line.startsWith("??")) === untracked);
  const pngTrackedBefore = pngPaths(false);
  if (pngTrackedBefore.length) throw new Error(`Tracked PNG files are already modified before FULL started — tests must not write into docs/archive/reports (see r-01-test-hygiene): ${pngTrackedBefore.join(", ")}`);
  const pngUntrackedBefore = pngPaths(true).sort();
  // Run static checks and production build together first, then run Vitest full on its own so heavy CPU
  // unit tests (e.g. p21SingleNoteFingering) do not contend with tsc/eslint/vite and hit the 30s timeout.
  await runStepsTogether([
    { label: "Repository ESLint", script: "node_modules/eslint/bin/eslint.js", args: ["."] },
    { label: "Class lint", script: "scripts/lint-tailwind-classes.mjs" },
    { label: "Source contracts", script: "scripts/lint-source-contracts.mjs" },
    { label: "E2E TypeScript", script: "node_modules/typescript/bin/tsc", args: ["-p", "tsconfig.e2e.json"] },
    { label: "Phase docs", script: "scripts/phase-docs/validate.mjs" },
    { label: "AI handoff", script: "scripts/ai-handoff/validate.mjs" },
    { label: "Docs layout", script: "scripts/docs-layout/validate.mjs" },
    { label: "Privacy scan", script: "scripts/security/trackedSecurityScan.mjs" },
    { label: "App TypeScript", script: "node_modules/typescript/bin/tsc" },
    { label: "Production build", script: "node_modules/vite/bin/vite.js", args: ["build"] },
    { label: "Runner contracts", script: "--test", kind: "node", args: [
      "scripts/test-dx/selection.node-test.mjs",
      "scripts/test-dx/cache.node-test.mjs",
      "scripts/test-dx/reporting.node-test.mjs",
      "scripts/test-dx/check-gallery-excluded.node-test.mjs",
      "scripts/test-dx/performance-reporter.node-test.mjs",
      "scripts/test-dx/tiers.node-test.mjs",
      "scripts/docs-layout/validate.node-test.mjs",
      "scripts/run-playwright-visual-tests.node-test.mjs",
    ] },
  ]);
  nodeStep("Vitest full", "node_modules/vitest/vitest.mjs", ["run", "--maxWorkers=6", "--testTimeout=30000", "--reporter=dot"], "vitest");
  nodeStep("Gallery excluded", "scripts/test-dx/check-gallery-excluded.mjs");
  const visualRunner = "scripts/run-playwright-visual-tests.mjs";
  const visualReporter = ["--reporter=dot,./scripts/test-dx/performance-reporter.mjs"];
  const allSpecs = readdirSync(join(root, "e2e")).filter((file) => file.endsWith(".spec.ts")).sort().map((file) => `e2e/${file}`);
  const { core, extendedLight, extendedHeavy, extendedRealtimeAudio } = partitionE2eSpecs(allSpecs);
  const visualEnv = { LV_DX_PRECHECKED_TSC: "1" };
  const passes = [];
  if (includeExtended) {
    passes.push(
      nodeStep("Playwright full (all light)", visualRunner, [...visualReporter, ...core, ...extendedLight], "browser", visualEnv),
      nodeStep("Playwright heavy pass", visualRunner, [...visualReporter, ...extendedHeavy, "--workers=2"], "browser", { ...visualEnv, LV_DX_PREBUILT_FIXTURE: "1" }),
      nodeStep("Playwright real-time audio (one at a time)", visualRunner, [...visualReporter, ...extendedRealtimeAudio, "--workers=1"], "browser", { ...visualEnv, LV_DX_PREBUILT_FIXTURE: "1" }),
    );
  } else {
    console.log(`E2E tier: core (${core.length} specs); extended (${extendedLight.length + extendedHeavy.length + extendedRealtimeAudio.length} specs) via npm run test:e2e:extended or npm run test:full:all`);
    passes.push(
      nodeStep("Playwright full (core)", visualRunner, [...visualReporter, ...core], "browser", visualEnv),
    );
  }
  // R-01 §3: navigation retries around a transiently unreachable preview server (state-based, URL-load driven) are
  // kept, and their count is made visible here so a rising number cannot hide behind a PASS.
  const reopenings = passes.reduce((count, result) => count + (result?.output ? (result.output.match(/GOTO-RETRY /g)?.length ?? 0) : 0), 0);
  console.log(`goto の開き直り ${reopenings} 回`);
  for (const range of ["master...HEAD", "HEAD"]) {
    const diff = spawnSync("git", ["diff", "--check", range], { cwd: root, encoding: "utf8" });
    if (diff.status !== 0) throw new Error(`Git diff check failed: ${diff.stdout}${diff.stderr}`);
  }
  console.log("Git diff check: PASS");
  const pngTrackedChanged = pngPaths(false);
  const pngUntrackedNew = pngPaths(true).filter((path) => !pngUntrackedBefore.includes(path));
  const pngReport = [...pngTrackedChanged.map((path) => `changed: ${path}`), ...pngUntrackedNew.map((path) => `new: ${path}`)];
  if (pngReport.length) throw new Error(`PNG files in tracked directories changed during FULL — tests must not write into docs/archive/reports (see r-01-test-hygiene): ${pngReport.join(", ")}`);
  console.log("Tracked PNG check: PASS (no tracked PNG file changed during FULL)");
}

function runExtendedE2e() {
  const visualRunner = "scripts/run-playwright-visual-tests.mjs";
  const visualReporter = ["--reporter=dot,./scripts/test-dx/performance-reporter.mjs"];
  const allSpecs = readdirSync(join(root, "e2e")).filter((file) => file.endsWith(".spec.ts")).sort().map((file) => `e2e/${file}`);
  const { extendedLight, extendedHeavy, extendedRealtimeAudio } = partitionE2eSpecs(allSpecs);
  console.log(`E2E extended: ${extendedLight.length} archive/sweep specs + ${extendedHeavy.length} heavy (--workers=2) specs + ${extendedRealtimeAudio.length} real-time audio (--workers=1, one at a time)`);
  nodeStep("Playwright extended light", visualRunner, [...visualReporter, ...extendedLight], "browser");
  nodeStep("Playwright extended heavy", visualRunner, [...visualReporter, ...extendedHeavy, "--workers=2"], "browser", { LV_DX_PRECHECKED_TSC: "1", LV_DX_PREBUILT_FIXTURE: "1" });
  nodeStep("Playwright real-time audio (one at a time)", visualRunner, [...visualReporter, ...extendedRealtimeAudio, "--workers=1"], "browser", { LV_DX_PRECHECKED_TSC: "1", LV_DX_PREBUILT_FIXTURE: "1" });
}

try {
  if (!["fast", "feature", "ui", "full", "full-all", "extended"].includes(level)) throw new Error("Usage: run.mjs <fast|feature|ui|full|full-all|extended> [changed paths]");
  if (level === "full") await runFull({ includeExtended: false });
  else if (level === "full-all") await runFull({ includeExtended: true });
  else if (level === "extended") runExtendedE2e();
  else {
    const files = explicitFiles.length ? explicitFiles : level === "ui" && !autoChanged ? [] : changedFiles();
    if (level === "feature" && files.length === 0) throw new Error("FEATURE needs a changed source/test path or branch change");
    runSelected(selectForFiles(files, level, undefined, { explicit: explicitFiles.length > 0 }), level);
  }
  console.log(`${level.toUpperCase()}: PASS — ${((performance.now() - started) / 1000).toFixed(1)}s — raw logs ${rawBytes} B; local log ${combinedLog.replace(root + "\\", "").replaceAll("\\", "/")}`);
} catch (error) {
  console.error(`${level?.toUpperCase() ?? "TEST"}: FAIL — ${error.message}`);
  process.exitCode = 1;
} finally {
  writeFileSync(join(logRoot, `${session}-${level}-metrics.json`), JSON.stringify({
    schemaVersion: 1, level, head: executionHead, trackedDiffHash, dirtyTrackedPaths, startedAt,
    endedAt: new Date().toISOString(), status: process.exitCode ? "fail" : "pass",
    cacheEnabled: useCache, seconds: (performance.now() - started) / 1000,
    rawBytes, steps,
  }, null, 2), "utf8");
}
