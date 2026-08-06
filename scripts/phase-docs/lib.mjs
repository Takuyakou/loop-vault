import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

/**
 * Phase-docs validator library.
 *
 * The Phase workflow keeps three layers of canonical docs (see
 * docs/phase-workflow/README.md):
 *   1. root AGENTS.md   — common safety rules for every phase
 *   2. docs/phaseX.Y/README.md — the single entry point for one phase
 *   3. the rest of docs/phaseX.Y/ — details, contracts, reports, evidence
 *
 * A "phase package" is any directory that contains an execution-state.json.
 * This library validates each discovered package against the shared schema and
 * a set of consistency and privacy checks. It has no third-party dependency:
 * the JSON-Schema subset used by execution-state.schema.json is interpreted by
 * validateAgainstSchema below.
 */

export const REQUIRED_FILES = [
  "README.md",
  "work-instructions.md",
  "execution-state.json",
  "reports/README.md",
];

export const REQUIRED_README_HEADINGS = [
  "## Status",
  "## Required Reading Order",
  "## Stages",
];

export const REQUIRED_WORK_INSTRUCTION_HEADINGS = [
  "## Scope",
  "## Non-goals",
  "## Definition of Done",
];

const AUDIO_EXTENSIONS = new Set([
  ".mid",
  ".midi",
  ".wav",
  ".webm",
  ".ogg",
  ".m4a",
  ".mp3",
  ".flac",
  ".aac",
  ".aiff",
]);

// A phase doc may legitimately *prohibit* a dangerous action; only an
// affirmative directive is a violation. A line that carries any of these
// markers is treated as a prohibition and is not flagged.
const NEGATION_MARKERS = [
  /しない/,
  / しません/,
  /禁止/,
  /してはいけない/,
  /行わない/,
  /勝手に/,
  /避け/,
  /せず/,
  /ずに/,
  /進まず/,
  /無断/,
  /ないで/,
  /never/i,
  /do not/i,
  /don't/i,
  /must not/i,
  /cannot/i,
  /without/i,
  /forbid/i,
  /prohibit/i,
  /未実行/,
  /未着手/,
  /非退行/,
  /を防/,
  /no tracked/i,
];

// An affirmative imperative to act — the marker that turns a mention of a
// dangerous action into a directive to perform it.
const AFFIRMATIVE_IMPERATIVE =
  /(?:してください|しなさい|せよ|する(?:$|[。、\s])|行ってください|行う)/;

function isProhibition(line) {
  return NEGATION_MARKERS.some((re) => re.test(line));
}

// ---------------------------------------------------------------------------
// JSON Schema (draft-07 subset) validator
// ---------------------------------------------------------------------------

function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && Number.isInteger(value)) return "integer";
  return typeof value;
}

function typeMatches(value, type) {
  const actual = jsonType(value);
  if (type === "number") return actual === "number" || actual === "integer";
  if (type === "integer") return actual === "integer";
  return actual === type;
}

/**
 * Validates `data` against `schema`. Supports the keyword subset used by
 * execution-state.schema.json: type (incl. arrays and null/integer), const,
 * enum, pattern, required, properties, additionalProperties:false, items.
 * Returns an array of human-readable error strings (empty when valid).
 */
export function validateAgainstSchema(data, schema, path = "$") {
  const errors = [];

  const walk = (value, node, at) => {
    if (node.type) {
      const types = Array.isArray(node.type) ? node.type : [node.type];
      if (!types.some((t) => typeMatches(value, t))) {
        errors.push(`${at}: expected type ${types.join("|")}, got ${jsonType(value)}`);
        return; // deeper keyword checks are meaningless on a type mismatch
      }
    }
    if ("const" in node && value !== node.const) {
      errors.push(`${at}: expected ${JSON.stringify(node.const)}`);
    }
    if (node.enum && !node.enum.includes(value)) {
      errors.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(node.enum)}`);
    }
    if (node.pattern && typeof value === "string") {
      if (!new RegExp(node.pattern).test(value)) {
        errors.push(`${at}: ${JSON.stringify(value)} does not match /${node.pattern}/`);
      }
    }
    const isPlainObject =
      value && typeof value === "object" && !Array.isArray(value);
    if (node.required && isPlainObject) {
      for (const key of node.required) {
        if (!(key in value)) errors.push(`${at}: missing required property "${key}"`);
      }
    }
    if (node.properties && isPlainObject) {
      for (const [key, sub] of Object.entries(node.properties)) {
        if (key in value) walk(value[key], sub, `${at}.${key}`);
      }
      if (node.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!(key in node.properties)) {
            errors.push(`${at}.${key}: additional property not allowed`);
          }
        }
      }
    }
    if (node.items && Array.isArray(value)) {
      value.forEach((el, i) => walk(el, node.items, `${at}[${i}]`));
    }
  };

  walk(data, schema, path);
  return errors;
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function readText(file) {
  return readFileSync(file, "utf8");
}

/** Extracts markdown link targets (skipping http(s), mailto and pure anchors). */
function extractLinkTargets(markdown) {
  const targets = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(markdown)) !== null) {
    let target = match[1].trim();
    if (!target) continue;
    if (/^(https?:|mailto:|#)/i.test(target)) continue;
    target = target.split("#")[0].trim(); // drop anchor
    if (target) targets.push(target);
  }
  return targets;
}

function extractSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join("\n");
}

// ---------------------------------------------------------------------------
// Per-package validation
// ---------------------------------------------------------------------------

/**
 * Validates one phase package directory.
 * @param {string} pkgDir absolute path to the package
 * @param {object} options
 * @param {object} options.schema parsed execution-state JSON schema
 * @param {string} [options.repoRoot] repo root for nicer relative paths
 * @returns {{ dir: string, phaseId: string|null, issues: Array<{check:string,file:string,message:string}> }}
 */
export function validatePackage(pkgDir, { schema, repoRoot = pkgDir } = {}) {
  const issues = [];
  const rel = (f) => relative(repoRoot, f).split("\\").join("/");
  const add = (check, file, message) => issues.push({ check, file: rel(file), message });

  // 1. required files exist
  for (const relFile of REQUIRED_FILES) {
    if (!existsSync(join(pkgDir, relFile))) {
      add("missing-file", join(pkgDir, relFile), `required file is missing`);
    }
  }

  const readmePath = join(pkgDir, "README.md");
  const readme = existsSync(readmePath) ? readText(readmePath) : "";
  const statePath = join(pkgDir, "execution-state.json");

  // execution-state parse + schema
  let state = null;
  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readText(statePath));
    } catch (err) {
      add("schema", statePath, `execution-state.json is not valid JSON: ${err.message}`);
    }
    if (state) {
      for (const message of validateAgainstSchema(state, schema)) {
        add("schema", statePath, message);
      }
    }
  }

  // 2. phase id agreement: readme marker == state.phaseId == dir name (if phaseX.Y)
  const markerMatch = readme.match(/<!--\s*phase-id:\s*([0-9]+\.[0-9]+)\s*-->/);
  const readmePhaseId = markerMatch ? markerMatch[1] : null;
  const dirMatch = basename(pkgDir).match(/^phase([0-9]+\.[0-9]+)$/);
  const dirPhaseId = dirMatch ? dirMatch[1] : null;
  const phaseId = state?.phaseId ?? readmePhaseId ?? dirPhaseId ?? null;
  if (readme && !readmePhaseId) {
    add("phase-id-mismatch", readmePath, "README is missing a <!-- phase-id: X.Y --> marker");
  }
  const ids = [
    ["execution-state.json", state?.phaseId ?? null],
    ["README marker", readmePhaseId],
    ["directory name", dirPhaseId],
  ].filter(([, v]) => v !== null);
  const distinct = new Set(ids.map(([, v]) => v));
  if (distinct.size > 1) {
    add(
      "phase-id-mismatch",
      readmePath,
      `phase id disagreement: ${ids.map(([k, v]) => `${k}=${v}`).join(", ")}`,
    );
  }

  // 3 & 4. required headings + broken relative links (README)
  if (readme) {
    for (const heading of REQUIRED_README_HEADINGS) {
      if (!readme.includes(heading)) {
        add("missing-heading", readmePath, `README is missing heading "${heading}"`);
      }
    }
    for (const target of extractLinkTargets(readme)) {
      if (!existsSync(join(pkgDir, target))) {
        add("broken-link", readmePath, `link target does not exist: ${target}`);
      }
      if (target.includes(".local-evaluation")) {
        add("local-evaluation-artifact", readmePath, `links into .local-evaluation: ${target}`);
      }
      if (basename(target) === "CURRENT_STATE.md") {
        add("current-state-reference", readmePath, `links to retired CURRENT_STATE.md: ${target}`);
      }
    }
    const readingOrder = extractSection(readme, "## Required Reading Order");
    if (readingOrder !== null && extractLinkTargets(readingOrder).length === 0) {
      add("required-reading-order", readmePath, "Required Reading Order section has no links");
    }
    // duplicate stage ids in README "## Stages" headings
    const stageIds = [...readme.matchAll(/^###\s+(P[0-9]+\.[0-9]+-[0-9]{2})\b/gm)].map((m) => m[1]);
    const seen = new Set();
    for (const id of stageIds) {
      if (seen.has(id)) add("duplicate-stage", readmePath, `stage id appears twice: ${id}`);
      seen.add(id);
    }
  }

  // work-instructions headings
  const workPath = join(pkgDir, "work-instructions.md");
  if (existsSync(workPath)) {
    const work = readText(workPath);
    for (const heading of REQUIRED_WORK_INSTRUCTION_HEADINGS) {
      if (!work.includes(heading)) {
        add("missing-heading", workPath, `work-instructions is missing heading "${heading}"`);
      }
    }
  }

  // 6/7/9/10. execution-state cross-field consistency
  if (state) {
    const completed = Array.isArray(state.completedStages) ? state.completedStages : [];
    // active stage must not also be completed
    if (state.activeStage && completed.includes(state.activeStage)) {
      add("active-completed-conflict", statePath, `activeStage ${state.activeStage} is also in completedStages`);
    }
    // duplicate completed stage ids
    const seen = new Set();
    for (const id of completed) {
      if (seen.has(id)) add("duplicate-stage", statePath, `completedStages contains duplicate ${id}`);
      seen.add(id);
    }
    // completed stage must have all its required gates recorded as pass
    const requiredGates = state.requiredGates && typeof state.requiredGates === "object" ? state.requiredGates : {};
    const gateResults = state.gateResults && typeof state.gateResults === "object" ? state.gateResults : {};
    for (const stage of completed) {
      const gates = Array.isArray(requiredGates[stage]) ? requiredGates[stage] : [];
      for (const gate of gates) {
        if (gateResults[gate] !== "pass") {
          add(
            "completed-gate-not-passed",
            statePath,
            `stage ${stage} is completed but gate "${gate}" is ${gateResults[gate] ?? "unrecorded"}`,
          );
        }
      }
    }
    // blocked <-> blockerReason <-> status
    if (state.blocked === true && (state.blockerReason === null || state.blockerReason === "")) {
      add("blocked-reason-mismatch", statePath, "blocked is true but blockerReason is empty");
    }
    if (state.blocked === false && state.blockerReason !== null) {
      add("blocked-reason-mismatch", statePath, "blocked is false but blockerReason is set");
    }
    if ((state.status === "blocked") !== (state.blocked === true)) {
      add("blocked-reason-mismatch", statePath, `status "${state.status}" disagrees with blocked=${state.blocked}`);
    }
  }

  // 11-15. content / privacy scan over the package's text files
  for (const file of walkFiles(pkgDir)) {
    const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
    if (AUDIO_EXTENSIONS.has(ext)) {
      add("raw-audio-commit", file, "audio/MIDI binary must not live inside phase docs");
      continue;
    }
    if (!/\.(md|json|txt)$/i.test(file)) continue;
    if (file.includes(".local-evaluation")) {
      add("local-evaluation-artifact", file, "file lives under .local-evaluation");
    }
    const lines = readText(file).split(/\r?\n/);
    lines.forEach((line, i) => {
      const where = `${file}:${i + 1}`;
      if (/[A-Za-z]:[\\/]Users[\\/](?!<)[^\\/\s"'`)]+/.test(line)) {
        add("personal-path", file, `personal absolute path at line ${i + 1}: ${line.trim()}`);
      }
      if (isProhibition(line)) return; // prohibitions are allowed to name dangerous actions
      // English merge/push-to-master phrasing is itself a directive; Japanese
      // "master へ … merge/push" only counts when paired with an affirmative
      // imperative, so prose that merely names the action (e.g. a bare "禁止事項"
      // list item, or "merge・push指示") is not misread as a command.
      const englishMergePush =
        /(?:merge|push)\s+(?:into|to)\s+(?:master|main)\b/i.test(line) ||
        /\bgit\s+push\b/i.test(line);
      const japaneseMergePush =
        /(?:master|main)\s*(?:branch)?\s*へ.*(?:merge|マージ|push|プッシュ)/i.test(line) &&
        AFFIRMATIVE_IMPERATIVE.test(line);
      if (englishMergePush || japaneseMergePush) {
        add("unauthorized-merge-push", file, `merge/push-to-master directive at line ${i + 1}: ${line.trim()}`);
      }
      // Key on an actual audio/MIDI file extension, not a generic word: the
      // feature is literally named "recording", so matching that word would
      // false-positive on every mention of the module.
      if (
        /(?:commit|コミット|git\s+add).*(?:\.midi?\b|\.wav\b|\.webm\b|\.ogg\b|\.m4a\b|\.mp3\b|\.flac\b|\.aac\b|\.aiff\b)/i.test(line)
      ) {
        add("raw-audio-commit", file, `raw audio/MIDI commit directive at line ${i + 1}: ${line.trim()}`);
      }
      void where;
    });
  }

  return { dir: rel(pkgDir), phaseId, issues };
}

// ---------------------------------------------------------------------------
// Repo-wide discovery + orchestration
// ---------------------------------------------------------------------------

/** Finds every phase package (directory containing execution-state.json) under docs/. */
export function discoverPhasePackages(repoRoot) {
  const docsDir = join(repoRoot, "docs");
  if (!existsSync(docsDir)) return [];
  const packages = [];
  for (const file of walkFiles(docsDir)) {
    if (basename(file) === "execution-state.json") {
      packages.push(join(file, ".."));
    }
  }
  return packages.map((p) => join(p)).sort();
}

/**
 * Validates the whole repository: repo-level rules plus every discovered
 * phase package. Returns a structured result; issueCount === 0 means PASS.
 */
export function validateRepository(repoRoot) {
  const schemaPath = join(repoRoot, "docs/phase-workflow/execution-state.schema.json");
  const rel = (f) => relative(repoRoot, f).split("\\").join("/");
  const repoIssues = [];

  if (!existsSync(schemaPath)) {
    repoIssues.push({ check: "missing-file", file: rel(schemaPath), message: "execution-state.schema.json is missing" });
    return { repoIssues, packages: [], issueCount: repoIssues.length };
  }
  const schema = JSON.parse(readText(schemaPath));

  // retired doc must not come back
  if (existsSync(join(repoRoot, "docs/CURRENT_STATE.md"))) {
    repoIssues.push({
      check: "current-state-reference",
      file: "docs/CURRENT_STATE.md",
      message: "retired docs/CURRENT_STATE.md must not exist",
    });
  }

  const packages = discoverPhasePackages(repoRoot).map((pkgDir) =>
    validatePackage(pkgDir, { schema, repoRoot }),
  );

  const issueCount =
    repoIssues.length + packages.reduce((sum, p) => sum + p.issues.length, 0);
  return { repoIssues, packages, issueCount };
}
