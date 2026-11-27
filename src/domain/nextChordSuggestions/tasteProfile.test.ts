import { describe, expect, it } from "vitest";
import { parseExtendedTextChordLabel } from "../extendedTextProgression";
import type { ChordSymbol } from "../types";
import { parseSuggestionKey } from "./suggestNextChords";
import { buildTasteProfile, tasteHintsFor, voicingQualityKey } from "./tasteProfile";
import type { TasteBlock } from "./tasteProfile";

const chord = (label: string): ChordSymbol => parseExtendedTextChordLabel(label)!;
const block = (labels: readonly string[], extra: Partial<TasteBlock> = {}): TasteBlock => ({
  chords: labels.map(chord), key: "C major", text: true, ...extra,
});
const key = parseSuggestionKey("C major")!;

describe("P25 V23 Stage 2 taste profile", () => {
  it("stays silent with fewer than three independent blocks", () => {
    const profile = buildTasteProfile([block(["F", "G", "Am"]), block(["C", "Am", "F"])]);
    expect(tasteHintsFor(profile, "major")).toBeUndefined();
  });

  it("accepts text saves with confidence 0 and verified MIDI, and drops unverified low-confidence MIDI", () => {
    const text = buildTasteProfile([block(["F", "G", "Am"], { text: true, confidence: 0 }), block(["F", "G", "Am"], { text: true, confidence: 0 }), block(["F", "G", "Am"], { text: true, confidence: 0 })]);
    expect(text.major?.blocks).toBe(3);
    const midi = buildTasteProfile([
      { chords: ["F", "G", "Am"].map(chord), key: "C major", confidence: 0.5 },
      { chords: ["F", "G", "Am"].map(chord), key: "C major", confidence: 0.5 },
      { chords: ["F", "G", "Am"].map(chord), key: "C major", confidence: 0.5 },
    ]);
    expect(midi.major).toBeUndefined();
    const verified = buildTasteProfile([
      { chords: ["F", "G", "Am"].map(chord), key: "C major", confidence: 0.1, userVerified: true },
      { chords: ["F", "G", "Am"].map(chord), key: "C major", confidence: 0.1, userVerified: true },
      { chords: ["F", "G", "Am"].map(chord), key: "C major", confidence: 0.1, userVerified: true },
    ]);
    expect(verified.major?.blocks).toBe(3);
  });

  it("scores the flow the Vault keeps repeating", () => {
    const hints = tasteHintsFor(buildTasteProfile([block(["F", "G", "Am"]), block(["Dm", "G", "C"]), block(["F", "G", "Am"])]), "major")!;
    expect(hints.flow([chord("F"), chord("G")], chord("Am"), key)).toBeGreaterThan(0);
    expect(hints.flow([chord("C"), chord("Am")], chord("F"), key)).toBeGreaterThanOrEqual(0);
  });

  it("counts the tension-inclusive quality separately (G7sus4 is not G13sus4)", () => {
    const blocks = [block(["C", "G7sus4", "C"]), block(["C", "G7sus4", "C"]), block(["C", "G7sus4", "C"])];
    const hints = tasteHintsFor(buildTasteProfile(blocks), "major")!;
    expect(hints.quality(chord("G7sus4"), key)).toBeGreaterThan(0);
    expect(hints.quality(chord("G13sus4"), key)).toBe(0);
    expect(voicingQualityKey(chord("G7sus4"))).not.toBe(voicingQualityKey(chord("G13sus4")));
  });

  it("never turns a min7 into a minMaj7 via the safe variants", () => {
    const blocks = [block(["Am7", "Dm7", "G7"]), block(["Am7", "Dm7", "G7"]), block(["Am7", "Dm7", "G7"])];
    const hints = tasteHintsFor(buildTasteProfile(blocks), "major")!;
    const variants = hints.variants(chord("Dm7"), key);
    expect(variants.every((entry) => entry.quality !== "minMaj7")).toBe(true);
  });

  it("keeps the mode separate", () => {
    const profile = buildTasteProfile([block(["Am", "Dm", "E7"], { key: "A minor" }), block(["Am", "Dm", "E7"], { key: "A minor" }), block(["Am", "Dm", "E7"], { key: "A minor" })]);
    expect(tasteHintsFor(profile, "major")).toBeUndefined();
    expect(tasteHintsFor(profile, "minor")).not.toBeUndefined();
  });
});
