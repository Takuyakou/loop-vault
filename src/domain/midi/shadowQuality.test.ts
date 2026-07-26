import { describe, expect, it } from "vitest";
import { chordIdentityKey, normalizeChordLabel } from "../chordIdentity";
import type { ChordObservation, ObservedNote } from "./shadowEvidence";
import {
  defaultQualityScoring,
  identitiesMatch,
  rootAndBassAreInvariant,
  scaleQualityScoring,
  shadowIdentity,
  shadowQuality,
} from "./shadowQuality";

/**
 * Choosing a quality for a root that is already decided.
 *
 * The behaviour under test is mostly a refusal: a candidate whose defining tone
 * nobody plays must survive, because the root research closed on the finding
 * that eliminating on absence is what makes a detector confident about chords it
 * has no evidence for.
 */
function note(pitch: number, weight = 4, role: ObservedNote["role"] = "harmony"): ObservedNote {
  return { pitch, weight, role };
}

const observe = (notes: ObservedNote[], windowBeats = 4): ChordObservation => (
  { notes, windowBeats }
);

/** C E G over a C bass. */
const cMajor = observe([note(36, 4, "bass"), note(60), note(64), note(67)]);
/** C Eb G. */
const cMinor = observe([note(36, 4, "bass"), note(60), note(63), note(67)]);
/** C E G Bb. */
const cDominant = observe([note(36, 4, "bass"), note(60), note(64), note(67), note(70)]);
/** C E G B. */
const cMajorSeventh = observe([note(36, 4, "bass"), note(60), note(64), note(67), note(71)]);
/** C and G only: no third anywhere. */
const cNoThird = observe([note(36, 4, "bass"), note(60), note(67)]);

describe("root and bass are inputs, never outputs", () => {
  it("returns exactly the root and bass it was given", () => {
    const result = shadowQuality({ observation: cMajor, root: 0, bass: 4 });
    expect(result.root).toBe(0);
    expect(result.bass).toBe(4);
  });

  it("keeps them whatever the evidence says", () => {
    // G is the strongest thing in the low register here, and the root stays C
    // because the root research is closed and this stage does not reopen it.
    const gInBass = observe([note(43, 4, "bass"), note(60), note(64), note(67)]);
    const result = shadowQuality({ observation: gInBass, root: 0, bass: 7 });

    expect(result.root).toBe(0);
    expect(result.bass).toBe(7);
  });

  it("keeps them under a quality parameter perturbation", () => {
    const inputs = [cMajor, cMinor, cDominant, cNoThird].map((observation) => ({
      observation, root: 0, bass: 0,
    }));
    const result = rootAndBassAreInvariant(inputs, [0.7, 1.0, 1.3]);

    expect(result.invariant).toBe(true);
    // Without this the invariance is vacuous: perturbing a parameter nothing
    // reads would "prove" it for any implementation.
    expect(result.perturbationHadEffect).toBe(true);
  });

  it("keeps them under a much larger perturbation", () => {
    const inputs = [cMajor, cNoThird].map((observation) => ({
      observation, root: 0, bass: 0,
    }));
    expect(rootAndBassAreInvariant(inputs, [0.1, 1.0, 10]).invariant).toBe(true);
  });
});

describe("absence never eliminates", () => {
  it("keeps major and minor alive when no third sounds", () => {
    const result = shadowQuality({ observation: cNoThird, root: 0, bass: 0 });
    const eliminated = new Set(result.eliminatedByContradiction);

    expect(eliminated.has("triad:major")).toBe(false);
    expect(eliminated.has("triad:minor")).toBe(false);
    expect(result.survivingUnderdetermined).toContain("triad:major");
    expect(result.survivingUnderdetermined).toContain("triad:minor");
  });

  it("says so when nothing was positively supported", () => {
    const sparse = shadowQuality({ observation: observe([note(60)]), root: 0, bass: 0 });
    expect(sparse.triadUnsupported).toBe(true);
  });

  it("still picks something rather than refusing outright", () => {
    const result = shadowQuality({ observation: cNoThird, root: 0, bass: 0 });
    // Root and fifth with no third is a power chord, which is what is actually
    // supported. Naming it major would be asserting a third nobody played.
    expect(result.triad).toBe("power");
  });
});

describe("only a contradiction eliminates", () => {
  it("eliminates minor when a major third sounds", () => {
    const result = shadowQuality({ observation: cMajor, root: 0, bass: 0 });
    expect(result.eliminatedByContradiction).toContain("triad:minor");
    expect(result.triad).toBe("major");
  });

  it("eliminates major when a minor third sounds", () => {
    const result = shadowQuality({ observation: cMinor, root: 0, bass: 0 });
    expect(result.eliminatedByContradiction).toContain("triad:major");
    expect(result.triad).toBe("minor");
  });

  it("eliminates the major seventh when a minor seventh sounds", () => {
    const result = shadowQuality({ observation: cDominant, root: 0, bass: 0 });
    expect(result.eliminatedByContradiction).toContain("seventh:major7");
    expect(result.seventh).toBe("minor7");
  });

  it("eliminates 'no seventh' when a seventh sounds", () => {
    // "No seventh" is a claim, not a default: a seventh sounding refutes it.
    expect(shadowQuality({ observation: cDominant, root: 0, bass: 0 })
      .eliminatedByContradiction).toContain("seventh:none");
    expect(shadowQuality({ observation: cMajorSeventh, root: 0, bass: 0 })
      .eliminatedByContradiction).toContain("seventh:none");
  });

  it("supports 'no seventh' when the triad is complete and nothing above it sounds", () => {
    const result = shadowQuality({ observation: cMajor, root: 0, bass: 0 });
    expect(result.seventh).toBeNull();
    expect(result.seventhCandidates.find((candidate) => candidate.value === null)?.verdict)
      .toBe("supported");
  });

  it("leaves 'no seventh' undetermined when the triad is incomplete", () => {
    expect(shadowQuality({ observation: observe([note(60)]), root: 0, bass: 0 })
      .seventhCandidates.find((candidate) => candidate.value === null)?.verdict)
      .toBe("underdetermined");
  });

  it("finds the major seventh", () => {
    expect(shadowQuality({ observation: cMajorSeventh, root: 0, bass: 0 }).seventh)
      .toBe("major7");
  });
});

describe("comparison stays inside one root", () => {
  it("gives a different quality for the same notes under a different root", () => {
    // Same notes, told a different root: the answer must be about that root
    // rather than about which root fits best.
    const asC = shadowQuality({ observation: cMajor, root: 0, bass: 0 });
    const asA = shadowQuality({ observation: cMajor, root: 9, bass: 0 });

    expect(asC.root).toBe(0);
    expect(asA.root).toBe(9);
    expect(asA.triad).not.toBe("major");
  });
});

describe("identity", () => {
  it("takes tensions from the product and the triad from the shadow", () => {
    const product = normalizeChordLabel("Cmaj9")!;
    const quality = shadowQuality({ observation: cDominant, root: 0, bass: 0 });
    const identity = shadowIdentity(quality, product);

    // Tension detection is untouched by F3a, so the 9 survives; the seventh is
    // the shadow's.
    expect(identity.extensions).toEqual(product.extensions);
    expect(identity.seventh).toBe("minor7");
  });

  it("carries a slash bass through", () => {
    const product = normalizeChordLabel("Cmaj7/E")!;
    const identity = shadowIdentity(
      shadowQuality({ observation: cMajorSeventh, root: 0, bass: 4 }),
      product,
    );
    expect(identity.bassPitchClass).toBe(4);
  });

  it("matches the product exactly on a plain major seventh", () => {
    const product = normalizeChordLabel("Cmaj7")!;
    const identity = shadowIdentity(
      shadowQuality({ observation: cMajorSeventh, root: 0, bass: 0 }),
      product,
    );
    expect(identitiesMatch(identity, product)).toBe(true);
    expect(chordIdentityKey(identity)).toBe(chordIdentityKey(product));
  });
});

describe("determinism", () => {
  it("gives the same quality three times over", () => {
    const input = { observation: cDominant, root: 0, bass: 0 };
    const first = JSON.stringify(shadowQuality(input));
    expect(JSON.stringify(shadowQuality(input))).toBe(first);
    expect(JSON.stringify(shadowQuality(input))).toBe(first);
  });

  it("scales its parameters without changing their shape", () => {
    expect(Object.keys(scaleQualityScoring(defaultQualityScoring, 2)))
      .toEqual(Object.keys(defaultQualityScoring));
  });
});
