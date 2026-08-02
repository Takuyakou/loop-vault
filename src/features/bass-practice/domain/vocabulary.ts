import type {
  DegreeValue,
  DegreeVocabularyId,
} from "./types";

export interface DegreeVocabulary {
  readonly id: DegreeVocabularyId;
  readonly minimumLevel: 1 | 2 | 3;
  readonly degreeSequence: readonly DegreeValue[];
  readonly kind: "diatonic" | "chromatic-approach";
  readonly approachTarget?: 1 | 3 | 5;
}

const degree = (
  value: DegreeValue["degree"],
  accidental: DegreeValue["accidental"] = 0,
  octave = 0,
): DegreeValue => Object.freeze({ degree: value, accidental, octave });

export const DEGREE_VOCABULARIES: Readonly<Record<DegreeVocabularyId, DegreeVocabulary>> =
  deepFreeze({
    "tonic-single": {
      id: "tonic-single",
      minimumLevel: 1,
      degreeSequence: [degree(1)],
      kind: "diatonic",
    },
    "tonic-dominant": {
      id: "tonic-dominant",
      minimumLevel: 1,
      degreeSequence: [degree(1), degree(5)],
      kind: "diatonic",
    },
    "tonic-dominant-octave": {
      id: "tonic-dominant-octave",
      minimumLevel: 1,
      degreeSequence: [degree(1), degree(5), degree(1, 0, 1)],
      kind: "diatonic",
    },
    "minor-color-cadence": {
      id: "minor-color-cadence",
      minimumLevel: 2,
      degreeSequence: [degree(1), degree(3, -1), degree(4), degree(5)],
      kind: "diatonic",
    },
    "tonic-dominant-mixolydian": {
      id: "tonic-dominant-mixolydian",
      minimumLevel: 2,
      degreeSequence: [degree(1), degree(5), degree(6), degree(7, -1)],
      kind: "diatonic",
    },
    "ascending-minor-color": {
      id: "ascending-minor-color",
      minimumLevel: 2,
      degreeSequence: [degree(1), degree(2), degree(3, -1), degree(5)],
      kind: "diatonic",
    },
    "dominant-octave-resolution": {
      id: "dominant-octave-resolution",
      minimumLevel: 2,
      degreeSequence: [degree(5), degree(7, -1), degree(1, 0, 1)],
      kind: "diatonic",
    },
    "chromatic-approach-1": {
      id: "chromatic-approach-1",
      minimumLevel: 3,
      degreeSequence: [degree(1, -1), degree(1)],
      kind: "chromatic-approach",
      approachTarget: 1,
    },
    "chromatic-approach-3": {
      id: "chromatic-approach-3",
      minimumLevel: 3,
      degreeSequence: [degree(3, -1), degree(3)],
      kind: "chromatic-approach",
      approachTarget: 3,
    },
    "chromatic-approach-5": {
      id: "chromatic-approach-5",
      minimumLevel: 3,
      degreeSequence: [degree(5, -1), degree(5)],
      kind: "chromatic-approach",
      approachTarget: 5,
    },
  });

export function degreeVocabulary(id: DegreeVocabularyId): DegreeVocabulary {
  return DEGREE_VOCABULARIES[id];
}

export function isDegreeVocabularyId(value: string): value is DegreeVocabularyId {
  return Object.prototype.hasOwnProperty.call(DEGREE_VOCABULARIES, value);
}

export function vocabularyMatchesSequence(
  id: DegreeVocabularyId,
  sequence: readonly DegreeValue[],
): boolean {
  const expected = DEGREE_VOCABULARIES[id].degreeSequence;
  return sequence.length === expected.length && sequence.every((value, index) => (
    sameDegree(value, expected[index])
  ));
}

export function isConstrainedChromaticApproach(
  vocabulary: DegreeVocabulary,
): boolean {
  if (vocabulary.kind !== "chromatic-approach") return true;
  const target = vocabulary.degreeSequence[vocabulary.degreeSequence.length - 1];
  const approach = vocabulary.degreeSequence[vocabulary.degreeSequence.length - 2];
  if (!target || !approach || !vocabulary.approachTarget) return false;
  const targetDegree = target.degree;
  if (![1, 3, 5].includes(targetDegree) || targetDegree !== vocabulary.approachTarget) {
    return false;
  }
  return approach.degree === target.degree
    && approach.accidental === -1
    && target.accidental === 0
    && target.octave === approach.octave;
}

function sameDegree(left: DegreeValue, right: DegreeValue): boolean {
  return left.degree === right.degree
    && left.accidental === right.accidental
    && left.octave === right.octave;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
