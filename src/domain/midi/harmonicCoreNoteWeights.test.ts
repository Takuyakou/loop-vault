import { describe, expect, it } from "vitest";
import { generateP5211SyntheticNoteRoleFixtures } from "../../../scripts/p5211/noteRoleFixtures";
import type { NormalizedTimedNote, VoiceRole } from "./types";
import { buildHarmonicCoreNoteWeights } from "./harmonicCoreNoteWeights";
import type { VoiceRoleProfile } from "./voiceProfiles";

describe("P5.21.1 Stage03 Harmonic Core note weights", () => {
  it("reduces the moving overlay while retaining the sustained harmonic bed", () => {
    const notes = fixtureNotes("A");
    const original = structuredClone(notes);
    const result = buildHarmonicCoreNoteWeights(notes, profiles("harmony"));
    const values = notes.map((note) => result.multipliers.get(note));
    expect(values.slice(0, 4).every((value) => (value ?? 0) >= 0.9)).toBe(true);
    expect(values.slice(4)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(result.summary).toMatchObject({
      eligibleVoiceCount: 1,
      weightedNoteCount: 8,
      classCounts: { harmonic: 2, "melody-like": 4, uncertain: 2 },
    });
    expect(notes).toEqual(original);
  });

  it("never assigns zero and never suppresses protected extensions", () => {
    for (const id of ["B", "C", "J"] as const) {
      const notes = fixtureNotes(id);
      const result = buildHarmonicCoreNoteWeights(notes, profiles("pad"));
      expect([...result.multipliers.values()].every((value) => value > 0)).toBe(true);
      const fixture = generateP5211SyntheticNoteRoleFixtures().find((entry) => entry.id === id);
      if (!fixture) throw new Error("fixture missing");
      fixture.notes.forEach((note, index) => {
        if (note.protectedHarmonic) expect(result.multipliers.get(notes[index] as NormalizedTimedNote)).toBe(1);
      });
    }
  });

  it("weights harmony, pad, and mixed only", () => {
    for (const role of ["harmony", "pad", "mixed"] as const) {
      expect(buildHarmonicCoreNoteWeights(fixtureNotes("A"), profiles(role)).summary.weightedNoteCount).toBe(8);
    }
    for (const role of ["bass", "percussion", "melody"] as const) {
      expect(buildHarmonicCoreNoteWeights(fixtureNotes("A"), profiles(role)).summary.weightedNoteCount).toBe(0);
    }
  });

  it("is deterministic and returns only transient object-keyed weights", () => {
    const notes = fixtureNotes("A");
    const first = buildHarmonicCoreNoteWeights(notes, profiles("mixed"));
    const second = buildHarmonicCoreNoteWeights(notes, profiles("mixed"));
    expect([...first.multipliers.values()]).toEqual([...second.multipliers.values()]);
    expect(first.summary).toEqual(second.summary);
    expect(JSON.stringify(first.summary)).not.toMatch(/pitch|startBeat|endBeat|track/u);
  });
});

function fixtureNotes(id: "A" | "B" | "C" | "J"): NormalizedTimedNote[] {
  const fixture = generateP5211SyntheticNoteRoleFixtures().find((entry) => entry.id === id);
  if (!fixture) throw new Error("fixture missing");
  return fixture.notes.map((note) => ({
    pitch: note.pitch,
    startTick: note.startBeat * 480,
    durationTick: note.durationBeats * 480,
    velocity: note.velocity,
    trackIndex: 1,
    channel: 0,
    program: 0,
    programExplicit: true,
    sourceTrackIndex: 1,
    isDrum: false,
    startBeat: note.startBeat,
    endBeat: note.startBeat + note.durationBeats,
    sustainedEndBeat: note.startBeat + note.durationBeats,
  }));
}

function profiles(role: VoiceRole): ReadonlyMap<string, VoiceRoleProfile> {
  return new Map([["1:0", {
    voiceId: "1:0",
    inference: {
      role,
      confidence: 1,
      scores: { bass: 0, harmony: 0, pad: 0, melody: 0, percussion: 0, mixed: 0 },
      reasons: ["test"],
    },
    contribution: { root: 1, bass: 1, quality: 1, tension: 1 },
  }]]);
}
