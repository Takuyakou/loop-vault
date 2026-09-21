import { describe, expect, it } from "vitest";
import { parseMidi } from "../../src/domain/midi/parser";
import { inferTrackRoles } from "../../src/domain/midi/legacy";
import { buildMidi } from "./fixtures";
import {
  buildMeterIndependentWindows,
  instrument,
  onsetSweepTicks,
  snapOnsets,
  sourceExtentBeat,
  withMeterView,
} from "./isolationCore";

/** Four sequential 2-beat chords (C, Am, F, G), PPQ96. */
function progressionBytes(numerator: number, denominator: number): Uint8Array {
  const chords: Array<{ start: number; pitches: number[] }> = [
    { start: 0, pitches: [60, 64, 67] }, // C
    { start: 192, pitches: [57, 60, 64] }, // Am
    { start: 384, pitches: [53, 57, 60] }, // F
    { start: 576, pitches: [55, 59, 62] }, // G
  ];
  const notes = chords.flatMap(({ start, pitches }) =>
    pitches.map((pitch) => ({ pitch, startTick: start, durationTick: 192 })),
  );
  return buildMidi({
    ticksPerBeat: 96,
    numerator,
    denominator,
    tempoMicrosPerBeat: 500_000,
    notes,
  });
}

describe("variant B — meter view", () => {
  it("does not mutate source and changes only meter-derived fields", () => {
    const bytes = progressionBytes(1, 4);
    const data = parseMidi(bytes);
    const originalNotes = data.notes;
    const view = withMeterView(data, 4, 4);

    expect(view.notes).toBe(originalNotes); // identical reference
    expect(view.ticksPerBeat).toBe(data.ticksPerBeat);
    expect(view.tempo).toBe(data.tempo);
    expect(view.timeSignature).toBe("4/4");
    expect(view.totalBars).not.toBe(data.totalBars);
    expect(data.timeSignature).toBe("1/4"); // source untouched
  });

  it("A and B share identical note events", () => {
    const data = parseMidi(progressionBytes(1, 4));
    const view = withMeterView(data, 4, 4);
    expect(view.notes.map((n) => ({ ...n }))).toEqual(data.notes.map((n) => ({ ...n })));
  });
});

describe("variant C — meter-independent segmenter", () => {
  it("derives grid extent from source-note extent, not totalBars", () => {
    const data = parseMidi(progressionBytes(1, 4)); // totalBars = 8 under 1/4
    const roles = inferTrackRoles(data, null);
    const windows = buildMeterIndependentWindows(data, roles, 2);
    expect(windows.length).toBe(Math.ceil(sourceExtentBeat(data) / 2));
  });
});

describe("variant D — onset sweep", () => {
  it("snapOnsets never mutates the source notes", () => {
    const data = parseMidi(progressionBytes(4, 4));
    const before = data.notes.map((n) => n.startTick);
    const snapped = snapOnsets(data, 4);
    expect(data.notes.map((n) => n.startTick)).toEqual(before);
    expect(snapped.notes).not.toBe(data.notes);
  });

  it("produces deterministic, de-duplicated PPQ-normalized points", () => {
    expect(onsetSweepTicks(96)).toEqual([0, 1, 2, 4, 6, 12]);
    expect(onsetSweepTicks(96)).toEqual(onsetSweepTicks(96));
    const points = onsetSweepTicks(480);
    expect(new Set(points).size).toBe(points.length);
    expect(points).toEqual([...points].sort((a, b) => a - b));
  });
});

describe("instrument", () => {
  it("is deterministic across repeated runs", () => {
    const data = parseMidi(progressionBytes(1, 4));
    const roles = inferTrackRoles(data, null);
    expect(instrument(data, roles)).toEqual(instrument(data, roles));
  });

  it("captures 1/4 vs 4/4 fragmentation as bar/dash counts", () => {
    const roles14 = inferTrackRoles(parseMidi(progressionBytes(1, 4)), null);
    const a = instrument(parseMidi(progressionBytes(1, 4)), roles14);

    const roles44 = inferTrackRoles(parseMidi(progressionBytes(4, 4)), null);
    const b = instrument(parseMidi(progressionBytes(4, 4)), roles44);

    expect(a.counts.formattedBarCount).toBeGreaterThan(b.counts.formattedBarCount);
    expect(a.counts.dashCount).toBeGreaterThan(b.counts.dashCount);
    expect(b.counts.dashCount).toBe(0);
  });

  it("emits only privacy-safe counts and chord labels (no paths/names)", () => {
    const data = parseMidi(progressionBytes(4, 4));
    const roles = inferTrackRoles(data, null);
    const result = instrument(data, roles);
    for (const label of result.labels) {
      expect(label).toMatch(/^[A-G][#b]?/);
    }
    expect(Object.values(result.counts).every((v) => typeof v === "number")).toBe(true);
  });
});
