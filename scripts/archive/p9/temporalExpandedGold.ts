/** Authored public P9.2 temporal dev scenarios; boundaries are independent of analyzer output. */
import { Midi } from "@tonejs/midi";
export interface ExpandedTemporalCase {
  id: string;
  lengthBeats: number;
  meter: [number, number];
  notes: Array<{ pitch: number; startBeat: number; durationBeats: number }>;
  harmonic: number[];
  voicing: number[];
  noteEvents: number[];
  passing?: number[];
}
const n = (pitch: number, startBeat: number, durationBeats: number) => ({ pitch, startBeat, durationBeats });
const chord = (pitches: number[], startBeat: number, durationBeats: number) =>
  pitches.map((pitch) => n(pitch, startBeat, durationBeats));
export const expandedTemporalDev: ExpandedTemporalCase[] = [
  { id: "ghost-bass-offbeat", lengthBeats: 4, meter: [4, 4],
    notes: [...chord([48, 55, 60, 64], 0, 4), n(36, 1.5, 0.25)],
    harmonic: [], voicing: [], noteEvents: [1.5] },
  { id: "delayed-support-arpeggio", lengthBeats: 4, meter: [4, 4],
    notes: [n(48, 0, 4), n(55, 0, 4), n(60, 0.5, 3.5), n(64, 0.75, 3.25)],
    harmonic: [], voicing: [], noteEvents: [0.5] },
  { id: "long-same-chord-restrike", lengthBeats: 8, meter: [4, 4],
    notes: [...chord([48, 55, 60, 64], 0, 4), ...chord([48, 55, 60, 64], 4, 4)],
    harmonic: [], voicing: [], noteEvents: [4] },
  { id: "one-quarter-half-beat-passing", lengthBeats: 4, meter: [1, 4],
    notes: [...chord([48, 55, 59, 64], 0, 1.5), ...chord([49, 56, 60, 65], 1.5, 0.5),
      ...chord([50, 57, 60, 65], 2, 2)],
    harmonic: [1.5, 2], voicing: [1.5, 2], noteEvents: [], passing: [1.5, 2] },
  { id: "voicing-shift-no-harmony-change", lengthBeats: 4, meter: [4, 4],
    notes: [...chord([48, 55, 59, 64], 0, 2), ...chord([48, 59, 64, 67], 2, 2)],
    harmonic: [], voicing: [2], noteEvents: [] },
  { id: "bass-pedal-harmonic-change", lengthBeats: 4, meter: [4, 4],
    notes: [n(48, 0, 4), ...chord([55, 59, 64], 0, 2), ...chord([53, 57, 64], 2, 2)],
    harmonic: [2], voicing: [2], noteEvents: [] },
];
export function encodeExpandedTemporal(item: ExpandedTemporalCase): Uint8Array {
  if (!(item.lengthBeats > 0) || item.notes.some((note) => note.durationBeats <= 0
    || note.startBeat < 0 || note.startBeat + note.durationBeats > item.lengthBeats)
    || [...item.harmonic, ...item.voicing, ...item.noteEvents].some((beat) =>
      beat < 0 || beat >= item.lengthBeats)) throw new Error("Invalid authored temporal dev case");
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: item.meter, measures: 0 });
  const track = midi.addTrack();
  for (const note of item.notes) track.addNote({ midi: note.pitch,
    ticks: Math.round(note.startBeat * 480), durationTicks: Math.round(note.durationBeats * 480),
    velocity: 0.8 });
  return new Uint8Array(midi.toArray());
}
