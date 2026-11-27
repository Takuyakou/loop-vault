import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture, openVault, chooseTextSetting } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

async function saveTextProgression(page: Page, text: string, key: string, name: string) {
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(text);
  await chooseTextSetting(capture, "text-progression-key", key);
  await capture.getByTestId("text-progression-name").fill(name);
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
}

test.describe("P23-58 finishing: micro-interactions, carryover fixes, and polish", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("A1/A2/A3/B3: copy, favorite pop, save button states, and Vault -> Bass Practice", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openApp(page);
    await page.locator('[data-nav="capture"]').click();
    await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
    const capture = page.getByTestId("text-progression-capture");
    await capture.getByTestId("text-progression-input").fill("| Dm7 | G7 | Cmaj7 | Cmaj7 |");
    await chooseTextSetting(capture, "text-progression-key", "C major");
    const bpmInput = capture.getByTestId("text-progression-bpm");
    await bpmInput.click();
    await bpmInput.fill("120");
    await bpmInput.press("Enter");
    await capture.getByTestId("text-progression-name").fill("P23-58 テスト進行");

    // A3: idle -> busy -> done -> idle; button width stays constant and no adjacent 「保存しました」 outside the button.
    const saveBtn = capture.getByTestId("text-progression-save");
    await expect(saveBtn).toHaveAttribute("data-save-state", "idle");
    const idleBox = await saveBtn.boundingBox();
    await saveBtn.click();
    await expect(saveBtn).toHaveAttribute("data-save-state", "busy");
    const busyBox = await saveBtn.boundingBox();
    await expect(saveBtn).toHaveAttribute("data-save-state", "done", { timeout: 2000 });
    const doneBox = await saveBtn.boundingBox();
    expect(Math.abs(busyBox!.width - idleBox!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(doneBox!.width - idleBox!.width)).toBeLessThanOrEqual(1);
    await captureReportShot(page, "p23-58-assets/a3-save-done.png");
    const adjacentSaved = await capture.locator('footer [role="status"]').filter({ hasText: "保存しました" }).count();
    expect(adjacentSaved).toBe(0);
    await expect(saveBtn).toHaveAttribute("data-save-state", "idle", { timeout: 3000 });

    // Open Vault for A1, A2, B3
    await openVault(page);
    const preview = page.getByTestId("vault-preview");
    await expect(preview).toBeVisible();
    await captureReportShot(page, "p23-58-assets/b3-vault-right.png");

    // A1: copy sets data-copied="true" and clears after 1.5s
    const copyBtn = preview.getByRole("button", { name: "コードをコピー" });
    await copyBtn.click();
    await expect(copyBtn).toHaveAttribute("data-copied", "true");
    await captureReportShot(page, "p23-58-assets/a1-copy.png");
    await page.waitForTimeout(1400);
    await expect(copyBtn).not.toHaveAttribute("data-copied", "true");

    // A2: favorite add sets data-pop="true"; remove does NOT set data-pop
    const row = page.locator(".lv-vault-row").first();
    const favBtn = row.locator("button.lv-fav-btn");
    await favBtn.click();
    await expect(favBtn).toHaveAttribute("data-pop", "true");
    await captureReportShot(page, "p23-58-assets/a2-favorite.png");
    await expect(favBtn).not.toHaveAttribute("data-pop", "true", { timeout: 1000 });
    await favBtn.click();
    await expect(favBtn).not.toHaveAttribute("data-pop", "true");

    // B3: Vault -> Bass Practice opens with this progression's chords
    const goBass = preview.getByTestId("vault-go-bass");
    await expect(goBass).toBeVisible();
    await goBass.click();
    await expect(page.getByTestId("bassline-echo-view").getByText("Dm7")).toBeVisible({ timeout: 5000 });
  });

  test("A2 reduced-motion: favorite heart animationName is none under prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openApp(page);
    await saveTextProgression(page, "| C | Am | F | G |", "C major", "RM 進行");
    await openVault(page);
    const favBtn = page.locator(".lv-vault-row").first().locator("button.lv-fav-btn");
    await favBtn.click();
    await expect(favBtn).toHaveAttribute("data-pop", "true");
    const animName = await favBtn.locator("svg").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(animName).toBe("none");
  });

  test("A4/A5/E4/E5: SegmentedControl pill slide, Switch, and Settings Select appearance", async ({ page }) => {
    await openApp(page);
    // A4: SegmentedControl in the header (Piano / E.Piano)
    const seg = page.locator(".lv-segmented").first();
    await expect(seg).toBeVisible();
    const buttons = seg.locator(".lv-segment");
    const second = buttons.nth(1);
    await second.click();
    await page.waitForTimeout(300);
    const diff = await seg.evaluate((el) => {
      const pill = el.querySelector<HTMLElement>("[data-segment-pill]");
      const active = el.querySelector<HTMLElement>('[aria-checked="true"], [aria-pressed="true"]');
      if (!pill || !active) return 999;
      return Math.abs(pill.getBoundingClientRect().left - active.getBoundingClientRect().left);
    });
    expect(diff).toBeLessThanOrEqual(1.5);
    await captureReportShot(page, "p23-58-assets/a4-segmented.png");

    // A5 / E4 / E5: Settings page
    await page.locator('[data-nav="settings"]').click();
    await expect(page.locator("#settings-import-mode")).toBeVisible();
    const appearances = await page.evaluate(() => {
      const importSel = document.getElementById("settings-import-mode");
      const midiSel = document.querySelector<HTMLSelectElement>('select[aria-label*="MIDI"]');
      return {
        importApp: importSel ? getComputedStyle(importSel).appearance : null,
        midiApp: midiSel ? getComputedStyle(midiSel).appearance : null,
      };
    });
    expect(appearances.importApp).toBe("none");
    if (appearances.midiApp !== null) expect(appearances.midiApp).toBe("none");
    await captureReportShot(page, "p23-58-assets/e4-e5-settings.png");

    const sw = page.locator(".lv-switch").first();
    if (await sw.isVisible()) {
      await sw.click();
      await page.waitForTimeout(200);
      await captureReportShot(page, "p23-58-assets/a5-switch.png");
    }
  });

  test("A6/A7: CaptureEntry dragenter copy and GlobalBpmField wheel roll", async ({ page }) => {
    await openApp(page);
    await openCapture(page);
    const zone = page.getByTestId("capture-entry-zone");
    await expect(zone).toBeVisible();
    await page.evaluate(() => {
      const zoneEl = document.querySelector('[data-testid="capture-entry-zone"]')!;
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array([1, 2, 3])], "demo.mid", { type: "audio/midi" }));
      zoneEl.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await expect(zone).toContainText("放すと読み込みます");
    await expect(zone).toContainText(".mid ・ .midi");
    await captureReportShot(page, "p23-58-assets/a6-drop-over.png");

    // A7: wheel on GlobalBpmField triggers data-roll="up"
    const bpmVal = page.getByTestId("global-bpm-value");
    await bpmVal.dispatchEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
    await expect(bpmVal.locator("[data-roll='up']")).toBeVisible();
    await captureReportShot(page, "p23-58-assets/a7-bpm-roll.png");
  });

  test("A8/A9/A10/E3: Ear steps, Guided demo PlayingMark, Dojo home stat roll, and E3 restart button", async ({ page }) => {
    await openDojo(page, "midi");
    await expect(page.getByTestId("dojo-home")).toBeVisible();

    // Open guided course map -> Lv1 demo (A9) -> question (E3)
    await page.getByTestId("home-guide").getByRole("button").first().click();
    const mapDemo = page.getByTestId("course-map-demo");
    if (await mapDemo.isVisible()) {
      await mapDemo.click();
    }
    await expect(page.getByTestId("course-demo-card")).toBeVisible();
    const demoCard = page.getByTestId("course-demo-card");
    await demoCard.click();
    await expect(demoCard).toHaveAttribute("data-playing", "true");
    await expect(demoCard.locator(".lv-playing-mark")).toBeVisible();
    await captureReportShot(page, "p23-58-assets/a9-playing-mark.png");
    await page.getByTestId("course-demo-skip").click();
    await expect(page.locator("[data-playing='true']")).toHaveCount(0);

    // E3: restart button at 1440 and 768
    const restartBtn = page.getByTestId("course-restart");
    await expect(restartBtn).toBeVisible();
    await expect(restartBtn.locator("svg")).toBeVisible();
    await captureReportShot(page, "p23-58-assets/e3-restart-1440.png");
    await page.setViewportSize({ width: 768, height: 640 });
    await page.waitForTimeout(100);
    await captureReportShot(page, "p23-58-assets/e3-restart-768.png");
    await page.setViewportSize({ width: 1440, height: 900 });

    // Return to Dojo home (A10 screenshot)
    await page.locator(".dojo-back").first().click();
    if (await page.locator(".dojo-back").first().isVisible()) {
      await page.locator(".dojo-back").first().click();
    }
    await expect(page.getByTestId("dojo-home")).toBeVisible();
    await captureReportShot(page, "p23-58-assets/a10-stat-roll.png");

    // A8: EarRun steps connector fill + B6 8-bar result measurement
    await page.evaluate(() => window.localStorage.removeItem("loop-vault:ear-practice-settings:v1"));
    await page.getByTestId("ear-open").click();
    await page.getByTestId("ear-source-builtin").click();
    await page.getByTestId("ear-level-3").click();
    await page.getByTestId("ear-length-8").click();
    await page.getByTestId("ear-start").click();
    await expect(page.getByTestId("ear-run")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
    await expect(page.locator('.ear-steps .ear-step-line[data-filled="true"]')).toHaveCount(1);
    await captureReportShot(page, "p23-58-assets/a8-steps.png");
    await captureReportShot(page, "p23-58-assets/b11-dojo-ear.png");

    // Finish 8-bar ear run and measure B6 after
    const count: number = await page.evaluate(() => {
      const ask = (window as unknown as { __earAnswer: (index: number) => number[] | undefined }).__earAnswer;
      let c = 0;
      while (ask(c)) c += 1;
      return c;
    });
    for (let i = 0; i < count; i += 1) {
      const notes: number[] = await page.evaluate((idx) => (window as unknown as { __earAnswer: (k: number) => number[] }).__earAnswer(idx), i);
      await page.evaluate((n) => (window as unknown as { __p12Midi: { emit: (a: number[], on: boolean, spread: number) => void } }).__p12Midi.emit(n, true, 10), notes);
      if (i < count - 1) await expect(page.getByTestId(`ear-card-${i}`)).toHaveAttribute("data-done", "true", { timeout: 5000 });
      await page.evaluate((n) => (window as unknown as { __p12Midi: { emit: (a: number[], on: boolean, spread: number) => void } }).__p12Midi.emit(n, false, 0), notes);
    }
    await expect(page.getByTestId("ear-result")).toBeVisible({ timeout: 8000 });
    for (const [w, h] of [[1440, 900], [1366, 768]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(100);
      const m = await page.evaluate(() => {
        const body = document.querySelector(".ear-result-body")!;
        return { bodyOverflow: body.scrollHeight - body.clientHeight, scrollH: body.scrollHeight, clientH: body.clientHeight };
      });
      console.log(`B6_AFTER_${w}x${h}:`, JSON.stringify(m));
    }
  });

  test("B1/B2/B4: 1280x720 roll >= 160px, tags dialog, and 1440x900 toolbar 1 line", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    await saveTextProgression(page, "| Ebmaj7 | Cm7 | Fm7 Bb7 | Ebmaj7 | Abmaj7 | Gm7 C7 | Fm7 | Bb7 |", "Eb major", "夜のループ");
    await page.locator('[data-nav="vault"]').click();
    await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
    await expect(page.getByTestId("progression-title")).toBeVisible();

    const b1 = await page.evaluate(() => {
      const roll = document.querySelector(".lv-cw-roll")!.getBoundingClientRect();
      const body = document.querySelector(".lv-cw-body")!.getBoundingClientRect();
      const cards = document.querySelector(".lv-cw-cards")!.getBoundingClientRect();
      const legend = document.querySelector(".lv-cw-legend")?.getBoundingClientRect();
      const main = document.getElementById("main-content")!;
      return {
        visibleRollHeight: Math.round(Math.min(roll.bottom, body.bottom) - Math.max(roll.top, body.top)),
        cardsHeight: Math.round(cards.height),
        legendHeight: legend ? Math.round(legend.height) : 0,
        cardsToRollGap: Math.round(roll.top - cards.bottom),
        mainScrollOverflow: main.scrollHeight - main.clientHeight,
      };
    });
    console.log("B1_FINAL:", JSON.stringify(b1));
    expect(b1.visibleRollHeight).toBeGreaterThanOrEqual(160);
    expect(b1.mainScrollOverflow).toBe(0);
    await captureReportShot(page, "p23-58-assets/b1-after-1280.png");

    // P23-59 S2b (merged here in P25 T3): the memo is folded, and the folded row gives the roll its height back —
    // taller than P23-58's 163 px with the memo field shown, and taller than the same page with the memo opened.
    const memoAdd = page.getByTestId("progression-memo-add");
    const memoInput = page.getByLabel("メモ", { exact: true });
    await expect(memoAdd).toBeVisible();
    await expect(memoInput).toHaveCount(0);
    expect(b1.visibleRollHeight).toBeGreaterThan(163);
    const visibleRoll = () => page.evaluate(() => {
      const roll = document.querySelector(".lv-cw-roll")!.getBoundingClientRect();
      const body = document.querySelector(".lv-cw-body")!.getBoundingClientRect();
      return Math.round(Math.min(roll.bottom, body.bottom) - Math.max(roll.top, body.top));
    });
    await memoAdd.click();
    await expect(memoInput).toBeVisible();
    const openedRoll = await visibleRoll();
    expect(b1.visibleRollHeight, "the folded memo leaves the roll taller than the opened memo").toBeGreaterThan(openedRoll);
    await page.keyboard.press("Tab");
    await expect(memoAdd).toBeVisible();
    await expect(memoInput).toHaveCount(0);
    await expect.poll(visibleRoll).toBe(b1.visibleRollHeight);

    // B2: Tags dialog
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: /＋ タグ/ }).click();
    await expect(page.locator(".lv-tags-editor")).toBeVisible();
    const b2Style = await page.locator(".lv-tags-editor .lv-tags-input").evaluate((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { radius: s.borderTopLeftRadius, height: Math.round(r.height) };
    });
    expect(parseFloat(b2Style.radius)).toBeGreaterThanOrEqual(100);
    expect(b2Style.height).toBe(34);
    await captureReportShot(page, "p23-58-assets/b2-tags-dialog.png");

    // B11 song page: open 「この曲の情報を見る」 or DetailView via 「そのほか」
    await page.keyboard.press("Escape");

    // D1: progression save grid, menu alignment, and A3 save button width stability
    await page.getByTestId("correction-card").first().click();
    await page.getByTestId("correction-name-candidates").getByRole("button").first().click();
    const saveForm = page.getByTestId("correction-save-form");
    const primaryBtn = saveForm.locator('[data-kind="primary"]');
    const versionBtn = saveForm.getByRole("button", { name: "別の版として保存", exact: true });
    const moreSummary = saveForm.locator('summary[aria-label="保存のその他の操作"]');
    const d1Boxes = await page.evaluate(() => {
      const form = document.querySelector('[data-testid="correction-save-form"]')!;
      const p = form.querySelector<HTMLElement>('[data-kind="primary"]')!.getBoundingClientRect();
      const v = form.querySelector<HTMLElement>('.lv-cw-save-actions > button:not([data-kind="primary"])')!.getBoundingClientRect();
      const s = form.querySelector<HTMLElement>('summary[aria-label="保存のその他の操作"]')!.getBoundingClientRect();
      return {
        primary: { left: Math.round(p.left), right: Math.round(p.right), top: Math.round(p.top), bottom: Math.round(p.bottom), width: Math.round(p.width) },
        version: { left: Math.round(v.left), right: Math.round(v.right), top: Math.round(v.top), width: Math.round(v.width) },
        summary: { left: Math.round(s.left), right: Math.round(s.right), top: Math.round(s.top), width: Math.round(s.width) },
      };
    });
    expect(Math.abs(d1Boxes.primary.left - d1Boxes.version.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(d1Boxes.primary.right - d1Boxes.summary.right)).toBeLessThanOrEqual(1);
    expect(d1Boxes.version.top).toBeGreaterThan(d1Boxes.primary.bottom);
    expect(Math.abs(d1Boxes.version.top - d1Boxes.summary.top)).toBeLessThanOrEqual(1);
    expect(d1Boxes.summary.width).toBe(34);
    await moreSummary.click();
    const menuBox = await saveForm.locator(".lv-cw-delete-menu").boundingBox();
    const sumBox = await moreSummary.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(sumBox).not.toBeNull();
    expect(Math.abs((menuBox!.x + menuBox!.width) - (sumBox!.x + sumBox!.width))).toBeLessThanOrEqual(2);
    expect(menuBox!.y).toBeGreaterThanOrEqual(0);
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(900);
    await moreSummary.click();
    await primaryBtn.click();
    await expect(primaryBtn).toBeDisabled();
    const afterSaveBox = await primaryBtn.boundingBox();
    expect(Math.abs(afterSaveBox!.width - d1Boxes.primary.width)).toBeLessThanOrEqual(1);
    expect(await versionBtn.isVisible()).toBe(true);

    await page.getByRole("button", { name: "そのほか" }).click();
    await page.getByRole("button", { name: "この曲の情報を見る" }).click();
    await page.waitForTimeout(150);
    await captureReportShot(page, "p23-58-assets/b11-song-page.png");

    // B4: 1440x900 correction workspace toolbar
    await openCapture(page);
    await dropMidi(page, buildScenarioMidi(p10Scenario("plain-8")), "plain-8.mid");
    await page.getByTestId("pre-analysis-analyze").click();
    await expect(page.getByTestId("correction-workspace")).toBeVisible();
    const b4 = await page.evaluate(() => {
      const total = document.querySelector(".lv-cw-time-total");
      const totalRect = total?.getBoundingClientRect();
      const groups = [...document.querySelectorAll(".lv-cw-bar .lv-cw-group")];
      const rows = new Set(groups.map((g) => Math.round(g.getBoundingClientRect().top))).size;
      return {
        rows,
        totalVisible: Boolean(totalRect && totalRect.width > 0 && totalRect.height > 0),
        totalText: total?.textContent,
      };
    });
    console.log("B4_FINAL:", JSON.stringify(b4));
    expect(b4.rows).toBe(1);
    expect(b4.totalVisible).toBe(true);
    await captureReportShot(page, "p23-58-assets/b4-after-1440.png");
  });

  test("E1/E2/B11: Bass Practice home, 3 resume bands comparison, and Dojo B11 shots", async ({ page }) => {
    await openApp(page);
    await saveTextProgression(page, "| Dm7 | G7 | Cmaj7 | Cmaj7 |", "C major", "E2 進行");

    // E1 & E2 Bass Practice (complete 1 度数 item so 続きから appears)
    await page.locator('[data-nav="bass-practice"]').click();
    await expect(page.locator(".lv-bh-group").first()).toBeVisible();
    await expect(page.locator(".lv-bh-group > small")).toHaveCount(0);
    await expect(page.locator(".lv-bh-heading")).toHaveCount(0);
    await captureReportShot(page, "p23-58-assets/e1-bass-home.png");
    await page.locator("[data-testid='bass-home-card'][data-mode='degree']").click();
    const bpView = page.getByTestId("degree-echo-view");
    // P23-62: 度数 runs on the shared stage; finish one attempt without a microphone:
    // 聴く → 録らずに弾く → 弾けた・答えを見る → 評価 → 次のフレーズ.
    await bpView.getByTestId("degree-listen").click();
    await expect(bpView).toHaveAttribute("data-practice-state", "recall", { timeout: 10_000 });
    await bpView.getByTestId("degree-play-without-take").click();
    await expect(bpView).toHaveAttribute("data-stage-step", "1");
    await bpView.getByTestId("degree-show-answer").click();
    await expect(bpView).toHaveAttribute("data-practice-state", "review", { timeout: 10_000 });
    await bpView.locator("[data-review-rating='good']").click();
    await bpView.getByTestId("degree-next").click();
    await page.locator(".bass-modebar").getByRole("button", { name: /Bass Practice/ }).click();
    await expect(page.getByTestId("bass-home-resume")).toBeVisible();
    await expect(page.getByTestId("bass-home-resume").locator(".lv-resume-band-title")).toHaveText("度数");
    const bpResume = await page.evaluate(() => {
      const band = document.querySelector('[data-testid="bass-home-resume"]')!;
      const mark = band.querySelector(".lv-resume-band-mark")!;
      const title = band.querySelector(".lv-resume-band-title")!;
      const btn = band.querySelector('[data-testid="bass-home-resume-open"]')!;
      return {
        bandH: Math.round(band.getBoundingClientRect().height),
        markW: Math.round(mark.getBoundingClientRect().width),
        markH: Math.round(mark.getBoundingClientRect().height),
        titleFont: parseFloat(getComputedStyle(title).fontSize),
        btnH: Math.round(btn.getBoundingClientRect().height),
      };
    });
    console.log("E2_BASS_RESUME:", JSON.stringify(bpResume));
    await captureReportShot(page, "p23-58-assets/e2-resume-bp.png");

    // E2 Voicing Loop resume band (synthetic vl15-picker with last practice)
    await page.addInitScript(({ lastKey, recentKey }) => {
      localStorage.setItem(recentKey, JSON.stringify({ version: 1, references: [{ ideaId: "public-vl15-c", blockId: "c" }] }));
      localStorage.setItem(lastKey, JSON.stringify({ version: 1, reference: { ideaId: "public-vl15-c", blockId: "c" }, at: new Date().toISOString() }));
    }, { lastKey: "loop-vault:voicing-loop-last:v1", recentKey: "loop-vault:voicing-loop-recents:v1" });
    await page.goto("/?p527Status=vl15-picker");
    await page.locator('[data-nav="voicing-loop"]').click();
    await expect(page.getByTestId("voicing-loop-resume")).toBeVisible();
    const vlResume = await page.evaluate(() => {
      const band = document.querySelector('[data-testid="voicing-loop-resume"]')!;
      const mark = band.querySelector(".lv-resume-band-mark")!;
      const title = band.querySelector(".lv-resume-band-title")!;
      const btn = band.querySelector('[data-testid="voicing-loop-resume-go"]')!;
      return {
        bandH: Math.round(band.getBoundingClientRect().height),
        markW: Math.round(mark.getBoundingClientRect().width),
        markH: Math.round(mark.getBoundingClientRect().height),
        titleFont: parseFloat(getComputedStyle(title).fontSize),
        btnH: Math.round(btn.getBoundingClientRect().height),
      };
    });
    console.log("E2_VL_RESUME:", JSON.stringify(vlResume));
    await captureReportShot(page, "p23-58-assets/e2-resume-vl.png");

    // E2 Chord Dojo resume band + B11 (2-5-1 Master, Jazz Progressions, Drill)
    await openDojo(page, "midi");
    await expect(page.getByTestId("home-resume")).toBeVisible();
    const cdResume = await page.evaluate(() => {
      const band = document.querySelector('[data-testid="home-resume"]')!;
      const mark = band.querySelector(".lv-resume-band-mark")!;
      const title = band.querySelector(".lv-resume-band-title")!;
      const btn = band.querySelector('[data-testid="home-resume-go"], .dojo-home-p20-primary')!;
      return {
        bandH: Math.round(band.getBoundingClientRect().height),
        markW: Math.round(mark.getBoundingClientRect().width),
        markH: Math.round(mark.getBoundingClientRect().height),
        titleFont: parseFloat(getComputedStyle(title).fontSize),
        btnH: Math.round(btn.getBoundingClientRect().height),
      };
    });
    console.log("E2_CD_RESUME:", JSON.stringify(cdResume));
    expect(Math.abs(vlResume.bandH - cdResume.bandH)).toBeLessThanOrEqual(1);
    expect(Math.abs(vlResume.markW - cdResume.markW)).toBeLessThanOrEqual(1);
    expect(Math.abs(vlResume.markH - cdResume.markH)).toBeLessThanOrEqual(1);
    expect(Math.abs(vlResume.titleFont - cdResume.titleFont)).toBeLessThanOrEqual(1);
    // The CD band in this flow may show the empty-state button; compare the shared Enter with the BP one.
    expect(Math.abs(vlResume.btnH - bpResume.btnH)).toBeLessThanOrEqual(1);
    await captureReportShot(page, "p23-58-assets/e2-resume-cd.png");

    // B11: 2-5-1 Master
    await page.getByTestId("home-master").getByRole("button", { name: /2-5-1 Master/ }).click();
    await page.waitForTimeout(200);
    await captureReportShot(page, "p23-58-assets/b11-dojo-master251.png");

    // B11: Jazz Progressions
    await openDojo(page, "midi");
    await page.getByTestId("home-open-jazz").click();
    await page.waitForTimeout(200);
    await captureReportShot(page, "p23-58-assets/b11-dojo-jazz.png");

    // B11: Voicing Drill
    await openDojo(page, "midi");
    await page.getByTestId("home-drill").getByRole("button", { name: "ボイシングドリル" }).click();
    await page.waitForTimeout(200);
    await captureReportShot(page, "p23-58-assets/b11-dojo-drill.png");
  });
});
