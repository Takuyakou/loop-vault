import { describe, expect, it } from "vitest";
import type { ProgressionVoicingPracticeSnapshot } from "./types";
import {
  progressionPracticeDegreeLabel,
  transposeProgressionVoicingPracticeSnapshot,
} from "./transposition";

describe("Voicing Loop session transposition", () => {
  it("transposes chords and exact source pitches without mutating saved input", () => {
    const source = fixture();
    const original = structuredClone(source);
    const result = transposeProgressionVoicingPracticeSnapshot(source, 4);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.key).toBe("E major");
    expect(result.snapshot.events.map(({ chord }) => chord.label)).toEqual(["Emaj7", "F#m7"]);
    expect(result.snapshot.events[0]?.voicing?.midiNotes).toEqual([52, 59, 63]);
    expect(result.snapshot.events[0]?.voicing?.bassNote).toBe(52);
    expect(result.snapshot.spans).toEqual(source.spans);
    expect(source).toEqual(original);
  });

  it("uses one progression-wide octave offset and always derives from the source", () => {
    const source = fixture();
    const toB = transposeProgressionVoicingPracticeSnapshot(source, 11);
    const toE = transposeProgressionVoicingPracticeSnapshot(source, 4);
    expect(toB.ok && toB.snapshot.events[0]?.voicing?.midiNotes).toEqual([47, 54, 58]);
    expect(toE.ok && toE.snapshot.events[0]?.voicing?.midiNotes).toEqual([52, 59, 63]);
  });

  it("keeps the original snapshot identity for the default key", () => {
    const source = fixture();
    const result = transposeProgressionVoicingPracticeSnapshot(source, 0);
    expect(result.ok && result.snapshot).toBe(source);
  });

  it("fails closed without a source key and formats numeric harmonic degrees", () => {
    const source = { ...fixture(), key: undefined };
    expect(transposeProgressionVoicingPracticeSnapshot(source, 2)).toEqual({
      ok: false,
      reason: "source-key-unavailable",
    });
    const result = transposeProgressionVoicingPracticeSnapshot(fixture(), 2);
    expect(result.ok && progressionPracticeDegreeLabel(result.snapshot.events[0]?.chord, result.targetKey)).toBe("Ⅰ");
    expect(result.ok && progressionPracticeDegreeLabel(result.snapshot.events[1]?.chord, result.targetKey)).toBe("Ⅱ");
  });
});

function fixture(): ProgressionVoicingPracticeSnapshot {
  return {
    version: 1,
    fingerprint: "source-fingerprint",
    source: { kind: "vault", reference: { ideaId: "idea", blockId: "block" } },
    selection: "source-midi",
    key: "C major",
    bpm: 100,
    meter: { numerator: 4, denominator: 4 },
    lengthBeats: 4,
    events: [
      {
        id: "one",
        startBeat: 0,
        durationBeats: 2,
        chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
        voicing: { kind: "source-midi", midiNotes: [48, 55, 59], bassNote: 48 },
      },
      {
        id: "two",
        startBeat: 2,
        durationBeats: 2,
        chord: { root: 2, quality: "min7", tensions: [], label: "Dm7" },
        voicing: { kind: "source-midi", midiNotes: [50, 57, 60], bassNote: 50 },
      },
    ],
    spans: [
      { kind: "chord", eventIndex: 0, startBeat: 0, durationBeats: 2 },
      { kind: "chord", eventIndex: 1, startBeat: 2, durationBeats: 2 },
    ],
  };
}
