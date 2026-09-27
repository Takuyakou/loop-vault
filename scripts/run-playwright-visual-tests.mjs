/* global process */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { visualPlaywrightTestEnvironmentKey } from "./playwright-web-server.js";

export const visualTestBuildMetadata = Object.freeze({
  VITE_BUILD_COMMIT: "visual-test",
  VITE_BUILD_DATE: "2026-01-01T00:00:00.000Z",
});

export const visualTestEnvironmentOverrides = Object.freeze({
  ...visualTestBuildMetadata,
  VITE_P527_E2E_FIXTURE: "1",
  [visualPlaywrightTestEnvironmentKey]: "1",
});

export function visualTestEnvironment(environment = process.env) {
  return { ...environment, ...visualTestEnvironmentOverrides };
}

export function playwrightArguments(argumentsToForward = []) {
  return ["test", ...argumentsToForward];
}

export function visualTestCommandPlan(argumentsToForward = [], environment = process.env) {
  const alreadyTypechecked = environment.LV_DX_PRECHECKED_TSC === "1";
  return [
    ...alreadyTypechecked ? [] : [["node_modules/typescript/bin/tsc"]],
    ["node_modules/vite/bin/vite.js", "build"],
    ["node_modules/@playwright/test/cli.js", ...playwrightArguments(argumentsToForward)],
  ];
}

function run(args, environment) {
  const result = spawnSync(process.execPath, args, {
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  return result.status === 0;
}

export function runPlaywrightVisualTests(argumentsToForward = process.argv.slice(2)) {
  const environment = visualTestEnvironment();
  return visualTestCommandPlan(argumentsToForward, environment).every((args) => run(args, environment));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runPlaywrightVisualTests();
}
