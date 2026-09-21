/**
 * P5.34 deterministic synthetic MIDI fixtures (privacy-safe).
 *
 * These build independent micro-cases; none reconstruct any private material.
 * All fixtures are single-track, PPQ-timed, with no real filenames.
 */

import { writeMidi } from "midi-file";
import type { MidiEvent } from "midi-file";

export interface SyntheticNote {
  pitch: number;
  startTick: number;
  durationTick: number;
  velocity?: number;
  channel?: number;
}

export interface BuildMidiOptions {
  ticksPerBeat?: number;
  numerator?: number;
  denominator?: number;
  tempoMicrosPerBeat?: number;
  notes: SyntheticNote[];
}

/** Builds a single-track MIDI file from absolute-tick notes. */
export function buildMidi(options: BuildMidiOptions): Uint8Array {
  const ticksPerBeat = options.ticksPerBeat ?? 96;
  const events: MidiEvent[] = [];

  if (options.tempoMicrosPerBeat !== undefined) {
    events.push({
      deltaTime: 0,
      meta: true,
      type: "setTempo",
      microsecondsPerBeat: options.tempoMicrosPerBeat,
    });
  }
  if (options.numerator !== undefined) {
    events.push({
      deltaTime: 0,
      meta: true,
      type: "timeSignature",
      numerator: options.numerator,
      denominator: options.denominator ?? 4,
      metronome: 24,
      thirtyseconds: 8,
    });
  }

  const absolute: Array<{ tick: number; event: MidiEvent }> = [];
  for (const note of options.notes) {
    const channel = note.channel ?? 0;
    absolute.push({
      tick: note.startTick,
      event: {
        deltaTime: 0,
        type: "noteOn",
        channel,
        noteNumber: note.pitch,
        velocity: note.velocity ?? 100,
      },
    });
    absolute.push({
      tick: note.startTick + note.durationTick,
      event: {
        deltaTime: 0,
        type: "noteOff",
        channel,
        noteNumber: note.pitch,
        velocity: 0,
      },
    });
  }

  // noteOff before noteOn at an equal tick (stable ordering).
  absolute.sort(
    (a, b) => a.tick - b.tick || (a.event.type === "noteOff" ? -1 : 1),
  );

  let previousTick = 0;
  for (const { tick, event } of absolute) {
    event.deltaTime = tick - previousTick;
    previousTick = tick;
    events.push(event);
  }
  events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });

  return Uint8Array.from(
    writeMidi({
      header: { format: 0, numTracks: 1, ticksPerBeat },
      tracks: [events],
    }),
  );
}

/** A simultaneous chord: all pitches start at tick 0 with the same duration. */
export function chordFixture(
  pitches: number[],
  options: {
    ticksPerBeat?: number;
    numerator?: number;
    denominator?: number;
    durationTicks?: number;
  } = {},
): Uint8Array {
  const ticksPerBeat = options.ticksPerBeat ?? 96;
  const durationTicks = options.durationTicks ?? ticksPerBeat * 2;
  return buildMidi({
    ticksPerBeat,
    numerator: options.numerator,
    denominator: options.denominator,
    tempoMicrosPerBeat: 500_000,
    notes: pitches.map((pitch) => ({ pitch, startTick: 0, durationTick: durationTicks })),
  });
}

/** MIDI note numbers for the contract-03 semantic pitch sets (S01–S07). */
export const semanticPitchSets: ReadonlyArray<{
  id: string;
  pitches: number[];
  note: string;
}> = [
  { id: "S01", pitches: [57, 60, 63, 67, 70], note: "Ab C Eb G Bb -> Abmaj9" },
  { id: "S02", pitches: [55, 59, 62, 63, 65], note: "G B Bb Eb F -> G7(#9,b13,no5) family" },
  { id: "S03", pitches: [59, 62, 66, 69], note: "B D F# A -> Bm7" },
  { id: "S04", pitches: [59, 63, 69, 61, 64], note: "B D# A C# E -> B11(no5) family" },
  { id: "S05", pitches: [40, 64, 67, 52], note: "C/E with structural E bass" },
  { id: "S06", pitches: [55, 60, 62, 65], note: "G C D F -> G7sus4" },
  { id: "S07", pitches: [59, 62, 65, 69], note: "B D F A -> Bm7b5" },
];

/** A four-chord progression (C Am F G) under a given meter, PPQ96. */
export function progressionFixture(numerator: number, denominator: number): Uint8Array {
  const chords: Array<{ start: number; pitches: number[] }> = [
    { start: 0, pitches: [48, 60, 64, 67] }, // C
    { start: 192, pitches: [45, 57, 60, 64] }, // Am
    { start: 384, pitches: [41, 53, 57, 60] }, // F
    { start: 576, pitches: [43, 55, 59, 62] }, // G
  ];
  return buildMidi({
    ticksPerBeat: 96,
    numerator,
    denominator,
    tempoMicrosPerBeat: 500_000,
    notes: chords.flatMap(({ start, pitches }) =>
      pitches.map((pitch) => ({ pitch, startTick: start, durationTick: 192 })),
    ),
  });
}

/** Contract-03 timing fixtures (T01–T08), PPQ96, single C-major-ish topology. */
export const timingFixtures: ReadonlyArray<{
  id: string;
  note: string;
  build: () => Uint8Array;
}> = [
  {
    id: "T01",
    note: "all simultaneous",
    build: () =>
      buildMidi({
        ticksPerBeat: 96,
        numerator: 4,
        denominator: 4,
        notes: [48, 60, 64, 67].map((pitch) => ({ pitch, startTick: 0, durationTick: 192 })),
      }),
  },
  {
    id: "T02",
    note: "bass +1 tick",
    build: () =>
      buildMidi({
        ticksPerBeat: 96,
        numerator: 4,
        denominator: 4,
        notes: [
          { pitch: 48, startTick: 1, durationTick: 192 },
          ... [60, 64, 67].map((pitch) => ({ pitch, startTick: 0, durationTick: 192 })),
        ],
      }),
  },
  {
    id: "T03",
    note: "bass +4 ticks",
    build: () =>
      buildMidi({
        ticksPerBeat: 96,
        numerator: 4,
        denominator: 4,
        notes: [
          { pitch: 48, startTick: 4, durationTick: 192 },
          ... [60, 64, 67].map((pitch) => ({ pitch, startTick: 0, durationTick: 192 })),
        ],
      }),
  },
  {
    id: "T04",
    note: "distributed micro-jitter",
    build: () =>
      buildMidi({
        ticksPerBeat: 96,
        numerator: 4,
        denominator: 4,
        notes: [48, 60, 64, 67].map((pitch, index) => ({
          pitch,
          startTick: index,
          durationTick: 192,
        })),
      }),
  },
  {
    id: "T05",
    note: "full chord -> bass re-strike -> same chord",
    build: () =>
      buildMidi({
        ticksPerBeat: 96,
        numerator: 4,
        denominator: 4,
        notes: [
          ... [48, 60, 64, 67].map((pitch) => ({ pitch, startTick: 0, durationTick: 96 })),
          { pitch: 48, startTick: 96, durationTick: 96 },
        ],
      }),
  },
  {
    id: "T06",
    note: "genuine two-chord boundary (C -> Am)",
    build: () =>
      buildMidi({
        ticksPerBeat: 96,
        numerator: 4,
        denominator: 4,
        notes: [
          ... [48, 60, 64, 67].map((pitch) => ({ pitch, startTick: 0, durationTick: 96 })),
          ... [45, 57, 60, 64].map((pitch) => ({ pitch, startTick: 96, durationTick: 96 })),
        ],
      }),
  },
  {
    id: "T07",
    note: "arpeggio hard negative (C E G sequential)",
    build: () =>
      buildMidi({
        ticksPerBeat: 96,
        numerator: 4,
        denominator: 4,
        notes: [
          { pitch: 48, startTick: 0, durationTick: 48 },
          { pitch: 60, startTick: 48, durationTick: 48 },
          { pitch: 64, startTick: 96, durationTick: 48 },
          { pitch: 67, startTick: 144, durationTick: 48 },
        ],
      }),
  },
  {
    id: "T08",
    note: "structural slash-bass change (C/E -> G/B)",
    build: () =>
      buildMidi({
        ticksPerBeat: 96,
        numerator: 4,
        denominator: 4,
        notes: [
          ... [40, 64, 67].map((pitch) => ({ pitch, startTick: 0, durationTick: 96 })), // C/E
          ... [47, 62, 67].map((pitch) => ({ pitch, startTick: 96, durationTick: 96 })), // G/B
        ],
      }),
  },
];
