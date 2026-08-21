import { describe, expect, it } from "vitest";
import type { ChordSymbol } from "../types";
import {
  canonicalSourceBasslineJson,
  capturedHarmonySignature,
  exactBeat,
  extractSourceBasslineSnapshot,
  MAX_SOURCE_BASSLINE_BYTES,
  MAX_SOURCE_BASSLINE_NOTES,
  sourceBasslineSignature,
  sourceBasslineSnapshotSchema,
  type ExactCapturedHarmonyInput,
  type ExactSourceBasslineNote,
  type ExactSourceBasslineRange,
  type SourceBasslineNote,
  type SourceBasslineSnapshotV1,
} from ".";

const sourceId = "source-a";
const voiceId = "voice-a";
const ppq = 7;
const range: ExactSourceBasslineRange = {
  authority: "raw-integer-ticks",
  constantMeterProven: true,
  barAlignmentProven: true,
  sourceId,
  startTick: 28,
  endTick: 84,
  sourceEndTick: 112,
  ticksPerQuarter: ppq,
  meter: { numerator: 4, denominator: 4 },
};

function note(overrides: Partial<ExactSourceBasslineNote> = {}): ExactSourceBasslineNote {
  return {
    sourceId,
    voiceId,
    pitch: 40,
    velocity: 64 / 127,
    startTick: 28,
    durationTick: 7,
    ticksPerQuarter: ppq,
    ...overrides,
  };
}

function chord(overrides: Partial<ChordSymbol> = {}): ChordSymbol {
  return {
    root: 0,
    quality: "maj7",
    tensions: [],
    label: "Cmaj7",
    ...overrides,
  };
}

function harmonyInput(
  spans: ExactCapturedHarmonyInput["spans"],
  overrides: Partial<Omit<ExactCapturedHarmonyInput, "spans">> = {},
): ExactCapturedHarmonyInput {
  return {
    authority: "raw-integer-ticks",
    sourceId,
    rangeStartTick: range.startTick,
    rangeEndTick: range.endTick,
    ticksPerQuarter: ppq,
    spans,
    ...overrides,
  };
}

function snapshotWithNotes(notes: readonly SourceBasslineNote[]): SourceBasslineSnapshotV1 {
  const unsigned = {
    schemaVersion: 1 as const,
    sourceKind: "selected-bass-voice" as const,
    capturedMeter: { numerator: 4 as const, denominator: 4 as const },
    length: exactBeat(48, 1),
    notes,
  };
  return { ...unsigned, snapshotSignature: sourceBasslineSignature(unsigned) };
}

function zeroVelocityNote(): SourceBasslineNote {
  return {
    pitch: 0,
    start: exactBeat(0, 1),
    duration: exactBeat(1, 1),
    velocity: 0,
    continuesFromBefore: false,
    continuesAfterEnd: false,
  };
}

function canonicalBytes(snapshot: SourceBasslineSnapshotV1): number {
  return new TextEncoder().encode(canonicalSourceBasslineJson(snapshot)).byteLength;
}

const velocityByJsonIncrement = new Map<number, number>([
  [2, 0.1], [3, 0.12], [4, 0.123], [5, 0.1234], [6, 0.12345],
  [7, 0.123456], [8, 0.1234567], [9, 0.12345678], [10, 0.123456789],
  [11, 0.1234567891], [12, 0.12345678912], [13, 0.123456789123],
  [14, 0.1234567891234], [15, 0.12345678912345], [16, 0.123456789123456],
  [17, 0.9999999999999999], [18, 0.12345678901234568],
]);

function snapshotAtCanonicalBytes(target: number): SourceBasslineSnapshotV1 {
  let low = 1;
  let high = MAX_SOURCE_BASSLINE_NOTES;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const bytes = canonicalBytes(snapshotWithNotes(Array.from({ length: middle }, zeroVelocityNote)));
    if (bytes <= target) low = middle;
    else high = middle - 1;
  }
  let count = low;
  let base = snapshotWithNotes(Array.from({ length: count }, zeroVelocityNote));
  let delta = target - canonicalBytes(base);
  if (delta === 1) {
    count -= 1;
    base = snapshotWithNotes(Array.from({ length: count }, zeroVelocityNote));
    delta = target - canonicalBytes(base);
  }
  if (delta < 0 || delta > count * 18) throw new Error("Cannot construct exact canonical byte fixture.");
  const velocities: number[] = [];
  while (delta > 18) {
    velocities.push(velocityByJsonIncrement.get(18)!);
    delta -= 18;
  }
  if (delta === 1) {
    velocities.push(velocityByJsonIncrement.get(3)!, velocityByJsonIncrement.get(16)!);
  } else if (delta > 0) {
    const velocity = velocityByJsonIncrement.get(delta);
    if (velocity === undefined) throw new Error("Cannot realize final byte delta.");
    velocities.push(velocity);
  }
  if (velocities.length > count) throw new Error("Insufficient note slots for byte fixture.");
  const notes = [
    ...Array.from({ length: count - velocities.length }, zeroVelocityNote),
    ...velocities.sort((left, right) => left - right).map((velocity) => ({ ...zeroVelocityNote(), velocity })),
  ];
  const snapshot = snapshotWithNotes(notes);
  if (canonicalBytes(snapshot) !== target) throw new Error("Exact canonical byte fixture construction failed.");
  return snapshot;
}

describe("SourceBasslineSnapshot", () => {
  it("derives reduced exact beats from odd PPQ raw ticks without float reconstruction", () => {
    const snapshot = extractSourceBasslineSnapshot({
      selectedSourceId: sourceId,
      selectedVoiceId: voiceId,
      range,
      notes: [note({ startTick: 29, durationTick: 3 })],
    });

    expect(snapshot.length).toEqual({ numerator: 8, denominator: 1 });
    expect(snapshot.notes[0]).toMatchObject({
      start: { numerator: 1, denominator: 7 },
      duration: { numerator: 3, denominator: 7 },
    });
  });

  it("clips every Boundary A intersection and records truthful continuation flags", () => {
    const snapshot = extractSourceBasslineSnapshot({
      selectedSourceId: sourceId,
      selectedVoiceId: voiceId,
      range,
      notes: [
        note({ pitch: 35, startTick: 20, durationTick: 10 }),
        note({ pitch: 36, startTick: 20, durationTick: 70 }),
        note({ pitch: 37, startTick: 80, durationTick: 10 }),
        note({ pitch: 38, startTick: 21, durationTick: 7 }), // ends exactly at start
        note({ pitch: 39, startTick: 84, durationTick: 7 }), // starts exactly at end
      ],
    });

    expect(snapshot.notes.map((entry) => ({
      pitch: entry.pitch,
      start: entry.start,
      duration: entry.duration,
      before: entry.continuesFromBefore,
      after: entry.continuesAfterEnd,
    }))).toEqual([
      {
        pitch: 35,
        start: { numerator: 0, denominator: 1 },
        duration: { numerator: 2, denominator: 7 },
        before: true,
        after: false,
      },
      {
        pitch: 36,
        start: { numerator: 0, denominator: 1 },
        duration: { numerator: 8, denominator: 1 },
        before: true,
        after: true,
      },
      {
        pitch: 37,
        start: { numerator: 52, denominator: 7 },
        duration: { numerator: 4, denominator: 7 },
        before: false,
        after: true,
      },
    ]);
  });

  it("preserves simultaneous and overlapping notes in canonical order", () => {
    const snapshot = extractSourceBasslineSnapshot({
      selectedSourceId: sourceId,
      selectedVoiceId: voiceId,
      range,
      notes: [
        note({ pitch: 48, durationTick: 14, velocity: 0.5 }),
        note({ pitch: 36, durationTick: 21, velocity: 0.8 }),
        note({ pitch: 36, startTick: 35, durationTick: 14, velocity: 0.7 }),
        note({ sourceId: "other", pitch: 20 }),
        note({ voiceId: "other", pitch: 21 }),
      ],
    });

    expect(snapshot.notes.map(({ pitch, start, duration }) => ({ pitch, start, duration }))).toEqual([
      { pitch: 36, start: exactBeat(0, 1), duration: exactBeat(3, 1) },
      { pitch: 48, start: exactBeat(0, 1), duration: exactBeat(2, 1) },
      { pitch: 36, start: exactBeat(1, 1), duration: exactBeat(2, 1) },
    ]);
  });

  it("builds harmony only from a transient proof bound to the selected source range", () => {
    const capturedHarmony = harmonyInput([
      { sourceId, startTick: 56, durationTick: 28, ticksPerQuarter: ppq, chord: chord({ root: 7, quality: "dom7", bass: 11, label: "G7/B" }) },
      { sourceId, startTick: 28, durationTick: 28, ticksPerQuarter: ppq, chord: chord() },
      { sourceId, startTick: 28, durationTick: 28, ticksPerQuarter: ppq, chord: chord() },
    ]);
    const snapshot = extractSourceBasslineSnapshot({
      selectedSourceId: sourceId, selectedVoiceId: voiceId, range, notes: [note()], capturedHarmony,
    });

    expect(snapshot.capturedHarmony?.spans).toHaveLength(2);
    expect(snapshot.capturedHarmony?.spans[1]).toMatchObject({
      bassPitchClass: 11, allowedPitchClasses: expect.arrayContaining([7, 11]),
    });
    expect(snapshot.capturedHarmony?.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.snapshotSignature).not.toBe(snapshot.capturedHarmony?.signature);
    expect(sourceBasslineSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("sourceId");
  });

  it("rejects cross-source and same-source/different-range harmony proofs", () => {
    const span = { sourceId, startTick: 28, durationTick: 28, ticksPerQuarter: ppq, chord: chord() };
    const extract = (capturedHarmony: ExactCapturedHarmonyInput) => extractSourceBasslineSnapshot({
      selectedSourceId: sourceId, selectedVoiceId: voiceId, range, notes: [note()], capturedHarmony,
    });
    expect(() => extract(harmonyInput([span], { sourceId: "source-b" }))).toThrow(/source range/i);
    expect(() => extract(harmonyInput([{ ...span, sourceId: "source-b" }]))).toThrow(/MIDI source/i);
    expect(() => extract(harmonyInput([span], { rangeStartTick: range.startTick + 28 }))).toThrow(/source range/i);
    expect(() => extract(harmonyInput([span], { rangeEndTick: range.endTick - 28 }))).toThrow(/source range/i);
  });

  it("allows and preserves a real harmony gap", () => {
    const snapshot = extractSourceBasslineSnapshot({
      selectedSourceId: sourceId,
      selectedVoiceId: voiceId,
      range,
      notes: [note()],
      capturedHarmony: harmonyInput([
        { sourceId, startTick: 28, durationTick: 14, ticksPerQuarter: ppq, chord: chord() },
        { sourceId, startTick: 56, durationTick: 28, ticksPerQuarter: ppq, chord: chord({ root: 7, quality: "dom7", label: "G7" }) },
      ]),
    });
    expect(snapshot.capturedHarmony?.spans.map(({ start, duration }) => ({ start, duration }))).toEqual([
      { start: exactBeat(0, 1), duration: exactBeat(2, 1) },
      { start: exactBeat(4, 1), duration: exactBeat(4, 1) },
    ]);
    expect(sourceBasslineSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("accepts half-open harmony ties and is permutation-stable", () => {
    const first = { sourceId, startTick: 28, durationTick: 14, ticksPerQuarter: ppq, chord: chord() };
    const tied = { sourceId, startTick: 42, durationTick: 14, ticksPerQuarter: ppq, chord: chord({ root: 5, label: "Fmaj7" }) };
    const extract = (spans: ExactCapturedHarmonyInput["spans"]) => extractSourceBasslineSnapshot({
      selectedSourceId: sourceId, selectedVoiceId: voiceId, range, notes: [note()],
      capturedHarmony: harmonyInput(spans),
    });
    const forward = extract([first, tied]);
    const reverse = extract([tied, first]);
    expect(forward.capturedHarmony?.spans.map(({ start, duration }) => ({ start, duration }))).toEqual([
      { start: exactBeat(0, 1), duration: exactBeat(2, 1) },
      { start: exactBeat(2, 1), duration: exactBeat(2, 1) },
    ]);
    expect(reverse).toEqual(forward);
  });

  it("rejects conflicting harmony overlaps rather than guessing", () => {
    expect(() => extractSourceBasslineSnapshot({
      selectedSourceId: sourceId, selectedVoiceId: voiceId, range, notes: [note()],
      capturedHarmony: harmonyInput([
        { sourceId, startTick: 28, durationTick: 35, ticksPerQuarter: ppq, chord: chord() },
        { sourceId, startTick: 56, durationTick: 28, ticksPerQuarter: ppq, chord: chord({ root: 5, label: "Fmaj7" }) },
      ]),
    })).toThrow(/overlap/i);
  });

  it("rejects source/range mismatches, float-only authority and invalid ranges", () => {
    expect(() => extractSourceBasslineSnapshot({
      selectedSourceId: sourceId,
      selectedVoiceId: voiceId,
      range,
      notes: [note({ startTick: 28.5 })],
    })).toThrow(/integer tick/i);
    expect(() => extractSourceBasslineSnapshot({
      selectedSourceId: sourceId,
      selectedVoiceId: voiceId,
      range: { ...range, startTick: 1 },
      notes: [note()],
    })).toThrow(/bar aligned/i);
    expect(() => extractSourceBasslineSnapshot({
      selectedSourceId: "different-source",
      selectedVoiceId: voiceId,
      range,
      notes: [note()],
    })).toThrow(/same MIDI source/i);
  });

  it("enforces 8,192 notes before sorting or scanning a huge input", () => {
    const inputs = Array<ExactSourceBasslineNote>(250_000).fill(note({ velocity: 0 }));
    Object.defineProperty(inputs, 9_000, {
      get: () => { throw new Error("scanned beyond bounded note rejection"); },
    });
    expect(() => extractSourceBasslineSnapshot({
      selectedSourceId: sourceId, selectedVoiceId: voiceId, range, notes: inputs,
    })).toThrow(/note budget/i);

    for (const count of [8_191, 8_192]) {
      expect(() => extractSourceBasslineSnapshot({
        selectedSourceId: sourceId, selectedVoiceId: voiceId, range,
        notes: Array<ExactSourceBasslineNote>(count).fill(note({ velocity: 0 })),
      })).toThrow(/byte budget/i);
    }
    expect(() => extractSourceBasslineSnapshot({
      selectedSourceId: sourceId, selectedVoiceId: voiceId, range,
      notes: Array<ExactSourceBasslineNote>(8_193).fill(note({ velocity: 0 })),
    })).toThrow(/note budget/i);
  });

  it("accepts the real canonical UTF-8 byte limit and rejects one byte over", () => {
    const below = snapshotAtCanonicalBytes(MAX_SOURCE_BASSLINE_BYTES - 1);
    const exact = snapshotAtCanonicalBytes(MAX_SOURCE_BASSLINE_BYTES);
    const over = snapshotAtCanonicalBytes(MAX_SOURCE_BASSLINE_BYTES + 1);
    expect(canonicalBytes(below)).toBe(1_048_575);
    expect(canonicalBytes(exact)).toBe(1_048_576);
    expect(canonicalBytes(over)).toBe(1_048_577);
    expect(sourceBasslineSnapshotSchema.safeParse(below).success).toBe(true);
    expect(sourceBasslineSnapshotSchema.safeParse(exact).success).toBe(true);
    expect(sourceBasslineSnapshotSchema.safeParse(over).success).toBe(false);
  });

  it("rejects adversarial ExactBeat values and bounded arithmetic overflow", () => {
    expect(() => exactBeat(1, 0)).toThrow(/denominator/i);
    expect(() => exactBeat(Number.MAX_SAFE_INTEGER + 1, 1)).toThrow(/safe integer/i);
    const snapshot = extractSourceBasslineSnapshot({
      selectedSourceId: sourceId, selectedVoiceId: voiceId, range, notes: [note()],
    });
    const invalidBeats: unknown[] = [
      { numerator: 1, denominator: 0 },
      { numerator: 2, denominator: 4 },
      { numerator: Number.MAX_SAFE_INTEGER + 1, denominator: 1 },
      { numerator: 1, denominator: Number.POSITIVE_INFINITY },
      { numerator: Number.NaN, denominator: 1 },
      { numerator: "1", denominator: 1 },
    ];
    for (const start of invalidBeats) {
      expect(sourceBasslineSnapshotSchema.safeParse({
        ...snapshot, notes: [{ ...snapshot.notes[0], start }],
      }).success).toBe(false);
    }
    const overflowBeat = { numerator: Number.MAX_SAFE_INTEGER, denominator: Number.MAX_SAFE_INTEGER - 1 };
    expect(sourceBasslineSnapshotSchema.safeParse({
      ...snapshot,
      notes: [{ ...snapshot.notes[0], start: overflowBeat, duration: overflowBeat }],
    }).success).toBe(false);
  });

  it("validates harmony and snapshot signatures independently", () => {
    const snapshot = extractSourceBasslineSnapshot({
      selectedSourceId: sourceId, selectedVoiceId: voiceId, range, notes: [note()],
      capturedHarmony: harmonyInput([
        { sourceId, startTick: 28, durationTick: 28, ticksPerQuarter: ppq, chord: chord() },
      ]),
    });
    const harmonyTampered = {
      ...snapshot,
      capturedHarmony: { ...snapshot.capturedHarmony!, signature: "0".repeat(64) },
    };
    expect(harmonyTampered.snapshotSignature).toBe(snapshot.snapshotSignature);
    expect(sourceBasslineSnapshotSchema.safeParse(harmonyTampered).success).toBe(false);
    const snapshotTampered = { ...snapshot, snapshotSignature: "f".repeat(64) };
    expect(snapshotTampered.capturedHarmony?.signature).toBe(
      capturedHarmonySignature(snapshot.capturedHarmony!.spans),
    );
    expect(sourceBasslineSnapshotSchema.safeParse(snapshotTampered).success).toBe(false);
  });

  it("rejects noncanonical order, tampered signatures, invalid values and unknown/private fields", () => {
    const snapshot = extractSourceBasslineSnapshot({
      selectedSourceId: sourceId,
      selectedVoiceId: voiceId,
      range,
      notes: [note({ pitch: 36 }), note({ pitch: 48 })],
    });
    expect(sourceBasslineSnapshotSchema.safeParse({
      ...snapshot,
      notes: [...snapshot.notes].reverse(),
      snapshotSignature: sourceBasslineSignature({ ...snapshot, notes: [...snapshot.notes].reverse() }),
    }).success).toBe(false);
    expect(sourceBasslineSnapshotSchema.safeParse({ ...snapshot, snapshotSignature: "0".repeat(64) }).success).toBe(false);
    expect(sourceBasslineSnapshotSchema.safeParse({ ...snapshot, sourcePath: "private.mid" }).success).toBe(false);
    expect(sourceBasslineSnapshotSchema.safeParse({
      ...snapshot,
      notes: [{ ...snapshot.notes[0], velocity: Number.NaN }],
    }).success).toBe(false);
  });

  it("is deterministic across input permutations and canonical JSON property insertion order", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const notes = Array.from({ length: 12 }, (_, index) => note({
        pitch: 28 + ((index * 7 + seed) % 24),
        startTick: 28 + ((index * 11 + seed) % 49),
        durationTick: 1 + ((index * 5 + seed) % 14),
        velocity: ((index * 13 + seed) % 128) / 127,
        sourceEventIndex: index,
      }));
      const forward = extractSourceBasslineSnapshot({ selectedSourceId: sourceId, selectedVoiceId: voiceId, range, notes });
      const reverse = extractSourceBasslineSnapshot({ selectedSourceId: sourceId, selectedVoiceId: voiceId, range, notes: [...notes].reverse() });
      const insertionReversed = {
        notes: forward.notes,
        capturedHarmony: forward.capturedHarmony,
        length: forward.length,
        capturedMeter: forward.capturedMeter,
        snapshotSignature: forward.snapshotSignature,
        sourceKind: forward.sourceKind,
        schemaVersion: forward.schemaVersion,
      } as SourceBasslineSnapshotV1;
      expect(canonicalSourceBasslineJson(reverse)).toBe(canonicalSourceBasslineJson(forward));
      expect(canonicalSourceBasslineJson(insertionReversed)).toBe(canonicalSourceBasslineJson(forward));
      expect(reverse.snapshotSignature).toBe(forward.snapshotSignature);
      expect(sourceBasslineSignature(insertionReversed)).toBe(forward.snapshotSignature);
    }
  });
});
