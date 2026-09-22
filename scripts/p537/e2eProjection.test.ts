/**
 * P5.37-02 end-to-end DEFAULT-analyzer projection tests (privacy-safe / synthetic).
 * They lock Gate L (correction survives downstream smoothing) and Gate M (no
 * fragmentation when nothing triggers), plus the baseline-parity prerequisite:
 * the diagnostic reconstruction equals the real production `analyzeMidi` timeline.
 * The private LF-MIDI-001 end-to-end result lives only in the report (aggregates).
 */

import { describe, expect, it } from "vitest";

import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { inferTrackRoles } from "../../src/domain/midi/legacy";
import { buildMidi } from "../p534/fixtures";
import { projectUnionChimeraEndToEnd } from "./e2eProjection";

const TPB = 96;

/**
 * True two-harmony in window 0 (C major beat 0, A major beat 1) followed by a
 * distinct F-major region in window 1 (so the trailing window does not re-inherit
 * the window-0 chimera by continuity).
 */
const twoHarmonyBytes = buildMidi({
  ticksPerBeat: TPB,
  tempoMicrosPerBeat: 500_000,
  notes: [
    ...[48, 52, 55].map((pitch) => ({ pitch, startTick: 0, durationTick: TPB })), // C
    ...[45, 49, 64].map((pitch) => ({ pitch, startTick: TPB, durationTick: TPB })), // A
    ...[41, 45, 48].map((pitch) => ({ pitch, startTick: 2 * TPB, durationTick: 2 * TPB })), // F (window 1)
  ],
});

/** Held Cmaj9 (rich harmony) — a hard negative that must not trigger or fragment. */
const heldCmaj9Bytes = buildMidi({
  ticksPerBeat: TPB,
  tempoMicrosPerBeat: 500_000,
  notes: [48, 52, 55, 59, 62].map((pitch) => ({ pitch, startTick: 0, durationTick: TPB * 4 })),
});

/** Same chord re-attacked each beat (rolled/re-attack family) — hard negative. */
const reattackBytes = buildMidi({
  ticksPerBeat: TPB,
  tempoMicrosPerBeat: 500_000,
  notes: [0, 1, 2, 3].flatMap((b) =>
    [47, 50, 54, 57].map((pitch) => ({ pitch, startTick: b * TPB, durationTick: TPB })),
  ),
});

function project(bytes: Uint8Array) {
  const data = parseMidi(bytes);
  return projectUnionChimeraEndToEnd(bytes, data, inferTrackRoles(data));
}

describe("e2e projection — baseline parity (faithful reconstruction)", () => {
  for (const [name, bytes] of [
    ["two-harmony", twoHarmonyBytes],
    ["held Cmaj9", heldCmaj9Bytes],
    ["same-chord re-attack", reattackBytes],
  ] as const) {
    it(`${name}: diagnostic baseline == production analyzeMidi timeline`, () => {
      const prod = analyzeMidi(bytes).fullTimeline.map((it) => it.chord.label);
      expect(project(bytes).baselineTimeline).toEqual(prod);
    });
  }
});

describe("e2e projection — Gate L (correction survives smoothing)", () => {
  it("true two-harmony: chimera removed, coherent local states added end-to-end", () => {
    const r = project(twoHarmonyBytes);
    expect(r.triggeredWindows).toBeGreaterThanOrEqual(1);
    // The W2 chimera label is gone from the final timeline and coherent states appear.
    expect(r.removedLabels.length).toBeGreaterThanOrEqual(1);
    expect(r.addedLabels.length).toBeGreaterThanOrEqual(1);
    // The window-1 region (F) survives unchanged — only the chimera window is partitioned.
    expect(r.correctedTimeline).toContain("F");
    expect(JSON.stringify(r.correctedTimeline)).not.toBe(JSON.stringify(r.baselineTimeline));
  });
});

describe("e2e projection — Gate M (no fragmentation when nothing triggers)", () => {
  for (const [name, bytes] of [
    ["held Cmaj9", heldCmaj9Bytes],
    ["same-chord re-attack", reattackBytes],
  ] as const) {
    it(`${name}: 0 triggers → corrected timeline identical to baseline`, () => {
      const r = project(bytes);
      expect(r.triggeredWindows).toBe(0);
      expect(r.correctedTimeline).toEqual(r.baselineTimeline);
      expect(r.correctedCount).toBe(r.baselineCount);
    });
  }
});

describe("e2e projection — invariants", () => {
  it("is deterministic", () => {
    expect(JSON.stringify(project(twoHarmonyBytes))).toBe(JSON.stringify(project(twoHarmonyBytes)));
  });

  it("does not mutate source bytes", () => {
    const before = Array.from(twoHarmonyBytes);
    project(twoHarmonyBytes);
    expect(Array.from(twoHarmonyBytes)).toEqual(before);
  });
});
