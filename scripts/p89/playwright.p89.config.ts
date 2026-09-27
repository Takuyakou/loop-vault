// P8.9 screenshot tool only — see scripts/p89/screens.mjs. Not part of test:ui / test:full.
import { defineConfig, devices } from "@playwright/test";
import { shouldReusePlaywrightWebServer } from "../playwright-web-server.js";

const baseURL = "http://127.0.0.1:4174";

export default defineConfig({
  testDir: ".",
  testMatch: "capture-screens.pw.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
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
    command: "npm run preview -- --host 127.0.0.1 --port 4174 --strictPort",
    cwd: "../..",
    url: baseURL,
    reuseExistingServer: shouldReusePlaywrightWebServer(),
    timeout: 30_000,
  },
});
