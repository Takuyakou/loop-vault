import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openApp, assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { reportShot } from "./helpers/reportShots";

const BANK = JSON.parse(readFileSync("docs/p23-39-contracts/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; prompt: "name" | "ear"; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[] }; ear?: { items: string[] } }>;
};
const item = (id: string) => BANK.items.find((entry) => entry.id === id)!;
const AT = new Date().toISOString();
const base = { schema: "loopvault-guided-course" as const, version: 1 as const, bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId };
const active = { level: 1, block: "sameDay" as const, attemptId: "p44-ear", startedAt: AT, mode: "self" as const };

function trial(id: string) {
  const target = item(id);
  return {
    trialId: `${active.attemptId}:${id}`, attemptId: active.attemptId, block: "sameDay", itemId: id, level: 1,
    quality: target.quality, root: target.root, result: "wrong", sealedNotes: [], hintUsed: false,
    selfConfirmed: true, midiConfirmed: false, startedAt: AT, sealedAt: AT,
  };
}

async function openCourse(page: Page): Promise<void> {
  await openApp(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
}

test("P23-44 initial examples C→Cm→F→Fm, then the same confirmation", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCourse(page);
  await expect(page.getByTestId("course-demo")).toBeVisible();
  await expect(page.getByTestId("course-demo-counts")).toContainText("20問");
  await expect(page.getByTestId("course-demo-counts")).toContainText("10問");
  const names: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    names.push((await page.getByTestId("course-demo-name").textContent()) ?? "");
    await expect(page.getByTestId("course-progress")).toHaveText(`見本 ${index + 1} / 4`);
    await expect(page.getByTestId("course-demo-notes")).not.toBeEmpty();
    await expect(page.getByTestId("course-demo-card")).toBeVisible();
    await page.screenshot({ path: reportShot(`p23-44-assets/demo-${index + 1}-1440.png`) });
    if (index < 3) await page.getByTestId("course-demo-next").click();
  }
  expect(names).toEqual(["C", "Cm", "F", "Fm"]);
  await expect(page.getByTestId("course-demo-start")).toBeVisible();
  await expect(page.getByTestId("course-demo-again")).toBeVisible();
  expect(await page.evaluate(() => {
    const raw = localStorage.getItem("loop-vault:guided-course-v1:data");
    return raw === null ? 0 : JSON.parse(raw).trials.length;
  })).toBe(0);
  await page.getByTestId("course-demo-start").click();
  await expect(page.getByTestId("course-prompt-name")).toBeVisible();
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 1 / 20");
  await page.screenshot({ path: reportShot("p23-44-assets/name-1440.png") });
});

test("P23-44 skipping any example starts the confirmation and a restored attempt does not replay the examples", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCourse(page);
  await page.getByTestId("course-demo-next").click();
  await expect(page.getByTestId("course-demo-name")).toHaveText("Cm");
  await page.getByTestId("course-demo-skip").click();
  await expect(page.getByTestId("course-prompt-name")).toBeVisible();
  await expect(page.getByTestId("course-feedback-text")).toHaveText("演奏を待っています");
  await page.getByTestId("course-self-miss").click();
  await expect(page.getByTestId("course-feedback-text")).toHaveText("まだ難しい");
  await expect(page.getByTestId("course-review")).toBeVisible();
  await expect(page.getByTestId("course-example-label")).toContainText("弾き方の例");
  await expect(page.getByTestId("course-example-label")).toContainText("転回・別の配置でも合格です");
  await page.screenshot({ path: reportShot("p23-44-assets/review-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 768, height: 640 });
  await page.screenshot({ path: reportShot("p23-44-assets/review-768.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("course-chord-card").click();
  const afterPlay = await page.evaluate(() => {
    const raw = localStorage.getItem("loop-vault:guided-course-v1:data");
    return raw === null ? null : JSON.parse(raw);
  });
  expect(afterPlay.trials).toHaveLength(1);
  expect(afterPlay.trials[0].result).toBe("wrong");
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
  await expect(page.getByTestId("course-demo")).toHaveCount(0);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 2 / 20");
});

test("P23-44 ear answer hides note names until the result, then the example is available", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((store) => localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify({ app: "loopvault-guided-course", fileVersion: 1, ...store })), {
    ...base, active, trials: BANK.sets["1"]!.name.sameDay.map((id) => trial(id)),
  });
  await openCourse(page);
  await expect(page.getByTestId("course-demo")).toHaveCount(0);
  // P23-53 (mock ⑦): one line; the lowest note is on the chip.
  await expect(page.getByTestId("course-instruction")).toHaveText("聴こえた和音を、そのまま弾く");
  await expect(page.getByTestId("course-prompt-name")).toContainText("一番低い音は");
  await expect(page.getByTestId("course-progress")).toHaveText("耳 1 / 10");
  await expect(page.getByTestId("course-feedback-text")).not.toHaveText("演奏を待っています");
  await expect(page.locator(".gc-keyboard-head")).not.toContainText("見本の音名");
  await expect(page.getByTestId("course-example-label")).toHaveCount(0);
  await page.screenshot({ path: reportShot("p23-44-assets/ear-1440.png") });
  await page.getByTestId("course-self-miss").click();
  await expect(page.getByTestId("course-example-label")).toContainText("弾き方の例");
  await expect(page.locator(".gc-keyboard-head")).toContainText("正解の一例");
  await page.screenshot({ path: reportShot("p23-44-assets/ear-review-1440.png"), fullPage: true });
});

test("P23-44 Lv1 MIDI can say わからない, sees the example, and records a wrong answer", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
  if (await page.getByTestId("course-demo").count()) await page.getByTestId("course-demo-skip").click();
  await expect(page.getByTestId("course-prompt-name")).toBeVisible();
  await page.getByTestId("course-give-up").click();
  await expect(page.getByTestId("course-feedback-text")).toContainText("わからない");
  await expect(page.getByTestId("course-example-label")).toContainText("弾き方の例");
  await page.screenshot({ path: reportShot("p23-44-fix-1-assets/give-up-1440.png"), fullPage: true });
  await expect(page.getByTestId("course-next")).toBeEnabled();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:guided-course-v1:data")!));
  expect(stored.trials).toHaveLength(1);
  expect(stored.trials[0].result).toBe("wrong");
});

test("P23-44 card and keyboard: 760px card, real white-key width/height at 1440 and 768", async ({ page }) => {
  test.setTimeout(90_000);
  for (const size of [{ width: 1440, height: 900 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await openCourse(page);
    await expect(page.getByTestId("course-demo")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector<SVGElement | HTMLElement>(selector);
        return element ? element.getBoundingClientRect() : undefined;
      };
      const card = rect(".gc-card");
      const svg = rect(".gc-keyboard svg");
      const key = rect('.gc-keyboard svg [data-key-layer="white"] rect');
      return {
        card: card && { width: card.width, height: card.height },
        svg: svg && { width: svg.width, height: svg.height },
        key: key && { width: key.width, height: key.height },
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    // P23-49: the stage replaces the 760px card; the keyboard keeps the value table's width and height.
    expect(Math.round(geometry.svg!.width), `${size.width}: stage keyboard width`).toBe(size.width === 1440 ? 1088 : 672);
    expect(Math.round(geometry.svg!.height), `${size.width}: stage keyboard height`).toBe(size.width === 1440 ? 176 : 132);
    expect(geometry.svg!.width).toBeGreaterThanOrEqual(size.width > 800 ? 650 : 600);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: reportShot(`p23-44-assets/demo-layout-${size.width}.png`), fullPage: true });
    if (size.width === 768) {
      await page.getByTestId("course-demo-skip").click();
      await expect(page.getByTestId("course-prompt-name")).toBeVisible();
      await page.screenshot({ path: reportShot("p23-44-assets/name-768.png"), fullPage: true });
    }
  }
});
