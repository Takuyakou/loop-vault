import { describe, expect, it } from "vitest";
import type { ChordSymbol } from "../../../domain/types";
import {
  CHORD_CONTEXT_MAX_SECTION_BEATS,
  buildChordContextPlaybackPlan,
  type ChordContextListenInput,
} from "./chordContextPlayback";

const cMaj7: ChordSymbol = { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" };
const g7: ChordSymbol = { root: 7, quality: "dom7", tensions: [], label: "G7" };

describe("P5.18.1 long Chord Context sections", () => {
  it("creates one deterministic bounded plan for a complete 12-bar phrase", () => {
    const chordEvents = Array.from({ length: 12 }, (_, index) => ({
      id: `chord:${index}`,
      chord: index % 4 === 3 ? g7 : cMaj7,
      startBeat: index * 4,
      durationBeats: 4,
    }));
    const bassEvents = Array.from({ length: 12 }, (_, index) => ({
      id: `bass:${index}`,
      pitch: index % 4 === 3 ? 43 : 36,
      startBeat: index * 4,
      durationBeats: 1,
      velocity: 0.8,
    }));
    const input: ChordContextListenInput = {
      mode: "listen",
      listenMode: "bass-chords-and-metronome",
      bpm: 96,
      meter: { numerator: 4, denominator: 4 },
      countInBeats: 4,
      chordEvents,
      bassEvents,
    };

    const first = buildChordContextPlaybackPlan(input);
    const second = buildChordContextPlaybackPlan(structuredClone(input));

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.error.message);
    const plannedChords = first.plan.events.filter((event) => event.layer === "chords");
    expect(plannedChords).toHaveLength(12);
    expect(first.plan.events.filter((event) => event.layer === "bass")).toHaveLength(12);
    expect(first.plan.events.filter((event) => event.layer === "metronome")).toHaveLength(52);
    expect(plannedChords[plannedChords.length - 1]?.beat).toBe(CHORD_CONTEXT_MAX_SECTION_BEATS - 4);
  });
});
