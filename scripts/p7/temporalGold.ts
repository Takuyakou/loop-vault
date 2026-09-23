import { Midi } from "@tonejs/midi";

export const temporalGoldVersion = "p7-temporal-gold-v1" as const;
export const temporalCategories = [
  "ordinary-sustained-chord", "single-voice-passing-note", "neighbor-note",
  "appoggiatura-like-note", "same-voicing-restrike", "same-voicing-arpeggio",
  "voicing-only-change", "one-beat-passing-chord", "half-beat-passing-chord",
  "true-harmonic-change", "sustained-pedal-residual", "bass-pedal-point",
  "syncopated-harmonic-change",
] as const;
export type TemporalCategory = (typeof temporalCategories)[number];
export type NoteEventKind = "passing" | "neighbor" | "appoggiatura" | "restrike" | "arpeggio" | "residual";
export interface SourceNote {
  readonly pitch: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly velocity: number;
}
export interface HarmonicSpan {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly identity: string;
}
export interface VoicingSpan {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly targetMidi: readonly number[];
}
export interface NoteEvent {
  readonly kind: NoteEventKind;
  readonly startBeat: number;
  readonly endBeat: number;
}
export interface TemporalGoldCase {
  readonly schemaVersion: 1;
  readonly goldVersion: typeof temporalGoldVersion;
  readonly id: string;
  readonly category: TemporalCategory;
  readonly lengthBeats: number;
  readonly notes: readonly SourceNote[];
  readonly harmonicSpans: readonly HarmonicSpan[];
  readonly voicingSpans: readonly VoicingSpan[];
  readonly noteEvents: readonly NoteEvent[];
}
const n = (pitch: number, startBeat: number, durationBeats: number): SourceNote =>
  ({ pitch, startBeat, durationBeats, velocity: 0.8 });
const chord = (pitches: readonly number[], startBeat: number, endBeat: number): SourceNote[] =>
  pitches.map((pitch) => n(pitch, startBeat, endBeat - startBeat));
const h = (startBeat: number, endBeat: number, identity: string): HarmonicSpan =>
  ({ startBeat, endBeat, identity });
const v = (startBeat: number, endBeat: number, targetMidi: readonly number[]): VoicingSpan =>
  ({ startBeat, endBeat, targetMidi });
const e = (kind: NoteEventKind, startBeat: number, endBeat: number): NoteEvent =>
  ({ kind, startBeat, endBeat });
function fixture(
  id: TemporalCategory,
  notes: readonly SourceNote[],
  harmonicSpans: readonly HarmonicSpan[],
  voicingSpans: readonly VoicingSpan[],
  noteEvents: readonly NoteEvent[] = [],
): TemporalGoldCase {
  return { schemaVersion: 1, goldVersion: temporalGoldVersion, id, category: id,
    lengthBeats: 4, notes, harmonicSpans, voicingSpans, noteEvents };
}

/** Authored source notes and truth are independent of analyzer output. */
export const temporalGoldCases: readonly TemporalGoldCase[] = [
  fixture("ordinary-sustained-chord", chord([48, 55, 59, 64], 0, 4),
    [h(0, 4, "Cmaj7")], [v(0, 4, [48, 55, 59, 64])]),
  fixture("single-voice-passing-note",
    [...chord([48, 52, 55], 0, 4), n(62, 1.5, 0.5)],
    [h(0, 4, "C")], [v(0, 4, [48, 52, 55])], [e("passing", 1.5, 2)]),
  fixture("neighbor-note",
    [n(60, 0, 4), n(67, 0, 4), n(64, 0, 1), n(65, 1, 0.5), n(64, 1.5, 2.5)],
    [h(0, 4, "C")], [v(0, 4, [60, 64, 67])], [e("neighbor", 1, 1.5)]),
  fixture("appoggiatura-like-note",
    [n(64, 0, 4), n(67, 0, 4), n(62, 0, 0.5), n(60, 0.5, 3.5)],
    [h(0, 4, "C")], [v(0, 4, [60, 64, 67])], [e("appoggiatura", 0, 0.5)]),
  fixture("same-voicing-restrike",
    [...chord([48, 52, 55], 0, 2), ...chord([48, 52, 55], 2, 4)],
    [h(0, 4, "C")], [v(0, 4, [48, 52, 55])], [e("restrike", 2, 2)]),
  fixture("same-voicing-arpeggio",
    [n(60, 0, 4), n(64, 0.25, 3.75), n(67, 0.5, 3.5)],
    [h(0, 4, "C")], [v(0, 4, [60, 64, 67])], [e("arpeggio", 0, 0.5)]),
  fixture("voicing-only-change",
    [...chord([48, 55, 59, 64], 0, 2), ...chord([48, 59, 64, 67], 2, 4)],
    [h(0, 4, "Cmaj7")],
    [v(0, 2, [48, 55, 59, 64]), v(2, 4, [48, 59, 64, 67])]),
  fixture("one-beat-passing-chord",
    [...chord([48, 55, 59, 64], 0, 2), ...chord([49, 56, 60, 65], 2, 3), ...chord([50, 57, 60, 65], 3, 4)],
    [h(0, 2, "Cmaj7"), h(2, 3, "Dbmaj7"), h(3, 4, "Dm7")],
    [v(0, 2, [48, 55, 59, 64]), v(2, 3, [49, 56, 60, 65]), v(3, 4, [50, 57, 60, 65])]),
  fixture("half-beat-passing-chord",
    [...chord([48, 55, 59, 64], 0, 2), ...chord([49, 56, 60, 65], 2, 2.5), ...chord([50, 57, 60, 65], 2.5, 4)],
    [h(0, 2, "Cmaj7"), h(2, 2.5, "Dbmaj7"), h(2.5, 4, "Dm7")],
    [v(0, 2, [48, 55, 59, 64]), v(2, 2.5, [49, 56, 60, 65]), v(2.5, 4, [50, 57, 60, 65])]),
  fixture("true-harmonic-change",
    [...chord([48, 55, 59, 64], 0, 2), ...chord([53, 60, 64, 69], 2, 4)],
    [h(0, 2, "Cmaj7"), h(2, 4, "Fmaj7")],
    [v(0, 2, [48, 55, 59, 64]), v(2, 4, [53, 60, 64, 69])]),
  fixture("sustained-pedal-residual",
    [n(48, 0, 4), ...chord([55, 59, 64], 0, 2), ...chord([50, 57, 60, 65], 2, 4)],
    [h(0, 2, "Cmaj7"), h(2, 4, "Dm7")],
    [v(0, 2, [48, 55, 59, 64]), v(2, 4, [50, 57, 60, 65])],
    [e("residual", 2, 4)]),
  fixture("bass-pedal-point",
    [n(48, 0, 4), ...chord([55, 59, 64], 0, 2), ...chord([53, 57, 64], 2, 4)],
    [h(0, 2, "Cmaj7"), h(2, 4, "Fmaj7/C")],
    [v(0, 2, [48, 55, 59, 64]), v(2, 4, [48, 53, 57, 64])]),
  fixture("syncopated-harmonic-change",
    [...chord([48, 55, 59, 64], 0, 1.5), ...chord([53, 60, 64, 69], 1.5, 4)],
    [h(0, 1.5, "Cmaj7"), h(1.5, 4, "Fmaj7")],
    [v(0, 1.5, [48, 55, 59, 64]), v(1.5, 4, [53, 60, 64, 69])]),
];

export function temporalBoundaryStarts(spans: readonly { startBeat: number }[]): number[] {
  return spans.slice(1).map((span) => span.startBeat);
}
export function validateTemporalGoldCase(input: TemporalGoldCase): string[] {
  const issues: string[] = [];
  if (input.schemaVersion !== 1 || input.goldVersion !== temporalGoldVersion) issues.push("version");
  if (!temporalCategories.includes(input.category) || input.id !== input.category) issues.push("category");
  if (!Number.isFinite(input.lengthBeats) || input.lengthBeats <= 0) issues.push("length");
  for (const [name, spans] of [["harmonic", input.harmonicSpans], ["voicing", input.voicingSpans]] as const) {
    if (spans.length === 0 || spans[0]?.startBeat !== 0 || spans[spans.length - 1]?.endBeat !== input.lengthBeats) {
      issues.push(`${name}-coverage`);
    }
    for (let index = 0; index < spans.length; index++) {
      const span = spans[index]!;
      if (!(span.startBeat >= 0 && span.endBeat > span.startBeat && span.endBeat <= input.lengthBeats)
        || (index > 0 && span.startBeat !== spans[index - 1]!.endBeat)) issues.push(`${name}-continuity`);
    }
  }
  for (const span of input.voicingSpans) {
    const notes = span.targetMidi;
    if (notes.length < 2 || notes.some((pitch) => !Number.isInteger(pitch) || pitch < 0 || pitch > 127)
      || new Set(notes).size !== notes.length || notes.some((pitch, index) => index > 0 && pitch <= notes[index - 1]!)) {
      issues.push("voicing-target");
    }
    if (notes.some((pitch) => !input.notes.some((source) => source.pitch === pitch
      && source.startBeat < span.endBeat && source.startBeat + source.durationBeats > span.startBeat))) {
      issues.push("target-not-observed");
    }
  }
  for (const note of input.notes) {
    if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127
      || !Number.isFinite(note.startBeat) || !Number.isFinite(note.durationBeats)
      || note.startBeat < 0 || note.durationBeats <= 0 || note.startBeat + note.durationBeats > input.lengthBeats
      || note.velocity <= 0 || note.velocity > 1) issues.push("source-note");
  }
  for (const event of input.noteEvents) {
    if (event.startBeat < 0 || event.endBeat < event.startBeat || event.endBeat > input.lengthBeats) issues.push("note-event");
  }
  return [...new Set(issues)];
}
export function encodeTemporalGoldMidi(input: TemporalGoldCase): Uint8Array {
  const issues = validateTemporalGoldCase(input);
  if (issues.length > 0) throw new Error(`Invalid temporal Gold: ${issues.join(",")}`);
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4], measures: 0 });
  const track = midi.addTrack();
  track.name = "Synthetic harmony";
  for (const note of input.notes) {
    track.addNote({ midi: note.pitch, ticks: Math.round(note.startBeat * 480),
      durationTicks: Math.round(note.durationBeats * 480), velocity: note.velocity });
  }
  return new Uint8Array(midi.toArray());
}
