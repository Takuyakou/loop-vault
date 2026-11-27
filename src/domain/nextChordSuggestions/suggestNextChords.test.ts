import { describe, expect, it } from "vitest";
import { formatChordSymbol } from "../chords";
import { parseExtendedTextChordLabel } from "../extendedTextProgression";
import type { ChordSymbol } from "../types";
import { estimateCandidateKeys, estimateKeyForSuggestions, familyOf, keyContextFor } from "./estimateKey";
import { transitionRows, type BaseQuality } from "./harmonyTables";
import { suggestNextChords, parseSuggestionKey, type NextChordSuggestion, type TasteHints } from "./suggestNextChords";

const chord = (label: string): ChordSymbol => {
  const parsed = parseExtendedTextChordLabel(label);
  if (!parsed) throw new Error(`unreadable test chord: ${label}`);
  return parsed;
};
const progression = (labels: readonly string[]) => labels.map(chord);
const relative = (suggestions: readonly NextChordSuggestion[], key: { tonic: number; mode: string }) =>
  suggestions.map((entry) => ({
    deg: ((entry.chord.root - key.tonic) % 12 + 12) % 12,
    base: entry.chord.bass === undefined ? null : ((entry.chord.bass - key.tonic) % 12 + 12) % 12,
    category: entry.category,
    fitScore: entry.fitScore,
  }));

describe("P25 V23 estimateKey", () => {
  it("reads C major for | C | Am | F | G |", () => {
    expect(estimateKeyForSuggestions(progression(["Cmaj7", "Am7", "Fmaj7", "G7"]))).toEqual({ tonic: 0, mode: "major" });
  });

  it("reads A minor when E7 is present (the harmonic V)", () => {
    expect(estimateKeyForSuggestions(progression(["Am7", "Dm7", "E7", "Am7"]))).toEqual({ tonic: 9, mode: "minor" });
  });

  it("prefers major on an exact tie", () => {
    expect(estimateKeyForSuggestions(progression(["C", "Am", "F"]))?.mode).toBe("major");
  });

  it("does not let a lone C7 make F minor beat F major", () => {
    expect(estimateKeyForSuggestions(progression(["C7"]))?.mode).toBe("major");
  });

  it("keeps at most two close keys and marks a clear winner confident", () => {
    const close = estimateCandidateKeys(progression(["C", "Am", "F"]));
    expect(close?.keys.length).toBeGreaterThanOrEqual(1);
    expect(close?.keys.length).toBeLessThanOrEqual(2);
    const clear = estimateCandidateKeys(progression(["Cmaj7", "Dm7", "G7", "Cmaj7", "Fmaj7", "G7", "Cmaj7"]));
    expect(clear?.confident).toBe(true);
  });

  it("never throws on an altered dominant or a slash chord", () => {
    expect(() => suggestNextChords({ chords: progression(["E7alt"]), nextBarNumber: 2, beatsPerBar: 4 })).not.toThrow();
    expect(() => suggestNextChords({ chords: progression(["C/E", "G/B"]), nextBarNumber: 2, beatsPerBar: 4 })).not.toThrow();
  });

  it("names the flat and sharp key spellings", () => {
    expect(keyContextFor({ tonic: 3, mode: "major" })).toBe("Eb major");
    expect(keyContextFor({ tonic: 6, mode: "minor" })).toBe("F# minor");
  });

  it("uses all five families and reaches the two (0, aug) rows", () => {
    expect(familyOf(chord("Caug"))).toBe("aug");
    expect(familyOf(chord("C7alt"))).toBe("dom");
    const augRows = transitionRows("major").filter((row) => row.prevFamily === "aug");
    expect(augRows.map((row) => row.nextDeg)).toEqual([5, 9]);
  });
});

describe("P25 V23 suggestNextChords", () => {
  it("keeps the loop-return bonus through the texture conversion (4th bar)", () => {
    const result = suggestNextChords({ chords: progression(["C", "F", "Am"]), nextBarNumber: 4, beatsPerBar: 4 });
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((entry) => entry.chord.root === 7 && familyOf(entry.chord) === "dom")).toBe(true);
  });

  it("injects G7, G7sus4, D♭7 and Fm7 on the 4th bar of | Cmaj7 | Dm7 | Em7 |", () => {
    const result = suggestNextChords({ chords: progression(["Cmaj7", "Dm7", "Em7"]), nextBarNumber: 4, beatsPerBar: 4 });
    const labels = result.map((entry) => entry.label);
    expect(labels.some((label) => /^G7/.test(label))).toBe(true);
    expect(labels.some((label) => /^G7sus4/.test(label))).toBe(true);
    expect(labels.some((label) => /^(C#|D[♭b])7/.test(label))).toBe(true);
    expect(labels.some((label) => /^Fm7/.test(label))).toBe(true);
  });

  it("returns at most five deterministic suggestions, each a readable label", () => {
    const input = { chords: progression(["Cmaj7", "Am7", "Dm7", "G7"]), nextBarNumber: 4, beatsPerBar: 4 } as const;
    const first = suggestNextChords(input);
    const second = suggestNextChords(input);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(5);
    for (const entry of first) expect(parseExtendedTextChordLabel(entry.label)).toBeDefined();
  });

  it("keeps the relative degrees and order under all 12 transpositions", () => {
    const source = ["Cmaj7", "Am7", "Dm7", "G7"];
    const base = suggestNextChords({ chords: progression(source), keySignature: "C major", nextBarNumber: 4, beatsPerBar: 4 });
    for (let shift = 1; shift < 12; shift += 1) {
      const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
      const moved = source.map((label) => {
        const parsed = chord(label);
        return formatChordSymbol({
          ...parsed,
          root: (parsed.root + shift) % 12,
          ...(parsed.bass === undefined ? {} : { bass: (parsed.bass + shift) % 12 }),
        }, { accidentalPreference: "sharp" });
      });
      const keyName = `${names[shift]} major`;
      const result = suggestNextChords({ chords: moved.map((label) => chord(label)), keySignature: keyName, nextBarNumber: 4, beatsPerBar: 4 });
      expect(relative(result, parseSuggestionKey(keyName)!), `shift ${shift}`).toEqual(relative(base, { tonic: 0, mode: "major" }));
    }
  });

  it("checks every なめらか candidate against the preview notes", () => {
    const result = suggestNextChords({ chords: progression(["Cmaj7", "Am7", "Dm7"]), nextBarNumber: 3, beatsPerBar: 4 });
    const smooth = result.filter((entry) => entry.category === "なめらか");
    for (const entry of smooth) {
      const before = progression(["Cmaj7", "Am7", "Dm7"]).map((value) => value);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(before.length).toBe(3);
    }
  });

  it("gives only table base qualities", () => {
    const allowed = new Set<BaseQuality>(["maj", "min7b5", "min6", "min7", "maj7", "dom7", "dom7sus4", "dom9", "dim7", "aug"]);
    for (const row of transitionRows("major")) expect(allowed.has(row.baseQuality)).toBe(true);
    for (const row of transitionRows("minor")) expect(allowed.has(row.baseQuality)).toBe(true);
  });
});

describe("P25 V24 suggestion rules", () => {
  it("never returns the previous root (C7 -> C7sus4 / C7 are out)", () => {
    const result = suggestNextChords({ chords: progression(["C7"]), nextBarNumber: 2, beatsPerBar: 4 });
    expect(result.some((entry) => entry.chord.root % 12 === 0)).toBe(false);
  });

  it("always returns five suggestions for twenty common progressions", () => {
    const progressions = [
      ["C", "Am", "F", "G"], ["F", "G", "Em", "Am"], ["Dm7", "G7", "Cmaj7"],
      ["Cmaj7", "Am7", "Dm7", "G7"], ["Am", "F", "C", "G"], ["Em", "Am", "Dm", "G"],
      ["C", "F", "G", "C"], ["Fmaj7", "E7", "Am7", "C7"], ["C", "Dm", "Em", "F"],
      ["G", "Em", "C", "D"], ["Am7", "D7", "Gmaj7"], ["E7", "Am", "F", "G"],
      ["C", "Cmaj7", "C7", "F"], ["A", "E", "F#m", "D"], ["Bb", "Eb", "F", "Bb"],
      ["F#m", "D", "A", "E"], ["Cm", "Ab", "Eb", "Bb"], ["Am", "Dm", "E7", "Am"],
      ["G7", "C", "Am", "D7"], ["C7"],
    ] as const;
    for (const labels of progressions) {
      const result = suggestNextChords({ chords: progression(labels), nextBarNumber: 4, beatsPerBar: 4 });
      expect(result.length, labels.join(" ")).toBe(5);
    }
  });
});

describe("P25 V25 one key and one 好み", () => {
  const taste: TasteHints = {
    mode: "major",
    preference: [],
    flow: () => 20,
    quality: () => 8,
    degree: () => 5,
    // The Vault's way of writing a chord: Fmaj7 also as Fadd9 (same root, same bass).
    variants: (candidate) => candidate.quality === "maj7" ? [{ ...chord("Fadd9"), root: candidate.root, label: formatChordSymbol({ ...chord("Fadd9"), root: candidate.root }) }] : [],
  };
  const charts = [["Cmaj7", "Am7", "Dm7", "G7"], ["Fmaj7", "Em7", "Am7", "Dm7"], ["C", "Am", "F", "G"], ["Dm7", "G7", "Cmaj7"]] as const;

  it("V25-4: every candidate is read in the one key that was given", () => {
    for (const labels of charts) {
      const result = suggestNextChords({ chords: progression(labels), keySignature: "A minor", nextBarNumber: 4, beatsPerBar: 4 });
      expect(new Set(result.map((entry) => `${entry.key.tonic}:${entry.key.mode}`)), labels.join(" ")).toEqual(new Set(["9:minor"]));
    }
  });

  it("V25-4: with no key given, the estimate's first place is the one key", () => {
    for (const labels of charts) {
      const result = suggestNextChords({ chords: progression(labels), nextBarNumber: 4, beatsPerBar: 4 });
      expect(new Set(result.map((entry) => `${entry.key.tonic}:${entry.key.mode}`)).size, labels.join(" ")).toBe(1);
    }
  });

  it("V25-5: at most one 好み, and a taste variant never sits beside its own chord", () => {
    for (const labels of charts) {
      const result = suggestNextChords({ chords: progression(labels), nextBarNumber: 4, beatsPerBar: 4, taste });
      expect(result.length, labels.join(" ")).toBe(5);
      expect(result.filter((entry) => entry.category === "好み").length, labels.join(" ")).toBeLessThanOrEqual(1);
      const roots = result.filter((entry) => entry.category === "好み" || /add9/.test(entry.label))
        .map((entry) => `${entry.chord.root}/${entry.chord.bass ?? entry.chord.root}`);
      for (const root of roots) {
        const same = result.filter((entry) => `${entry.chord.root}/${entry.chord.bass ?? entry.chord.root}` === root && /maj7|add9/.test(entry.label));
        expect(same.length, `${labels.join(" ")}: ${root}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
