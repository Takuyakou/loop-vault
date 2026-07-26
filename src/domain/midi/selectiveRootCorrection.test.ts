import { describe, expect, it } from "vitest";
import type { ChordObservation, ObservedNote } from "./shadowEvidence";
import {
  correctedRoot,
  isPlainTriad,
  preregisteredThresholds,
  proposeRootCorrection,
  proposeRootCorrections,
} from "./selectiveRootCorrection";

/**
 * Proposing a different root, rarely.
 *
 * The behaviour that matters most is the one that does nothing: abstaining is
 * the expected outcome, and every condition has to be able to stop a proposal on
 * its own. Stage F2 measured the shadow root as worse than the product's
 * overall, so a rule that fires often would import that deficit no matter how
 * good its reasoning looked.
 */
function note(pitch: number, weight = 4, role: ObservedNote["role"] = "harmony"): ObservedNote {
  return { pitch, weight, role };
}

const observe = (notes: ObservedNote[], windowBeats = 4): ChordObservation => (
  { notes, windowBeats }
);

/** C E G over a C bass. */
const plainC = observe([note(36, 4, "bass"), note(60), note(64), note(67)]);
/** E G B over a D pedal. */
const dPedalUnderEm = observe([note(38, 4, "bass"), note(64), note(67), note(71)]);

describe("the product's root is the default", () => {
  it("keeps the product's root when it abstains", () => {
    const proposal = proposeRootCorrection({ observation: plainC, productRoot: 0 });
    expect(correctedRoot(proposal)).toBe(0);
    expect(proposal.primaryRoot).toBe(0);
  });

  it("abstains when the product has no root to argue with", () => {
    const proposal = proposeRootCorrection({ observation: plainC, productRoot: undefined });
    expect(proposal.abstained).toBe(true);
    expect(proposal.abstentionReason).toBe("no-product-root");
  });
});

describe("scope", () => {
  it("leaves plain triads alone", () => {
    const proposal = proposeRootCorrection({ observation: plainC, productRoot: 0 });
    expect(proposal.abstained).toBe(true);
    expect(proposal.abstentionReason).toBe("plain-triad");
  });

  it("recognises a plain triad from the notes, not from a label", () => {
    expect(isPlainTriad(plainC, 0)).toBe(true);
    // A seventh makes it not a plain triad.
    expect(isPlainTriad(observe([note(36, 4, "bass"), note(60), note(64), note(67), note(70)]), 0))
      .toBe(false);
    // An inversion is not a plain triad either: the bass is not the root.
    expect(isPlainTriad(observe([note(40, 4, "bass"), note(60), note(64), note(67)]), 0))
      .toBe(false);
  });

  it("refuses to touch a walking bass", () => {
    const walking = observe([
      note(36, 1, "bass"), note(38, 1, "bass"), note(40, 1, "bass"), note(41, 1, "bass"),
      note(60), note(64), note(67),
    ]);
    const proposal = proposeRootCorrection({ observation: walking, productRoot: 0 });

    // Stage F2 measured walking's shadow Top 3 at 60.9%: the candidate set is
    // unreliable, so a rule built on it would be guessing. Stage F2W owns it.
    expect(proposal.abstained).toBe(true);
    expect(proposal.abstentionReason).toBe("relation-out-of-scope");
  });
});

describe("each condition can stop a proposal on its own", () => {
  it("stops when the relation is not confident enough", () => {
    const thin = observe([note(38, 0.05, "bass"), note(64), note(67), note(71)]);
    const proposal = proposeRootCorrection({ observation: thin, productRoot: 2 });

    expect(proposal.abstained).toBe(true);
    expect(["relation-confidence-too-low", "not-contested", "incumbent-not-contradicted"])
      .toContain(proposal.abstentionReason);
  });

  it("stops when the incumbent is clearly ahead rather than contested", () => {
    // The product says E, which the evidence backs strongly; nothing is close.
    const proposal = proposeRootCorrection({ observation: dPedalUnderEm, productRoot: 4 });
    expect(proposal.abstained).toBe(true);
  });

  it("stops when the incumbent is merely undetermined rather than contradicted", () => {
    // Root and fifth only: neither third sounds, so no quality is denied.
    // "Underdetermined" must not be treated as a reason to overturn anything —
    // that is the whole point of the F1 three-way verdict.
    const noThird = observe([note(36, 4, "bass"), note(60), note(67)]);
    const proposal = proposeRootCorrection({ observation: noThird, productRoot: 0 });

    expect(proposal.abstained).toBe(true);
    expect(proposal.abstentionReason).not.toBe(null);
  });

  it("records which condition stopped it", () => {
    const reasons = new Set(
      [plainC, dPedalUnderEm, observe([])].map(
        (observation) => proposeRootCorrection({ observation, productRoot: 0 }).abstentionReason,
      ),
    );
    // Not one undifferentiated "abstained" flag: an abstention rate is
    // uninterpretable without knowing which gate is doing the work.
    expect(reasons.size).toBeGreaterThan(1);
  });
});

describe("when it does propose", () => {
  /**
   * A pedal where the incumbent is not sounding at all.
   *
   * G in the bass under a C major triad, with the product having named G. G is
   * present, so this is built to make the incumbent absent instead: the product
   * names D, which nothing plays.
   */
  const pedalWithAbsentIncumbent = observe([
    note(43, 4, "bass"), note(60), note(64), note(67),
  ]);

  it("never proposes a root outside the known candidate set", () => {
    const proposal = proposeRootCorrection({
      observation: pedalWithAbsentIncumbent,
      productRoot: 1,
    });
    if (!proposal.abstained) {
      const known = new Set([
        ...proposal.shadow.top3.map((candidate) => candidate.pitchClass),
        proposal.shadow.bassTop1,
      ]);
      expect(known.has(proposal.proposedRoot!)).toBe(true);
    }
  });

  it("labels the case it acted on", () => {
    for (const observation of [dPedalUnderEm, pedalWithAbsentIncumbent]) {
      const proposal = proposeRootCorrection({ observation, productRoot: 1 });
      if (!proposal.abstained) {
        expect(["pedal-slash", "inversion"]).toContain(proposal.caseKind);
      }
    }
  });

  it("only ever proposes one alternative, never a rewrite", () => {
    const proposal = proposeRootCorrection({ observation: dPedalUnderEm, productRoot: 1 });
    expect(proposal.primaryRoot).toBe(1);
    if (!proposal.abstained) expect(proposal.proposedRoot).not.toBe(1);
  });
});

describe("thresholds", () => {
  it("uses the pre-registered values by default", () => {
    expect(preregisteredThresholds).toEqual({
      contestBand: 0.05,
      relationMarginFloor: 0.25,
      bassEvidenceFloor: 0.5,
      bassMarginFloor: 0.5,
    });
  });

  it("abstains more as the thresholds tighten", () => {
    const observations = [plainC, dPedalUnderEm, observe([note(43, 4, "bass"), note(60), note(64)])];
    const inputs = observations.map((observation) => ({ observation, productRoot: 1 }));

    const loose = proposeRootCorrections(inputs, {
      thresholds: { ...preregisteredThresholds, contestBand: 1, relationMarginFloor: 0 },
    });
    const tight = proposeRootCorrections(inputs, {
      thresholds: { ...preregisteredThresholds, contestBand: 0, relationMarginFloor: 1 },
    });

    expect(tight.filter((proposal) => proposal.abstained).length)
      .toBeGreaterThanOrEqual(loose.filter((proposal) => proposal.abstained).length);
    expect(tight.every((proposal) => proposal.abstained)).toBe(true);
  });
});

describe("determinism", () => {
  it("gives the same proposals three times over", () => {
    const inputs = [
      { observation: plainC, productRoot: 0 },
      { observation: dPedalUnderEm, productRoot: 2 },
    ];
    const first = JSON.stringify(proposeRootCorrections(inputs));

    expect(JSON.stringify(proposeRootCorrections(inputs))).toBe(first);
    expect(JSON.stringify(proposeRootCorrections(inputs))).toBe(first);
  });
});
