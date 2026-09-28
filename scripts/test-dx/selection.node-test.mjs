import assert from "node:assert/strict";
import { test } from "node:test";
import { ownerForFile, selectForFiles } from "./selection.mjs";

const select = (files, level) => selectForFiles(files, level, () => true);

test("Text Capture CSS selects a permanent contract instead of zero tests", () => {
  const result = select(["src/styles/text-intake.css"], "feature");
  assert.deepEqual(result.areas, ["text-capture"]);
  assert.ok(result.vitest.includes("src/components/capture/textCaptureStatus.test.ts"));
  assert.ok(result.browser.includes("e2e/phase8.8.6-capture-closure.spec.ts"));
});

test("parser source keeps related input and permanent semantic contracts", () => {
  const result = select(["src/domain/textProgression.ts"], "feature");
  assert.ok(result.vitest.includes("src/domain/textProgression.ts"));
  assert.ok(result.vitest.includes("src/domain/textProgression.test.ts"));
  assert.equal(result.browser.length, 0);
});

test("directly changed tests are selected", () => {
  assert.ok(select(["src/views/HomeView.test.tsx"], "fast").vitest.includes("src/views/HomeView.test.tsx"));
  assert.ok(select(["e2e/voicing-loop-v2.spec.ts"], "fast").browser.includes("e2e/voicing-loop-v2.spec.ts"));
  assert.ok(select(["scripts/test-dx/selection.node-test.mjs"], "fast").nodeTests.includes("scripts/test-dx/selection.node-test.mjs"));
});

test("shared and unknown source expands selection", () => {
  assert.equal(select(["src/styles/global.css"], "feature").broad, true);
  assert.equal(ownerForFile("src/new-feature/unknown.ts").broad, true);
});

test("default UI retains current critical browser set", () => {
  const result = select([], "ui");
  assert.ok(result.browser.includes("e2e/accessibility.spec.ts"));
  assert.ok(result.browser.includes("e2e/phase8.8.6-capture-closure.spec.ts"));
});

test("selection explains owner and normalizes Windows separators", () => {
  const result = select(["src\\store\\vaultStore.ts"], "feature");
  assert.deepEqual(result.areas, ["vault"]);
  assert.match(result.reasons[0], /Vault owner/);
});

test("P8.9 data-retention round trip is a permanent persistence and Vault contract", () => {
  for (const file of ["src/storage/tauriVaultStorage.ts", "src/store/vaultStore.ts"]) {
    assert.ok(select([file], "feature").vitest.includes("src/domain/p89DataRetention.test.ts"), file);
  }
});

test("Vault parse/serialize and the retention test belong to persistence, not broad", () => {
  for (const file of ["src/domain/repository.ts", "src/domain/schema.ts", "src/domain/repositoryBudget.test.ts", "src/domain/p89DataRetention.test.ts"]) {
    const result = select([file], "feature");
    assert.deepEqual(result.areas, ["persistence"], file);
    assert.equal(result.broad, false, file);
    assert.ok(result.vitest.includes("src/domain/p89DataRetention.test.ts"), file);
  }
});

test("P8.9 shared component folders stay shared-ui (broad)", () => {
  for (const file of ["src/components/icons/index.tsx", "src/components/notifications/NotificationProvider.tsx", "src/components/shell/TitleBar.tsx"]) {
    assert.deepEqual(ownerForFile(file).areas, ["shared-ui"], file);
    assert.equal(ownerForFile(file).broad, true, file);
  }
});

test("progression page files have their own owner instead of expanding broadly", () => {
  for (const file of ["src/views/ProgressionDetailView.tsx", "src/views/DetailView.tsx", "src/components/progression-editing/QuickChordEditor.tsx"]) {
    const result = select([file], "feature");
    assert.deepEqual(result.areas, ["progression"], file);
    assert.equal(result.broad, false, file);
    assert.ok(result.vitest.includes("src/views/ProgressionDetailView.test.tsx"), file);
    assert.ok(result.browser.includes("e2e/vault-flow.spec.ts"), file);
  }
});

test("Home and Vault logic folders stay with their screen owners", () => {
  assert.deepEqual(select(["src/views/home/useHomeSummary.ts"], "feature").areas, ["home"]);
  assert.deepEqual(select(["src/views/vault/useVaultLibraryFilters.ts"], "feature").areas, ["vault"]);
  assert.equal(select(["src/views/vault/useVaultLibraryFilters.ts"], "feature").broad, false);
});

test("P8.9 screenshot tool is evidence, not a product contract", () => {
  const owner = ownerForFile("scripts/p89/screens.mjs");
  assert.deepEqual(owner.areas, []);
  assert.equal(Boolean(owner.broad), false);
});

test("deleted files keep their owner but are not selected to run", () => {
  const result = selectForFiles(["src/views/HomeView.old.test.tsx"], "fast", (file) => file !== "src/views/HomeView.old.test.tsx");
  assert.deepEqual(result.areas, ["home"]);
  assert.ok(!result.vitest.includes("src/views/HomeView.old.test.tsx"));
  assert.ok(result.vitest.includes("src/views/HomeView.test.tsx"));
});

test("missing permanent contracts fail closed", () => {
  assert.throws(() => selectForFiles(["src/styles/text-intake.css"], "fast", () => false), /missing/);
});


test("runner and docs edits select their own validators", () => {
  const runner = select(["scripts/test-dx/run.mjs"], "fast");
  assert.deepEqual(runner.areas, ["test-infrastructure"]);
  assert.equal(runner.broad, false);
  assert.ok(runner.nodeTests.includes("scripts/test-dx/cache.node-test.mjs"));
  assert.equal(select(["docs/test-dx/README.md"], "fast").documentation, true);
});
