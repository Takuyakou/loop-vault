import { writeMidi, type MidiEvent } from "midi-file";
import { describe, expect, it } from "vitest";
import { createAnalysisSession, type PreAnalysisNote } from "../midi/preAnalysis";
import { chordsAboveLine, singleShareAbove, suggestMelodyFrom } from "./suggestLine";

/** The suggestion and the warning have to agree (P15-02 follow-up): a suggested line never warns. */
const CHORDS = [
  { lh: [48, 55], rh: [64, 71], far: [86, 89, 93, 89], mixed: [88, 86, 91, 89], near: [69, 67, 64, 62] },
  { lh: [45, 52], rh: [60, 67], far: [83, 86, 89, 86], mixed: [84, 83, 88, 86], near: [67, 64, 62, 60] },
  { lh: [50, 57], rh: [65, 72], far: [88, 91, 95, 91], mixed: [89, 88, 93, 91], near: [72, 69, 65, 64] },
  { lh: [43, 50], rh: [59, 65], far: [81, 84, 88, 84], mixed: [83, 81, 86, 84], near: [71, 67, 65, 62] },
];

function notesOf(kind: "far" | "mixed" | "near" | "none", bars = 8, melodyBars = bars): PreAnalysisNote[] {
  const ev: Array<{ at: number; e: MidiEvent }> = [];
  const add = (pitch: number, start: number, dur: number) => {
    ev.push({ at: Math.round(start * 480), e: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: pitch, velocity: 80 } });
    ev.push({ at: Math.round((start + dur) * 480) - 1, e: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: pitch, velocity: 0 } });
  };
  for (let bar = 0; bar < bars; bar += 1) {
    const chord = CHORDS[bar % 4]!;
    for (const pitch of [...chord.lh, ...chord.rh]) add(pitch, bar * 4, 4);
    if (kind !== "none" && bar < melodyBars) chord[kind].forEach((pitch, index) => add(pitch, bar * 4 + index, 1));
  }
  ev.sort((a, b) => a.at - b.at);
  let last = 0;
  const track: MidiEvent[] = [{ deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 }];
  for (const { at, e } of ev) { track.push({ ...e, deltaTime: at - last } as MidiEvent); last = at; }
  track.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  const bytes = Uint8Array.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [track] }));
  const session = createAnalysisSession([{ sourceId: "s", displayName: "s.mid", bytes }]).session!;
  return session.notes;
}

describe("suggestMelodyFrom and the warning agree", () => {
  it("a part of chords only gets no suggestion", () => {
    expect(suggestMelodyFrom(notesOf("none"))).toBeUndefined();
    expect(suggestMelodyFrom(notesOf("none", 16))).toBeUndefined();
  });

  it("a part that is only an arpeggio (1-3-5-8 in eighth notes, no melody) gets no suggestion", () => {
    const note = (pitch: number, startBeat: number): PreAnalysisNote => ({
      sourceId: "s", voiceId: "v", trackIndex: 0, channel: 0, pitch, velocity: 80, startBeat, durationBeats: 0.5,
    });
    const arpeggio: PreAnalysisNote[] = [];
    for (let bar = 0; bar < 8; bar += 1) {
      [[48, 52, 55, 60], [45, 48, 52, 57], [41, 45, 48, 53], [43, 47, 50, 55]][bar % 4]!.forEach((pitch, index) => {
        arpeggio.push(note(pitch, bar * 4 + index * 0.5), note(pitch, bar * 4 + 2 + index * 0.5));
      });
    }
    expect(suggestMelodyFrom(arpeggio)).toBeUndefined();
  });

  it("a line with more than half of the part above it is not suggested, and not when what is below is not chords", () => {
    const note = (pitch: number, startBeat: number, durationBeats: number): PreAnalysisNote => ({
      sourceId: "s", voiceId: "v", trackIndex: 0, channel: 0, pitch, velocity: 80, startBeat, durationBeats,
    });
    const chords = Array.from({ length: 8 }, (_, bar) => [48, 55].map((pitch) => note(pitch, bar * 4, 4))).flat(); // 16
    const melody = (count: number) => Array.from({ length: count }, (_, index) => note(80, 1 + index * 2, 1));
    expect(suggestMelodyFrom([...chords, ...melody(16)])).toBe(80); // 50%: allowed
    expect(suggestMelodyFrom([...chords, ...melody(18)])).toBeUndefined(); // over 50%
    const singles = Array.from({ length: 16 }, (_, index) => note(48 + (index % 3) * 4, index * 2, 1));
    expect(suggestMelodyFrom([...singles, ...melody(8)])).toBeUndefined(); // below: single notes, not chords
  });

  it("a suggested line never warns, in every kind of song that gets one", () => {
    for (const kind of ["far", "mixed"] as const) {
      const notes = notesOf(kind);
      const line = suggestMelodyFrom(notes);
      expect(line, kind).toBeDefined();
      expect(singleShareAbove(notes, line!)).toBeGreaterThanOrEqual(0.8);
      expect(chordsAboveLine(notes, line!)).toBe(false);
    }
    // overlapping ranges: nothing is suggested at all
    expect(suggestMelodyFrom(notesOf("near"))).toBeUndefined();
  });

  it("a line through the chords warns (the line itself is not refused)", () => {
    const notes = notesOf("far");
    expect(chordsAboveLine(notes, 62)).toBe(true);
    expect(singleShareAbove(notes, 62)).toBeLessThan(0.8);
    expect(chordsAboveLine(notes, 81)).toBe(false);
  });

  it("a height with only a few notes above it (1-6% of the part) is not suggested", () => {
    const note = (pitch: number, startBeat: number, durationBeats: number): PreAnalysisNote => ({
      sourceId: "s", voiceId: "v", trackIndex: 0, channel: 0, pitch, velocity: 80, startBeat, durationBeats,
    });
    const chords = Array.from({ length: 16 }, (_, bar) => [48, 55, 64, 71].map((pitch) => note(pitch, bar * 4, 4))).flat();
    const few = [90, 91, 92, 93].map((pitch, index) => note(pitch, index, 1)); // 4 of 68 notes (6%)
    expect(suggestMelodyFrom([...chords, ...few])).toBeUndefined();
    // the same four notes are enough when they are 10% or more of the part
    expect(suggestMelodyFrom([...chords.slice(0, 32), ...few])).toBe(90);
    // and whatever is suggested on a real-looking part keeps 10% of the notes above the line
    const notes = notesOf("far", 16, 1);
    const line = suggestMelodyFrom(notes);
    if (line !== undefined) {
      expect(notes.filter((entry) => entry.pitch >= line).length / notes.length).toBeGreaterThanOrEqual(0.1);
    }
    expect(suggestMelodyFrom(notesOf("far", 16, 16))).toBeDefined();
  });
});
