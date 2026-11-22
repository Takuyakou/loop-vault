import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, createSavedProgression, openVault } from "./helpers/app";

const SIZES = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

async function openFixturePicker(page: Page) {
  // Synthetic Vault only: favourites, a recent (seeded below), a provisional tempo and an unavailable row.
  await page.addInitScript(() => {
    localStorage.setItem("loop-vault:voicing-loop-recents:v1",
      JSON.stringify({ version: 1, references: [{ ideaId: "public-vl15-c", blockId: "c" }] }));
  });
  await page.goto("/?p527Status=vl15-picker");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  return page.getByTestId("voicing-loop-workspace");
}

test("VL-15 picker rows stay compact, readable and inside the window at every desktop size", async ({ page }) => {
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    const workspace = await openFixturePicker(page);
    await expect(workspace.getByTestId("voicing-loop-section-favorites")).toBeVisible();
    await expect(workspace.getByTestId("voicing-loop-section-recent")).toBeVisible();
    await expect(workspace.getByTestId("voicing-loop-section-others")).toBeVisible();
    const rows = workspace.getByTestId("voicing-loop-progression-row");
    await expect(rows).toHaveCount(5);

    const geometry = await rows.evaluateAll((elements) => elements.map((row) => {
      const box = row.getBoundingClientRect();
      const star = row.querySelector("[data-testid='voicing-loop-favorite']")!.getBoundingClientRect();
      const choice = row.querySelector("[data-testid='voicing-loop-progression-choice']")!.getBoundingClientRect();
      const day = row.querySelector("[data-testid='voicing-loop-progression-day']")!.getBoundingClientRect();
      const strip = row.querySelector("[data-testid='voicing-loop-progression-chords']") as HTMLElement | null;
      const chip = strip?.querySelector<HTMLElement>(".lv-vl-row-chord");
      const stripStyle = strip ? getComputedStyle(strip) : undefined;
      return {
        rowHeight: box.height,
        starWidth: star.width,
        starHeight: star.height,
        starBeforeChoice: star.right <= choice.left + 1,
        choiceBeforeDay: choice.right <= day.left + 1,
        hasStrip: Boolean(strip),
        hasReason: Boolean(row.querySelector("[data-testid='voicing-loop-progression-reason']")),
        chordWhiteSpace: chip ? getComputedStyle(chip).whiteSpace : "nowrap",
        chordOverflow: stripStyle?.overflowX ?? "hidden",
        chordLines: strip ? strip.clientHeight : 0,
      };
    }));

    for (const row of geometry) {
      expect(row.rowHeight).toBeLessThanOrEqual(72);
      expect(row.starWidth).toBeGreaterThanOrEqual(32);
      expect(row.starHeight).toBeGreaterThanOrEqual(32);
      expect(row.starBeforeChoice).toBe(true);
      expect(row.choiceBeforeDay).toBe(true);
      expect(row.chordWhiteSpace).toBe("nowrap");
      expect(row.chordOverflow).toBe("hidden");
      expect(row.chordLines).toBeLessThanOrEqual(24);
    }
    // P23-29 L5/L6: four playable rows show the chord chips, the unavailable row shows its short reason, and a
    // row has no practice button of its own (the main one is in the right column).
    expect(geometry.filter((row) => row.hasStrip)).toHaveLength(4);
    expect(geometry.filter((row) => row.hasReason)).toHaveLength(1);
    await expect(workspace.locator("[data-testid='voicing-loop-progression-row'] button[data-testid='voicing-loop-progression-practice']")).toHaveCount(0);
    await expect(workspace.getByTestId("voicing-loop-preview-practice")).toHaveCount(1);

    // The BPM is the number only; the provisional one is faded and explained on hover.
    const provisional = workspace.locator("[data-tempo-origin='PRACTICE_INITIAL']");
    await expect(provisional).toHaveText("120 BPM");
    await expect(provisional).toHaveAttribute("title", "BPMが保存されていないため、仮の 120 BPM です");

    await assertNoHorizontalOverflow(page);
    if (size.width === 1440) {
      await workspace.locator("#voicing-loop-progression-search").fill("Public");
      await expect(workspace.getByTestId("voicing-loop-section-results")).toBeVisible();
      await page.screenshot({ path: "p89-generated/vl-15/picker-search-1440x900.png", fullPage: true });
      await workspace.locator("#voicing-loop-progression-search").fill("");
      await expect(workspace.getByTestId("voicing-loop-section-favorites")).toBeVisible();
      await page.screenshot({ path: "p89-generated/vl-15/picker-1440x900.png", fullPage: true });
    }
    if (size.width === 1280) {
      await page.screenshot({ path: "p89-generated/vl-15/picker-1280x720.png", fullPage: true });
    }
  }
});

test("VL-15 star writes the Vault favourite, reopens on top, and leaves the Vault order alone", async ({ page }) => {
  test.setTimeout(120_000);
  // ?p528Direct=1 is the empty app: without it the Playwright build injects a default Voicing Loop practice snapshot.
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#main-content")).toBeVisible();
  await createSavedProgression(page, "VL15 Alpha");
  await createSavedProgression(page, "VL15 Beta");

  await openVault(page);
  const vaultOrderBefore = await page.locator(".lv-vault-row").allTextContents();
  expect(vaultOrderBefore).toHaveLength(2);
  expect(vaultOrderBefore.join(" ")).toContain("VL15 Beta");

  await page.locator('[data-nav="voicing-loop"]').click();
  await page.setViewportSize({ width: 1440, height: 900 });
  const rows = page.getByTestId("voicing-loop-progression-row");
  await expect(rows).toHaveCount(2);
  const pickerOrderBefore = await page.getByTestId("voicing-loop-progression-choice").allTextContents();

  const betaRow = rows.filter({ hasText: "VL15 Beta" });
  const star = betaRow.getByTestId("voicing-loop-favorite");
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", "true");

  // The row does not move under the pointer; the list is only regrouped when the picker is opened again.
  expect(await page.getByTestId("voicing-loop-progression-choice").allTextContents()).toEqual(pickerOrderBefore);
  await expect(page.getByTestId("voicing-loop-favorite-hint")).toHaveCount(0);
  await expect(page.getByTestId("voicing-loop-section-favorites")).toHaveCount(0);

  await page.locator('[data-nav="home"]').click();
  await page.locator('[data-nav="voicing-loop"]').click();
  const favorites = page.getByTestId("voicing-loop-section-favorites");
  await expect(favorites).toBeVisible();
  await expect(favorites.locator("h3")).toHaveText("お気に入り");
  await expect(favorites.getByTestId("voicing-loop-progression-row")).toHaveCount(1);
  await expect(favorites.getByTestId("voicing-loop-progression-choice")).toContainText("VL15 Beta");
  await page.screenshot({ path: "p89-generated/vl-15/picker-favorite-1440x900.png", fullPage: true });

  // The same flag in the Vault list, and its own order is untouched.
  await openVault(page);
  const betaVaultRow = page.locator(".lv-vault-row").filter({ hasText: "VL15 Beta" });
  await expect(betaVaultRow.getByRole("button", { name: "お気に入りから削除" })).toBeVisible();
  expect(await page.locator(".lv-vault-row").allTextContents()).toEqual(vaultOrderBefore);

  // Unstarring in Vault reaches the Voicing Loop too.
  await betaVaultRow.getByRole("button", { name: "お気に入りから削除" }).click();
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId("voicing-loop-section-favorites")).toHaveCount(0);
  await expect(page.getByTestId("voicing-loop-favorite-hint")).toBeVisible();
  await page.screenshot({ path: "p89-generated/vl-15/picker-no-favorite-1440x900.png", fullPage: true });
});
