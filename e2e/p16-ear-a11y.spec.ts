import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openDojo } from "./helpers/p12";

async function expectNoSeriousViolations(page: Page, label: string) {
  const result = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  const summary = blocking.map((violation) => ({ id: violation.id, targets: violation.nodes.slice(0, 8).map((node) => node.target.join(" > ")), count: violation.nodes.length }));
  expect(blocking, `${label}: ${JSON.stringify(summary, null, 2)}`).toEqual([]);
}

test("P16-02: 耳で弾くの選ぶ画面・練習・結果にアクセシビリティの重大な違反がない", async ({ page }) => {
  await openDojo(page);
  await page.getByTestId("ear-open").click();
  await expectNoSeriousViolations(page, "ear-choose");
  await page.getByTestId("ear-start").click();
  await expectNoSeriousViolations(page, "ear-listen");
  await page.keyboard.press("Enter");
  await expectNoSeriousViolations(page, "ear-play");
  await page.keyboard.press("Space");
  await page.keyboard.press("Space");
  await expectNoSeriousViolations(page, "ear-hints");
});
