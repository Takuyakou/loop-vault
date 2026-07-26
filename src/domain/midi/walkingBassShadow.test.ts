import { describe, expect, it } from "vitest";
import {
  bassWeightingVariants,
  compareVariants,
  looksLikeWalkingBass,
  rankRootCandidates,
  reweightForVariant,
  type TimedObservedNote,
  type WalkingObservation,
} from "./walkingBassShadow";

/**
 * Candidate generation under a walking bass.
 *
 * The fixture is the shape Stage F2 failed on: a C major chord held above a bass
 * that walks C-D-E-F. Three of the four bass notes are not the root, and under
 * duration weighting they outvote it.
 */
function bass(pitch: number, onsetBeat: number, weight = 1): TimedObservedNote {
  return { pitch, onsetBeat, weight, role: "bass" };
}

function harmony(pitch: number, onsetBeat = 0, weight = 4): TimedObservedNote {
  return { pitch, onsetBeat, weight, role: "harmony" };
}

function walking(timedNotes: TimedObservedNote[], windowBeats = 4): WalkingObservation {
  return {
    timedNotes,
    notes: timedNotes.map((note) => ({ pitch: note.pitch, weight: note.weight, role: note.role })),
    windowBeats,
    beatsPerBar: 4,
  };
}

/** C major above a bass walking C - D - E - F. */
const walkingOverC = walking([
  bass(36, 0), bass(38, 1), bass(40, 2), bass(41, 3),
  harmony(60), harmony(64), harmony(67),
]);

/** The same chord with a bass that stays put. */
const staticOverC = walking([
  bass(36, 0, 4), harmony(60), harmony(64), harmony(67),
]);

describe("identifying a walking bass without asking the relation classifier", () => {
  it("recognises a bass that moves through several notes", () => {
    expect(looksLikeWalkingBass(walkingOverC)).toBe(true);
  });

  it("does not call a held bass walking", () => {
    expect(looksLikeWalkingBass(staticOverC)).toBe(false);
  });

  it("does not call two low notes walking", () => {
    expect(looksLikeWalkingBass(walking([
      bass(36, 0, 2), bass(38, 2, 2), harmony(60), harmony(64), harmony(67),
    ]))).toBe(false);
  });

  it("does not call a bass slower than the harmony walking", () => {
    // Defining the subset by Stage F1's own classifier would make the
    // measurement circular, so this is derived from the notes instead.
    expect(looksLikeWalkingBass(walking([
      bass(36, 0, 2), bass(38, 2, 2),
      harmony(60, 0, 1), harmony(64, 1, 1), harmony(67, 2, 1), harmony(72, 3, 1),
    ]))).toBe(false);
  });
});

describe("the variants", () => {
  it("offers all six", () => {
    expect(bassWeightingVariants).toHaveLength(6);
  });

  it("leaves the notes alone under `current`", () => {
    expect(reweightForVariant(walkingOverC, "current"))
      .toEqual(walkingOverC.notes);
  });

  it("never touches the upper voices", () => {
    for (const variant of bassWeightingVariants) {
      const reweighted = reweightForVariant(walkingOverC, variant);
      const upper = reweighted.filter((note) => note.pitch >= 60);
      // Reweighting the harmony would change the question from "which bass notes
      // count" to "which notes count".
      expect(upper.map((note) => note.weight)).toEqual([4, 4, 4]);
    }
  });

  it("keeps the downbeat and demotes the rest under `strong-beat`", () => {
    const reweighted = reweightForVariant(walkingOverC, "strong-beat");
    const low = reweighted.filter((note) => note.pitch < 60);

    expect(low[0].weight).toBe(1);        // beat 1
    expect(low[1].weight).toBeLessThan(1); // beat 2
    expect(low[2].weight).toBe(1);        // beat 3, the half-bar
    expect(low[3].weight).toBeLessThan(1); // beat 4
  });

  it("attenuates a stepwise weak-beat note under `passing-tone-attenuated`", () => {
    const reweighted = reweightForVariant(walkingOverC, "passing-tone-attenuated");
    const low = reweighted.filter((note) => note.pitch < 60);

    // D on beat 2 is stepped into and out of, and short.
    expect(low[1].weight).toBeLessThan(1);
    // C on beat 1 is on a strong beat and is left alone.
    expect(low[0].weight).toBe(1);
  });

  it("does not attenuate a stepwise note that arrives on a strong beat", () => {
    const stepwiseOnBeat = walking([
      bass(36, 0, 2), bass(38, 2, 2), harmony(60), harmony(64), harmony(67),
    ]);
    const reweighted = reweightForVariant(stepwiseOnBeat, "passing-tone-attenuated");

    // A genuine chord change that happens to be stepwise must survive.
    expect(reweighted.filter((note) => note.pitch < 60).every((note) => note.weight === 2))
      .toBe(true);
  });

  it("attenuates in proportion to how much faster the bass moves", () => {
    const fast = reweightForVariant(walkingOverC, "faster-than-harmony-attenuated");
    const still = reweightForVariant(staticOverC, "faster-than-harmony-attenuated");

    expect(fast.filter((note) => note.pitch < 60)[0].weight).toBeLessThan(1);
    expect(still.filter((note) => note.pitch < 60)[0].weight).toBe(4);
  });

  it("prefers notes at the edges under `chord-boundary-preferred`", () => {
    const reweighted = reweightForVariant(walkingOverC, "chord-boundary-preferred");
    const low = reweighted.filter((note) => note.pitch < 60);

    expect(low[0].weight).toBe(1);
    expect(low[1].weight).toBeLessThan(low[0].weight);
  });

  it("weights by length under `long-duration`", () => {
    const uneven = walking([
      bass(36, 0, 0.5), bass(38, 0.5, 0.5), bass(40, 1, 3),
      harmony(60), harmony(64), harmony(67),
    ]);
    const reweighted = reweightForVariant(uneven, "long-duration");
    const low = reweighted.filter((note) => note.pitch < 60);

    expect(low[2].weight).toBeGreaterThan(low[0].weight);
  });
});

describe("candidate ranking", () => {
  it("ranks all twelve and reports entropy", () => {
    const ranking = rankRootCandidates(walkingOverC.notes, 4);
    expect(ranking.ranked).toHaveLength(12);
    expect(ranking.entropy).toBeGreaterThan(0);
  });

  it("gives lower entropy when the evidence names one candidate", () => {
    const peaked = rankRootCandidates(staticOverC.notes, 4).entropy;
    const flat = rankRootCandidates(walkingOverC.notes, 4).entropy;

    // A variant that raises recall by flattening everything has not found the
    // root, it has stopped choosing. Entropy is reported so that is visible.
    expect(peaked).toBeLessThan(flat);
  });

  it("uses the same weights as Stage F2 rather than refitting them", () => {
    // Refitting the ranking at the same time as changing the evidence would make
    // any difference unattributable.
    const ranking = rankRootCandidates(staticOverC.notes, 4);
    expect(ranking.ranked[0].pitchClass).toBe(0);
  });
});

describe("comparing variants", () => {
  it("returns one outcome per variant", () => {
    expect(compareVariants(walkingOverC)).toHaveLength(bassWeightingVariants.length);
  });

  it("reports which pitch classes a variant suppressed", () => {
    const outcomes = compareVariants(walkingOverC);
    const strongBeat = outcomes.find((outcome) => outcome.variant === "strong-beat")!;

    // D and F lose most of their weight; C and E sit on strong beats.
    expect(strongBeat.suppressedPitchClasses).toContain(2);
    expect(strongBeat.suppressedPitchClasses).not.toContain(0);
  });

  it("reports nothing suppressed for the current weighting", () => {
    const current = compareVariants(walkingOverC)
      .find((outcome) => outcome.variant === "current")!;
    expect(current.suppressedPitchClasses).toEqual([]);
  });

  it("gives the same comparison three times over", () => {
    const first = JSON.stringify(compareVariants(walkingOverC));
    expect(JSON.stringify(compareVariants(walkingOverC))).toBe(first);
    expect(JSON.stringify(compareVariants(walkingOverC))).toBe(first);
  });

  it("survives an empty window", () => {
    expect(compareVariants(walking([], 4))).toHaveLength(bassWeightingVariants.length);
  });
});
