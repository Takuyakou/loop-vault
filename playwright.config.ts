import { defineConfig, devices } from "@playwright/test";
import { shouldReusePlaywrightWebServer } from "./scripts/playwright-web-server.js";

const port = Number(process.env.LOOP_VAULT_PLAYWRIGHT_PORT ?? 4174);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("LOOP_VAULT_PLAYWRIGHT_PORT must be a valid TCP port");
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 2,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.002,
    },
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    colorScheme: "dark",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      testIgnore: [
        "**/keyboard.spec.ts",
        "**/responsive.spec.ts",
        "**/reduced-motion.spec.ts",
      ],
      use: { viewport: { width: 1280, height: 720 } },
    },
    {
      name: "chromium-keyboard",
      testMatch: "**/keyboard.spec.ts",
      use: { viewport: { width: 1280, height: 720 } },
    },
    {
      name: "chromium-narrow",
      testMatch: "**/responsive.spec.ts",
      use: { viewport: { width: 1024, height: 720 } },
    },
    {
      name: "chromium-reduced-motion",
      testMatch: "**/reduced-motion.spec.ts",
      use: {
        viewport: { width: 1280, height: 720 },
        contextOptions: { reducedMotion: "reduce" },
      },
    },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: shouldReusePlaywrightWebServer(),
    timeout: 30_000,
  },
});
