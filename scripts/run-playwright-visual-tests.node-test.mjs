import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldReusePlaywrightWebServer,
  visualPlaywrightTestEnvironmentKey,
} from "./playwright-web-server.js";
import {
  playwrightArguments,
  visualTestBuildMetadata,
  visualTestCommandPlan,
  visualTestEnvironment,
} from "./run-playwright-visual-tests.mjs";

test("visual Playwright builds replace only dynamic build metadata", () => {
  const environment = visualTestEnvironment({
    KEEP_ME: "yes",
    VITE_BUILD_COMMIT: "developer-commit",
    VITE_BUILD_DATE: "2099-01-01T00:00:00.000Z",
  });

  assert.deepEqual(visualTestBuildMetadata, {
    VITE_BUILD_COMMIT: "visual-test",
    VITE_BUILD_DATE: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(environment.KEEP_ME, "yes");
  assert.equal(environment.VITE_BUILD_COMMIT, "visual-test");
  assert.equal(environment.VITE_BUILD_DATE, "2026-01-01T00:00:00.000Z");
  assert.equal(environment[visualPlaywrightTestEnvironmentKey], "1");
  assert.equal(shouldReusePlaywrightWebServer(environment), false);
});

test("web server reuse follows the visual runner flag without changing normal behavior", () => {
  assert.equal(shouldReusePlaywrightWebServer({}), true);
  assert.equal(shouldReusePlaywrightWebServer({ CI: "1" }), false);
  assert.equal(shouldReusePlaywrightWebServer({
    [visualPlaywrightTestEnvironmentKey]: "1",
  }), false);
});

test("Settings runner plans only the focused Playwright selection", () => {
  const commandPlan = visualTestCommandPlan([
    "e2e/visual.spec.ts",
    "--grep",
    "Settings visual baseline",
    "--update-snapshots",
  ]);

  assert.deepEqual(commandPlan.slice(0, 2), [
    ["node_modules/typescript/bin/tsc"],
    ["node_modules/vite/bin/vite.js", "build"],
  ]);
  assert.deepEqual(commandPlan[2], [
    "node_modules/@playwright/test/cli.js",
    "test",
    "e2e/visual.spec.ts",
    "--grep",
    "Settings visual baseline",
    "--update-snapshots",
  ]);
  assert.deepEqual(
    playwrightArguments(["e2e/visual.spec.ts"]),
    ["test", "e2e/visual.spec.ts"],
  );
});