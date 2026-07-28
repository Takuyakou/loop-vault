import { describe, expect, it } from "vitest";
import { makeChordSymbol, noteNameFromPitchClass } from "../../src/domain/chords";
import type { ChordSymbol } from "../../src/domain/types";
import type { Phase48EvidenceNote } from "./eventEvidence";
import {
  generateObservedFlatNineShadowCandidates,
  shadowCandidateToChord,
  type FlatNineSourceCandidate,
} from "./observedFlatNineShadow";

describe("Phase 4.8 observed 7(b9) Shadow generator", () => {
  it("generates one canonical candidate for all 12 roots", () => {
    for (let root = 0; root < 12; root += 1) {
      const generated = generateObservedFlatNineShadowCandidates(
        [source(root, 1)],
        completeNotes(root),
        range("E1"),
      );
      expect(generated).toHaveLength(1);
      expect(generated[0]?.root).toBe(noteNameFromPitchClass(root));
      expect(generated[0]?.tensions).toEqual(["b9"]);
      expect(shadowCandidateToChord(generated[0]!).label)
        .toBe(`${noteNameFromPitchClass(root)}7(b9)`);
      expect(generated[0]?.supportingCoreNoteInstanceIds.length)
        .toBeGreaterThanOrEqual(4);
      expect(generated[0]?.supportingB9NoteInstanceIds).toHaveLength(1);
    }
  });

  it("keeps E1, E2 and E3 independent", () => {
    const passing = completeNotes(9, {
      flatNineStart: 3.5,
      flatNineEnd: 3.75,
      flatNineRole: "melody",
    });
    expect(generateObservedFlatNineShadowCandidates(
      [source(9, 1)],
      passing,
      range("E1"),
    )).toHaveLength(1);
    expect(generateObservedFlatNineShadowCandidates(
      [source(9, 1)],
      passing,
      range("E2"),
    )).toHaveLength(0);

    const melodyOnly = completeNotes(9, {
      flatNineStart: 0,
      flatNineEnd: 4,
      flatNineRole: "melody",
    });
    expect(generateObservedFlatNineShadowCandidates(
      [source(9, 1)],
      melodyOnly,
      range("E2"),
    )).toHaveLength(1);
    expect(generateObservedFlatNineShadowCandidates(
      [source(9, 1)],
      melodyOnly,
      range("E3"),
    )).toHaveLength(0);
  });

  it("allows the locked P5 omission only in event-supported variants", () => {
    const notes = completeNotes(9).filter((note) => note.pitchClass !== 4);
    expect(generateObservedFlatNineShadowCandidates(
      [source(9, 1)],
      notes,
      range("E1"),
    )).toHaveLength(0);
    expect(generateObservedFlatNineShadowCandidates(
      [source(9, 1)],
      notes,
      range("E2"),
    )[0]?.evidenceClass).toBe("weak");
    expect(generateObservedFlatNineShadowCandidates(
      [source(9, 1)],
      notes,
      range("E3"),
    )).toHaveLength(1);
  });

  it.each([
    { name: "root", pitchClass: 9 },
    { name: "major third", pitchClass: 1 },
    { name: "minor seventh", pitchClass: 7 },
  ])("rejects a core missing $name", ({ pitchClass }) => {
    const notes = completeNotes(9)
      .filter((note) => note.pitchClass !== pitchClass);
    expect(generateObservedFlatNineShadowCandidates(
      [source(9, 1)],
      notes,
      range("E2"),
    )).toHaveLength(0);
  });

  it("does not duplicate an existing canonical 7(b9)", () => {
    const existing = makeChordSymbol(9, "dom7", ["b9"]);
    expect(generateObservedFlatNineShadowCandidates(
      [source(9, 1), { chord: existing, rawScore: 0.9 }],
      completeNotes(9),
      range("E1"),
    )).toHaveLength(0);
  });

  it("enforces one candidate per root and two candidates per event", () => {
    const allPitchClasses = Array.from({ length: 12 }, (_, pitchClass) =>
      evidenceNote(`pc-${pitchClass}`, pitchClass, 0, 4, "harmony"));
    const generated = generateObservedFlatNineShadowCandidates(
      [
        source(0, 1.2),
        source(0, 1.1, makeChordSymbol(0, "dom7", [], 4)),
        source(4, 1),
        source(8, 0.9),
      ],
      allPitchClasses,
      range("E1"),
    );
    expect(generated).toHaveLength(2);
    expect(new Set(generated.map((candidate) => candidate.root)).size).toBe(2);
  });

  it("is byte-deterministic and never invents another alteration", () => {
    const input = [source(9, 1.05)];
    const notes = completeNotes(9);
    const first = generateObservedFlatNineShadowCandidates(
      input,
      notes,
      range("E3"),
    );
    const second = generateObservedFlatNineShadowCandidates(
      input,
      notes,
      range("E3"),
    );
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first[0]?.tensions).toEqual(["b9"]);
  });
});

function source(
  root: number,
  rawScore: number,
  chord: ChordSymbol = makeChordSymbol(root, "dom7"),
): FlatNineSourceCandidate {
  return { chord, rawScore };
}

function range(variant: "E1" | "E2" | "E3") {
  return {
    variant,
    eventStartBeat: 0,
    eventEndBeat: 4,
  } as const;
}

function completeNotes(
  root: number,
  options: {
    flatNineStart?: number;
    flatNineEnd?: number;
    flatNineRole?: Phase48EvidenceNote["role"];
  } = {},
): Phase48EvidenceNote[] {
  return [
    evidenceNote("root", root, 0, 4, "harmony"),
    evidenceNote("M3", root + 4, 0, 4, "harmony"),
    evidenceNote("P5", root + 7, 0, 4, "harmony"),
    evidenceNote("m7", root + 10, 0, 4, "harmony"),
    evidenceNote(
      "b9",
      root + 1,
      options.flatNineStart ?? 0,
      options.flatNineEnd ?? 4,
      options.flatNineRole ?? "harmony",
    ),
  ];
}

function evidenceNote(
  noteInstanceId: string,
  pitchClass: number,
  startBeat: number,
  endBeat: number,
  role: Phase48EvidenceNote["role"],
): Phase48EvidenceNote {
  const normalized = ((pitchClass % 12) + 12) % 12;
  return {
    noteInstanceId,
    pitch: 60 + normalized,
    pitchClass: normalized,
    startBeat,
    endBeat,
    durationBeats: endBeat - startBeat,
    trackIndex: 0,
    channel: 0,
    trackName: "Fixture",
    role,
    roleConfidence: 1,
  };
}
