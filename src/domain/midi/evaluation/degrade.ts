import { parseMidi, writeMidi } from "midi-file";
import type { MidiData, MidiEvent, MidiHeader } from "midi-file";

export type MidiDegradationId =
  | "type0-merge"
  | "gm-drums-overlay"
  | "lead-melody-overlay"
  | "track-name-removal"
  | "program-removal"
  | "all-program-0"
  | "sustain-extension"
  | "timing-jitter"
  | "piano-left-hand-bass"
  | "same-channel-melody"
  | "combined";

export type DirtyCorpusCategory =
  | "type0"
  | "drums"
  | "melody"
  | "metadata-missing"
  | "sustain"
  | "jitter"
  | "same-channel-mixed"
  | "combined";

export interface MidiDegradationRecipe {
  id: MidiDegradationId;
  reportCategory: DirtyCorpusCategory;
  transforms: MidiDegradationId[];
}

export const midiDegradationRecipes: readonly MidiDegradationRecipe[] = [
  recipe("type0-merge", "type0"),
  recipe("gm-drums-overlay", "drums"),
  recipe("lead-melody-overlay", "melody"),
  recipe("track-name-removal", "metadata-missing"),
  recipe("program-removal", "metadata-missing"),
  recipe("all-program-0", "metadata-missing"),
  recipe("sustain-extension", "sustain"),
  recipe("timing-jitter", "jitter"),
  recipe("piano-left-hand-bass", "same-channel-mixed"),
  recipe("same-channel-melody", "same-channel-mixed"),
  {
    id: "combined",
    reportCategory: "combined",
    transforms: [
      "gm-drums-overlay",
      "lead-melody-overlay",
      "track-name-removal",
      "program-removal",
      "sustain-extension",
      "timing-jitter",
      "same-channel-melody",
      "type0-merge",
    ],
  },
] as const;

interface AbsoluteEvent {
  tick: number;
  sourceTrackIndex: number;
  sourceEventIndex: number;
  insertionIndex: number;
  event: MidiEvent;
}

interface WorkingMidi {
  header: MidiHeader;
  tracks: AbsoluteEvent[][];
  originalEndTicks: number[];
  nextInsertionIndex: number;
}

interface NotePair {
  on: AbsoluteEvent;
  off: AbsoluteEvent;
}

export function degradeMidi(
  bytes: Uint8Array,
  degradation: MidiDegradationId | MidiDegradationRecipe,
  seed: number,
): Uint8Array {
  const selected = typeof degradation === "string"
    ? midiDegradationRecipes.find((entry) => entry.id === degradation)
    : degradation;
  if (!selected) throw new Error(`Unknown MIDI degradation: ${String(degradation)}`);

  const working = toWorkingMidi(bytes);
  selected.transforms.forEach((transform, index) => {
    applyTransform(working, transform, mixSeed(seed, transform, index));
  });
  return Uint8Array.from(writeMidi(fromWorkingMidi(working)));
}

export function deterministicDegradationSeed(
  globalSeed: number,
  sourceIdentity: string,
  degradationId: MidiDegradationId,
): number {
  return hash32(`${globalSeed >>> 0}:${sourceIdentity}:${degradationId}`);
}

function recipe(id: MidiDegradationId, reportCategory: DirtyCorpusCategory): MidiDegradationRecipe {
  return { id, reportCategory, transforms: [id] };
}

function toWorkingMidi(bytes: Uint8Array): WorkingMidi {
  const midi = parseMidi(bytes);
  if (!midi.header.ticksPerBeat || midi.header.ticksPerBeat <= 0) {
    throw new Error("Dirty corpus generation requires PPQ MIDI");
  }
  let insertionIndex = 0;
  const originalEndTicks: number[] = [];
  return {
    header: { ...midi.header },
    tracks: midi.tracks.map((track, sourceTrackIndex) => {
      let tick = 0;
      const absoluteEvents = track
        .map((event, sourceEventIndex) => {
          tick += event.deltaTime;
          return {
            tick,
            sourceTrackIndex,
            sourceEventIndex,
            insertionIndex: insertionIndex++,
            event: { ...event, deltaTime: 0 },
          };
        });
      originalEndTicks.push(absoluteEvents.reduce(
        (maximum, entry) => entry.event.type === "endOfTrack" ? Math.max(maximum, entry.tick) : maximum,
        0,
      ));
      return absoluteEvents.filter((entry) => entry.event.type !== "endOfTrack");
    }),
    originalEndTicks,
    nextInsertionIndex: insertionIndex,
  };
}

function fromWorkingMidi(working: WorkingMidi): MidiData {
  const tracks = working.tracks.map((track, trackIndex) => {
    const sorted = [...track].sort(compareAbsoluteEvents);
    let previousTick = 0;
    const events = sorted.map((entry) => {
      const event = { ...entry.event, deltaTime: Math.max(0, entry.tick - previousTick) } as MidiEvent;
      previousTick = entry.tick;
      return event;
    });
    const endTick = Math.max(working.originalEndTicks[trackIndex] ?? 0, previousTick);
    events.push({ deltaTime: endTick - previousTick, meta: true, type: "endOfTrack" });
    return events;
  });
  return {
    header: {
      ...working.header,
      format: working.header.format,
      numTracks: tracks.length,
    },
    tracks,
  };
}

function applyTransform(working: WorkingMidi, transform: MidiDegradationId, seed: number): void {
  switch (transform) {
    case "type0-merge":
      mergeToTypeZero(working);
      return;
    case "gm-drums-overlay":
      addDrums(working);
      return;
    case "lead-melody-overlay":
      addMelody(working, false, seed);
      return;
    case "track-name-removal":
      filterEvents(working, (event) => event.type !== "trackName");
      return;
    case "program-removal":
      filterEvents(working, (event) => event.type !== "programChange");
      return;
    case "all-program-0":
      setAllProgramsToZero(working);
      return;
    case "sustain-extension":
      addSustain(working);
      return;
    case "timing-jitter":
      jitterNotes(working, seed);
      return;
    case "piano-left-hand-bass":
      addPianoLeftHand(working);
      return;
    case "same-channel-melody":
      addMelody(working, true, seed);
      return;
    case "combined":
      throw new Error("combined must expand to primitive transforms");
  }
}

function mergeToTypeZero(working: WorkingMidi): void {
  working.tracks = [working.tracks.flat()];
  working.originalEndTicks = [Math.max(0, ...working.originalEndTicks)];
  working.header = { ...working.header, format: 0, numTracks: 1 };
}

function filterEvents(working: WorkingMidi, keep: (event: MidiEvent) => boolean): void {
  working.tracks = working.tracks.map((track) => track.filter((entry) => keep(entry.event)));
}

function setAllProgramsToZero(working: WorkingMidi): void {
  filterEvents(working, (event) => event.type !== "programChange");
  for (const target of usedTrackChannels(working)) {
    addEvent(working, target.trackIndex, 0, {
      deltaTime: 0, type: "programChange", channel: target.channel, programNumber: 0,
    }, -1);
  }
}

function addDrums(working: WorkingMidi): void {
  const ticksPerBeat = ticksPerBeatOf(working);
  const endTick = Math.max(ticksPerBeat, timelineEnd(working));
  const trackIndex = working.tracks.length;
  working.tracks.push([]);
  working.originalEndTicks.push(0);
  addEvent(working, trackIndex, 0, { deltaTime: 0, meta: true, type: "trackName", text: "Dirty GM Drums" });
  for (let tick = 0, beat = 0; tick < endTick; tick += ticksPerBeat, beat += 1) {
    const notes = beat % 4 === 0 ? [36, 42] : beat % 4 === 2 ? [38, 42] : [42];
    for (const noteNumber of notes) {
      addNote(working, trackIndex, 9, noteNumber, tick, Math.max(1, Math.floor(ticksPerBeat / 8)), 88);
    }
  }
}

function addMelody(working: WorkingMidi, sameChannel: boolean, seed: number): void {
  const ticksPerBeat = ticksPerBeatOf(working);
  const endTick = Math.max(ticksPerBeat, timelineEnd(working));
  const target = sameChannel ? dominantTrackChannel(working) : undefined;
  const trackIndex = target?.trackIndex ?? working.tracks.length;
  const channel = target?.channel ?? firstUnusedChannel(working);
  if (!target) {
    working.tracks.push([]);
    working.originalEndTicks.push(0);
    addEvent(working, trackIndex, 0, { deltaTime: 0, meta: true, type: "trackName", text: "Dirty Lead Melody" });
    addEvent(working, trackIndex, 0, { deltaTime: 0, type: "programChange", channel, programNumber: 80 });
  }
  const base = 72 + (seed % 5);
  const steps = [0, 2, 4, 7, 9, 7, 4, 2];
  for (let tick = 0, index = 0; tick < endTick; tick += ticksPerBeat, index += 1) {
    const noteNumber = Math.min(108, base + steps[index % steps.length]);
    addNote(working, trackIndex, channel, noteNumber, tick, Math.max(1, Math.floor(ticksPerBeat * 0.7)), 78);
  }
}

function addSustain(working: WorkingMidi): void {
  const endTick = Math.max(1, timelineEnd(working));
  for (const target of usedTrackChannels(working).filter((entry) => entry.channel !== 9)) {
    addEvent(working, target.trackIndex, 0, {
      deltaTime: 0, type: "controller", channel: target.channel, controllerType: 64, value: 127,
    });
    addEvent(working, target.trackIndex, endTick, {
      deltaTime: 0, type: "controller", channel: target.channel, controllerType: 64, value: 0,
    });
  }
}

function jitterNotes(working: WorkingMidi, seed: number): void {
  const maximum = Math.max(1, Math.floor(ticksPerBeatOf(working) / 20));
  notePairs(working).forEach((pair, index) => {
    const raw = mixSeed(seed, "jitter", index) % (maximum * 2 + 1);
    const offset = raw - maximum;
    const duration = Math.max(1, pair.off.tick - pair.on.tick);
    const start = Math.max(0, pair.on.tick + offset);
    pair.on.tick = start;
    pair.off.tick = start + duration;
  });
}

function addPianoLeftHand(working: WorkingMidi): void {
  const target = dominantTrackChannel(working);
  if (!target) return;
  const ticksPerBeat = ticksPerBeatOf(working);
  const barTicks = ticksPerBeat * 4;
  const endTick = Math.max(barTicks, timelineEnd(working));
  const existingPitches = noteOns(working)
    .filter((entry) => channelOf(entry.event) === target.channel)
    .map((entry) => noteNumberOf(entry.event))
    .filter((pitch): pitch is number => pitch !== undefined);
  const bassPitch = Math.max(24, Math.min(48, (Math.min(...existingPitches, 60) % 12) + 36));
  for (let tick = 0; tick < endTick; tick += barTicks) {
    addNote(working, target.trackIndex, target.channel, bassPitch, tick, Math.max(1, barTicks - 1), 72);
  }
}

function addNote(
  working: WorkingMidi,
  trackIndex: number,
  channel: number,
  noteNumber: number,
  startTick: number,
  durationTick: number,
  velocity: number,
): void {
  addEvent(working, trackIndex, startTick, { deltaTime: 0, type: "noteOn", channel, noteNumber, velocity });
  addEvent(working, trackIndex, startTick + durationTick, { deltaTime: 0, type: "noteOff", channel, noteNumber, velocity: 0 });
}

function addEvent(
  working: WorkingMidi,
  trackIndex: number,
  tick: number,
  event: MidiEvent,
  sourceEventIndex?: number,
): void {
  while (working.tracks.length <= trackIndex) {
    working.tracks.push([]);
    working.originalEndTicks.push(0);
  }
  const insertionIndex = working.nextInsertionIndex++;
  working.tracks[trackIndex].push({
    tick,
    sourceTrackIndex: trackIndex,
    sourceEventIndex: sourceEventIndex ?? 1_000_000 + insertionIndex,
    insertionIndex,
    event,
  });
}

function notePairs(working: WorkingMidi): NotePair[] {
  const pairs: NotePair[] = [];
  for (const track of working.tracks) {
    const active = new Map<string, AbsoluteEvent[]>();
    for (const entry of [...track].sort(compareAbsoluteEvents)) {
      const channel = channelOf(entry.event);
      const noteNumber = noteNumberOf(entry.event);
      if (channel === undefined || noteNumber === undefined) continue;
      const key = `${channel}:${noteNumber}`;
      if (entry.event.type === "noteOn" && entry.event.velocity > 0) {
        const queue = active.get(key) ?? [];
        queue.push(entry);
        active.set(key, queue);
      } else if (entry.event.type === "noteOff" || (entry.event.type === "noteOn" && entry.event.velocity === 0)) {
        const on = active.get(key)?.shift();
        if (on) pairs.push({ on, off: entry });
      }
    }
  }
  return pairs.sort((a, b) => compareAbsoluteEvents(a.on, b.on));
}

function noteOns(working: WorkingMidi): AbsoluteEvent[] {
  return working.tracks.flat().filter(
    (entry) => entry.event.type === "noteOn" && entry.event.velocity > 0,
  );
}

function dominantTrackChannel(working: WorkingMidi): { trackIndex: number; channel: number } | undefined {
  const counts = new Map<string, { trackIndex: number; channel: number; count: number }>();
  working.tracks.forEach((track, trackIndex) => {
    for (const entry of track) {
      if (entry.event.type !== "noteOn" || entry.event.velocity <= 0 || entry.event.channel === 9) continue;
      const key = `${trackIndex}:${entry.event.channel}`;
      const current = counts.get(key) ?? { trackIndex, channel: entry.event.channel, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
  });
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.trackIndex - b.trackIndex || a.channel - b.channel,
  )[0];
}

function usedTrackChannels(working: WorkingMidi): Array<{ trackIndex: number; channel: number }> {
  const values = new Map<string, { trackIndex: number; channel: number }>();
  working.tracks.forEach((track, trackIndex) => {
    for (const entry of track) {
      const channel = channelOf(entry.event);
      if (channel !== undefined) values.set(`${trackIndex}:${channel}`, { trackIndex, channel });
    }
  });
  return [...values.values()].sort((a, b) => a.trackIndex - b.trackIndex || a.channel - b.channel);
}

function firstUnusedChannel(working: WorkingMidi): number {
  const used = new Set(usedTrackChannels(working).map((entry) => entry.channel));
  for (let channel = 0; channel < 16; channel += 1) {
    if (channel !== 9 && !used.has(channel)) return channel;
  }
  return 15;
}

function channelOf(event: MidiEvent): number | undefined {
  return "channel" in event ? event.channel : undefined;
}

function noteNumberOf(event: MidiEvent): number | undefined {
  return event.type === "noteOn" || event.type === "noteOff" ? event.noteNumber : undefined;
}

function ticksPerBeatOf(working: WorkingMidi): number {
  const ticks = working.header.ticksPerBeat;
  if (!ticks || ticks <= 0) throw new Error("Dirty corpus generation requires PPQ MIDI");
  return ticks;
}

function timelineEnd(working: WorkingMidi): number {
  return working.tracks.flat().reduce((maximum, entry) => Math.max(maximum, entry.tick), 0);
}

function compareAbsoluteEvents(a: AbsoluteEvent, b: AbsoluteEvent): number {
  return a.tick - b.tick
    || a.sourceTrackIndex - b.sourceTrackIndex
    || a.sourceEventIndex - b.sourceEventIndex
    || a.insertionIndex - b.insertionIndex;
}

function mixSeed(seed: number, label: string, index: number): number {
  return hash32(`${seed >>> 0}:${label}:${index}`);
}

function hash32(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
