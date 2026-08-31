import { describe, expect, it } from "vitest";
import { makeChordSymbol, normalizePc } from "../../src/domain/chords";
import type { ChordQuality } from "../../src/domain/types";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import {
  chordTemplates,
  type ChordCandidateScore,
} from "../../src/domain/midi/candidates";
import {
  alteredTensionsShadowLimits,
  diagnoseAlteredTensionsShadow,
  type AlteredTensionKind,
  type AlteredTensionNoteEvidence,
  type AlteredTensionsShadowInput,
} from "../../src/domain/midi/alteredTensionsShadow";
import { buildP526EightBarPreparedData } from "./fixtures";

describe("P5.26-04 altered tensions shadow", () => {
  it("composes b13 from a plain dom7 core plus observed tension in all 12 keys", () => {
    for (let root = 0; root < 12; root += 1) {
      const result = diagnoseAlteredTensionsShadow(inputFor(root, "b13"));
      const target = result.candidates.find((entry) => entry.alteration === "b13");
      expect(result.status, String(root)).toBe("available");
      expect(target, String(root)).toMatchObject({
        generation: "shadow-compositional-b13",
        chord: { root, quality: "dom7", tensions: ["b13"] },
        sourceCoreRank: 1,
      });
      expect(target!.candidateRank).toBeGreaterThan(0);
      expect(target!.rankDelta).toBe(target!.candidateRank - 1);
    }
  });

  it("uses the existing b9 generator and exposes its third alternative rank", () => {
    const result = diagnoseAlteredTensionsShadow(inputFor(1, "b9"));
    const target = result.candidates.find((entry) => entry.alteration === "b9");
    expect(target).toMatchObject({
      generation: "existing-observed-b9",
      candidateRank: 3,
      sourceCoreRank: 1,
      rankDelta: 2,
      chord: { root: 1, quality: "dom7", tensions: ["b9"] },
    });
  });

  it("reports aggregate score, source, onset/beat, and persistence evidence", () => {
    const input = inputFor(8, "b13");
    input.noteEvidence = [
      ...input.noteEvidence.slice(0, 4),
      note(4, "harmony", 0, 4, 2),
      note(4, "melody", 2, 2, 1),
    ];
    const target = diagnoseAlteredTensionsShadow(input).candidates
      .find((entry) => entry.alteration === "b13")!;

    expect(target.scoreComponents.sourceCoreScore).toBe(0.9);
    expect(target.scoreComponents.onsetStrength).toBeCloseTo(11 / 12, 6);
    expect(target.scoreComponents.persistence).toBeCloseTo(5 / 6, 6);
    expect(target.scoreComponents.sourceSupport).toBeCloseTo(49 / 60, 6);
    expect(target.scoreComponents.alteredSupport).toBeGreaterThan(0);
    expect(target.scoreComponents.shadowScore).toBeGreaterThan(target.scoreComponents.sourceCoreScore);
    expect(target.evidence).toEqual({
      observations: 2,
      alteredWeight: 3,
      coreWeight: 4,
      segmentBeats: 4,
      onsetBeatWeights: { barStart: 2, midBarStrong: 1, otherBeat: 0, offBeat: 0 },
      sourceWeights: { bass: 0, harmony: 2, melody: 1, unknown: 0 },
    });
  });

  it("does not generate or promote altered candidates for a plain dominant", () => {
    const input = inputFor(7, "b13");
    input.noteEvidence = input.noteEvidence.slice(0, 4);
    const result = diagnoseAlteredTensionsShadow(input);

    expect(result).toMatchObject({
      status: "available",
      reason: "no-altered-evidence",
      candidates: [],
      rankOneDelta: { changed: 0, improved: 0, regressed: 0 },
    });
  });

  it("requires the complete dominant core before b9 or b13 generation", () => {
    for (const alteration of ["b9", "b13"] as const) {
      const input = inputFor(5, alteration);
      input.noteEvidence = input.noteEvidence.filter((entry) => entry.pitchClass !== normalizePc(5 + 10));
      expect(diagnoseAlteredTensionsShadow(input).candidates, alteration).toEqual([]);
    }
  });

  it("fails closed for ambiguous equal dominant roots and invalid inputs", () => {
    const ambiguous = inputFor(0, "b13");
    ambiguous.rankedCandidates = [
      score(0, "dom7", 0.9),
      score(6, "dom7", 0.9),
      score(2, "min7", 0.8),
    ];
    ambiguous.noteEvidence = [
      ...evidenceFor(0, "b13"),
      ...evidenceFor(6, "b13"),
    ];
    expect(diagnoseAlteredTensionsShadow(ambiguous)).toMatchObject({
      status: "unknown",
      reason: "ambiguous-dominant-root",
      candidates: [],
    });

    const invalid = { ...inputFor(0, "b9"), segmentEndBeat: 0 };
    expect(diagnoseAlteredTensionsShadow(invalid)).toMatchObject({
      status: "unknown",
      reason: "invalid-input",
      operations: { candidateVisits: 0, evidenceVisits: 0, dominantRootEvaluations: 0 },
    });
  });

  it.each(malformedInputs())("fails closed without throwing for malformed runtime input: %s", (_name, value) => {
    expect(() => diagnoseAlteredTensionsShadow(value)).not.toThrow();
    expect(diagnoseAlteredTensionsShadow(value)).toEqual({
      version: "p526-altered-tensions-shadow-v1",
      status: "unknown",
      reason: "invalid-input",
      candidates: [],
      rankOneDelta: { changed: 0, improved: 0, regressed: 0 },
      operations: { candidateVisits: 0, evidenceVisits: 0, dominantRootEvaluations: 0 },
    });
  });

  it("keeps every numeric diagnostic finite for accepted input", () => {
    const result = diagnoseAlteredTensionsShadow(inputFor(8, "b13"));
    expect(result.status).toBe("available");
    expect(hasOnlyFiniteNumbers(result)).toBe(true);
  });

  it("keeps the production template count exact and never mutates the registry", () => {
    expect(chordTemplates).toHaveLength(21);
    const before = structuredClone(chordTemplates);
    diagnoseAlteredTensionsShadow(inputFor(8, "b13"));
    expect(chordTemplates).toHaveLength(21);
    expect(chordTemplates).toEqual(before);
  });

  it("is not connected to production and leaves default analysis deep equal", () => {
    const bytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64]);
    const options = { preparedData: buildP526EightBarPreparedData(), mode: "phase4-v1" as const };
    const before = analyzeMidi(bytes, options);
    diagnoseAlteredTensionsShadow(inputFor(8, "b13"));
    const after = analyzeMidi(bytes, structuredClone(options));
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it("is deterministic, preserves input, and emits aggregate-only diagnostics", () => {
    const input = inputFor(1, "b9");
    const before = structuredClone(input);
    const first = diagnoseAlteredTensionsShadow(input);
    expect(diagnoseAlteredTensionsShadow(structuredClone(input))).toEqual(first);
    expect(input).toEqual(before);
    expect(JSON.stringify(first)).not.toMatch(/(?:path|file|user|raw|device)/i);
  });

  it("has explicit linear visit bounds at the locked maximum sizes", () => {
    const rankedCandidates = Array.from(
      { length: alteredTensionsShadowLimits.candidates },
      (_, index) => score(index % 12, index < 12 ? "dom7" : "maj", 1 - index / 1_000),
    );
    const pcs = [0, 4, 7, 10, 8];
    const noteEvidence = Array.from(
      { length: alteredTensionsShadowLimits.evidence },
      (_, index) => note(pcs[index % pcs.length]!, "harmony", index % 4, 1, 1),
    );
    const result = diagnoseAlteredTensionsShadow({
      segmentStartBeat: 0,
      segmentEndBeat: 4,
      rankedCandidates,
      noteEvidence,
    });

    expect(result.operations).toEqual({
      candidateVisits: alteredTensionsShadowLimits.candidates,
      evidenceVisits: alteredTensionsShadowLimits.evidence,
      dominantRootEvaluations: 12,
    });
    expect(result.candidates.length).toBeLessThanOrEqual(
      alteredTensionsShadowLimits.generatedPerAlteration * 2,
    );
  });
});

function inputFor(root: number, alteration: AlteredTensionKind): MutableInput {
  return {
    segmentStartBeat: 0,
    segmentEndBeat: 4,
    rankedCandidates: [
      score(root, "dom7", 0.9),
      score(normalizePc(root + 1), "maj", 0.85),
      score(normalizePc(root + 3), "min7", 0.8),
      score(normalizePc(root + 5), "dom7", 0.7),
    ],
    noteEvidence: evidenceFor(root, alteration),
  };
}

function malformedInputs(): Array<readonly [string, unknown]> {
  return [
    ["null input", null],
    ["null candidate array", malformedInput((value) => {
      value.rankedCandidates = null;
    })],
    ["null chord", malformedInput((value) => {
      firstCandidate(value).chord = null;
    })],
    ["null tensions", malformedInput((value) => {
      firstChord(value).tensions = null;
    })],
    ["sparse candidate array", malformedInput((value) => {
      const sparse = new Array<unknown>(2);
      sparse[1] = firstCandidate(value);
      value.rankedCandidates = sparse;
    })],
    ["sparse evidence array", malformedInput((value) => {
      const sparse = new Array<unknown>(2);
      sparse[1] = firstEvidence(value);
      value.noteEvidence = sparse;
    })],
    ["unsupported evidence source", malformedInput((value) => {
      firstEvidence(value).source = "bad";
    })],
    ["evidence exceeds segment", malformedInput((value) => {
      firstEvidence(value).durationBeats = 5;
    })],
    ["non-finite candidate score", malformedInput((value) => {
      firstCandidate(value).totalScore = Number.NaN;
    })],
    ["out-of-range root", malformedInput((value) => {
      firstChord(value).root = 12;
    })],
    ["unsupported quality", malformedInput((value) => {
      firstChord(value).quality = "bad";
    })],
    ["out-of-range bass", malformedInput((value) => {
      firstChord(value).bass = -1;
    })],
    ["invalid label", malformedInput((value) => {
      firstChord(value).label = null;
    })],
  ];
}

function malformedInput(mutate: (value: Record<string, unknown>) => void): unknown {
  const value = structuredClone(inputFor(0, "b9")) as unknown as Record<string, unknown>;
  mutate(value);
  return value;
}

function firstCandidate(value: Record<string, unknown>): Record<string, unknown> {
  return (value.rankedCandidates as Array<Record<string, unknown>>)[0]!;
}

function firstChord(value: Record<string, unknown>): Record<string, unknown> {
  return firstCandidate(value).chord as Record<string, unknown>;
}

function firstEvidence(value: Record<string, unknown>): Record<string, unknown> {
  return (value.noteEvidence as Array<Record<string, unknown>>)[0]!;
}

function hasOnlyFiniteNumbers(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(hasOnlyFiniteNumbers);
  if (typeof value !== "object" || value === null) return true;
  return Object.values(value).every(hasOnlyFiniteNumbers);
}

type MutableInput = {
  -readonly [Key in keyof AlteredTensionsShadowInput]:
    Key extends "rankedCandidates" ? ChordCandidateScore[]
      : Key extends "noteEvidence" ? AlteredTensionNoteEvidence[]
        : AlteredTensionsShadowInput[Key]
};

function evidenceFor(root: number, alteration: AlteredTensionKind): AlteredTensionNoteEvidence[] {
  const alteredInterval = alteration === "b9" ? 1 : 8;
  return [0, 4, 7, 10, alteredInterval].map((interval, index) =>
    note(
      normalizePc(root + interval),
      "harmony",
      index === 4 ? 0 : 1,
      index === 4 ? 4 : 3,
      1,
    ));
}

function note(
  pitchClass: number,
  source: AlteredTensionNoteEvidence["source"],
  onsetBeat: number,
  durationBeats: number,
  weight: number,
): AlteredTensionNoteEvidence {
  return { pitchClass, source, onsetBeat, durationBeats, weight };
}

function score(root: number, quality: ChordQuality, totalScore: number): ChordCandidateScore {
  return {
    chord: makeChordSymbol(root, quality),
    templateScore: totalScore,
    coreCoverageScore: 1,
    extensionCoverageScore: 0,
    bassCompatibilityScore: 0,
    slashCompatibilityScore: 0,
    keyCompatibilityScore: 0,
    foreignNotePenalty: 0,
    missingCoreTonePenalty: 0,
    ambiguityPenalty: 0,
    totalScore,
    evidence: [],
  };
}
