import { expect, test, type Page } from "@playwright/test";
import { openDojo, play, next, type MidiControl } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";
import { settlePaint } from "./helpers/settle";

const emit = (page: Page, notes: readonly number[], on = true) =>
  page.evaluate(
    ({ notes, on }) => (window as unknown as { __p12Midi: MidiControl }).__p12Midi.emit([...notes], on),
    { notes, on },
  );

const SIZES = [{ width: 1440, height: 900 }, { width: 1280, height: 720 }] as const;

/** I–V–vi–IV in C (the built-in standard progression's four chords, as the practice asks for them). */
const CHORDS = [[48, 60, 64, 67], [43, 59, 62, 67], [45, 60, 64, 67], [41, 60, 64, 69]] as const;

/**
 * P23-60 photos: the Chord Dojo practice screens beside the lead's mock (`handoff/mocks/p23-60/after-*`).
 * Same screens at the same window sizes (1440×900 and 1280×720) as the mock.
 */
test.describe("P23-60: the Chord Dojo practice screens take the guided stage's tone", () => {
  for (const size of SIZES) {
    test(`photos at ${size.width}×${size.height}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(size);
      const shot = async (name: string) => {
        await settlePaint(page);
        await captureReportShot(page, `p23-60-assets/${name}-${size.width}.png`);
      };

      // The standard progressions list.
      await openDojo(page, "midi");
      await page.getByRole("button", { name: "定番の進行", exact: true }).click();
      await expect(page.locator(".dojo-list .dojo-card").first()).toBeVisible();
      await shot("after-standard-list");

      // The standard practice, ① 見て弾く.
      await page.locator(".dojo-list .dojo-card")
        .filter({ has: page.getByRole("heading", { name: "I–V–vi–IV", exact: true }) })
        .getByRole("button", { name: /を練習する$/ })
        .click();
      await expect(page.locator('[data-dojo-screen="practice"]')).toBeVisible();
      await shot("after-standard-play");

      // A right answer: the light behind the chords turns green.
      await play(page, [...CHORDS[0]!]);
      await expect(page.locator(".dojo-result")).toContainText("合いました");
      await shot("after-standard-right");

      // A wrong answer: the light turns red.
      await next(page);
      const wrong = [...CHORDS[1]!.slice(0, -1), CHORDS[1]![CHORDS[1]!.length - 1]! + 1];
      await emit(page, wrong);
      await expect(page.locator(".dojo-result")).not.toContainText("合いました");
      await shot("after-standard-wrong");
      await emit(page, wrong, false);

      // The voicing drill's list and practice.
      await openDojo(page, "midi");
      await page.getByTestId("home-drill").getByRole("button", { name: "ボイシングドリル" }).click();
      await expect(page.getByTestId("drill-list")).toBeVisible();
      await shot("after-drill-list");
      await page.locator('[data-testid^="drill-open-"]').first().click();
      await expect(page.getByTestId("dojo-drill")).toBeVisible();
      await shot("after-drill-play");

      // A jazz progression's practice.
      await openDojo(page, "midi");
      await page.getByTestId("home-open-jazz").click();
      await page.locator("[data-jazz-item=jazz-progressions-001]").getByTestId("jazz-open").click();
      await expect(page.getByTestId("dojo-jazz")).toBeVisible();
      await shot("after-jazz-play");

      // 2-5-1 Master.
      await openDojo(page, "midi");
      await page.getByTestId("home-master").getByRole("button", { name: /2-5-1 Master/ }).click();
      await expect(page.locator("[data-testid='master251'], .master251-header").first()).toBeVisible();
      await shot("after-master");
      // P23-59-fix-1 3c: the tidied Master (no score caption, no figure line, the shorter legend).
      await shot("after-master-tidy");
    });
  }
});
