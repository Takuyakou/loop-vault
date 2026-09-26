import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/app";

async function openText(page: Page) {
  await openApp(page);
  await page.locator("nav").getByRole("button", { name: /コード採集|Capture/ }).click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト|Text/ }).click();
}

async function choose(page: Page, dialect: "standard" | "extended") {
  await page.getByTestId(dialect === "standard" ? "text-mode-standard" : "text-mode-extended").click();
  return page.getByTestId("text-progression-capture");
}

async function assertCaptureNoPageOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const main = document.querySelector("#main-content")!;
    return {
      documentVertical: document.documentElement.scrollHeight - innerHeight,
      documentHorizontal: document.documentElement.scrollWidth - innerWidth,
      mainVertical: main.scrollHeight - main.clientHeight,
      mainHorizontal: main.scrollWidth - main.clientWidth,
    };
  });
  for (const value of Object.values(metrics)) expect(value).toBeLessThanOrEqual(1);
  const viewport = page.viewportSize()!;
  for (const selector of ["[data-testid='text-capture-toolbar']", ".lv-text-status-bar"]) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  }
}

function bounds(page: Page, selector: string) {
  return page.locator(selector).boundingBox();
}

test("P8.8.6 shared status keeps empty, valid, invalid, and explicit BPM parity", async ({ page }) => {
  await openText(page);
  const emptySummary = "0小節 · 注記0 · 4/4 · BPM — · キー 未確定";
  for (const dialect of ["standard", "extended"] as const) {
    const capture = await choose(page, dialect);
    const summary = capture.locator("[data-text-status-summary]");
    await capture.getByTestId(dialect === "standard" ? "text-progression-input" : "extended-text-input").fill("");
    await expect(summary).toHaveText(emptySummary);
    await expect(capture.getByText("エラーなし", { exact: true })).toBeVisible();
    await expect(capture.locator(".lv-text-save-reason")).toHaveText("コード進行を入れると保存できます");
    await expect(capture.getByTestId(dialect === "standard" ? "text-progression-save" : "extended-text-save")).toBeDisabled();
    await expect(capture.locator(".lv-text-toolbar-bpm input")).toHaveValue("");
    await expect(capture.locator(".lv-text-toolbar-bpm")).toContainText("試聴120");
    await capture.getByTestId(dialect === "standard" ? "text-progression-input" : "extended-text-input").fill("| Cmaj7 Dm7 |");
    await expect(summary).toContainText("1小節 · 注記0 · 4/4 · BPM —");
    const bpm = capture.locator(".lv-text-toolbar-bpm input");
    await bpm.fill("120");
    await bpm.press("Enter");
    await expect(summary).toContainText("BPM 120");
    await expect(bpm).toHaveValue("120");
    await expect(capture.locator(".lv-text-toolbar-bpm")).not.toContainText("試聴120");
    await capture.getByTestId(dialect === "standard" ? "text-progression-input" : "extended-text-input").fill("| Cmaj7 ??? |");
    await expect(capture.locator(".lv-text-save-reason")).toContainText("エラー");
  }
});

test("P8.8.6 shared shell and old Standard UI negative assertions", async ({ page }) => {
  test.setTimeout(90_000);
  await openText(page);
  for (const [width, height] of [[1920, 1080], [1600, 900], [1440, 900], [1366, 768]]) {
    await page.setViewportSize({ width, height });
    const common = ["[data-testid='text-capture-toolbar']", ".lv-text-intake-grid",
      ".lv-text-intake-editor", ".lv-text-intake-pane:last-child", ".lv-text-status-bar",
      ".lv-text-toolbar-save input", ".lv-text-toolbar-save button"];
    const boxes = [];
    for (const dialect of ["standard", "extended"] as const) {
      const capture = await choose(page, dialect);
      boxes.push(await Promise.all(common.map(selector => bounds(page, selector))));
      await assertCaptureNoPageOverflow(page);
      await expect(capture.locator(".lv-text-status-bar")).toHaveCount(1);
      await expect(capture.locator(".lv-text-toolbar-save button")).toHaveCount(1);
      await expect(capture.locator("[data-testid='legacy-text-key-block'], [data-testid='legacy-text-bpm-block'], [data-testid='legacy-text-conversion-panel'], [data-testid='legacy-text-availability-grid'], [data-testid='text-local-metronome']")).toHaveCount(0);
      await expect(capture.getByText("変換前に修正", { exact: true })).toHaveCount(0);
      await expect(capture.locator("[data-text-status-summary]")).toHaveCount(1);
    }
    boxes[0]!.forEach((first, index) => {
      const second = boxes[1]![index];
      expect(first).not.toBeNull(); expect(second).not.toBeNull();
      for (const axis of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(first![axis] - second![axis])).toBeLessThanOrEqual(1);
      }
    });
  }
});

test("P8.8.6 Capture has zero outer overflow for empty and short input at desktop viewports", async ({ page }) => {
  test.setTimeout(90_000);
  await openText(page);
  for (const [width, height] of [[1920, 1080], [1600, 900], [1440, 900], [1366, 768]]) {
    await page.setViewportSize({ width, height });
    for (const dialect of ["standard", "extended"] as const) {
      const capture = await choose(page, dialect);
      const editor = capture.getByTestId(dialect === "standard" ? "text-progression-input" : "extended-text-input");
      await editor.fill("");
      await assertCaptureNoPageOverflow(page);
      await editor.fill("| Cmaj7 Dm7 | G7 Cmaj7 |");
      await assertCaptureNoPageOverflow(page);
    }
  }
});

test("P8.8.6 70/150/200-bar Extended charts scroll inside Preview and Editor", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openText(page);
  const capture = await choose(page, "extended");
  for (const barCount of [70, 150, 200]) {
    await capture.getByTestId("extended-text-input").fill(Array.from({ length: barCount }, () => "| C Dm F G |").join("\n"));
    await expect(capture.getByTestId("text-preview-row")).toHaveCount(Math.ceil(barCount / 4));
    await assertCaptureNoPageOverflow(page);
    const overflow = await capture.evaluate(element => {
      const preview = element.querySelector(".lv-text-preview-scroll")!;
      const editor = element.querySelector("textarea")!;
      return { preview: preview.scrollHeight - preview.clientHeight, editor: editor.scrollHeight - editor.clientHeight };
    });
    expect(overflow.preview).toBeGreaterThan(0);
    expect(overflow.editor).toBeGreaterThan(0);
  }
});