import { test, type Page } from "@playwright/test";

/** Measurements for the people who work on the preview audio (not part of the test run: `PREVIEW_PROBE=1 npx playwright test ...`). */
test.skip(!process.env.PREVIEW_PROBE, "a measurement, not a test: set PREVIEW_PROBE=1");
test.setTimeout(300_000);

const open = async (page: Page) => {
  await page.goto("/?previewfade=1&p12=midi");
  await page.waitForFunction(() => Boolean((window as unknown as { __previewFadeLab?: unknown }).__previewFadeLab));
};
type Lab = Record<string, (...args: unknown[]) => Promise<unknown>>;
const call = (page: Page, name: string, ...args: unknown[]) =>
  page.evaluate(([n, a]) => ((window as unknown as { __previewFadeLab: Lab }).__previewFadeLab[n as string] as (...x: unknown[]) => Promise<unknown>)(...(a as unknown[])), [name, args] as const);

test("does releaseAll(time) cancel a note that was scheduled for later? (the loudest sample 0.6-1.2 s after the scheduling)", async ({ page }) => {
  await open(page);
  for (const sound of ["piano", "electric-piano"]) console.log("PROBE-RELEASEALL", sound, JSON.stringify(await call(page, "releaseAllProbe", sound)));
});

test("how long does a new instrument take, and how late does a restarted preview begin to sound? (ms)", async ({ page }) => {
  await open(page);
  for (const sound of ["piano", "electric-piano"]) console.log("PROBE-BUILD", sound, JSON.stringify(await call(page, "buildProbe", sound)));
});
