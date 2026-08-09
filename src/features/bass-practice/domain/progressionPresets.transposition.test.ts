import { describe, expect, it } from "vitest";
import {
  buildPresetChordContextSnapshot,
  type ChordContextSnapshotChord,
} from "./chordContextSnapshot";
import {
  BASSLINE_PROGRESSION_PRESETS,
  buildBasslinePresetSnapshot,
} from "./progressionPresets";

const tonalCentres = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

describe("P5.18.1 preset catalog representability", () => {
  it("preserves every formula, section, and slash-bass relationship in all supported tonal centres", () => {
    for (const preset of BASSLINE_PROGRESSION_PRESETS) {
      const mode = preset.defaultKey.endsWith(" minor") ? "minor" : "major";
      const expectedLength = preset.chords.reduce((total, chord) => total + chord.durationBeats, 0);
      for (const tonic of tonalCentres) {
        const first = buildBasslinePresetSnapshot({ presetId: preset.id, key: `${tonic} ${mode}` });
        const second = buildBasslinePresetSnapshot({ presetId: preset.id, key: `${tonic} ${mode}` });
        expect(first).toEqual(second);
        expect(first.ok).toBe(true);
        if (!first.ok) throw new Error(`${preset.id} ${tonic}: ${first.error.message}`);
        expect(first.snapshot.section.lengthBeats).toBe(expectedLength);
        expect(first.snapshot.section.chords.map((chord) => chord.quality)).toEqual(preset.chords.map((chord) => chord.quality));
        expect(first.snapshot.section.chords.map((chord) => chord.bass === undefined)).toEqual(preset.chords.map((chord) => chord.bassOffset === undefined));
      }
    }
  });

  it("fails closed for malformed curated chord input instead of throwing", () => {
    const malformedChords = [{
      id: "unsafe",
      root: 0,
      quality: "maj7",
      tensions: null,
      label: "Cmaj7",
      startBeat: 0,
      durationBeats: 4,
    }] as unknown as readonly ChordContextSnapshotChord[];

    expect(() => buildPresetChordContextSnapshot({
      presetId: "safe-preset",
      catalogVersion: "catalog-v1",
      safeLabel: "Safe Preset",
      key: "C major",
      bpm: 96,
      chords: malformedChords,
    })).not.toThrow();
    expect(buildPresetChordContextSnapshot({
      presetId: "safe-preset",
      catalogVersion: "catalog-v1",
      safeLabel: "Safe Preset",
      key: "C major",
      bpm: 96,
      chords: malformedChords,
    })).toMatchObject({ ok: false, error: { code: "unsupported-source" } });
  });
});