import { describe, expect, it } from "vitest";
import { normalizeChordLabel } from "../chordIdentity";
import type { ObservedNote } from "./shadowEvidence";
import {
  ALTERATION_SLOTS,
  coreIsInvariant,
  defaultTensionDetection,
  shadowTensions,
  slotsFromIdentity,
  type ShadowTensionInput,
  type TimedNote,
} from "./shadowTension";

/**
 * Tensions on their own, with the chord already decided.
 *
 * Two behaviours carry the stage. An interval that belongs to the fixed core is
 * contradicted rather than counted twice, and a note with nothing but presence
 * behind it — the passing tone — is left undetermined rather than asserted.
 */
function note(
  pitch: number, weight = 4, role: ObservedNote["role"] = "harmony", onsetBeat = 0,
): TimedNote {
  return { pitch, weight, role, onsetBeat };
}

function input(
  notes: TimedNote[],
  core: Partial<Pick<ShadowTensionInput, "root" | "bass" | "triad" | "seventh">> = {},
  windowBeats = 4,
): ShadowTensionInput {
  return {
    observation: {
      notes: notes.map((entry) => ({ pitch: entry.pitch, weight: entry.weight, role: entry.role })),
      timedNotes: notes,
      windowBeats,
    },
    root: core.root ?? 0,
    bass: core.bass ?? 0,
    triad: core.triad ?? "major",
    seventh: core.seventh ?? null,
    beatsPerBar: 4,
  };
}

describe("the core is an input and stays put", () => {
  it("returns exactly the core it was given", () => {
    const result = shadowTensions(input([note(60), note(64), note(67)], {
      root: 0, bass: 4, triad: "major", seventh: "major7",
    }));
    expect([result.root, result.bass, result.triad, result.seventh])
      .toEqual([0, 4, "major", "major7"]);
  });

  it("keeps the core under a parameter perturbation", () => {
    const inputs = [
      input([note(60), note(64), note(67), note(62)]),
      input([note(60), note(63), note(67), note(70)], { triad: "minor", seventh: "minor7" }),
      // Deliberately on the threshold: a one-beat melody note on the beat has
      // exactly two supports at scale 1.0 and one at 1.3, so the perturbation
      // provably changes a tension decision. Without a borderline case the
      // invariance result would be vacuous.
      input([note(60), note(64), note(67), note(62, 1, "melody", 0)]),
    ];
    const result = coreIsInvariant(inputs, [0.7, 1.0, 1.3]);

    expect(result.invariant).toBe(true);
    // Without this the invariance is vacuous.
    expect(result.perturbationHadEffect).toBe(true);
  });

  it("keeps the core under a much larger perturbation", () => {
    expect(coreIsInvariant([input([note(60), note(64), note(67), note(62)])], [0.1, 1.0, 10])
      .invariant).toBe(true);
  });
});

describe("an interval that belongs to the core is not a tension", () => {
  it("contradicts the sharp ninth over a minor triad", () => {
    // Three semitones is the minor third. Over a minor triad it is the core.
    const result = shadowTensions(input(
      [note(60), note(63), note(67)], { triad: "minor" },
    ));
    expect(result.contradicted).toContain("#9");
    expect(result.tensions).not.toContain("#9");
  });

  it("allows the sharp ninth over a major triad", () => {
    const result = shadowTensions(input(
      [note(60), note(64), note(67), note(63, 4, "harmony")], { triad: "major" },
    ));
    expect(result.contradicted).not.toContain("#9");
  });

  it("contradicts the ninth over a sus2", () => {
    expect(shadowTensions(input([note(60), note(62), note(67)], { triad: "sus2" }))
      .contradicted).toContain("9");
  });

  it("contradicts the eleventh over a sus4", () => {
    expect(shadowTensions(input([note(60), note(65), note(67)], { triad: "sus4" }))
      .contradicted).toContain("11");
  });

  it("contradicts the sixth when a seventh is in the core", () => {
    // Nine semitones is a thirteenth over a seventh chord, not a sixth.
    const result = shadowTensions(input(
      [note(60), note(64), note(67), note(70), note(69)],
      { seventh: "minor7" },
    ));
    expect(result.contradicted).toContain("6");
    expect(result.contradicted).not.toContain("13");
  });

  it("contradicts the thirteenth when there is no seventh", () => {
    const result = shadowTensions(input([note(60), note(64), note(67), note(69)]));
    expect(result.contradicted).toContain("13");
  });
});

describe("the same interval read two ways", () => {
  it("reads six semitones as a raised eleventh when the fifth sounds", () => {
    const result = shadowTensions(input([note(60), note(64), note(67), note(66)]));
    expect(result.contradicted).toContain("b5");
    expect(result.contradicted).not.toContain("#11");
  });

  it("reads six semitones as a flat fifth when the fifth is absent", () => {
    const result = shadowTensions(input([note(60), note(64), note(66)]));
    expect(result.contradicted).toContain("#11");
    expect(result.contradicted).not.toContain("b5");
  });

  it("reads eight semitones as a flat thirteenth when the fifth sounds", () => {
    const result = shadowTensions(input([note(60), note(64), note(67), note(68)]));
    expect(result.contradicted).toContain("#5");
  });

  it("reads eight semitones as a sharp fifth when the fifth is absent", () => {
    const result = shadowTensions(input([note(60), note(64), note(68)]));
    expect(result.contradicted).toContain("b13");
  });
});

describe("a passing note is not a tension", () => {
  it("leaves a short melody note off the beat undetermined", () => {
    const result = shadowTensions(input([
      note(60), note(64), note(67),
      // An eighth of D in the melody, starting off the beat.
      note(62, 0.5, "melody", 1.5),
    ]));

    expect(result.tensions).not.toContain("9");
    expect(result.underdetermined).toContain("9");
  });

  it("asserts a ninth that is held in the harmony on the beat", () => {
    const result = shadowTensions(input([
      note(60), note(64), note(67), note(62, 4, "harmony", 0),
    ]));
    expect(result.tensions).toContain("9");
  });

  it("does not assert on presence alone", () => {
    // Present, short, off the beat, melody: exactly one support out of four.
    const support = shadowTensions(input([
      note(60), note(64), note(67), note(62, 0.2, "melody", 2.5),
    ])).supports.find((entry) => entry.slot === "9")!;

    expect(support.presenceSupport).toBe(true);
    expect(support.supportCount).toBeLessThan(defaultTensionDetection.supportsRequired);
    expect(support.verdict).toBe("underdetermined");
  });

  it("records the four supports separately", () => {
    const support = shadowTensions(input([
      note(60), note(64), note(67), note(62, 4, "harmony", 0),
    ])).supports.find((entry) => entry.slot === "9")!;

    expect(support.durationSupport).toBeGreaterThan(0);
    expect(support.metricPositionSupport).toBe(true);
    expect(support.voiceRoleSupport).toBe("harmony");
    expect(support.sustainedSupport).toBe(true);
  });

  it("discounts a melody-only note on duration", () => {
    const asMelody = shadowTensions(input([
      note(60), note(64), note(67), note(62, 2, "melody", 0),
    ])).supports.find((entry) => entry.slot === "9")!;
    const asHarmony = shadowTensions(input([
      note(60), note(64), note(67), note(62, 2, "harmony", 0),
    ])).supports.find((entry) => entry.slot === "9")!;

    expect(asMelody.durationSupport).toBeLessThan(asHarmony.durationSupport);
  });

  it("never asserts a tension on a plain triad with nothing else sounding", () => {
    // The false-addition case: a plain triad must gain nothing.
    expect(shadowTensions(input([note(60), note(64), note(67)])).tensions).toEqual([]);
  });
});

describe("tensions are not made exclusive", () => {
  it("asserts a ninth and a thirteenth together", () => {
    // A seventh has to be in the core for nine semitones to read as a
    // thirteenth; without it the same note is a sixth.
    const result = shadowTensions(input([
      note(60), note(64), note(67), note(70),
      note(62, 4, "harmony", 0), note(69, 4, "harmony", 0),
    ], { seventh: "minor7" }));

    expect(result.tensions).toContain("9");
    expect(result.tensions).toContain("13");
  });
});

describe("bridging to the identity model", () => {
  it("reads extensions and alterations as slots", () => {
    const identity = normalizeChordLabel("C7(b9)")!;
    expect(slotsFromIdentity(identity.extensions, identity.alterations)).toContain("b9");
  });

  it("reads a plain ninth", () => {
    const identity = normalizeChordLabel("Cmaj9")!;
    expect(slotsFromIdentity(identity.extensions, identity.alterations)).toContain("9");
  });

  it("reads a sixth", () => {
    const identity = normalizeChordLabel("C6")!;
    expect(slotsFromIdentity(identity.extensions, identity.alterations)).toContain("6");
  });

  it("knows which slots are alterations", () => {
    expect(ALTERATION_SLOTS.has("b9")).toBe(true);
    expect(ALTERATION_SLOTS.has("9")).toBe(false);
  });
});

describe("determinism", () => {
  it("gives the same result three times over", () => {
    const one = input([note(60), note(64), note(67), note(62, 4, "harmony", 0)]);
    const first = JSON.stringify(shadowTensions(one));
    expect(JSON.stringify(shadowTensions(one))).toBe(first);
    expect(JSON.stringify(shadowTensions(one))).toBe(first);
  });

  it("survives an empty window", () => {
    expect(shadowTensions(input([])).tensions).toEqual([]);
  });
});
