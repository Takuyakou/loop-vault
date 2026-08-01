#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import process from "node:process";

/**
 * Blocks private inputs, tool-owned configuration, and generated output from
 * entering a commit. This is deliberately stricter than ignore rules.
 */
const BLOCKED_PATHS = [
  { pattern: /^\.agents(?:\/|$)/, reason: "agent-owned configuration is never committed" },
  { pattern: /^\.claude(?:\/|$)/, reason: "agent-owned configuration is never committed" },
  { pattern: /^artifacts(?:\/|$)/, reason: "generated evaluation artifacts are never committed" },
  { pattern: /^(?:playwright-report|test-results|blob-report)(?:\/|$)/, reason: "test report output is not committed" },
  { pattern: /^(?:node_modules|target)(?:\/|$)/, reason: "dependency/build output is not committed" },
  { pattern: /^\.local-evaluation(?:\/|$)/, reason: "local evaluation input is never committed" },
  { pattern: /^local-evaluation(?:\/|$)/, reason: "local evaluation input is never committed" },
  { pattern: /^test\/phase5\.15(?:\/|-|$)/, reason: "Phase 5.15 generated corpora are never committed" },
  { pattern: /^test\/(?:loop-vault-evaluation-corpus|loop-vault-chapter3-seed|loop-vault-voicing-gold-corpus-v1|loop-vault-bass-companion-identity-gold-v1)(?:\/|$)/, reason: "local evaluation corpus is never committed" },
  { pattern: /^test\/private-midi(?:\/|$)/, reason: "private MIDI is never committed" },
  { pattern: /^src-tauri\/gen(?:\/|$)/, reason: "generated Tauri schemas are not committed" },
  { pattern: /^src-tauri\/target[^/]*(?:\/|$)/, reason: "Rust build output is not committed" },
  { pattern: /^(?:dist|build|out|coverage|\.next)(?:\/|$)/, reason: "build output is not committed" },
];

const MIDI_PATTERN = /\.(mid|midi)$/i;

export function findStagedFileViolations(files) {
  const violations = [];
  for (const rawFile of files) {
    const file = rawFile.replaceAll("\\", "/");
    const blocked = BLOCKED_PATHS.find(({ pattern }) =>
      pattern.test(file.toLowerCase()));
    if (blocked) {
      violations.push(`${file} — ${blocked.reason}`);
      continue;
    }
    if (MIDI_PATTERN.test(file)) {
      violations.push(`${file} — MIDI files must never be committed`);
    }
  }
  return violations;
}

export function splitNulPaths(output) {
  const bytes = Buffer.isBuffer(output) ? output : Buffer.from(output);
  return bytes.toString("utf8").split("\0").filter((path) => path.length > 0);
}

export function stagedFiles(repositoryRoot = process.cwd()) {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
    { cwd: repositoryRoot, encoding: "buffer" },
  );
  return splitNulPaths(output);
}

function main() {
  const violations = findStagedFileViolations(stagedFiles());
  if (violations.length > 0) {
    process.stderr.write("\nStaged files rejected:\n\n");
    for (const violation of violations) process.stderr.write(`  ${violation}\n`);
    process.stderr.write(
      "\nUnstage these files with `git restore --staged <file>`.\n\n",
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    "Staged files are clear of private inputs and generated output.\n",
  );
}

if (
  process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1]
) {
  main();
}
