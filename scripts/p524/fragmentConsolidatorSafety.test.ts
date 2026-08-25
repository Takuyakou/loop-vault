import { describe, expect, it } from "vitest";
import { consolidateP524PerformanceFragments } from "./fragmentConsolidator";
import { normalizePc } from "../../src/domain/chords";
import { chordTemplates } from "../../src/domain/midi/candidates";
import { identifyP524HarmonicState } from "./harmonicIdentity";
import { generateP524SyntheticFixtures } from "./harmonicFragmentFixtures";
import { toP524ShadowNotes, type P524ShadowInput, type P524ShadowNote } from "./shadowEvidence";

function repeatedChord(pitches: readonly number[], totalBeats = 8, durationBeats = 0.85): P524ShadowInput {
  const notes: P524ShadowNote[] = [];
  for (let beat = 0; beat < totalBeats; beat += 1) {
    pitches.forEach((pitch, index) => notes.push({
      id: `n-${beat}-${index}`,
      pitch,
      startBeat: beat,
      durationBeats,
      velocity: 0.8,
      ...(index === 0 ? { rolePrior: "bass" as const } : {}),
    }));
  }
  return { notes, meter: [4, 4], totalBeats };
}

describe("P5.24-02 false-merge safety", () => {
  it("keeps structural C to Cmaj7 after a pre-boundary low-B passing tone", () => {
    const fixture = generateP524SyntheticFixtures().find((entry) => entry.id === "D");
    if (!fixture) throw new Error("fixture D missing");
    const input: P524ShadowInput = {
      notes: [
        ...toP524ShadowNotes(fixture.notes),
        { id: "passing-low-b", pitch: 47, startBeat: 3, durationBeats: 0.8, velocity: 0.8, rolePrior: "bass" },
      ],
      meter: [4, 4], totalBeats: fixture.totalBeats,
    };
    expect(consolidateP524PerformanceFragments(input)).toMatchObject({
      status: "supported", states: fixture.expectedStates,
    });
  });

  it("still consolidates B from prior transient plus low current-cell occupancy", () => {
    const fixture = generateP524SyntheticFixtures().find((entry) => entry.id === "B");
    if (!fixture) throw new Error("fixture B missing");
    const result = consolidateP524PerformanceFragments({
      notes: toP524ShadowNotes(fixture.notes), meter: [4, 4], totalBeats: fixture.totalBeats,
    });
    expect(result).toMatchObject({ status: "supported", states: fixture.expectedStates });
    expect(result.boundaries[0]).toMatchObject({
      beat: 4,
      decision: "merge-same-state",
      reason: "local-transient-partial-voicing",
      supportingEvidence: ["preceding-transient-bass", "low-duration-coverage", "single-attack"],
    });
  });

  it("splits quiet full-cell Cmaj7 persistence despite prior passing B", () => {
    const fixture = generateP524SyntheticFixtures().find((entry) => entry.id === "D");
    if (!fixture) throw new Error("fixture D missing");
    const notes = toP524ShadowNotes(fixture.notes).map((note) => (
      note.startBeat >= 4 && normalizePc(note.pitch) === 11 ? { ...note, velocity: 0.01 } : note
    ));
    notes.push({ id: "quiet-passing-b", pitch: 47, startBeat: 3, durationBeats: 0.8, velocity: 0.01, rolePrior: "bass" });
    expect(consolidateP524PerformanceFragments({ notes, meter: [4, 4], totalBeats: 8 })).toMatchObject({
      status: "supported", states: fixture.expectedStates,
      boundaries: [{ beat: 4, decision: "split-strong-change" }],
    });
  });

  it("retains C to Am7 after a pre-boundary passing A", () => {
    const fixture = generateP524SyntheticFixtures().find((entry) => entry.id === "C");
    if (!fixture) throw new Error("fixture C missing");
    const notes = [...toP524ShadowNotes(fixture.notes),
      { id: "passing-low-a", pitch: 45, startBeat: 3, durationBeats: 0.8, velocity: 0.8, rolePrior: "bass" as const }];
    expect(consolidateP524PerformanceFragments({ notes, meter: [4, 4], totalBeats: 8 })).toMatchObject({
      status: "supported", states: fixture.expectedStates,
    });
  });
});

describe("P5.24-02 generalized existing-vocabulary identity", () => {
  it.each([
    ["D major", [38, 54, 57], "D", [2, 6, 9]],
    ["Eb minor", [39, 54, 58], "Ebm", [3, 6, 10]],
    ["F# dominant seventh", [42, 52, 58, 61], "F#7", [1, 4, 6, 10]],
    ["Bb major seventh", [46, 50, 53, 57], "Bbmaj7", [2, 5, 9, 10]],
    ["G suspended fourth", [43, 48, 50], "Gsus4", [0, 2, 7]],
  ] as const)("identifies %s by transposed vocabulary", (_name, pitches, label, pitchClasses) => {
    expect(consolidateP524PerformanceFragments(repeatedChord(pitches))).toMatchObject({
      status: "supported", states: [{ startBeat: 0, endBeat: 8, label, pitchClasses }],
    });
  });

  it("keeps inversion changes under one harmonic identity", () => {
    const fixture = generateP524SyntheticFixtures().find((entry) => entry.id === "I");
    if (!fixture) throw new Error("fixture I missing");
    expect(consolidateP524PerformanceFragments({
      notes: toP524ShadowNotes(fixture.notes), meter: [4, 4], totalBeats: fixture.totalBeats,
    })).toMatchObject({ status: "supported", states: fixture.expectedStates });
  });

  it("fails closed for an unknown vocabulary set without throwing", () => {
    const input = repeatedChord([36, 49, 54]);
    expect(() => consolidateP524PerformanceFragments(input)).not.toThrow();
    expect(consolidateP524PerformanceFragments(input)).toMatchObject({
      status: "unavailable", reason: "unsupported-harmonic-identity", legacyFallback: true,
    });
  });

  it("resolves every existing chord template at every transposed root when Bass identifies the root", () => {
    let checked = 0;
    for (let root = 0; root < 12; root += 1) {
      for (const template of chordTemplates) {
        const pitchClasses = [...new Set([
          ...template.required, ...template.important, ...template.optional,
        ].map((interval) => normalizePc(root + interval)))].sort((left, right) => left - right);
        expect(identifyP524HarmonicState(pitchClasses, root)).toMatchObject({
          root, quality: template.quality, pitchClasses,
        });
        checked += 1;
      }
    }
    expect(checked).toBe(chordTemplates.length * 12);
  });

  it("resolves C6/Am7 alias only from stable root Bass and fails closed for E inversion", () => {
    const signature = [0, 4, 7, 9];
    expect(identifyP524HarmonicState(signature, 0)).toMatchObject({ root: 0, quality: "six" });
    expect(identifyP524HarmonicState(signature, 9)).toMatchObject({ root: 9, quality: "min7" });
    expect(identifyP524HarmonicState(signature, 4)).toBeUndefined();
    expect(identifyP524HarmonicState(signature, undefined)).toBeUndefined();
  });
});

describe("P5.24-02 end-exclusive cell lookup", () => {
  it("accepts notes ending exactly at internal and final boundaries", () => {
    const input: P524ShadowInput = {
      notes: [0, 4].flatMap((startBeat) => [36, 52, 55, 60].map((pitch, index) => ({
        id: `held-${startBeat}-${index}`,
        pitch,
        startBeat,
        durationBeats: 4,
        velocity: 0.8,
        ...(index === 0 ? { rolePrior: "bass" as const } : {}),
      }))),
      meter: [4, 4], totalBeats: 8,
    };
    expect(consolidateP524PerformanceFragments(input)).toMatchObject({
      status: "supported",
      states: [{ startBeat: 0, endBeat: 8, label: "C", pitchClasses: [0, 4, 7] }],
    });
  });

  it("fails closed for zero and invalid durations", () => {
    const base = repeatedChord([36, 52, 55]);
    for (const durationBeats of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const input = { ...base, notes: [{ ...base.notes[0], durationBeats }, ...base.notes.slice(1)] };
      expect(() => consolidateP524PerformanceFragments(input)).not.toThrow();
      expect(consolidateP524PerformanceFragments(input)).toMatchObject({ status: "unavailable", reason: "invalid-input" });
    }
  });
});
