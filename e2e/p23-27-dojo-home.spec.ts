import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { homeFixture } from "./helpers/p12DojoHome";
import { openDojo } from "./helpers/p12";
import { assertNoHorizontalOverflow } from "./helpers/app";

/**
 * P23-27: the Chord Dojo home — two columns (the resume band and the four big cards on the left, the four small
 * cards on the right), the pictures, the numbers and the entries. C1-C4 of the instruction.
 */
const at = "2026-11-08T00:00:00.000Z";
const recentFile = () => ({
  version: 1,
  entries: [
    { kind: "standard", id: "ii-v-i-major", key: 0, random: false, at },
    { kind: "jazz", id: "jazz-progressions-001", stage: "recall", key: 3, random: false, at },
    { kind: "drill", id: "cycle-a", stage: "see", key: 0, random: false, at },
  ],
});

async function seedHome(page: Page, withRecent: boolean) {
  await page.addInitScript((file) => localStorage.setItem("loop-vault:chord-dojo-txt-jazz-v1:data", JSON.stringify(file)), homeFixture("many"));
  if (withRecent) await page.addInitScript((value) => localStorage.setItem("loop-vault:dojo-recent:v1", JSON.stringify(value)), recentFile());
}

test("C1/C2: the two columns, the resume band, the pictures and the right column (H1-H8)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedHome(page, true);
  await openDojo(page, "no-midi");
  const home = page.getByTestId("dojo-home");

  // H1: two columns; the resume band and the MIDI note sit above both.
  await expect(home.locator(".dojo-home-p20-body")).toHaveCount(1);
  await expect(home.locator(".dojo-home-p20-body .dojo-home-p20-left .dojo-home-p20-main")).toHaveCount(1);
  await expect(home.locator(".dojo-home-p20-body .dojo-home-p20-sub")).toHaveCount(1);
  const left = (await home.locator(".dojo-home-p20-left").boundingBox())!;
  const sub = (await home.locator(".dojo-home-p20-sub").boundingBox())!;
  expect(Math.round(sub.width)).toBeGreaterThanOrEqual(320);
  expect(Math.round(sub.width)).toBeLessThanOrEqual(340);
  expect(sub.x - (left.x + left.width)).toBeGreaterThanOrEqual(8);
  expect(sub.x - (left.x + left.width)).toBeLessThanOrEqual(24);
  const resume = (await home.getByTestId("home-resume").boundingBox())!;
  expect(resume.x).toBeLessThanOrEqual(left.x);
  expect(resume.width).toBeGreaterThanOrEqual(left.width + sub.width);

  // H2: the CD mark, the label, the title, the Enter key inside the button, the recent two, the primary.
  const band = home.getByTestId("home-resume");
  await expect(band.locator(".dojo-home-p20-mark")).toHaveText("CD");
  await expect(band).toContainText("続きから");
  await expect(band).toContainText("定番の進行");
  await expect(band.getByTestId("home-recent-0")).toBeVisible();
  await expect(band.getByTestId("home-recent-1")).toBeVisible();
  const go = band.getByTestId("home-resume-go");
  await expect(go).toHaveAttribute("data-primary", "true");
  await expect(go).toContainText("続ける");
  await expect(go).toContainText("Enter");
  const radius = await band.evaluate((element) => getComputedStyle(element).borderRadius);
  expect(radius).toBe("14px");
  expect(resume.height).toBeGreaterThanOrEqual(52);
  expect(resume.height).toBeLessThanOrEqual(80);

  // H3: the MIDI note is a thin line.
  const banner = (await home.getByTestId("home-midi-banner").boundingBox())!;
  expect(banner.height).toBeGreaterThanOrEqual(28);
  expect(banner.height).toBeLessThanOrEqual(48);
  await expect(home.getByTestId("home-midi-banner")).toContainText("MIDI 設定");

  // H4: four practice cards (P23-47-fix-4: the guide is its own wide card under them); the picture is 130 wide; the
  // title 17px; the big number 22px in the mono font; a chevron.
  await expect(home.locator(".dojo-home-p20-main > *")).toHaveCount(4);
  await expect(home.locator(".dojo-home-p20-left > [data-testid=home-guide]")).toHaveCount(1);
  const standard = home.getByTestId("home-standard");
  const art = (await standard.locator(".dojo-home-art-box").boundingBox())!;
  expect(Math.round(art.width)).toBe(130);
  expect(await standard.locator("h2").evaluate((element) => getComputedStyle(element).fontSize)).toBe("17px");
  expect(await standard.locator("h2 .dojo-home-chev").count()).toBe(1);
  // P23-47-fix-4: 定番の進行 has no single big number (its two lists are two rows with their own numbers and segments);
  // the big number is looked at on the 2-5-1 card.
  const bigNumber = await home.getByTestId("home-master").locator(".dojo-home-p20-stat b").evaluate((element) => [getComputedStyle(element).fontSize, getComputedStyle(element).fontFamily]);
  expect(bigNumber[0]).toBe("22px");
  expect(bigNumber[1]).toContain("mono");
  await expect(standard.locator(".dojo-home-p20-row")).toHaveCount(2);
  await expect(standard.locator(".dojo-home-p20-pips")).toHaveCount(2);
  await expect(standard.getByTestId("home-open-jazz")).toBeVisible();
  await expect(standard.getByTestId("home-open-original")).toBeVisible();

  // H5: every card has its own drawing, and the 2-5-1 picture has 48 cells.
  for (const id of ["home-standard", "home-master", "home-ear", "home-drill"]) {
    await expect(home.getByTestId(id).locator(".dojo-home-art-box svg")).toHaveCount(1);
  }
  const states = await home.getByTestId("home-master-art").evaluate((svg) => {
    const counts: Record<string, number> = {};
    for (const rect of svg.querySelectorAll("rect[data-state]")) counts[rect.getAttribute("data-state")!] = (counts[rect.getAttribute("data-state")!] ?? 0) + 1;
    return counts;
  });
  expect(Object.values(states).reduce((sum, value) => sum + value, 0)).toBe(48);
  // C2: the MASTER squares are the MASTER count written next to them.
  const mastered = Number((await home.getByTestId("home-master").locator(".dojo-home-p20-stat b").innerText()).split("/")[0]!.trim());
  expect(states.master ?? 0).toBe(mastered);

  // H6: the 2-5-1 card keeps its button, says what 続きから opens next, and keeps the range line.
  // P23-47-fix-4: the Form A–D row is not on the home (Form is chosen inside 2-5-1 Master).
  await expect(home.getByRole("button", { name: "2-5-1 Master 続きから" })).toBeVisible();
  await expect(home.getByTestId("home-master").locator(".master251-counts button")).toHaveCount(0);
  await expect(home.getByTestId("home-master-next")).toHaveText(/^次(Form [A-D] ・ .+|復習 ・ .+|Mixed Test)$/);
  await expect(home.getByTestId("home-master").getByTestId("master-range-label")).toBeVisible();

  // H7: the right column's order and contents.
  expect(await home.locator(".dojo-home-p20-sub > *").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid"))))
    .toEqual(["home-today", "home-shape", "home-saved", "home-wanted"]);
  await expect(home.getByTestId("home-today")).toContainText("今日のおまかせ");
  await expect(home.getByTestId("home-today")).toContainText("目安");
  await expect(home.getByTestId("dojo-theme")).toBeVisible();
  await expect(home.getByTestId("home-today").locator(".dojo-home-today-flows > div")).toHaveCount(4);
  const start = home.getByTestId("practice-start");
  await expect(start).toBeVisible();
  await expect(start).toBeEnabled();
  // P23-47-fix-4: 始める is the filled button (the adopted mock), the same colour as 続ける.
  const startColor = await start.evaluate((element) => getComputedStyle(element).backgroundColor);
  const primaryColor = await go.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(startColor).toBe(primaryColor);
  await home.getByTestId("home-today-details").click();
  await expect(home.getByTestId("home-today-details-body")).toBeVisible();
  await expect(home.getByTestId("home-today-details")).toHaveText("閉じる");
  await home.getByTestId("home-today-details").click();
  await expect(home.getByTestId("home-today-details-body")).toHaveCount(0);
  await expect(home.getByTestId("home-shape")).toContainText("コードの型");
  await expect(home.getByTestId("home-shape")).toContainText("一覧");
  await expect(home.getByTestId("home-shape-keys").locator(".dojo-key-status")).toHaveCount(12);
  await expect(home.getByTestId("home-saved")).toContainText("Vault の進行で練習");
  await expect(home.getByTestId("home-wanted")).toContainText("使いたい");

  // H8: P23-67 — the 「よく使う練習 押すと開きます」 heading is gone (the only heading left is the guide's 「順番に学ぶ」),
  // and the old 「そのほか」 heading with it.
  await expect(home).not.toContainText("よく使う練習");
  await expect(home).not.toContainText("押すと開きます");
  await expect(home.locator(".dojo-home-p20-section-title")).toHaveCount(1);
  await expect(home.locator(".dojo-home-p20-section-title")).toContainText("順番に学ぶ");
  await expect(home.getByText("そのほか", { exact: true })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
});

test("C3: every old entry is still on the home and pressable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedHome(page, true);
  await openDojo(page, "no-midi");
  const home = page.getByTestId("dojo-home");
  const entries: [string, ReturnType<Page["getByTestId"]>][] = [
    ["続ける", home.getByTestId("home-resume-go")],
    ["最近 1", home.getByTestId("home-recent-0")],
    ["最近 2", home.getByTestId("home-recent-1")],
    ["定番の進行", home.getByTestId("home-standard").getByRole("button", { name: "定番の進行", exact: true })],
    ["Jazz Progressions", home.getByTestId("home-open-jazz")],
    ["Original Practice", home.getByTestId("home-open-original")],
    ["2-5-1 Master 続きから", home.getByRole("button", { name: "2-5-1 Master 続きから" })],
    // P23-47-fix-4: Form A–D is not on the home; the card's three entries are.
    ["新規学習", home.getByTestId("home-master").getByRole("button", { name: "新規学習", exact: true })],
    ["復習", home.getByTestId("home-master").getByRole("button", { name: "復習", exact: true })],
    ["Mixed Test", home.getByTestId("home-master").getByRole("button", { name: "Mixed Test", exact: true })],
    ["ガイド練習", home.getByTestId("home-guide").getByRole("button", { name: "ガイド練習", exact: true })],
    ["耳で弾く", home.getByTestId("ear-open")],
    ["記録を見る", home.getByTestId("home-ear-records")],
    ["ボイシングドリル", home.getByTestId("home-drill").getByRole("button", { name: "ボイシングドリル", exact: true })],
    ["stage 1", home.getByTestId("home-drill-stage-1")],
    ["stage 2", home.getByTestId("home-drill-stage-2")],
    ["stage 3", home.getByTestId("home-drill-stage-3")],
    ["stage 4", home.getByTestId("home-drill-stage-4")],
    ["今日のおまかせ 始める", home.getByTestId("practice-start")],
    ["中身を見る", home.getByTestId("home-today-details")],
    ["コードの型", home.getByTestId("home-shape").getByRole("button", { name: "型の一覧", exact: true })],
    ["一覧", home.getByTestId("home-shape").getByRole("button", { name: "型の一覧を開く" })],
    ["自分の進行", home.getByTestId("home-saved").getByRole("button", { name: "自分の進行" })],
    ["登録した音", home.getByTestId("home-wanted").getByRole("button", { name: "登録した音" })],
    ["MIDI 設定", home.getByTestId("home-midi-banner").getByRole("button", { name: "MIDI 設定" })],
    ["閉じる", home.getByTestId("home-midi-banner").getByRole("button", { name: "この注意を閉じる" })],
  ];
  for (const [name, entry] of entries) {
    await expect(entry, name).toBeVisible();
    await expect(entry, name).toBeEnabled();
    // P23-38: the fifth card can push this control below the fold; the covering check needs it on screen.
    await entry.scrollIntoViewIfNeeded();
    const pressable = await entry.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === element || element.contains(hit);
    });
    expect(pressable, `${name} is covered by another control`).toBe(true);
  }
  // The wanted items (up to two) are the row under 登録した音; the fixture may have none, so only the row is required.
  await expect(home.getByTestId("home-wanted")).toBeVisible();
});

test("C4: four sizes — no overflow, no axe critical, the tab order goes resume → the left cards → the right column", async ({ page }) => {
  for (const size of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await seedHome(page, true);
    await openDojo(page, "no-midi");
    const home = page.getByTestId("dojo-home");
    await assertNoHorizontalOverflow(page);
    // P23-31b: measure the colours only after the screen's fade-in has finished (a mid-fade axe run reads every
    // colour as too faint).
    await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
      .map((animation) => animation.finished.catch(() => undefined))));
    await expect.poll(() => page.evaluate(() => {
      const main = document.getElementById("main-content")!;
      return getComputedStyle(main).opacity;
    })).toBe("1");
    const axe = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(blocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) })), `${size.width}`).toEqual([]);
    // The tab order: the resume primary comes before the left cards, which come before the right column.
    const order = await home.evaluate((root) => {
      const items = [...root.querySelectorAll<HTMLElement>("button, a, input, select, [tabindex]")]
        .filter((element) => !(element as HTMLButtonElement).disabled && element.getBoundingClientRect().width > 0);
      const index = (element: Element) => items.indexOf(element as HTMLElement);
      return {
        resume: index(root.querySelector("[data-testid=home-resume-go]")!),
        standard: index(root.querySelector("[data-testid=home-standard] .dojo-card-primary")!),
        today: index(root.querySelector("[data-testid=home-today] [data-testid=practice-start]")!),
      };
    });
    expect(order.resume, `${size.width} resume first`).toBeLessThan(order.standard);
    expect(order.standard, `${size.width} left before right`).toBeLessThan(order.today);
    // H9: at 1024 and below the right column moves under the left column.
    if (size.width < 1024) {
      const left = (await home.locator(".dojo-home-p20-left").boundingBox())!;
      const sub = (await home.locator(".dojo-home-p20-sub").boundingBox())!;
      expect(sub.y).toBeGreaterThan(left.y + left.height - 1);
    }
  }
  await page.setViewportSize({ width: 768, height: 640 });
  await seedHome(page, true);
  await openDojo(page, "no-midi");
  const home = page.getByTestId("dojo-home");
  await assertNoHorizontalOverflow(page);
  const left = (await home.locator(".dojo-home-p20-left").boundingBox())!;
  const sub = (await home.locator(".dojo-home-p20-sub").boundingBox())!;
  expect(sub.y).toBeGreaterThan(left.y + left.height - 1);
});

test("P23-31 C8: 続きから → the notice → the cards; the recents on one line and the four cards on the mock's shape", async ({ page }) => {
  test.setTimeout(240_000);
  for (const size of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await seedHome(page, true);
    await openDojo(page, "no-midi");
    await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
      .map((animation) => animation.finished.catch(() => undefined))));

    const boxes = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, height: rect.height };
      };
      return {
        resume: box("[data-testid='home-resume']"),
        notice: box("[data-testid='home-midi-banner']"),
        body: box(".dojo-home-p20-body"),
      };
    });
    // D1: 続きから, then the MIDI notice, then the two columns.
    expect(boxes.notice, `${size.width}: the notice is there`).not.toBeNull();
    expect(boxes.notice!.top, `${size.width}: the notice is under 続きから`).toBeGreaterThanOrEqual(boxes.resume!.bottom - 1);
    expect(boxes.body!.top, `${size.width}: the columns are under the notice`).toBeGreaterThanOrEqual(boxes.notice!.bottom - 1);

    // D2: the other recent practices are one line of underlined buttons (220px at most, 44px tall, no wrap).
    const recents = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid^='home-recent-']")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          top: rect.top, height: rect.height, width: rect.width,
          whiteSpace: style.whiteSpace, decoration: style.textDecorationLine,
          title: element.getAttribute("title"), text: element.textContent,
        };
      }));
    expect(recents.length, `${size.width}: two recents`).toBeGreaterThanOrEqual(2);
    expect(Math.abs(recents[1]!.top - recents[0]!.top), `${size.width}: one line`).toBeLessThanOrEqual(1);
    for (const recent of recents) {
      expect(recent.whiteSpace).toBe("nowrap");
      expect(recent.width).toBeLessThanOrEqual(221);
      expect(recent.height).toBeGreaterThanOrEqual(36);
      expect(recent.decoration).toContain("underline");
      expect(recent.title, "the full name stays in the tooltip").toBeTruthy();
    }

    // D3/D4/D5: picture on the left at the top, the body to its right, the title's › at the right end,
    // the two cards of a row equally tall, and little empty room under the body.
    const cards = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".dojo-home-p20-main > .dojo-home-p20-card")]
      .filter((card) => card.getAttribute("data-testid") !== "home-guide")
      .map((card) => {
        const cardRect = card.getBoundingClientRect();
        const art = card.querySelector<HTMLElement>(".dojo-home-art-box")!;
        const artRect = art.getBoundingClientRect();
        const body = card.querySelector<HTMLElement>(".dojo-home-card-body")!;
        const bodyRect = body.getBoundingClientRect();
        const shown = [...body.children].filter((child) => getComputedStyle(child).display !== "none");
        const lastRect = shown.at(-1)!.getBoundingClientRect();
        const chevron = card.querySelector<HTMLElement>(".dojo-home-chev");
        return {
          card: { left: cardRect.left, right: cardRect.right, top: cardRect.top, bottom: cardRect.bottom, height: cardRect.height },
          art: { left: artRect.left, right: artRect.right, top: artRect.top, height: artRect.height },
          body: { left: bodyRect.left, right: bodyRect.right, top: bodyRect.top },
          lastBottom: lastRect.bottom,
          chevron: chevron ? { left: chevron.getBoundingClientRect().left, top: chevron.getBoundingClientRect().top } : null,
        };
      }));
    expect(cards, `${size.width}: the four mock cards (the guide card is P23-38)`).toHaveLength(4);
    await expect(page.getByTestId("home-guide")).toBeVisible();
    for (const card of cards) {
      expect(card.art.left - card.card.left, "the picture starts at the card's edge").toBeLessThanOrEqual(16);
      expect(card.art.top - card.card.top, "the picture is at the top").toBeLessThanOrEqual(16);
      expect(card.art.height, "the picture fills its row (P23-31b: 130×150 at least)").toBeGreaterThanOrEqual(150);
      // P23-31b: the body starts at the card's top (12px in), and the last line stays inside the card.
      expect(card.body.left, "the body is to the right of the picture").toBeGreaterThan(card.art.right);
      expect(card.body.top - card.card.top, "the words start at the card's top").toBeLessThanOrEqual(14);
      expect(card.lastBottom, "the last line stays inside the card").toBeLessThanOrEqual(card.card.bottom);
      expect(card.chevron, "the title has its ›").not.toBeNull();
      expect(card.chevron!.left).toBeGreaterThan(card.body.right - 40);
    }
    expect(Math.abs(cards[0]!.card.height - cards[1]!.card.height), `${size.width}: row 1 is level`).toBeLessThanOrEqual(1);
    expect(Math.abs(cards[2]!.card.height - cards[3]!.card.height), `${size.width}: row 2 is level`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `p89-generated/p23-31/dojo-home-${size.width}x${size.height}.png`, fullPage: true });
  }
});

test("the photos: four sizes with and without 続きから, and the opened details", async ({ page }) => {
  test.setTimeout(300_000);
  for (const size of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await seedHome(page, true);
    await openDojo(page, "no-midi");
    await expect(page.getByTestId("home-resume-go")).toBeVisible();
    await page.evaluate(() => { const main = document.getElementById("main-content")!; main.scrollTop = 0; });
    await page.screenshot({ path: `p89-generated/p23-27/home-resume-${size.width}x${size.height}.png`, fullPage: true });
    await page.getByTestId("home-today-details").click();
    await expect(page.getByTestId("home-today-details-body")).toBeVisible();
    await page.screenshot({ path: `p89-generated/p23-27/home-details-${size.width}x${size.height}.png`, fullPage: true });
    await page.getByTestId("home-today-details").click();
    // Without 続きから: clear the recent list and reload the home.
    await page.evaluate(() => localStorage.removeItem("loop-vault:dojo-recent:v1"));
    await page.reload();
    await page.locator('[data-nav="chord-dojo"]').click();
    await expect(page.getByTestId("dojo-home")).toBeVisible();
    await page.screenshot({ path: `p89-generated/p23-27/home-no-resume-${size.width}x${size.height}.png`, fullPage: true });
  }
});

test("P23-31b C1-C5: the four cards follow the mock at every size", async ({ page }) => {
  test.setTimeout(240_000);
  for (const size of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await seedHome(page, true);
    await openDojo(page, "no-midi");
    await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
      .map((animation) => animation.finished.catch(() => undefined))));

    // C1: the title button's left edge is the description's left edge; the title is left aligned.
    const titles = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".dojo-home-p20-main > .dojo-home-p20-card")].filter((card) => card.getAttribute("data-testid") !== "home-guide").map((card) => {
      const button = card.querySelector<HTMLElement>(".dojo-card-primary")!;
      const desc = card.querySelector<HTMLElement>(".dojo-home-p20-desc")!;
      return {
        id: card.getAttribute("data-testid"),
        titleLeft: button.getBoundingClientRect().left,
        descLeft: desc.getBoundingClientRect().left,
        align: getComputedStyle(button).textAlign,
      };
    }));
    expect(titles).toHaveLength(4); // the four mock cards; the guide card is P23-38
    await expect(page.getByTestId("home-guide")).toBeVisible();
    for (const title of titles) {
      expect(Math.abs(title.titleLeft - title.descLeft), `${size.width} ${title.id}: left edges`).toBeLessThanOrEqual(1);
      expect(title.align, `${size.width} ${title.id}: left aligned`).toBe("left");
    }

    // C2: the picture box is 130 wide and as tall as the card's first row; its words are 9px or more and short.
    const art = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".dojo-home-p20-main > .dojo-home-p20-card")].map((card) => {
      const box = card.querySelector<HTMLElement>(".dojo-home-art-box")!;
      const svg = box.querySelector<SVGSVGElement>("svg")!;
      const rows = getComputedStyle(card).gridTemplateRows.split(" ").map((value) => Number.parseFloat(value));
      return {
        id: card.getAttribute("data-testid"),
        width: Math.round(box.getBoundingClientRect().width),
        height: Math.round(box.getBoundingClientRect().height),
        row: Math.round(rows[0] ?? 0),
        fontSizes: [...svg.querySelectorAll("text")].map((text) => Number.parseFloat(getComputedStyle(text).fontSize)),
        words: svg.textContent ?? "",
      };
    }));
    for (const item of art) {
      expect(item.width, `${size.width} ${item.id}: width`).toBe(130);
      expect(Math.abs(item.height - item.row), `${size.width} ${item.id}: row height ${item.height}/${item.row}`).toBeLessThanOrEqual(1);
      expect(item.fontSizes.every((size0) => size0 >= 9), `${size.width} ${item.id}: 9px+ ${JSON.stringify(item.fontSizes)}`).toBe(true);
      expect(item.words).not.toMatch(/keys|listen|hold/);
    }

    // C3: the right column starts at the first card (details closed).
    const columns = await page.evaluate(() => {
      const cards = [...document.querySelectorAll<HTMLElement>(".dojo-home-p20-main > .dojo-home-p20-card")];
      const today = document.querySelector<HTMLElement>("[data-testid='home-today']")!;
      const sub = document.querySelector<HTMLElement>(".dojo-home-p20-sub")!;
      const style = getComputedStyle(sub);
      const children = [...sub.children] as HTMLElement[];
      return {
        firstTop: cards[0]!.getBoundingClientRect().top,
        todayTop: today.getBoundingClientRect().top,
        subHeight: sub.getBoundingClientRect().height,
        // its four cards, the gaps between them, and its own padding
        natural: children.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0)
          + (children.length - 1) * Number.parseFloat(style.rowGap) + Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
      };
    });
    expect(Math.abs(columns.todayTop - columns.firstTop), `${size.width}: right top`).toBeLessThanOrEqual(1);
    // P23-41: the right column keeps its own content height; it is not stretched to the cards' bottom.
    // P23-47-fix-4: measured as its own content (the cards are no longer much taller than the right column).
    expect(Math.abs(columns.subHeight - columns.natural), `${size.width}: the right column is not stretched`).toBeLessThanOrEqual(1);

    // C4 (P23-47-fix-4): the home's 2-5-1 card has no Form row, and no one-character column.
    const forms = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>("[data-testid='home-master']")!;
      return {
        count: card.querySelectorAll(".dojo-home-form-row > button").length,
        skinny: [...card.querySelectorAll<HTMLElement>("*")].filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.width <= 16 && box.height >= 48;
        }).length,
      };
    });
    expect(forms.count, `${size.width}: no Form buttons on the home`).toBe(0);
    expect(forms.skinny, `${size.width}: no one-character column`).toBe(0);

    // C5: the other recent ones start at their left edge and are block buttons.
    const others = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid^='home-recent-']")].map((button) => {
      const style = getComputedStyle(button);
      return { scrollLeft: button.scrollLeft, display: style.display, align: style.textAlign, left: button.getBoundingClientRect().left };
    }));
    expect(others.length).toBeGreaterThanOrEqual(2);
    for (const other of others) {
      expect(other.scrollLeft).toBe(0);
      expect(other.display).toBe("block");
      expect(other.align).toBe("left");
      expect(other.left).toBeGreaterThan(0);
    }
    await page.screenshot({ path: `p89-generated/p23-31b/home-${size.width}x${size.height}.png`, fullPage: true });
    if (size.width === 1440 || size.width === 1280) {
      await page.screenshot({ path: `p89-generated/p23-31c/home-${size.width}x${size.height}.png`, fullPage: true });
    }
    if (size.width === 1440) {
      await page.getByTestId("home-today-details").click();
      await expect(page.getByTestId("home-today-details-body")).toBeVisible();
      await page.screenshot({ path: "p89-generated/p23-31b/home-details-1440x900.png", fullPage: true });
    }
  }
});

test("P23-31b C8: no focus frame is drawn around the work area", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedHome(page, true);
  await openDojo(page, "no-midi");
  const navs = ["chord-dojo", "voicing-loop", "bass-practice", "capture", "settings"];
  for (const nav of navs) {
    const item = page.locator(`[data-nav="${nav}"]`);
    if (!(await item.count()) || !(await item.isVisible())) continue;
    await item.click();
    await page.waitForTimeout(80);
    const outline = await page.locator("#main-content").evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline, `${nav}: no focus frame`).toBe("none");
  }
});
