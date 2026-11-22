import { expect, test, type Page } from "@playwright/test";
import { openDojo, seed } from "./helpers/p12";
import { emptyStore, dateKey } from "../src/domain/chordDojo/store";

/** P21: a one-note Bass line keeps the hand position (L5 L4 L3 L2), not L5 everywhere. */
async function openLoop(page: Page, status: string) {
  await page.goto(`/?p527Status=${status}`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  const workspace = page.getByTestId("voicing-loop-workspace");
  await expect(workspace.getByTestId("voicing-loop-left-hand")).toBeVisible();
  return workspace;
}

async function usedFingers(page: Page) {
  // P23-20 L1: each used finger is a slot card; its name is the finger label.
  return page.getByTestId("voicing-loop-left-hand")
    .locator('[data-testid="voicing-loop-hand-slot"][data-used="true"] .voicing-hand-slot-finger')
    .allTextContents();
}

test("P21: L1 keeps L5 L4 L3 L2 on the left hand", async ({ page }) => {
  const workspace = await openLoop(page, "p21-l1");
  const events = workspace.getByTestId("voicing-loop-event");
  await expect(events).toHaveCount(4);
  const expected = ["L5", "L4", "L3", "L2"];
  for (let index = 0; index < expected.length; index += 1) {
    await events.nth(index).click();
    const fingers = await usedFingers(page);
    expect(fingers).toEqual([expected[index]!]);
  }
  await events.nth(1).click();
  await expect(workspace.getByText("指を替える(手はそのまま)")).toBeVisible();
  await page.screenshot({ path: "p89-generated/p21/after-l1.png", fullPage: true });
});

test("P21: L3 keeps L5 L2 L1 L5 on the left hand", async ({ page }) => {
  const workspace = await openLoop(page, "p21-l3");
  const events = workspace.getByTestId("voicing-loop-event");
  const expected = ["L5", "L2", "L1", "L5"];
  for (let index = 0; index < expected.length; index += 1) {
    await events.nth(index).click();
    const fingers = await usedFingers(page);
    expect(fingers).toEqual([expected[index]!]);
  }
});

test("P21: a saved fingering on D2 stays L2 in the Voicing Loop", async ({ page }) => {
  const preferences = { version: 1, entries: [{ hand: "left", pitches: [38], fingers: [2], updatedAt: 1, signature: "L:38" }] };
  await page.addInitScript((value) => localStorage.setItem("loop-vault:voicing-loop-fingering-preferences:v1", JSON.stringify(value)), preferences);
  const workspace = await openLoop(page, "p21-anchor");
  const events = workspace.getByTestId("voicing-loop-event");
  const expected = ["L3", "L2", "L1"];
  for (let index = 1; index <= 3; index += 1) {
    await events.nth(index - 1).click();
    await expect.poll(async () => (await usedFingers(page)).join("/")).toBe(expected[index - 1]);
  }
});

function p21ProgressionFile(chordIndex: number) {
  const f = emptyStore();
  f.knownQualities.maj = { at: new Date().toISOString(), nextRecallAt: new Date(Date.now() + 86_400_000).toISOString(), recallStep: 0 };
  f.today = { date: dateKey(new Date()), tasks: [{ kind: "progression", key: "builtin:iv-iii-ii-i:1", roots: [0], review: false, seconds: 120 }],
    cursor: { taskIndex: 0, stage: "see", keyIndex: 0, chordIndex, answerSeen: false, hints: [], tempoResults: [] }, finished: false, added: [], matched: 0 };
  return f;
}
const leftLabels = (page: Page) => page.locator("[data-midi-note] [data-finger-label]").evaluateAll((labels) => labels
  .map((label) => ({ note: Number(label.closest("[data-midi-note]")!.getAttribute("data-midi-note")), text: (label.textContent ?? "").trim() }))
  .filter((label) => label.text.startsWith("左")));

test("P21: Chord Dojo iv-iii-ii-i keeps L2 L3 L4 L5 on the bass", async ({ page }) => {
  const expected = [{ note: 53, text: "左2" }, { note: 52, text: "左3" }, { note: 50, text: "左4" }, { note: 48, text: "左5" }];
  for (let chordIndex = 0; chordIndex < 4; chordIndex += 1) {
    await seed(page, p21ProgressionFile(chordIndex));
    await openDojo(page);
    await page.getByRole("button", { name: /^始める/ }).click();
    await expect(page.locator(".dojo")).toHaveAttribute("data-dojo-cursor", `0:see:0:${chordIndex}`);
    await expect.poll(async () => (await leftLabels(page)).length).toBe(1);
    const labels = await leftLabels(page);
    expect(labels[0]!.note).toBe(expected[chordIndex]!.note);
    expect(labels[0]!.text).toBe(expected[chordIndex]!.text);
  }
});

test("P21: a saved fingering on D3 in Chord Dojo stays L2", async ({ page }) => {
  const preferences = { version: 1, entries: [{ hand: "left", pitches: [50], fingers: [2], updatedAt: 1, signature: "L:50" }] };
  await page.addInitScript((value) => localStorage.setItem("loop-vault:voicing-loop-fingering-preferences:v1", JSON.stringify(value)), preferences);
  await seed(page, p21ProgressionFile(2));
  await openDojo(page);
  await page.getByRole("button", { name: /^始める/ }).click();
  await expect(page.locator(".dojo")).toHaveAttribute("data-dojo-cursor", "0:see:0:2");
  await expect.poll(async () => (await leftLabels(page)).length).toBe(1);
  expect((await leftLabels(page))[0]).toEqual({ note: 50, text: "左2" });
});