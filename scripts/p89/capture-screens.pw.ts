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

interface ScreenAudit {
  /** Visible filled primary (teal) buttons. */
  primary: number;
  /** Visible buttons drawn in red or yellow (text, fill or border), outside confirmation dialogs. */
  redYellow: string[];
  /** Latin words in visible text that are not proper names, chord names or units. */
  english: string[];
  /** Horizontal overflow of the page or the content area, in px. */
  overflowX: number;
  /** Scroll areas inside the content area that currently scroll vertically. */
  nestedScroll: number;
}
interface SizeResult { size: string; captured: string[]; unreachable: { screen: string; reason: string }[]; toastOverDialogButtons?: string[]; audits?: Record<string, ScreenAudit> }
const results: SizeResult[] = [];

/** Fonts loaded and the autosave settled (the header save mark is back to "saved"). */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-save-status="saved"]').waitFor({ state: "attached", timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(250);
}

/** P8.9-09 final check: measured on every captured screen and written to manifest.json. */
async function audit(page: Page): Promise<ScreenAudit> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && box.bottom > 0 && box.top < innerHeight;
    };
    const rgb = (value: string) => (value.match(/\d+(\.\d+)?/g) ?? []).map(Number);
    const tone = (value: string) => {
      const [r, g, b, a = 1] = rgb(value);
      if (a < 0.35 || r === undefined) return "";
      if (r > 190 && g < 140 && b < 150) return "red";
      if (r > 190 && g > 150 && b < 130) return "yellow";
      return "";
    };
    const buttons = [...document.querySelectorAll("button")].filter(visible);
    const primary = buttons.filter((button) => {
      const style = getComputedStyle(button);
      const [r, g, b, a = 1] = rgb(style.backgroundColor);
      return a > 0.8 && r < 110 && g > 180 && b > 170 && !button.closest(".lv-segmented, [role='radiogroup'], nav, aside, [role='tablist']");
    }).length;
    const redYellow = buttons
      .filter((button) => !button.closest("[role='dialog']"))
      .filter((button) => {
        const style = getComputedStyle(button);
        return tone(style.color) || tone(style.backgroundColor) || tone(style.borderTopColor);
      })
      .map((button) => (button.textContent || button.getAttribute("aria-label") || "?").trim().slice(0, 24));
    const allowed = /^(Loop|Vault|Voicing|Chord|Dojo|Bass|Practice|Live|MIDI|BPM|Idea|Degree|Rhythm|Bassline|Root|Motion|Echo|Context|Lesson|Rules|Source|Custom|Teacher|Core|Color|Record|Compare|Ctrl|ON|OFF|Stable|Accuracy|First|Salamander|Grand|Piano|by|Alexander|Holm|CC|https|creativecommons|org|licenses|Style|Phase|LBR|Voice|aware|DAW|Style|JSON|OpenAI|API|Windows|Drip|Space|Enter|Esc|Shift|Alt|Tab|Sus|sus|add|maj|dim|aug|min|mid|midi|synthetic|visual|test|commit|Transfer|Standard|Extended|Mono|Loop)$/;
    const words = new Set<string>();
    const walker = document.createTreeWalker(document.querySelector("#main-content") ?? document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !visible(parent) || parent.closest(".sr-only, [aria-hidden='true'], select, option, code, .font-mono")) continue;
      for (const word of node.textContent?.match(/[A-Za-z][A-Za-z]{2,}/g) ?? []) {
        if (/^[A-G](maj|min|m|dim|aug|sus|add)/.test(word) || allowed.test(word)) continue;
        words.add(word);
      }
    }
    const main = document.querySelector<HTMLElement>("#main-content");
    const overflowX = Math.max(document.documentElement.scrollWidth - innerWidth, main ? main.scrollWidth - main.clientWidth : 0);
    const nestedScroll = main ? [...main.querySelectorAll<HTMLElement>("*")].filter((element) => {
      const style = getComputedStyle(element);
      return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 2 && element.clientHeight > 80 && visible(element);
    }).length : 0;
    return { primary, redYellow: [...new Set(redYellow)], english: [...words].slice(0, 20), overflowX, nestedScroll };
  });
}

/** Clicks a sidebar entry by its stable data-nav hook (icon-only items stay clickable). */
async function nav(page: Page, key: string) {
  await page.locator(`[data-nav="${key}"]`).click();
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
          (result.audits ??= {})[screen] = await audit(page);
        } catch (error) {
          result.unreachable.push({ screen, reason: (error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, 160) });
        }
      }

      await openApp(page);
      await shot("home-empty", async () => {});
      await shot("vault-empty", async () => {
        await nav(page, "vault");
        await expect(page.getByText("最初の進行を取り込む")).toBeVisible();
      });
      await shot("capture-empty", async () => {
        await nav(page, "capture");
        await expect(page.locator("[data-capture-midi-drop-zone]").first()).toBeVisible();
      });
      await shot("capture-text-standard", async () => {
        await nav(page, "capture");
        await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
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
        await nav(page, "capture");
        const midiMode = page.getByTestId("capture-input-mode").getByRole("button", { name: /MIDI/ });
        if (await midiMode.isVisible()) await midiMode.click();
        await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 3 }), "p89-synthetic.mid");
        await analyzeCurrentMidi(page);
      });
      // Save one synthetic progression so Vault / progression / Idea / practice screens have content.
      try {
        await chooseFirstCandidate(page);
        await page.locator('[data-candidate-state="selected"]').getByRole("button", { name: /Vaultに保存/, exact: true }).click();
        const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
        await form.locator('input[name="progression-title"]').fill("P89 合成進行");
        await form.getByRole("button", { name: /保存/, exact: true }).click();
        await expect(form).toBeHidden();
        // The save toast lasts 3.2 s (App.tsx), longer than the walk to the next screens,
        // and would cover the header on them.
        const closeButtons = page.locator("[data-toast-tone] .lv-toast-close");
        while (await closeButtons.count() > 0) await closeButtons.first().click();
      } catch (error) {
        result.unreachable.push({ screen: "(save synthetic progression)", reason: String(error).split("\n")[0].slice(0, 160) });
      }
      await shot("vault", async () => {
        await nav(page, "vault");
        await expect(page.locator("#main-content")).toHaveAttribute("aria-label", "Vault");
      });
      // P8.9-04: Vault with a filter (the rail, or the drawer when the content is under 900px) and a degree search.
      await shot("vault-filtered", async () => {
        await nav(page, "vault");
        const rail = page.locator(".lv-vault-rail");
        const panel = await rail.isVisible() ? rail : page.locator(".lv-vault-drawer-panel");
        if (!(await rail.isVisible())) await page.locator(".lv-vault-drawer-toggle").click();
        await panel.getByRole("button", { name: /MIDI/ }).first().click();
        await expect(page.locator(".lv-vault-condition").first()).toBeAttached();
      });
      await page.keyboard.press("Escape");
      await shot("vault-search-degree", async () => {
        const clear = page.locator(".lv-vault-conditions").getByRole("button", { name: "すべて解除" });
        if (await clear.isVisible()) await clear.click();
        await page.locator("#vault-search").fill("6-4-5");
        await expect(page.getByTestId("vault-degree-match").first()).toBeVisible();
      });
      await shot("progression", async () => {
        await nav(page, "vault");
        await page.getByRole("button", { name: /進行を開く/ }).first().click();
        await expect(page.getByRole("button", { name: /親Ideaを開く/ })).toBeVisible();
      });
      await shot("idea-detail", async () => {
        await page.getByRole("button", { name: /親Ideaを開く/ }).click();
        await expect(page.locator("#main-content")).toBeVisible();
      });
      await shot("chord-dojo", async () => {
        await nav(page, "chord-dojo");
        await expect(page.getByTestId("practice-layout")).toBeVisible();
      });
      await shot("voicing-loop", async () => {
        await nav(page, "voicing-loop");
      });
      let bassTabs: string[] = [];
      await shot("bass-practice", async () => {
        await nav(page, "bass-practice");
        const tablist = page.getByRole("tablist", { name: "Bass Practice のモード" });
        await expect(tablist).toBeVisible();
        bassTabs = await tablist.getByRole("tab").allInnerTexts();
      });
      for (const tab of bassTabs) {
        const slug = tab.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        await shot(`bass-practice-${slug}`, async () => {
          await page.getByRole("tablist", { name: "Bass Practice のモード" }).getByRole("tab", { name: tab, exact: true }).click();
        });
      }
      // P8.9-08: Settings is a screen; one shot per section (the list on the left scrolls to it).
      await shot("settings", async () => {
        await nav(page, "settings");
        await expect(page.getByTestId("settings-view")).toBeVisible();
      });
      for (const [id, label] of [["audio-midi", "音と MIDI"], ["live-midi", "Live MIDI"], ["data", "データ"], ["developer", "開発者向け"]] as const) {
        await shot(`settings-${id}`, async () => {
          await page.getByRole("navigation", { name: "設定の欄" }).getByRole("button", { name: label, exact: true }).click();
          await expect(page.locator(`#settings-${id}`)).toBeInViewport();
        });
      }
      if (width === 768) {
        // A toast raised while the confirmation dialog is open must not cover the dialog's buttons.
        await shot("settings-toast", async () => {
          const view = page.getByTestId("settings-view");
          await view.getByRole("button", { name: /JSONを書き出す/ }).click();
          await expect(page.locator("[data-toast-tone]").first()).toBeVisible();
          await view.getByRole("button", { name: "修正ログを削除" }).click();
          await expect(page.getByRole("dialog", { name: /修正ログを削除/ })).toBeVisible();
          result.toastOverDialogButtons = await page.evaluate(() => {
            const toasts = [...document.querySelectorAll("[data-toast-tone]")].map((toast) => toast.getBoundingClientRect());
            const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
            return [...document.querySelectorAll('[role="dialog"] button')]
              .filter((button) => { const box = button.getBoundingClientRect(); return box.width > 0 && box.bottom > 0 && box.top < innerHeight && toasts.some((toast) => hit(box, toast)); })
              .map((button) => (button.textContent || button.getAttribute("aria-label") || "?").trim().slice(0, 40));
          });
        });
        await page.keyboard.press("Escape");
      }
      await shot("home", async () => {
        await nav(page, "home");
      });
      // P8.9-08: the browser build's Live MIDI mini window (same component as the separate window).
      await shot("live-midi-mini", async () => {
        await nav(page, "live-midi");
        await expect(page.getByTestId("live-midi-web-preview")).toBeVisible();
      });
      await page.getByRole("button", { name: /メイン画面を表示/ }).click().catch(() => undefined);
      // Component gallery: full page (the app root normally clips scrolling).
      try {
        await page.goto("/?gallery");
        await expect(page.getByTestId("p89-component-gallery")).toBeVisible();
        await page.addStyleTag({ content: "html,body,#root,.lv-gallery{height:auto!important;overflow:visible!important}" });
        await settle(page);
        await page.screenshot({ path: join(OUT, `gallery@${size}.png`), fullPage: true, animations: "disabled", caret: "hide" });
        result.captured.push("gallery");
        // P8.9-08: startup / recovery / quarantine / first-capture states rendered with synthetic data.
        await page.getByTestId("p89-gallery-startup").screenshot({ path: join(OUT, `startup-states@${size}.png`), animations: "disabled", caret: "hide" });
        result.captured.push("startup-states");
      } catch (error) {
        result.unreachable.push({ screen: "gallery", reason: String(error).split("\n")[0].slice(0, 160) });
      }

      expect(result.captured.length, `nothing captured @${size}`).toBeGreaterThan(0);
    });
  });
}

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify({ name: NAME, sizes: results }, null, 2)}\n`);
});
