import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * AI-handoff validator library.
 *
 * Validates the `docs/ai-handoff/` package (8 required files), its freshness
 * header, machine-checkable path references, and privacy invariants. It reuses
 * the same privacy regexes as `scripts/phase-docs/lib.mjs` rather than inventing
 * a second vocabulary.
 *
 * Verified-SHA semantics (see docs/phase-workflow and docs/ai-handoff):
 *   - SHA is not a git object          -> FAIL
 *   - SHA exists and is a HEAD ancestor -> PASS
 *   - SHA exists but is not an ancestor -> WARN (rebase/squash may cut ancestry)
 *
 * No third-party dependency; Node built-ins only.
 */

export const REQUIRED_FILES = [
  "README.md",
  "HANDOFF.md",
  "ARCHITECTURE-MAP.md",
  "DECISIONS.md",
  "KNOWN-FAILURES.md",
  "TEST-STRATEGY.md",
  "GLOSSARY.md",
  "COLD-START-CHECK.md",
];

export const HANDOFF_MAX_LINES = 250;
export const ARCHITECTURE_MAX_LINES = 350;

// HARD = current implementation references. SOFT = historical phase references.
const HARD_PREFIXES = ["src/", "scripts/", "docs/ai-handoff/"];
const SOFT_PREFIX = "docs/phase";

const PERSONAL_PATH = /[A-Za-z]:[\\/]Users[\\/](?!<)[^\\/\s"'`)]+/;

const RAW_AUDIO_COMMIT =
  /(?:commit|コミット|git\s+add).*(?:\.midi?\b|\.wav\b|\.webm\b|\.ogg\b|\.m4a\b|\.mp3\b|\.flac\b|\.aac\b|\.aiff\b)/i;

const PRIVATE_MEDIA_EXT = /\.(mid|midi)$/i;
const MIDI_ALLOWLIST = /^test\/fixtures\//;
const BLOCKED_TRACKED_PATHS = [/^\.local-evaluation\//, /^test\/private-midi\//];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function readText(file) {
  return readFileSync(file, "utf8");
}

function lineCount(content) {
  return content.split(/\r?\n/).length;
}

function listMdFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMdFiles(full));
    else if (/\.md$/i.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Extracts inline backtick tokens, ignoring fenced code blocks.
 */
function extractBacktickTokens(markdown) {
  const tokens = [];
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const re = /`([^`\n]+)`/g;
    let match;
    while ((match = re.exec(line)) !== null) {
      tokens.push(match[1].trim());
    }
  }
  return tokens;
}

function looksLikeGlobOrPlaceholder(token) {
  return /[*?\[\]]/.test(token) || /\s/.test(token) || token.includes("$");
}

function classifyPathToken(token) {
  if (token.includes("/")) {
    for (const prefix of HARD_PREFIXES) {
      if (token.startsWith(prefix)) return "hard";
    }
    if (token.startsWith(SOFT_PREFIX)) return "soft";
    return "excluded";
  }
  return "excluded";
}

/**
 * Extracts the verified commit SHA from HANDOFF.md's freshness header.
 * @returns {string|null} a 40-char hex SHA, or null when absent.
 */
export function extractVerifiedSha(handoffContent) {
  const match = handoffContent.match(/commit:\s*([0-9a-fA-F]{40})/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Classifies a verified SHA against git facts.
 * @param {string} sha
 * @param {boolean} exists
 * @param {boolean} isAncestor
 * @returns {{ status: "pass"|"warn"|"fail", message: string }}
 */
export function classifyVerifiedSha(sha, exists, isAncestor) {
  if (!exists) {
    return {
      status: "fail",
      message: `verified SHA ${sha} does not exist as a git object`,
    };
  }
  if (isAncestor) {
    return { status: "pass", message: `verified SHA ${sha} is an ancestor of HEAD` };
  }
  return {
    status: "warn",
    message:
      `verified SHA ${sha} exists but is not an ancestor of HEAD; ` +
      `re-verify freshness and update the verified SHA`,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates the docs/ai-handoff/ package.
 *
 * @param {string} repoRoot absolute path to the repository root
 * @param {object} [options]
 * @param {() => string[]} [options.listTrackedFiles] returns git-tracked paths
 *   (for the private-media / .local-evaluation checks). Defaults to empty.
 * @returns {{ issues: Array, warnings: Array, verifiedSha: string|null }}
 *   `issues` are FAILs, `warnings` are WARNs; both use `{check,file,message}`.
 */
export function validateHandoffDocs(repoRoot, { listTrackedFiles = () => [] } = {}) {
  const issues = [];
  const warnings = [];
  const pkgDir = join(repoRoot, "docs", "ai-handoff");
  const rel = (f) => relative(repoRoot, f).split("\\").join("/");

  // 1. required files exist
  for (const name of REQUIRED_FILES) {
    const file = join(pkgDir, name);
    if (!existsSync(file)) {
      issues.push({ check: "missing-handoff-file", file: rel(file), message: "required handoff file is missing" });
    }
  }

  // 2. retired CURRENT_STATE must not exist anywhere under docs/
  const currentState = join(repoRoot, "docs", "CURRENT_STATE.md");
  if (existsSync(currentState)) {
    issues.push({
      check: "current-state-reference",
      file: rel(currentState),
      message: "retired docs/CURRENT_STATE.md must not exist",
    });
  }

  // 3. freshness header + line limits + content scan
  const handoffPath = join(pkgDir, "HANDOFF.md");
  const handoff = existsSync(handoffPath) ? readText(handoffPath) : "";
  const verifiedSha = extractVerifiedSha(handoff);
  if (!verifiedSha) {
    issues.push({
      check: "verified-sha",
      file: rel(handoffPath),
      message: "HANDOFF.md freshness header is missing a 40-hex commit SHA",
    });
  }
  if (lineCount(handoff) > HANDOFF_MAX_LINES) {
    issues.push({
      check: "handoff-line-limit",
      file: rel(handoffPath),
      message: `HANDOFF.md exceeds ${HANDOFF_MAX_LINES} lines`,
    });
  }

  const archPath = join(pkgDir, "ARCHITECTURE-MAP.md");
  if (existsSync(archPath) && lineCount(readText(archPath)) > ARCHITECTURE_MAX_LINES) {
    issues.push({
      check: "architecture-line-limit",
      file: rel(archPath),
      message: `ARCHITECTURE-MAP.md exceeds ${ARCHITECTURE_MAX_LINES} lines`,
    });
  }

  // 4. path validation + privacy scan over every handoff markdown file
  for (const file of listMdFiles(pkgDir)) {
    const relFile = rel(file);
    const content = readText(file);
    const lines = content.split(/\r?\n/);

    for (const token of extractBacktickTokens(content)) {
      if (looksLikeGlobOrPlaceholder(token)) continue;
      const kind = classifyPathToken(token);
      if (kind === "hard") {
        if (!existsSync(join(repoRoot, token.replace(/\/+$/, "")))) {
          issues.push({
            check: "hard-path",
            file: relFile,
            message: `HARD validated path does not exist: ${token}`,
          });
        }
      } else if (kind === "soft") {
        if (!existsSync(join(repoRoot, token.replace(/\/+$/, "")))) {
          warnings.push({
            check: "historical-path",
            file: relFile,
            message: `historical phase path does not exist: ${token}`,
          });
        }
      }
    }

    lines.forEach((line, i) => {
      if (PERSONAL_PATH.test(line)) {
        issues.push({
          check: "personal-path",
          file: relFile,
          message: `personal absolute path at line ${i + 1}: ${line.trim()}`,
        });
      }
      if (RAW_AUDIO_COMMIT.test(line)) {
        issues.push({
          check: "raw-audio-commit",
          file: relFile,
          message: `raw audio/MIDI commit directive at line ${i + 1}: ${line.trim()}`,
        });
      }
    });
  }

  // 5. tracked private media / .local-evaluation checks
  for (const tracked of listTrackedFiles()) {
    if (BLOCKED_TRACKED_PATHS.some((re) => re.test(tracked))) {
      issues.push({
        check: "tracked-private-media",
        file: tracked,
        message: "a private/local-evaluation path is tracked",
      });
    }
    if (PRIVATE_MEDIA_EXT.test(tracked) && !MIDI_ALLOWLIST.test(tracked)) {
      issues.push({
        check: "tracked-private-media",
        file: tracked,
        message: "private MIDI is tracked outside test/fixtures/",
      });
    }
  }

  return { issues, warnings, verifiedSha };
}
