// P8.9 evidence screenshots (not a product contract). Run via `npm run p89:screens -- <name>`.
// Synthetic data only: the app starts with the browser in-memory Vault and the
// data comes from the E2E MIDI fixture and synthetic text. No personal Vault is read.
// The in-memory Vault is lost on reload, so each size walks all screens in one page.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeCurrentMidi, chooseFirstCandidate, loadMidiForPreAnalysis, openApp } from "../../e2e/helpers/app";
import { createMidiFixture } from "../../e2e/helpers/midiFixture";

const NAME = process.env.P89_SCREENS_NAME ?? "adhoc";
const OUT = join(process.cwd(), "p89-generated", NAME);
const SIZES = [
  [1920, 1080],
  [1440, 900],
  [960, 1032],
  [768, 640],
] as const;

interface SizeResult { size: string; captured: string[]; unreachable: { screen: string; reason: string }[] }
const results: SizeResult[] = [];

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

/** Clicks a sidebar entry; practice sub-entries are hidden while collapsed, so expand, click, re-collapse. */
async function nav(page: Page, name: string) {
  const button = page.locator("nav").getByRole("button", { name, exact: true });
  if (await button.isVisible()) {
    await button.click();
    return;
  }
  const toggle = page.locator("[data-sidebar-toggle]");
  await toggle.click();
  await button.click();
  if (await toggle.getAttribute("aria-expanded") === "true") await toggle.click();
}

for (const [width, height] of SIZES) {
  const size = `${width}x${height}`;
  test.describe(`P8.9 screens @${size}`, () => {
    test.use({ viewport: { width, height } });

    test(`capture all reachable screens @${size}`, async ({ page }) => {
      const result: SizeResult = { size, captured: [], unreachable: [] };
      results.push(result);
      mkdirSync(OUT, { recursive: true });

      async function shot(screen: string, reach: () => Promise<void>) {
        try {
          await reach();
          await settle(page);
          await page.screenshot({ path: join(OUT, `${screen}@${size}.png`), animations: "disabled", caret: "hide" });
          result.captured.push(screen);
        } catch (error) {
          result.unreachable.push({ screen, reason: (error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, 160) });
        }
      }

      await openApp(page);
      await shot("home-empty", async () => {});
      await shot("capture-empty", async () => {
        await nav(page, "Chord Capture");
        await expect(page.locator("[data-capture-midi-drop-zone]").first()).toBeVisible();
      });
      await shot("capture-text-standard", async () => {
        await nav(page, "Chord Capture");
        await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト|Text/ }).click();
        const capture = page.getByTestId("text-progression-capture");
        await expect(capture).toBeVisible();
        await capture.getByTestId("text-progression-input").fill("| Cmaj7 Dm7 | G7 Cmaj7 |");
      });
      await shot("capture-text-extended", async () => {
        const capture = page.getByTestId("text-progression-capture");
        await capture.getByTestId("text-mode-extended").click();
        const input = capture.getByTestId("extended-text-intake").getByTestId("extended-text-input");
        await input.fill("# Key: C major\n# BPM: 120\n| C % = _ | F/C |");
        await expect(capture.getByTestId("extended-text-bar")).toHaveCount(2);
      });
      await shot("capture-midi-result", async () => {
        await nav(page, "Chord Capture");
        const midiMode = page.getByTestId("capture-input-mode").getByRole("button", { name: /MIDI/ });
        if (await midiMode.isVisible()) await midiMode.click();
        await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 3 }), "p89-synthetic.mid");
        await analyzeCurrentMidi(page);
      });
      // Save one synthetic progression so Vault / progression / Idea / practice screens have content.
      try {
        await chooseFirstCandidate(page);
        await page.locator('[data-candidate-state="selected"]').getByRole("button", { name: /Vaultに保存|Save to Vault/, exact: true }).click();
        const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
        await form.locator('input[name="progression-title"]').fill("P89 合成進行");
        await form.getByRole("button", { name: /保存|Save/, exact: true }).click();
        await expect(form).toBeHidden();
        // The save toast lasts 3.2 s (App.tsx), longer than the walk to the next screens,
        // and would cover the header on them.
        const toast = page.locator("[data-toast-tone]");
        if (await toast.isVisible()) await toast.getByRole("button").last().click();
      } catch (error) {
        result.unreachable.push({ screen: "(save synthetic progression)", reason: String(error).split("\n")[0].slice(0, 160) });
      }
      await shot("vault", async () => {
        await nav(page, "Vault");
        await expect(page.locator("#main-content")).toHaveAttribute("aria-label", "Vault");
      });
      await shot("progression", async () => {
        await nav(page, "Vault");
        await page.getByRole("button", { name: /進行を開く|Open progression/ }).first().click();
        await expect(page.getByRole("button", { name: /親Ideaを開く|Open parent Idea/ })).toBeVisible();
      });
      await shot("idea-detail", async () => {
        await page.getByRole("button", { name: /親Ideaを開く|Open parent Idea/ }).click();
        await expect(page.locator("#main-content")).toBeVisible();
      });
      await shot("chord-dojo", async () => {
        await nav(page, "Chord Dojo");
        await expect(page.getByTestId("practice-layout")).toBeVisible();
      });
      await shot("voicing-loop", async () => {
        await nav(page, "Voicing Loop");
      });
      let bassTabs: string[] = [];
      await shot("bass-practice", async () => {
        await nav(page, "Bass Practice");
        const tablist = page.getByRole("tablist", { name: "Bass Practice mode" });
        await expect(tablist).toBeVisible();
        bassTabs = await tablist.getByRole("tab").allInnerTexts();
      });
      for (const tab of bassTabs) {
        const slug = tab.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        await shot(`bass-practice-${slug}`, async () => {
          await page.getByRole("tablist", { name: "Bass Practice mode" }).getByRole("tab", { name: tab, exact: true }).click();
        });
      }
      await shot("settings", async () => {
        await nav(page, "Settings");
        await expect(page.getByRole("dialog", { name: /設定|Settings/ })).toBeVisible();
      });
      await page.keyboard.press("Escape");
      await shot("history", async () => {
        await nav(page, "History");
      });
      await shot("home", async () => {
        await nav(page, "Home");
      });

      expect(result.captured.length, `nothing captured @${size}`).toBeGreaterThan(0);
    });
  });
}

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify({ name: NAME, sizes: results }, null, 2)}\n`);
});
