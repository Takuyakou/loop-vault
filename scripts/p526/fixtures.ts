import { generateP524SyntheticFixtures, type P524SyntheticFixture } from "../p524/harmonicFragmentFixtures";
import type { MidiSongData } from "../../src/domain/midi/types";
import type { ChordQuality } from "../../src/domain/types";

export type P526FixtureId = "L" | "M" | "N" | "O" | "P" | "Q";
export type P526LocalHarmonicRhythm = 1 | 2 | 4 | 8 | "unknown";

export interface P526Fixture {
  readonly id: P526FixtureId;
  readonly purpose: "passing-bass" | "true-harmonic-change";
  readonly expectedDecision: "same" | "split";
  readonly falseMergeIsHardFail: boolean;
  readonly expectedLabels: readonly string[];
  readonly expectedCanonicalPitchClasses: readonly (readonly number[])[];
  readonly expectedStructuralBassPitchClasses: readonly number[];
  readonly notes: P524SyntheticFixture["notes"];
}

export interface P526LayeredState {
  readonly bar: number;
  readonly startBeat: number;
  readonly endBeat: number;
  readonly surfaceLabel: string;
  readonly pitchClasses: readonly number[];
  readonly rootPitchClass: number;
  readonly quality: ChordQuality;
  readonly structuralBassPitchClass: number;
  readonly alteredTensions: readonly ("b9" | "b13")[];
  readonly surfaceRoot: string;
  readonly surfaceBass?: string;
}

export const p526ExpectedEightBarTruth: readonly P526LayeredState[] = [
  truth(1, 0, 4, "E6/9", [1, 4, 6, 8, 11], 4, "sixNine", 4, [], "E"),
  truth(2, 4, 8, "G#7(b13)", [0, 3, 4, 6, 8], 8, "dom7", 8, ["b13"], "G#"),
  truth(3, 8, 10, "C#m9", [1, 3, 4, 8, 11], 1, "min9", 1, [], "C#"),
  truth(3, 10, 12, "Cmaj7", [0, 4, 7, 11], 0, "maj7", 0, [], "C"),
  truth(4, 12, 14, "Bm9", [1, 2, 6, 9, 11], 11, "min9", 11, [], "B"),
  truth(4, 14, 16, "E13", [1, 2, 4, 6, 8, 11], 4, "dom13", 4, [], "E"),
  truth(5, 16, 20, "Amaj9", [1, 4, 8, 9, 11], 9, "maj9", 9, [], "A"),
  truth(6, 20, 24, "Am6", [0, 4, 6, 9], 9, "min6", 9, [], "A"),
  truth(7, 24, 26, "E/G#", [4, 8, 11], 4, "maj", 8, [], "E", "G#"),
  truth(7, 26, 28, "C#7(b9)", [1, 2, 5, 8, 11], 1, "dom7", 1, ["b9"], "C#"),
  truth(8, 28, 30, "F#m9", [1, 4, 6, 8, 9], 6, "min9", 6, [], "F#"),
  truth(8, 30, 32, "Amaj7/B", [1, 4, 8, 9], 9, "maj7", 11, [], "A", "B"),
] as const;

export function inheritedP524Fixtures(): readonly P524SyntheticFixture[] {
  return generateP524SyntheticFixtures();
}

export function generateP526Fixtures(): readonly P526Fixture[] {
  const fixtures = [
    pairedFixture("L", "same", ["Am6"], [[0, 4, 6, 9]], [9], chordPulses([45, 48, 52, 54], [45, 42], false)),
    pairedFixture("M", "split", ["Am6", "F#m7b5"], [[0, 4, 6, 9], [0, 4, 6, 9]], [9, 6], chordPulses([45, 48, 52, 54], [45, 42], true)),
    pairedFixture("N", "same", ["Amaj9"], [[1, 4, 8, 9, 11]], [9], chordPulses([45, 49, 52, 56, 59], [45, 44], false)),
    pairedFixture("O", "split", ["Amaj9", "Amaj9/G#"], [[1, 4, 8, 9, 11], [1, 4, 8, 9, 11]], [9, 8],
      splitChordPulses([45, 49, 52, 56, 59], [44, 45, 49, 52, 56, 59])),
    pairedFixture("P", "same", ["G#7(b13)"], [[0, 3, 4, 6, 8]], [8], chordPulses([44, 48, 51, 54, 64], [44, 42], false)),
    pairedFixture("Q", "split", ["G#7", "F#13"], [[0, 3, 6, 8], [1, 3, 4, 6, 10]], [8, 6],
      splitChordPulses([44, 48, 51, 54], [42, 46, 49, 52, 63])),
  ] as const;
  validateP526Fixtures(fixtures);
  return fixtures;
}

export function buildP526EightBarPreparedData(): MidiSongData {
  const ticksPerBeat = 480;
  const noteSpecs = [
    ...segmentNotes(0, 4, [40, 49, 54, 56, 59]),
    ...segmentNotes(4, 2, [44, 48, 51, 54, 64]),
    ...segmentNotes(6, 2, [42, 48, 51, 54, 64]),
    ...segmentNotes(8, 2, [37, 52, 56, 59, 63]),
    ...segmentNotes(10, 2, [36, 52, 55, 59]),
    ...segmentNotes(12, 2, [35, 50, 54, 57, 61]),
    ...segmentNotes(14, 2, [40, 49, 50, 54, 56, 59]),
    ...segmentNotes(16, 2, [45, 49, 52, 56, 59]),
    ...segmentNotes(18, 2, [44, 45, 49, 52, 56, 59]),
    ...segmentNotes(20, 2, [45, 48, 52, 54]),
    ...segmentNotes(22, 2, [42, 48, 52, 57]),
    ...segmentNotes(24, 2, [44, 52, 56, 59]),
    ...segmentNotes(26, 2, [37, 49, 53, 56, 59]),
    ...segmentNotes(28, 2, [42, 49, 52, 56, 57]),
    ...segmentNotes(30, 2, [47, 49, 52, 56, 57]),
  ];
  return {
    notes: noteSpecs.map((note, index) => ({
      pitch: note.pitch,
      startTick: note.startBeat * ticksPerBeat,
      durationTick: note.durationBeats * ticksPerBeat,
      velocity: 0.8,
      trackIndex: note.lane === "bass" ? 0 : 1,
      channel: note.lane === "bass" ? 0 : 1,
      program: note.lane === "bass" ? 33 : 0,
      programExplicit: true,
      id: `p526-synthetic-${String(index + 1).padStart(4, "0")}`,
    })),
    tempo: 122,
    tempoChanges: [{ tick: 0, bpm: 122 }],
    timeSignature: "4/4",
    ticksPerBeat,
    totalBars: 8,
    tracks: [
      { index: 0, name: "Synthetic Bass", channel: 0, program: 33, roleHint: "bass" },
      { index: 1, name: "Synthetic Harmony", channel: 1, program: 0, roleHint: "harmony" },
    ],
    controlChanges: [],
  };
}

function pairedFixture(
  id: P526FixtureId,
  expectedDecision: P526Fixture["expectedDecision"],
  expectedLabels: readonly string[],
  expectedCanonicalPitchClasses: readonly (readonly number[])[],
  expectedStructuralBassPitchClasses: readonly number[],
  notes: P524SyntheticFixture["notes"],
): P526Fixture {
  return {
    id,
    purpose: expectedDecision === "same" ? "passing-bass" : "true-harmonic-change",
    expectedDecision,
    falseMergeIsHardFail: id === "M" || id === "O" || id === "Q",
    expectedLabels,
    expectedCanonicalPitchClasses,
    expectedStructuralBassPitchClasses,
    notes,
  };
}

function splitChordPulses(
  firstPitches: readonly number[],
  secondPitches: readonly number[],
): P524SyntheticFixture["notes"] {
  return Array.from({ length: 8 }, (_, pulse) => {
    const startBeat = pulse * 0.5;
    const pitches = startBeat < 2 ? firstPitches : secondPitches;
    return pitches.map((pitch, index) => ({
      id: `p526-split-${startBeat}-${index}-${pitch}`,
      pitch,
      startBeat,
      durationBeats: 0.42,
      velocity: 0.8,
      expectedLane: index === 0 ? "bass" as const : "upper" as const,
    }));
  }).flat();
}

function chordPulses(
  upperAndBassPitches: readonly number[],
  bassPitches: readonly [number, number],
  structuralSecondHalf: boolean,
): P524SyntheticFixture["notes"] {
  const upper = upperAndBassPitches.slice(1);
  return Array.from({ length: 8 }, (_, pulse) => {
    const startBeat = pulse * 0.5;
    const secondHalf = startBeat >= 2;
    const bassPitch = secondHalf ? bassPitches[1] : bassPitches[0];
    const harmonicPitches = structuralSecondHalf && secondHalf && bassPitch === 42
      ? upper.map((pitch) => pitch === 54 ? 57 : pitch)
      : upper;
    return [bassPitch, ...harmonicPitches].map((pitch, index) => ({
      id: `p526-${startBeat}-${index}-${pitch}`,
      pitch,
      startBeat,
      durationBeats: 0.42,
      velocity: 0.8,
      expectedLane: index === 0 ? "bass" as const : "upper" as const,
    }));
  }).flat();
}

function segmentNotes(startBeat: number, durationBeats: number, pitches: readonly number[]) {
  return Array.from({ length: durationBeats * 2 }, (_, pulse) => {
    const attack = startBeat + pulse * 0.5;
    return pitches.map((pitch, index) => ({
      pitch,
      startBeat: attack,
      durationBeats: 0.42,
      lane: index === 0 ? "bass" as const : "upper" as const,
    }));
  }).flat();
}

function truth(
  bar: number,
  startBeat: number,
  endBeat: number,
  surfaceLabel: string,
  pitchClasses: readonly number[],
  rootPitchClass: number,
  quality: ChordQuality,
  structuralBassPitchClass: number,
  alteredTensions: readonly ("b9" | "b13")[],
  surfaceRoot: string,
  surfaceBass?: string,
): P526LayeredState {
  return { bar, startBeat, endBeat, surfaceLabel, pitchClasses, rootPitchClass, quality, structuralBassPitchClass, alteredTensions, surfaceRoot, ...(surfaceBass ? { surfaceBass } : {}) };
}

function validateP526Fixtures(fixtures: readonly P526Fixture[]): void {
  const ids: readonly P526FixtureId[] = ["L", "M", "N", "O", "P", "Q"];
  if (fixtures.length !== ids.length || fixtures.some((fixture, index) => fixture.id !== ids[index])) {
    throw new Error("P5.26 fixtures must be the exact ordered L-Q set");
  }
  for (const fixture of fixtures) {
    if ((fixture.id === "M" || fixture.id === "O" || fixture.id === "Q") !== fixture.falseMergeIsHardFail) {
      throw new Error(`${fixture.id} hard-fail classification changed`);
    }
    if (fixture.expectedDecision === "split" && fixture.expectedLabels.length < 2) {
      throw new Error(`${fixture.id} split fixture has no true change`);
    }
  }
}
