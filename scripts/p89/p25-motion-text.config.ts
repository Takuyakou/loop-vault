// P25 V14 motion videos for the text intake only (not part of test:ui / test:full). Needs a fixture build in dist/
// (any `node scripts/run-playwright-visual-tests.mjs …` run leaves one). Run:
//   LOOP_VAULT_PLAYWRIGHT_PORT=4203 npx playwright test --config scripts/p89/p25-motion-text.config.ts
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.LOOP_VAULT_PLAYWRIGHT_PORT ?? 4174);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: ".",
  testMatch: "p25-motion-text.pw.ts",
  workers: 1,
  retries: 0,
  timeout: 300_000,
  reporter: [["list"]],
  outputDir: "../../test-results/p25-motion-text",
  use: { ...devices["Desktop Chrome"], baseURL, colorScheme: "dark", locale: "ja-JP", timezoneId: "Asia/Tokyo", deviceScaleFactor: 1 },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: "../..",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
