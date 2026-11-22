import { expect, test, type Locator, type Page } from "@playwright/test";
import { openDojo } from "./helpers/p12";

test("P22-01: function colours on the 王道進行 cards and the ii–V–I list", async ({ page }) => {
  await openDojo(page, "no-midi");
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await page.locator(".dojo-builtin-card").filter({ has: page.getByRole("heading", { name: "王道進行", exact: true }) })
    .getByRole("button", { name: / を練習する$/ }).click();
  await expect(page.locator(".dojo-chord-cards > button")).toHaveCount(4);
  const fns = await page.locator(".dojo-chord-cards > button").evaluateAll((cards) => cards.map((card) => card.getAttribute("data-fn")));
  expect(fns).toEqual(["SD", "D", "T", "T"]);
  await page.getByTestId("dojo-back").click();
  const iiv = page.locator(".dojo-builtin-card").filter({ has: page.getByRole("heading", { name: "ii–V–I", exact: true }) });
  const degrees = iiv.locator(".dojo-builtin-degrees > span");
  expect(await degrees.evaluateAll((spans) => spans.map((span) => span.getAttribute("data-fn")))).toEqual(["SD", "D", "T"]);
});

/** The review of step B: the function mark is its own element next to the degree, so the degree keeps its exact text. */
test("P22-01: the function mark is outside the degree, on its right, in the degree's colour", async ({ page }) => {
  await openDojo(page, "no-midi");
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await page.locator(".dojo-builtin-card").filter({ has: page.getByRole("heading", { name: "王道進行", exact: true }) })
    .getByRole("button", { name: / を練習する$/ }).click();
  await expect(page.locator(".dojo-chord-cards > button")).toHaveCount(4);
  await expect(page.locator(".dojo-chord-cards .dojo-endless-degree")).toHaveText(["Ⅳmaj7", "Ⅴ7", "Ⅲm7", "Ⅵm7"]);
  const marks = await page.locator(".dojo-chord-cards > button").evaluateAll((cards) => cards.map((card) => {
    const degree = card.querySelector(".dojo-endless-degree")!;
    const mark = card.querySelector(".dojo-card-fn")!;
    const d = degree.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    return {
      text: mark.textContent,
      insideDegree: degree.contains(mark),
      right: m.left >= d.right - 1,
      sameLine: Math.abs((m.top + m.bottom) / 2 - (d.top + d.bottom) / 2) < 6,
      markColour: getComputedStyle(mark).color,
      degreeColour: getComputedStyle(degree).color,
    };
  }));
  expect(marks.map((mark) => mark.text)).toEqual(["SD", "D", "T", "T"]);
  for (const mark of marks) {
    expect(mark.insideDegree, "the mark is not inside .dojo-endless-degree").toBe(false);
    expect(mark.right, "the mark is to the right of the degree").toBe(true);
    expect(mark.sameLine, "the mark is on the degree's line").toBe(true);
    expect(mark.markColour, `the mark keeps the degree's colour (${mark.degreeColour})`).toBe(mark.degreeColour);
  }
});

/**
 * §1-4 on the practice cards: the degree, its mark and a 4 px line at the card's top edge are in the function's colour
 * (--lv-fn-*), on the current card too; the current card keeps its green border.
 */
const FN_VAR: Record<string, string> = { T: "--lv-fn-t", SD: "--lv-fn-sd", SDm: "--lv-fn-sdm", D: "--lv-fn-d" };
async function cardColours(page: Page, cards: Locator) {
  return cards.evaluateAll((list, vars) => list.map((card) => {
    const probe = document.createElement("i");
    document.body.append(probe);
    const fn = card.getAttribute("data-fn") ?? "";
    probe.style.color = `var(${vars[fn]})`;
    const want = getComputedStyle(probe).color;
    probe.remove();
    const line = getComputedStyle(card, "::before");
    return {
      fn, want, state: card.getAttribute("data-state"),
      degree: getComputedStyle(card.querySelector(".dojo-endless-degree")!).color,
      mark: getComputedStyle(card.querySelector(".dojo-card-fn")!).color,
      line: line.borderTopColor, lineWidth: line.borderTopWidth, lineStyle: line.borderTopStyle,
      lineTop: Math.round(card.getBoundingClientRect().top), border: getComputedStyle(card).borderTopColor,
    };
  }), FN_VAR);
}
const expectFnColours = (cards: Awaited<ReturnType<typeof cardColours>>) => {
  for (const [i, card] of cards.entries()) {
    expect(card.want, `card ${i + 1}: ${card.fn} has a colour`).toMatch(/^rgb/);
    expect(card.degree, `card ${i + 1} (${card.fn}, ${card.state}): the degree`).toBe(card.want);
    expect(card.mark, `card ${i + 1} (${card.fn}, ${card.state}): the mark`).toBe(card.want);
    expect(card.line, `card ${i + 1} (${card.fn}, ${card.state}): the top line`).toBe(card.want);
    expect(card.lineWidth, `card ${i + 1}: the top line is 4 px`).toBe("4px");
  }
};

test("P22-01: the practice cards of 王道進行 (①) carry their function: the degree, the mark and the top line, the current card too", async ({ page }) => {
  await openDojo(page, "no-midi");
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await page.locator(".dojo-builtin-card").filter({ has: page.getByRole("heading", { name: "王道進行", exact: true }) })
    .getByRole("button", { name: / を練習する$/ }).click();
  const cards = await cardColours(page, page.locator(".dojo-chord-cards > button"));
  expect(cards.map((card) => card.fn)).toEqual(["SD", "D", "T", "T"]);
  expect(cards[0]!.state).toBe("current");
  expectFnColours(cards);
  expect(cards.map((card) => card.lineStyle)).toEqual(["solid", "solid", "solid", "solid"]);
  expect(cards[0]!.border, "the current card keeps its green border").toBe("rgb(66, 216, 198)");
});

test("P22-01: a borrowed dominant's top line is dashed (I–VI7–ii–V)", async ({ page }) => {
  await openDojo(page, "no-midi");
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await page.locator(".dojo-builtin-card").filter({ has: page.getByRole("heading", { name: "I–VI7–ii–V", exact: true }) })
    .getByRole("button", { name: / を練習する$/ }).click();
  const cards = await cardColours(page, page.locator(".dojo-chord-cards > button"));
  expectFnColours(cards);
  expect(cards.map((card) => card.lineStyle)).toEqual(["solid", "dashed", "solid", "solid"]);
});

test("P22-01: the Jazz and the drill practice cards carry their function too (one card each)", async ({ page }) => {
  await openDojo(page, "no-midi");
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await page.locator("[data-jazz-item=jazz-progressions-001]").getByTestId("jazz-open").click();
  const jazz = await cardColours(page, page.getByTestId("jazz-card").first());
  expect(jazz[0]!.fn).not.toBe("");
  expectFnColours(jazz);
  await page.getByTestId("dojo-back").click();
  await page.getByTestId("dojo-back").click();
  await page.getByRole("button", { name: "ボイシングドリル", exact: true }).click();
  await page.getByTestId("drill-open-cycle-a").click();
  const drill = await cardColours(page, page.getByTestId("drill-card").first());
  expect(drill[0]!.fn).toBe("T");
  expectFnColours(drill);
});
