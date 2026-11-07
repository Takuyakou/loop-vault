import { writeMidi, type MidiEvent } from "midi-file";
import { describe, expect, it } from "vitest";
import {
  buildSessionAnalysisRequest,
  createAnalysisSession,
  isBackwardEquivalentSession,
  type AnalysisSession,
} from "../midi/preAnalysis";
import {
  buildSplitAnalysisRequest,
  deriveSplitSession,
  originalNotesOf,
  restorePartNames,
  type PartSplits,
} from "./splitSession";
import { suggestMelodyFrom } from "./suggestLine";

function session(): AnalysisSession {
  // One track, one channel: chords (held 4 beats) with a melody on top (one beat each), a pedal.
  const events: Array<{ at: number; event: MidiEvent }> = [];
  const add = (pitch: number, start: number, dur: number, vel: number) => {
    events.push({ at: Math.round(start * 480), event: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: pitch, velocity: vel } });
    events.push({ at: Math.round((start + dur) * 480) - 1, event: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: pitch, velocity: 0 } });
  };
  for (let bar = 0; bar < 4; bar += 1) {
    for (const pitch of [48, 55, 64, 71]) add(pitch, bar * 4, 4, 70);
    [86, 89, 93, 89].forEach((pitch, index) => add(pitch, bar * 4 + index, 1, 100 + index));
  }
  events.push({ at: 0, event: { deltaTime: 0, type: "controller", channel: 0, controllerType: 64, value: 127 } });
  events.sort((a, b) => a.at - b.at);
  let last = 0;
  const track: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
  ];
  for (const { at, event } of events) {
    track.push({ ...event, deltaTime: at - last } as MidiEvent);
    last = at;
  }
  track.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  const bytes = Uint8Array.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [track] }));
  return createAnalysisSession([{ sourceId: "s", displayName: "s.mid", bytes }]).session!;
}

const splitsFor = (base: AnalysisSession, melodyFrom = 80): PartSplits => ({
  [base.voices[0]!.id]: { melodyFrom },
});

describe("deriveSplitSession", () => {
  it("returns the very same session when nothing is split, and its request is today's request", () => {
    const base = session();
    expect(deriveSplitSession(base, {}).session).toBe(base);
    expect(buildSplitAnalysisRequest(base, {}).request).toEqual(buildSessionAnalysisRequest(base));
    expect(deriveSplitSession(base, { nobody: { melodyFrom: 70 } }).session).toBe(base);
  });

  it("keeps the original session untouched", () => {
    const base = session();
    const before = JSON.stringify(base);
    deriveSplitSession(base, splitsFor(base));
    expect(JSON.stringify(base)).toBe(before);
  });

  it("does not lose, add or change a note: every note is analysed or put aside, exactly once", () => {
    const base = session();
    const { request, map, excluded } = buildSplitAnalysisRequest(base, splitsFor(base));
    const ppq = base.sources[0]!.ppq;
    const back = [
      ...originalNotesOf(request.options.preparedData!, map),
      ...excluded.flatMap((part) => part.notes.map((note) => ({
        partId: part.partId,
        pitch: note.pitch,
        startTick: Math.max(0, Math.round(note.startBeat * ppq)),
        durationTick: Math.max(1, Math.round(note.durationBeats * ppq)),
        velocity: note.velocity,
      }))),
    ];
    expect(excluded.flatMap((part) => part.notes).every((note) => note.pitch >= 80)).toBe(true);
    expect(request.options.preparedData!.notes.every((note) => note.pitch < 80)).toBe(true);
    const key = (n: { pitch: number; startTick: number; durationTick: number; velocity: number }) =>
      `${n.pitch}:${n.startTick}:${n.durationTick}:${n.velocity}`;
    const expected = base.notes.map((note) => `${note.pitch}:${Math.round(note.startBeat * ppq)}:${Math.max(1, Math.round(note.durationBeats * ppq))}:${note.velocity}`).sort();
    expect(back.map(key).sort()).toEqual(expected);
    expect(new Set(back.map((note) => note.partId))).toEqual(new Set([base.voices[0]!.id]));
  });

  it("puts the note on the line on the melody side, and leaves the upper part out of the analysis", () => {
    const base = session();
    const { session: derived, excluded } = deriveSplitSession(base, splitsFor(base, 86));
    const upper = derived.voices.find((voice) => voice.id.endsWith("~upper"))!;
    expect(upper.minPitch).toBe(86);
    expect(upper.included).toBe(false);
    expect(upper.assignedRole).toBe("exclude");
    expect(derived.notes.filter((note) => note.voiceId === upper.id && note.pitch === 86)).not.toHaveLength(0);
    expect(excluded.map((part) => part.partId)).toEqual([base.voices[0]!.id]);
  });

  it("cannot place a line that leaves nothing below it, and a line with nothing above changes nothing", () => {
    const base = session();
    expect(deriveSplitSession(base, splitsFor(base, 40)).session).toBe(base);
    expect(deriveSplitSession(base, splitsFor(base, 100)).session).toBe(base);
  });

  it("gives every analysed made-up part its own track, the channel of the original, and a copy of the pedal", () => {
    const base = session();
    // The bass line is not offered by the screen yet; it is used here to have two analysed parts.
    const { request } = buildSplitAnalysisRequest(base, { [base.voices[0]!.id]: { melodyFrom: 80, bassBelow: 50 } });
    const prepared = request.options.preparedData!;
    expect(prepared.tracks.map((track) => track.index)).toEqual([0, 1]);
    expect(new Set(prepared.tracks.map((track) => track.channel))).toEqual(new Set([base.voices[0]!.channel]));
    const pedals = prepared.controlChanges.filter((change) => change.number === 64);
    expect(new Set(pedals.map((change) => change.trackIndex))).toEqual(new Set([0, 1]));
    expect(prepared.notes.every((note) => note.pitch < 80)).toBe(true);
  });

  it("is not analysed from the file's bytes, and a removed line gives back today's request", () => {
    const base = session();
    const { derived, request } = buildSplitAnalysisRequest(base, splitsFor(base));
    expect(isBackwardEquivalentSession(base)).toBe(true);
    expect(isBackwardEquivalentSession(derived)).toBe(false);
    expect(request.backwardEquivalent).toBe(false);
    expect(buildSplitAnalysisRequest(base, {}).request).toEqual(buildSessionAnalysisRequest(base));
  });

  it("passes the made-up roles to the analysis as overrides, with 「分けない」 and with 「アプリに任せる」", () => {
    const base = session();
    for (const preset of ["standard", "harmonic-core"] as const) {
      const { request } = buildSplitAnalysisRequest({ ...base, voiceContributionPreset: preset }, splitsFor(base));
      const input = request.options.analysisInput!;
      // lower = harmony; the upper part is not handed over at all (the rules of analyzerInput.ts this relies on)
      expect(input.voices.map((voice) => voice.inferredRole)).toEqual(["harmony"]);
      expect(Object.values(input.roleOverrides)).toEqual(["harmony"]);
      expect(request.options.preparedData!.tracks).toHaveLength(1);
      expect(input.voiceContributionPreset).toBe(preset === "harmonic-core" ? "harmonic-core" : undefined);
    }
  });

  it("leaves drums, duplicates and unused parts alone", () => {
    const base = session();
    const off: AnalysisSession = {
      ...base,
      voices: base.voices.map((voice) => ({ ...voice, assignedRole: "exclude" as const, included: false })),
    };
    expect(deriveSplitSession(off, splitsFor(off)).session).toBe(off);
  });
});

describe("restorePartNames", () => {
  it("names the made-up parts after the part they came from", () => {
    const base = session();
    const { request, map } = buildSplitAnalysisRequest(base, splitsFor(base));
    const voices = request.options.analysisInput!.voices.map((voice) => ({ ...voice, trackName: "" }));
    const named = restorePartNames(voices, map, () => "Piano");
    expect(named.map((voice) => voice.trackName)).toEqual(["Piano（線より下）"]);
    expect(voices.map((voice) => voice.trackName)).toEqual([""]); // not mutated
  });
});

describe("suggestMelodyFrom", () => {
  it("finds the melody above the chords, and nothing in a part of chords only", () => {
    const base = session();
    const notes = base.notes.filter((note) => note.voiceId === base.voices[0]!.id);
    expect(suggestMelodyFrom(notes)).toBe(86);
    expect(suggestMelodyFrom(notes.filter((note) => note.pitch < 80))).toBeUndefined();
  });
});
