export type P5211NoteRole = "harmonic" | "melody-like" | "uncertain";

export interface P5211SyntheticNote {
  readonly id: string;
  readonly pitch: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly velocity: number;
  readonly expectedRole: P5211NoteRole;
  readonly protectedHarmonic: boolean;
}

export interface P5211SyntheticNoteRoleFixture {
  readonly id: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J";
  readonly purpose:
    | "sustained-bed-with-moving-top"
    | "sustained-extension"
    | "inversion"
    | "arpeggio"
    | "pedal-with-repeated-top"
    | "dense-staccato-harmony"
    | "broken-chord-ostinato"
    | "monophonic-melody"
    | "aligned-two-layer-voicing"
    | "long-upper-extensions";
  readonly notes: readonly P5211SyntheticNote[];
}

export interface P5211NoteRoleMetrics {
  readonly totalNotes: number;
  readonly evaluatedNotes: number;
  readonly exactAccuracy: number;
  readonly melodyLikePrecision: number;
  readonly melodyLikeRecall: number;
  readonly harmonicRetention: number;
  readonly protectedHarmonicRetention: number;
  readonly uncertainNonSuppression: number;
  readonly confusion: Readonly<Record<P5211NoteRole, Readonly<Record<P5211NoteRole, number>>>>;
}

type NoteSpec = readonly [
  pitch: number,
  startBeat: number,
  durationBeats: number,
  expectedRole: P5211NoteRole,
  protectedHarmonic?: boolean,
];

export function generateP5211SyntheticNoteRoleFixtures(): readonly P5211SyntheticNoteRoleFixture[] {
  return [
    fixture("A", "sustained-bed-with-moving-top", [
      [48, 0, 8, "harmonic"], [52, 0, 8, "harmonic"], [55, 0, 8, "harmonic"], [59, 0, 8, "harmonic"],
      [62, 0.5, 1, "melody-like"], [64, 2.5, 1, "melody-like"],
      [67, 4.5, 1, "melody-like"], [69, 6.5, 1, "melody-like"],
    ]),
    fixture("B", "sustained-extension", [
      [48, 0, 8, "harmonic"], [52, 0, 8, "harmonic"], [55, 0, 8, "harmonic"],
      [59, 0, 8, "harmonic", true], [62, 0, 8, "harmonic", true],
    ]),
    fixture("C", "inversion", [
      [52, 0, 8, "harmonic"], [55, 0, 8, "harmonic"], [59, 0, 8, "harmonic"],
      [60, 0, 8, "harmonic", true],
    ]),
    fixture("D", "arpeggio", [
      [48, 0, 1.5, "uncertain"], [52, 0.5, 1.5, "uncertain"], [55, 1, 1.5, "uncertain"],
      [59, 1.5, 1.5, "uncertain"], [64, 2, 1.5, "uncertain"], [67, 2.5, 1.5, "uncertain"],
      [59, 3, 1.5, "uncertain"], [55, 3.5, 1.5, "uncertain"],
    ]),
    fixture("E", "pedal-with-repeated-top", [
      [43, 0, 8, "harmonic"], [50, 0, 8, "harmonic"], [55, 0, 8, "harmonic"],
      [67, 0.5, 0.75, "melody-like"], [67, 2, 0.75, "melody-like"],
      [69, 3.5, 0.75, "melody-like"], [67, 5, 0.75, "melody-like"],
    ]),
    fixture("F", "dense-staccato-harmony", alignedChords(
      [[48, 52, 55, 59], [50, 53, 57, 60], [52, 55, 59, 62], [47, 50, 55, 59]],
      0.5,
      0.42,
    )),
    fixture("G", "broken-chord-ostinato", repeatedPattern(
      [48, 55, 52, 59, 55, 64, 59, 55],
      0.5,
      0.9,
      "uncertain",
    )),
    fixture("H", "monophonic-melody", repeatedPattern(
      [60, 62, 64, 67, 65, 64, 62, 60],
      0.75,
      0.6,
      "melody-like",
    )),
    fixture("I", "aligned-two-layer-voicing", [
      [48, 0, 2, "harmonic"], [55, 0, 2, "harmonic"], [60, 0, 2, "harmonic"], [64, 0, 2, "harmonic"],
      [50, 2, 2, "harmonic"], [57, 2, 2, "harmonic"], [62, 2, 2, "harmonic"], [65, 2, 2, "harmonic"],
      [52, 4, 2, "harmonic"], [59, 4, 2, "harmonic"], [64, 4, 2, "harmonic"], [67, 4, 2, "harmonic"],
    ]),
    fixture("J", "long-upper-extensions", [
      [48, 0, 8, "harmonic"], [52, 0, 8, "harmonic"], [55, 0, 8, "harmonic"],
      [59, 0, 8, "harmonic", true], [62, 0, 8, "harmonic", true],
      [65, 0, 8, "harmonic", true], [69, 0, 8, "harmonic", true],
    ]),
  ];
}

export function generateP5211DenseBenchmarkFixture(
  repetitions = 64,
): readonly P5211SyntheticNote[] {
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 256) {
    throw new Error("repetitions must be an integer from 1 to 256");
  }
  const base = generateP5211SyntheticNoteRoleFixtures()
    .find((entry) => entry.id === "F")?.notes ?? [];
  return Array.from({ length: repetitions }, (_, repetition) => base.map((entry, index) => ({
    ...entry,
    id: `dense-${String(repetition).padStart(3, "0")}-${String(index).padStart(3, "0")}`,
    startBeat: entry.startBeat + repetition * 8,
  }))).flat();
}

export function evaluateP5211NoteRolePredictions(
  fixtures: readonly P5211SyntheticNoteRoleFixture[],
  predictions: Readonly<Record<string, P5211NoteRole>>,
): P5211NoteRoleMetrics {
  const notes = fixtures.flatMap((entry) => [...entry.notes]);
  const confusion = emptyConfusion();
  let evaluatedNotes = 0;
  let exact = 0;
  let melodyTruePositive = 0;
  let melodyFalsePositive = 0;
  let melodyFalseNegative = 0;
  let harmonicTotal = 0;
  let harmonicRetained = 0;
  let protectedTotal = 0;
  let protectedRetained = 0;
  let uncertainTotal = 0;
  let uncertainRetained = 0;

  for (const note of notes) {
    const predicted = predictions[note.id];
    if (!predicted) continue;
    evaluatedNotes += 1;
    confusion[note.expectedRole][predicted] += 1;
    if (predicted === note.expectedRole) exact += 1;
    if (note.expectedRole === "melody-like" && predicted === "melody-like") melodyTruePositive += 1;
    if (note.expectedRole !== "melody-like" && predicted === "melody-like") melodyFalsePositive += 1;
    if (note.expectedRole === "melody-like" && predicted !== "melody-like") melodyFalseNegative += 1;
    if (note.expectedRole === "harmonic") {
      harmonicTotal += 1;
      if (predicted !== "melody-like") harmonicRetained += 1;
    }
    if (note.protectedHarmonic) {
      protectedTotal += 1;
      if (predicted !== "melody-like") protectedRetained += 1;
    }
    if (note.expectedRole === "uncertain") {
      uncertainTotal += 1;
      if (predicted !== "melody-like") uncertainRetained += 1;
    }
  }

  return {
    totalNotes: notes.length,
    evaluatedNotes,
    exactAccuracy: ratio(exact, evaluatedNotes),
    melodyLikePrecision: ratio(melodyTruePositive, melodyTruePositive + melodyFalsePositive),
    melodyLikeRecall: ratio(melodyTruePositive, melodyTruePositive + melodyFalseNegative),
    harmonicRetention: ratio(harmonicRetained, harmonicTotal),
    protectedHarmonicRetention: ratio(protectedRetained, protectedTotal),
    uncertainNonSuppression: ratio(uncertainRetained, uncertainTotal),
    confusion,
  };
}

function fixture(
  id: P5211SyntheticNoteRoleFixture["id"],
  purpose: P5211SyntheticNoteRoleFixture["purpose"],
  specs: readonly NoteSpec[],
): P5211SyntheticNoteRoleFixture {
  return {
    id,
    purpose,
    notes: specs.map(([pitch, startBeat, durationBeats, expectedRole, protectedHarmonic], index) => ({
      id: `${id}-n${String(index + 1).padStart(2, "0")}`,
      pitch,
      startBeat,
      durationBeats,
      velocity: 96,
      expectedRole,
      protectedHarmonic: protectedHarmonic ?? false,
    })),
  };
}

function alignedChords(
  chords: readonly (readonly number[])[],
  spacing: number,
  duration: number,
): NoteSpec[] {
  return chords.flatMap((pitches, chordIndex) => pitches.map((pitch) => [
    pitch,
    chordIndex * spacing,
    duration,
    "harmonic",
    false,
  ] as const));
}

function repeatedPattern(
  pitches: readonly number[],
  spacing: number,
  duration: number,
  expectedRole: P5211NoteRole,
): NoteSpec[] {
  return pitches.map((pitch, index) => [pitch, index * spacing, duration, expectedRole, false] as const);
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function emptyConfusion(): Record<P5211NoteRole, Record<P5211NoteRole, number>> {
  return {
    harmonic: { harmonic: 0, "melody-like": 0, uncertain: 0 },
    "melody-like": { harmonic: 0, "melody-like": 0, uncertain: 0 },
    uncertain: { harmonic: 0, "melody-like": 0, uncertain: 0 },
  };
}
