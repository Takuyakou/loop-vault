import { expect, test } from "@playwright/test";
import { openSyntheticBass, syntheticMicrophone, recordSyntheticBass, syntheticBassMidi } from "./helpers/bass-ui";
import { assertNoHorizontalOverflow } from "./helpers/app";

test("P13.1 §4 MIDI rail shows state only and never requests audio on render", async ({ page }) => {
  await syntheticMicrophone(page);
  await openSyntheticBass(page);
  const rail = page.getByTestId("record-compare").filter({ visible: true });
  await expect(rail.getByRole("heading", { name: "録音", exact: true })).toBeVisible();
  await expect(rail.getByLabel("入力チャンネル", { exact: true })).toBeVisible();
  await expect(rail.getByText("入力レベル", { exact: true })).toBeVisible();
  expect(await rail.innerText()).not.toContain("Record & Compare");
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { bassSyntheticRequests: number }).bassSyntheticRequests)).toBe(0);
  for (const name of ["録って弾く", "停止", "もう一度録る", "録音せず続ける", "Record & Compareを使う"]) {
    await expect(rail.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await recordSyntheticBass(page);
  await expect(rail.getByTestId("record-keep")).toBeEnabled();
  await expect(rail.getByTestId("record-discard")).toBeEnabled();
  await expect(rail.getByTestId("listen-choice")).toHaveCount(0);
  await rail.getByTestId("record-discard").click();
  await expect(rail).toHaveAttribute("data-record-state", "discarded");
  await page.getByTestId("midi-bass-practice").getByRole("button", {name:"● もう一度録る（R）",exact:true}).click();
  await expect(rail).toHaveAttribute("data-record-state","counting-in");
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"次の区間",exact:true}).click();
  await page.getByTestId("midi-bass-practice").getByRole("button",{name:"● 録って弾く（R）",exact:true}).click();
  await expect(rail).toHaveAttribute("data-record-state","counting-in");await page.keyboard.press("Escape");
});

test("P13.1 §2 §3 §9 compact task, adjacent actions and three equal steps", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSyntheticBass(page);
  const geometry = await page.getByTestId("midi-bass-practice").evaluate(el => {
    const task = el.querySelector(".bass-midi-task")!.getBoundingClientRect();
    const lanes = el.querySelector(".bass-midi-lanes")!.getBoundingClientRect();
    const actions = el.querySelector(".bass-midi-actions")!.getBoundingClientRect();
    const steps = el.querySelector("ol")!.getBoundingClientRect();
    return { taskHeight: task.height, actionGap: actions.top - lanes.bottom, stepRightDelta: steps.right - task.right };
  });
  console.log("P13.1 practice px", geometry);
  expect(geometry.taskHeight).toBeLessThanOrEqual(140);
  expect(geometry.actionGap).toBeGreaterThanOrEqual(8);
  expect(geometry.actionGap).toBeLessThanOrEqual(12);
  expect(Math.abs(geometry.stepRightDelta)).toBeLessThanOrEqual(2);
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
    const width = await page.locator(".bass-midi-lanes-inner").evaluate(el => el.getBoundingClientRect().width);
    console.log("P13.1 all lane px", { fret, width });
    expect(width).toBeGreaterThanOrEqual(32 * (fret ? 64 : 48));
    await page.locator(".bass-midi-lanes").evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await expect(page.locator(".bass-midi-bars").getByText("8小節", { exact: true })).toBeInViewport();
    expect(await page.locator(".bass-midi-note, .bass-midi-note-text").evaluateAll(els => els.every(el => el.scrollWidth <= el.clientWidth))).toBe(true);
    expect(await page.locator(".bass-midi-note").evaluateAll(els => els.every(el => /弦 \d/.test(el.getAttribute("title")??"") && /弦 \d/.test(el.getAttribute("aria-label")??"")))).toBe(true);
    await assertNoHorizontalOverflow(page);
  }
  expect(await page.getByTestId("midi-bass-practice").innerText()).not.toMatch(/\b[A-G]b\d/);
  const g = await page.getByTestId("midi-bass-practice").evaluate(el => {
    const content = el.querySelector(".bass-midi-content")!;
    return { client: content.clientHeight, scroll: content.scrollHeight, contentBottom: content.getBoundingClientRect().bottom, actionTop: el.querySelector(".bass-midi-actions")!.getBoundingClientRect().top };
  });
  console.log("P13.1 long content px", g);
  expect(g.scroll).toBeGreaterThan(g.client);
  expect(g.actionTop).toBeGreaterThanOrEqual(g.contentBottom);
});

test("P13.1 §7 accompaniment lane and chip follow actual data", async ({ page }) => {
  await openSyntheticBass(page, false);
  await expect(page.getByLabel("伴奏の段", { exact: true })).toHaveCount(0);
  await expect(page.locator(".bass-midi-actions").getByRole("button", { name: "伴奏", exact: true })).toHaveCount(0);
});

for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }]) {
  test(`P13.1 §1 §10 result without scroll and primary actions ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await syntheticMicrophone(page, true);
    await openSyntheticBass(page);
    await recordSyntheticBass(page);
    const g = await page.getByTestId("midi-bass-practice").evaluate(el => {
      const content = el.querySelector(".bass-midi-content")!.getBoundingClientRect();
      const result = el.querySelector('[data-testid="midi-bass-result"]')!.getBoundingClientRect();
      const own = el.querySelector('[aria-label="自分の段"]')!.getBoundingClientRect();
      const actions = el.querySelector(".bass-midi-actions")!.getBoundingClientRect();
      return { top: content.top, bottom: content.bottom, resultTop: result.top, resultBottom: result.bottom, ownBottom: own.bottom, actionHeight: actions.height };
    });
    console.log(`P13.1 result ${size.width} px`, g);
    expect(g.resultTop).toBeGreaterThanOrEqual(g.top);
    expect(g.resultBottom).toBeLessThanOrEqual(g.bottom + 1);
    if (size.width >= 1440) expect(g.ownBottom).toBeLessThanOrEqual(g.bottom + 1);
    if (size.width === 1440) expect(g.actionHeight).toBeLessThanOrEqual(60);
    await expect(page.getByTestId("midi-bass-result")).toContainText("音が違う 1");
    await expect(page.getByTestId("midi-bass-result")).toContainText("抜け 1");
    await expect(page.getByTestId("midi-bass-result")).toContainText("余分な音 1");
    expect(await page.locator(".bass-midi-note-text").evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth))).toBe(true);
    await expect(page.locator(".bass-midi-actions .lv-button-primary")).toHaveCount(1);
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
  const settings=page.locator(".bass-settings-shortcuts").getByRole("button",{name:/4弦/});
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
  const view=page.getByTestId("midi-bass-practice"),rail=page.getByTestId("record-compare").filter({visible:true});
  await view.getByRole("button",{name:"● 録って弾く（R）",exact:true}).click();await expect(rail).toHaveAttribute("data-record-state","permission-denied");
  await recordSyntheticBass(page);await expect(rail).toHaveAttribute("data-record-state","recorded");
});
test("P13.1 §6 visible Bass input/select colors use the shared surface tokens",async({page})=>{
  await openSyntheticBass(page);await page.locator(".bass-settings-shortcuts").getByRole("button",{name:/4弦/}).click();
  for(const mode of ["Degree Echo","Rhythm Echo","Bassline Echo","Root Motion Echo","MIDI のベースライン"]){
    await page.getByRole("tab",{name:mode,exact:true}).click();
    const colors=await page.locator('.bass-practice-shell select, .bass-practice-shell input:not([type=checkbox]):not([type=radio]):not([type=file])').evaluateAll(els=>{
      const probe=document.createElement("span");probe.style.background="var(--lv-bg-subtle)";probe.style.border="1px solid var(--lv-border-strong)";document.body.append(probe);const expected=getComputedStyle(probe);const bg=expected.backgroundColor,border=expected.borderTopColor;probe.remove();
      return els.filter(el=>el.getClientRects().length>0).map(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderTopColor,expectedBackground:bg,expectedBorder:border};});
    });expect(colors.length).toBeGreaterThan(0);for(const c of colors){expect(c.background).toBe(c.expectedBackground);expect(c.border).toBe(c.expectedBorder);}
  }
});
