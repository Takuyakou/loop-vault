import { execFileSync } from "node:child_process";
import process from "node:process";

/**
 * Blocks private audio and generated output from entering a commit.
 *
 * Phase 4.0 pushed a folder of personal MIDI to the remote because a broad
 * `git add -A` swept it in. Ignore rules alone did not stop it: the folder was
 * untracked but not yet ignored at that moment. This checks what is actually
 * staged, which is the last point where the mistake is still cheap to undo.
 */

/** MIDI is only ever committable as a synthetic fixture kept under this path. */
const MIDI_ALLOWLIST = [/^test\/fixtures\//];

const BLOCKED_PATHS = [
  { pattern: /^\.local-evaluation\//, reason: "local evaluation input is never committed" },
  { pattern: /^test\/private-midi\//, reason: "private MIDI is never committed" },
  { pattern: /^src-tauri\/gen\//, reason: "generated Tauri schemas are not committed" },
  { pattern: /^src-tauri\/target/, reason: "build output is not committed" },
];

const MIDI_PATTERN = /\.(mid|midi)$/i;

function stagedFiles() {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8" },
  );
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

const violations = [];
for (const file of stagedFiles()) {
  const blocked = BLOCKED_PATHS.find(({ pattern }) => pattern.test(file));
  if (blocked) {
    violations.push(`${file} — ${blocked.reason}`);
    continue;
  }
  if (MIDI_PATTERN.test(file) && !MIDI_ALLOWLIST.some((pattern) => pattern.test(file))) {
    violations.push(
      `${file} — MIDI may only be committed as a synthetic fixture under test/fixtures/`,
    );
  }
}

if (violations.length > 0) {
  process.stderr.write("\nStaged files rejected:\n\n");
  for (const violation of violations) process.stderr.write(`  ${violation}\n`);
  process.stderr.write(
    "\nUnstage them with `git restore --staged <file>`."
    + " If a MIDI file really is synthetic and safe to publish, move it under"
    + " test/fixtures/ first.\n\n",
  );
  process.exit(1);
}

process.stdout.write("Staged files are clear of private audio and generated output.\n");
