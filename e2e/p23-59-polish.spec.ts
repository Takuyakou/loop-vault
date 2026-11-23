import { expect, test, type Page } from "@playwright/test";
import { createMidiFixture } from "./helpers/midiFixture";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture, openVault, waitForSidebarSettled, chooseTextSetting } from "./helpers/app";
import { captureReportShot } from "./helpers/reportShots";

const TAGS_SIX_PROGRESSION = "| Dm7 | G7 | Cmaj7 | Cmaj7 |";

async function saveTextProgression(page: Page, text: string, key: string, name: string, bpm = 120) {
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(text);
  await chooseTextSetting(capture, "text-progression-key", key);
  const bpmInput = capture.getByTestId("text-progression-bpm");
  await bpmInput.click();
  await bpmInput.fill(String(bpm));
  await bpmInput.press("Enter");
  await capture.getByTestId("text-progression-name").fill(name);
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
}

async function openProgressionPage(page: Page) {
  await openVault(page);
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
  await expect(page.getByTestId("progression-title")).toBeVisible();
}

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return box;
}

test.describe("P23-59 polish: toasts, the folded memo, and the Vault's practice entry", () => {
  test("S1a: the save toast on the progression page sits at the bottom centre of the editor column, clear of the save buttons", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    await saveTextProgression(page, TAGS_SIX_PROGRESSION, "C major", "P23-59 知らせ");
    await openProgressionPage(page);

    let round = 0;
    const measured = async () => {
      const toastBox = await page.locator(".lv-toast").filter({ hasText: "上書き保存しました" }).first().boundingBox();
      if (!toastBox) throw new Error("no save toast");
      const primary = await boxOf(page, '[data-testid="correction-save-form"] [data-kind="primary"]');
      const version = await boxOf(page, '[data-testid="correction-save-form"] .lv-cw-save-actions > button:not([data-kind="primary"])');
      const centers = await page.evaluate(() => {
        const editor = document.querySelector(".lv-cw-body")!.getBoundingClientRect();
        const box = [...document.querySelectorAll(".lv-toast")].find((node) => node.textContent?.includes("上書き保存しました"))!.getBoundingClientRect();
        return { editor: editor.left + editor.width / 2, toast: box.left + box.width / 2 };
      });
      return { toastBox, primary, version, centers };
    };
    const saveWithEdit = async () => {
      round += 1;
      const memoButton = page.getByTestId("progression-memo-add");
      if (await memoButton.isVisible()) await memoButton.click();
      await page.getByLabel("メモ", { exact: true }).fill(`知らせの位置の確認 ${round}`);
      await page.getByRole("button", { name: "上書き保存", exact: true }).click();
      await expect(page.locator(".lv-toast").filter({ hasText: "上書き保存しました" })).toBeVisible();
    };
    const check = async (label: string) => {
      const at = await measured();
      console.log(`S1_TOAST_${label}:`, JSON.stringify(at));
      expect(overlaps(at.toastBox, at.primary), `${label} primary`).toBe(false);
      expect(overlaps(at.toastBox, at.version), `${label} version`).toBe(false);
      expect(Math.abs(at.centers.editor - at.centers.toast), `${label} centre`).toBeLessThanOrEqual(4);
      return at;
    };

    await saveWithEdit();
    await check("1280");
    await captureReportShot(page, "p23-59-assets/s1-toast-1280.png");

    await expect(page.locator(".lv-toast")).toHaveCount(0, { timeout: 15_000 });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(150);
    await saveWithEdit();
    await check("1440");

    // The menu collapsed at 1440×900: the editor column moves left with it.
    await expect(page.locator(".lv-toast")).toHaveCount(0, { timeout: 15_000 });
    await page.locator("[data-sidebar-toggle]").click();
    await waitForSidebarSettled(page);
    await saveWithEdit();
    await check("1440_collapsed");
    await captureReportShot(page, "p23-59-assets/s1-toast-1440-collapsed.png");
  });

  test("S1b: with the Vault's preview open the toast sits at the centre of the list, clear of the practice entry and the buttons", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page);
    await saveTextProgression(page, TAGS_SIX_PROGRESSION, "C major", "P23-59 知らせ2");
    await openVault(page);
    const preview = page.getByTestId("vault-preview");
    await expect(preview).toBeVisible();
    await expect(preview.getByTestId("vault-go-bass")).toBeVisible();

    for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(150);
      await preview.getByRole("button", { name: "コードをコピー" }).click();
      const toast = page.locator(".lv-toast").first();
      await expect(toast).toBeVisible();
      await page.waitForTimeout(250);
      const measured = await page.evaluate(() => {
        const box = document.querySelector(".lv-toast")!.getBoundingClientRect();
        const list = document.querySelector(".lv-vault-main")!.getBoundingClientRect();
        const targets = [...document.querySelectorAll("[data-testid='vault-preview'] .lv-vault-go, [data-testid='vault-preview'] .lv-vault-preview-two > button, [data-testid='vault-preview'] .lv-vault-preview-play-button")]
          .map((element) => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
        const intersect = targets.filter((r) => box.left < r.right && r.left < box.right && box.top < r.bottom && r.top < box.bottom).length;
        return {
          centerGap: Math.abs((box.left + box.width / 2) - (list.left + list.width / 2)),
          overlapCount: intersect,
          targetCount: targets.length,
          right: innerWidth - box.right,
          bottom: innerHeight - box.bottom,
        };
      });
      console.log(`S1_VAULT_TOAST_${size.width}:`, JSON.stringify(measured));
      expect(measured.overlapCount, `${size.width}: clear of the preview's buttons`).toBe(0);
      expect(measured.centerGap, `${size.width}: the list column's centre`).toBeLessThanOrEqual(4);
      await captureReportShot(page, `p23-59-assets/s1-vault-toast-${size.width}.png`);
      await expect(page.locator(".lv-toast")).toHaveCount(0, { timeout: 15_000 });
    }
  });

  test("S1c: the analysis card keeps its place and the toast stack sits above it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    await openCapture(page);
    await dropMidi(page, createMidiFixture({ bars: 16 }), "p23-59-analysis.mid");
    await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
    await page.getByTestId("pre-analysis-analyze").click();
    const card = page.getByTestId("capture-analysis-progress");
    await expect(card).toBeVisible();
    const measured = await page.evaluate(() => {
      const cardBox = document.querySelector("[data-testid='capture-analysis-progress']")!.getBoundingClientRect();
      const column = document.querySelector(".lv-cw-body") ?? document.getElementById("main-content")!;
      const frame = column.getBoundingClientRect();
      const stack = document.querySelector(".lv-toast-stack:not(.lv-toast-stack-dialog)") as HTMLElement | null;
      const stackBottom = stack ? innerHeight - stack.getBoundingClientRect().bottom : null;
      return {
        centerGap: Math.abs((cardBox.left + cardBox.width / 2) - (frame.left + frame.width / 2)),
        cardHeight: Math.round(cardBox.height),
        cardTopFromBottom: Math.round(innerHeight - cardBox.top),
        cardBottomGap: Math.round(innerHeight - cardBox.bottom),
        // A toast's bottom edge is the stack's bottom edge: 196 px (76 + the card's 108 + 12) or 144 px.
        stackBottomGap: stackBottom,
        gap: stackBottom === null ? null : Math.round(stackBottom - (innerHeight - cardBox.top)),
        hasSaveForm: Boolean(document.querySelector(".lv-cw-save")),
      };
    });
    console.log("S1_ANALYSIS:", JSON.stringify(measured));
    expect(measured.centerGap).toBeLessThanOrEqual(4);
    expect(measured.cardBottomGap).toBe(measured.hasSaveForm ? 76 : 24);
    expect(measured.stackBottomGap).toBe(measured.hasSaveForm ? 196 : 144);
    // The card's top is 76 + 108 = 184 px up; the stack (a toast's bottom) is at 196 px: 12 px of air, ≥ 8.
    expect(measured.gap).toBeGreaterThanOrEqual(8);
    await captureReportShot(page, "p23-59-assets/s1-analysis-1280.png");
    await expect(page.locator('[data-capture-stage="result"]')).toBeVisible({ timeout: 20_000 });
    await expect(card).toBeHidden();
    await expect(page.getByTestId("correction-workspace")).toBeVisible();
    // The toast after the analysis lands at the bottom centre of the workspace, clear of the save form.
    const toast = page.locator(".lv-toast").filter({ hasText: /解析しました/ });
    await expect(toast).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(150);
    const workspace = await page.evaluate(() => {
      const box = [...document.querySelectorAll(".lv-toast")].find((node) => node.textContent?.includes("解析しました"))!.getBoundingClientRect();
      const name = document.querySelector<HTMLElement>("[data-testid='correction-save-name']");
      const primary = document.querySelector<HTMLElement>("[data-testid='correction-save-form'] [data-kind='primary']");
      const column = document.querySelector(".lv-cw-body") ?? document.getElementById("main-content")!;
      const frame = column.getBoundingClientRect();
      const intersect = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return {
        centerGap: Math.abs((box.left + box.width / 2) - (frame.left + frame.width / 2)),
        overlapsName: name ? intersect(box, name.getBoundingClientRect()) : false,
        overlapsPrimary: primary ? intersect(box, primary.getBoundingClientRect()) : false,
        hasName: Boolean(name),
        hasPrimary: Boolean(primary),
        bottomGap: Math.round(innerHeight - box.bottom),
      };
    });
    console.log("S1_WORKSPACE_TOAST:", JSON.stringify(workspace));
    expect(workspace.centerGap).toBeLessThanOrEqual(4);
    expect(workspace.overlapsName).toBe(false);
    expect(workspace.overlapsPrimary).toBe(false);
    expect(workspace.bottomGap).toBe(76);
    await captureReportShot(page, "p23-59-assets/s1-capture-result-1440.png");
  });

  test("S1d: the suggestion banner's buttons take the banner's amber", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page);
    await openCapture(page);
    await dropMidi(page, buildScenarioMidi(p10Scenario("melody-track-8")), "melody-track-8.mid");
    await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
    await page.getByTestId("pre-analysis-analyze").click();
    await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
    const workspace = page.getByTestId("correction-workspace");
    const suggestion = workspace.getByTestId("correction-suggestion");
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toContainText("メロディの音が");
    const colors = await suggestion.evaluate((element) => {
      const accent = element.querySelector<HTMLElement>('[data-kind="accent"]')!;
      const plain = [...element.querySelectorAll<HTMLElement>("button")].find((button) => !button.dataset.kind)!;
      const read = (target: HTMLElement) => {
        const style = getComputedStyle(target);
        return { color: style.color, border: style.borderColor, background: style.backgroundColor, weight: style.fontWeight };
      };
      return { accent: read(accent), plain: read(plain), warning: getComputedStyle(document.documentElement).getPropertyValue("--lv-warning").trim(), textSecondary: getComputedStyle(document.documentElement).getPropertyValue("--lv-text-secondary").trim() };
    });
    console.log("S1_SUGGESTION:", JSON.stringify(colors));
    expect(colors.accent.color).toBe("rgb(242, 193, 78)");
    expect(colors.accent.border).toBe("rgba(242, 193, 78, 0.55)");
    expect(colors.accent.background).toBe("rgba(0, 0, 0, 0)");
    expect(colors.accent.weight).toBe("600");
    expect(colors.plain.border).toBe("rgba(255, 255, 255, 0.16)");
    expect(colors.plain.background).toBe("rgba(0, 0, 0, 0)");
    await captureReportShot(page, "p23-59-assets/s3b-suggestion-1440.png");
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(200);
    await captureReportShot(page, "p23-59-assets/s3b-suggestion-1280.png");
    // P23-59-fix-2 1b: one press excludes every melody note (the banner then goes, the count goes up).
    const exclude = workspace.getByTestId("correction-exclude-melody");
    await expect(exclude).toHaveText(/メロディの \d+ 音を外す/);
    await exclude.click();
    // The melody banner goes (a same-notes-run banner may take its place, spec 6.5).
    await expect(workspace.locator('[data-testid="correction-suggestion"][data-kind="melody-voice"]')).toHaveCount(0);
    await expect(workspace.getByTestId("correction-edit-count")).toHaveText("直した回数 1");
    await captureReportShot(page, "p23-59-assets/s3b-suggestion-excluded-1280.png");
  });

  test("S2: the empty memo folds into ＋ メモ and opens again with what was written", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    await saveTextProgression(page, TAGS_SIX_PROGRESSION, "C major", "P23-59 メモ");
    await openProgressionPage(page);
    const memoButton = page.getByTestId("progression-memo-add");
    const memoInput = page.getByLabel("メモ", { exact: true });
    await expect(memoButton).toBeVisible();
    await expect(memoButton).toHaveText("＋ メモ");
    await expect(memoInput).toHaveCount(0);
    await memoButton.click();
    await expect(memoInput).toBeVisible();
    await expect(memoInput).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(memoButton).toBeVisible();
    await expect(memoInput).toHaveCount(0);
    await memoButton.click();
    await memoInput.fill("次の練習で確認する");
    await page.getByRole("button", { name: "上書き保存", exact: true }).click();
    await expect(page.locator(".lv-toast").filter({ hasText: "上書き保存しました" })).toBeVisible();
    await page.locator('[data-nav="home"]').click();
    await openVault(page);
    await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
    await expect(page.getByTestId("progression-title")).toBeVisible();
    await expect(page.getByLabel("メモ", { exact: true })).toHaveValue("次の練習で確認する");
    await expect(page.getByTestId("progression-memo-add")).toHaveCount(0);
  });

  test("S2b: at 1280×720 the folded memo leaves the same roll taller than P23-58's 163 px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    await saveTextProgression(page, TAGS_SIX_PROGRESSION, "C major", "P23-59 ロール");
    await openProgressionPage(page);
    await expect(page.getByTestId("progression-memo-add")).toBeVisible();
    const measured = await page.evaluate(() => {
      const roll = document.querySelector(".lv-cw-roll")!.getBoundingClientRect();
      const body = document.querySelector(".lv-cw-body")!.getBoundingClientRect();
      const cards = document.querySelector(".lv-cw-cards")!.getBoundingClientRect();
      const main = document.getElementById("main-content")!;
      return {
        visibleRollHeight: Math.round(Math.min(roll.bottom, body.bottom) - Math.max(roll.top, body.top)),
        cardsHeight: Math.round(cards.height),
        mainScrollOverflow: main.scrollHeight - main.clientHeight,
        tagCount: document.querySelectorAll("[data-testid='progression-tags'] .lv-progression-tag:not([data-add])").length,
      };
    });
    console.log("S2_ROLL_1280:", JSON.stringify(measured));
    expect(measured.tagCount).toBe(6);
    // P23-58's report: 163 px with the memo field always shown; the folded row is one row shorter.
    expect(measured.visibleRollHeight).toBeGreaterThan(163);
    expect(measured.mainScrollOverflow).toBe(0);
  });

  test("S3: at 1280×720 and 1366×768 the six tags take two rows and the practice row is never cut; 1440×900 is unchanged", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    await saveTextProgression(page, TAGS_SIX_PROGRESSION, "C major", "P23-59 入口");
    await openVault(page);
    const preview = page.getByTestId("vault-preview");
    await expect(preview).toBeVisible();
    await expect(preview.getByTestId("vault-go-bass")).toBeVisible();
    // The photo below is the "no toast" one: wait for the save toast to go (P23-59-fix-2 §1).
    await expect(page.locator(".lv-toast")).toHaveCount(0, { timeout: 15_000 });

    const measure = async () => page.evaluate(() => {
      const body = document.querySelector(".lv-vault-preview-body") as HTMLElement;
      const box = body.getBoundingClientRect();
      const aside = document.querySelector("[data-testid='vault-preview']") as HTMLElement;
      const asideRect = aside.getBoundingClientRect();
      const asideStyle = getComputedStyle(aside);
      const buttons = [...document.querySelectorAll("[data-testid='vault-preview'] .lv-vault-go")].map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const name = element.querySelector<HTMLElement>(".lv-vault-go-name")!;
        const nameRect = name.getBoundingClientRect();
        return {
          top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height), left: Math.round(rect.left), width: Math.round(rect.width),
          innerBottom: Math.round(rect.bottom - Number.parseFloat(style.paddingBottom)),
          name: name.textContent,
          nameScrollWidth: name.scrollWidth,
          nameClientWidth: name.clientWidth,
          nameBottom: Math.round(nameRect.bottom),
          nameFontSize: getComputedStyle(name).fontSize,
          nameLineHeight: getComputedStyle(name).lineHeight,
        };
      });
      const tags = [...document.querySelectorAll("[data-testid='vault-preview'] .lv-vault-tag")].map((element) => Math.round(element.getBoundingClientRect().top));
      const head = document.querySelector(".lv-vault-go-head") as HTMLElement | null;
      const facts = document.querySelector(".lv-vault-preview-facts") as HTMLElement | null;
      return {
        overflow: body.scrollHeight - body.clientHeight,
        bodyBottom: Math.round(box.bottom),
        aside: {
          top: Math.round(asideRect.top),
          bottom: Math.round(asideRect.bottom),
          height: Math.round(asideRect.height),
          innerBottom: Math.round(asideRect.bottom - Number.parseFloat(asideStyle.paddingBottom)),
          maxHeight: asideStyle.maxHeight,
          scrollOverflow: aside.scrollHeight - aside.clientHeight,
        },
        buttons,
        tagCount: tags.length,
        tagRows: new Set(tags).size,
        headShown: head ? getComputedStyle(head).display !== "none" : false,
        headText: head?.textContent ?? null,
        factsDisplay: facts ? getComputedStyle(facts).display : null,
      };
    });

    for (const size of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(150);
      const short = await measure();
      console.log(`S3_${size.width}:`, JSON.stringify(short));
      expect(short.tagCount, `${size.width}: six tags`).toBe(6);
      expect(short.tagRows, `${size.width}: two rows`).toBe(2);
      expect(short.overflow, `${size.width}: the column does not scroll`).toBeLessThanOrEqual(1);
      expect(short.aside.scrollOverflow, `${size.width}: the panel does not clip`).toBeLessThanOrEqual(1);
      // The panel is content-sized: ≥ 8 px below its cap, so a font or a tag row cannot push the row out.
      expect(short.aside.height, `${size.width}: the panel keeps slack under its cap`).toBeLessThanOrEqual(Number.parseFloat(short.aside.maxHeight) - 8);
      expect(short.buttons, `${size.width}: three entries`).toHaveLength(3);
      expect(new Set(short.buttons.map((button) => button.height)).size, `${size.width}: one height`).toBe(1);
      expect(short.buttons[0].height, `${size.width}: 58 px`).toBe(58);
      expect(new Set(short.buttons.map((button) => button.top)).size, `${size.width}: one row`).toBe(1);
      for (const button of short.buttons) expect(button.bottom, `${size.width}: the row is inside the column`).toBeLessThanOrEqual(short.aside.innerBottom + 1);
      // P23-59-fix-3 §1: every name fits (no 「Bass Practi…」) and its descenders stay inside the button.
      for (const button of short.buttons) {
        expect(button.nameScrollWidth, `${size.width}: ${button.name} is not cut`).toBeLessThanOrEqual(button.nameClientWidth);
        expect(button.nameBottom, `${size.width}: ${button.name}'s bottom`).toBeLessThanOrEqual(button.innerBottom);
        expect(button.nameFontSize).toBe("11px");
        expect(button.nameLineHeight).toBe("16px");
      }
      expect(short.buttons[0].name.startsWith("Voicing Loop"), short.buttons[0].name).toBe(true);
      expect(short.buttons[1].name.startsWith("Chord Dojo"), short.buttons[1].name).toBe(true);
      expect(short.buttons[2].name.startsWith("Bass Practice"), short.buttons[2].name).toBe(true);
      expect(short.headShown, `${size.width}: the caption`).toBe(true);
      expect(short.headText).toBe("練習で使う");
      expect(short.factsDisplay, `${size.width}: the two facts are one quiet line`).toBe("flex");
      for (const name of [/Voicing Loop で弾く/, /Chord Dojo で覚える/, /Bass Practice でベースを弾く/]) {
        await expect(preview.getByRole("button", { name })).toBeVisible();
      }
      await captureReportShot(page, `p23-59-assets/s3-vault-${size.width}.png`);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(150);
    const tall = await measure();
    console.log("S3_1440:", JSON.stringify(tall));
    expect(tall.buttons).toHaveLength(3);
    expect(tall.buttons.map((button) => button.height)).toEqual([40, 40, 40]);
    expect(tall.buttons[1].top - tall.buttons[0].top).toBe(48);
    expect(tall.buttons[2].top - tall.buttons[1].top).toBe(48);
    expect(new Set(tall.buttons.map((button) => button.left)).size).toBe(1);
    expect(tall.buttons[0].width).toBe(tall.buttons[2].width);
    expect(tall.overflow).toBe(0);
    expect(tall.headShown).toBe(false);
    expect(tall.factsDisplay).toBe("grid");
    await captureReportShot(page, "p23-59-assets/s3-vault-1440.png");
  });
});
