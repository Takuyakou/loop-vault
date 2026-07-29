import { parseMidi as parseMidiFile } from "midi-file";
import type { MidiEvent } from "midi-file";
import type { MidiControlChange, MidiTempoChange, ParsedTimedNote, TimedNote } from "./types";

export interface RawSmfTrack {
  index: number;
  name: string;
  channels: number[];
  explicitPrograms: number[];
}

export interface RawSmfSong {
  format: 0 | 1 | 2;
  ticksPerBeat: number;
  tempo?: number;
  tempoChanges: MidiTempoChange[];
  timeSignature: [number, number];
  timeSignatureChanges: {
    tick: number;
    numerator: number;
    denominator: number;
  }[];
  notes: ParsedTimedNote[];
  tracks: RawSmfTrack[];
  controlChanges: MidiControlChange[];
}

interface ActiveNote {
  pitch: number;
  startTick: number;
  velocity: number;
  trackIndex: number;
  channel: number;
  program: number;
  programExplicit: boolean;
}

interface TimedMeta<T> {
  tick: number;
  trackIndex: number;
  eventIndex: number;
  value: T;
}

interface TimedChannelEvent {
  tick: number;
  trackIndex: number;
  eventIndex: number;
  event: Extract<MidiEvent, { channel: number }>;
}

export function parseRawSmf(bytes: Uint8Array): RawSmfSong {
  const midi = parseMidiFile(bytes);
  if (midi.header.format === 2) {
    throw new Error("MIDI format 2 is unsupported because it contains independent timelines");
  }
  if (!midi.header.ticksPerBeat || midi.header.ticksPerBeat <= 0) {
    throw new Error("SMPTE time division is unsupported; PPQ ticks are required");
  }
  const ticksPerBeat = midi.header.ticksPerBeat;
  const notes: ParsedTimedNote[] = [];
  const controlChanges: MidiControlChange[] = [];
  const tempos: TimedMeta<number>[] = [];
  const timeSignatures: TimedMeta<[number, number]>[] = [];
  const channelEvents: TimedChannelEvent[] = [];
  const trackEndTicks = new Map<number, number>();

  const tracks = midi.tracks.map((events, trackIndex) => {
    let tick = 0;
    let name = "";
    const channels = new Set<number>();
    const explicitPrograms = new Set<number>();

    events.forEach((event, eventIndex) => {
      tick += event.deltaTime;

      if (event.type === "trackName" && !name) {
        name = decodeMidiText(event.text);
        return;
      }
      if (event.type === "setTempo") {
        tempos.push({
          tick,
          trackIndex,
          eventIndex,
          value: 60_000_000 / event.microsecondsPerBeat,
        });
        return;
      }
      if (event.type === "timeSignature") {
        timeSignatures.push({
          tick,
          trackIndex,
          eventIndex,
          value: [event.numerator, event.denominator],
        });
        return;
      }
      if (!isChannelEvent(event)) {
        return;
      }

      channels.add(event.channel);
      if (event.type === "programChange") {
        explicitPrograms.add(event.programNumber);
      }
      channelEvents.push({ tick, trackIndex, eventIndex, event });
    });

    trackEndTicks.set(trackIndex, tick);

    return {
      index: trackIndex,
      name,
      channels: [...channels].sort((a, b) => a - b),
      explicitPrograms: [...explicitPrograms].sort((a, b) => a - b),
    };
  });

  const programs = new Map<number, { program: number; explicit: boolean }>();
  const activeNotes = new Map<string, ActiveNote[]>();
  for (const { tick, trackIndex, event } of orderTimed(channelEvents)) {
    if (event.type === "programChange") {
      programs.set(event.channel, { program: event.programNumber, explicit: true });
      continue;
    }
    if (event.type === "controller") {
      controlChanges.push({
        trackIndex,
        channel: event.channel,
        number: event.controllerType,
        tick,
        value: event.value / 127,
      });
      continue;
    }
    if (event.type === "noteOn" && event.velocity > 0) {
      const state = programs.get(event.channel) ?? { program: 0, explicit: false };
      const key = noteKey(trackIndex, event.channel, event.noteNumber);
      const queue = activeNotes.get(key) ?? [];
      queue.push({
        pitch: event.noteNumber,
        startTick: tick,
        velocity: event.velocity / 127,
        trackIndex,
        channel: event.channel,
        program: state.program,
        programExplicit: state.explicit,
      });
      activeNotes.set(key, queue);
      continue;
    }
    if (event.type === "noteOff" || (event.type === "noteOn" && event.velocity === 0)) {
      finishNote(activeNotes, notes, trackIndex, event.channel, event.noteNumber, tick);
    }
  }
  closeDanglingNotes(activeNotes, notes, trackEndTicks);

  const orderedTempos = orderTimed(tempos);
  const orderedTimeSignatures = orderTimed(timeSignatures);
  const tempo = orderedTempos[0]?.value;
  const timeSignature = orderedTimeSignatures[0]?.value ?? [4, 4];

  return {
    format: midi.header.format,
    ticksPerBeat,
    ...(tempo !== undefined ? { tempo } : {}),
    tempoChanges: orderedTempos.map(({ tick, value: bpm }) => ({ tick, bpm })),
    timeSignature,
    timeSignatureChanges: orderedTimeSignatures.map(({
      tick,
      value: [numerator, denominator],
    }) => ({ tick, numerator, denominator })),
    notes: notes.sort(compareNotes),
    tracks,
    controlChanges: controlChanges.sort(
      (a, b) => a.tick - b.tick || a.trackIndex - b.trackIndex || a.number - b.number,
    ),
  };
}

function isChannelEvent(event: MidiEvent): event is Extract<MidiEvent, { channel: number }> {
  return "channel" in event;
}

function decodeMidiText(text: string): string {
  if ([...text].some((character) => character.charCodeAt(0) > 0xff)) {
    return text;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from([...text].map((character) => character.charCodeAt(0))),
    );
  } catch {
    return text;
  }
}

function noteKey(trackIndex: number, channel: number, pitch: number): string {
  return `${trackIndex}:${channel}:${pitch}`;
}

function finishNote(
  activeNotes: Map<string, ActiveNote[]>,
  notes: ParsedTimedNote[],
  trackIndex: number,
  channel: number,
  pitch: number,
  endTick: number,
): void {
  const key = noteKey(trackIndex, channel, pitch);
  const queue = activeNotes.get(key);
  const active = queue?.shift();
  if (!active) {
    return;
  }
  if (queue?.length === 0) {
    activeNotes.delete(key);
  }
  notes.push({
    pitch: active.pitch,
    startTick: active.startTick,
    durationTick: Math.max(1, endTick - active.startTick),
    velocity: active.velocity,
    trackIndex: active.trackIndex,
    channel: active.channel,
    program: active.program,
    programExplicit: active.programExplicit,
  });
}

function closeDanglingNotes(
  activeNotes: Map<string, ActiveNote[]>,
  notes: ParsedTimedNote[],
  trackEndTicks: ReadonlyMap<number, number>,
): void {
  const dangling = [...activeNotes.values()].flat().sort(
    (a, b) => a.channel - b.channel || a.pitch - b.pitch || a.startTick - b.startTick,
  );
  for (const active of dangling) {
    const trackEndTick = trackEndTicks.get(active.trackIndex) ?? active.startTick + 1;
    notes.push({
      pitch: active.pitch,
      startTick: active.startTick,
      durationTick: Math.max(1, trackEndTick - active.startTick),
      velocity: active.velocity,
      trackIndex: active.trackIndex,
      channel: active.channel,
      program: active.program,
      programExplicit: active.programExplicit,
    });
  }
  activeNotes.clear();
}

function compareNotes(a: TimedNote, b: TimedNote): number {
  return a.startTick - b.startTick
    || a.pitch - b.pitch
    || a.trackIndex - b.trackIndex
    || (a.channel ?? -1) - (b.channel ?? -1)
    || a.durationTick - b.durationTick;
}

function orderTimed<T extends { tick: number; trackIndex: number; eventIndex: number }>(values: T[]): T[] {
  return [...values].sort(
    (a, b) => a.tick - b.tick || a.trackIndex - b.trackIndex || a.eventIndex - b.eventIndex,
  );
}
