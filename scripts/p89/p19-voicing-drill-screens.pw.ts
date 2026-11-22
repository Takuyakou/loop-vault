// P19 evidence screenshots (git-ignored output): the set list, ① 見て弾く, ② 覚えて弾く (the answer hidden),
// the end of a lap, and the 28-card set.
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openDojo, type MidiControl } from "../../e2e/helpers/p12";
import { buildDrillKeySet } from "../../src/domain/chordDojo/voicingDrill";

test("P19 evidence", async ({ page }) => {
  const out = resolve("p89-generated", process.env.P89_SCREENS_NAME!);
  mkdirSync(out, { recursive: true });
  const audits: { file: string; overflow: number }[] = [];
  const shot = async (name: string, width: number, height: number) => {
    const file = `${name}@${width}x${height}.png`;
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
    audits.push({ file, overflow });
    await page.screenshot({ path: resolve(out, file) });
  };
  const emit = (notes: readonly number[], on = true, spread = 0) =>
    page.evaluate(({ notes, on, spread }) => (window as unknown as { __p12Midi: MidiControl }).__p12Midi.emit(notes, on, spread), { notes: [...notes], on, spread });
  const openDrill = async (setId: string) => {
    await openDojo(page, "midi");
    await page.getByRole("button", { name: "ボイシングドリル", exact: true }).click();
    await expect(page.getByTestId("drill-list")).toBeVisible();
    await page.getByTestId(`drill-open-${setId}`).click();
    await expect(page.getByTestId("dojo-drill")).toBeVisible();
  };
  const playLap = async (setId: string) => {
    const key = Number(await page.getByTestId("dojo-drill").getAttribute("data-drill-key"));
    const lap = buildDrillKeySet(setId, key).cards;
    const held = new Set<number>();
    for (let index = 0; index < lap.length; index += 1) {
      await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-card", String(index));
      const notes = [...lap[index]!.left, ...lap[index]!.right];
      const release = [...held].filter((note) => !notes.includes(note));
      if (release.length) {
        await emit(release, false);
        release.forEach((note) => held.delete(note));
      }
      const press = notes.filter((note) => !held.has(note));
      if (press.length) {
        await emit(press, true, 25);
        press.forEach((note) => held.add(note));
      }
    }
    await emit([...held], false);
  };

  for (const [width, height] of [[1280, 720], [1440, 900]] as const) {
    await page.setViewportSize({ width, height });
    await openDojo(page, "midi");
    await page.getByRole("button", { name: "ボイシングドリル", exact: true }).click();
    await expect(page.getByTestId("drill-list")).toBeVisible();
    await page.waitForTimeout(250);
    await shot("list", width, height);
    await page.getByTestId("drill-open-cycle-a").click();
    await page.waitForTimeout(250);
    await shot("see-first-card", width, height);
    await page.getByTestId("dojo-stage-2").click();
    await page.waitForTimeout(200);
    await shot("recall-hidden", width, height);
    await page.getByTestId("dojo-stage-1").click();
    await page.getByTestId("drill-start").click();
    await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-state", "ready");
    await playLap("cycle-a");
    await expect(page.getByTestId("drill-result")).toBeVisible();
    // the photo must not show a 迷った mark: the driver presses no carried key again
    await expect.poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem("loop-vault:voicing-drill-v1:data");
      if (!raw) return null;
      const file = JSON.parse(raw) as { sets?: Record<string, Record<string, { keys?: Record<string, { see?: { last?: { marks?: number[] } } }> }>> };
      const revisions = file.sets?.["cycle-a"];
      const revision = revisions ? Object.keys(revisions)[0] : undefined;
      return revision ? revisions![revision]?.keys?.["0"]?.see?.last?.marks ?? null : null;
    })).toEqual([]);
    await page.waitForTimeout(300);
    await shot("lap-result", width, height);
  }

  // The largest set: one row that scrolls sideways, the keyboard and the staff stay.
  await page.setViewportSize({ width: 1280, height: 720 });
  await openDrill("tension-all");
  await page.waitForTimeout(250);
  await shot("tension-all-28-cards", 1280, 720);

  writeFileSync(resolve(out, "manifest.json"), JSON.stringify({ synthetic: true, audits }, null, 2));
});
