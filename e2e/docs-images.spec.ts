import { test, expect } from "@playwright/test";
import { analyzeCurrentMidi, dropMidi } from "./helpers/app";
import { createMidiFixture } from "./helpers/midiFixture";

// R-03: the README screenshots. Synthetic data only; written to an ignored folder unless
// UPDATE_REPORT_SCREENSHOTS=1, which is the explicit request to publish them under docs/images/.
const dir = process.env.UPDATE_REPORT_SCREENSHOTS === "1" ? "docs/images" : "p89-generated/docs-images";

test.use({ viewport: { width: 1440, height: 900 } });

test("docs images: Voicing Loop picker with favourites (VL-15)", async ({ page }) => {
  await page.goto("/?p527Status=vl15-picker");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  await page.getByTestId("voicing-loop-section-favorites").waitFor();
  await page.screenshot({ path: `${dir}/v2.1-voicing-loop.png`, fullPage: true });
});

test("docs images: correction workspace", async ({ page }) => {
  // ?p528Direct=1 keeps the Playwright build's default Voicing Loop fixture out of the way.
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="capture"]').click();
  await expect(page.locator("[data-capture-midi-drop-zone]")).toBeVisible();
  await dropMidi(page, createMidiFixture({ voiceCount: 3 }), "synthetic-progression.mid");
  await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
  await analyzeCurrentMidi(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/v2.1-correction-workspace.png`, fullPage: true });
});

test("docs images: Vault list", async ({ page }) => {
  await page.goto("/?p104=long");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="vault"]').click();
  await page.locator(".lv-vault-row").first().waitFor();
  await page.screenshot({ path: `${dir}/v2.1-vault.png`, fullPage: true });
});

test("docs images: Chord Dojo home", async ({ page }) => {
  await page.goto("/?p12=midi");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="chord-dojo"]').click();
  await page.getByTestId("practice-start").waitFor();
  await page.screenshot({ path: `${dir}/v2.1-chord-dojo.png`, fullPage: true });
});
