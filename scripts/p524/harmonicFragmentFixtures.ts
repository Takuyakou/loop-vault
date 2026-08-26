export type P524FixtureId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";

export type P524HarmonicRhythm = 1 | 2 | 4 | 8 | "unknown";

export interface P524SyntheticNote {
  readonly id: string;
  readonly pitch: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly velocity: number;
  readonly expectedLane: "bass" | "upper";
}

export interface P524ExpectedBassState {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly pitchClass: number;
  readonly transientPitchClasses?: readonly number[];
}

export interface P524ExpectedHarmonicState {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly pitchClasses: readonly number[];
  readonly label: string;
}

export interface P524SyntheticFixture {
  readonly id: P524FixtureId;
  readonly purpose:
    | "repeated-same-backing"
    | "partial-voicing-fragments"
    | "subset-c-to-am7"
    | "persistent-c-to-cmaj7"
    | "two-chords-per-bar"
    | "one-chord-per-two-bars"
    | "pedal-bass-upper-change"
    | "walking-bass-stable-harmony"
    | "inversion-same-identity"
    | "anticipation"
    | "mixed-harmonic-rhythm";
  readonly meter: readonly [4, 4];
  readonly totalBeats: number;
  readonly expectedHarmonicRhythm: P524HarmonicRhythm;
  readonly expectLegacyFallback: boolean;
  readonly expectedStates: readonly P524ExpectedHarmonicState[];
  readonly expectedBassStates: readonly P524ExpectedBassState[];
  readonly transientTensionBeats?: readonly number[];
  readonly notes: readonly P524SyntheticNote[];
}

type NoteSpec = readonly [
  pitch: number,
  startBeat: number,
  durationBeats: number,
  expectedLane: P524SyntheticNote["expectedLane"],
];

const state = (
  startBeat: number,
  endBeat: number,
  pitchClasses: readonly number[],
  label: string,
): P524ExpectedHarmonicState => ({ startBeat, endBeat, pitchClasses, label });

const bassState = (
  startBeat: number,
  endBeat: number,
  pitchClass: number,
  transientPitchClasses?: readonly number[],
): P524ExpectedBassState => ({
  startBeat,
  endBeat,
  pitchClass,
  ...(transientPitchClasses ? { transientPitchClasses } : {}),
});

export function generateP524SyntheticFixtures(): readonly P524SyntheticFixture[] {
  const fixtures: readonly P524SyntheticFixture[] = [
    fixture("A", "repeated-same-backing", 8, 4, false,
      [state(0, 8, [0, 4, 7], "C")],
      [bassState(0, 8, 0)],
      [...repeatedVoicing([36, 52, 55, 60], 0, 8, 1), [59, 3.5, 0.125, "upper"]],
      [3.5]),
    fixture("B", "partial-voicing-fragments", 8, 4, false,
      [state(0, 8, [0, 2, 4, 7], "C(add9)")],
      [bassState(0, 8, 0, [2])],
      partialVoicingFragments()),
    fixture("C", "subset-c-to-am7", 8, 4, false,
      [state(0, 4, [0, 4, 7], "C"), state(4, 8, [0, 4, 7, 9], "Am7")],
      [bassState(0, 4, 0), bassState(4, 8, 9)],
      [...repeatedVoicing([36, 52, 55, 60], 0, 4, 1), ...repeatedVoicing([45, 52, 55, 60], 4, 4, 1)]),
    fixture("D", "persistent-c-to-cmaj7", 8, 4, false,
      [state(0, 4, [0, 4, 7], "C"), state(4, 8, [0, 4, 7, 11], "Cmaj7")],
      [bassState(0, 8, 0)],
      [...repeatedVoicing([36, 52, 55, 60], 0, 4, 1), ...repeatedVoicing([36, 52, 55, 59, 60], 4, 4, 1)]),
    fixture("E", "two-chords-per-bar", 8, 2, false,
      [
        state(0, 2, [0, 4, 7], "C"), state(2, 4, [2, 7, 11], "G"),
        state(4, 6, [0, 5, 9], "F"), state(6, 8, [2, 7, 11], "G"),
      ],
      [bassState(0, 2, 0), bassState(2, 4, 7), bassState(4, 6, 5), bassState(6, 8, 7)],
      [
        ...repeatedVoicing([36, 52, 55], 0, 2, 1), ...repeatedVoicing([43, 50, 59], 2, 2, 1),
        ...repeatedVoicing([41, 48, 57], 4, 2, 1), ...repeatedVoicing([43, 50, 59], 6, 2, 1),
      ]),
    fixture("F", "one-chord-per-two-bars", 16, 8, false,
      [state(0, 8, [0, 4, 7], "C"), state(8, 16, [0, 5, 9], "F")],
      [bassState(0, 8, 0), bassState(8, 16, 5)],
      [...repeatedVoicing([36, 52, 55], 0, 8, 1), ...repeatedVoicing([41, 48, 57], 8, 8, 1)]),
    fixture("G", "pedal-bass-upper-change", 8, 4, false,
      [state(0, 4, [0, 4, 7], "C"), state(4, 8, [0, 5, 9], "F/C")],
      [bassState(0, 8, 0)],
      [
        [36, 0, 8, "bass"],
        ...upperAttacks([52, 55, 60], 0, 4, 1),
        ...upperAttacks([53, 57, 60], 4, 4, 1),
      ]),
    fixture("H", "walking-bass-stable-harmony", 8, 4, false,
      [state(0, 8, [0, 4, 7, 9], "C6")],
      [bassState(0, 8, 0, [2, 4, 5, 7, 9, 11])],
      [
        ...upperAttacks([52, 55, 57, 60], 0, 8, 2),
        ...[36, 38, 40, 41, 43, 45, 47, 48].map((pitch, index) => [pitch, index, 0.9, "bass"] as const),
      ]),
    fixture("I", "inversion-same-identity", 8, 4, false,
      [state(0, 8, [0, 4, 7], "C")],
      [bassState(0, 4, 4), bassState(4, 8, 7)],
      [
        ...repeatedVoicing([40, 48, 55, 60], 0, 4, 1),
        ...repeatedVoicing([43, 48, 52, 60], 4, 4, 1),
      ]),
    fixture("J", "anticipation", 8, 4, false,
      [state(0, 4, [2, 7, 11], "G"), state(4, 8, [0, 4, 7], "C")],
      [bassState(0, 4, 7), bassState(4, 8, 0)],
      [
        ...repeatedVoicing([43, 50, 59], 0, 4, 1),
        [52, 3.75, 0.25, "upper"], [55, 3.75, 0.25, "upper"], [60, 3.75, 0.25, "upper"],
        ...repeatedVoicing([36, 52, 55, 60], 4, 4, 1),
      ]),
    fixture("K", "mixed-harmonic-rhythm", 16, "unknown", true,
      [
        state(0, 4, [0, 4, 7], "C"), state(4, 8, [0, 5, 9], "F"),
        state(8, 10, [2, 7, 11], "G"), state(10, 12, [0, 4, 7, 9], "Am7"),
        state(12, 14, [0, 5, 9], "F"), state(14, 16, [2, 7, 11], "G"),
      ],
      [
        bassState(0, 4, 0), bassState(4, 8, 5), bassState(8, 10, 7),
        bassState(10, 12, 9), bassState(12, 14, 5), bassState(14, 16, 7),
      ],
      [
        ...repeatedVoicing([36, 52, 55], 0, 4, 1), ...repeatedVoicing([41, 48, 57], 4, 4, 1),
        ...repeatedVoicing([43, 50, 59], 8, 2, 1), ...repeatedVoicing([45, 52, 55, 60], 10, 2, 1),
        ...repeatedVoicing([41, 48, 57], 12, 2, 1), ...repeatedVoicing([43, 50, 59], 14, 2, 1),
      ]),
  ];
  validateP524SyntheticFixtures(fixtures);
  return fixtures;
}

export function validateP524SyntheticFixtures(fixtures: readonly P524SyntheticFixture[]): void {
  const requiredIds: readonly P524FixtureId[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
  if (fixtures.length !== requiredIds.length
    || fixtures.some((fixture, index) => fixture.id !== requiredIds[index])) {
    throw new Error("P5.24 fixtures must be the exact unique ordered A-K set");
  }
  const identities = new Map<string, string>();
  for (const fixture of fixtures) {
    if (!Number.isFinite(fixture.totalBeats) || fixture.totalBeats <= 0) {
      throw new Error(`${fixture.id} totalBeats must be positive and finite`);
    }
    if (fixture.meter[0] !== 4 || fixture.meter[1] !== 4) throw new Error(`${fixture.id} must remain 4/4`);
    validateStateCoverage(fixture);
    validateBassStateCoverage(fixture);
    fixture.expectedStates.forEach((expectedState, index) => {
      if (!expectedState.label.trim()) throw new Error(`${fixture.id} state ${index} has no identity`);
      if (expectedState.pitchClasses.length === 0
        || new Set(expectedState.pitchClasses).size !== expectedState.pitchClasses.length
        || expectedState.pitchClasses.some((pitchClass) => !Number.isInteger(pitchClass) || pitchClass < 0 || pitchClass > 11)) {
        throw new Error(`${fixture.id} state ${index} has corrupt pitch classes`);
      }
      const signature = [...expectedState.pitchClasses].sort((left, right) => left - right).join(",");
      const prior = identities.get(expectedState.label);
      if (prior !== undefined && prior !== signature) {
        throw new Error(`harmonic identity ${expectedState.label} has inconsistent pitch classes`);
      }
      identities.set(expectedState.label, signature);
    });
    fixture.notes.forEach((note, index) => {
      if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127
        || !Number.isFinite(note.startBeat) || note.startBeat < 0
        || !Number.isFinite(note.durationBeats) || note.durationBeats <= 0
        || note.startBeat + note.durationBeats > fixture.totalBeats
        || !Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 1) {
        throw new Error(`${fixture.id} note ${index} is invalid`);
      }
    });
    fixture.transientTensionBeats?.forEach((beat) => {
      if (!Number.isFinite(beat) || beat < 0 || beat >= fixture.totalBeats) {
        throw new Error(`${fixture.id} has an invalid transient tension marker`);
      }
    });
  }
}

export function generateP524DenseBenchmarkNotes(repetitions = 128): readonly P524SyntheticNote[] {
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 256) {
    throw new Error("repetitions must be an integer from 1 to 256");
  }
  const source = generateP524SyntheticFixtures().find((entry) => entry.id === "E");
  if (!source) throw new Error("dense source fixture E is missing");
  return Array.from({ length: repetitions }, (_, repetition) => source.notes.map((note) => ({
    ...note,
    id: `dense-${String(repetition).padStart(3, "0")}-${note.id}`,
    startBeat: note.startBeat + repetition * source.totalBeats,
  }))).flat();
}

function fixture(
  id: P524FixtureId,
  purpose: P524SyntheticFixture["purpose"],
  totalBeats: number,
  expectedHarmonicRhythm: P524HarmonicRhythm,
  expectLegacyFallback: boolean,
  expectedStates: readonly P524ExpectedHarmonicState[],
  expectedBassStates: readonly P524ExpectedBassState[],
  noteSpecs: readonly NoteSpec[],
  transientTensionBeats?: readonly number[],
): P524SyntheticFixture {
  return {
    id,
    purpose,
    meter: [4, 4],
    totalBeats,
    expectedHarmonicRhythm,
    expectLegacyFallback,
    expectedStates,
    expectedBassStates,
    ...(transientTensionBeats ? { transientTensionBeats } : {}),
    notes: noteSpecs.map(([pitch, startBeat, durationBeats, expectedLane], index) => ({
      id: `${id}-n${String(index + 1).padStart(3, "0")}`,
      pitch,
      startBeat,
      durationBeats,
      velocity: 0.8,
      expectedLane,
    })),
  };
}

function validateStateCoverage(fixture: P524SyntheticFixture): void {
  if (fixture.expectedStates.length === 0) throw new Error(`${fixture.id} has no harmonic state`);
  fixture.expectedStates.forEach((entry, index) => {
    if (!Number.isFinite(entry.startBeat) || !Number.isFinite(entry.endBeat)
      || entry.startBeat < 0 || entry.endBeat <= entry.startBeat
      || (index === 0 ? entry.startBeat !== 0 : entry.startBeat !== fixture.expectedStates[index - 1].endBeat)) {
      throw new Error(`${fixture.id} harmonic states are not a finite contiguous timeline`);
    }
  });
  if (fixture.expectedStates[fixture.expectedStates.length - 1]?.endBeat !== fixture.totalBeats) {
    throw new Error(`${fixture.id} harmonic states do not cover the fixture`);
  }
}

function validateBassStateCoverage(fixture: P524SyntheticFixture): void {
  if (fixture.expectedBassStates.length === 0) throw new Error(`${fixture.id} has no Bass Lane state`);
  fixture.expectedBassStates.forEach((entry, index) => {
    const transientPitchClasses = entry.transientPitchClasses ?? [];
    if (!Number.isFinite(entry.startBeat) || !Number.isFinite(entry.endBeat)
      || entry.startBeat < 0 || entry.endBeat <= entry.startBeat
      || (index === 0 ? entry.startBeat !== 0 : entry.startBeat !== fixture.expectedBassStates[index - 1].endBeat)
      || !Number.isInteger(entry.pitchClass) || entry.pitchClass < 0 || entry.pitchClass > 11
      || new Set(transientPitchClasses).size !== transientPitchClasses.length
      || transientPitchClasses.some((pitchClass) => (
        !Number.isInteger(pitchClass) || pitchClass < 0 || pitchClass > 11 || pitchClass === entry.pitchClass
      ))) {
      throw new Error(`${fixture.id} Bass Lane states are corrupt or not a finite contiguous timeline`);
    }
  });
  if (countP524UnsupportedBassEvidence(fixture.notes, fixture.expectedBassStates) !== 0) {
    throw new Error(`${fixture.id} Bass Lane state has no related stable/transient bass-note evidence`);
  }
  if (fixture.expectedBassStates[fixture.expectedBassStates.length - 1]?.endBeat !== fixture.totalBeats) {
    throw new Error(`${fixture.id} Bass Lane states do not cover the fixture`);
  }
}

export function countP524UnsupportedBassEvidence(
  notes: readonly Pick<P524SyntheticNote, "pitch" | "startBeat" | "durationBeats" | "expectedLane">[],
  states: readonly Pick<P524ExpectedBassState, "startBeat" | "endBeat" | "pitchClass" | "transientPitchClasses">[],
): number {
  const intervalsByPitchClass = new Map<number, { readonly startBeat: number; readonly endBeat: number }[]>();
  for (const note of notes) {
    if (note.expectedLane !== "bass") continue;
    const pitchClass = ((note.pitch % 12) + 12) % 12;
    const intervals = intervalsByPitchClass.get(pitchClass) ?? [];
    intervals.push({ startBeat: note.startBeat, endBeat: note.startBeat + note.durationBeats });
    intervalsByPitchClass.set(pitchClass, intervals);
  }
  intervalsByPitchClass.forEach((intervals) => intervals.sort((left, right) => (
    left.startBeat - right.startBeat || left.endBeat - right.endBeat
  )));
  const cursorByPitchClass = new Map<number, number>();
  let violations = 0;
  const sortedStates = [...states].sort((left, right) => left.startBeat - right.startBeat || left.endBeat - right.endBeat);
  for (const state of sortedStates) {
    const requiredPitchClasses = [state.pitchClass, ...(state.transientPitchClasses ?? [])];
    for (const pitchClass of requiredPitchClasses) {
      const intervals = intervalsByPitchClass.get(pitchClass) ?? [];
      let cursor = cursorByPitchClass.get(pitchClass) ?? 0;
      while (cursor < intervals.length && intervals[cursor].endBeat <= state.startBeat) cursor += 1;
      cursorByPitchClass.set(pitchClass, cursor);
      if (cursor >= intervals.length || intervals[cursor].startBeat >= state.endBeat) violations += 1;
    }
  }
  return violations;
}

function repeatedVoicing(
  pitches: readonly number[],
  startBeat: number,
  totalBeats: number,
  spacing: number,
): NoteSpec[] {
  return Array.from({ length: Math.ceil(totalBeats / spacing) }, (_, index) => {
    const beat = startBeat + index * spacing;
    return pitches.map((pitch, pitchIndex) => [
      pitch,
      beat,
      Math.min(spacing * 0.85, startBeat + totalBeats - beat),
      pitchIndex === 0 ? "bass" : "upper",
    ] as const);
  }).flat();
}

function upperAttacks(
  pitches: readonly number[],
  startBeat: number,
  totalBeats: number,
  spacing: number,
): NoteSpec[] {
  return repeatedVoicing(pitches, startBeat, totalBeats, spacing)
    .map(([pitch, beat, duration]) => [pitch, beat, duration, "upper"] as const);
}

function partialVoicingFragments(): NoteSpec[] {
  const fragments = [
    [36, 55], [52, 60], [38, 55], [52, 60],
    [36, 55], [50, 52], [36, 60], [52, 55],
  ] as const;
  return fragments.flatMap((pitches, index) => pitches.map((pitch, pitchIndex) => [
    pitch,
    index,
    0.8,
    pitchIndex === 0 && pitch < 48 ? "bass" : "upper",
  ] as const));
}
