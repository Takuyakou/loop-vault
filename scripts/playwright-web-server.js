/* global process */

export const visualPlaywrightTestEnvironmentKey = "LOOP_VAULT_VISUAL_TEST";

export function shouldReusePlaywrightWebServer(environment = process.env) {
  return !environment.CI && environment[visualPlaywrightTestEnvironmentKey] !== "1";
}