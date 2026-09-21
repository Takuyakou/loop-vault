import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_MAX_LINES,
  HANDOFF_MAX_LINES,
  REQUIRED_FILES,
  classifyVerifiedSha,
  extractVerifiedSha,
  validateHandoffDocs,
} from "./lib.mjs";

const SHA = "0".repeat(40);

const defaultHandoff =
  `## Last verified against\n- commit: ${SHA}\n- date: 2026-09-21\n`;

function buildRepo({ handoff = defaultHandoff, omitFiles = [], tracked = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ai-handoff-"));
  const pkg = join(root, "docs", "ai-handoff");
  mkdirSync(pkg, { recursive: true });
  for (const name of REQUIRED_FILES) {
    if (omitFiles.includes(name)) continue;
    const content =
      name === "HANDOFF.md" ? handoff
        : name === "ARCHITECTURE-MAP.md" ? "# map\n"
          : "# doc\n";
    writeFileSync(join(pkg, name), content);
  }
  const result = { root, pkg, tracked };
  return result;
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

function run({ handoff = defaultHandoff, omitFiles = [], tracked = [] } = {}) {
  const { root } = buildRepo({ handoff, omitFiles, tracked });
  try {
    return validateHandoffDocs(root, { listTrackedFiles: () => tracked });
  } finally {
    cleanup(root);
  }
}

function checks(result) {
  return new Set([...result.issues, ...result.warnings].map((i) => i.check));
}

describe("ai-handoff validator — verified SHA", () => {
  it("extracts the 40-hex SHA from the freshness header", () => {
    expect(extractVerifiedSha(defaultHandoff)).toBe(SHA);
  });

  it("returns null when the SHA is missing", () => {
    expect(extractVerifiedSha("# no header\n")).toBeNull();
  });

  it("fails a SHA that is not a git object", () => {
    expect(classifyVerifiedSha(SHA, false, false).status).toBe("fail");
  });

  it("warns a SHA that exists but is not an ancestor", () => {
    expect(classifyVerifiedSha(SHA, true, false).status).toBe("warn");
  });

  it("passes a SHA that is an ancestor of HEAD", () => {
    expect(classifyVerifiedSha(SHA, true, true).status).toBe("pass");
  });
});

describe("ai-handoff validator — structure", () => {
  it("passes a valid handoff package", () => {
    expect(run().issues).toEqual([]);
  });

  it("fails when a required file is missing", () => {
    const result = run({ omitFiles: ["GLOSSARY.md"] });
    expect(checks(result)).toContain("missing-handoff-file");
  });

  it("fails when CURRENT_STATE.md is present", () => {
    const { root } = buildRepo();
    writeFileSync(join(root, "docs", "CURRENT_STATE.md"), "# retired\n");
    try {
      const result = validateHandoffDocs(root, { listTrackedFiles: () => [] });
      expect(checks(result)).toContain("current-state-reference");
    } finally {
      cleanup(root);
    }
  });

  it("fails when the verified SHA is missing", () => {
    const result = run({ handoff: "# no freshness header\n" });
    expect(checks(result)).toContain("verified-sha");
  });

  it("fails when HANDOFF exceeds its line limit", () => {
    const long = defaultHandoff + "text\n".repeat(HANDOFF_MAX_LINES);
    const result = run({ handoff: long });
    expect(checks(result)).toContain("handoff-line-limit");
  });

  it("fails when ARCHITECTURE-MAP exceeds its line limit", () => {
    const { root, pkg } = buildRepo();
    writeFileSync(join(pkg, "ARCHITECTURE-MAP.md"), "# map\n" + "text\n".repeat(ARCHITECTURE_MAX_LINES));
    try {
      const result = validateHandoffDocs(root, { listTrackedFiles: () => [] });
      expect(checks(result)).toContain("architecture-line-limit");
    } finally {
      cleanup(root);
    }
  });
});

describe("ai-handoff validator — paths and privacy", () => {
  it("fails an invalid HARD path", () => {
    const result = run({ handoff: defaultHandoff + "\nSee `src/does-not-exist.ts`.\n" });
    expect(checks(result)).toContain("hard-path");
  });

  it("warns (not fails) a broken historical phase path", () => {
    const result = run({ handoff: defaultHandoff + "\nSee `docs/phase9.9/README.md`.\n" });
    expect(checks(result)).toContain("historical-path");
    expect(result.issues.map((i) => i.check)).not.toContain("historical-path");
  });

  it("fails a personal absolute path", () => {
    const result = run({ handoff: defaultHandoff + "\nSee C:\\Users\\alice\\take.json\n" });
    expect(checks(result)).toContain("personal-path");
  });

  it("fails a raw audio/MIDI commit directive", () => {
    const result = run({ handoff: defaultHandoff + "\ngit add song.mid\n" });
    expect(checks(result)).toContain("raw-audio-commit");
  });

  it("fails a tracked file under .local-evaluation", () => {
    const result = run({ tracked: [".local-evaluation/x.json"] });
    expect(checks(result)).toContain("tracked-private-media");
  });

  it("fails tracked private MIDI outside test/fixtures", () => {
    const result = run({ tracked: ["some/dir/private.mid"] });
    expect(checks(result)).toContain("tracked-private-media");
  });

  it("allows a synthetic MIDI fixture under test/fixtures", () => {
    const result = run({ tracked: ["test/fixtures/synth.mid"] });
    expect(checks(result)).not.toContain("tracked-private-media");
  });
});
