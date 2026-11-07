import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChordSymbol } from "./types";
import * as audition from "./textChordTones";
import { validateTextChordNotes } from "./textChordValidation";
import { createTextProgressionStyleSnapshot, textProgressionVoicingNotes } from "./textProgressionVoicing";
import { textPreviewNotes, textVoicingAvailability } from "./textVoicingAvailability";
import { chordPitchClasses, voiceChordForPreview } from "./chordVoicing";
import { supportsTextChord } from "./textChordConsumerCapabilities";
import { isUsablePracticeVoicing } from "./voicing/compatibility";
import { normalizedChordKey } from "./voicing/normalizeVoicing";
import { parseTextChordLabel } from "./chords";
import { occurrenceChord } from "./chordDojo/occurrenceChord";
import { generateStyleVoicingPlan } from "./voicingPractice/optimizeProgression";
import { resolveTimelineItemVoicing } from "./voicing/resolveVoicing";

const alt: ChordSymbol = { root: 7, quality: "dom7", tensions: [], altered: true, label: "G7alt" };
// Independent MIDI expectations: G2 root=43, Eb4 b13=63, F4 b7=65,
// Bb4 #9=70, B4 third=71. Explicit forms retain D4 perfect fifth=62,
// Ab4 b9=68; unlike alt they do not replace their written tensions.
const cases: readonly [ChordSymbol, readonly number[]][] = [
  [alt, [43, 63, 65, 70, 71]],
  [{ ...alt, bass: 11, label: "G7alt/B" }, [47, 63, 65, 67, 70]],
  [{ root: 0, quality: "minMaj7", tensions: [], label: "Cm(maj7)" }, [48, 63, 67, 71]],
  [{ root: 0, quality: "minMaj7", tensions: ["9"], label: "Cm(maj9)" }, [48, 62, 63, 67, 71]],
  [{ root: 0, quality: "minMaj7", bass: 7, tensions: [], label: "Cm(maj7)/G" }, [43, 60, 63, 71]],
  [{ root: 7, quality: "dom7", tensions: ["b9", "b13"], label: "G7(b9,b13)" }, [43, 62, 63, 65, 68, 71]],
  [{ root: 7, quality: "dom7", tensions: ["b9", "#9", "b13"], label: "G7(b9,#9,b13)" }, [43, 62, 63, 65, 68, 70, 71]],
];

afterEach(() => vi.restoreAllMocks());

describe("TXT-JAZZ recommended pitches and safety", () => {
  it.each(cases)("generates independent exact notes for %j", (chord, expected) => {
    expect(audition.voiceTextChordForAudition(chord)).toEqual(expected);
    expect(textProgressionVoicingNotes(chord, "generated-close")).toEqual(expected);
    expect(validateTextChordNotes(chord, expected)).toBe(true);
    expect(createTextProgressionStyleSnapshot(chord, "generated-close")).toMatchObject({
      source: "manual", extractorVersion: "text-style-v1:generated-close", midiNotes: expected,
      capturedForChordLabel: chord.label, capturedForChordKey: normalizedChordKey(chord),
    });
  });

  it("rejects missing or forbidden colors, wrong bass, malformed notes and low semitone clashes", () => {
    expect(validateTextChordNotes(alt, [43, 65, 71])).toBe(false);
    expect(validateTextChordNotes(alt, [43, 62, 65, 71])).toBe(false);
    expect(validateTextChordNotes(alt, [43, 63, 65, 69, 70, 71])).toBe(false);
    expect(validateTextChordNotes(alt, [43, 61, 63, 65, 68, 70, 71])).toBe(false);
    expect(validateTextChordNotes(alt, [43, 63, 65, 68, 70, 71])).toBe(false);
    expect(validateTextChordNotes(alt, [43, 46, 47, 53, 63])).toBe(false);
    expect(validateTextChordNotes(alt, [43, 63, 65, 70, NaN])).toBe(false);
    expect(validateTextChordNotes({ ...alt, bass: 11 }, cases[0]![1])).toBe(false);
    expect(validateTextChordNotes(cases[2]![0], [48, 63, 67, 70, 71])).toBe(false);
    expect(validateTextChordNotes(cases[3]![0], [48, 63, 67, 71])).toBe(false);
    expect(validateTextChordNotes(cases[5]![0], [43, 62, 63, 65, 68, 70, 71])).toBe(false);
    expect(validateTextChordNotes(cases[6]![0], [43, 62, 65, 71])).toBe(false);
  });

  it("keeps an impossible specified bass classified but silent and unregistered", () => {
    const impossible = { ...alt, bass: 2, label: "G7alt/D" };
    expect(audition.voiceTextChordForAudition(impossible)).toEqual([]);
    expect(textProgressionVoicingNotes(impossible, "generated-close")).toBeUndefined();
    expect(createTextProgressionStyleSnapshot(impossible, "generated-close")).toBeUndefined();
    expect(textVoicingAvailability([{ chord: alt }, { chord: impossible }])).toEqual({
      total: 2, registered: 1, unavailable: ["G7alt/D"],
    });
  });

  it("checks a successful but wrong generator at preview and snapshot boundaries", () => {
    vi.spyOn(audition, "voiceTextChordForAudition").mockReturnValue([43, 62, 65, 71]);
    expect(textProgressionVoicingNotes(alt, "generated-close")).toBeUndefined();
    expect(createTextProgressionStyleSnapshot(alt, "generated-close")).toBeUndefined();
    expect(textPreviewNotes(alt)).toEqual([]);
  });

  it("keeps a thrown generation failure silent and without a registered snapshot", () => {
    vi.spyOn(audition, "voiceTextChordForAudition").mockImplementation(() => { throw new Error("Synthetic generation failure"); });
    expect(textProgressionVoicingNotes(alt, "generated-close")).toBeUndefined();
    expect(createTextProgressionStyleSnapshot(alt, "generated-close")).toBeUndefined();
    expect(textPreviewNotes(alt)).toEqual([]);
  });

  it("does not treat an unknown consumer, legacy preview or generated style as alt-aware", () => {
    for (const consumer of ["unknown", "chord-context", "root-motion", "bass-practice", "generated-loop"]) {
      expect(supportsTextChord(consumer, alt)).toBe(false);
    }
    for (const consumer of ["vault-save", "chord-dojo", "voicing-memory", "text-audition"]) {
      expect(supportsTextChord(consumer, alt)).toBe(true);
    }
    expect(chordPitchClasses(alt)).toEqual([]);
    expect(voiceChordForPreview(alt).notes).toEqual([]);
    for (const style of ["shell-17", "open-17", "rootless-ab"] as const) {
      expect(textProgressionVoicingNotes(alt, style)).toBeUndefined();
    }
    const event = { eventId: "synthetic-alt", bar: 1, beat: 1, durationBeats: 4, chord: alt,
      confidence: 0, warnings: [], alternatives: [] };
    for (const style of ["generated-close", "shell-17", "open-17", "rootless-ab"] as const) {
      const plan = generateStyleVoicingPlan([event], style, { maxLeftHandSpanSemitones: 12, maxRightHandSpanSemitones: 12, allowUnsupportedFallback: true });
      expect(plan.events).toHaveLength(0);
      expect(plan.unsupportedEvents).toHaveLength(1);
    }
    const ordinary = parseTextChordLabel("G7")!;
    expect(chordPitchClasses(ordinary)).toEqual([7, 11, 2, 5]);
    expect(voiceChordForPreview(ordinary).notes).toEqual([43, 59, 62, 65]);
  });

  it("keeps human notes authoritative but never treats stale app recommendations as human notes", () => {
    const snapshot = createTextProgressionStyleSnapshot(alt, "generated-close")!;
    expect(isUsablePracticeVoicing(snapshot, alt)).toBe(true);
    const ordinary = parseTextChordLabel("G7")!;
    expect(isUsablePracticeVoicing(snapshot, ordinary)).toBe(false);
    expect(isUsablePracticeVoicing({ ...snapshot, midiNotes: [43, 62, 65, 71] }, alt)).toBe(false);
    expect(isUsablePracticeVoicing({ ...snapshot, extractorVersion: undefined }, ordinary)).toBe(true);
    expect(isUsablePracticeVoicing({ ...snapshot, source: "live-played" }, ordinary)).toBe(true);
    expect(resolveTimelineItemVoicing({ bar: 1, beat: 1, durationBeats: 4, chord: alt,
      confidence: 0, warnings: [], alternatives: [], voicingMemory: {
        practiceVoicingOverride: { ...snapshot, capturedForChordKey: "7:dom7:-:-", midiNotes: [43, 59, 62, 65] },
      } }).midiNotes).toEqual([]);
  });

  it("restores full registered harmony without adding fields to legacy occurrence storage", () => {
    expect(occurrenceChord({ root: 7, quality: "dom7", symbol: "G7alt" })).toEqual(alt);
    expect(occurrenceChord({ root: 7, quality: "dom7", bass: 11, symbol: "G7alt/B" })).toEqual({ ...alt, bass: 11, label: "G7alt/B" });
    expect(occurrenceChord({ root: 7, quality: "dom7", symbol: "G7(b9,b13)" })?.tensions).toEqual(["b9", "b13"]);
    expect(occurrenceChord({ root: 0, quality: "dom7", symbol: "G7alt" })).toBeUndefined();
    expect(occurrenceChord({ root: 7, quality: "dom7", symbol: "unrecognized" })).toBeUndefined();
  });
});
