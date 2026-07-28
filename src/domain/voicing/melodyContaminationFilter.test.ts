import { describe, expect, it } from "vitest";
import type { TimedNote, Voice, VoiceRole } from "../midi/types";
import { filterEventLocalMelodyContamination } from "./melodyContaminationFilter";

const ticksPerBeat = 480;

describe("event-local melody contamination filter", () => {
  it("removes a confident monophonic melody over a simultaneous harmony frame", () => {
    const harmony = [55, 59, 62, 64].map((pitch) => note(pitch, 0, 4, 0, 0));
    const melody = note(70, 0, 4, 1, 1);
    const result = filterEventLocalMelodyContamination({
      notes: [...harmony, melody],
      voices: [voice(0, 0, "harmony", 0.9, 4), voice(1, 1, "melody", 0.9, 1)],
      ticksPerBeat,
      segment: { startBeat: 0, endBeat: 4 },
    });
    expect(result.notes).toEqual(harmony);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]?.reasons).toContain("voice:monophonic");
    expect(result.removed[0]?.concurrentSupportPitches).toEqual([55, 59, 62, 64]);
  });

  it("keeps melody when harmony is arpeggiated rather than simultaneous", () => {
    const arpeggio = [55, 59, 62, 64].map(
      (pitch, index) => note(pitch, index, 1, 0, 0),
    );
    const melody = note(70, 0, 4, 1, 1);
    const result = filterEventLocalMelodyContamination({
      notes: [...arpeggio, melody],
      voices: [voice(0, 0, "harmony", 0.9, 1), voice(1, 1, "melody", 0.9, 1)],
      ticksPerBeat,
      segment: { startBeat: 0, endBeat: 4 },
    });
    expect(result.notes).toContain(melody);
    expect(result.removed).toEqual([]);
  });

  it("keeps low-confidence and polyphonic melody voices", () => {
    const harmony = [55, 59, 62, 64].map((pitch) => note(pitch, 0, 4, 0, 0));
    const lowConfidence = note(70, 0, 4, 1, 1);
    const polyphonic = note(72, 0, 4, 2, 2);
    const result = filterEventLocalMelodyContamination({
      notes: [...harmony, lowConfidence, polyphonic],
      voices: [
        voice(0, 0, "harmony", 0.9, 4),
        voice(1, 1, "melody", 0.4, 1),
        voice(2, 2, "melody", 0.9, 2),
      ],
      ticksPerBeat,
      segment: { startBeat: 0, endBeat: 4 },
    });
    expect(result.removed).toEqual([]);
  });

  it("is deterministic and only removes notes that existed in the source", () => {
    const source = [
      ...[48, 55, 59, 64].map((pitch) => note(pitch, 0, 4, 0, 0)),
      note(70, 0, 4, 1, 1),
    ];
    const input = {
      notes: source,
      voices: [voice(0, 0, "harmony", 0.9, 4), voice(1, 1, "melody", 0.9, 1)],
      ticksPerBeat,
      segment: { startBeat: 0, endBeat: 4 },
    };
    const first = filterEventLocalMelodyContamination(input);
    const second = filterEventLocalMelodyContamination(input);
    expect(first).toEqual(second);
    expect(first.notes.every((entry) => source.includes(entry))).toBe(true);
    expect(first.removed.every((entry) => source.includes(entry.note))).toBe(true);
  });
});

function note(
  pitch: number,
  startBeat: number,
  durationBeats: number,
  trackIndex: number,
  channel: number,
): TimedNote {
  return {
    pitch,
    startTick: startBeat * ticksPerBeat,
    durationTick: durationBeats * ticksPerBeat,
    velocity: 0.8,
    trackIndex,
    channel,
  };
}

function voice(
  trackIndex: number,
  channel: number,
  role: VoiceRole,
  confidence: number,
  maxPolyphony: number,
): Voice {
  return {
    id: `${trackIndex}:${channel}`,
    trackIndex,
    channel,
    explicitPrograms: [],
    dominantProgramExplicit: false,
    noteCount: 8,
    pitchRange: [48, 76],
    medianPitch: 64,
    avgDurationTick: ticksPerBeat,
    noteDensity: 1,
    maxPolyphony,
    simultaneousOnsetRatio: maxPolyphony > 1 ? 1 : 0,
    lowestVoiceShare: 0,
    highestVoiceShare: role === "melody" ? 1 : 0,
    inferredRole: role,
    roleConfidence: confidence,
    roleEvidence: {
      measured: {
        bass: 0,
        harmony: 0,
        pad: 0,
        melody: 0,
        percussion: 0,
        mixed: 0,
      },
    },
  };
}
