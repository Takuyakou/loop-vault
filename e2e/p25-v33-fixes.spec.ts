import { expect, test } from "@playwright/test";
import { openTextCapture } from "./helpers/app";

/**
 * P25 V33: the six things the user found. This file holds the checks that need a real layout: the empty face
 * waiting for the keyboard band to close, the sheet's key without a `Key:` line, the two new words and the
 * direction of the 覚える / 思い出す swap.
 */
test("V33 the empty face waits for the keyboard band and the new words are on the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openTextCapture(page);
  // 2: 「音は下で直せます」 is gone from the sentence above the cards.
  await capture.getByTestId("text-progression-input").fill("| C Dm F G |");
  await expect(capture.getByText("カードを選ぶと鳴ります", { exact: true })).toBeVisible();
  await expect(capture).not.toContainText("音は下で直せます");

  // 6: the empty face fades in where it ends up, after the band has closed.
  await capture.getByTestId("text-progression-input").fill("");
  await capture.getByTestId("text-keyboard-toggle").click();
  await expect(capture.getByTestId("keyboard-entry-band")).toBeVisible();
  // 3: the band says 「MIDI 未接続」 (no MIDI keyboard is connected here), not 「つながっていません」.
  await expect(capture.getByTestId("keyboard-entry-band")).toContainText("MIDI 未接続");
  await expect(capture).not.toContainText("つながっていません");
  await capture.getByTestId("text-keyboard-toggle").click();
  const samples = await page.evaluate(async () => {
    const out: { t: number; opacity: number; top: number }[] = [];
    const start = performance.now();
    const look = () => {
      const node = document.querySelector<HTMLElement>(".lv-text-empty-face");
      const box = node?.getBoundingClientRect();
      out.push({
        t: Math.round(performance.now() - start),
        opacity: node === undefined || node === null ? 0 : Number(getComputedStyle(node).opacity),
        top: box === undefined ? Number.NaN : box.top,
      });
    };
    look();
    while (performance.now() - start < 400) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      look();
    }
    return out;
  });
  const shown = samples.filter((sample) => sample.opacity > 0.05);
  expect(shown.length).toBeGreaterThan(0);
  const settled = samples[samples.length - 1]!.top;
  for (const sample of shown) expect(Math.abs(sample.top - settled)).toBeLessThanOrEqual(1);

  // 4: 覚える waits above and 思い出す below, the same way in and out.
  const directions = await page.evaluate(() => {
    const learn = document.createElement("div");
    learn.className = "lv-motion-swap";
    learn.dataset.presence = "enter";
    const recall = document.createElement("div");
    recall.className = "lv-motion-swap lv-vl-recall-box";
    recall.dataset.presence = "enter";
    document.body.append(learn, recall);
    const measured = { learn: getComputedStyle(learn).transform, recall: getComputedStyle(recall).transform };
    learn.remove();
    recall.remove();
    return measured;
  });
  expect(directions.learn).toBe("matrix(1, 0, 0, 1, 0, -6)");
  expect(directions.recall).toBe("matrix(1, 0, 0, 1, 0, 6)");
});

test("V36 the 「?」 sits 12px in from the toolbar's right edge", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTextCapture(page);
  const help = await page.getByTestId("text-help").boundingBox();
  const toolbar = await page.getByTestId("text-capture-toolbar").boundingBox();
  expect(help).not.toBeNull();
  expect(toolbar).not.toBeNull();
  expect(toolbar!.x + toolbar!.width - (help!.x + help!.width)).toBeGreaterThanOrEqual(12);
});

test("V33/V39 the sheet without a Key: line settles on 自動: D マイナー", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill([
    "--- A Section ---",
    "",
    "| Dm11 | Em11 |",
    "| Dm11 | Bbmaj9(#11) |",
    "| Gm9 | Abm9 |",
    "| Am11 | A7(#9,b13) |",
    "",
    "--- B Section ---",
    "",
    "| Dm9 | Fmaj9/E |",
    "| Ebmaj9(#11) | D13(#11) |",
    "| Gm11 | C13 |",
    "| Fmaj9 | Em11 Eb13(#11) |",
  ].join("\n"));
  const label = (await capture.getByTestId("text-progression-key-value").textContent())?.trim() ?? "";
  // P25 V39: 55% and the first chord (Dm) settle the sheet on D minor, not on its relative F major.
  expect(label).toBe("自動: D マイナー");
});
