import { describe, expect, it } from "vitest";
import {
  DEGREE_VOCABULARIES,
  MINOR_DEGREES,
  STANDARD_BASS_TUNINGS,
  degreeDifficultyPreset,
  degreeToPitchClass,
  degreeVocabulary,
  fretboardPositions,
  formatDegree,
  generateDegreeExercise,
  keyPitchClass,
  midiNoteName,
  normalizeGeneratorSnapshot,
  resolveSingingReference,
} from ".";
import { generatorSnapshot } from "./testFixtures";

describe("Degree Echo generator", () => {
  it("returns a deeply equal exercise for the same normalized snapshot", () => {
    const first = generateDegreeExercise(generatorSnapshot({ key: "c" }));
    const second = generateDegreeExercise(generatorSnapshot({ key: "C" }));
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(Object.isFrozen(first.exercise)).toBe(true);
    expect(Object.isFrozen(first.exercise.targetEvents)).toBe(true);
    expect(first.exercise.id).toMatch(/^degree-[0-9a-f]{16}$/);
  });

  it("uses different seeds for deterministic variation", () => {
    const first = generateDegreeExercise(generatorSnapshot({ seed: "alpha" }));
    const second = generateDegreeExercise(generatorSnapshot({ seed: "beta" }));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.exercise.id).not.toBe(first.exercise.id);
    expect(second.exercise.targetEvents).not.toEqual(first.exercise.targetEvents);
  });

  it.each([
    ["major", ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]],
    ["minor", ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"]],
  ] as const)("generates every supported %s key", (scale, keys) => {
    for (const key of keys) {
      const result = generateDegreeExercise(generatorSnapshot({
        scale,
        key,
        allowedDegrees: degreeDifficultyPreset(2, scale).allowedDegrees,
        pitchSpan: { minMidi: 23, maxMidi: 67 },
        tuning: STANDARD_BASS_TUNINGS[5],
        fretRange: { min: 0, max: 24 },
      }));
      expect(result.ok, `${key} ${scale}`).toBe(true);
    }
  });

  it("models level presets as independent difficulty axes", () => {
    const first = degreeDifficultyPreset(1, "major");
    const second = degreeDifficultyPreset(2, "major");
    const third = degreeDifficultyPreset(3, "major");
    expect(first.vocabularyId).toBe("tonic-dominant-octave");
    expect(first.degreeSequence).toEqual(
      degreeVocabulary("tonic-dominant-octave").degreeSequence,
    );
    expect(second.vocabularies.map((value) => value.id)).toContain("minor-color-cadence");
    expect(third.vocabularyId).toBe("tonic-dominant-mixolydian");
    expect(third.degreeSequence).toHaveLength(4);
    expect(third.vocabularies.filter((value) => value.kind === "chromatic-approach"))
      .toHaveLength(3);
    expect([first, second, third].map((preset) => preset.difficulty.noteCount))
      .toEqual([3, 4, 4]);
    expect(Object.isFrozen(third.allowedDegrees)).toBe(true);
  });

  it("contains exactly the active-instruction vocabulary IDs", () => {
    expect(Object.keys(DEGREE_VOCABULARIES).sort()).toEqual([
      "ascending-minor-color",
      "chromatic-approach-1",
      "chromatic-approach-3",
      "chromatic-approach-5",
      "dominant-octave-resolution",
      "minor-color-cadence",
      "tonic-dominant",
      "tonic-dominant-mixolydian",
      "tonic-dominant-octave",
      "tonic-single",
    ]);
    expect(degreeVocabulary("tonic-dominant-mixolydian").degreeSequence)
      .toEqual([
        { degree: 1, accidental: 0, octave: 0 },
        { degree: 5, accidental: 0, octave: 0 },
        { degree: 6, accidental: 0, octave: 0 },
        { degree: 7, accidental: -1, octave: 0 },
      ]);
  });

  it("defines minor diatonic degrees explicitly in major-relative notation", () => {
    expect(MINOR_DEGREES).toEqual([
      { degree: 1, accidental: 0, octave: 0 },
      { degree: 2, accidental: 0, octave: 0 },
      { degree: 3, accidental: -1, octave: 0 },
      { degree: 4, accidental: 0, octave: 0 },
      { degree: 5, accidental: 0, octave: 0 },
      { degree: 6, accidental: -1, octave: 0 },
      { degree: 7, accidental: -1, octave: 0 },
    ]);
    const minorPreset = degreeDifficultyPreset(3, "minor");
    for (const degree of MINOR_DEGREES) {
      expect(minorPreset.allowedDegrees).toContainEqual(degree);
    }
  });

  it("maps D minor 1-5-6-flat7 to literal D-A-B-C pitch classes", () => {
    const result = generateDegreeExercise(generatorSnapshot({
      scale: "minor",
      key: "D",
      ...snapshotVocabulary("tonic-dominant-mixolydian", "minor"),
      pitchSpan: { minMidi: 23, maxMidi: 67 },
      tuning: STANDARD_BASS_TUNINGS[5],
      fretRange: { min: 0, max: 24 },
      maxAttempts: 256,
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exercise.targetEvents.map((event) => event.midiNote % 12))
      .toEqual([2, 9, 11, 0]);
  });

  it("maps A minor chromatic degrees without a mode-relative interval table", () => {
    const oneFlatThreeFiveFlatSeven = [
      { degree: 1, accidental: 0, octave: 0 },
      { degree: 3, accidental: -1, octave: 0 },
      { degree: 5, accidental: 0, octave: 0 },
      { degree: 7, accidental: -1, octave: 0 },
    ] as const;
    const oneFlatThreeFourFive = [
      { degree: 1, accidental: 0, octave: 0 },
      { degree: 3, accidental: -1, octave: 0 },
      { degree: 4, accidental: 0, octave: 0 },
      { degree: 5, accidental: 0, octave: 0 },
    ] as const;
    expect(oneFlatThreeFiveFlatSeven.map((degree) => degreeToPitchClass(9, degree)))
      .toEqual([9, 0, 4, 7]);
    expect(oneFlatThreeFourFive.map((degree) => degreeToPitchClass(9, degree)))
      .toEqual([9, 0, 2, 4]);
  });

  it("formats compound degree octaves as learning degrees", () => {
    expect([
      { degree: 1, accidental: 0, octave: 0 },
      { degree: 5, accidental: 0, octave: 0 },
      { degree: 1, accidental: 0, octave: 1 },
    ].map((degree) => formatDegree(degree as Parameters<typeof formatDegree>[0])))
      .toEqual(["1", "5", "8"]);
    expect(formatDegree({ degree: 7, accidental: -1, octave: 0 })).toBe("♭7");
  });

  it.each([
    ["chromatic-approach-1", 1],
    ["chromatic-approach-3", 3],
    ["chromatic-approach-5", 5],
  ] as const)("locks %s to a semitone approach resolving to degree %i", (id, target) => {
    const vocabulary = degreeVocabulary(id);
    expect(vocabulary.kind).toBe("chromatic-approach");
    expect(vocabulary.approachTarget).toBe(target);
    expect(vocabulary.degreeSequence[vocabulary.degreeSequence.length - 1].degree).toBe(target);
    const snapshot = generatorSnapshot({
      vocabularyId: vocabulary.id,
      degreeSequence: vocabulary.degreeSequence,
      allowedDegrees: degreeDifficultyPreset(3, "major").allowedDegrees,
      noteCount: vocabulary.degreeSequence.length,
    });
    const result = generateDegreeExercise(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exercise.generatorSnapshot.vocabularyId).toBe(id);
    expect(result.exercise.generatorSnapshot.degreeSequence).toEqual(vocabulary.degreeSequence);
    expect(result.exercise.targetEvents.map((event) => event.degree))
      .toEqual(vocabulary.degreeSequence);
    expect(
      result.exercise.targetEvents[1].midiNote
      - result.exercise.targetEvents[0].midiNote,
    ).toBe(1);
  });

  it.each([
    [4, STANDARD_BASS_TUNINGS[4]],
    [5, STANDARD_BASS_TUNINGS[5]],
  ] as const)("keeps every event playable on a %i-string bass", (_count, tuning) => {
    for (const handedness of ["left", "right"] as const) {
      const result = generateDegreeExercise(generatorSnapshot({
        seed: `playable-${handedness}-${tuning.length}`,
        tuning,
        handedness,
        pitchSpan: { minMidi: Math.min(...tuning), maxMidi: Math.max(...tuning) + 12 },
      }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.exercise.generatorSnapshot.handedness).toBe(handedness);
      for (const event of result.exercise.targetEvents) {
        expect(fretboardPositions(
          event.midiNote,
          tuning,
          result.exercise.generatorSnapshot.fretRange,
        ).length).toBeGreaterThan(0);
      }
    }
  });

  it("honors note count, phrase duration, monophony, tonal mapping, and fret range", () => {
    const result = generateDegreeExercise(generatorSnapshot({
      ...snapshotVocabulary("tonic-dominant-mixolydian"),
      phraseLengthBeats: 3.5,
      fretRange: { min: 5, max: 9 },
      pitchSpan: { minMidi: 33, maxMidi: 60 },
      maxAttempts: 256,
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { exercise } = result;
    expect(exercise.targetEvents).toHaveLength(4);
    const finalEvent = exercise.targetEvents[exercise.targetEvents.length - 1];
    expect(finalEvent.startBeat + finalEvent.durationBeats).toBeCloseTo(3.5, 10);
    const tonic = keyPitchClass(exercise.tonalContext.key, exercise.tonalContext.scale)!;
    exercise.targetEvents.forEach((event, index) => {
      expect(event.index).toBe(index);
      expect(event.startBeat).toBeCloseTo(index * (3.5 / 4), 10);
      expect(event.durationBeats).toBeCloseTo(3.5 / 4, 10);
      expect(event.midiNote % 12).toBe(
        degreeToPitchClass(tonic, event.degree),
      );
      const positions = fretboardPositions(
        event.midiNote,
        exercise.generatorSnapshot.tuning,
        exercise.generatorSnapshot.fretRange,
      );
      expect(positions.length).toBeGreaterThan(0);
      expect(positions.every((position) => position.fret >= 5 && position.fret <= 9)).toBe(true);
    });
  });

  it("holds generation invariants across a deterministic seed property sample", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const vocabularyIds = Object.keys(DEGREE_VOCABULARIES) as Array<keyof typeof DEGREE_VOCABULARIES>;
      const snapshot = generatorSnapshot({
        seed: `property-${seed}`,
        ...snapshotVocabulary(vocabularyIds[seed % vocabularyIds.length]),
        phraseLengthBeats: ((seed % 4) + 1),
        tuning: seed % 2 === 0 ? STANDARD_BASS_TUNINGS[4] : STANDARD_BASS_TUNINGS[5],
        handedness: seed % 3 === 0 ? "left" : "right",
        pitchSpan: { minMidi: 23, maxMidi: 67 },
        fretRange: { min: seed % 3, max: 24 },
        maxAttempts: 256,
      });
      const result = generateDegreeExercise(snapshot);
      expect(result.ok, `seed ${seed}`).toBe(true);
      if (!result.ok) continue;
      const events = result.exercise.targetEvents;
      expect(events).toHaveLength(snapshot.noteCount);
      expect(events[0].startBeat).toBe(0);
      const final = events[events.length - 1];
      expect(final.startBeat + final.durationBeats)
        .toBeCloseTo(snapshot.phraseLengthBeats, 10);
      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        expect(Number.isFinite(event.startBeat)).toBe(true);
        expect(Number.isFinite(event.durationBeats)).toBe(true);
        expect(event.durationBeats).toBeGreaterThan(0);
        expect(event.midiNote).toBeGreaterThanOrEqual(snapshot.pitchSpan.minMidi);
        expect(event.midiNote).toBeLessThanOrEqual(snapshot.pitchSpan.maxMidi);
        expect(fretboardPositions(event.midiNote, snapshot.tuning, snapshot.fretRange))
          .not.toHaveLength(0);
        if (index > 0) {
          const previous = events[index - 1];
          expect(event.startBeat).toBeGreaterThanOrEqual(
            previous.startBeat + previous.durationBeats - Number.EPSILON,
          );
          expect(Math.abs(event.midiNote - previous.midiNote)).toBeLessThanOrEqual(12);
        }
      }
    }
  });

  it("honors degree octave as an absolute phrase-tonic register", () => {
    const result = generateDegreeExercise(generatorSnapshot({
      seed: "s0",
      ...snapshotVocabulary("tonic-dominant-octave"),
      pitchSpan: { minMidi: 28, maxMidi: 55 },
      maxAttempts: 256,
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const notes = result.exercise.targetEvents.map((event) => event.midiNote);
    expect(notes).not.toEqual([48, 43, 48]);
    expect(notes[2]).toBe(notes[0] + 12);
  });

  it("returns bounded exhaustion when an octave target is outside the playable range", () => {
    const result = generateDegreeExercise(generatorSnapshot({
      seed: "octave-range-exhaustion",
      ...snapshotVocabulary("tonic-dominant-octave"),
      pitchSpan: { minMidi: 36, maxMidi: 43 },
      fretRange: { min: 0, max: 12 },
      maxAttempts: 3,
    }));
    expect(result).toEqual({
      ok: false,
      error: {
        code: "attempts-exhausted",
        message: "Unable to generate a playable exercise in 3 attempts.",
        attempts: 3,
      },
    });
  });

  it("normalizes degree ordering and duplicate values before hashing", () => {
    const base = generatorSnapshot();
    const ordered = generatorSnapshot({ allowedDegrees: base.allowedDegrees });
    const unordered = generatorSnapshot({
      allowedDegrees: [
        ...base.allowedDegrees.slice().reverse(),
        base.allowedDegrees[0],
      ],
    });
    expect(normalizeGeneratorSnapshot(unordered).allowedDegrees)
      .toEqual(normalizeGeneratorSnapshot(ordered).allowedDegrees);
    expect(generateDegreeExercise(unordered)).toEqual(generateDegreeExercise(ordered));
  });

  it("returns typed invalid-config and bounded exhaustion errors", () => {
    for (const noteCount of [7, 8]) {
      const invalid = generateDegreeExercise(generatorSnapshot({ noteCount }));
      expect(invalid).toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "invalid-config",
          attempts: 0,
          message: "Note count must be an integer between 1 and 6.",
        }),
      }));
    }
    const mismatchedVocabulary = generateDegreeExercise(generatorSnapshot({
      vocabularyId: "tonic-dominant",
    }));
    expect(mismatchedVocabulary).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: "invalid-config",
        message: "Degree sequence does not match the selected vocabulary ID.",
      }),
    }));

    const exhausted = generateDegreeExercise(generatorSnapshot({
      vocabularyId: "chromatic-approach-3",
      degreeSequence: degreeVocabulary("chromatic-approach-3").degreeSequence,
      allowedDegrees: degreeVocabulary("chromatic-approach-3").degreeSequence,
      noteCount: 2,
      tuning: STANDARD_BASS_TUNINGS[4],
      fretRange: { min: 0, max: 0 },
      pitchSpan: { minMidi: 28, maxMidi: 43 },
      maxAttempts: 3,
    }));
    expect(exhausted).toEqual({
      ok: false,
      error: {
        code: "attempts-exhausted",
        message: "Unable to generate a playable exercise in 3 attempts.",
        attempts: 3,
      },
    });
  });

  it("maps note names using the canonical key accidental preference", () => {
    expect(midiNoteName(61, "Db", "major")).toBe("Db4");
    expect(midiNoteName(61, "D", "major")).toBe("C#4");
  });
});

function snapshotVocabulary(
  id: keyof typeof DEGREE_VOCABULARIES,
  scale: "major" | "minor" = "major",
) {
  const vocabulary = degreeVocabulary(id);
  return {
    vocabularyId: vocabulary.id,
    degreeSequence: vocabulary.degreeSequence,
    allowedDegrees: degreeDifficultyPreset(vocabulary.minimumLevel, scale).allowedDegrees,
    noteCount: vocabulary.degreeSequence.length,
  };
}

describe("singing reference", () => {
  const target = generateDegreeExercise(generatorSnapshot({ singingReferenceMode: "original" }));
  if (!target.ok) throw new Error(JSON.stringify(target.error));

  it.each([
    ["original", 0],
    ["octave-1", 1],
    ["octave-2", 2],
  ] as const)("applies only the documented %s octave displacement", (mode, shift) => {
    const reference = resolveSingingReference(target.exercise.targetEvents, mode);
    expect(reference.resolvedOctaveShift).toBe(shift);
    reference.events.forEach((event, index) => {
      const source = target.exercise.targetEvents[index];
      expect(event.midiNote).toBe(source.midiNote + (shift * 12));
      expect({ ...event, midiNote: source.midiNote }).toEqual(source);
    });
  });

  it("resolves Auto deterministically without changing contour or interval classes", () => {
    const first = resolveSingingReference(target.exercise.targetEvents, "auto");
    const second = resolveSingingReference(target.exercise.targetEvents, "auto");
    expect(second).toEqual(first);
    const targetIntervals = target.exercise.targetEvents.slice(1).map(
      (event, index) => (event.midiNote - target.exercise.targetEvents[index].midiNote) % 12,
    );
    const referenceIntervals = first.events.slice(1).map(
      (event, index) => (event.midiNote - first.events[index].midiNote) % 12,
    );
    expect(referenceIntervals).toEqual(targetIntervals);
  });
});
