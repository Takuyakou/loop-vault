// Draft for scripts/docs-layout/validate.node-test.mjs (P25 M6).
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  checkAllTrackedText,
  checkDocsPaths,
  checkLayout,
  checkScriptImports,
  checkWordsAndPrivacy,
} from "./validate.mjs";

const roots = [];
function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "docs-layout-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}
afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

const trackedOf = (files) => Object.keys(files);

describe("checkLayout", () => {
  it("accepts the M1 docs and root shape", () => {
    const files = {
      "README.md": "",
      "docs/README.md": "",
      "docs/current/features.md": "",
      "docs/designs/v3.2.0-p25.md": "",
      "docs/contracts/voicing-shapes-p26/golden.json": "",
      "docs/release/v3.1.0/release-notes.md": "",
      "docs/images/demo.gif": "",
      "docs/security/policy.md": "",
      "docs/ai-handoff/README.md": "",
      "docs/archive/legacy-root/spec.md": "",
      "package.json": "{}",
      "src/main.ts": "",
      "scripts/x.mjs": "",
    };
    assert.deepEqual(checkLayout(makeRepo(files), trackedOf(files)), []);
  });

  it("rejects an extra docs top-level entry and an extra root entry", () => {
    const files = {
      "docs/README.md": "",
      "docs/reports/old.md": "",
      "CHECKLIST.md": "",
      "docs/current/features.md": "",
    };
    const issues = checkLayout(makeRepo(files), trackedOf(files));
    assert.ok(issues.some((issue) => issue.check === "docs-top-level" && issue.file === "docs/reports"));
    assert.ok(issues.some((issue) => issue.check === "root-entry" && issue.file === "CHECKLIST.md"));
  });
});

describe("checkDocsPaths", () => {
  it("accepts an existing docs path and the template exceptions", () => {
    const files = {
      "docs/README.md": "",
      "src/a.ts": "// docs/README.md\nconst p = 'docs/phaseX.Y/README.md';\n",
    };
    const root = makeRepo(files);
    assert.deepEqual(checkDocsPaths(root, trackedOf(files)), []);
  });

  it("rejects a docs path that does not exist", () => {
    const files = { "docs/README.md": "", "src/a.ts": "const p = 'docs/reports/gone.md';\n" };
    const root = makeRepo(files);
    const issues = checkDocsPaths(root, trackedOf(files));
    assert.equal(issues.length, 1);
    assert.equal(issues[0].check, "docs-path");
  });

  it("accepts a real docs folder used as a prefix", () => {
    const files = { "docs/archive/reports/rel-01.md": "", "src/a.ts": "const p = 'docs/archive/reports';\n" };
    assert.deepEqual(checkDocsPaths(makeRepo(files), trackedOf(files)), []);
  });
});

describe("checkScriptImports", () => {
  it("accepts a relative import that resolves", () => {
    const files = {
      "scripts/one.ts": "import { x } from './two';\n",
      "scripts/two.ts": "export const x = 1;\n",
    };
    assert.deepEqual(checkScriptImports(makeRepo(files), trackedOf(files)), []);
  });

  it("rejects a relative import that does not resolve", () => {
    const files = { "scripts/one.ts": "import { x } from './missing';\n" };
    const issues = checkScriptImports(makeRepo(files), trackedOf(files));
    assert.equal(issues.length, 1);
    assert.equal(issues[0].check, "script-import");
  });
});

describe("checkWordsAndPrivacy", () => {
  // Built at runtime so this test file itself never contains a forbidden word or a
  // personal path (the --release scan reads every tracked text file, including tests).
  const englishWord = "hir" + "ing";
  const englishWordTitle = "Hir" + "ing";
  const anotherWord = "port" + "folio";
  const japaneseWord = "転" + "職";

  it("accepts clean docs", () => {
    const files = { "docs/README.md": "# index\n", "docs/current/features.md": "# features\n" };
    assert.deepEqual(checkWordsAndPrivacy(makeRepo(files), { words: [englishWord, japaneseWord], tracked: trackedOf(files) }), []);
  });

  it("rejects a personal absolute path and a forbidden word", () => {
    const files = {
      "docs/README.md": "C:\\Users\\someone\\note.md\n",
      "docs/current/features.md": `${englishWordTitle} note.\n`,
    };
    const issues = checkWordsAndPrivacy(makeRepo(files), { words: [englishWord], tracked: trackedOf(files) });
    assert.ok(issues.some((issue) => issue.check === "personal-path"));
    assert.ok(issues.some((issue) => issue.check === "publish-word"));
  });

  it("checks text passed on the command line too", () => {
    const files = { "docs/README.md": "# index\n" };
    const issues = checkWordsAndPrivacy(makeRepo(files), { words: [anotherWord], texts: [`Loop Vault ${anotherWord}`], tracked: trackedOf(files) });
    assert.ok(issues.some((issue) => issue.check === "publish-word" && issue.file === "extra text 1"));
  });
});

describe("checkAllTrackedText", () => {
  const englishWord = "hir" + "ing";

  it("examines every tracked text file and reports the count", () => {
    const files = { "README.md": "hello\n", "src/a.ts": "const a = 1;\n", "docs/archive/x.md": `${englishWord}\n` };
    const { issues, examined } = checkAllTrackedText(makeRepo(files), [englishWord], trackedOf(files));
    assert.equal(examined, 3);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].file, "docs/archive/x.md");
  });
});
