import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type {
  ChordQuality,
  ChordSymbol,
  ChordTimelineItem,
  Tension,
} from "../types";
import {
  degreeForChord,
  getCanonicalKey,
  practiceEventId,
  preservesRomanNumeral,
  romanNumeralForChord,
  spellPitchClassForKey,
  transposeChordSymbol,
  transposeProgression,
} from ".";

describe("chord transposition", () => {
  it("transposes every root while preserving chord structure", () => {
    const sourceKey = getCanonicalKey(0, "major");
    const targetKey = getCanonicalKey(2, "major");
    for (let root = 0; root < 12; root += 1) {
      const source = makeChordSymbol(root, "min7", ["9"]);
      const result = transposeChordSymbol(source, sourceKey, targetKey);
      expect(result.root).toBe((root + 2) % 12);
      expect(result.quality).toBe("min7");
      expect(result.tensions).toEqual(["9"]);
      expect(result.tensions).not.toBe(source.tensions);
    }
  });

  it.each([
    "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5",
    "dim7", "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4",
    "dom7sus4", "add9", "six", "min6", "sixNine",
  ] as const)("preserves %s quality", (quality) => {
    const result = transposeChordSymbol(
      makeChordSymbol(0, quality),
      getCanonicalKey(0, "major"),
      getCanonicalKey(7, "major"),
    );
    expect(result.quality).toBe(quality);
  });

  it("preserves altered tensions without reinterpretation", () => {
    const tensions: Tension[] = ["b9", "#9", "11", "#11", "13", "b13"];
    const result = transposeChordSymbol(
      makeChordSymbol(7, "dom7", tensions),
      getCanonicalKey(0, "major"),
      getCanonicalKey(3, "major"),
    );
    expect(result.tensions).toEqual(tensions);
    expect(result.label).toContain("b9#911#1113b13");
  });

  it("keeps altered tensions and arbitrary slash intervals in the Roman guide", () => {
    const key = getCanonicalKey(0, "major");
    const altered = makeChordSymbol(
      7,
      "dom7",
      ["#11", "b13", "b9", "#9"],
      8,
    );
    expect(romanNumeralForChord(altered, key)).toBe(
      "V7b9#9#11b13/b2nd",
    );
    expect(degreeForChord(altered, key)).toEqual(expect.objectContaining({
      tensions: ["b9", "#9", "#11", "b13"],
      bassInterval: 1,
      bassLabel: "b2nd",
    }));
  });

  it.each([
    [1, "b2nd"],
    [2, "2nd"],
    [3, "b3rd"],
    [4, "3rd"],
    [5, "4th"],
    [6, "#4th"],
    [7, "5th"],
    [8, "b6th"],
    [9, "6th"],
    [10, "b7th"],
    [11, "7th"],
  ] as const)("describes slash-bass interval %s as %s", (interval, label) => {
    const chord = makeChordSymbol(0, "maj7", [], interval);
    expect(degreeForChord(chord, getCanonicalKey(0, "major")))
      .toEqual(expect.objectContaining({
        bassInterval: interval,
        bassLabel: label,
      }));
    expect(romanNumeralForChord(chord, getCanonicalKey(0, "major")))
      .toBe(`Imaj7/${label}`);
  });

  it("moves root and slash bass by the same amount", () => {
    const result = transposeChordSymbol(
      makeChordSymbol(0, "maj", [], 4),
      getCanonicalKey(0, "major"),
      getCanonicalKey(2, "major"),
    );
    expect(result).toEqual({
      root: 2,
      quality: "maj",
      tensions: [],
      bass: 6,
      label: "D/F#",
    });
  });

  it("moves borrowed and chromatic chords without reharmonizing", () => {
    const borrowed = transposeChordSymbol(
      makeChordSymbol(8, "maj7"),
      getCanonicalKey(0, "major"),
      getCanonicalKey(2, "major"),
    );
    expect(borrowed).toEqual({
      root: 10,
      quality: "maj7",
      tensions: [],
      label: "Bbmaj7",
    });
    expect(degreeForChord(borrowed, getCanonicalKey(2, "major")))
      .toEqual(degreeForChord(makeChordSymbol(8, "maj7"), getCanonicalKey(0, "major")));
  });

  it("preserves minor-mode scale degrees and spelling", () => {
    const source = makeChordSymbol(3, "maj7");
    const result = transposeChordSymbol(
      source,
      getCanonicalKey(0, "minor"),
      getCanonicalKey(5, "minor"),
    );
    expect(result.label).toBe("Abmaj7");
    expect(preservesRomanNumeral(
      source,
      getCanonicalKey(0, "minor"),
      result,
      getCanonicalKey(5, "minor"),
    )).toBe(true);
  });

  it("uses canonical sharp and flat preferences for context-free pitch spelling", () => {
    expect(spellPitchClassForKey(1, getCanonicalKey(2, "major"))).toBe("C#");
    expect(spellPitchClassForKey(1, getCanonicalKey(5, "major"))).toBe("Db");
    expect(spellPitchClassForKey(10, getCanonicalKey(3, "minor"))).toBe("Bb");
  });

  it("rejects a mode-changing transposition", () => {
    expect(() => transposeChordSymbol(
      makeChordSymbol(0, "maj"),
      getCanonicalKey(0, "major"),
      getCanonicalKey(0, "minor"),
    )).toThrow("must preserve the source mode");
  });

  it("normalizes invalid pitch-class ranges deterministically", () => {
    const source: ChordSymbol = {
      root: 25,
      quality: "maj",
      tensions: [],
      bass: -1,
      label: "invalid-range",
    };
    const result = transposeChordSymbol(
      source,
      getCanonicalKey(0, "major"),
      getCanonicalKey(2, "major"),
    );
    expect(result.root).toBe(3);
    expect(result.bass).toBe(1);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects invalid chord root %s",
    (root) => {
      expect(() => transposeChordSymbol(
        { root, quality: "maj", tensions: [], label: "invalid" },
        getCanonicalKey(0, "major"),
        getCanonicalKey(2, "major"),
      )).toThrow("Pitch class must be a finite integer");
    },
  );

  it("rejects noncanonical key objects at the API boundary", () => {
    expect(() => transposeChordSymbol(
      makeChordSymbol(0, "maj"),
      {
        ...getCanonicalKey(0, "major"),
        canonicalName: "B#",
      },
      getCanonicalKey(2, "major"),
    )).toThrow("does not match the canonical key catalog");
  });

  it("spells every major/minor target, root, and slash bass consistently", () => {
    for (const mode of ["major", "minor"] as const) {
      const sourceKey = getCanonicalKey(0, mode);
      for (let target = 0; target < 12; target += 1) {
        const targetKey = getCanonicalKey(target, mode);
        for (let root = 0; root < 12; root += 1) {
          const source = makeChordSymbol(root, "maj", [], (root + 1) % 12);
          const result = transposeChordSymbol(source, sourceKey, targetKey);
          const names = /^([A-G][#b]*)\/([A-G][#b]*)$/.exec(result.label);
          expect(names, `${mode} target=${target} root=${root}`).not.toBeNull();
          expect(noteNamePitchClass(names?.[1] ?? "")).toBe(result.root);
          expect(noteNamePitchClass(names?.[2] ?? "")).toBe(result.bass);
          expect(preservesRomanNumeral(source, sourceKey, result, targetKey)).toBe(true);
        }
      }
    }
  });

  it("includes tensions and arbitrary bass intervals in preservation checks", () => {
    const key = getCanonicalKey(0, "major");
    const source = makeChordSymbol(0, "dom7", ["b9", "#11"], 2);
    expect(preservesRomanNumeral(
      source,
      key,
      makeChordSymbol(0, "dom7", ["b9", "#11"], 2),
      key,
    )).toBe(true);
    expect(preservesRomanNumeral(
      source,
      key,
      makeChordSymbol(0, "dom7", ["b9"], 2),
      key,
    )).toBe(false);
    expect(preservesRomanNumeral(
      source,
      key,
      makeChordSymbol(0, "dom7", ["b9", "#11"], 1),
      key,
    )).toBe(false);
  });
});

describe("progression transposition", () => {
  it("preserves order, identity, timing, repeats, and source data", () => {
    const events = [
      chordEvent(makeChordSymbol(0, "maj7"), 1, 1, 2, "source-a"),
      chordEvent(makeChordSymbol(7, "dom7", ["b9"]), 1, 3, 2),
      chordEvent(makeChordSymbol(0, "maj7"), 2, 1, 4, "source-c"),
    ];
    const snapshot = structuredClone(events);
    const result = transposeProgression({
      sourceKey: getCanonicalKey(0, "major"),
      sourceMode: "major",
      events,
      targetTonicPitchClass: 2,
      sourceReference: { ideaId: "idea-a", blockId: "block-a" },
    });
    expect(result.semitoneShift).toBe(2);
    expect(result.events.map((event) => event.chord.root)).toEqual([2, 9, 2]);
    expect(result.events.map(({ bar, beat, durationBeats }) => ({
      bar,
      beat,
      durationBeats,
    }))).toEqual([
      { bar: 1, beat: 1, durationBeats: 2 },
      { bar: 1, beat: 3, durationBeats: 2 },
      { bar: 2, beat: 1, durationBeats: 4 },
    ]);
    expect(result.events[0].sourceEventId).toBe("source-a");
    expect(result.events[0].eventId).toContain("idea-a:block-a");
    expect(result.events[1].sourceEventId).toContain(
      "practice-source:idea-a:block-a:index=1:bar=1:beat=3:duration=2",
    );
    expect(events).toEqual(snapshot);
  });

  it("creates deterministic session-only fallback event identities", () => {
    const event = chordEvent(makeChordSymbol(0, "maj"), 1, 1, 4);
    const reference = { ideaId: "idea-a", blockId: "block-a" };
    const first = practiceEventId(event, 0, reference);
    expect(practiceEventId(event, 0, reference)).toBe(first);
    expect(practiceEventId(event, 1, reference)).not.toBe(first);
    expect(practiceEventId(event, 0, {
      ideaId: "idea-a",
      blockId: "block-b",
    })).not.toBe(first);
    expect(event.eventId).toBeUndefined();
  });

  it("namespaces the same stored event ID by progression reference", () => {
    const event = chordEvent(makeChordSymbol(0, "maj"), 1, 1, 4, "shared-event");
    const first = practiceEventId(event, 0, {
      ideaId: "idea-a",
      blockId: "block-a",
    });
    const second = practiceEventId(event, 0, {
      ideaId: "idea-b",
      blockId: "block-a",
    });
    expect(first).not.toBe(second);
    expect(first).toContain("idea-a:block-a");
    expect(second).toContain("idea-b:block-a");
  });

  it("detects duplicate stored event IDs within a progression", () => {
    const events = [
      chordEvent(makeChordSymbol(0, "maj"), 1, 1, 2, "duplicate"),
      chordEvent(makeChordSymbol(7, "dom7"), 1, 3, 2, "duplicate"),
    ];
    expect(() => transposeProgression({
      sourceKey: getCanonicalKey(0, "major"),
      sourceMode: "major",
      events,
      targetTonicPitchClass: 2,
      sourceReference: { ideaId: "idea-a", blockId: "block-a" },
    })).toThrow("Duplicate source event ID: duplicate");
  });

  it("transposes alternatives and preserves event metadata", () => {
    const event = chordEvent(makeChordSymbol(0, "maj7"), 1, 1, 4, "event-a");
    event.alternatives = [{
      chord: makeChordSymbol(9, "min7"),
      confidence: 0.7,
    }];
    event.warnings = ["ambiguous-bass"];
    const [result] = transposeProgression({
      sourceKey: getCanonicalKey(0, "major"),
      sourceMode: "major",
      events: [event],
      targetTonicPitchClass: 3,
      sourceReference: { ideaId: "idea", blockId: "metadata" },
    }).events;
    expect(result.alternatives[0].chord.root).toBe(0);
    expect(result.alternatives[0].confidence).toBe(0.7);
    expect(result.warnings).toEqual(["ambiguous-bass"]);
    expect(result.warnings).not.toBe(event.warnings);
  });

  it("separates and deep-clones source voicing and all mutable event data", () => {
    const event = chordEvent(
      makeChordSymbol(0, "dom7", ["b9"]),
      1,
      1,
      4,
      "voiced-event",
    );
    event.alternatives = [{
      chord: makeChordSymbol(9, "min7", ["11"]),
      confidence: 0.7,
    }];
    event.warnings = ["source-warning"];
    event.voicingMemory = {
      sourceVoicing: {
        schemaVersion: 1,
        source: "midi-extracted",
        representation: "simultaneous-voicing",
        midiNotes: [48, 60, 64, 67],
        capturedForChordKey: "0:dom7:b9",
      },
      practiceVoicingOverride: {
        schemaVersion: 1,
        source: "manual",
        representation: "simultaneous-voicing",
        midiNotes: [48, 58, 64, 67],
        capturedForChordKey: "0:dom7:b9",
      },
    };
    const [result] = transposeProgression({
      sourceKey: getCanonicalKey(0, "major"),
      sourceMode: "major",
      events: [event],
      targetTonicPitchClass: 2,
      sourceReference: { ideaId: "idea", blockId: "voicing" },
    }).events;

    expect("voicingMemory" in result).toBe(false);
    expect(result.sourceVoicingMemory).toEqual(event.voicingMemory);
    expect(result.sourceVoicingMemory).not.toBe(event.voicingMemory);
    expect(result.sourceVoicingMemory?.sourceVoicing).not.toBe(
      event.voicingMemory.sourceVoicing,
    );
    expect(result.sourceVoicingMemory?.sourceVoicing?.midiNotes).not.toBe(
      event.voicingMemory.sourceVoicing?.midiNotes,
    );
    result.chord.tensions.push("#11");
    result.alternatives[0].chord.tensions.push("13");
    result.warnings.push("target-warning");
    result.sourceVoicingMemory?.sourceVoicing?.midiNotes.push(72);
    expect(event.chord.tensions).toEqual(["b9"]);
    expect(event.alternatives[0].chord.tensions).toEqual(["11"]);
    expect(event.warnings).toEqual(["source-warning"]);
    expect(event.voicingMemory.sourceVoicing?.midiNotes).toEqual([48, 60, 64, 67]);
  });

  it("derives the same degree and roman numeral in every target key", () => {
    const sourceKey = getCanonicalKey(0, "major");
    const sourceChord = makeChordSymbol(10, "dom7", [], 2);
    const sourceRoman = romanNumeralForChord(sourceChord, sourceKey);
    for (let target = 0; target < 12; target += 1) {
      const targetKey = getCanonicalKey(target, "major");
      const chord = transposeChordSymbol(sourceChord, sourceKey, targetKey);
      expect(romanNumeralForChord(chord, targetKey)).toBe(sourceRoman);
      expect(preservesRomanNumeral(sourceChord, sourceKey, chord, targetKey)).toBe(true);
    }
  });

  it("always transposes directly from the saved source progression", () => {
    const source = [chordEvent(makeChordSymbol(8, "maj7"), 1, 1, 4)];
    const toD = transposeProgression({
      sourceKey: getCanonicalKey(0, "major"),
      sourceMode: "major",
      events: source,
      targetTonicPitchClass: 2,
      sourceReference: { ideaId: "idea", blockId: "direct" },
    });
    const directToE = transposeProgression({
      sourceKey: getCanonicalKey(0, "major"),
      sourceMode: "major",
      events: source,
      targetTonicPitchClass: 4,
      sourceReference: { ideaId: "idea", blockId: "direct" },
    });
    expect(toD.events[0].chord.label).toBe("Bbmaj7");
    expect(directToE.events[0].chord.label).toBe("Cmaj7");
    expect(source[0].chord.label).toBe("Abmaj7");
  });

  it("is deep-equal deterministic", () => {
    const input = {
      sourceKey: getCanonicalKey(10, "minor"),
      sourceMode: "minor" as const,
      events: Array.from({ length: 8 }, (_, index) => chordEvent(
        makeChordSymbol([10, 1, 5, 8][index % 4], "min7"),
        index + 1,
        1,
        4,
      )),
      targetTonicPitchClass: 6,
      sourceReference: { ideaId: "idea", blockId: "block" },
    };
    const first = transposeProgression(input);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      expect(transposeProgression(input)).toEqual(first);
    }
  });

  it("meets the 16/32 event performance fixtures", () => {
    const durations16 = benchmarkProgression(16, 40);
    const durations32 = benchmarkProgression(32, 20);
    expect(percentile(durations16, 0.5)).toBeLessThanOrEqual(2);
    expect(percentile(durations16, 0.9)).toBeLessThanOrEqual(10);
    expect(Math.max(...durations32)).toBeLessThanOrEqual(30);
  });

  it("rejects an inconsistent source mode", () => {
    expect(() => transposeProgression({
      sourceKey: getCanonicalKey(0, "major"),
      sourceMode: "minor",
      events: [],
      targetTonicPitchClass: 2,
      sourceReference: { ideaId: "idea", blockId: "mode" },
    })).toThrow("sourceKey.mode and sourceMode must match");
  });

  it("requires a non-empty composite progression reference", () => {
    expect(() => transposeProgression({
      sourceKey: getCanonicalKey(0, "major"),
      sourceMode: "major",
      events: [],
      targetTonicPitchClass: 2,
      sourceReference: { ideaId: "", blockId: "block" },
    })).toThrow("requires ideaId and blockId");
  });
});

function chordEvent(
  chord: ChordSymbol,
  bar: number,
  beat: number,
  durationBeats: number,
  eventId?: string,
): ChordTimelineItem {
  return {
    ...(eventId ? { eventId } : {}),
    bar,
    beat,
    durationBeats,
    chord,
    confidence: 1,
    alternatives: [],
    warnings: [],
  };
}

function benchmarkProgression(eventCount: number, iterations: number): number[] {
  const qualities: ChordQuality[] = ["maj7", "min7", "dom7", "min7b5"];
  const events = Array.from({ length: eventCount }, (_, index) => chordEvent(
    makeChordSymbol(index % 12, qualities[index % qualities.length], ["9"]),
    Math.floor(index / 4) + 1,
    (index % 4) + 1,
    1,
  ));
  const input = {
    sourceKey: getCanonicalKey(0, "major"),
    sourceMode: "major" as const,
    events,
    targetTonicPitchClass: 6,
    sourceReference: { ideaId: "perf", blockId: `${eventCount}` },
  };
  transposeProgression(input);
  return Array.from({ length: iterations }, () => {
    const startedAt = performance.now();
    transposeProgression(input);
    return performance.now() - startedAt;
  });
}

function percentile(values: readonly number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(
    sorted.length - 1,
    Math.floor(sorted.length * ratio),
  )];
}

function noteNamePitchClass(name: string): number {
  const natural = naturalPitchClasses[
    name[0] as keyof typeof naturalPitchClasses
  ];
  let pitchClass = natural;
  for (const accidental of name.slice(1)) {
    pitchClass += accidental === "#" ? 1 : -1;
  }
  return ((pitchClass % 12) + 12) % 12;
}

const naturalPitchClasses = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
} as const;
