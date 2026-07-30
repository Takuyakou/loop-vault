import { writeMidi, type MidiEvent } from "midi-file";

const ticksPerBeat = 480;
const ticksPerBar = ticksPerBeat * 4;
const chordPitches = [
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
] as const;

export interface MidiFixtureOptions {
  bars?: number;
  voiceCount?: number;
}

export function createMidiFixture({
  bars = 8,
  voiceCount = 3,
}: MidiFixtureOptions = {}): Uint8Array {
  const conductor: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "trackName", text: "Loop Vault E2E" },
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
    {
      deltaTime: 0,
      meta: true,
      type: "timeSignature",
      numerator: 4,
      denominator: 4,
      metronome: 24,
      thirtyseconds: 8,
    },
    { deltaTime: bars * ticksPerBar, meta: true, type: "endOfTrack" },
  ];
  const tracks = Array.from({ length: voiceCount }, (_, index) =>
    createVoiceTrack(index, bars));

  return Uint8Array.from(writeMidi({
    header: {
      format: 1,
      numTracks: tracks.length + 1,
      ticksPerBeat,
    },
    tracks: [conductor, ...tracks],
  }));
}

function createVoiceTrack(index: number, bars: number): MidiEvent[] {
  const channel = index === 3 ? 9 : index % 9;
  const events: MidiEvent[] = [
    {
      deltaTime: 0,
      meta: true,
      type: "trackName",
      text: voiceName(index),
    },
    {
      deltaTime: 0,
      type: "programChange",
      channel,
      programNumber: programFor(index),
    },
  ];

  for (let bar = 0; bar < bars; bar += 1) {
    const pitches = pitchesFor(index, bar);
    for (const pitch of pitches) {
      events.push({
        deltaTime: 0,
        type: "noteOn",
        channel,
        noteNumber: pitch,
        velocity: index === 2 ? 82 : 96,
      });
    }
    pitches.forEach((pitch, pitchIndex) => {
      events.push({
        deltaTime: pitchIndex === 0 ? ticksPerBar : 0,
        type: "noteOff",
        channel,
        noteNumber: pitch,
        velocity: 0,
      });
    });
  }
  events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return events;
}

function pitchesFor(index: number, bar: number): readonly number[] {
  if (index === 0) return chordPitches[bar % chordPitches.length];
  if (index === 1) return [chordPitches[bar % chordPitches.length][0] - 24];
  if (index === 2) return [chordPitches[bar % chordPitches.length][2] + 12];
  if (index === 3) return [36];
  return [48 + ((index + bar) % 12)];
}

function voiceName(index: number): string {
  if (index === 0) return "Harmony Piano";
  if (index === 1) return "Electric Bass";
  if (index === 2) return "Lead Melody";
  if (index === 3) return "Drums";
  return `Pad Layer ${index + 1}`;
}

function programFor(index: number): number {
  if (index === 1) return 33;
  if (index === 2) return 80;
  if (index >= 4) return 88;
  return 0;
}
