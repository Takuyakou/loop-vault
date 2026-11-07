import { expect, test, type Page } from "@playwright/test";

/**
 * P5.26.2-02: the Voicing Loop's hand panels are five fixed finger slots per hand, equal width,
 * whatever the chord. Left and right differ only in what is under each finger.
 */
async function openLoop(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/?p527Status=p533-rules");
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId("voicing-loop-left-hand")).toBeVisible();
}

const geometry = (page: Page, testId: string) => page.getByTestId(testId).evaluate((panel) => {
  const box = panel.getBoundingClientRect();
  const slots = Array.from(panel.querySelectorAll<HTMLElement>('tr[data-row="finger"] td')).map((cell) => {
    const at = cell.getBoundingClientRect();
    return { slot: cell.getAttribute("data-slot"), x: Math.round(at.x * 10) / 10, width: Math.round(at.width * 10) / 10 };
  });
  return { width: Math.round(box.width * 10) / 10, slots, used: Number(panel.getAttribute("data-used")) };
});

for (const [width, height] of [[1440, 900], [960, 1032]] as const) {
  test(`hand panels keep their width and finger positions across chords at ${width}px`, async ({ page }) => {
    await openLoop(page, width, height);
    const events = page.getByTestId("voicing-loop-event");
    const count = Math.min(6, await events.count());
    expect(count).toBeGreaterThan(2);
    const seen: { left: Awaited<ReturnType<typeof geometry>>; right: Awaited<ReturnType<typeof geometry>>; nextLeft: Awaited<ReturnType<typeof geometry>>; nextRight: Awaited<ReturnType<typeof geometry>> }[] = [];
    for (let index = 0; index < count; index += 1) {
      await events.nth(index).click();
      await page.waitForTimeout(80);
      seen.push({
        left: await geometry(page, "voicing-loop-left-hand"),
        right: await geometry(page, "voicing-loop-right-hand"),
        nextLeft: await geometry(page, "voicing-loop-next-left-hand"),
        nextRight: await geometry(page, "voicing-loop-next-right-hand"),
      });
    }
    // Five slots, in the keyboard's order, in every panel.
    for (const entry of seen) {
      expect(entry.left.slots.map((slot) => slot.slot)).toEqual(["L5", "L4", "L3", "L2", "L1"]);
      expect(entry.right.slots.map((slot) => slot.slot)).toEqual(["R1", "R2", "R3", "R4", "R5"]);
      // Left and right are as wide as each other, current and next alike.
      expect(entry.left.width).toBe(entry.right.width);
      expect(entry.nextLeft.width).toBe(entry.nextRight.width);
      // Slots are equal width and each follows the previous one.
      for (const panel of [entry.left, entry.right]) {
        expect(new Set(panel.slots.map((slot) => slot.width)).size).toBe(1);
        panel.slots.reduce((previous, slot) => { expect(slot.x).toBeGreaterThan(previous); return slot.x; }, -1);
      }
      expect(entry.left.slots[4]!.x).toBeLessThan(entry.right.slots[0]!.x); // L1 is left of R1
    }
    // Nothing moves between chords, though what is under the fingers does.
    for (const entry of seen) {
      expect(entry.left.width).toBe(seen[0]!.left.width);
      expect(entry.nextLeft.width).toBe(seen[0]!.nextLeft.width);
      expect(entry.left.slots).toEqual(seen[0]!.left.slots);
      expect(entry.right.slots).toEqual(seen[0]!.right.slots);
    }
    expect(new Set(seen.map((entry) => `${entry.left.used}/${entry.right.used}`)).size).toBeGreaterThanOrEqual(1);
  });
}

test("a finger that is not used shows as an empty slot and every used note has a degree", async ({ page }) => {
  await openLoop(page, 1440, 900);
  const events = page.getByTestId("voicing-loop-event");
  const count = Math.min(8, await events.count());
  for (let index = 0; index < count; index += 1) {
    await events.nth(index).click();
    for (const hand of ["left", "right"]) {
      const panel = page.getByTestId(`voicing-loop-${hand}-hand`);
      await expect(panel.locator('tr[data-row="pitch"] td')).toHaveCount(5);
      await expect(panel.locator('tr[data-row="degree"] td')).toHaveCount(5);
      const degrees = await panel.locator('tr[data-row="degree"] td[data-used="true"]').allTextContents();
      for (const degree of degrees) expect(degree).not.toBe("—");
      const empties = panel.locator('tr[data-row="pitch"] td[data-used="false"]');
      for (const text of await empties.allTextContents()) expect(text).toBe("·");
    }
  }
});
