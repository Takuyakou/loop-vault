import { expect, test, type Page } from "@playwright/test";

/**
 * VL-13: (A) the MIDI keyboard sounds through the Voicing Loop, and (B) the
 * whole-song fill moves with the playhead instead of jumping by group.
 */

const PREFS = "loop-vault:live-midi-preferences:v1";
const CONNECTION = "loop-vault:live-midi-connection:v1";

interface SyntheticMidi {
  emit: (notes: number[], on?: boolean, spread?: number) => void;
  unplug: () => Promise<void>;
  plug: () => Promise<void>;
}

const midi = (page: Page) => ({
  emit: (notes: number[], on = true) => page.evaluate(({ notes, on }) => (window as unknown as { __p12Midi: SyntheticMidi }).__p12Midi.emit(notes, on), { notes, on }),
  unplug: () => page.evaluate(() => (window as unknown as { __p12Midi: SyntheticMidi }).__p12Midi.unplug()),
  plug: () => page.evaluate(() => (window as unknown as { __p12Midi: SyntheticMidi }).__p12Midi.plug()),
});
const monitors = (page: Page) => page.evaluate(() => (window as unknown as { __dojoMonitorCount: number }).__dojoMonitorCount);
const monitorNotes = (page: Page) => page.evaluate(() => [...((window as unknown as { __dojoMonitorNotes?: number[] }).__dojoMonitorNotes ?? [])]);
const chip = (page: Page) => page.locator(".lv-midi-chip");

interface AudioProbe {
  starts: number;
  stops: number;
  contexts: AudioContext[];
}
const audioProbe = (page: Page) => page.evaluate(() => {
  const probe = (window as unknown as { __vl13AudioProbe: AudioProbe }).__vl13AudioProbe;
  return { starts: probe.starts, stops: probe.stops, contexts: probe.contexts.length };
});

/** Same interception as the Master monitor test: real AudioBufferSourceNode starts/stops and the AudioContexts. */
async function installAudioProbe(page: Page) {
  await page.addInitScript(() => {
    const probe = { starts: 0, stops: 0, contexts: [] as AudioContext[] };
    (window as unknown as { __vl13AudioProbe: typeof probe }).__vl13AudioProbe = probe;
    const Context = window.AudioContext;
    window.AudioContext = new Proxy(Context, {
      construct(target, args) {
        const context = Reflect.construct(target, args) as AudioContext;
        probe.contexts.push(context);
        return context;
      },
    }) as unknown as typeof AudioContext;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      probe.starts += 1;
      return start.apply(this, args);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (...args: Parameters<typeof stop>) {
      probe.stops += 1;
      return stop.apply(this, args);
    };
  });
}

async function seedMidi(page: Page) {
  await page.addInitScript(({ prefs, connection }) => {
    if (!localStorage.getItem(prefs)) {
      localStorage.setItem(prefs, JSON.stringify({ alwaysOnTop: true, showHistory: true, preferredInput: { backendId: "p12-synthetic", name: "合成入力", previousIndex: 0 } }));
    }
    if (!localStorage.getItem(connection)) localStorage.setItem(connection, JSON.stringify({ autoConnect: true }));
  }, { prefs: PREFS, connection: CONNECTION });
}

async function openLoopWithMidi(page: Page, status = "p533-rules") {
  await seedMidi(page);
  await page.goto(`/?p12=midi&p527Status=${status}`);
  await page.evaluate(() => document.fonts.ready);
  await expect(chip(page)).toBeVisible();
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 5000 });
  await page.locator('[data-nav="voicing-loop"]').click();
  const workspace = page.getByTestId("voicing-loop-workspace");
  await expect(workspace).toBeVisible();
  return workspace;
}

async function openLoop(page: Page, status: string) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/?p527Status=${status}`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  const workspace = page.getByTestId("voicing-loop-workspace");
  await expect(workspace).toBeVisible();
  return workspace;
}

const navigatorValues = (page: Page) => page.getByTestId("voicing-loop-navigator").evaluate((box) => {
  const fill = box.querySelector<HTMLElement>('[data-testid="voicing-loop-navigator-fill"]')!;
  const head = box.querySelector<HTMLElement>("[data-navigator-head]")!;
  return { fill: Number.parseFloat(fill.style.width) || 0, head: Number.parseFloat(head.style.left) || 0, bars: box.querySelectorAll(":scope > span").length };
});

test.describe("VL-13 A: the Voicing Loop plays the MIDI keyboard", () => {
  test("notes reach the piano monitor and stop on release", async ({ page }) => {
    await openLoopWithMidi(page);
    await expect.poll(() => monitors(page)).toBe(1);
    await midi(page).emit([60, 64]);
    await expect.poll(() => monitorNotes(page)).toEqual([60, 64]);
    await midi(page).emit([60, 64], false);
    await expect.poll(() => monitorNotes(page)).toEqual([]);
  });

  test("the notes still reach the monitor while the loop is playing", async ({ page }) => {
    const workspace = await openLoopWithMidi(page);
    await expect.poll(() => monitors(page)).toBe(1);
    await workspace.getByRole("button", { name: "開始", exact: true }).click();
    await expect(workspace.getByRole("button", { name: "一時停止", exact: true })).toBeVisible();
    await midi(page).emit([67]);
    await expect.poll(() => monitorNotes(page)).toEqual([67]);
    await midi(page).emit([67], false);
    await expect.poll(() => monitorNotes(page)).toEqual([]);
  });

  test("an unplugged input stops the monitor and a replug starts one again", async ({ page }) => {
    await openLoopWithMidi(page);
    await expect.poll(() => monitors(page)).toBe(1);
    await midi(page).unplug();
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "lost");
    await expect.poll(() => monitors(page)).toBe(0);
    await expect.poll(() => monitorNotes(page)).toEqual([]);
    await midi(page).plug();
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 10_000 });
    await expect.poll(() => monitors(page)).toBe(1);
  });

  test("Voicing Loop → Chord Dojo → Voicing Loop keeps one monitor", async ({ page }) => {
    const workspace = await openLoopWithMidi(page);
    await expect.poll(() => monitors(page)).toBe(1);
    await page.locator('[data-nav="chord-dojo"]').click();
    await expect(page.locator(".dojo")).toBeVisible();
    await expect.poll(() => monitors(page)).toBe(1);
    await page.locator('[data-nav="voicing-loop"]').click();
    await expect(workspace).toBeVisible();
    await expect.poll(() => monitors(page)).toBe(1);
  });

  test("a failed piano load says so and the retry button starts it", async ({ page }) => {
    await page.route("**/*.mp3", (route) => route.abort());
    const workspace = await openLoopWithMidi(page);
    const notice = workspace.getByTestId("voicing-loop-midi-audio-error");
    await expect(notice).toBeVisible({ timeout: 20_000 });
    await expect(workspace).toHaveAttribute("data-midi-audio", "error");
    await page.unroute("**/*.mp3");
    await notice.getByRole("button", { name: "入力音をもう一度" }).click();
    await expect(notice).toHaveCount(0, { timeout: 20_000 });
    await expect(workspace).toHaveAttribute("data-midi-audio", "ready");
    await expect.poll(() => monitors(page)).toBe(1);
  });

  test("while suspended it shows the same audio state and the next note sounds after a press", async ({ page }) => {
    await installAudioProbe(page);
    const workspace = await openLoopWithMidi(page);
    await expect.poll(() => monitors(page)).toBe(1);
    await page.evaluate(async () => {
      await (window as unknown as { __vl13AudioProbe: AudioProbe }).__vl13AudioProbe.contexts[0]!.suspend();
    });
    // The same state indication Chord Dojo uses while the audio context is still stopped.
    await expect(workspace).toHaveAttribute("data-midi-audio", "suspended");
    await workspace.getByTestId("voicing-loop-midi-status").click();
    await expect(workspace).toHaveAttribute("data-midi-audio", "ready");
    await midi(page).emit([60]);
    await expect.poll(() => monitorNotes(page)).toEqual([60]);
    await midi(page).emit([60], false);
  });

  test("moving between Voicing Loop and Chord Dojo with C4 held stops the old monitor and the new one waits for a re-press", async ({ page }) => {
    await installAudioProbe(page);
    const workspace = await openLoopWithMidi(page);
    await expect.poll(() => monitors(page)).toBe(1);
    await midi(page).emit([60]);
    await expect.poll(() => monitorNotes(page)).toEqual([60]);

    const beforeForward = await audioProbe(page);
    await page.locator('[data-nav="chord-dojo"]').click();
    await expect(page.locator(".dojo")).toBeVisible();
    await expect.poll(() => monitors(page)).toBe(1);
    await expect.poll(() => monitorNotes(page)).toEqual([]);
    const afterForward = await audioProbe(page);
    expect(afterForward.starts).toBe(beforeForward.starts);

    await midi(page).emit([60], false);
    await midi(page).emit([60]);
    await expect.poll(() => monitorNotes(page)).toEqual([60]);

    const beforeBack = await audioProbe(page);
    await page.locator('[data-nav="voicing-loop"]').click();
    await expect(workspace).toBeVisible();
    await expect.poll(() => monitors(page)).toBe(1);
    await expect.poll(() => monitorNotes(page)).toEqual([]);
    const afterBack = await audioProbe(page);
    expect(afterBack.starts).toBe(beforeBack.starts);

    await midi(page).emit([60], false);
    await midi(page).emit([60]);
    await expect.poll(() => monitorNotes(page)).toEqual([60]);
    await midi(page).emit([60], false);
  });

  test("a held C4 is not left in the monitor after an unplug and replug", async ({ page }) => {
    await installAudioProbe(page);
    await openLoopWithMidi(page);
    await expect.poll(() => monitors(page)).toBe(1);
    await midi(page).emit([60]);
    await expect.poll(() => monitorNotes(page)).toEqual([60]);

    await midi(page).unplug();
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "lost");
    await expect.poll(() => monitors(page)).toBe(0);
    await expect.poll(() => monitorNotes(page)).toEqual([]);

    const beforeReplug = await audioProbe(page);
    await midi(page).plug();
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 10_000 });
    await expect.poll(() => monitors(page)).toBe(1);
    await expect.poll(() => monitorNotes(page)).toEqual([]);
    expect((await audioProbe(page)).starts).toBe(beforeReplug.starts);

    await midi(page).emit([60]);
    await expect.poll(() => monitorNotes(page)).toEqual([60]);
    await midi(page).emit([60], false);
  });
});

test.describe("VL-13 B: the whole-song fill moves with the playhead", () => {
  test("the fill matches the head and grows inside a group while playing", async ({ page }) => {
    const workspace = await openLoop(page, "p533-rules");
    const groups = await workspace.getByTestId("voicing-loop-overview").locator("span").count();
    expect(groups).toBeGreaterThan(1);
    await workspace.getByRole("button", { name: "開始", exact: true }).click();
    await expect.poll(async () => {
      const value = await navigatorValues(page);
      const within = (value.head / 100) * groups;
      return value.head > 10 && value.head < 90 && within - Math.floor(within) > 0.2 ? value : undefined;
    }, { timeout: 15_000 }).not.toBeUndefined();
    const value = await navigatorValues(page);
    expect(Math.abs(value.fill - value.head)).toBeLessThanOrEqual(1);
    const boundary = Math.floor((value.head / 100) * groups) / groups * 100;
    expect(value.fill).toBeGreaterThan(boundary);
  });

  test("pause and seek keep the fill on the head; the bright group band is gone", async ({ page }) => {
    const workspace = await openLoop(page, "long-song");
    const navigator = workspace.getByTestId("voicing-loop-navigator");
    expect((await navigatorValues(page)).bars).toBe(1);
    await workspace.getByRole("button", { name: "開始", exact: true }).click();
    await expect(workspace.getByRole("button", { name: "一時停止", exact: true })).toBeVisible();
    await workspace.getByRole("button", { name: "一時停止", exact: true }).click();
    await expect.poll(async () => {
      const value = await navigatorValues(page);
      return Math.abs(value.fill - value.head);
    }).toBeLessThanOrEqual(1);
    const box = (await navigator.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
    await expect.poll(async () => {
      const value = await navigatorValues(page);
      return Math.abs(value.fill - value.head);
    }).toBeLessThanOrEqual(1);
    expect((await navigatorValues(page)).head).toBeGreaterThan(40);
  });

  test("the fill keeps growing across group boundaries, always within 1% of the head", async ({ page }) => {
    const workspace = await openLoop(page, "p533-rules");
    const groups = await workspace.getByTestId("voicing-loop-overview").locator("span").count();
    expect(groups).toBeGreaterThan(1);
    await workspace.getByRole("button", { name: "開始", exact: true }).click();
    const samples: { fill: number; head: number }[] = [];
    for (let index = 0; index < 30; index += 1) {
      await page.waitForTimeout(250);
      const value = await navigatorValues(page);
      if (value.head > 80) break;
      samples.push(value);
    }
    expect(samples.length).toBeGreaterThan(8);
    for (const value of samples) expect(Math.abs(value.fill - value.head)).toBeLessThanOrEqual(1);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!.fill, `sample ${index}`).toBeGreaterThanOrEqual(samples[index - 1]!.fill - 0.1);
    }
    const crossed = new Set(samples.map((value) => Math.floor((value.fill / 100) * groups)));
    expect(crossed.size).toBeGreaterThan(1);
    expect(samples[samples.length - 1]!.fill).toBeGreaterThan(samples[0]!.fill + 5);
  });

  test("scale and follow redraws keep the fill at the playhead, not the previous group boundary", async ({ page }) => {
    const workspace = await openLoop(page, "p533-rules");
    const ruler = workspace.getByTestId("voicing-loop-ruler");
    const rulerBox = (await ruler.boundingBox())!;
    await page.mouse.click(rulerBox.x + rulerBox.width * 0.65, rulerBox.y + rulerBox.height / 2);
    await expect.poll(async () => (await navigatorValues(page)).head).toBeGreaterThan(60);
    await workspace.getByRole("button", { name: "開始", exact: true }).click();
    await expect(workspace.getByRole("button", { name: "一時停止", exact: true })).toBeVisible();
    await expect.poll(async () => (await navigatorValues(page)).head, { timeout: 10_000 }).toBeGreaterThan(62);
    const check = async (label: string) => {
      await page.waitForTimeout(120);
      const value = await navigatorValues(page);
      expect(Math.abs(value.fill - value.head), label).toBeLessThanOrEqual(1);
      // 55% is inside the 50–62.5% group; a jump back to the previous boundary would be 50%.
      expect(value.fill, label).toBeGreaterThan(50);
    };
    expect((await navigatorValues(page)).fill).toBeGreaterThan(50);
    await workspace.getByRole("button", { name: "8", exact: true }).click();
    await check("display 8");
    await workspace.getByTestId("voicing-loop-follow").click();
    await check("follow off");
    await workspace.getByTestId("voicing-loop-follow").click();
    await check("follow on");

    // A longer song enables 12/16 as well.
    await page.goto("/?p527Status=long-song");
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nav="voicing-loop"]').click();
    const long = page.getByTestId("voicing-loop-workspace");
    await expect(long).toBeVisible();
    const longNavigator = long.getByTestId("voicing-loop-navigator");
    const longBox = (await longNavigator.boundingBox())!;
    await page.mouse.click(longBox.x + longBox.width * 0.55, longBox.y + longBox.height / 2);
    await expect.poll(async () => (await navigatorValues(page)).head).toBeGreaterThan(50);
    await long.getByRole("button", { name: "開始", exact: true }).click();
    await expect(long.getByRole("button", { name: "一時停止", exact: true })).toBeVisible();
    for (const scale of ["12", "16"] as const) {
      await long.getByRole("button", { name: scale, exact: true }).click();
      // The fill follows the head at the new scale; wait for the two to converge instead of a fixed sleep (under load
      // the paint lags and a single measurement raced: |fill−head| reached 10.56 once).
      await expect.poll(async () => { const value = await navigatorValues(page); return Math.abs(value.fill - value.head); }, { timeout: 10_000 }).toBeLessThanOrEqual(1);
      const value = await navigatorValues(page);
      expect(value.fill, `display ${scale}`).toBeGreaterThan(50);
    }
  });

  test("a loop restarts the fill with the head, not backwards", async ({ page }) => {
    const workspace = await openLoop(page, "both-hands");
    await workspace.getByRole("button", { name: "開始", exact: true }).click();
    await expect.poll(async () => (await navigatorValues(page)).head, { timeout: 15_000 }).toBeGreaterThan(40);
    await expect.poll(async () => (await navigatorValues(page)).head, { timeout: 15_000 }).toBeLessThan(10);
    // After the restart the head and the whole-song fill must move together near the start. Assert both properties at
    // the same instant inside the poll: separate polls followed by one more read raced the continuing loop (the fill
    // read 12.5 once while the head had already passed 10 — the two one-shot reads were not the same instant).
    await expect.poll(async () => {
      const value = await navigatorValues(page);
      return `${Math.abs(value.fill - value.head) <= 1 ? "on" : "off"}/${value.fill < 10 ? "start" : "past"}`;
    }, { timeout: 15_000, message: "after the loop restarts, the fill must be on the head near the start" }).toBe("on/start");
  });

  test("a section loop keeps the fill inside the section, on the head", async ({ page }) => {
    const workspace = await openLoop(page, "both-hands-long");
    const cards = workspace.getByTestId("voicing-loop-timeline").getByTestId("voicing-loop-event");
    await cards.nth(1).click({ button: "right" });
    await cards.nth(3).click({ button: "right" });
    await expect(workspace.getByTestId("voicing-loop-range-chip")).toContainText("2〜4");
    await workspace.getByRole("button", { name: "開始", exact: true }).click();
    await expect.poll(async () => (await navigatorValues(page)).head, { timeout: 15_000 }).toBeGreaterThan(20);
    // The fill follows the head while the loop runs inside the section: both properties in one poll (a head poll
    // followed by a separate read is not the same instant, and under load the fill read 10.56 behind the head once).
    // fill ≈ head と head が区間(2〜4 bar → 40% 未満)に入っていることで fill も区間に収まる。
    await expect.poll(async () => {
      const value = await navigatorValues(page);
      return `${Math.abs(value.fill - value.head) <= 1 ? "on" : "off"}/${value.head < 40 ? "inside" : "past"}`;
    }, { timeout: 15_000, message: "in the section loop the fill must be on the head, inside the 2〜4 section" }).toBe("on/inside");
  });
});
