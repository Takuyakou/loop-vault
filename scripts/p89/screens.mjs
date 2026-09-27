/* global process, console */
// P8.9 evidence screenshots: `npm run p89:screens -- <name>`.
// Reuses the visual-test runner (typecheck + fixture-enabled build + Playwright)
// with a dedicated config, so normal test:ui / test:full runs never include it.
// Output: p89-generated/<name>/<screen>@<width>x<height>.png (git-ignored).
import { runPlaywrightVisualTests } from "../run-playwright-visual-tests.mjs";

const name = process.argv[2];
if (!name || !/^[A-Za-z0-9._-]+$/.test(name)) {
  console.error("usage: npm run p89:screens -- <name>   (letters, digits, . _ - only)");
  process.exit(2);
}

process.env.P89_SCREENS_NAME = name;
// Only this build includes the dev-only component gallery (main.tsx, ?gallery).
process.env.VITE_P89_GALLERY = "1";
if (!runPlaywrightVisualTests(["--config", "scripts/p89/playwright.p89.config.ts"])) {
  process.exitCode ||= 1;
}
