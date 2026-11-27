// Draft for scripts/docs-layout/validate.mjs (P25 M6). Copied into the repository in stage 14.
/* global console */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { PERSONAL_PATH } from "../phase-docs/lib.mjs";

/**
 * Docs-layout validator (P25 / v3.2.0, M6).
 *
 * Normal run (FULL and the documentation checks):
 *   1. docs/ holds only README.md plus the eight folders from the M1 layout, and
 *      the repository root holds only the agreed files/folders.
 *   2. every `docs/...` string in src, e2e, scripts, .github, .githooks,
 *      package.json, AGENTS.md and CLAUDE.md names something that exists, is
 *      ignored by Git, or is one of the documented template exceptions.
 *   3. every relative import under scripts/ resolves to a real file.
 *   4. the current docs, the release folder and the top-level README/CHANGELOG/
 *      agent files carry no personal absolute path and none of the words from
 *      `.local/publish-words.txt` (skipped with a notice when the local list is
 *      absent, so CI still runs).
 *
 * `--release`: the local word list is required, every tracked text file is
 * checked, and extra text can be passed with `--text <string>`,
 * `--text-file <path>` (release notes, the About line) and
 * `--commit-message-file <path>`; the run prints how many files were examined
 * and how many findings it made.
 *
 * No third-party dependency; Node built-ins only.
 */

const DOCS_ALLOWED = new Set(["README.md", "archive", "contracts", "current", "designs", "images", "release", "security", "ai-handoff"]);
const ROOT_ALLOWED = new Set([
  ".cargo", ".claude", ".env.example", ".githooks", ".gitattributes", ".github", ".gitignore",
  "AGENTS.md", "CHANGELOG.md", "CLAUDE.md", "LICENSE", "README.en.md", "README.md",
  "docs", "e2e", "eslint.config.js", "index.html", "package-lock.json", "package.json",
  "playwright.config.ts", "postcss.config.js", "public", "scripts", "src", "src-tauri",
  "tailwind.config.js", "tsconfig.e2e.json", "tsconfig.json", "tsconfig.node.json", "vite.config.ts",
]);
// Template strings that deliberately do not name a real path (at most five).
const PATH_EXCEPTIONS = ["docs/phaseX.Y", "docs/phaseX.Y/README.md", "docs/CURRENT_STATE.md", "docs/phase"];

const PATH_SCAN_FILES = [".github", ".githooks", "src", "e2e", "scripts"];
const PATH_SCAN_TOP_FILES = ["package.json", "AGENTS.md", "CLAUDE.md"];
const WORD_SCAN_ROOTS = ["docs/designs", "docs/current", join("docs", "release", "v3.2.0")];
const WORD_SCAN_FILES = ["docs/README.md", "README.md", "README.en.md", "CHANGELOG.md", "AGENTS.md", "CLAUDE.md"];
const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEXT_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonl|yml|yaml|toml|md|txt|css|html|sh|ps1|rs|gitignore|gitattributes|example)$/;
// Test sources name fixture paths (and fixture imports) that deliberately do not exist.
const TEST_FILE = /(?:\.test\.|\.node-test\.|\.spec\.)[cm]?[jt]sx?$/;

function isTestFile(path) {
  return TEST_FILE.test(path);
}

function git(repoRoot, args) {
  return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function isIgnored(repoRoot, path) {
  for (const candidate of [path, `${path}/`]) {
    try {
      execFileSync("git", ["-C", repoRoot, "check-ignore", "-q", "--", candidate], { stdio: "ignore" });
      return true;
    } catch {
      // try the directory form next
    }
  }
  return false;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function read(path) {
  return readFileSync(path, "utf8");
}

function listTracked(repoRoot) {
  return git(repoRoot, ["ls-files", "-z"]).split("\0").filter(Boolean);
}

function stripComments(text, path) {
  if (!CODE_EXT.test(path)) return text;
  const out = [];
  let inBlock = false;
  for (const line of text.split(/\r?\n/)) {
    let code = "";
    let i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf("*/", i);
        if (end === -1) { break; }
        inBlock = false; i = end + 2; continue;
      }
      if (line.startsWith("//", i)) break;
      if (line.startsWith("/*", i)) { inBlock = true; i += 2; continue; }
      const ch = line[i];
      if (ch === '"' || ch === "'" || ch === "`") {
        let j = i + 1;
        while (j < line.length) {
          if (line[j] === "\\") { j += 2; continue; }
          if (line[j] === ch) { j += 1; break; }
          j += 1;
        }
        code += line.slice(i, j); i = j; continue;
      }
      code += ch; i += 1;
    }
    out.push(code);
  }
  return out.join("\n");
}

// --- check 1 ---------------------------------------------------------------
export function checkLayout(repoRoot, tracked = listTracked(repoRoot)) {
  const issues = [];
  const docsTop = new Set();
  for (const path of tracked) {
    if (!path.startsWith("docs/")) continue;
    const rest = path.slice("docs/".length);
    const top = rest.split("/")[0];
    if (rest.includes("/")) docsTop.add(top);
    else docsTop.add(rest);
  }
  for (const entry of [...docsTop].sort()) {
    if (!DOCS_ALLOWED.has(entry)) issues.push({ check: "docs-top-level", file: `docs/${entry}`, message: "entry is not part of the docs layout" });
  }
  const rootTop = new Set();
  for (const path of tracked) {
    const parts = path.split("/");
    if (parts.length === 1) rootTop.add(parts[0]);
    else if (parts[0] !== "docs") rootTop.add(parts[0]);
  }
  for (const entry of [...rootTop].sort()) {
    if (!ROOT_ALLOWED.has(entry)) issues.push({ check: "root-entry", file: entry, message: "entry is not part of the repository root layout" });
  }
  return issues;
}

// --- check 2 ---------------------------------------------------------------
export function checkDocsPaths(repoRoot, tracked = listTracked(repoRoot)) {
  const issues = [];
  const files = [];
  for (const base of PATH_SCAN_FILES) {
    if (!existsSync(join(repoRoot, base))) continue;
    const full = join(repoRoot, base);
    const items = statSync(full).isDirectory() ? walk(full).map((file) => relative(repoRoot, file).split("\\").join("/")) : [base];
    files.push(...items);
  }
  files.push(...PATH_SCAN_TOP_FILES.filter((file) => existsSync(join(repoRoot, file))));
  const trackedSet = new Set(tracked);
  const tokenRe = /(?<![\w.-])docs\/[A-Za-z0-9._~/-]+/g;
  for (const file of files) {
    if (!TEXT_EXT.test(file)) continue;
    if (isTestFile(file)) continue;
    const text = stripComments(read(join(repoRoot, file)), file);
    for (const match of text.matchAll(tokenRe)) {
      const token = match[0].replace(/[.,;:)\]}'"]+$/, "");
      if (!token) continue;
      if (PATH_EXCEPTIONS.some((exception) => token === exception || token.startsWith(exception + "/"))) continue;
      if (existsSync(join(repoRoot, token))) continue;
      if (isIgnored(repoRoot, token)) continue;
      if ([...trackedSet].some((path) => path.startsWith(token))) continue;
      issues.push({ check: "docs-path", file, message: `does not resolve: ${token}` });
    }
  }
  return issues;
}

// --- check 3 ---------------------------------------------------------------
const IMPORT_RE = /(?:from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["'])/g;
export function checkScriptImports(repoRoot) {
  const issues = [];
  const scriptsDir = join(repoRoot, "scripts");
  if (!existsSync(scriptsDir)) return issues;
  for (const file of walk(scriptsDir).map((full) => relative(repoRoot, full).split("\\").join("/"))) {
    if (!CODE_EXT.test(file)) continue;
    if (isTestFile(file)) continue;
    const text = stripComments(read(join(repoRoot, file)), file);
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (!spec || !spec.startsWith(".")) continue;
      const base = join(dirname(file), spec).split("\\").join("/");
      const normalized = base.replace(/^\.\//, "");
      const candidates = [normalized, normalized + ".ts", normalized + ".tsx", normalized + ".mts", normalized + ".mjs", normalized + ".js", normalized + ".cjs", normalized + ".json", normalized + "/index.ts"];
      if (!candidates.some((candidate) => existsSync(join(repoRoot, candidate)))) {
        issues.push({ check: "script-import", file, message: `relative import does not resolve: ${spec}` });
      }
    }
  }
  return issues;
}

// --- check 4 ---------------------------------------------------------------
export function readPublishWords(repoRoot) {
  const file = join(repoRoot, ".local", "publish-words.txt");
  if (!existsSync(file)) return null;
  return read(file).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function wordMatcher(words) {
  return words.map((word) => new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), /^[\u0020-\u007e]+$/.test(word) ? "i" : ""));
}

export function checkWordsAndPrivacy(repoRoot, { words, texts = [] } = {}) {
  const issues = [];
  const files = [];
  for (const base of WORD_SCAN_ROOTS) {
    const full = join(repoRoot, base);
    if (!existsSync(full)) continue;
    const items = statSync(full).isDirectory() ? walk(full).map((file) => relative(repoRoot, file).split("\\").join("/")) : [base];
    files.push(...items);
  }
  files.push(...WORD_SCAN_FILES.filter((file) => existsSync(join(repoRoot, file))));
  const matchers = wordMatcher(words ?? []);
  for (const file of new Set(files)) {
    if (!TEXT_EXT.test(file)) continue;
    const lines = read(join(repoRoot, file)).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (PERSONAL_PATH.test(line)) issues.push({ check: "personal-path", file, message: `line ${index + 1}` });
    });
    if (matchers.length) {
      const text = lines.join("\n");
      const hits = matchers.filter((matcher) => matcher.test(text));
      if (hits.length) issues.push({ check: "publish-word", file, message: `forbidden word(s): ${hits.length}` });
    }
  }
  for (const [index, text] of texts.entries()) {
    const lines = text.split(/\r?\n/);
    lines.forEach((line, lineNo) => {
      if (PERSONAL_PATH.test(line)) issues.push({ check: "personal-path", file: `extra text ${index + 1}`, message: `line ${lineNo + 1}` });
    });
    const hits = matchers.filter((matcher) => matcher.test(text));
    if (hits.length) issues.push({ check: "publish-word", file: `extra text ${index + 1}`, message: `forbidden word(s): ${hits.length}` });
  }
  return issues;
}

// --- release mode ----------------------------------------------------------
export function checkAllTrackedText(repoRoot, words, tracked = listTracked(repoRoot)) {
  const issues = [];
  const matchers = wordMatcher(words);
  let examined = 0;
  for (const path of tracked) {
    if (!TEXT_EXT.test(path) && !/\.(gitignore|gitattributes)$/.test(path)) continue;
    let content;
    try {
      content = read(join(repoRoot, path));
    } catch {
      continue;
    }
    if (content.includes("\0")) continue;
    examined += 1;
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (PERSONAL_PATH.test(line)) issues.push({ check: "personal-path", file: path, message: `line ${index + 1}` });
    });
    const hits = matchers.filter((matcher) => matcher.test(content));
    if (hits.length) issues.push({ check: "publish-word", file: path, message: `forbidden word(s): ${hits.length}` });
  }
  return { issues, examined };
}

// --- CLI -------------------------------------------------------------------
function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const args = process.argv.slice(2);
  const release = args.includes("--release");
  const texts = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--text") texts.push(args[i + 1] ?? "");
    if (args[i] === "--text-file" || args[i] === "--commit-message-file") texts.push(read(join(repoRoot, args[i + 1] ?? "")));
  }
  const words = readPublishWords(repoRoot);
  if (!words && release) {
    console.log("FAIL — --release needs .local/publish-words.txt, and it is missing.");
    process.exit(1);
  }
  const issues = [
    ...checkLayout(repoRoot),
    ...checkDocsPaths(repoRoot),
    ...checkScriptImports(repoRoot),
    ...checkWordsAndPrivacy(repoRoot, { words, texts }),
  ];
  let examined = null;
  if (release) {
    const result = checkAllTrackedText(repoRoot, words);
    examined = result.examined;
    issues.push(...result.issues);
  }
  console.log("Docs layout validation");
  console.log(`  repo: ${repoRoot}`);
  console.log(`  words: ${words ? `${words.length} from .local/publish-words.txt` : "list absent — word check skipped"}`);
  if (release) console.log(`  tracked text files examined: ${examined}`);
  if (issues.length === 0) {
    console.log("\nPASS — the docs layout, the paths, the script imports and the word check are consistent.");
    process.exit(0);
  }
  for (const issue of issues) console.log(`  [${issue.check}] ${issue.file} — ${issue.message}`);
  console.log(`\nFAIL — ${issues.length} issue(s) found.`);
  process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("validate.mjs")) main();
