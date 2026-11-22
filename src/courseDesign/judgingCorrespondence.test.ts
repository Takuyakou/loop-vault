import { describe, expect, it } from "vitest";
import { ChordEntry, judgeChord } from "../domain/chordDojo/judging";
import { symbol } from "../domain/chordDojo/recipes";
import { createLiveNoteState, reduceLiveNoteState, soundingNotes } from "../domain/liveMidi";
import { CAPTURE_WINDOW_MS, CaptureHarness, SETTLE_MS, type CaptureEvent } from "./inputContract";
import { buildBank } from "./bank";
import { judgeCourseAnswer } from "./answerPolicy";

/**
 * P23-39 §2.3: how far the frozen contract is already the product's behavior. The product adapter is
 * `ChordEntry` (used by the guided view and the ordinary practice); the notes/commands are fed the same
 * way the view feeds them. The test deliberately covers only what the product adapter supports today and
 * names the gaps that P23-40 must close; a green test here is not a claim that the product implements the
 * whole contract.
 *
 * Mapping:
 * - pressed keys: `ChordEntry` sees Note On/Off per channel; the view derives `at` from `performance.now()`
 *   minus a batch-relative offset. The harness uses the same monotonic milliseconds.
 * - settle window: `ChordEntry.settleMs` (the Dojo's setting, default 60).
 * - canonical order: the product sorts by MIDI note; the contract sorts and dedupes by MIDI note.
 * - gaps (P23-40): no capture window, no response timeout, no prior-hold gate inside the adapter (the
 *   view has a release gate), no invalid/reconnect reason, duplicate pitches count twice (raw
 *   `snapshot.length`), no completion timestamp (speed is not recorded anywhere), and `judgeChord('core')`
 *   forces the root bass where the course name-recall policy leaves an unspecified bass free.
 */
function both(events: CaptureEvent[], requiredCount = 3) {
  const product = new ChordEntry(requiredCount, SETTLE_MS);
  const harness = new CaptureHarness({ requiredCount });
  harness.arm(0);
  for (const event of events) {
    product.event(event.channel, event.note, event.kind === "note-on", event.at);
    harness.event(event);
  }
  return { product, harness };
}

const on = (note: number, at: number, channel = 0): CaptureEvent => ({ kind: "note-on", channel, note, at });
const off = (note: number, at: number, channel = 0): CaptureEvent => ({ kind: "note-off", channel, note, at });

describe("P23-39 the frozen contract against the existing judging adapter", () => {
  it("agrees on the sealed notes for simultaneous, spread and re-struck chords", () => {
    const cases = [
      [on(60, 1000), on(64, 1000), on(67, 1000)],
      [on(60, 1000), on(64, 1005), on(67, 1012)],
      [on(60, 1000), on(64, 1000), on(60, 1040), on(67, 1040)],
      [on(60, 1000), on(64, 1000), on(67, 1000), off(60, 1010), off(67, 1020)],
    ] as CaptureEvent[][];
    for (const events of cases) {
      const { product, harness } = both(events);
      const last = Math.max(...events.map((event) => event.at));
      const harnessSealed = harness.advance(last + SETTLE_MS)!;
      const productSealed = product.poll(last + SETTLE_MS)!;
      expect(productSealed.notes.slice().sort((left, right) => left - right)).toEqual(harnessSealed.notes);
    }
  });

  it("keeps the product armed on a partial chord, while the contract settles it neutrally as incomplete", () => {
    const { product, harness } = both([on(60, 1000), on(64, 1050)]);
    expect(product.poll(1400)).toBeUndefined();
    const sealed = harness.advance(1110)!;
    expect(sealed.notes).toEqual([60, 64]);
    expect(sealed.speedMs).toBeUndefined();
    // Delta: the product only arms a settle deadline at the required count; the contract arms it for every
    // Note On so the neutral seal does not contradict "a stable partial set is still an attempt".
    expect(harness.current.kind).toBe("sealed");
  });

  it("dedupes duplicate pitches like the product, and records the missing capture window as the delta", () => {
    // Both sides dedupe by MIDI note: 60 on two channels is still one 60, so a 3-note requirement is not met.
    const duplicate = [on(60, 1000), on(60, 1000, 1), on(64, 1000)];
    const product = new ChordEntry(3, SETTLE_MS);
    const harness = new CaptureHarness({ requiredCount: 3 });
    harness.arm(0);
    for (const event of duplicate) {
      product.event(event.channel, event.note, true, event.at);
      harness.event(event);
    }
    expect(product.poll(1060)).toBeUndefined();
    expect(harness.advance(1060)).toBeDefined();
    // The delta: the product has no capture window/response timeout, so it stays armed forever.
    expect(product.poll(CAPTURE_WINDOW_MS)).toBeUndefined();
  });

  it("keeps the sounding (pedal) view separate from the captured keys", () => {
    const state = reduceLiveNoteState(createLiveNoteState(), { status: 144, channel: 0, data1: 60, data2: 90, timestampMs: 0 });
    const sustained = reduceLiveNoteState(state, { status: 176, channel: 0, data1: 64, data2: 127, timestampMs: 1 });
    const released = reduceLiveNoteState(sustained, { status: 128, channel: 0, data1: 60, data2: 0, timestampMs: 2 });
    // The product's *sounding* notes keep the pedal voice; the captured answer (ChordEntry) only sees the
    // Note Off, which is the contract's choice ("pressed keys").
    expect(soundingNotes(released)).toContain(60);
    const { product, harness } = both([on(60, 100), on(64, 100), on(67, 100), off(60, 150)]);
    const sealed = harness.advance(160)!;
    expect(product.poll(160)!.notes.sort((a, b) => a - b)).toEqual(sealed.notes);
  });

  it("records the name-recall bass delta: the product core judge rejects an inversion the course accepts", () => {
    const bank = buildBank(2338);
    const item = bank.items.find((entry) => entry.level === 2 && entry.prompt === "name" && entry.quality === "maj7" && entry.root === 0)!;
    const inversion = [52, 55, 59, 60];
    // The course name-recall policy: required tones only, unspecified bass free.
    expect(judgeCourseAnswer(item, "name", inversion).ok).toBe(true);
    // The product's core judge for the same chord forces the root bass today.
    const product = judgeChord({ notes: item.referenceNotes, chord: symbol(0, "maj7"), judge: "core" }, inversion);
    expect(product.ok).toBe(false);
    expect(product.message).toContain("一番下の音");
    // P23-40 must use the course acceptance (or pass `bass` explicitly) instead of the unchanged core judge.
  });
});
