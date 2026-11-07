import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { dateKey, emptyStore, type DojoStore, type Task } from "../src/domain/chordDojo/store";
import { emptyMaster, targetForCell, type CellKey } from "../src/domain/master251/model";

/**
 * P14 §2 (E2E 1–9) and §4: the app-wide MIDI connection and the header panel.
 * The input is the synthetic one from `?p12` (fixture builds only).
 */

interface SyntheticMidi {
  held: () => number;
  connect: () => Promise<void>;
  emit: (notes: number[], on?: boolean, spread?: number) => void;
  stats: { opens: number; closes: number; listeners: number };
  deferOpen: () => void;
  resumeOpen: (fail?: boolean) => void;
  plug: () => Promise<void>;
  unplug: () => Promise<void>;
}
const midi = (page: Page) => ({
  stats: () => page.evaluate(() => ({ ...(window as unknown as { __p12Midi: SyntheticMidi }).__p12Midi.stats })),
  deferOpen: () => page.evaluate(() => (window as unknown as { __p12Midi: SyntheticMidi }).__p12Midi.deferOpen()),
  resumeOpen: (fail = false) => page.evaluate((f) => (window as unknown as { __p12Midi: SyntheticMidi }).__p12Midi.resumeOpen(f), fail),
  plug: () => page.evaluate(() => (window as unknown as { __p12Midi: SyntheticMidi }).__p12Midi.plug()),
  unplug: () => page.evaluate(() => (window as unknown as { __p12Midi: SyntheticMidi }).__p12Midi.unplug()),
});

const PREFS = "loop-vault:live-midi-preferences:v1";
const CONNECTION = "loop-vault:live-midi-connection:v1";
const chip = (page: Page) => page.locator(".lv-midi-chip");
const panel = (page: Page) => page.getByTestId("midi-panel");

/** Opens the app with a saved input (`p12-synthetic`) unless told otherwise. Storage is only seeded the first time. */
async function openApp(page: Page, options: { saved?: boolean; autoConnect?: boolean } = {}) {
  const { saved = true, autoConnect = true } = options;
  await page.addInitScript(({ prefs, connection, saved, autoConnect }) => {
    if (!localStorage.getItem(prefs) && saved) {
      localStorage.setItem(prefs, JSON.stringify({ alwaysOnTop: true, showHistory: true, preferredInput: { backendId: "p12-synthetic", name: "合成入力", previousIndex: 0 } }));
    }
    if (!localStorage.getItem(connection)) localStorage.setItem(connection, JSON.stringify({ autoConnect }));
  }, { prefs: PREFS, connection: CONNECTION, saved, autoConnect });
  await page.goto("/?p12=midi");
  await expect(chip(page)).toBeVisible();
}
async function openPanel(page: Page) {
  if (!(await panel(page).isVisible())) await chip(page).click();
  await expect(panel(page)).toBeVisible();
}
const panelButton = (page: Page, name: string) => panel(page).getByRole("button", { name, exact: true });
const savedInput = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").preferredInput?.backendId as string | undefined, PREFS);

test("1 a saved input connects by itself on the home screen within 3 seconds", async ({ page }) => {
  await openApp(page);
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
  await expect(chip(page)).toContainText("合成入力");
});

test("2 moving through every screen keeps the input and never opens or closes it again", async ({ page }) => {
  await openApp(page);
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
  const before = await midi(page).stats();
  expect(before.opens).toBe(1);
  for (const nav of ["vault", "chord-dojo", "bass-practice", "voicing-loop", "settings", "home"]) {
    const link = page.locator(`[data-nav="${nav}"]`);
    if (await link.count()) await link.click();
    await page.waitForTimeout(300);
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected");
    await expect(chip(page)).toContainText("合成入力");
  }
  const after = await midi(page).stats();
  expect(after.opens).toBe(before.opens);
  expect(after.closes).toBe(before.closes);
});

test("3 a manual disconnect stays disconnected", async ({ page }) => {
  await openApp(page);
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
  await openPanel(page);
  await panelButton(page, "切断").click();
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "off");
  await expect(chip(page)).toHaveText("MIDI に接続");
  const stats = await midi(page).stats();
  await page.waitForTimeout(5000);
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "off");
  expect((await midi(page).stats()).opens).toBe(stats.opens);
});

test("4 auto-connect off keeps the next start disconnected; on connects it again", async ({ page }) => {
  await openApp(page);
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
  await openPanel(page);
  await panel(page).getByLabel("起動した時に自動でつなぐ").uncheck();
  expect(await page.evaluate((key) => localStorage.getItem(key), CONNECTION)).toBe('{"autoConnect":false}');
  await page.reload();
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "off");
  await page.waitForTimeout(2000);
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "off");
  expect((await midi(page).stats()).opens).toBe(0);
  await openPanel(page);
  await panel(page).getByLabel("起動した時に自動でつなぐ").check();
  await page.reload();
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
});

test("5 an unplugged input says 「外れました」 and comes back by itself", async ({ page }) => {
  await openApp(page);
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
  await midi(page).unplug();
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "lost");
  await expect(chip(page)).toContainText("合成入力 が外れました");
  await midi(page).plug();
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 10_000 });
  await expect(chip(page)).toHaveText("合成入力");
});

test("6 an open error is shown, nothing is retried by itself, and 「もう一度試す」 tries once", async ({ page }) => {
  await openApp(page, { autoConnect: false });
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "off");
  await midi(page).deferOpen();
  await openPanel(page);
  await panelButton(page, "接続").click();
  await expect.poll(async () => (await midi(page).stats()).opens).toBe(1);
  await midi(page).resumeOpen(true);
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "error");
  await expect(chip(page)).toHaveText("MIDI エラー");
  await page.waitForTimeout(10_000);
  expect((await midi(page).stats()).opens).toBe(1);
  await panelButton(page, "もう一度試す").click();
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected");
  expect((await midi(page).stats()).opens).toBe(2);
});

test("7 disconnecting while connecting closes the late input and it never becomes connected", async ({ page }) => {
  await openApp(page, { autoConnect: false });
  await midi(page).deferOpen();
  await openPanel(page);
  await panelButton(page, "接続").click();
  await expect.poll(async () => (await midi(page).stats()).opens).toBe(1);
  const before = await midi(page).stats();
  await panelButton(page, "切断").click();
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "off");
  await expect(chip(page)).toHaveText("MIDI に接続");
  await midi(page).resumeOpen();
  await expect.poll(async () => (await midi(page).stats()).closes).toBe(before.closes + 1);
  await page.waitForTimeout(5000);
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "off");
  expect((await midi(page).stats()).closes).toBe(before.closes + 1);
});

test("8 choosing B while A is connecting ends on B, saved, and A never overwrites it", async ({ page }) => {
  await openApp(page, { autoConnect: false });
  await midi(page).deferOpen();
  await openPanel(page);
  await panelButton(page, "接続").click();
  await expect.poll(async () => (await midi(page).stats()).opens).toBe(1);
  await panel(page).getByLabel("使う機器").selectOption({ label: "合成入力2" });
  await midi(page).resumeOpen();
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected");
  await expect(chip(page)).toHaveText("合成入力2");
  await page.waitForTimeout(1000);
  await expect(chip(page)).toHaveText("合成入力2");
  expect(await savedInput(page)).toBe("p12-second");
});

test("9 a start after a manual disconnect connects the saved input (the disconnect was for that run only)", async ({ page }) => {
  await openApp(page);
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
  await openPanel(page);
  await panelButton(page, "切断").click();
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "off");
  await page.reload();
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
  await expect(chip(page)).toHaveText("合成入力");
});

// P14 §4: the panel.
test.describe("MIDI panel", () => {
  test("the header button opens the panel, not Live MIDI; Esc closes it and focus returns to the button", async ({ page }) => {
    await openApp(page);
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
    await expect(chip(page)).toHaveAttribute("aria-haspopup", "dialog");
    await expect(chip(page)).toHaveAttribute("aria-expanded", "false");
    await chip(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(chip(page)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-live-midi-mini], [data-testid='live-midi-mini']")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(chip(page)).toBeFocused();
    await chip(page).click();
    await expect(panel(page)).toBeVisible();
    await page.locator("#main-content").click({ position: { x: 10, y: 10 } });
    await expect(panel(page)).toHaveCount(0);
  });

  test("the buttons follow the state table", async ({ page }) => {
    await openApp(page, { autoConnect: false });
    await openPanel(page);
    const names = async () => (await panel(page).locator(".lv-midi-panel-buttons button").allTextContents()).map((text) => text.trim());
    expect(await names()).toEqual(["接続", "機器を探し直す"]);
    await panelButton(page, "接続").click();
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected");
    expect(await names()).toEqual(["切断", "機器を探し直す"]);
    await midi(page).unplug();
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "lost");
    expect(await names()).toEqual(["機器を探し直す", "切断"]);
    await expect(panel(page)).toContainText("USB をつなぎ直すと、自動でもう一度つなぎます");
  });

  test("the panel has no serious or critical accessibility problems", async ({ page }) => {
    await openApp(page);
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
    await openPanel(page);
    const result = await new AxeBuilder({ page: page as never }).include("[data-testid='midi-panel']").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
  });
});

// ---- P14 §3, §5, §5.1, §7: the modes follow the shared state. ----
const DOJO_KEY = "loop-vault:chord-dojo-txt-jazz-v1:data";
const SHAPE: Task = { kind: "shape", key: "preset:basic|close|self|any:quality:maj", quality: "maj", preset: "basic", bass: "self", review: false, roots: [0, 5, 2], seconds: 60 };
const CMAJ = [48, 60, 64, 67];
const emit = (page: Page, notes: number[], on = true) => page.evaluate(({ notes, on }) => (window as unknown as { __p12Midi: SyntheticMidi }).__p12Midi.emit(notes, on), { notes, on });
const held = (page: Page) => page.evaluate(() => (window as unknown as { __p12Midi: SyntheticMidi }).__p12Midi.held());
const monitors = (page: Page) => page.evaluate(() => (window as unknown as { __dojoMonitorCount: number }).__dojoMonitorCount);
const readDojo = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!) as DojoStore, DOJO_KEY);
const dojoRoot = (page: Page) => page.locator(".dojo");

function practiceFile() {
  const file = emptyStore();
  file.knownQualities.maj = { at: "2026-09-01T00:00:00.000Z", nextRecallAt: "2026-11-01T00:00:00.000Z", recallStep: 0 };
  file.today = { date: dateKey(new Date()), tasks: [SHAPE], cursor: { taskIndex: 0, stage: "recall", keyIndex: 0, chordIndex: 0, answerSeen: false, hints: [], tempoResults: [] }, finished: false, added: [], matched: 0, startedAt: new Date().toISOString() };
  return file;
}
function masterFile(cell: CellKey = "A:0") {
  const file = emptyStore();
  file.master251 = emptyMaster();
  for (const entry of Object.values(file.master251.cells)) { entry.learnedAt = "2026-10-01T00:00:00Z"; entry.status = "learning"; }
  file.master251.session = { cell, seed: 123, paused: false, mode: "recall" };
  return file;
}
async function openDojo(page: Page, file?: ReturnType<typeof emptyStore>) {
  if (file) await page.addInitScript(({ key, file }) => localStorage.setItem(key, JSON.stringify(file)), { key: DOJO_KEY, file });
  await openApp(page);
  await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByRole("heading", { name: "今日の練習", exact: true })).toBeVisible();
}
async function startPractice(page: Page) {
  await openDojo(page, practiceFile());
  await page.getByTestId("practice-start").click();
  await expect(page.locator("[data-dojo-screen=practice]")).toBeVisible();
}
async function startMaster(page: Page) {
  await openDojo(page, masterFile());
  await page.getByRole("button", { name: "2-5-1 Master 続きから" }).click();
  await expect(page.getByTestId("master251")).toHaveAttribute("data-cell", "A:0");
}

test.describe("modes follow the shared state", () => {
  /** connected, lost, connected, off, error: the same `kind` on the header and on the screen each time. */
  async function walk(page: Page, screenKind: () => Promise<string | null>) {
    const same = async (kind: string) => {
      await expect(chip(page)).toHaveAttribute("data-midi-kind", kind);
      await expect.poll(screenKind).toBe(kind);
    };
    await same("connected");
    await midi(page).unplug();
    await same("lost");
    await midi(page).plug();
    await same("connected");
    await openPanel(page);
    await panelButton(page, "切断").click();
    await same("off");
    await page.keyboard.press("Escape");
    const opensBefore = (await midi(page).stats()).opens;
    await midi(page).deferOpen();
    await openPanel(page);
    await panelButton(page, "接続").click();
    await expect.poll(async () => (await midi(page).stats()).opens).toBeGreaterThan(opensBefore);
    await midi(page).resumeOpen(true);
    await same("error");
    await page.keyboard.press("Escape");
  }

  test("Chord Dojo shows the same kind as the header", async ({ page }) => {
    await openDojo(page);
    await walk(page, () => dojoRoot(page).getAttribute("data-midi-kind"));
  });

  test("2-5-1 Master shows the same kind as the header", async ({ page }) => {
    await startMaster(page);
    await walk(page, () => page.getByTestId("master251").getAttribute("data-midi-kind"));
  });

  test("Voicing Loop shows the same kind as the header, as the line MIDI 入力：{label}", async ({ page }) => {
    await openApp(page);
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
    await page.locator('[data-nav="voicing-loop"]').click();
    const status = page.getByTestId("voicing-loop-midi-status");
    await expect(status).toContainText("MIDI 入力：合成入力");
    await walk(page, () => status.getAttribute("data-midi-kind"));
    await expect(status).toContainText("MIDI 入力：MIDI エラー");
    await expect(page.getByRole("button", { name: "再接続" })).toHaveCount(0);
  });

  test("a disconnect from the header puts the off notice into the Dojo start screen and Master within a second", async ({ page }) => {
    await openDojo(page, masterFile());
    await expect(page.getByTestId("midi-required-notice")).toHaveCount(0);
    await openPanel(page);
    await panelButton(page, "切断").click();
    await page.keyboard.press("Escape");
    const notice = page.getByTestId("midi-required-notice");
    await expect(notice).toHaveAttribute("data-midi-kind", "off", { timeout: 1000 });
    await expect(notice.getByRole("button", { name: "MIDI に接続" })).toBeVisible();
    await page.getByRole("button", { name: "2-5-1 Master 続きから" }).click();
    const masterNotice = page.getByTestId("master251").getByTestId("midi-required-notice");
    await expect(masterNotice).toHaveAttribute("data-midi-kind", "off");
    await masterNotice.getByRole("button", { name: "MIDI に接続" }).click();
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected");
    await expect(masterNotice).toHaveCount(0);
  });

  test("MIDI 設定 in Dojo practice opens the panel; closing returns focus to that button", async ({ page }) => {
    await startPractice(page);
    const dojoButton = page.locator(".dojo-flow").getByRole("button", { name: "MIDI 設定", exact: true });
    await dojoButton.click();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(dojoButton).toBeFocused();
  });

  test("MIDI 設定 in Master pauses, opens the panel, and returns focus to the button on Escape", async ({ page }) => {
    await startMaster(page);
    const button = page.locator(".master251-midi");
    await button.click();
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId("master251")).toHaveAttribute("data-phase", "paused");
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
  });
});

test.describe("a drop in the middle of a practice (5.1)", () => {
  test("Chord Dojo stops, records nothing, never turns into self-rating by itself, and continues the same task when MIDI returns", async ({ page }) => {
    await startPractice(page);
    const cursor = await dojoRoot(page).getAttribute("data-dojo-cursor");
    const matched = (await readDojo(page)).today!.matched;
    await emit(page, [48]);
    await midi(page).unplug();
    await expect(dojoRoot(page)).toHaveAttribute("data-midi-kind", "lost");
    const notice = page.getByTestId("midi-required-notice");
    await expect(notice).toContainText("MIDI が外れました。つなぎ直すと、この課題から続けます。");
    await expect(dojoRoot(page)).toHaveAttribute("data-dojo-midi-mode", "midi");
    await expect(page.getByRole("button", { name: "弾けた（Y）" })).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect((await readDojo(page)).today!.matched).toBe(matched);
    await midi(page).plug();
    await expect(dojoRoot(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 10_000 });
    await expect(notice).toHaveCount(0);
    await expect(dojoRoot(page)).toHaveAttribute("data-dojo-cursor", cursor!);
    await expect(dojoRoot(page)).toHaveAttribute("data-dojo-midi-mode", "midi");
    await emit(page, [48], false);
    await emit(page, CMAJ);
    await expect(page.locator(".dojo-result")).toContainText("合いました");
  });

  test("Chord Dojo changes to self-rating only when the person asks", async ({ page }) => {
    await startPractice(page);
    await midi(page).unplug();
    await expect(page.getByTestId("midi-required-notice")).toBeVisible();
    await page.getByRole("button", { name: "自分で判定に切り替える" }).click();
    await expect(dojoRoot(page)).toHaveAttribute("data-dojo-midi-mode", "self");
    await expect(page.getByTestId("midi-required-notice")).toHaveCount(0);
  });

  test("Master pauses on a drop and starts the same cell again once MIDI is back and every key is up", async ({ page }) => {
    await startMaster(page);
    const master = page.getByTestId("master251");
    await midi(page).unplug();
    await expect(master).toHaveAttribute("data-phase", "paused");
    await expect(master.getByTestId("midi-required-notice")).toContainText("MIDI が外れました。つなぎ直すと、この課題から続けます。");
    await midi(page).plug();
    await expect(master).not.toHaveAttribute("data-phase", "paused", { timeout: 10_000 });
    await expect(master).toHaveAttribute("data-cell", "A:0");
  });

  test("a pause by the person is not resumed by MIDI coming back", async ({ page }) => {
    await startMaster(page);
    const master = page.getByTestId("master251");
    await page.locator(".master251-midi").click();
    await expect(master).toHaveAttribute("data-phase", "paused");
    await page.keyboard.press("Escape");
    await midi(page).unplug();
    await midi(page).plug();
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 10_000 });
    await page.waitForTimeout(1000);
    await expect(master).toHaveAttribute("data-phase", "paused");
  });
});

test.describe("real input reaches the screens (7)", () => {
  test("Chord Dojo: one Note On judges once, one subscription, one piano monitor, nothing doubled after moving between screens", async ({ page }) => {
    await openDojo(page, practiceFile());
    for (const nav of ["home", "chord-dojo", "home", "chord-dojo"]) {
      await page.locator(`[data-nav="${nav}"]`).click();
      await page.waitForTimeout(300);
    }
    await page.getByTestId("practice-start").click();
    await expect(page.locator("[data-dojo-screen=practice]")).toBeVisible();
    const before = (await readDojo(page)).today!.matched;
    await emit(page, CMAJ);
    await expect(page.locator(".dojo-result")).toContainText("合いました");
    expect(await held(page)).toBe(CMAJ.length);
    await emit(page, CMAJ, false);
    await expect.poll(async () => (await readDojo(page)).today?.matched ?? before + 1).toBe(before + 1);
    await page.waitForTimeout(800);
    expect((await readDojo(page)).today?.matched ?? before + 1).toBe(before + 1);
    expect((await midi(page).stats()).listeners).toBe(1);
    await expect.poll(() => monitors(page)).toBe(1);
  });

  test("a disconnect and a connect while keys are held leaves no stuck notes; the next Note On is judged", async ({ page }) => {
    await startPractice(page);
    await emit(page, [48]);
    expect(await held(page)).toBe(1);
    await openPanel(page);
    await panelButton(page, "切断").click();
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "off");
    await panelButton(page, "接続").click();
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected");
    expect(await held(page)).toBe(0);
    await page.keyboard.press("Escape");
    await emit(page, CMAJ);
    await expect(page.locator(".dojo-result")).toContainText("合いました");
  });

  test("an unplug and a plug while keys are held leaves no stuck notes; the next Note On is judged", async ({ page }) => {
    await startPractice(page);
    await emit(page, [48]);
    await midi(page).unplug();
    await midi(page).plug();
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 10_000 });
    expect(await held(page)).toBe(0);
    await emit(page, CMAJ);
    await expect(page.locator(".dojo-result")).toContainText("合いました");
  });

  test("2-5-1 Master: the first chord is judged from real input", async ({ page }) => {
    await startMaster(page);
    const master = page.getByTestId("master251");
    await expect(master).toHaveAttribute("data-chord-index", "0");
    await page.waitForTimeout(500);
    await emit(page, [...targetForCell("A:0").chords[0].notes]);
    await expect(master).toHaveAttribute("data-chord-index", "1");
  });

  test("Voicing Loop: a pressed key shows as held on the keyboard", async ({ page }) => {
    await openApp(page);
    await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
    await page.locator('[data-nav="voicing-loop"]').click();
    await emit(page, [60]);
    await expect(page.locator('[data-midi-note="60"]').first()).toHaveAttribute("data-visual-state", /held/);
  });
});
