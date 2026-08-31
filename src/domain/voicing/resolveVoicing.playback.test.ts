import { describe, expect, it } from "vitest";
import { voiceChordForPreview } from "../chordVoicing";
import { parseChordLabel } from "../chords";
import type { ChordSymbol, ChordTimelineItem } from "../types";
import { normalizedChordKey } from "./normalizeVoicing";
import {
  createTimelineVoicingPlaybackPlan,
  resolveTimelineItemVoicing,
} from "./resolveVoicing";

const twelveSegmentPositions = [
  [1, 1, 4],
  [2, 1, 4],
  [3, 1, 2],
  [3, 3, 2],
  [4, 1, 2],
  [4, 3, 2],
  [5, 1, 4],
  [6, 1, 4],
  [7, 1, 2],
  [7, 3, 2],
  [8, 1, 2],
  [8, 3, 2],
] as const;

const twelveSegmentLabels = [
  "E6/9",
  "G#7(b13)",
  "C#m9",
  "Cmaj7",
  "Bm9",
  "E13",
  "Amaj9",
  "Am6",
  "E/G#",
  "C#7(b9)",
  "F#m9",
  "Amaj9/B",
] as const;

describe("source voicing full playback fidelity", () => {
  it("keeps card and full playback pitches equal for all 12 source-backed segments", () => {
    const timeline = twelveSegmentLabels.map((label, index) => {
      const [bar, beat, durationBeats] = twelveSegmentPositions[index]!;
      return sourceEvent(label, bar, beat, durationBeats, syntheticNotes(index));
    });

    const plan = createTimelineVoicingPlaybackPlan(timeline, "capture-full");

    expect(plan.timeline).toHaveLength(12);
    expect(Object.keys(plan.explicitMidiNotesByEventId)).toHaveLength(12);
    plan.timeline.forEach((playbackEvent, index) => {
      const eventId = playbackEvent.eventId;
      expect(eventId).toBeDefined();
      expect(plan.explicitMidiNotesByEventId[eventId!]).toEqual(
        resolveTimelineItemVoicing(timeline[index]!).midiNotes,
      );
    });
  });

  it.each(["G#7(b13)", "E13", "C#7(b9)"] as const)(
    "passes the altered source content for %s without generated substitution",
    (label) => {
      const sourceNotes = [37, 49, 58, 65, 74];
      const event = sourceEvent(label, 1, 1, 4, sourceNotes);
      const plan = createTimelineVoicingPlaybackPlan([event], "altered");
      const eventId = plan.timeline[0]!.eventId!;

      expect(plan.explicitMidiNotesByEventId[eventId]).toEqual(sourceNotes);
      expect(plan.explicitMidiNotesByEventId[eventId]).not.toEqual(
        voiceChordForPreview(event.chord).notes,
      );
    },
  );

  it.each([
    {
      name: "one-state bar with simultaneous notes",
      bar: 1, beat: 1, durationBeats: 4, notes: [36, 48, 52, 55],
    },
    {
      name: "two-state anticipation",
      bar: 2, beat: 0.75, durationBeats: 2.25, notes: [38, 50, 53, 57],
    },
    {
      name: "sustain crossing a segment boundary",
      bar: 3, beat: 3, durationBeats: 4, notes: [43, 50, 55, 59],
    },
    {
      name: "Bass-only lead resolved into a usable source snapshot",
      bar: 4, beat: 1, durationBeats: 2, notes: [35, 47, 52, 55],
    },
  ])("keeps $name aligned without rewriting segment facts", ({ bar, beat, durationBeats, notes }) => {
    const event = sourceEvent("Cmaj7", bar, beat, durationBeats, notes);
    const before = structuredClone(event);
    const plan = createTimelineVoicingPlaybackPlan([event], "boundary-case");
    const playbackEvent = plan.timeline[0]!;

    expect(plan.explicitMidiNotesByEventId[playbackEvent.eventId!]).toEqual(notes);
    expect(playbackEvent).toMatchObject({ bar, beat, durationBeats });
    expect(event).toEqual(before);
  });

  it("leaves source-missing events to the existing generated fallback", () => {
    const event = baseEvent("Cmaj7", 1, 1, 4);
    const plan = createTimelineVoicingPlaybackPlan([event], "fallback");
    const eventId = plan.timeline[0]!.eventId!;

    expect(plan.explicitMidiNotesByEventId).not.toHaveProperty(eventId);
    expect(resolveTimelineItemVoicing(event).midiNotes).toEqual(
      voiceChordForPreview(event.chord).notes,
    );
  });

  it("preserves one/two-state boundaries and crossing durations without mutating input", () => {
    const timeline = [
      sourceEvent("Cmaj7", 1, 1, 4, [36, 48, 55, 59]),
      sourceEvent("Dm9", 2, 1, 2, [38, 50, 53, 57, 64]),
      sourceEvent("G13", 2, 3, 2, [43, 50, 53, 59, 64]),
      sourceEvent("Cmaj7", 3, 1, 5, [36, 48, 52, 55, 59]),
      baseEvent("Am6", 4, 2.75, 1.25),
    ];
    const before = structuredClone(timeline);
    const first = createTimelineVoicingPlaybackPlan(timeline, "boundary");
    const second = createTimelineVoicingPlaybackPlan(timeline, "boundary");

    expect(first).toEqual(second);
    expect(timeline).toEqual(before);
    expect(first.timeline.map(({ bar, beat, durationBeats }) => [bar, beat, durationBeats]))
      .toEqual(timeline.map(({ bar, beat, durationBeats }) => [bar, beat, durationBeats]));
    expect(new Set(first.timeline.map((event) => event.eventId)).size).toBe(timeline.length);
  });

  it("rebuilds an aligned map for Track A OFF and ON segment shapes", () => {
    const off = Array.from({ length: 16 }, (_, index) => sourceEvent(
      "Cmaj7",
      Math.floor(index / 2) + 1,
      index % 2 === 0 ? 1 : 3,
      2,
      [36 + index, 48 + index, 60 + index],
    ));
    const on = twelveSegmentLabels.map((label, index) => {
      const [bar, beat, durationBeats] = twelveSegmentPositions[index]!;
      return sourceEvent(label, bar, beat, durationBeats, syntheticNotes(index + 20));
    });

    const offPlan = createTimelineVoicingPlaybackPlan(off, "capture-full");
    const onPlan = createTimelineVoicingPlaybackPlan(on, "capture-full");

    expect(offPlan.timeline).toHaveLength(16);
    expect(onPlan.timeline).toHaveLength(12);
    onPlan.timeline.forEach((event, index) => {
      expect(onPlan.explicitMidiNotesByEventId[event.eventId!]).toEqual(
        resolveTimelineItemVoicing(on[index]!).midiNotes,
      );
    });
  });
});

function sourceEvent(
  label: string,
  bar: number,
  beat: number,
  durationBeats: number,
  midiNotes: number[],
): ChordTimelineItem {
  const event = baseEvent(label, bar, beat, durationBeats);
  return {
    ...event,
    voicingMemory: {
      sourceVoicing: {
        schemaVersion: 1,
        source: "midi-extracted",
        representation: "simultaneous-voicing",
        midiNotes: [...midiNotes],
        capturedForChordKey: normalizedChordKey(event.chord),
        confidence: 1,
        userVerified: true,
      },
    },
  };
}

function baseEvent(
  label: string,
  bar: number,
  beat: number,
  durationBeats: number,
): ChordTimelineItem {
  return {
    bar,
    beat,
    durationBeats,
    chord: requiredChord(label),
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  };
}

function requiredChord(label: string): ChordSymbol {
  const chord = parseChordLabel(label);
  if (!chord) throw new Error(`Unsupported synthetic chord: ${label}`);
  return chord;
}

function syntheticNotes(index: number): number[] {
  return [36 + index, 48 + index, 60 + index];
}
