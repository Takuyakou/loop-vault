import { describe, expect, it } from "vitest";
import { createPianoKeyboardGeometry } from "../components/music-keyboard/keyboardGeometry";
import { parseChordLabel } from "./chords";
import {
  PROGRESSION_VOICING_PRACTICE_SNAPSHOT_VERSION,
  resolveProgressionPracticeVoicings,
  type ProgressionVoicingPracticeSnapshot,
  type ProgressionVoicingSelection,
} from "./progressionVoicingPractice";
import { VOICING_STYLE_CATALOG } from "./voicingPractice";

const currentSelections = [
  "source-midi",
  "custom",
  "basic-shell",
  "basic-full",
  "rootless-shell",
  "full-shell",
  "left-hand",
] as const satisfies readonly ProgressionVoicingSelection[];

const firstWaveLabels = [
  "C/E",
  "Eadd9/F#",
  "Dm7",
  "Dm9",
  "C",
  "Cmaj7",
  "C13(#11)",
  "C7(b9,b13)",
  "Am9/C",
  "Am11/B",
  "Dadd9/E",
  "Gmaj9/A",
  "Bm7b5",
  "Cdim7",
  "D/C",
  "C6/9",
  "G7sus4",
] as const;

describe("P5.33 Stage00 integrated baseline", () => {
  it("records the seven current resolver IDs and exact-source fail-closed behavior", () => {
    expect(currentSelections).toEqual([
      "source-midi",
      "custom",
      "basic-shell",
      "basic-full",
      "rootless-shell",
      "full-shell",
      "left-hand",
    ]);

    for (const selection of ["source-midi", "custom"] as const) {
      const resolution = resolveProgressionPracticeVoicings(snapshot(selection)).events[0];
      expect(resolution).toMatchObject({
        status: "UNAVAILABLE",
        reason: "selected-source-unavailable",
      });
    }
  });

  it("records the separate three-ID generated-style catalog", () => {
    expect(VOICING_STYLE_CATALOG.map(({ id }) => id)).toEqual([
      "shell-17",
      "open-17",
      "rootless-ab",
    ]);
  });

  it.each(firstWaveLabels)("parses the first-wave chord identity %s", (label) => {
    expect(parseChordLabel(label), label).not.toBeNull();
  });

  it("records the fixed 88-key A0-C8 geometry used by Voicing Loop", () => {
    const geometry = createPianoKeyboardGeometry({ minMidiNote: 9, maxMidiNote: 96 });
    expect(geometry.keys).toHaveLength(88);
    expect(geometry.keys[0]?.note).toBe(9);
    expect(geometry.keys[geometry.keys.length - 1]?.note).toBe(96);
    expect(geometry.height).toBe(192);
  });
});

function snapshot(selection: ProgressionVoicingSelection): ProgressionVoicingPracticeSnapshot {
  return {
    version: PROGRESSION_VOICING_PRACTICE_SNAPSHOT_VERSION,
    fingerprint: `p533-audit-${selection}`,
    source: { kind: "vault", reference: { ideaId: "audit", blockId: "baseline" } },
    selection,
    key: "C major",
    bpm: 100,
    meter: { numerator: 4, denominator: 4 },
    lengthBeats: 4,
    events: [{
      id: "event-1",
      startBeat: 0,
      durationBeats: 4,
      chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
    }],
    spans: [{ kind: "chord", startBeat: 0, durationBeats: 4, eventIndex: 0 }],
  };
}
