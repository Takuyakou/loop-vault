import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeMidi, type MidiEvent } from "midi-file";
import {
  analyzeCurrentMidi,
  assertNoHorizontalOverflow,
  chooseFirstCandidate,
  loadMidiForPreAnalysis,
  openApp,
  openBassPractice,
  saveChosenRange,
} from "./helpers/app";
import { setTakePlan, stageMicrophone } from "./helpers/bass-stage";
import { captureReportShot } from "./helpers/reportShots";
import { createMidiFixture } from "./helpers/midiFixture";
import { bassPracticeFromVault } from "./helpers/practice";

/**
 * P23-62: the Bass Practice stage (1 聴く → 2 弾く → 3 結果) for 度数・リズム・ルートの動き. P23-63 puts
 * コード進行のベース on the same stage (S8/S9). The microphone is Chromium's fake device plus the synthetic bass in
 * `helpers/bass-stage.ts`; the take still goes through the real WebAudio → MediaRecorder → decoding → analysis worker.
 * The no-input case is its own file (Playwright only takes the launch flags for a whole file, not for one describe).
 */
test.use({ launchOptions: { args: ["--disable-audio-output", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

const PRACTICE_FILE = "loop-vault:practice-v1:data";

type StageMode = "degree" | "rhythm" | "root-motion" | "bassline" | "midi";

const degree = (page: Page) => page.getByTestId("degree-echo-view");
const rhythm = (page: Page) => page.getByTestId("rhythm-echo-view");
const rootMotion = (page: Page) => page.getByTestId("root-motion-echo-view");
const bassline = (page: Page) => page.getByTestId("bassline-echo-view");
const midi = (page: Page) => page.getByTestId("midi-bass-practice");

const viewOf = (page: Page, mode: StageMode) =>
  mode === "degree"
    ? degree(page)
    : mode === "rhythm"
      ? rhythm(page)
      : mode === "root-motion"
        ? rootMotion(page)
        : mode === "bassline"
          ? bassline(page)
          : midi(page);

const MODE_NAMES: Record<StageMode, string> = {
  degree: "度数",
  rhythm: "リズム",
  "root-motion": "ルートの動き",
  bassline: "コード進行のベース",
  midi: "MIDI のベースライン",
};

/** 4-bar 120 BPM fixture for P23-64 S7 & report screenshots (first 2 bars match the mock's C2 C2 G2 A2 F2 F2 C2 D2). */
function sampleMidiBassBuffer(): Buffer {
  const bassPitches = [36, 36, 43, 45, 41, 41, 36, 38, 36, 36, 43, 45, 41, 41, 36, 38];
  const bassNotes: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "trackName", text: "Sample Bass" },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 33 },
  ];
  for (const pitch of bassPitches) {
    bassNotes.push(
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: pitch, velocity: 90 },
      { deltaTime: 360, type: "noteOff", channel: 0, noteNumber: pitch, velocity: 0 },
      { deltaTime: 120, type: "text", text: "beat" },
    );
  }
  bassNotes.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  const harmonyNotes: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "trackName", text: "Chords" },
    { deltaTime: 0, type: "programChange", channel: 1, programNumber: 4 },
  ];
  for (const chord of [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]) {
    chord.forEach((p) => harmonyNotes.push({ deltaTime: 0, type: "noteOn", channel: 1, noteNumber: p, velocity: 70 }));
    chord.forEach((p, i) => harmonyNotes.push({ deltaTime: i === 0 ? 1920 : 0, type: "noteOff", channel: 1, noteNumber: p, velocity: 0 }));
  }
  harmonyNotes.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return Buffer.from(writeMidi({
    header: { format: 1, numTracks: 3, ticksPerBeat: 480 },
    tracks: [
      [
        { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
        { deltaTime: 0, meta: true, type: "timeSignature", numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
        { deltaTime: 0, meta: true, type: "endOfTrack" },
      ],
      bassNotes,
      harmonyNotes,
    ],
  }));
}

async function openMidiPractice(page: Page, title = "サンプルのベース") {
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.getByTestId("bass-practice-home")).toBeVisible();
  await openBassPractice(page, "MIDI のベースライン");
  await expect(page.getByTestId("midi-bass-library")).toBeVisible();
  const existing = page.getByTestId("midi-bass-library").getByRole("button", { name: title, exact: true });
  if (await existing.count() > 0) {
    await existing.first().click();
  } else {
    await page.getByRole("button", { name: "＋ MIDI を読み込む" }).click();
    await page.getByLabel("MIDIファイル", { exact: true }).setInputFiles({
      name: "sample-bass.mid",
      mimeType: "audio/midi",
      buffer: sampleMidiBassBuffer(),
    });
    await page.getByLabel("曲名", { exact: true }).fill(title);
    await page.getByRole("button", { name: "保存して練習する" }).click();
  }
  await expect(midi(page)).toBeVisible();
}

async function openMode(page: Page, mode: StageMode) {
  if (mode === "midi") { await openMidiPractice(page); return; }
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.getByTestId("bass-practice-home")).toBeVisible();
  await openBassPractice(page, MODE_NAMES[mode]);
  await expect(viewOf(page, mode)).toBeVisible();
}

const laneNotes = (page: Page, mode: StageMode) =>
  viewOf(page, mode).locator("[data-testid='bp-lane'] .bp-lane-row[aria-label='お手本の段'] .bp-note");

/** 「お手本 1 音目 1 C3」 → the note name at the end (the degree and beat words are ignored). */
async function noteNames(page: Page, mode: StageMode): Promise<string[]> {
  const labels = await laneNotes(page, mode).evaluateAll((notes) => notes.map((note) => note.getAttribute("aria-label") ?? ""));
  return labels.map((label) => label.split(" ").at(-1) ?? "");
}

/** C3 → 48 (the lane spells ♭/♯). */
function midiOf(name: string): number {
  const match = /^([A-G])([♭♯]?)(-?\d+)$/.exec(name);
  if (!match) throw new Error(`cannot read the note ${name}`);
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const accidental = match[2] === "♭" ? -1 : match[2] === "♯" ? 1 : 0;
  return 12 * (Number(match[3]) + 1) + (base[match[1]!] ?? 0) + accidental;
}

/** The beats of the お手本 notes, read from 「n 音目 <beat> 拍目」 (リズム; eighths give e.g. 「1.5 拍目」). */
async function beatsOf(page: Page, mode: "rhythm"): Promise<number[]> {
  const labels = await laneNotes(page, mode).evaluateAll((notes) => notes.map((note) => note.getAttribute("aria-label") ?? ""));
  return labels.map((label) => Number(/([\d.]+) 拍目/.exec(label)?.[1] ?? "1") - 1);
}

async function openAllHints(page: Page, mode: StageMode) {
  const view = viewOf(page, mode);
  for (let index = 0; index < 4; index += 1) {
    const next = view.locator(".bp-hint[data-state='next']");
    if (await next.count() === 0) return;
    await next.click();
  }
}

async function listen(page: Page, mode: StageMode) {
  await viewOf(page, mode).locator(`[data-testid='${mode}-listen']`).click();
  // 度数 goes to 思い出す (recall), リズム and コード進行のベース keep their own word for 「聴いた」, ルートの動き goes to
  // the answer stage.
  const after = mode === "degree" ? "recall" : mode === "rhythm" || mode === "bassline" ? "heard" : "identify";
  await expect(viewOf(page, mode)).toHaveAttribute("data-practice-state", after, { timeout: 20_000 });
}

/** コード進行のベース: ▶ plays the whole phrase; the stage unlocks 2 弾く when it ends (▶ turns back). */
async function listenToTheEnd(page: Page) {
  const view = bassline(page);
  await view.locator("[data-testid='bassline-listen']").click();
  await expect(view.locator("[data-testid='bassline-listen']")).toHaveAttribute("aria-label", "止める", { timeout: 10_000 });
  await expect(view.locator("[data-testid='bassline-listen']")).toHaveAttribute("aria-label", "お手本を聴く", { timeout: 20_000 });
}

/** ルートの動き: answer the first motion (the level decides how much is asked). */
async function answerFirstMotion(view: Locator) {
  const answers = view.locator("[aria-label='答え'] button");
  await answers.first().click();
  for (const group of ["種類", "半音"]) {
    const option = answers.filter({ hasText: group });
    if (await option.count()) await option.first().click();
  }
  const submit = view.locator("[data-testid='root-motion-submit']");
  if (await submit.isEnabled()) await submit.click();
  await expect(view.locator("[data-testid='root-motion-first-answer']")).toBeVisible();
}

const bpmOf = async (page: Page, mode: StageMode) => {
  const meta = await viewOf(page, mode).locator(".bp-meta").textContent();
  return Number(/(\d+) BPM/.exec(meta ?? "")?.[1] ?? "88");
};

async function readPracticeFile(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown> | null, PRACTICE_FILE);
}

async function attemptsWithRating(page: Page, rating: string): Promise<number> {
  const file = await readPracticeFile(page);
  const attempts = (file?.attempts ?? []) as { rating?: string }[];
  return attempts.filter((attempt) => attempt.rating === rating).length;
}

async function historyCount(page: Page, key: "chordContextHistory" | "sourceBasslineHistory"): Promise<number> {
  const file = await readPracticeFile(page);
  return ((file?.[key] ?? []) as unknown[]).length;
}

/** P23-63: the 条件 panel lives in the top band (not inside the stage), so it is reached from the page. */
const conditionsPanel = (page: Page) => page.getByRole("dialog", { name: "コード進行のベースの条件" });
async function openConditions(page: Page) {
  if (!(await conditionsPanel(page).isVisible().catch(() => false))) await page.getByTestId("bassline-conditions").click();
  await expect(conditionsPanel(page)).toBeVisible();
}

/** P10.0-07: a Vault progression with a saved source bassline (the same fixture phase5.22 uses). */
async function saveSyntheticSourceBassline(page: Page): Promise<void> {
  await loadMidiForPreAnalysis(page, createMidiFixture({ bars: 16, voiceCount: 3 }), "synthetic-source-practice.mid");
  await analyzeCurrentMidi(page);
  await chooseFirstCandidate(page);
  const form = page.getByTestId("correction-save-form");
  await form.locator("summary", { hasText: "詳しい設定" }).click();
  const panel = form.getByTestId("source-bassline-capture-panel");
  await panel.getByLabel(/Bass Voiceを選択/).selectOption({ index: 1 });
  const range = panel.getByLabel(/保存する範囲/);
  await expect(range).toBeEnabled();
  await range.selectOption({ index: 1 });
  await panel.getByRole("checkbox", { name: /元ベースラインを練習用に保存/ }).check();
  await saveChosenRange(page, "Synthetic source practice");
}

test.describe("with a microphone", () => {
  test("S1 度数: listen, hint, one wrong note, and the rating the take suggests", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await stageMicrophone(page);
    await openMode(page, "degree");
    const view = degree(page);
    await expect(view).toHaveAttribute("data-stage-step", "0");
    await expect(view.locator("[data-testid='degree-record']")).toBeDisabled();

    await listen(page, "degree");
    await openAllHints(page, "degree");
    const names = await noteNames(page, "degree");
    expect(names.length).toBeGreaterThanOrEqual(3);
    const pitches = names.map(midiOf);
    const beats = pitches.map((_, index) => index);
    const bpm = await bpmOf(page, "degree");
    // One wrong note (the third, two semitones up) and everything else right.
    await setTakePlan(page, pitches.map((pitch, index) => ({ pitch: index === 2 ? pitch + 2 : pitch, beat: beats[index]! })), bpm);

    await expect(view.locator("[data-testid='degree-record']")).toBeEnabled();
    await view.locator("[data-testid='degree-record']").click();
    await expect(view).toHaveAttribute("data-stage-step", "1", { timeout: 10_000 });
    await expect(view).toHaveAttribute("data-stage-step", "2", { timeout: 40_000 });

    await expect(view.locator("[data-testid='bp-result-big'] b")).toHaveText(`3 / ${pitches.length}`);
    await expect(view.locator("[data-testid='bp-result-big'] b")).toHaveText(/^3 \/ \d+$/);
    await expect(view.locator("[data-testid='bp-result-facts']")).toContainText("音が違う 1");
    // 3 of 4 suggests 良い; the hints are all open, so it is the same 良い.
    await expect(view.locator("[data-review-rating='good']")).toHaveAttribute("aria-pressed", "true");
    await expect(view.locator("[data-testid='bp-result-facts']")).toContainText("ヒント 3 段");

    const before = await attemptsWithRating(page, "good");
    await view.locator("[data-testid='degree-next']").click();
    await expect(view).toHaveAttribute("data-stage-step", "0", { timeout: 20_000 });
    await expect(view).toHaveAttribute("data-practice-state", "ready");
    await expect.poll(async () => attemptsWithRating(page, "good")).toBe(before + 1);
  });

  test("S2 度数 without recording: the answer and a rating chosen by the player", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await stageMicrophone(page);
    await openMode(page, "degree");
    const view = degree(page);
    await listen(page, "degree");
    await view.getByRole("button", { name: "録らずに弾く" }).click();
    await expect(view).toHaveAttribute("data-stage-step", "1");
    await expect(view).toContainText("ベースで弾いてください");
    await view.getByRole("button", { name: /弾けた・答えを見る/ }).click();
    await expect(view).toHaveAttribute("data-stage-step", "2");
    await expect(view.locator("[data-testid='bp-result-big'] b")).toHaveText("答え");
    await expect(view.locator("[data-review-rating][aria-pressed='true']")).toHaveCount(0);
    await expect(view.locator("[data-testid='degree-next']")).toBeDisabled();
    await view.locator("[data-review-rating='good']").click();
    await expect(view.locator("[data-testid='degree-next']")).toBeEnabled();
  });

  test("S3 度数 in another key: the transfer banner, no hints, and listening as often as wanted", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await stageMicrophone(page);
    await openMode(page, "degree");
    const view = degree(page);
    await listen(page, "degree");
    await view.getByRole("button", { name: "録らずに弾く" }).click();
    await view.getByRole("button", { name: /弾けた・答えを見る/ }).click();
    await view.locator("[data-review-rating='good']").click();
    await view.locator("[data-testid='degree-transfer']").click();
    await expect(view).toHaveAttribute("data-practice-state", "transfer");
    await expect(view).toHaveAttribute("data-stage-step", "0");
    await expect(view.locator("[data-testid='degree-transfer-relation']")).toContainText("別のキーで：");
    await expect(view.locator("[data-testid='degree-transfer-relation']")).toContainText("メジャー → ");
    await expect(view.locator(".bp-hint")).toHaveCount(0);
    await expect(view).toContainText("何度でも聴けます");
  });

  test("S4 リズム: judged on timing only, and the next rhythm is a different one", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await stageMicrophone(page);
    await openMode(page, "rhythm");
    const view = rhythm(page);
    await listen(page, "rhythm");
    await openAllHints(page, "rhythm");
    const beats = await beatsOf(page, "rhythm");
    const bpm = await bpmOf(page, "rhythm");
    // Any pitch: リズム judges the timing alone.
    await setTakePlan(page, beats.map((beat) => ({ pitch: 40, beat })), bpm);
    await view.locator("[data-testid='rhythm-record']").click();
    await expect(view).toHaveAttribute("data-stage-step", "2", { timeout: 40_000 });
    const big = await view.locator("[data-testid='bp-result-big'] b").textContent();
    expect(big).toMatch(/^(\d+) \/ \1$/);
    await expect(view.locator("[data-testid='bp-result-big'] b")).toHaveText(/^\d+ \/ \d+$/);
    await expect(view.locator("[data-testid='bp-result-facts']")).toContainText("音の高さは見ません");
    await expect(view.locator("[data-testid='bp-result-facts']")).toContainText("合った");
    await expect(view.locator("[data-review-rating='good']")).toHaveAttribute("aria-pressed", "true");
    const before = { beats, count: beats.length };
    await view.locator("[data-testid='rhythm-next']").click();
    await expect(view).toHaveAttribute("data-stage-step", "0", { timeout: 20_000 });
    await expect(view).toHaveAttribute("data-practice-state", "ready");
    await listen(page, "rhythm");
    await openAllHints(page, "rhythm");
    const next = await beatsOf(page, "rhythm");
    expect(`${next.length}:${next.join(",")}`, "the next rhythm is another one").not.toBe(`${before.count}:${before.beats.join(",")}`);
  });

  test("S5 ルートの動き: answer, hear it again, take, and the history keeps the first answer", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await stageMicrophone(page);
    await openMode(page, "root-motion");
    const view = rootMotion(page);
    await listen(page, "root-motion");
    await expect(view).toContainText("1 つめから 2 つめへ、ルートはどう動きましたか？");
    const choices = view.locator("[aria-label='答え'] button");
    await expect(choices.first()).toBeVisible();
    await choices.first().click();
    // The level may ask for the kind and the semitones too; answer whatever is shown.
    for (const group of ["種類", "半音"]) {
      const option = view.locator(`[aria-label='答え'] button`).filter({ hasText: group });
      if (await option.count()) await option.first().click();
    }
    const submit = view.locator("[data-testid='root-motion-submit']");
    if (await submit.isEnabled()) await submit.click();
    await expect(view.locator("[data-testid='root-motion-first-answer']")).toBeVisible();
    // P23-62: after the answer the phrase can still be heard.
    const play = view.locator("[data-testid='root-motion-listen']");
    await expect(play).toBeEnabled();
    await play.click();

    await openAllHints(page, "root-motion");
    const names = await noteNames(page, "root-motion");
    const bpm = await bpmOf(page, "root-motion");
    await setTakePlan(page, names.map(midiOf).map((pitch, index) => ({ pitch, beat: index })), bpm);
    await expect(view.locator("[data-testid='root-motion-record']")).toBeEnabled();
    await view.locator("[data-testid='root-motion-record']").click();
    await expect(view).toHaveAttribute("data-stage-step", "2", { timeout: 40_000 });
    await expect(view.locator("[data-testid='bp-result-big'] b")).toHaveText(/^\d+ \/ \d+$/);
    await view.locator("[data-review-rating='good']").click();
    await view.locator("[data-testid='root-motion-next']").click();
    await expect(view).toHaveAttribute("data-stage-step", "0", { timeout: 20_000 });

    const file = await readPracticeFile(page);
    const histories = Object.values(file ?? {}).filter((value) => Array.isArray(value)
      && value.some((entry) => typeof entry === "object" && entry !== null && "firstAnswer" in entry));
    expect(histories.length, "a history with the first answer is kept").toBeGreaterThan(0);
    const kept = histories.flat() as { firstAnswer?: unknown }[];
    expect(kept.filter((entry) => entry.firstAnswer).length).toBeGreaterThanOrEqual(1);
  });

  test("S7 the stage's shape at 1440×900, 1280×720, and 960×1032", async ({ page }) => {
    test.setTimeout(360_000);
    await stageMicrophone(page);
    // P25 T3: the four modes at 1440×900; 1280×720 and 960×1032 with one mode (root-motion: the rating row sits
    // between the lane and the buttons, so its 段 3 is the tallest).
    const runs = [
      ...(["degree", "rhythm", "root-motion", "bassline"] as const).map((mode) => ({ mode, size: { width: 1440, height: 900 } })),
      { mode: "root-motion" as const, size: { width: 1280, height: 720 } },
      { mode: "root-motion" as const, size: { width: 960, height: 1032 } },
    ];
    for (const { mode, size } of runs) {
      await page.setViewportSize(size);
      await openMode(page, mode);
      await expectStageShape(page, mode, size, false);
      // 段 3 too (the result), by the short self-rated way.
      const view = viewOf(page, mode);
      await listen(page, mode);
      if (mode === "root-motion") await answerFirstMotion(view);
      await view.getByRole("button", { name: "録らずに弾く" }).click();
      await view.getByRole("button", { name: /弾けた・答えを見る/ }).click();
      await expect(view).toHaveAttribute("data-stage-step", "2");
      await expectStageShape(page, mode, size, true);
      await page.locator('[data-nav="bass-practice"]').click();
    }
    // P23-64: MIDI のベースライン stage shape at 1440×900 and 960×1032 (段 1 and 段 3).
    for (const size of [{ width: 1440, height: 900 }, { width: 960, height: 1032 }]) {
      await page.setViewportSize(size);
      await openMidiPractice(page);
      await expect(midi(page)).toHaveAttribute("data-stage-step", "0");
      await expectStageShape(page, "midi", size, false);
      const pitches = [36, 36, 43, 45, 41, 41, 36, 38];
      await setTakePlan(page, pitches.map((pitch, beat) => ({ pitch, beat })), 120);
      await midi(page).getByTestId("midi-record").click();
      await expect(midi(page)).toHaveAttribute("data-stage-step", "2", { timeout: 40_000 });
      await expectStageShape(page, "midi", size, true);
    }
  });

  /** P23-63 S8: コード進行のベース — ▶ to the end, the answer's notes, 「n / n」, then 記録して次へ writes one history. */
  test("S8 コード進行のベース: listen to the end, one correct take, and 記録して次へ leaves a history and returns to 1 聴く", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await stageMicrophone(page);
    await openMode(page, "bassline");
    const view = bassline(page);
    await expect(view).toHaveAttribute("data-stage-step", "0");
    await expect(view.locator("[data-testid='bassline-record']")).toBeDisabled();
    await expect(view).toContainText("まず ▶ で聴きます");

    await listenToTheEnd(page);
    await expect(view).toHaveAttribute("data-practice-state", "heard");
    await expect(view.locator("[data-testid='bassline-record']")).toBeEnabled();

    await openAllHints(page, "bassline");
    const names = await noteNames(page, "bassline");
    expect(names.length).toBeGreaterThanOrEqual(3);
    await setTakePlan(page, names.map(midiOf).map((pitch, index) => ({ pitch, beat: index })), await bpmOf(page, "bassline"));
    await view.locator("[data-testid='bassline-record']").click();
    await expect(view).toHaveAttribute("data-stage-step", "1", { timeout: 10_000 });
    await expect(view).toHaveAttribute("data-stage-step", "2", { timeout: 40_000 });

    await expect(view.locator("[data-testid='bp-result-big'] b")).toHaveText(/^(\d+) \/ \1$/);
    await expect(view.locator("[data-testid='bp-result-facts']")).toContainText("伴奏 コードのみ");
    await expect(view).toContainText("『記録して次へ』で練習の記録に残します(判定の数は残しません)");
    // The result's lanes: the chords, the answer with names, and the take.
    await expect(view.locator(".bp-lane-row[aria-label='コードの段']")).toBeVisible();
    await expect(view.locator(".bp-lane-row[aria-label='自分の段'] .bp-note")).not.toHaveCount(0);
    // No rating: this practice's record has no rating to choose.
    await expect(view.locator("[data-review-rating]")).toHaveCount(0);

    const before = await historyCount(page, "chordContextHistory");
    await view.locator("[data-testid='bassline-next']").click();
    await expect(view.getByTestId("bassline-history-error")).toHaveCount(0);
    await expect(view).toHaveAttribute("data-stage-step", "0", { timeout: 20_000 });
    await expect.poll(async () => historyCount(page, "chordContextHistory")).toBe(before + 1);
  });

  /** P23-63 S9: 元ベースライン — 条件 → 元のベースライン, one take, then the window moves to the next one. */
  test("S9 元ベースライン: choose the saved source, take it, and 記録して次へ moves to the next window", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await stageMicrophone(page);
    await openApp(page);
    await saveSyntheticSourceBassline(page);
    await page.locator('[data-nav="vault"]').click();
    await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
    await bassPracticeFromVault(page);
    const view = bassline(page);
    await expect(view).toBeVisible();

    await openConditions(page);
    await page.getByTestId("bassline-line-source").selectOption("source-bassline");
    await page.getByTestId("source-bassline-vault-select").selectOption({ index: 1 });
    await expect(page.getByTestId("source-bassline-range")).toHaveText("1〜2小節");
    await expect(view).toContainText("元のベースラインを聴いて弾きます");
    await expect(page.getByTestId("bassline-conditions")).toContainText("元のベースライン · 1〜2 小節 · レベル 3");

    await listenToTheEnd(page);
    await expect(view.locator("[data-testid='bassline-record']")).toBeEnabled();
    // Some sound has to reach the recorder (silence cancels the take); the notes themselves are not judged here.
    await setTakePlan(page, [{ pitch: 40, beat: 0, seconds: 2 }], await bpmOf(page, "bassline"));
    const before = await historyCount(page, "sourceBasslineHistory");
    await view.locator("[data-testid='bassline-record']").click();
    await expect(view).toHaveAttribute("data-stage-step", "2", { timeout: 40_000 });
    await view.locator("[data-testid='bassline-next']").click();
    await expect(view).toHaveAttribute("data-stage-step", "0", { timeout: 20_000 });
    await openConditions(page);
    await expect(page.getByTestId("source-bassline-range")).toHaveText("3〜4小節");
    await expect.poll(async () => historyCount(page, "sourceBasslineHistory")).toBe(before + 1);
  });

  test("the stage's report screenshots", async ({ page }) => {
    test.setTimeout(300_000);
    await stageMicrophone(page);
    for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(size);
      const suffix = String(size.width);

      // 度数: 段 1, 輪郭を開いた段 1, and 段 2 (counting / recording) with the notes still hidden as in the mock.
      await openMode(page, "degree");
      await captureReportShot(page, `p23-62-assets/degree-1-listen-${suffix}.png`);
      await listen(page, "degree");
      const view = degree(page);
      await view.locator(".bp-hint[data-state='next']").first().click();
      await captureReportShot(page, `p23-62-assets/degree-1-listen-hint-${suffix}.png`);
      // The take only has to be running to photograph the count-in and the recording; the notes stay hid.
      await setTakePlan(page, [{ pitch: 28, beat: 0 }], await bpmOf(page, "degree"));
      await view.locator("[data-testid='degree-record']").click();
      // 度数 keeps data-practice-state on the session (思い出す); the count-in and the recording are read from the stage.
      await expect(view.locator(".bp-count")).toBeVisible({ timeout: 20_000 });
      await captureReportShot(page, `p23-62-assets/degree-2-count-${suffix}.png`);
      await expect(view).toContainText("クリックに合わせて弾いてください", { timeout: 20_000 });
      await captureReportShot(page, `p23-62-assets/degree-2-record-${suffix}.png`);

      // 度数 段 3 with the mock's 3 / 4: one note wrong out of four, read from the opened hints.
      await openMode(page, "degree");
      await listen(page, "degree");
      await openAllHints(page, "degree");
      const names = await noteNames(page, "degree");
      await setTakePlan(page, names.map(midiOf).map((pitch, index) => ({ pitch: index === 2 ? pitch + 2 : pitch, beat: index })), await bpmOf(page, "degree"));
      await degree(page).locator("[data-testid='degree-record']").click();
      await expect(degree(page)).toHaveAttribute("data-stage-step", "2", { timeout: 40_000 });
      await captureReportShot(page, `p23-62-assets/degree-3-result-${suffix}.png`);

      // 度数: 録らずに弾く (段 2) and the self-rated 段 3.
      await openMode(page, "degree");
      await listen(page, "degree");
      await degree(page).getByRole("button", { name: "録らずに弾く" }).click();
      await expect(degree(page)).toHaveAttribute("data-stage-step", "1");
      await captureReportShot(page, `p23-62-assets/degree-2-self-${suffix}.png`);
      await degree(page).getByRole("button", { name: /弾けた・答えを見る/ }).click();
      await expect(degree(page)).toHaveAttribute("data-stage-step", "2");
      await captureReportShot(page, `p23-62-assets/degree-3-self-${suffix}.png`);

      // リズム: 段 1 after listening, and the judged 段 3.
      await openMode(page, "rhythm");
      await listen(page, "rhythm");
      await captureReportShot(page, `p23-62-assets/rhythm-1-listen-${suffix}.png`);
      await openAllHints(page, "rhythm");
      const beats = await beatsOf(page, "rhythm");
      await setTakePlan(page, beats.map((beat) => ({ pitch: 40, beat })), await bpmOf(page, "rhythm"));
      await rhythm(page).locator("[data-testid='rhythm-record']").click();
      await expect(rhythm(page)).toHaveAttribute("data-stage-step", "2", { timeout: 40_000 });
      await captureReportShot(page, `p23-62-assets/rhythm-3-result-${suffix}.png`);

      // ルートの動き: 段 1 with the direction chosen, after the answer, and the self-rated 段 3.
      await openMode(page, "root-motion");
      await listen(page, "root-motion");
      const root = rootMotion(page);
      await root.locator("[aria-label='答え'] button").first().click();
      for (const group of ["種類", "半音"]) {
        const option = root.locator("[aria-label='答え'] button").filter({ hasText: group });
        if (await option.count()) await option.first().click();
      }
      await captureReportShot(page, `p23-62-assets/root-1-identify-${suffix}.png`);
      const submit = root.locator("[data-testid='root-motion-submit']");
      if (await submit.isEnabled()) await submit.click();
      await openAllHints(page, "root-motion");
      await captureReportShot(page, `p23-62-assets/root-1-answered-${suffix}.png`);
      await root.getByRole("button", { name: "録らずに弾く" }).click();
      await root.getByRole("button", { name: /弾けた・答えを見る/ }).click();
      await root.locator("[data-review-rating='good']").click();
      await captureReportShot(page, `p23-62-assets/root-3-result-${suffix}.png`);

      await page.locator('[data-nav="bass-practice"]').click();
      await expect(page.getByTestId("bass-practice-home")).toBeVisible();
      await captureReportShot(page, `p23-62-assets/home-${suffix}.png`);
    }
  });

  /** P23-63: コード進行のベース — 段 1, 段 2 (recording), 段 3 and 条件を開いた所, at both sizes. */
  test("the コード進行のベース report screenshots (P23-63)", async ({ page }) => {
    test.setTimeout(240_000);
    await stageMicrophone(page);
    for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(size);
      const suffix = String(size.width);

      // 条件を開いた所 (the whole settings panel in the top band). The mock's photo is レベル 2.
      await openMode(page, "bassline");
      await expect(bassline(page)).toHaveAttribute("data-stage-step", "0");
      await openConditions(page);
      await page.locator("#bassline-level").selectOption("2");
      await expect(page.getByTestId("bassline-conditions")).toContainText("レベル 2");
      await captureReportShot(page, `p23-63-assets/bassline-conditions-${suffix}.png`);
      await page.getByTestId("bassline-conditions").click();
      await expect(conditionsPanel(page)).toBeHidden();

      // 段 1 as the mock draws it: nothing heard yet, the notes still 「?」.
      await captureReportShot(page, `p23-63-assets/bassline-1-listen-${suffix}.png`);

      // 段 2 (recording) and 段 3 with the mock's shape: three right, one wrong pitch, one late.
      await listenToTheEnd(page);
      await openAllHints(page, "bassline");
      const names = await noteNames(page, "bassline");
      const bpm = await bpmOf(page, "bassline");
      const pitches = names.map(midiOf);
      await setTakePlan(page, pitches.map((pitch, index) => ({
        pitch: index === 2 ? pitch + 2 : pitch,
        beat: index === 1 ? 1 + (0.15 * bpm) / 60 : index,
      })), bpm);
      await bassline(page).locator("[data-testid='bassline-record']").click();
      await expect(bassline(page)).toHaveAttribute("data-practice-state", "recording", { timeout: 20_000 });
      // Let the first note reach the meter so the photo shows the recording line in its sounding state.
      await expect(bassline(page).getByTestId("bassline-input-line")).toContainText("入力に音が届いています", { timeout: 10_000 });
      await captureReportShot(page, `p23-63-assets/bassline-2-record-${suffix}.png`);
      await expect(bassline(page)).toHaveAttribute("data-stage-step", "2", { timeout: 40_000 });
      await captureReportShot(page, `p23-63-assets/bassline-3-result-${suffix}.png`);
    }
  });

  /** P23-63: 元ベースラインの段 1 — the saved source on the first window, at both sizes. */
  test("the 元ベースライン report screenshots (P23-63)", async ({ page }) => {
    test.setTimeout(240_000);
    await stageMicrophone(page);
    await openApp(page);
    await saveSyntheticSourceBassline(page);
    // The save's own notices would sit over the photo.
    await expect(page.locator(".lv-toast")).toHaveCount(0, { timeout: 20_000 });
    for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(size);
      const suffix = String(size.width);
      await page.locator('[data-nav="vault"]').click();
      await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
      await bassPracticeFromVault(page);
      await openConditions(page);
      await page.getByTestId("bassline-line-source").selectOption("source-bassline");
      await page.getByTestId("source-bassline-vault-select").selectOption({ index: 1 });
      await expect(page.getByTestId("source-bassline-range")).toHaveText("1〜2小節");
      await page.getByTestId("bassline-conditions").click();
      await expect(conditionsPanel(page)).toBeHidden();
      await expect(bassline(page)).toHaveAttribute("data-stage-step", "0");
      await captureReportShot(page, `p23-63-assets/bassline-source-1-listen-${suffix}.png`);
    }
  });

  /** P23-64: MIDI のベースライン — 段 1, 段 2 (recording), 段 3, 弦とフレット入 and 判定の決まり, at both sizes. */
  test("the MIDI のベースライン report screenshots (P23-64)", async ({ page }) => {
    test.setTimeout(240_000);
    await stageMicrophone(page);
    for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(size);
      const suffix = String(size.width);
      await openMidiPractice(page);
      await expect(midi(page)).toHaveAttribute("data-stage-step", "0");
      await expect(page.locator(".lv-toast")).toHaveCount(0, { timeout: 20_000 });

      // 段 1 (聴く).
      await captureReportShot(page, `p23-64-assets/midi-1-listen-${suffix}.png`);

      // 弦とフレット入.
      await midi(page).getByRole("button", { name: "弦とフレットを出す", exact: true }).click();
      await expect(midi(page).getByTestId("bp-fretboard")).toBeVisible();
      await captureReportShot(page, `p23-64-assets/midi-fret-${suffix}.png`);
      await midi(page).getByRole("button", { name: "弦とフレットを出す", exact: true }).click();
      await expect(midi(page).getByTestId("bp-fretboard")).toHaveCount(0);

      // 段 2 (録音中) and 段 3 (6 / 8: one late, one wrong pitch).
      const pitches = [36, 36, 43, 45, 41, 41, 36, 38];
      await setTakePlan(page, pitches.map((pitch, beat) => ({
        pitch: beat === 5 ? 40 : pitch,
        beat: beat === 3 ? beat + (0.14 * 120) / 60 : beat,
      })), 120);
      await midi(page).getByTestId("midi-record").click();
      await expect(midi(page)).toHaveAttribute("data-practice-state", "recording", { timeout: 20_000 });
      await expect(midi(page).getByTestId("midi-input-line")).toContainText("入力に音が届いています", { timeout: 10_000 });
      await captureReportShot(page, `p23-64-assets/midi-2-record-${suffix}.png`);
      await expect(midi(page)).toHaveAttribute("data-stage-step", "2", { timeout: 40_000 });
      await expect(midi(page).getByTestId("midi-bass-result")).toContainText("6 / 8");
      await captureReportShot(page, `p23-64-assets/midi-3-result-${suffix}.png`);

      // 判定の決まり popover open on top of the result stage.
      await page.getByTestId("midi-judge-conditions").click();
      await expect(page.getByRole("dialog", { name: "判定の決まり" })).toBeVisible();
      await captureReportShot(page, `p23-64-assets/midi-judge-${suffix}.png`);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "判定の決まり" })).toHaveCount(0);
    }
  });

  /** P23-64-fix-1: centered result head + merged miss/extra box + chord sequence 条件 chip. */
  test("P23-64-fix-1 report screenshots", async ({ page }) => {
    test.setTimeout(240_000);
    await stageMicrophone(page);

    for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(size);
      const suffix = String(size.width);
      await openMidiPractice(page);
      await expect(page.locator(".lv-toast")).toHaveCount(0, { timeout: 20_000 });
      const pitches = [36, 36, 43, 45, 41, 41, 36, 38];
      await setTakePlan(page, pitches.map((pitch, beat) => ({
        pitch: beat === 5 ? 40 : pitch,
        beat: beat === 3 ? beat + (0.14 * 120) / 60 : beat,
      })), 120);
      await midi(page).getByTestId("midi-record").click();
      await expect(midi(page)).toHaveAttribute("data-stage-step", "2", { timeout: 40_000 });
      await expect(midi(page).getByTestId("midi-bass-result")).toContainText("6 / 8");
      await captureReportShot(page, `p23-64-fix-1-assets/midi-3-result-${suffix}.png`);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await openMode(page, "bassline");
    await expect(bassline(page)).toHaveAttribute("data-stage-step", "0");
    await expect(page.getByTestId("bassline-conditions")).toContainText("Dm7–G7–Cmaj7");
    await expect(page.getByTestId("bassline-conditions")).not.toContainText("既定の生成進行");
    await captureReportShot(page, "p23-64-fix-1-assets/bassline-1-listen-1440.png");

    await listenToTheEnd(page);
    await openAllHints(page, "bassline");
    const names = await noteNames(page, "bassline");
    const bpm = await bpmOf(page, "bassline");
    const bassPitches = names.map(midiOf);
    // Shift note 2 cleanly past the ±140ms tolerance window (~160ms late) and end before beat 2 so only 1 「大きく遅い」 box appears.
    const lateNoteSeconds = Math.max(0.28, (60 / bpm) - 0.17);
    await setTakePlan(page, bassPitches.map((pitch, index) => ({
      pitch: index === 2 ? pitch + 2 : pitch,
      beat: index === 1 ? index + (0.16 * bpm) / 60 : index,
      seconds: index === 1 ? lateNoteSeconds : 0.34,
    })), bpm);
    await bassline(page).locator("[data-testid='bassline-record']").click();
    await expect(bassline(page)).toHaveAttribute("data-stage-step", "2", { timeout: 40_000 });
    const ownRow = bassline(page).locator("[aria-label='自分の段']");
    const lateBox = ownRow.locator(".bp-note[data-kind='late']");
    await expect(lateBox).toHaveCount(1);
    await expect(lateBox).toContainText("遅い");
    await expect(lateBox).toHaveAttribute("aria-label", /大きく遅い .+\(判定の幅の外\)/);
    await expect(ownRow).not.toContainText("抜け");
    await expect(ownRow).not.toContainText("＋");
    await captureReportShot(page, "p23-64-fix-1-assets/bassline-3-result-late-1440.png");
    // P23-64-fix-2 (merged here in P25 T3): the same late take is that step's photo.
    await captureReportShot(page, "p23-64-fix-2-assets/bassline-3-result-late-1440.png");
  });
});

/** P23-62 S7: no sideways overflow, nothing hidden inside the frame, the buttons under the lane (段 3), the keys at the foot. */
async function expectStageShape(page: Page, mode: StageMode, size: { width: number; height: number }, result: boolean) {
  const view = viewOf(page, mode);
  await assertNoHorizontalOverflow(page);
  const overflow = await view.locator(".bp-frame-scroll").evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(overflow, `${mode} ${size.width}: the stage fits its frame`).toBeLessThanOrEqual(1);
  if (result && size.width >= 1280) {
    const big = (await view.getByTestId("bp-result-big").boundingBox())!;
    const facts = (await view.getByTestId("bp-result-facts").boundingBox())!;
    const bigCx = big.x + big.width / 2;
    const factsCx = facts.x + facts.width / 2;
    expect(Math.abs(bigCx - factsCx), `${mode} ${size.width}: bp-big and bp-facts align on center`).toBeLessThanOrEqual(4);
    expect(facts.y, `${mode} ${size.width}: bp-facts sits below bp-big`).toBeGreaterThan(big.y + big.height);
  }
  const lane = (await view.locator("[data-testid='bp-lane']").boundingBox())!;
  const fretboard = view.locator("[data-testid='bp-fretboard']");
  const laneBottom = await fretboard.count() > 0
    ? Math.max(lane.y + lane.height, (await fretboard.boundingBox())!.y + (await fretboard.boundingBox())!.height)
    : lane.y + lane.height;
  const actions = (await view.locator(".bp-actions").last().boundingBox())!;
  if (result) {
    // 段 3: the buttons sit right under the lane (the rating row is all that may come between).
    expect(actions.y - laneBottom, `${mode} ${size.width}: the buttons sit right under the lane`).toBeLessThanOrEqual(120);
  }
  const foot = (await view.locator(".bp-foot").boundingBox())!;
  const windowBottom = size.height;
  if (size.width >= 1280) {
    expect(windowBottom - (foot.y + foot.height), `${mode} ${size.width}: the keys stay at the foot`).toBeLessThanOrEqual(40);
  } else {
    expect(foot.y + foot.height, `${mode} ${size.width}: the keys stay in view`).toBeLessThanOrEqual(windowBottom + 1);
  }
}
