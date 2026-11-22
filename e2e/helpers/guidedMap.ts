import { expect, type Page } from "@playwright/test";

/**
 * P23-52: helpers for navigating through the course map (①) that now opens when clicking the
 * home "ガイド練習" card. Kept mechanical so existing specs keep their original assertions.
 */
export async function openGuideMap(page: Page): Promise<void> {
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
}

/** Open the guide from home and enter the current/active station via `course-map-go`. */
export async function enterGuide(page: Page): Promise<void> {
  await openGuideMap(page);
  await page.getByTestId("course-map-go").click();
}

/** From the course map, choose a station card and click its action button. */
export async function chooseMapStation(
  page: Page,
  station: string | number,
  action: "go" | "practice" | "demo",
): Promise<void> {
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId(`course-station-${String(station)}`).click();
  await page.getByTestId(`course-map-${action}`).click();
}

/** From inside a question/demo/practice screen, go back to the map and open another station. */
export async function switchStationViaMap(
  page: Page,
  station: string | number,
  action: "go" | "practice" | "demo",
): Promise<void> {
  await page.getByTestId("dojo-back").click();
  await chooseMapStation(page, station, action);
}
