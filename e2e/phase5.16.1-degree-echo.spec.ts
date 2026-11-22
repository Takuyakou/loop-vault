import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp, openBassPractice } from "./helpers/app";

/** P23-25 P1 / P23-62: the sidebar's Bass Practice lands on the home that picks a practice; names are Japanese. */
async function openBassHome(page: Page) {
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.getByTestId("bass-practice-home")).toBeVisible();
}

async function openDegreeEcho(page: Page) {
  await openBassHome(page);
  await openBassPractice(page, "度数");
  await expect(page.getByTestId("degree-echo-view")).toBeVisible();
}

/** The degrees of the お手本 lane on the result stage, in order (「1」「♭3」…). */
async function answerDegrees(view: Locator): Promise<string[]> {
  return view.locator("[data-testid='bp-lane'] .bp-lane-row[aria-label='お手本の段'] .bp-note > span").allTextContents();
}

/** Where each お手本 note sits in the bar: equal values mean the same rhythm. */
async function answerShape(view: Locator): Promise<{ degree: string; left: string }[]> {
  return view.locator("[data-testid='bp-lane'] .bp-lane-row[aria-label='お手本の段'] .bp-note").evaluateAll((notes) => notes.map((note) => ({
    degree: note.querySelector("span")?.textContent ?? "",
    left: (note as HTMLElement).style.left,
  })));
}

test("Degree Echo exposes an honest accessible stage with the shipped P5.16 modes", async ({ page }) => {
  await openBassHome(page);
  // P23-62: the cards keep their modes; their names are Japanese now.
  await expect(page.locator("[data-testid='bass-home-card'][data-mode='rhythm']")).toContainText("リズム");
  await expect(page.locator("[data-testid='bass-home-card'][data-mode='bassline']")).toContainText("コード進行のベース");
  await openBassPractice(page, "度数");
  const view = page.getByTestId("degree-echo-view");
  await expect(view).toBeVisible();

  // The 6-step chrome is gone; the stage says where it is (1 聴く → 2 弾く → 3 結果).
  await expect(view.locator(".bp-step")).toHaveText([/聴く/, /弾く/, /結果/]);
  await expect(view.locator(".bp-step[aria-current='step']")).toHaveText(/聴く/);
  // One main action, and it stays off until the sample was heard.
  await expect(view.locator(".bp-btn[data-tone='primary']")).toHaveCount(1);
  await expect(view.getByTestId("degree-record")).toBeDisabled();
  await expect(view.getByTestId("degree-listens-left")).toHaveText("あと 2 回聴ける");

  const axe = await new AxeBuilder({ page: page as never })
    .include("[data-testid='degree-echo-view']")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = axe.violations.filter((violation) => (
    violation.impact === "critical" || violation.impact === "serious"
  ));
  expect(blocking.map((violation) => ({
    id: violation.id,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      html: node.html,
      summary: node.failureSummary,
    })),
  }))).toEqual([]);

  // The old badge said 「自己評価・自動採点ではありません」. The stage says the same thing by being honest
  // about a result that has no take: 録音なし・自分で評価.
  await view.getByTestId("degree-listen").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 20_000 });
  await view.getByTestId("degree-play-without-take").click();
  await expect(view).toHaveAttribute("data-stage-step", "1");
  await view.getByTestId("degree-show-answer").click();
  await expect(view).toHaveAttribute("data-practice-state", "review");
  await expect(view.locator("[data-testid='bp-result-big'] b")).toHaveText("答え");
  await expect(view.locator("[data-testid='bp-result-facts']")).toContainText("録音なし・自分で評価");
});

test("Degree Echo shortcuts ignore form focus and key repeat", async ({ page }) => {
  await openDegreeEcho(page);
  const view = page.getByTestId("degree-echo-view");
  const listensLeft = view.getByTestId("degree-listens-left");
  await expect(listensLeft).toHaveText("あと 2 回聴ける");

  // P23-62: the instrument settings live behind the mode bar's chip now.
  await page.getByRole("button", { name: /弦・右利き/ }).click();
  await page.getByLabel("共通の弦数", { exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(listensLeft).toHaveText("あと 2 回聴ける");
  await expect(view).toHaveAttribute("data-practice-state", "ready");

  // A held key must not start the sample either.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", {
    key: " ",
    repeat: true,
  })));
  await expect(listensLeft).toHaveText("あと 2 回聴ける");
  await expect(view).toHaveAttribute("data-practice-state", "ready");

  // Outside a form, Space plays the sample — the stage's version of the old 「フレーズを再生」 shortcut.
  await page.locator("#main-content").focus();
  await page.keyboard.press("Space");
  await expect(listensLeft).toHaveText("あと 1 回聴ける");
  await expect(view).toHaveAttribute("data-practice-state", /^(listening|recall)$/);
});

test("pointer flow completes the stage and plays a real different-key Transfer", async ({ page }) => {
  test.setTimeout(30_000);
  await openDegreeEcho(page);
  const view = page.getByTestId("degree-echo-view");
  await expect(view).toHaveAttribute("data-stage-step", "0");

  await view.getByTestId("degree-listen").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 20_000 });
  await expect(view.getByTestId("degree-record")).toBeEnabled();

  // Play it through and look at the answer: the answer is what the transfer has to keep.
  await view.getByTestId("degree-play-without-take").click();
  await expect(view).toHaveAttribute("data-stage-step", "1");
  await expect(view).toContainText("ベースで弾いてください");
  await view.getByTestId("degree-show-answer").click();
  await expect(view).toHaveAttribute("data-stage-step", "2");
  await expect(view).toHaveAttribute("data-practice-state", "review");
  const sourceDegrees = await answerDegrees(view);
  const sourceShape = await answerShape(view);
  expect(sourceDegrees.length).toBeGreaterThanOrEqual(3);

  await view.locator("[data-review-rating='good']").click();
  await view.getByTestId("degree-transfer").click();
  await expect(view).toHaveAttribute("data-practice-state", "transfer");
  await expect(view).toHaveAttribute("data-stage-step", "0");
  const relation = view.getByTestId("degree-transfer-relation");
  await expect(relation).toContainText("C メジャー");
  await expect(relation).toContainText("G メジャー");
  await expect(view.locator(".bp-hint")).toHaveCount(0);
  await expect(view).toContainText("何度でも聴けます");

  // A real playback of the same degrees in the new key.
  const listen = view.getByTestId("degree-listen");
  await listen.click();
  await expect(listen).toHaveAttribute("aria-label", "止める");
  await expect(listen).toHaveAttribute("aria-label", "お手本を聴く", { timeout: 20_000 });
  await expect(view).toHaveAttribute("data-practice-state", "transfer");

  // Play the transfer and look at its answer: the same degrees, in the same rhythm.
  await view.getByTestId("degree-play-without-take").click();
  await expect(view).toHaveAttribute("data-stage-step", "1");
  await view.getByTestId("degree-show-answer").click();
  await expect(view).toHaveAttribute("data-practice-state", "review");
  await expect(view).toHaveAttribute("data-stage-step", "2");
  expect(await answerDegrees(view)).toEqual(sourceDegrees);
  expect(await answerShape(view)).toEqual(sourceShape);
  // A fresh review starts with no rating chosen, and the transfer is offered only once.
  await expect(view.locator("[data-review-rating][aria-pressed='true']")).toHaveCount(0);
  await expect(view.getByTestId("degree-transfer")).toHaveCount(0);
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`Degree Echo ${viewport.width}x${viewport.height} keeps CTA and body overflow safe`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openDegreeEcho(page);
    await assertNoHorizontalOverflow(page);
    const cta = page.getByTestId("degree-echo-view").getByTestId("degree-record");
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
  });
}

test.describe("at Windows 200% scale", () => {
  // P23-62: the same page as the project, only at 200% scale (the project already uses dark / ja-JP).
  test.use({ viewport: { width: 1024, height: 720 }, deviceScaleFactor: 2 });

  test("Degree Echo remains operable at Windows 200% scale", async ({ page }) => {
    await openDegreeEcho(page);
    await assertNoHorizontalOverflow(page);
    const cta = page.getByTestId("degree-echo-view").getByTestId("degree-record");
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toBeVisible();
    await expect(cta).toContainText("録って弾く");
  });
});
