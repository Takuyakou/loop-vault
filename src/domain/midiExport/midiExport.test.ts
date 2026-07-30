import { parseMidi, type MidiEvent } from "midi-file";
import { describe, expect, it } from "vitest";
import { voiceChordForPreview } from "../chordVoicing";
import { makeChordSymbol } from "../chords";
import { normalizedChordKey } from "../voicing";
import type {
  ChordQuality,
  ChordTimelineItem,
  SavedProgressionBlock,
} from "../types";
import {
  PROGRESSION_MIDI_PPQ,
  buildProgressionMidi,
  progressionToMidiModel,
} from ".";

describe("Progression MIDI export", () => {
  it("exports deterministic format-1 bytes with tempo, meter, markers, and balanced notes", () => {
    const block = progressionBlock([
      chordEvent(3, 1, 4, "Cmaj7"),
      chordEvent(4, 1, 4, "Dm7"),
      chordEvent(5, 1, 4, "G7"),
      chordEvent(6, 1, 4, "Cmaj7"),
    ], { bpm: 123, timeSignature: "4/4" });

    const first = buildProgressionMidi(block);
    const second = buildProgressionMidi(block);
    const parsed = parseMidi(first.bytes);
    const absolute = absoluteEvents(parsed.tracks);

    expect(first.bytes).toEqual(second.bytes);
    expect(parsed.header).toMatchObject({ format: 1, ticksPerBeat: 480 });
    expect(parsed.tracks).toHaveLength(2);
    expect(first.durationTicks).toBe(16 * PROGRESSION_MIDI_PPQ);
    expect(first.events[0]?.startTick).toBe(0);
    expect(metaEvent(absolute, "setTempo")).toMatchObject({
      tick: 0,
      microsecondsPerBeat: Math.round(60_000_000 / 123),
    });
    expect(metaEvent(absolute, "timeSignature")).toMatchObject({
      tick: 0,
      numerator: 4,
      denominator: 4,
    });
    expect(absolute.filter((event) => event.type === "marker").map((event) => ({
      tick: event.tick,
      text: event.text,
    }))).toEqual([
      { tick: 0, text: "Cmaj7" },
      { tick: 1920, text: "Dm7" },
      { tick: 3840, text: "G7" },
      { tick: 5760, text: "Cmaj7" },
    ]);
    expect(noteCount(absolute, "noteOn")).toBe(noteCount(absolute, "noteOff"));
    expect(activeNotesAtEnd(absolute)).toEqual([]);
    expect(lastTick(absolute)).toBe(first.durationTicks);
  });

  it.each([
    ["3/4", 3],
    ["4/4", 4],
    ["6/8", 3],
  ])("keeps %s timing", (timeSignature, beatsPerBar) => {
    const block = progressionBlock([
      chordEvent(9, 1, beatsPerBar, "C"),
      chordEvent(10, 1, beatsPerBar, "F"),
    ], { timeSignature });
    const result = buildProgressionMidi(block);

    expect(result.events.map((event) => event.startTick)).toEqual([
      0,
      beatsPerBar * PROGRESSION_MIDI_PPQ,
    ]);
    expect(result.durationTicks).toBe(beatsPerBar * 2 * PROGRESSION_MIDI_PPQ);
  });

  it("rounds fractional beats independently without accumulating error", () => {
    const model = progressionToMidiModel({
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      events: Array.from({ length: 100 }, (_, index) => ({
        chord: makeChordSymbol(0, "maj"),
        startBeats: index / 3,
        durationBeats: 1 / 3,
        voicing: { midiNotes: [48, 60, 64, 67], source: "generated" as const },
      })),
    });

    expect(model.events[99]?.startTick).toBe(Math.round(33 * PROGRESSION_MIDI_PPQ));
    expect(model.events.every((event) => event.durationTicks === 160)).toBe(true);
    expect(model.durationTicks).toBe(Math.round((100 / 3) * PROGRESSION_MIDI_PPQ));
  });

  it("keeps N.C. as silent duration", () => {
    const model = progressionToMidiModel({
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      events: [
        {
          chord: null,
          startBeats: 0,
          durationBeats: 4,
        },
        {
          chord: makeChordSymbol(0, "maj"),
          startBeats: 4,
          durationBeats: 4,
          voicing: { midiNotes: [48, 60, 64, 67], source: "generated" },
        },
      ],
    });

    expect(model.events[0]).toMatchObject({
      startTick: 0,
      endTick: 1920,
      midiNotes: [],
    });
    expect(model.durationTicks).toBe(3840);
  });

  it("uses edited, saved, generated, and mixed voicing summaries without mutating pitches", () => {
    const editedChord = chordEvent(1, 1, 2, "Cmaj7", {
      practiceVoicingOverride: snapshot("manual", "Cmaj7", [36, 55, 59, 64]),
    });
    const savedChord = chordEvent(1, 3, 2, "Dm7", {
      sourceVoicing: {
        ...snapshot("midi-extracted", "Dm7", [38, 53, 57, 60]),
        userVerified: true,
      },
    });
    const generatedChord = chordEvent(2, 1, 4, "G7");

    expect(buildProgressionMidi(progressionBlock([editedChord])).voicingSummary).toBe("edited");
    expect(buildProgressionMidi(progressionBlock([savedChord])).voicingSummary).toBe("saved");
    expect(buildProgressionMidi(progressionBlock([generatedChord])).voicingSummary).toBe("generated");

    const mixed = buildProgressionMidi(progressionBlock([
      editedChord,
      savedChord,
      generatedChord,
    ]));
    expect(mixed.voicingSummary).toBe("mixed");
    expect(mixed.events[0]?.midiNotes).toEqual([36, 55, 59, 64]);
    expect(mixed.events[1]?.midiNotes).toEqual([38, 53, 57, 60]);
  });

  it("keeps slash bass as the lowest note and rejects a mismatched saved voicing", () => {
    const generated = buildProgressionMidi(progressionBlock([
      chordEvent(1, 1, 4, "G7/B"),
    ]));
    expect((generated.events[0]?.midiNotes[0] ?? -1) % 12).toBe(11);

    expect(() => progressionToMidiModel({
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      events: [{
        chord: makeChordSymbol(7, "dom7", [], 11),
        startBeats: 0,
        durationBeats: 4,
        voicing: { midiNotes: [43, 59, 62, 65], source: "saved" },
      }],
    })).toThrowError(expect.objectContaining({
      code: "slash-bass-mismatch",
      eventIndex: 0,
    }));
  });

  it("orders note-off before note-on at a shared boundary without a gap", () => {
    const result = buildProgressionMidi(progressionBlock([
      chordEvent(1, 1, 2, "C"),
      chordEvent(1, 3, 2, "C"),
    ]));
    const parsed = parseMidi(result.bytes);
    const events = absoluteEvents([parsed.tracks[1] ?? []])
      .filter((event) => event.tick === 960 && (
        event.type === "noteOn" || event.type === "noteOff"
      ));

    const firstOn = events.findIndex((event) => event.type === "noteOn");
    const lastOff = events.reduce(
      (last, event, index) => event.type === "noteOff" ? index : last,
      -1,
    );
    expect(lastOff).toBeGreaterThanOrEqual(0);
    expect(firstOn).toBeGreaterThan(lastOff);
  });

  it("reports fallback warnings without serializing private metadata", () => {
    const block = progressionBlock([chordEvent(1, 1, 4, "Cmaj7")], {
      bpm: undefined,
      timeSignature: undefined,
      summaryText: "Private title",
      sourceFileName: "private-source.mid",
      memo: "private memo",
    });
    const result = buildProgressionMidi(block);
    const text = new TextDecoder().decode(result.bytes);

    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "bpm-fallback",
      "time-signature-fallback",
    ]);
    expect(result.bpm).toBe(96);
    expect(result.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(text).not.toContain("Private title");
    expect(text).not.toContain("private-source.mid");
    expect(text).not.toContain("private memo");
  });

  it.each([
    { durationBeats: 0, code: "invalid-duration" },
    { durationBeats: -1, code: "invalid-duration" },
  ])("rejects invalid duration $durationBeats", ({ durationBeats, code }) => {
    expect(() => progressionToMidiModel({
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      events: [{
        chord: makeChordSymbol(0, "maj"),
        startBeats: 0,
        durationBeats,
        voicing: { midiNotes: [48, 60, 64, 67], source: "generated" },
      }],
    })).toThrowError(expect.objectContaining({ code }));
  });

  it("covers every stored chord quality with deterministic generated pitches", () => {
    const qualities: ChordQuality[] = [
      "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7",
      "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4", "dom7sus4",
      "add9", "six", "min6", "sixNine",
    ];

    for (const quality of qualities) {
      const chord = makeChordSymbol(0, quality);
      const notes = voiceChordForPreview(chord).notes;
      const result = progressionToMidiModel({
        bpm: 120,
        timeSignature: { numerator: 4, denominator: 4 },
        events: [{
          chord,
          startBeats: 0,
          durationBeats: 4,
          voicing: { midiNotes: notes, source: "generated" },
        }],
      });
      expect(result.events[0]?.midiNotes.length, quality).toBeGreaterThanOrEqual(3);
    }
  });
});

function progressionBlock(
  chords: ChordTimelineItem[],
  overrides: Partial<SavedProgressionBlock> = {},
): SavedProgressionBlock {
  return {
    id: "export-test",
    summaryText: "Export test",
    chords,
    bpm: 120,
    timeSignature: "4/4",
    tags: [],
    capturedAt: "2026-07-30T00:00:00.000Z",
    analyzerVersion: "test",
    ...overrides,
  };
}

function chordEvent(
  bar: number,
  beat: number,
  durationBeats: number,
  label: string,
  voicingMemory?: ChordTimelineItem["voicingMemory"],
): ChordTimelineItem {
  const chord = parseTestChord(label);
  return {
    bar,
    beat,
    durationBeats,
    chord,
    confidence: 1,
    alternatives: [],
    warnings: [],
    voicingMemory,
  };
}

function parseTestChord(label: string) {
  const known = {
    C: makeChordSymbol(0, "maj"),
    F: makeChordSymbol(5, "maj"),
    G7: makeChordSymbol(7, "dom7"),
    "G7/B": makeChordSymbol(7, "dom7", [], 11),
    Cmaj7: makeChordSymbol(0, "maj7"),
    Dm7: makeChordSymbol(2, "min7"),
  } as const;
  const chord = known[label as keyof typeof known];
  if (!chord) throw new Error(`Unknown test chord: ${label}`);
  return { ...chord, label };
}

function snapshot(
  source: "manual" | "midi-extracted",
  label: string,
  midiNotes: number[],
) {
  const chord = parseTestChord(label);
  return {
    schemaVersion: 1 as const,
    source,
    representation: "simultaneous-voicing" as const,
    midiNotes,
    capturedForChordKey: normalizedChordKey(chord),
    capturedForChordLabel: chord.label,
  };
}

function absoluteEvents(tracks: readonly MidiEvent[][]) {
  return tracks.flatMap((track, trackIndex) => {
    let tick = 0;
    return track.map((event) => {
      tick += event.deltaTime;
      return { ...event, tick, trackIndex };
    });
  });
}

function metaEvent(
  events: ReturnType<typeof absoluteEvents>,
  type: MidiEvent["type"],
) {
  return events.find((event) => event.type === type);
}

function noteCount(
  events: ReturnType<typeof absoluteEvents>,
  type: "noteOn" | "noteOff",
) {
  return events.filter((event) => event.type === type).length;
}

function activeNotesAtEnd(events: ReturnType<typeof absoluteEvents>): number[] {
  const active = new Set<number>();
  for (const event of events) {
    if (event.type === "noteOn" && event.velocity > 0) active.add(event.noteNumber);
    if (
      event.type === "noteOff"
      || (event.type === "noteOn" && event.velocity === 0)
    ) {
      active.delete(event.noteNumber);
    }
  }
  return [...active];
}

function lastTick(events: ReturnType<typeof absoluteEvents>): number {
  return Math.max(...events.map((event) => event.tick));
}
