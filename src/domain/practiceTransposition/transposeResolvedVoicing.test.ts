import { describe, expect, it } from "vitest";
import { voiceChordForPreview } from "../chordVoicing";
import { makeChordSymbol } from "../chords";
import type {
  ChordSymbol,
  ChordTimelineItem,
  ChordVoicingMemory,
} from "../types";
import { normalizedChordKey } from "../voicing";
import {
  getCanonicalKey,
  transposeProgression,
  transposeResolvedVoicing,
} from ".";

describe("resolved voicing transposition", () => {
  it("moves every source-voicing note by +1 semitone", () => {
    const progression = transposedProgression(1, [
      chordEvent(
        makeChordSymbol(0, "maj7"),
        0,
        verifiedVoicing(makeChordSymbol(0, "maj7"), [48, 55, 60, 64]),
      ),
    ]);
    const result = transposeResolvedVoicing(progression);
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (!result.ok) return;
    expect(result.plan.globalOctaveOffset).toBe(0);
    expect(result.plan.events[0]).toEqual(expect.objectContaining({
      sourceMidiNotes: [48, 55, 60, 64],
      midiNotes: [49, 56, 61, 65],
      origin: "source-verified",
      generatedFallback: false,
    }));
  });

  it("uses one -12 global octave offset for a +11 pitch-class shift", () => {
    const progression = transposedProgression(11, [
      chordEvent(
        makeChordSymbol(0, "maj7"),
        0,
        verifiedVoicing(makeChordSymbol(0, "maj7"), [48, 55, 60, 64]),
      ),
      chordEvent(
        makeChordSymbol(7, "dom7"),
        1,
        verifiedVoicing(makeChordSymbol(7, "dom7"), [43, 53, 59, 62]),
      ),
    ]);
    const result = transposeResolvedVoicing(progression);
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (!result.ok) return;
    expect(result.plan.globalOctaveOffset).toBe(-12);
    expect(result.plan.events.map((event) => event.midiNotes)).toEqual([
      [47, 54, 59, 63],
      [42, 52, 58, 61],
    ]);
    for (const event of result.plan.events) {
      event.midiNotes.forEach((note, index) => {
        expect(note - event.sourceMidiNotes[index]).toBe(-1);
      });
    }
  });

  it("applies the same octave offset to the whole progression", () => {
    const chords = [
      makeChordSymbol(0, "maj7"),
      makeChordSymbol(5, "maj7"),
      makeChordSymbol(7, "dom7"),
    ];
    const progression = transposedProgression(
      11,
      chords.map((chord, index) => chordEvent(
        chord,
        index,
        verifiedVoicing(chord, [
          84 + index,
          88 + index,
          91 + index,
          95 + index,
        ]),
      )),
    );
    const result = transposeResolvedVoicing(progression);
    if (!result.ok) throw new Error("Expected a playable voicing plan.");
    expect(result.plan.globalOctaveOffset).toBe(-12);
    const shifts = result.plan.events.flatMap((event) => (
      event.midiNotes.map((note, index) => note - event.sourceMidiNotes[index])
    ));
    expect(new Set(shifts)).toEqual(new Set([-1]));
    expect(Math.max(...result.plan.events.flatMap((event) => event.midiNotes)))
      .toBeLessThanOrEqual(108);
  });

  it("selects a +12 global octave offset for a low source voicing", () => {
    const chord = makeChordSymbol(0, "maj7");
    const progression = transposedProgression(0, [
      chordEvent(chord, 0, verifiedVoicing(chord, [10, 14, 17])),
    ]);
    const result = transposeResolvedVoicing(progression);
    if (!result.ok) throw new Error("Expected a playable low voicing.");
    expect(result.plan.globalOctaveOffset).toBe(12);
    expect(result.plan.events[0].midiNotes).toEqual([22, 26, 29]);
  });

  it("uses one shared offset for source memory and target-key fallback", () => {
    const memoryChord = makeChordSymbol(0, "maj7");
    const fallbackChord = makeChordSymbol(7, "dom7");
    const progression = transposedProgression(0, [
      chordEvent(
        memoryChord,
        0,
        verifiedVoicing(memoryChord, [10, 14, 17]),
      ),
      chordEvent(fallbackChord, 1),
    ]);
    const result = transposeResolvedVoicing(progression);
    if (!result.ok) throw new Error("Expected a mixed resolved plan.");
    const targetFallback = voiceChordForPreview(
      progression.events[1].chord,
    ).notes;
    expect(result.plan.globalOctaveOffset).toBe(12);
    expect(result.plan.events[0].midiNotes).toEqual([22, 26, 29]);
    expect(result.plan.events[1]).toEqual(expect.objectContaining({
      midiNotes: targetFallback.map((note) => note + 12),
      origin: "generated",
      generatedFallback: true,
    }));
    expect(result.plan.events.flatMap((event) => event.midiNotes).every(
      (note) => note >= 21 && note <= 108,
    )).toBe(true);
  });

  it("returns an explicit failure when no shared octave offset fits", () => {
    const chord = makeChordSymbol(0, "maj7");
    const progression = transposedProgression(0, [
      chordEvent(chord, 0, verifiedVoicing(chord, [0, 127])),
    ]);
    expect(transposeResolvedVoicing(progression)).toEqual({
      ok: false,
      reason: "midi-range-unavailable",
      minimumNote: 0,
      maximumNote: 127,
      allowedMinimum: 21,
      allowedMaximum: 108,
    });
  });

  it("uses the existing generated fallback when source memory is missing", () => {
    const chord = makeChordSymbol(9, "min7", ["9"]);
    const progression = transposedProgression(2, [chordEvent(chord, 0)]);
    const result = transposeResolvedVoicing(progression);
    if (!result.ok) throw new Error("Expected a generated fallback.");
    const sourceNotes = voiceChordForPreview(chord).notes;
    const targetNotes = voiceChordForPreview(progression.events[0].chord).notes;
    expect(result.plan.events[0]).toEqual(expect.objectContaining({
      sourceMidiNotes: sourceNotes,
      midiNotes: targetNotes.map(
        (note) => note + result.plan.globalOctaveOffset,
      ),
      origin: "generated",
      generatedFallback: true,
    }));
    expect(result.plan.warnings).toContainEqual({
      type: "generated-fallback",
      eventId: progression.events[0].eventId,
    });
  });

  it("treats stale source memory as a target-key generated fallback", () => {
    const chord = makeChordSymbol(0, "maj7");
    const stale = verifiedVoicing(chord, [48, 55, 60, 64]);
    if (stale.sourceVoicing) {
      stale.sourceVoicing.capturedForChordKey = normalizedChordKey(
        makeChordSymbol(7, "dom7"),
      );
    }
    const progression = transposedProgression(2, [
      chordEvent(chord, 0, stale),
    ]);
    const result = transposeResolvedVoicing(progression);
    if (!result.ok) throw new Error("Expected a stale-memory fallback.");
    const targetFallback = voiceChordForPreview(
      progression.events[0].chord,
    ).notes.map((note) => note + result.plan.globalOctaveOffset);
    expect(result.plan.events[0]).toEqual(expect.objectContaining({
      midiNotes: targetFallback,
      origin: "generated",
      generatedFallback: true,
    }));
  });

  it("warns only when adjacent voicing centers exceed the jump boundary", () => {
    const chord = makeChordSymbol(0, "maj7");
    const progression = transposedProgression(0, [
      chordEvent(chord, 0, verifiedVoicing(chord, [24, 28, 31])),
      chordEvent(chord, 1, verifiedVoicing(chord, [42, 46, 49])),
      chordEvent(chord, 2, verifiedVoicing(chord, [61, 65, 68])),
    ]);
    const result = transposeResolvedVoicing(progression);
    if (!result.ok) throw new Error("Expected a jump-diagnostic plan.");
    expect(result.plan.globalOctaveOffset).toBe(0);
    expect(result.plan.warnings).toEqual([{
      type: "large-voicing-jump",
      fromEventId: progression.events[1].eventId,
      toEventId: progression.events[2].eventId,
      semitones: 19,
    }]);
  });

  it("is deterministic and does not mutate its transposed input", () => {
    const chord = makeChordSymbol(0, "dom7", ["b9", "#11"], 4);
    const progression = transposedProgression(6, [
      chordEvent(chord, 0, verifiedVoicing(chord, [48, 58, 64, 66])),
      chordEvent(makeChordSymbol(5, "min9"), 1),
    ]);
    const snapshot = structuredClone(progression);
    const first = transposeResolvedVoicing(progression);
    for (let iteration = 0; iteration < 25; iteration += 1) {
      expect(transposeResolvedVoicing(progression)).toEqual(first);
    }
    expect(progression).toEqual(snapshot);
  });
});

function transposedProgression(
  targetTonicPitchClass: number,
  events: ChordTimelineItem[],
) {
  return transposeProgression({
    sourceKey: getCanonicalKey(0, "major"),
    sourceMode: "major",
    events,
    targetTonicPitchClass,
    sourceReference: { ideaId: "target-plan", blockId: "resolved" },
  });
}

function chordEvent(
  chord: ChordSymbol,
  index: number,
  voicingMemory?: ChordVoicingMemory,
): ChordTimelineItem {
  return {
    eventId: `resolved-${index}`,
    bar: index + 1,
    beat: 1,
    durationBeats: 4,
    chord,
    confidence: 1,
    alternatives: [],
    warnings: [],
    ...(voicingMemory ? { voicingMemory } : {}),
  };
}

function verifiedVoicing(
  chord: ChordSymbol,
  midiNotes: number[],
): ChordVoicingMemory {
  return {
    sourceVoicing: {
      schemaVersion: 1,
      source: "manual",
      representation: "simultaneous-voicing",
      midiNotes,
      capturedForChordKey: normalizedChordKey(chord),
      userVerified: true,
    },
  };
}
