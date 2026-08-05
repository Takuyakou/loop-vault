import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validatePackage, validateRepository, validateAgainstSchema } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const validFixture = join(here, "__fixtures__", "phase9.9");
const schema = JSON.parse(
  readFileSync(join(repoRoot, "docs/phase-workflow/execution-state.schema.json"), "utf8"),
);

/** Copies the good fixture to a temp dir, applies `mutate`, validates, cleans up. */
function runWithMutation(mutate) {
  const tmp = mkdtempSync(join(tmpdir(), "phase-docs-"));
  const pkg = join(tmp, "phase9.9");
  cpSync(validFixture, pkg, { recursive: true });
  if (mutate) mutate(pkg);
  try {
    return validatePackage(pkg, { schema, repoRoot: tmp }).issues;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const checkSet = (issues) => new Set(issues.map((i) => i.check));

function editState(pkg, mutate) {
  const file = join(pkg, "execution-state.json");
  const state = JSON.parse(readFileSync(file, "utf8"));
  mutate(state);
  writeFileSync(file, JSON.stringify(state, null, 2));
}

describe("phase-docs validator — good fixture", () => {
  it("reports zero issues for a valid package", () => {
    expect(runWithMutation(null)).toEqual([]);
  });
});

describe("phase-docs validator — one violation per check", () => {
  it("missing-file: required file deleted", () => {
    const issues = runWithMutation((pkg) => rmSync(join(pkg, "work-instructions.md")));
    expect(checkSet(issues)).toContain("missing-file");
  });

  it("phase-id-mismatch: execution-state phaseId diverges", () => {
    const issues = runWithMutation((pkg) => editState(pkg, (s) => (s.phaseId = "8.8")));
    expect(checkSet(issues)).toContain("phase-id-mismatch");
  });

  it("broken-link: README links a missing file", () => {
    const issues = runWithMutation((pkg) =>
      appendFileSync(join(pkg, "README.md"), "\n[gone](does-not-exist.md)\n"),
    );
    expect(checkSet(issues)).toContain("broken-link");
  });

  it("required-reading-order: section has no links", () => {
    const issues = runWithMutation((pkg) => {
      const file = join(pkg, "README.md");
      // strip every markdown link, leaving the reading order section empty of links
      const stripped = readFileSync(file, "utf8").replace(/\[([^\]]*)\]\([^)]+\)/g, "$1");
      writeFileSync(file, stripped);
    });
    expect(checkSet(issues)).toContain("required-reading-order");
  });

  it("missing-heading: README loses a required heading", () => {
    const issues = runWithMutation((pkg) => {
      const file = join(pkg, "README.md");
      writeFileSync(file, readFileSync(file, "utf8").replace("## Status", "## Progress"));
    });
    expect(checkSet(issues)).toContain("missing-heading");
  });

  it("schema: execution-state violates the schema", () => {
    const issues = runWithMutation((pkg) => editState(pkg, (s) => (s.completedStages = "nope")));
    expect(checkSet(issues)).toContain("schema");
  });

  it("active-completed-conflict: activeStage is also completed", () => {
    const issues = runWithMutation((pkg) => editState(pkg, (s) => (s.completedStages = ["P9.9-00"])));
    expect(checkSet(issues)).toContain("active-completed-conflict");
  });

  it("duplicate-stage: completedStages has a duplicate", () => {
    const issues = runWithMutation((pkg) =>
      editState(pkg, (s) => {
        s.activeStage = "P9.9-02";
        s.completedStages = ["P9.9-01", "P9.9-01"];
        s.gateResults = { "unit-tests": "pass" };
      }),
    );
    expect(checkSet(issues)).toContain("duplicate-stage");
  });

  it("completed-gate-not-passed: completed stage with an unpassed gate", () => {
    const issues = runWithMutation((pkg) =>
      editState(pkg, (s) => {
        s.activeStage = "P9.9-02";
        s.completedStages = ["P9.9-01"];
      }),
    );
    expect(checkSet(issues)).toContain("completed-gate-not-passed");
  });

  it("blocked-reason-mismatch: blocked without a reason", () => {
    const issues = runWithMutation((pkg) => editState(pkg, (s) => (s.blocked = true)));
    expect(checkSet(issues)).toContain("blocked-reason-mismatch");
  });

  it("personal-path: a Windows personal path appears", () => {
    const issues = runWithMutation((pkg) =>
      appendFileSync(join(pkg, "work-instructions.md"), "\nSee C:\\Users\\alice\\take.json\n"),
    );
    expect(checkSet(issues)).toContain("personal-path");
  });

  it("local-evaluation-artifact: a link points into .local-evaluation", () => {
    const issues = runWithMutation((pkg) =>
      appendFileSync(join(pkg, "README.md"), "\n[e](.local-evaluation/out.json)\n"),
    );
    expect(checkSet(issues)).toContain("local-evaluation-artifact");
  });

  it("raw-audio-commit: a directive to commit audio", () => {
    const issues = runWithMutation((pkg) =>
      appendFileSync(join(pkg, "work-instructions.md"), "\ngit add my-take.wav\n"),
    );
    expect(checkSet(issues)).toContain("raw-audio-commit");
  });

  it("raw-audio-commit: an audio binary lives in the package", () => {
    const issues = runWithMutation((pkg) => {
      const dir = join(pkg, "evidence");
      cpSync(validFixture, dir, { recursive: true }); // ensure dir exists cheaply
      rmSync(dir, { recursive: true, force: true });
      writeFileSync(join(pkg, "take.wav"), "RIFF....");
    });
    expect(checkSet(issues)).toContain("raw-audio-commit");
  });

  it("current-state-reference: a link to the retired doc", () => {
    const issues = runWithMutation((pkg) =>
      appendFileSync(join(pkg, "README.md"), "\n[old](../CURRENT_STATE.md)\n"),
    );
    expect(checkSet(issues)).toContain("current-state-reference");
  });

  it("unauthorized-merge-push: a directive to merge/push to master", () => {
    const issues = runWithMutation((pkg) =>
      appendFileSync(join(pkg, "work-instructions.md"), "\n完了したらmasterへmergeしてpushする\n"),
    );
    expect(checkSet(issues)).toContain("unauthorized-merge-push");
  });

  it("prohibition lines are not flagged as merge/push directives", () => {
    const issues = runWithMutation((pkg) =>
      appendFileSync(join(pkg, "work-instructions.md"), "\nmasterへ勝手にmergeやpushをしないでください\n"),
    );
    expect(checkSet(issues)).not.toContain("unauthorized-merge-push");
  });

  it("bare prohibition list items and negated JP lines are not flagged", () => {
    const issues = runWithMutation((pkg) =>
      appendFileSync(
        join(pkg, "work-instructions.md"),
        [
          "",
          "禁止事項：",
          "- masterへのmerge",
          "- main/masterへの無断merge・push指示",
          "masterへmergeせず、人間の実機確認待ちで停止してください。",
          "指定外Stage、masterへのmerge、pushには進まず、報告して停止してください。",
          "",
        ].join("\n"),
      ),
    );
    expect(checkSet(issues)).not.toContain("unauthorized-merge-push");
  });

  it("English merge-to-master directives are still flagged", () => {
    const issues = runWithMutation((pkg) =>
      appendFileSync(join(pkg, "work-instructions.md"), "\nWhen the stage is done, merge to master and push.\n"),
    );
    expect(checkSet(issues)).toContain("unauthorized-merge-push");
  });
});

describe("validateAgainstSchema", () => {
  it("accepts a valid execution-state", () => {
    const state = JSON.parse(readFileSync(join(validFixture, "execution-state.json"), "utf8"));
    expect(validateAgainstSchema(state, schema)).toEqual([]);
  });

  it("rejects a bad enum and a bad const", () => {
    const state = JSON.parse(readFileSync(join(validFixture, "execution-state.json"), "utf8"));
    state.status = "wat";
    state.schemaVersion = 2;
    expect(validateAgainstSchema(state, schema).length).toBeGreaterThanOrEqual(2);
  });
});

describe("validateRepository — committed docs are clean", () => {
  it("finds the template and reports no issues", () => {
    const result = validateRepository(repoRoot);
    expect(result.packages.length).toBeGreaterThanOrEqual(1);
    expect(result.issueCount, JSON.stringify(result, null, 2)).toBe(0);
  });
});
