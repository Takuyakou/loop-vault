import { expect, test } from "@playwright/test";
import {
  capturePageErrors,
  openTextCapture,
  createSavedProgression,
  openApp,
  openVault,
} from "./helpers/app";

test("解析結果を保存し、Vaultで検索して詳細とDojoへ渡せる", async ({ page }) => {
  const pageErrors = await capturePageErrors(page);
  await openApp(page);
  await createSavedProgression(page, "Midnight E2E Progression");
  await openVault(page);

  const search = page.getByRole("textbox", { name: /検索/ });
  await search.fill("Midnight E2E");
  await expect(page.getByText(/Midnight E2E Progression/)).toBeVisible();
  await expect(page.locator("#main-content").getByRole("status")).toContainText(/1件/i);

  const row = page.locator(".lv-vault-row").first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /進行を開く/ }).click();
  const detail = page.locator("[data-progression-detail-view]");
  await expect(detail.getByRole("button", { name: /練習する/ })).toBeVisible();

  await detail.getByRole("button", { name: /練習する/ }).click();
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("practice-layout")).toBeVisible();
  await expect(page.getByTestId("practice-progression-overview")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("空Vaultは次の行動を示し、長いタイトルでも横にはみ出さない", async ({ page }) => {
  await openApp(page);
  await openVault(page);
  await expect(page.getByText(/最初の進行を取り込む/)).toBeVisible();
  await expect(page.getByRole("button", { name: "MIDI から取り込む", exact: true })).toBeVisible();
  await expect(page.locator('button[title="+ Idea"]')).toHaveCount(0);

  await createSavedProgression(
    page,
    "Very long progression title ".repeat(12),
    { fileName: "a-very-long-source-file-name-that-must-not-break-layout.mid" },
  );
  await openVault(page);
  const row = page.locator(".lv-vault-row").first();
  await expect(row).toBeVisible();
  const overflow = await row.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
});

test("検索・絞り込み・並び替えを組み合わせられる", async ({ page }) => {
  await openApp(page);
  await createSavedProgression(page, "Filter Target");
  await openVault(page);

  const filters = page.locator(".lv-vault-rail");
  await page.getByRole("textbox", { name: /検索/ }).fill("Filter Target");
  await filters.getByRole("button", { name: /〜4小節/ }).click();
  await page.getByLabel(/並び順/).selectOption("name");
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);

  // Options that would leave nothing are counted 0 and disabled (OR/AND is covered by unit tests).
  await filters.getByRole("button", { name: /MIDI/ }).first().click();
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);
  await expect(filters.getByRole("button", { name: /テキスト/ })).toBeDisabled();
  await expect(filters.getByRole("button", { name: /5〜8小節/ })).toBeDisabled();
  await filters.getByRole("button", { name: "すべて解除" }).click();
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);

  await page.getByRole("textbox", { name: /検索/ }).fill("6-4-5");
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);
  await expect(page.getByTestId("vault-degree-match")).toContainText("度数で一致");
  await page.getByRole("textbox", { name: /検索/ }).fill("7-7-7");
  await expect(page.locator(".lv-vault-row")).toHaveCount(0);
});

test("P8.9-09b Vault row chords are one band: length-wide frames, merged repeats, +N小節, click to audition", async ({ page }) => {
  const capture = await openTextCapture(page);
  const bars = ["Abmaj9", "Ebadd9/G", "Ebadd9/G", "Ebadd9/G", "Cm9", "Cm7", "Bm7", "Bbm9", "Dm11/G", "Ab7", "C#m9", "Cmaj7",
    "Bm9", "E13", "Amaj7", "Dsus4", "G7", "C", "Am", "F", "G", "C", "Am", "F"];
  await capture.getByTestId("text-progression-input").fill(`| ${bars.join(" | ")} |`);
  await capture.getByTestId("text-progression-key").selectOption("C major");
  await capture.getByTestId("text-progression-name").fill("Chord band");
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
  for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 800], [960, 1032], [768, 640]] as const) {
    await page.setViewportSize({ width, height });
    await openVault(page);
    const row = page.locator(".lv-vault-row").first();
    await expect(row).toBeVisible();
    const band = await row.evaluate((element) => {
      const rowBox = element.getBoundingClientRect();
      const bandBox = element.querySelector(".lv-vault-chips")!.getBoundingClientRect();
      const chips = [...element.querySelectorAll<HTMLElement>(".lv-vault-chip")];
      const label = (chip: HTMLElement) => chip.querySelector(".lv-vault-chip-label") as HTMLElement;
      return {
        count: chips.length,
        tops: new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top))).size,
        clipped: chips.filter((chip) => (label(chip).textContent ?? "").length <= 9 && label(chip).scrollWidth > label(chip).clientWidth)
          .map((chip) => chip.textContent),
        outside: chips.filter((chip) => chip.getBoundingClientRect().right > bandBox.right + 1 || chip.getBoundingClientRect().bottom > rowBox.bottom).length,
        first: chips.slice(0, 2).map((chip) => chip.textContent),
        degrees: element.querySelectorAll(".lv-vault-chip-degree").length,
        more: element.querySelector(".lv-vault-chip-more")?.textContent ?? "",
        nameWidth: element.querySelector(".lv-vault-main-cell")!.getBoundingClientRect().width,
        bandWidth: bandBox.width,
      };
    });
    console.log(`${width}: ${band.count} frames, ${band.more}, name ${Math.round(band.nameWidth)}px, band ${Math.round(band.bandWidth)}px`);
    expect(band.count, `${width} count`).toBeGreaterThanOrEqual(2);
    expect(band.tops, `${width} one line`).toBe(1);
    expect(band.clipped, `${width} clipped`).toEqual([]);
    expect(band.outside, `${width} outside`).toBe(0);
    expect(band.first[1], `${width} merged`).toMatch(/^Ebadd9\/G×3/);
    expect(band.degrees, `${width} degrees`).toBe(band.count);
    expect(band.more, `${width} more`).toMatch(/^\+\d+小節$/);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const chip = page.locator(".lv-vault-row").first().getByRole("button", { name: "Cm9 を試聴" });
  await chip.click();
  await expect(chip).toHaveAttribute("data-current", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("data-current", "false");
});
