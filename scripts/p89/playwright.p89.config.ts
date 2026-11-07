// P8.9 screenshot tool only — see scripts/p89/screens.mjs. Not part of test:ui / test:full.
import { defineConfig, devices } from "@playwright/test";
import { shouldReusePlaywrightWebServer } from "../playwright-web-server.js";

const port = Number(process.env.LOOP_VAULT_PLAYWRIGHT_PORT ?? 4174);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("LOOP_VAULT_PLAYWRIGHT_PORT must be a valid TCP port");
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: ".",
  testMatch: process.env.P89_SCREENS_NAME?.startsWith("P12.5") ? "chord-dojo-p12-5-screens.pw.ts" : process.env.P89_SCREENS_NAME?.startsWith("P15") ? "import-check-screens.pw.ts" : process.env.P89_SCREENS_NAME?.startsWith("P12.4") ? "chord-dojo-p12-4-screens.pw.ts" : process.env.P89_SCREENS_NAME?.startsWith("P5.26.2") ? "overview-p5-26-2-screens.pw.ts" : process.env.P89_SCREENS_NAME?.startsWith("P12.3") ? "chord-dojo-p12-3-screens.pw.ts" : process.env.P89_SCREENS_NAME?.startsWith("P14.0") ? "midi-connection-screens.pw.ts" : process.env.P89_SCREENS_NAME?.startsWith("P13.1") ? "bass-practice-screens.pw.ts" : process.env.P89_SCREENS_NAME?.startsWith("P12.2") ? "master251-fixes-screens.pw.ts" : /^P12\.(0-01|1)/.test(process.env.P89_SCREENS_NAME ?? "") ? "chord-dojo-screens.pw.ts" : process.env.P89_SCREENS_NAME?.startsWith("P10.4") ? "progression-screens.pw.ts" : "capture-screens.pw.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 420_000,
  reporter: [["list"]],
  outputDir: "../../test-results/p89-screens",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    colorScheme: "dark",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    deviceScaleFactor: 1,
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: "../..",
    url: baseURL,
    reuseExistingServer: shouldReusePlaywrightWebServer(),
    timeout: 30_000,
  },
});
