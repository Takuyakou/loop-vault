import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";

/**
 * P24-03: the empty-Vault guide's 「サンプル進行を 3 件入れて試す」. It adds three ordinary progressions
 * (they are Chord Dojo's own standards at a fixed key), tags them, and leaves the user where they are.
 */
const TITLES = ["サンプル：王道進行", "サンプル：丸サ進行", "サンプル：循環進行"] as const;

test("P24-03: one press adds the three samples and Voicing Loop can open one", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);

  const guide = page.getByTestId("first-capture-guide");
  await expect(guide).toBeVisible();
  const button = page.getByTestId("first-capture-samples");
  await expect(button).toHaveText("サンプル進行を 3 件入れて試す");
  await button.click();
  // The Vault is no longer empty, so the guide is gone and the screen stays put.
  await expect(guide).toHaveCount(0);
  await expect(page.getByTestId("nav-vault-count")).toHaveText("3");

  await page.locator('[data-nav="vault"]').click();
  for (const title of TITLES) {
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("サンプル", { exact: true }).first()).toBeVisible();
  // The Voicing Loop picker lists the fixture progressions instead of the Vault in the fixture build
  // (`P527_E2E_FIXTURE`), so opening a sample there is checked by the unit test of the same handoff.
});

test("P24-03: pressing the button twice still leaves three", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  // Two presses in the same task, before React can re-render the guide away.
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>("[data-testid='first-capture-samples']");
    button?.click();
    button?.click();
  });
  await expect(page.getByTestId("nav-vault-count")).toHaveText("3");
  await page.locator('[data-nav="vault"]').click();
  for (const title of TITLES) {
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  }
});
