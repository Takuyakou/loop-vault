import { describe, expect, it } from "vitest";
import { parseExtendedTextProgression } from "./extendedTextProgression";
import { extendedTextPlaybackNotes } from "./extendedTextPlayback";
import { evaluateExtendedTextPractice } from "./extendedTextPractice";

describe("P8.8.2 Extended Text playback and practice preflight", () => {
  it("places Generated notes at authored written/repeat attacks, preserving hold and rest", () => {
    const result = parseExtendedTextProgression("| C % = _ | F/C |", { beat: "4/4" });
    expect(result.canConvert).toBe(true);
    const notes = extendedTextPlaybackNotes(result);
    const starts = [...new Set(notes.map(note => note.startBeat))];
    expect(starts).toEqual([0, 1, 4]);
    expect(notes.filter(note => note.startBeat === 0).map(note => note.pitch))
      .toEqual(notes.filter(note => note.startBeat === 1).map(note => note.pitch));
    expect(notes.every(note => note.startBeat !== 2 && note.startBeat !== 3)).toBe(true);
    const withClick = extendedTextPlaybackNotes(result, true);
    expect(withClick.length).toBe(notes.length + 8);
    expect(withClick.filter(note => note.velocity === 46)).toHaveLength(8);
  });

  it("separates a saveable 5-slot score from the exact practice grid limit", () => {
    const supported = parseExtendedTextProgression("| C % = _ |", { beat: "4/4" });
    expect(evaluateExtendedTextPractice(supported, 120)).toEqual({ ready: true });
    const unsupported = parseExtendedTextProgression("| C Dm G7 F Am |", { beat: "4/4" });
    expect(unsupported.canConvert).toBe(true);
    expect(evaluateExtendedTextPractice(unsupported, 120)).toMatchObject({
      ready: false, reason: "invalid-timing",
    });
  });
});
