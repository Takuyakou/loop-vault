import { expect, test, type Page } from "@playwright/test";
import { openDojo } from "./helpers/p12";

interface Midi { emit: (notes: number[], on?: boolean, spread?: number) => void; connect: () => Promise<void> }
const midi = (page: Page, notes: number[], on = true, spread = 30) =>
  page.evaluate(({ notes, on, spread }) => (window as unknown as { __p12Midi: Midi }).__p12Midi.emit(notes, on, spread), { notes, on, spread });

/** Opens 「耳で弾く」 from the Chord Dojo home and starts level 1, 4 bars. */
async function start(page: Page, options: { level?: number; length?: 4 | 8 | 16; mode?: string; includeExtra?: boolean } = {}) {
  await openDojo(page, options.mode ?? "midi");
  await page.getByTestId("ear-open").click();
  await expect(page.getByTestId("ear-start")).toBeVisible();
  if (options.level) await page.getByTestId(`ear-level-${options.level}`).click();
  if (options.length) await page.getByTestId(`ear-length-${options.length}`).click();
  if (options.includeExtra !== undefined) {
    await page.getByText("詳しい設定", { exact: true }).click();
    await page.getByTestId("ear-extra").setChecked(options.includeExtra);
  }
  await page.getByTestId("ear-start").click();
  await expect(page.getByTestId("ear-run")).toBeVisible();
}

/** The notes of the chord `index` of the question on the screen (the fixture build gives them to the test). */
const answerOf = (page: Page, index: number): Promise<number[]> =>
  page.evaluate((chord) => (window as unknown as { __earAnswer: (index: number) => number[] }).__earAnswer(chord), index);
const chordCount = (page: Page): Promise<number> => page.evaluate(() => {
  const ask = (window as unknown as { __earAnswer: (index: number) => number[] | undefined }).__earAnswer;
  let count = 0;
  while (ask(count)) count += 1;
  return count;
});

const toPlay = async (page: Page) => {
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
};

async function playRight(page: Page, index: number, last = false) {
  const notes = await answerOf(page, index);
  await midi(page, notes, true, 30);
  // after the last chord the cards give way to the result
  if (last) await expect(page.getByTestId("ear-result")).toBeVisible({ timeout: 4000 });
  else await expect(page.getByTestId(`ear-card-${index}`)).toHaveAttribute("data-done", "true", { timeout: 4000 });
  await midi(page, notes, false, 0);
}

test("P16-02: 入口から選ぶ画面が開き、出題用の進行の数が出る(追加の進行を含む)", async ({ page }) => {
  await openDojo(page);
  await page.getByTestId("ear-open").click();
  await expect(page.getByTestId("ear-start")).toBeVisible();
  await expect(page.getByTestId("ear-count")).toContainText("出題用の進行 417(追加 357 を含む)");
  // the details are closed: open and switch the added progressions off
  await page.getByText("詳しい設定").click();
  await page.getByTestId("ear-extra").uncheck();
  await expect(page.getByTestId("ear-count")).toContainText("出題用の進行 60");
  await page.getByTestId("ear-length-16").click();
  // 16 bars: level 1 has 2 of the first 60 and 8 with the added ones; the old note about "fewer" is gone
  await expect(page.getByTestId("ear-count")).toContainText("このレベル・長さでは 2 個");
  await page.getByTestId("ear-extra").check();
  await expect(page.getByTestId("ear-count")).toContainText("出題用の進行 417(追加 357 を含む) ・ このレベル・長さでは 8 個");
  await expect(page.getByTestId("ear-count")).not.toContainText("少なめ");
  await page.screenshot({ path: "p89-generated/P16-05/choose-16-bars.png" });
  // back to the Dojo home with the back button and Esc
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("ear-open")).toBeVisible();
});

test("P16-02: 1周聴く間は答えにならず、「弾き始める」で1コードずつ弾く。名前は練習中に出ない", async ({ page }) => {
  await start(page);
  const run = page.getByTestId("ear-run");
  await expect(run).toHaveAttribute("data-phase", "listen");
  // a card lights while the lap sounds
  await expect(page.locator("[data-lap]").first()).toBeVisible({ timeout: 4000 });
  // keys played during the lap are not an answer
  await midi(page, await answerOf(page, 0), true, 30);
  await page.waitForTimeout(700);
  await midi(page, await answerOf(page, 0), false, 0);
  await expect(page.getByTestId("ear-feedback")).toHaveCount(0);
  await toPlay(page);
  // the names of the progression are not on the screen (only 「耳の課題 NNN」)
  await expect(page.getByTestId("ear-title")).toContainText(/^耳の課題 \d{3}・レベル1・4小節$/);
  const text = await page.getByTestId("ear-run").innerText();
  // none of the names the data gives a progression (they tell the answer) is on the screen
  for (const word of ["ii–V–I", "ダイアトニック", "セカンダリードミナント", "クリシェ", "サブドミナントマイナー", "王道", "カノン", "借用コード"]) expect(text).not.toContain(word);
});

test("P16-02: 1つ目のコード名を見せる設定のオン・オフで、1枚目とキーの表示が変わる", async ({ page }) => {
  await openDojo(page);
  await page.getByTestId("ear-open").click();
  await page.getByText("詳しい設定").click();
  await page.getByTestId("ear-first-name").uncheck();
  await page.getByTestId("ear-start").click();
  await expect(page.getByTestId("ear-card-name-0")).toHaveText("?");
  await expect(page.getByTestId("ear-key")).toHaveCount(0); // without the first name the key is not told either
  await page.keyboard.press("Escape");
  await page.getByText("詳しい設定").click();
  await page.getByTestId("ear-first-name").check();
  await page.getByTestId("ear-start").click();
  await expect(page.getByTestId("ear-card-name-0")).not.toHaveText("?");
  await expect(page.getByTestId("ear-key")).toContainText("キー");
  await expect(page.getByTestId("ear-key")).toContainText("1つ目");
  await expect(page.getByTestId("ear-card-0")).toContainText("最初から表示");
});

test("P16-02: 合うと次へ。違うと同じカードのまま「弾き直し」の印が付く。聴き直しは印を付けない", async ({ page }) => {
  await start(page);
  await toPlay(page);
  // listening again leaves nothing
  await page.getByTestId("ear-listen-chord").click();
  await page.getByTestId("ear-listen-pair").click();
  await page.getByTestId("ear-listen-lap").click();
  await expect(page.getByTestId("ear-card-0").locator(".ear-mark")).toHaveCount(0);
  await expect(page.getByTestId("ear-stats")).toContainText("聴き直し 3回");
  // card 1 (the second): a wrong chord → 弾き直し and the same card
  await playRight(page, 0);
  await expect(page.getByTestId("ear-card-1")).toHaveAttribute("data-current", "true");
  await midi(page, [40, 44, 47, 51], true, 30);
  await expect(page.getByTestId("ear-feedback")).toContainText("余分な音", { timeout: 4000 });
  await expect(page.getByTestId("ear-card-1")).toHaveAttribute("data-current", "true");
  await expect(page.getByTestId("ear-card-1").locator("[data-mark='retry']")).toBeVisible();
  await midi(page, [40, 44, 47, 51], false, 0);
  await playRight(page, 1);
  await expect(page.getByTestId("ear-card-2")).toHaveAttribute("data-current", "true");
  // the name appears once it is right; the first card has no ✓ (it was shown from the start)
  await expect(page.getByTestId("ear-card-name-1")).not.toHaveText("?");
  await expect(page.getByTestId("ear-card-1").locator("[data-mark='retry']")).toBeVisible();
  await expect(page.getByTestId("ear-card-1")).toContainText(/\d\.\ds/);
});

test("P16-02: ヒントは1段ずつ(名前 → 鍵盤)。ヒントのあとも弾いて合うまで進まない", async ({ page }) => {
  await start(page);
  await toPlay(page);
  await playRight(page, 0);
  await expect(page.getByTestId("ear-card-name-1")).toHaveText("?");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("ear-card-name-1")).not.toHaveText("?");
  await expect(page.getByTestId("ear-card-1").locator("[data-mark='name']")).toBeVisible();
  await expect(page.locator(".ear-keyboard [data-answer], .ear-keyboard [data-guide]")).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("ear-card-1").locator("[data-mark='key']")).toBeVisible();
  await expect(page.getByTestId("ear-score").locator("[data-tone='answer']").first()).toBeVisible();
  // still on the same card until it is played
  await expect(page.getByTestId("ear-card-1")).toHaveAttribute("data-current", "true");
  await playRight(page, 1);
  await expect(page.getByTestId("ear-card-2")).toHaveAttribute("data-current", "true");
});

test("P16-02: 楽譜に押している音がその場で出て、合うと「鳴った音」が名前つきで出て、次を押し始めると消える", async ({ page }) => {
  await start(page);
  await toPlay(page);
  const notes = await answerOf(page, 0);
  // one key is not an answer (two names would be: a mistake or the answer)
  await midi(page, notes.slice(0, 1), true, 0);
  await expect(page.getByTestId("ear-score").locator("[data-tone='held']")).toHaveCount(1);
  await midi(page, notes.slice(0, 1), false, 0);
  await expect(page.getByTestId("ear-score").locator("[data-tone='held']")).toHaveCount(0);
  await midi(page, notes, true, 30);
  await expect(page.getByTestId("ear-card-0")).toHaveAttribute("data-done", "true", { timeout: 4000 });
  await midi(page, notes, false, 0);
  await expect(page.getByTestId("ear-score")).toContainText("鳴った音");
  await expect(page.getByTestId("ear-score").locator("[data-tone='sounded']")).not.toHaveCount(0);
  await midi(page, [60], true, 0);
  await expect(page.getByTestId("ear-score").locator("[data-tone='sounded']")).toHaveCount(0);
  await midi(page, [60], false, 0);
});

test("P16-02: 最後まで弾くと結果が出て、一発の数・秒数の中央値が出る(最初から見えていたコードは数えない)", async ({ page }) => {
  await start(page);
  await toPlay(page);
  const count = await chordCount(page);
  for (let index = 0; index < count; index += 1) await playRight(page, index, index === count - 1);
  await expect(page.getByTestId("ear-result")).toBeVisible();
  await expect(page.getByTestId("ear-summary-first")).toHaveText(new RegExp(`^\\d+ / ${count - 1}$`));
  await expect(page.getByTestId("ear-summary-median")).toContainText("s");
  await expect(page.getByTestId("ear-result-card-0")).toContainText("最初から表示");
  // the name of the progression is told here (when it has one)
  await page.getByTestId("ear-again").click();
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "listen");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ear-start")).toBeVisible();
});

test("P16-02: MIDI が無いときは「答え合わせ」→「弾けた(Y)/まだ(N)」で進められる", async ({ page }) => {
  await start(page, { mode: "no-midi" });
  await expect(page.getByTestId("ear-no-midi")).toBeVisible();
  await toPlay(page);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("ear-self-yes")).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.getByTestId("ear-feedback")).toContainText("もう一度");
  await expect(page.getByTestId("ear-card-0").locator("[data-mark]")).toHaveCount(0);
  const cards = await page.locator("[data-testid^='ear-card-']:not([data-testid^='ear-card-name'])").count();
  for (let index = 0; index < cards; index += 1) {
    await page.keyboard.press("Space");
    await page.keyboard.press("y");
  }
  await expect(page.getByTestId("ear-result")).toBeVisible();
  await expect(page.getByTestId("ear-summary-first")).toHaveText("0 / 0");
  await expect(page.getByTestId("ear-summary-median")).toHaveText("—");
});

test("P16-02: 入力欄にフォーカスがあるとき、キーは効かない", async ({ page }) => {
  await openDojo(page);
  await page.getByTestId("ear-open").click();
  await page.getByTestId("ear-bpm").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-start")).toBeVisible();
  await expect(page.getByTestId("ear-run")).toHaveCount(0);
});

for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 768, height: 640 }]) {
  test(`P16-02: ${size.width}×${size.height} でページがスクロールせず、鍵盤の全体が見え、楽譜の枠の高さが変わらない`, async ({ page }) => {
    await page.setViewportSize(size);
    await start(page, { level: 3, length: 8 });
    await toPlay(page);
    await page.waitForTimeout(400);
    const measure = () => page.evaluate(() => {
      const main = document.getElementById("main-content")!;
      const keyboard = document.querySelector("[data-testid='ear-keyboard']")!.getBoundingClientRect();
      const score = document.querySelector("[data-testid='ear-score']")!.getBoundingClientRect();
      const svg = document.querySelector("[data-testid='ear-keyboard'] svg")!.getBoundingClientRect();
      const keys = [...document.querySelectorAll("[data-testid='ear-keyboard'] [data-midi-note]")];
      const white = keys.find((key) => key.getAttribute("data-key-color") === "white" || /white/.test(key.className?.toString() ?? ""));
      return {
        overflow: main.scrollHeight - main.clientHeight,
        pageOverflow: document.documentElement.scrollHeight - innerHeight,
        keyboardBottom: keyboard.bottom,
        viewport: innerHeight,
        svgRight: svg.right,
        viewportWidth: innerWidth,
        scoreTop: score.top,
        scoreHeight: score.height,
        whiteWidth: white ? white.getBoundingClientRect().width : 0,
      };
    });
    const before = await measure();
    expect(before.overflow).toBeLessThanOrEqual(1);
    expect(before.pageOverflow).toBeLessThanOrEqual(1);
    expect(before.keyboardBottom).toBeLessThanOrEqual(before.viewport);
    expect(before.svgRight).toBeLessThanOrEqual(before.viewportWidth);
    // press many keys: the frame of the staff and the position of the keyboard do not move
    await midi(page, [40, 47, 52, 56, 59, 63, 66, 70], true, 0);
    await page.waitForTimeout(200);
    const after = await measure();
    expect(after.scoreHeight).toBe(before.scoreHeight);
    expect(after.scoreTop).toBe(before.scoreTop);
    expect(after.keyboardBottom).toBe(before.keyboardBottom);
    await midi(page, [40, 47, 52, 56, 59, 63, 66, 70], false, 0);
    // the staff is drawn large enough to read: the lines are 6 px apart or more at 768, 8 px at 1440
    const spacing = await page.evaluate(() => {
      const lines = [...document.querySelectorAll("[data-testid='ear-score'] [data-score-staff='treble'] line")];
      const first = lines[0]!.getBoundingClientRect();
      const second = lines[1]!.getBoundingClientRect();
      return Math.abs(first.top - second.top);
    });
    expect(spacing).toBeGreaterThanOrEqual(size.width >= 1440 ? 8 : size.width >= 1280 ? 7 : 6);
    // the two staves are four line-spacings apart or more, and the treble clef stays above the bass staff
    const gap = await page.evaluate(() => {
      const tops = (staff: string) => [...document.querySelectorAll(`[data-testid='ear-score'] [data-score-staff='${staff}'] line`)].map((line) => line.getBoundingClientRect().top);
      const trebleBottom = Math.max(...tops("treble"));
      const bassTop = Math.min(...tops("bass"));
      const clef = document.querySelector("[data-testid='ear-score'] path.dojo-score-clef")!.getBoundingClientRect();
      return { gap: bassTop - trebleBottom, clefBottom: clef.bottom, bassTop };
    });
    expect(gap.gap).toBeGreaterThanOrEqual(4 * spacing - 0.5);
    expect(gap.clefBottom).toBeLessThanOrEqual(gap.bassTop);
    // the keyboard starts at C2 (the bass is never lower)
    expect(Number(await page.getByTestId("ear-keyboard").getAttribute("data-range-min"))).toBe(36);
    // the heading of the staff keeps the button on one line; at 1023 px and under it is 「楽譜」 alone
    const head = await page.evaluate(() => {
      const zoom = document.querySelector("[data-testid='ear-score-zoom']")!.getBoundingClientRect();
      return { zoomHeight: zoom.height, titleText: (document.querySelector(".ear-score-head b") as HTMLElement).innerText };
    });
    expect(head.zoomHeight).toBeLessThanOrEqual(30);
    if (size.width <= 1023) expect(head.titleText).toBe("楽譜");
    // the staff frame follows the width of the window
    expect(before.scoreHeight).toBeGreaterThanOrEqual(size.width >= 1280 ? 235 : size.width >= 1024 ? 195 : 125);
    await page.screenshot({ path: `p89-generated/P16-02/practice-${size.width}x${size.height}.png` });
  });
}

test("P16-02: 16小節では今のカードの前後だけを出し、位置の帯が全体を示す", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 640 });
  // This windowing contract needs sixteen cards, not merely sixteen bars.
  // The extra bank legitimately includes a 16-bar / 17-chord progression.
  // Both core level-1 16-bar fixtures have exactly sixteen cards.
  await start(page, { level: 1, length: 16, includeExtra: false });
  await toPlay(page);
  await expect(page.getByTestId("ear-cards")).toHaveAttribute("data-windowed", "true");
  await expect(page.getByTestId("ear-position").locator(".ear-dot")).toHaveCount(16);
  await expect(page.getByTestId("ear-card-0")).toBeVisible();
  for (let index = 0; index < 6; index += 1) await playRight(page, index);
  await expect(page.getByTestId("ear-card-6")).toHaveAttribute("data-current", "true");
  await expect(page.getByTestId("ear-card-6")).toBeVisible();
  await expect(page.getByTestId("ear-card-0")).toHaveCount(0);
  await expect(page.getByTestId("ear-position")).toContainText("7 / 16");
});

test("P16-02: 鍵盤の範囲は問題の間は動かず、範囲の外を押すと端に印が出る。◀ ▶ で動かせる", async ({ page }) => {
  await start(page);
  await toPlay(page);
  const keyboard = page.getByTestId("ear-keyboard");
  const min = await keyboard.getAttribute("data-range-min");
  const max = await keyboard.getAttribute("data-range-max");
  await midi(page, [20], true, 0);
  await expect(page.getByTestId("ear-outside-low")).toBeVisible();
  await midi(page, [20], false, 0);
  await midi(page, [110], true, 0);
  await expect(page.getByTestId("ear-outside-high")).toBeVisible();
  await midi(page, [110], false, 0);
  expect(await keyboard.getAttribute("data-range-min")).toBe(min);
  expect(await keyboard.getAttribute("data-range-max")).toBe(max);
  await page.getByTestId("ear-range-up").click();
  expect(Number(await keyboard.getAttribute("data-range-min"))).toBe(Number(min) + 12);
  // the keyboard has octave marks
  await expect(keyboard.locator("[data-c-label]").first()).toBeVisible();
});

test("P16-02: 楽譜の「拡大」を開いて閉じても、今のカードと印は変わらず、拡大している間も答えられる", async ({ page }) => {
  await start(page);
  await toPlay(page);
  await playRight(page, 0);
  await page.getByTestId("ear-score-zoom").click();
  await expect(page.getByTestId("ear-score")).toHaveAttribute("data-open", "true");
  await expect(page.getByTestId("ear-card-1")).toHaveAttribute("data-current", "true");
  await playRight(page, 1);
  await expect(page.getByTestId("ear-card-2")).toHaveAttribute("data-current", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ear-score")).not.toHaveAttribute("data-open", "true");
  await expect(page.getByTestId("ear-run")).toBeVisible();
  await expect(page.getByTestId("ear-card-1").locator(".ear-mark")).toHaveCount(1);
});
