import { writeMidi, type MidiEvent } from "midi-file";
import type { ProgressionMidiModel } from "./types";

type WithoutDelta<T> = T extends unknown ? Omit<T, "deltaTime"> : never;
type MidiEventWithoutDelta = WithoutDelta<MidiEvent>;

interface AbsoluteMidiEvent {
  tick: number;
  order: number;
  sequence: number;
  event: MidiEventWithoutDelta;
}

export function serializeProgressionMidi(model: ProgressionMidiModel): Uint8Array {
  const metaEvents: AbsoluteMidiEvent[] = [
    absoluteMeta(0, 0, {
      meta: true,
      type: "trackName",
      text: "Loop Vault Progression",
    }),
    absoluteMeta(0, 1, {
      meta: true,
      type: "setTempo",
      microsecondsPerBeat: Math.round(60_000_000 / model.bpm),
    }),
    absoluteMeta(0, 2, {
      meta: true,
      type: "timeSignature",
      numerator: model.timeSignature.numerator,
      denominator: model.timeSignature.denominator,
      metronome: 24,
      thirtyseconds: 8,
    }),
    ...model.events.flatMap((event, index) => event.chord
      ? [absoluteMeta(event.startTick, 10 + index, {
          meta: true,
          type: "marker",
          text: event.chord.label,
        })]
      : []),
    absoluteMeta(model.durationTicks, Number.MAX_SAFE_INTEGER, {
      meta: true,
      type: "endOfTrack",
    }),
  ];

  const noteEvents: AbsoluteMidiEvent[] = [
    absoluteNote(0, 0, {
      meta: true,
      type: "trackName",
      text: "Loop Vault Chords",
    }),
  ];
  let sequence = 1;
  for (const event of model.events) {
    for (const noteNumber of event.midiNotes) {
      noteEvents.push(absoluteNote(event.endTick, sequence++, {
        type: "noteOff",
        channel: 0,
        noteNumber,
        velocity: 0,
      }, 0));
    }
    for (const noteNumber of event.midiNotes) {
      noteEvents.push(absoluteNote(event.startTick, sequence++, {
        type: "noteOn",
        channel: 0,
        noteNumber,
        velocity: event.velocity,
      }, 1));
    }
  }
  noteEvents.push(absoluteNote(model.durationTicks, Number.MAX_SAFE_INTEGER, {
    meta: true,
    type: "endOfTrack",
  }, 2));

  return Uint8Array.from(writeMidi({
    header: {
      format: 1,
      numTracks: 2,
      ticksPerBeat: model.ppq,
    },
    tracks: [
      toDeltaEvents(metaEvents),
      toDeltaEvents(noteEvents),
    ],
  }, { running: false, useByte9ForNoteOff: false }));
}

function absoluteMeta(
  tick: number,
  sequence: number,
  event: MidiEventWithoutDelta,
): AbsoluteMidiEvent {
  return { tick, order: 0, sequence, event };
}

function absoluteNote(
  tick: number,
  sequence: number,
  event: MidiEventWithoutDelta,
  order = 0,
): AbsoluteMidiEvent {
  return { tick, order, sequence, event };
}

function toDeltaEvents(events: readonly AbsoluteMidiEvent[]): MidiEvent[] {
  const ordered = [...events].sort((left, right) => (
    left.tick - right.tick
    || left.order - right.order
    || left.sequence - right.sequence
  ));
  let previousTick = 0;
  return ordered.map(({ tick, event }) => {
    const deltaTime = tick - previousTick;
    previousTick = tick;
    return { ...event, deltaTime } as MidiEvent;
  });
}
