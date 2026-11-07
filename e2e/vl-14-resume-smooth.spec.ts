import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * VL-14: the Voicing Loop playhead must follow the audio clock.
 *
 * The transport reports a (beat, audio time) pair immediately on start, resume,
 * seek and section changes, and the view paints from the last pair advanced by
 * the audio clock (Tone context time, output-latency corrected). While the
 * reported time is still in the future the paint holds that beat — the sound has
 * not started yet (look-ahead ≈ 100 ms) — and once it sounds the playhead moves
 * smoothly. Before the fix the first sync after a resume arrived ~100 ms late and
 * the playhead jumped 0.12–0.19 beats; these thresholds fail on that behavior.
 *
 * Measurement uses the `?vl14probe=1` hook, which is only created in e2e test
 * builds (VITE_P527_E2E_FIXTURE=1); production builds never create it.
 */

interface Vl14Frame { at: number; absoluteBeat: number; progressionBeat: number; status: string; audioNow: number }
interface Vl14Sync { at: number; beat: number; time: number; dropped?: string }
interface Vl14Mark { type: string; at: number; contextTime: number }
interface Vl14Probe { frames: Vl14Frame[]; syncs: Vl14Sync[]; marks: Vl14Mark[]; effectStarts: Array<{ at: number }> }

const BPM = 100;
/** Forward jumps above this were the reported stutter (0.12–0.19 beats before the fix; ≤0.026 after). */
const MAX_FORWARD_JUMP_BEATS = 0.06;
/** §3: the painted position stays within 1/8 beat of the audio. */
const MAX_SYNC_GAP_BEATS = 0.125;
/** A stall while the audio is already playing (the old resume bug froze then jumped;
 *  the jump threshold catches it — this guards against systematic freezes; single
 *  rAF hiccups under load reach ~65 ms). */
const MAX_PLAYING_STALL_MS = 120;
/** Waiting for the sound to start (the design's hold; measured ~66–93 ms after a resume). */
const MAX_HOLD_MS = 250;
/** Before a run's first sync the paint sits on the start beat; includes AudioContext boot (~0.2–0.6 s). */
const MAX_PRE_SYNC_HOLD_MS = 1200;
/** resume/seek must report their position immediately (measured 1.5–5 ms). */
const MAX_IMMEDIATE_SYNC_MS = 50;

const readProbe = (page: Page) => page.evaluate(() => {
  const value = (window as unknown as { __vl14Probe: Vl14Probe }).__vl14Probe;
  return { frames: value.frames, syncs: value.syncs, marks: value.marks, effectStarts: value.effectStarts };
});
const mark = (page: Page, name: string) => page.evaluate((n) => {
  (window as unknown as { __vl14Probe: Vl14Probe }).__vl14Probe.marks.push({ type: n, at: performance.now(), contextTime: 0 });
}, name);

function analyze(name: string, frames: Vl14Frame[], syncs: Vl14Sync[], preSyncBeat?: number) {
  const playing = frames.filter((f) => f.status === "running" || f.status === "count-in");
  const live = syncs.filter((s) => !s.dropped);
  // A re-anchor sync (seek, section change, restart) is a user-visible position
  // change; the one-frame snap around it is the action itself, not drift. The
  // window's first sync is compared with the last sync before the window.
  const reanchors = live.map((s, i) => {
    const previous = i === 0 ? preSyncBeat : live[i - 1]!.beat;
    return previous !== undefined && Math.abs(s.beat - previous) > 0.25;
  });
  // Pair each frame with the last sync that arrived before it (-1 = none yet).
  const pairOf: number[] = [];
  {
    let index = -1;
    for (const f of playing) {
      while (index + 1 < live.length && live[index + 1]!.at <= f.at) index += 1;
      pairOf.push(index);
    }
  }
  let maxForwardJump = 0;
  for (let i = 1; i < playing.length; i += 1) {
    const a = playing[i - 1]!;
    const b = playing[i]!;
    const dt = b.at - a.at;
    if (dt <= 0) continue;
    let crossed = false;
    for (let k = pairOf[i - 1]! + 1; k <= pairOf[i]!; k += 1) if (reanchors[k]) crossed = true;
    if (crossed) continue;
    const jump = (b.progressionBeat - a.progressionBeat) - (dt / 1000) * (BPM / 60);
    maxForwardJump = Math.max(maxForwardJump, jump);
  }
  let maxGap = 0;
  for (let i = 0; i < playing.length; i += 1) {
    const f = playing[i]!;
    const pi = pairOf[i]!;
    if (pi < 0 || !Number.isFinite(f.audioNow)) continue;
    if (reanchors[pi] && f.at - live[pi]!.at < 150) continue;
    maxGap = Math.max(maxGap, Math.abs(f.absoluteBeat - live[pi]!.beat));
  }
  let maxPlayingStallMs = 0;
  let maxHoldMs = 0;
  let maxPreSyncHoldMs = 0;
  for (let i = 1; i < playing.length; i += 1) {
    const a = playing[i - 1]!;
    const b = playing[i]!;
    if (b.at - a.at <= 0 || b.progressionBeat - a.progressionBeat > 1e-6) continue;
    const start = i - 1;
    let j = i;
    while (j + 1 < playing.length && playing[j + 1]!.at - playing[j]!.at > 0
      && playing[j + 1]!.progressionBeat - playing[j]!.progressionBeat <= 1e-6) j += 1;
    const ms = playing[j]!.at - playing[start]!.at;
    const previous = live.filter((s) => s.at <= playing[start]!.at).at(-1);
    if (!previous) maxPreSyncHoldMs = Math.max(maxPreSyncHoldMs, ms);
    else if (playing[start]!.audioNow < previous.time - 0.002) maxHoldMs = Math.max(maxHoldMs, ms);
    else maxPlayingStallMs = Math.max(maxPlayingStallMs, ms);
    i = j;
  }
  return {
    name,
    frames: playing.length,
    syncs: live.length,
    maxForwardJump: +maxForwardJump.toFixed(4),
    maxGap: +maxGap.toFixed(4),
    maxPlayingStallMs: +maxPlayingStallMs.toFixed(1),
    maxHoldMs: +maxHoldMs.toFixed(1),
    maxPreSyncHoldMs: +maxPreSyncHoldMs.toFixed(1),
  };
}

test("VL-14 start/resume/seek follow the audio clock without visible jumps", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/?p527Status=p533-rules&vl14probe=1");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  const workspace = page.getByTestId("voicing-loop-workspace");
  await expect(workspace).toBeVisible();

  // First start (1-bar count-in), from the click: count-in, count-in→main and steady.
  await workspace.getByRole("button", { name: "開始", exact: true }).click();
  await mark(page, "initial-start");
  await page.waitForTimeout(5700);
  await mark(page, "initial-start-end");

  // Pause → resume, three times.
  const resumePhase = async (name: string) => {
    await workspace.getByRole("button", { name: "一時停止", exact: true }).click();
    await page.waitForTimeout(400);
    await mark(page, `${name}-pause`);
    await workspace.getByRole("button", { name: "再開", exact: true }).click();
    await page.waitForTimeout(1800);
    await mark(page, `${name}-end`);
  };
  await resumePhase("resume1");
  await resumePhase("resume2");
  await resumePhase("resume3");

  // Count-in-less start, from the click, then steady and a pause → resume.
  await workspace.getByRole("button", { name: "停止", exact: true }).click();
  await page.locator("#voicing-loop-count-in").selectOption("0");
  await workspace.getByRole("button", { name: "開始", exact: true }).click();
  await mark(page, "noCountIn-start");
  await page.waitForTimeout(2500);
  await mark(page, "noCountIn-end");
  await page.waitForTimeout(1500);
  await resumePhase("noCountInResume");

  // Seek backwards twice during playback.
  await mark(page, "seek1");
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(1500);
  await mark(page, "seek2");
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(1500);
  await mark(page, "seek-end");

  // Pause → resume inside the count-in.
  await workspace.getByRole("button", { name: "停止", exact: true }).click();
  await page.locator("#voicing-loop-count-in").selectOption("1");
  await workspace.getByRole("button", { name: "開始", exact: true }).click();
  await page.waitForTimeout(700);
  await workspace.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.waitForTimeout(400);
  await mark(page, "countInResume");
  await workspace.getByRole("button", { name: "再開", exact: true }).click();
  await page.waitForTimeout(1800);
  await mark(page, "countInResume-end");

  // Pause → resume inside a section loop (events 2–4).
  await workspace.getByRole("button", { name: "停止", exact: true }).click();
  const timeline = workspace.getByTestId("voicing-loop-timeline");
  await timeline.getByTestId("voicing-loop-event").nth(1).click({ button: "right" });
  await timeline.getByTestId("voicing-loop-event").nth(3).click({ button: "right" });
  await expect(workspace.getByTestId("voicing-loop-range-chip")).toContainText("2〜4");
  await workspace.getByRole("button", { name: "開始", exact: true }).click();
  await page.waitForTimeout(3200);
  await workspace.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.waitForTimeout(400);
  await mark(page, "sectionResume");
  await workspace.getByRole("button", { name: "再開", exact: true }).click();
  await page.waitForTimeout(1800);
  await mark(page, "sectionResume-end");

  const all = await readProbe(page);
  const fromMark = (name: string, afterType?: string) => {
    const list = all.marks.filter((m) => m.type === name);
    if (!list.length) throw new Error(`missing mark: ${name}; have ${all.marks.map((m) => m.type).join(",")}`);
    let from = list.at(-1)!.at;
    if (afterType) {
      const next = all.marks.find((m) => m.type === afterType && m.at > from);
      if (!next) throw new Error(`missing mark: ${afterType} after ${name}`);
      from = next.at;
    }
    return from;
  };
  const untilMark = (name: string) => {
    const list = all.marks.filter((m) => m.type === name);
    return list.length ? list[0]!.at : Number.POSITIVE_INFINITY;
  };
  const slice = (name: string, afterType?: string, until?: string) => {
    const from = fromMark(name, afterType);
    const to = until ? untilMark(until) : Number.POSITIVE_INFINITY;
    return {
      from,
      frames: all.frames.filter((f) => f.at >= from && f.at < to),
      syncs: all.syncs.filter((s) => s.at >= from && s.at < to),
    };
  };

  const sliced = [
    { name: "initial-start", ...slice("initial-start", undefined, "resume1-pause") },
    { name: "resume1", ...slice("resume1-pause", "resume", "resume1-end") },
    { name: "resume2", ...slice("resume2-pause", "resume", "resume2-end") },
    { name: "resume3", ...slice("resume3-pause", "resume", "resume3-end") },
    { name: "noCountIn-start", ...slice("noCountIn-start", undefined, "noCountIn-end") },
    { name: "noCountIn", ...slice("noCountIn-end", undefined, "noCountInResume-pause") },
    { name: "noCountInResume", ...slice("noCountInResume-pause", "resume", "noCountInResume-end") },
    { name: "seek1", ...slice("seek1", undefined, "seek2") },
    { name: "seek2", ...slice("seek2", undefined, "seek-end") },
    { name: "countInResume", ...slice("countInResume", "resume", "countInResume-end") },
    { name: "sectionResume", ...slice("sectionResume", "resume") },
  ];
  const windows = sliced.map((w) => {
    const before = all.syncs.filter((s) => !s.dropped && s.at < w.from).at(-1);
    return analyze(w.name, w.frames, w.syncs, before?.beat);
  });
  const initial = windows[0]!.maxForwardJump;
  const immediate: Record<string, number> = {};
  for (const name of ["resume1", "resume2", "resume3", "noCountInResume", "seek1", "seek2", "countInResume", "sectionResume"]) {
    const isSeek = name === "seek1" || name === "seek2";
    const base = isSeek || name === "countInResume" || name === "sectionResume" ? name : `${name}-pause`;
    const from = fromMark(base, isSeek ? undefined : "resume");
    const live = all.syncs.filter((s) => !s.dropped && s.at >= from);
    immediate[name] = live.length ? +(live[0]!.at - from).toFixed(1) : Number.POSITIVE_INFINITY;
  }
  writeFileSync("test-results/vl14-resume-smooth.json", JSON.stringify({ windows, immediate }, null, 2));

  for (const w of windows) {
    expect(w.maxForwardJump, `${w.name}: forward jump (beats)`).toBeLessThanOrEqual(MAX_FORWARD_JUMP_BEATS);
    expect(w.maxGap, `${w.name}: painted vs audio (beats)`).toBeLessThanOrEqual(MAX_SYNC_GAP_BEATS);
    expect(w.maxPlayingStallMs, `${w.name}: stall while playing (ms)`).toBeLessThanOrEqual(MAX_PLAYING_STALL_MS);
    expect(w.maxHoldMs, `${w.name}: hold waiting for the sound (ms)`).toBeLessThanOrEqual(MAX_HOLD_MS);
    expect(w.maxPreSyncHoldMs, `${w.name}: hold before the first sync (ms)`).toBeLessThanOrEqual(MAX_PRE_SYNC_HOLD_MS);
  }
  for (const w of windows) {
    if (!w.name.startsWith("resume") && w.name !== "countInResume" && w.name !== "sectionResume" && w.name !== "noCountInResume") continue;
    expect(w.maxForwardJump, `${w.name}: resume jump vs first start`).toBeLessThanOrEqual(initial + 0.03);
  }
  for (const [name, ms] of Object.entries(immediate)) {
    expect(ms, `${name}: first sync after the action (ms)`).toBeLessThanOrEqual(MAX_IMMEDIATE_SYNC_MS);
  }
});
