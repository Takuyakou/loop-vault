import type { NormalizedChordIdentity } from "../../src/domain/chordIdentity";
import { identityWithoutBass } from "./missingCandidateTaxonomy";

export type CounterfactualChangeCategory =
  | "correct-new-rank1"
  | "incorrect-new-rank1"
  | "canonical-equivalent-change"
  | "tie-break-only"
  | "root-changed"
  | "plain-stolen-by-altered"
  | "quality-only-change"
  | "tension-only-change"
  | "slash-only-change";

export interface CounterfactualChangeInput {
  before: NormalizedChordIdentity;
  after: NormalizedChordIdentity;
  expected: NormalizedChordIdentity | null;
  beforeScore: number;
  afterScore: number;
}

export function classifyCounterfactualChange(
  input: CounterfactualChangeInput,
): CounterfactualChangeCategory[] {
  const categories: CounterfactualChangeCategory[] = [];
  if (input.expected && equalIdentity(input.after, input.expected)) {
    categories.push("correct-new-rank1");
  } else {
    categories.push("incorrect-new-rank1");
  }
  if (equalIdentity(input.before, input.after)) {
    categories.push("canonical-equivalent-change");
  }
  if (input.beforeScore === input.afterScore) categories.push("tie-break-only");
  if (input.before.rootPitchClass !== input.after.rootPitchClass) {
    categories.push("root-changed");
  }
  if (input.before.alterations.length === 0 && input.after.alterations.length > 0) {
    categories.push("plain-stolen-by-altered");
  }
  if (input.before.rootPitchClass === input.after.rootPitchClass
    && (input.before.triad !== input.after.triad
      || input.before.seventh !== input.after.seventh)) {
    categories.push("quality-only-change");
  }
  if (sameCore(input.before, input.after)
    && (input.before.extensions.join(".") !== input.after.extensions.join(".")
      || input.before.alterations.join(".") !== input.after.alterations.join("."))) {
    categories.push("tension-only-change");
  }
  if (identityWithoutBass(input.before) === identityWithoutBass(input.after)
    && input.before.bassPitchClass !== input.after.bassPitchClass) {
    categories.push("slash-only-change");
  }
  return categories;
}

function sameCore(
  left: NormalizedChordIdentity,
  right: NormalizedChordIdentity,
) {
  return left.rootPitchClass === right.rootPitchClass
    && left.triad === right.triad
    && left.seventh === right.seventh;
}

function equalIdentity(
  left: NormalizedChordIdentity,
  right: NormalizedChordIdentity,
) {
  return identityWithoutBass(left) === identityWithoutBass(right)
    && left.bassPitchClass === right.bassPitchClass;
}
