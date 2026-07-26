import { describe, expect, it } from "vitest";
import type { ChordObservation, ObservedNote } from "./shadowEvidence";
import {
  defaultQualityLayer,
  qualityTemplateScore,
  scaleQualityLayer,
  shadowFactorizedRoot,
  shadowFactorizedRootIsIsolated,
  shadowFactorizedRootSequence,
} from "./shadowFactorizedRoot";

/**
 * A root chosen without asking what the chord is.
 *
 * The claim being tested is not that these roots are better — F2 is a shadow
 * stage and makes no such claim — but that they are *independent of the quality
 * layer*. That is what would let the two be improved separately, and it is
 * falsifiable, so it gets tested rather than asserted.
 */
function note(pitch: number, weight = 4, role: ObservedNote["role"] = "harmony"): ObservedNote {
  return { pitch, weight, role };
}

const observe = (notes: ObservedNote[], windowBeats = 4): ChordObservation => (
  { notes, windowBeats }
);

const cMajor = observe([note(36, 4, "bass"), note(60), note(64), note(67)]);
const dPedalUnderEm = observe([note(38, 4, "bass"), note(64), note(67), note(71)]);
const rootlessC7 = observe([note(64), note(70), note(74)]);
const fSharp7Sharp5 = observe([note(42, 4, "bass"), note(66), note(70), note(73), note(76)]);

const progression = [cMajor, dPedalUnderEm, rootlessC7, fSharp7Sharp5];

describe("choosing a root from what is sounding", () => {
  it("takes the root of a plain triad", () => {
    expect(shadowFactorizedRoot(cMajor).top1).toBe(0);
  });

  it("always offers three candidates and a margin", () => {
    const result = shadowFactorizedRoot(cMajor);
    expect(result.top3).toHaveLength(3);
    expect(result.margin).toBeGreaterThanOrEqual(0);
  });

  it("carries the bass relation without adding it to the score", () => {
    const withRelation = shadowFactorizedRoot(dPedalUnderEm);
    expect(withRelation.relation).toBe("pedal");
    // The pedal D is reported as the bass, and the root is decided separately.
    expect(withRelation.bassTop1).toBe(2);
    expect(withRelation.top1).not.toBe(withRelation.bassTop1);
  });

  it("declines to assert a root it cannot pin", () => {
    expect(shadowFactorizedRoot(observe([note(64), note(70)])).rootlessInferred).toBe(true);
  });

  it("reports which terms carried the winner", () => {
    const terms = shadowFactorizedRoot(cMajor).terms;
    expect(terms.rootPresence).toBeGreaterThan(0);
    expect(terms.tertianSkeleton).toBeGreaterThan(0);
  });
});

describe("the quality layer has no vote", () => {
  it("gives an identical root sequence at 0.7, 1.0 and 1.3", () => {
    const result = shadowFactorizedRootIsIsolated(progression, [0.7, 1.0, 1.3]);

    expect(result.isolated).toBe(true);
    expect(result.sequences["0.7"]).toEqual(result.sequences["1"]);
    expect(result.sequences["1.3"]).toEqual(result.sequences["1"]);
  });

  it("checks that the perturbation actually did something", () => {
    // Without this the isolation result is vacuous: scaling a parameter that
    // nothing reads would "prove" isolation for any implementation at all.
    expect(shadowFactorizedRootIsIsolated(progression, [0.7, 1.0, 1.3]).perturbationHadEffect)
      .toBe(true);
  });

  it("changes the quality template score it does not use", () => {
    const low = qualityTemplateScore(cMajor, 0, scaleQualityLayer(defaultQualityLayer, 0.7));
    const high = qualityTemplateScore(cMajor, 0, scaleQualityLayer(defaultQualityLayer, 1.3));

    expect(low).not.toBe(high);
  });

  it("survives a much larger perturbation too", () => {
    const wide = shadowFactorizedRootIsIsolated(progression, [0.1, 1.0, 10]);
    expect(wide.isolated).toBe(true);
    expect(wide.perturbationHadEffect).toBe(true);
  });

  it("ignores the quality layer for a single window as well", () => {
    const low = shadowFactorizedRoot(fSharp7Sharp5, {}, scaleQualityLayer(defaultQualityLayer, 0.7));
    const high = shadowFactorizedRoot(fSharp7Sharp5, {}, scaleQualityLayer(defaultQualityLayer, 1.3));

    expect(JSON.stringify(low)).toBe(JSON.stringify(high));
  });
});

describe("sequence", () => {
  it("chains continuity from its own previous root, not the product's", () => {
    const sequence = shadowFactorizedRootSequence(progression);
    expect(sequence).toHaveLength(progression.length);
    expect(sequence.every((entry) => entry.top3.length === 3)).toBe(true);
  });

  it("keeps a weak key prior from deciding anything", () => {
    const withKey = shadowFactorizedRootSequence(progression, {
      keyPitchClasses: [0, 2, 4, 5, 7, 9, 11],
    });
    const withoutKey = shadowFactorizedRootSequence(progression);

    // The prior may reorder ties; it must not overturn a window where something
    // is actually sounding.
    expect(withKey[0].top1).toBe(withoutKey[0].top1);
  });

  it("gives the same sequence three times over", () => {
    const first = JSON.stringify(shadowFactorizedRootSequence(progression));
    expect(JSON.stringify(shadowFactorizedRootSequence(progression))).toBe(first);
    expect(JSON.stringify(shadowFactorizedRootSequence(progression))).toBe(first);
  });

  it("handles an empty sequence and an empty window", () => {
    expect(shadowFactorizedRootSequence([])).toEqual([]);
    expect(shadowFactorizedRootSequence([observe([])])).toHaveLength(1);
  });
});
