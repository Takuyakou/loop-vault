import { expect, test } from "@playwright/test";
import { openSyntheticBass, syntheticMicrophone, recordSyntheticBass, syntheticBassMidi } from "./helpers/bass-ui";
import { assertNoHorizontalOverflow, openBassPractice } from "./helpers/app";

/** P23-62/P23-64: the stage practices keep their own fields in the top band's 「条件」 / 「判定」 chip. */
const CONDITION_CHIPS: Readonly<Partial<Record<string, string>>> = {
  度数: "degree-conditions",
  リズム: "rhythm-conditions",
  ルートの動き: "root-motion-conditions",
  "MIDI のベースライン": "midi-judge-conditions",
};

test("P13.1 §4 MIDI input chip holds channel state without rail and never requests audio on render", async ({ page }) => {
  await syntheticMicrophone(page);
  await openSyntheticBass(page);
  await expect(page.locator(".bass-echo-rail:visible")).toHaveCount(0);
  await page.getByTestId("bass-input-chip").click();
  const inputDialog = page.getByRole("dialog", { name: "録音の入力" });
  await expect(inputDialog).toBeVisible();
  await expect(inputDialog.getByLabel("入力チャンネル", { exact: true })).toBeVisible();
  await expect(inputDialog).toContainText("録音は判定にだけ使い");
  expect(await inputDialog.innerText()).not.toContain("Record & Compare");
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { bassSyntheticRequests: number }).bassSyntheticRequests)).toBe(0);
  for (const name of ["録って弾く", "停止", "もう一度録る", "録音せず続ける", "Record & Compareを使う"]) {
    await expect(inputDialog.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await page.keyboard.press("Escape");
  await expect(inputDialog).toHaveCount(0);

  await recordSyntheticBass(page);
  const view = page.getByTestId("midi-bass-practice");
  await expect(view).toHaveAttribute("data-stage-step", "2");
  const keepBtn = page.getByTestId("midi-keep-take");
  await expect(keepBtn).toBeEnabled();
  await expect(keepBtn).toHaveText("録音を残す");
  await keepBtn.click();
  await expect(keepBtn).toBeDisabled();
  await expect(keepBtn).toHaveText("残しました");

  await view.getByRole("button", { name: "● もう一度", exact: true }).click();
  await expect(view).toHaveAttribute("data-stage-step", "1");
  await page.keyboard.press("Escape");
  await expect(view).toHaveAttribute("data-stage-step", "0");

  await view.getByRole("button", { name: "次の区間", exact: true }).click();
  await expect(page.getByLabel("開始小節")).toHaveValue("3");
  await view.getByRole("button", { name: "● 録って弾く", exact: true }).click();
  await expect(view).toHaveAttribute("data-stage-step", "1");
  await page.keyboard.press("Escape");
  await expect(view).toHaveAttribute("data-stage-step", "0");
});

test("P13.1 §2 §3 §9 compact bar, adjacent actions and three equal steps", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSyntheticBass(page);
  const geometry = await page.getByTestId("midi-bass-practice").evaluate(el => {
    const bar = el.querySelector(".bass-midi-bar")!.getBoundingClientRect();
    const lane = el.querySelector("[data-testid='bp-lane']")!.getBoundingClientRect();
    const playrow = el.querySelector(".bp-playrow")!.getBoundingClientRect();
    const actions = el.querySelector(".bp-actions")!.getBoundingClientRect();
    const steps = Array.from(el.querySelectorAll(".bp-step")).map((s) => (s.textContent ?? "").trim());
    return { barHeight: bar.height, playGap: playrow.top - lane.bottom, actionHeight: actions.height, steps };
  });
  console.log("P13.1 practice px", geometry);
  expect(geometry.barHeight).toBeLessThanOrEqual(48);
  expect(geometry.playGap).toBeGreaterThanOrEqual(6);
  expect(geometry.playGap).toBeLessThanOrEqual(32);
  expect(geometry.actionHeight).toBeLessThanOrEqual(60);
  expect(geometry.steps).toEqual(["1聴く", "2弾く", "3結果"]);
  await expect(page.getByLabel("開始小節")).toHaveValue("1");
  await page.getByRole("button", { name: "次の区間", exact: true }).click();
  await expect(page.getByLabel("開始小節")).toHaveValue("3");
  await page.getByRole("button", { name: "前の区間", exact: true }).click();
  await expect(page.getByLabel("開始小節")).toHaveValue("1");
});

test("P13.1 §5 §11 readable beat widths, note titles and last bar reachability", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSyntheticBass(page);
  await page.getByRole("radiogroup", { name: "区間の長さ", exact: true }).getByRole("radio", { name: "全部", exact: true }).click();
  for (const fret of [false, true]) {
    if (fret) await page.getByRole("button", { name: "弦とフレットを出す", exact: true }).click();
    const width = await page.locator("[data-testid='midi-bass-practice'] .bp-lane-inner").evaluate(el => el.getBoundingClientRect().width);
    console.log("P13.1 all lane px", { fret, width });
    expect(width).toBeGreaterThanOrEqual(32 * (fret ? 64 : 48));
    await page.locator("[data-testid='midi-bass-practice'] .bp-lane-scroll").evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await expect(page.locator("[data-testid='midi-bass-practice'] .bp-lane-beats").getByText("8 小節", { exact: true })).toBeInViewport();
    expect(await page.locator("[data-testid='midi-bass-practice'] .bp-note").evaluateAll(els => els.every(el => el.scrollWidth <= el.clientWidth))).toBe(true);
    expect(await page.locator("[data-testid='midi-bass-practice'] .bp-note").evaluateAll(els => els.every(el => /弦 \d/.test(el.getAttribute("title")??"") && /弦 \d/.test(el.getAttribute("aria-label")??"")))).toBe(true);
    await assertNoHorizontalOverflow(page);
  }
  expect(await page.getByTestId("midi-bass-practice").innerText()).not.toMatch(/\b[A-G]b\d/);
  const g = await page.getByTestId("midi-bass-practice").evaluate(el => {
    const lane = el.querySelector("[data-testid='bp-lane']")!.getBoundingClientRect();
    const fret = el.querySelector("[data-testid='bp-fretboard']")!.getBoundingClientRect();
    const actions = el.querySelector(".bp-actions")!.getBoundingClientRect();
    return { laneBottom: lane.bottom, fretBottom: fret.bottom, actionTop: actions.top };
  });
  console.log("P13.1 long content px", g);
  expect(g.actionTop).toBeGreaterThanOrEqual(Math.max(g.laneBottom, g.fretBottom));
});

test("P13.1 §7 accompaniment lane and chip follow actual data", async ({ page }) => {
  await openSyntheticBass(page, false);
  await expect(page.getByLabel("コードの段", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("midi-bass-practice").getByRole("button", { name: /^伴奏/ })).toHaveCount(0);
});

for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }]) {
  test(`P13.1 §1 §10 result without scroll and primary actions ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await syntheticMicrophone(page, true);
    await openSyntheticBass(page);
    await recordSyntheticBass(page);
    const g = await page.getByTestId("midi-bass-practice").evaluate(el => {
      const frame = el.querySelector(".bp-frame-scroll")!.getBoundingClientRect();
      const result = el.querySelector('[data-testid="midi-bass-result"]')!.getBoundingClientRect();
      const own = el.querySelector('[aria-label="自分の段"]')!.getBoundingClientRect();
      const actions = el.querySelector(".bp-actions")!.getBoundingClientRect();
      return { top: frame.top, bottom: frame.bottom, resultTop: result.top, resultBottom: result.bottom, ownBottom: own.bottom, actionHeight: actions.height };
    });
    console.log(`P13.1 result ${size.width} px`, g);
    expect(g.resultTop).toBeGreaterThanOrEqual(g.top);
    expect(g.resultBottom).toBeLessThanOrEqual(g.bottom + 1);
    if (size.width >= 1440) expect(g.ownBottom).toBeLessThanOrEqual(g.bottom + 1);
    if (size.width === 1440) expect(g.actionHeight).toBeLessThanOrEqual(60);
    await expect(page.getByTestId("midi-bass-result")).toContainText("音が違う 1");
    await expect(page.getByTestId("midi-bass-result")).toContainText("抜け 1");
    await expect(page.getByTestId("midi-bass-result")).toContainText("余分な音 1");
    expect(await page.locator("[data-testid='midi-bass-practice'] .bp-note").evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth))).toBe(true);
    await expect(page.locator("[data-testid='midi-bass-practice'] .bp-actions .bp-btn[data-tone='primary']")).toHaveCount(1);
    await page.getByTestId("midi-bass-practice").getByRole("heading", { name: "合成ベース A", exact: true }).click();
    await page.keyboard.press("n");
    await expect(page.getByLabel("開始小節")).toHaveValue("3");
  });
}

test("P13.1 §6 §8 Japanese import and accompaniment defaults preserve source selection", async ({ page }) => {
  await openSyntheticBass(page, true, 0);
  await page.getByRole("button", { name: "＋ MIDI を読み込む", exact: true }).click();
  const dialog=page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name:"ファイルを選ぶ", exact:true })).toBeFocused();
  await expect(dialog.getByLabel("MIDIファイル", {exact:true})).toBeHidden();
  await dialog.getByLabel("MIDIファイル", {exact:true}).setInputFiles({name:"public-synthetic.mid",mimeType:"audio/midi",buffer:syntheticBassMidi()});
  await expect(dialog).toContainText("public-synthetic.mid · 3トラック · 8小節 · 120 BPM · 4/4");
  const harmony=dialog.getByLabel("伴奏 Synthetic Harmony",{exact:true});
  await expect(harmony).toBeChecked();
  await expect(dialog.getByLabel("伴奏 Synthetic Bass",{exact:true})).toBeDisabled();
  await expect(dialog.getByLabel("伴奏 Synthetic Drums",{exact:true})).toBeDisabled();
  expect(await dialog.getByLabel("伴奏 Synthetic Bass",{exact:true}).evaluate(el=>getComputedStyle(el).opacity)).toBe("0.35");
  await dialog.getByLabel("ベース Synthetic Harmony",{exact:true}).check();
  await expect(harmony).not.toBeChecked();await expect(harmony).toBeDisabled();
  await dialog.getByLabel("ベース Synthetic Bass",{exact:true}).check();
  await expect(harmony).toBeChecked();await expect(harmony).toBeEnabled();
  await expect(dialog.locator(".lv-button-primary")).toHaveCount(1);
  await dialog.getByRole("button",{name:"保存して練習する",exact:true}).click();
  await expect(page.getByTestId("midi-bass-practice")).toBeVisible();
  expect(await page.locator('[data-testid="midi-bass-practice"] select').evaluateAll(els=>els.every(el=>!el.classList.contains("lv-input")))).toBe(true);
});

test("P13.1 §12 settings and keyboard shortcuts below tabs remain operable", async ({page}) => {
  await openSyntheticBass(page);
  const settings=page.locator(".bass-mode-tools").getByRole("button",{name:/4弦/});
  await settings.click();await expect(settings).toHaveAttribute("aria-expanded","true");
  await settings.click();await expect(settings).toHaveAttribute("aria-expanded","false");
  await page.getByRole("button",{name:"キー操作",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"キー操作"})).toBeVisible();
  await page.keyboard.press("Escape");await expect(page.getByRole("dialog",{name:"キー操作"})).toHaveCount(0);
});

test("P13.1 §13 library search, radio filter, preview and menu retain business actions",async({page})=>{
  await page.setViewportSize({width:1440,height:900});await openSyntheticBass(page,true,2);
  await page.getByRole("button",{name:"一覧へ",exact:true}).click();
  await expect(page.locator(".bass-song")).toHaveCount(2);
  expect(await page.getByLabel("曲名で探す").evaluate(el=>el.getBoundingClientRect().width)).toBe(320);
  await page.getByRole("button",{name:"合成ベース A お気に入り",exact:true}).click();
  await page.getByRole("radio",{name:/お気に入り/}).click();await expect(page.locator(".bass-song")).toHaveCount(1);
  await page.getByRole("radio",{name:/すべて/}).click();await page.getByLabel("曲名で探す").fill(" B");await expect(page.locator(".bass-song")).toHaveCount(1);
  await expect(page.getByRole("button",{name:"合成ベース B を試聴",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"合成ベース B 操作",exact:true}).click();await expect(page.getByLabel("新しい曲名")).toHaveValue("合成ベース B");
});

test("P13.1 §4 permission recovery uses the unchanged lazy enable path",async({page})=>{
  await syntheticMicrophone(page,false,true);await openSyntheticBass(page);
  const view=page.getByTestId("midi-bass-practice");
  await view.getByRole("button",{name:"● 録って弾く",exact:true}).click();
  await expect(view).toHaveAttribute("data-stage-step","1");
  await expect(view).toContainText("マイクの使用が許可されませんでした。");
  await view.getByRole("button",{name:"● もう一度",exact:true}).click();
  await expect(view).toHaveAttribute("data-stage-step","2",{timeout:15000});
  await expect(page.getByTestId("midi-bass-result")).toContainText("4 / 4");
});
test("P13.1 §6 visible Bass input/select colors use the shared surface tokens",async({page})=>{
  await openSyntheticBass(page);await page.locator(".bass-mode-tools").getByRole("button",{name:/4弦/}).click();
  // P23-62: the practice names are Japanese now (the helper still accepts the old English ones).
  for(const mode of ["度数","リズム","コード進行のベース","ルートの動き","MIDI のベースライン"]){
    await openBassPractice(page, mode);
    if(mode==="MIDI のベースライン" && await page.getByTestId("midi-bass-library").isVisible()){
      await page.getByTestId("midi-bass-library").getByRole("button",{name:"合成ベース A",exact:true}).click();
      await expect(page.getByTestId("midi-bass-practice")).toBeVisible();
    }
    // P23-62/P23-64: the stage practices keep their own fields in the top band's 「条件」 / 「判定」 popover. Open it so the same controls are the ones measured here.
    const conditions=CONDITION_CHIPS[mode];if(conditions)await page.getByTestId(conditions).click();
    // P23-25: the practice screen no longer runs past the window, so the pointer can come to rest on a field
    // after the card click. Park it away and let the 0.12s border transition finish before reading the colours:
    // the hover state has its own rules, and this check is about the resting surface tokens.
    await page.mouse.move(0, 0);
    const fields=page.locator('.bass-practice-shell select, .bass-practice-shell input:not([type=checkbox]):not([type=radio]):not([type=file])');
    await fields.evaluateAll(els=>Promise.all(els.flatMap(el=>el.getAnimations().map(animation=>animation.finished.catch(()=>undefined)))));
    const colors=await fields.evaluateAll(els=>{
      const probe=document.createElement("span");probe.style.background="var(--lv-well)";probe.style.border="1px solid var(--lv-line)";document.body.append(probe);const expected=getComputedStyle(probe);const bg=expected.backgroundColor,border=expected.borderTopColor;probe.remove();
      return els.filter(el=>el.getClientRects().length>0).map(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderTopColor,expectedBackground:bg,expectedBorder:border};});
    });expect(colors.length).toBeGreaterThan(0);for(const c of colors){expect(c.background).toBe(c.expectedBackground);expect(c.border).toBe(c.expectedBorder);}
  }
});
