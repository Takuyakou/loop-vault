import { describe, expect, it } from "vitest";
import {
  bassEvidence,
  definingToneEvidence,
  relationEvidence,
  rootEvidence,
  shadowDiagnostics,
  type ChordObservation,
  type ObservedNote,
} from "./shadowEvidence";

/**
 * Shadow evidence.
 *
 * The cases are the ones the current detector is known to get wrong — a pedal
 * read as a root, a rootless voicing named from its bass — plus the rule that
 * makes those fixable: a missing note is not a contradicted note.
 */
function note(pitch: number, weight = 4, role: ObservedNote["role"] = "harmony"): ObservedNote {
  return { pitch, weight, role };
}

function observe(notes: ObservedNote[], windowBeats = 4): ChordObservation {
  return { notes, windowBeats };
}

/** C E G, root position, C2 bass. */
const cMajor = observe([note(36, 4, "bass"), note(60), note(64), note(67)]);

describe("bass evidence", () => {
  it("finds the lowest sounding pitch class", () => {
    expect(bassEvidence(cMajor).top3[0].pitchClass).toBe(0);
  });

  it("reports how much of the low band supports it", () => {
    expect(bassEvidence(cMajor).lowestNoteSupport).toBe(1);
  });

  it("separates the bass role from the low register", () => {
    // A file with no bass track still has a lowest note, and its bass evidence
    // must not be zero just because no track was labelled bass.
    const noBassTrack = observe([note(36, 4, "harmony"), note(60), note(64)]);

    expect(bassEvidence(noBassTrack).top3[0].pitchClass).toBe(0);
    expect(bassEvidence(noBassTrack).bassVoiceSupport).toBe(0);
    expect(bassEvidence(cMajor).bassVoiceSupport).toBe(1);
  });

  it("does not let a tenor note outvote the bass", () => {
    // A note an octave above the bass is inside the band but counts for less.
    const withTenor = observe([note(36, 4, "bass"), note(47, 4), note(60), note(64)]);
    expect(bassEvidence(withTenor).top3[0].pitchClass).toBe(0);
  });

  it("survives an empty window", () => {
    const empty = bassEvidence(observe([]));
    expect(empty.evidenceAmount).toBe(0);
    expect(empty.margin).toBe(0);
  });
});

describe("bass-upper relation", () => {
  it("calls a bass that is part of the chord aligned", () => {
    const observation = cMajor;
    expect(relationEvidence(observation, bassEvidence(observation)).relation).toBe("aligned");
  });

  it("calls a still bass outside the chord a pedal", () => {
    // D in the bass under an E minor triad: the D is not part of what the upper
    // voices spell, and it does not move.
    const observation = observe([note(38, 4, "bass"), note(64), note(67), note(71)]);
    const relation = relationEvidence(observation, bassEvidence(observation));

    expect(relation.relation).toBe("pedal");
    expect(relation.reasons.join(" ")).toContain("still");
  });

  it("calls several distinct low notes walking", () => {
    const observation = observe([
      note(36, 1, "bass"), note(38, 1, "bass"), note(40, 1, "bass"), note(41, 1, "bass"),
      note(60), note(64), note(67),
    ]);
    expect(relationEvidence(observation, bassEvidence(observation)).relation).toBe("walking");
  });

  it("calls a window with no upper voices none", () => {
    const observation = observe([note(36, 4, "bass"), note(43, 4, "bass")]);
    expect(relationEvidence(observation, bassEvidence(observation)).relation).toBe("none");
  });

  it("scores all four relations every time", () => {
    const relation = relationEvidence(cMajor, bassEvidence(cMajor));
    expect(Object.keys(relation.scores).sort())
      .toEqual(["aligned", "none", "pedal", "walking"]);
  });
});

describe("root evidence", () => {
  it("prefers the root of a plain triad", () => {
    expect(rootEvidence(cMajor).top3[0].pitchClass).toBe(0);
  });

  it("finds a root that is not being played", () => {
    // E and Bb over nothing: the guide tones of C7. The root is inferred, not heard.
    const rootless = observe([note(64), note(70), note(74)]);
    const evidence = rootEvidence(rootless);

    expect(evidence.guideToneImplication[0]).toBeGreaterThan(0);
    expect(evidence.rootPresence[0]).toBe(0);
  });

  it("does not pin a root from guide tones alone", () => {
    // A third and a seventh belong to two roots a tritone apart. Asserting one is
    // how a rootless voicing becomes a confident wrong answer.
    const rootless = observe([note(64), note(70)]);
    expect(rootEvidence(rootless).rootlessInferred).toBe(true);
  });

  it("keeps the key prior too weak to decide anything", () => {
    const inKey = rootEvidence(cMajor, { keyPitchClasses: [0, 2, 4, 5, 7, 9, 11] });
    const noKey = rootEvidence(cMajor);

    // Same winner: a key prior that can outvote what is sounding is a key
    // detector wearing a chord detector's clothes.
    expect(inKey.top3[0].pitchClass).toBe(noKey.top3[0].pitchClass);
  });

  it("keeps continuity too weak to decide anything", () => {
    const withPrevious = rootEvidence(cMajor, { previousRoot: 7 });
    expect(withPrevious.top3[0].pitchClass).toBe(rootEvidence(cMajor).top3[0].pitchClass);
  });

  it("scores a suspended chord without a third", () => {
    const sus = observe([note(36, 4, "bass"), note(60), note(65), note(67)]);
    expect(rootEvidence(sus).susSkeleton[0]).toBeGreaterThan(0);
    expect(rootEvidence(sus).tertianSkeleton[0]).toBeLessThan(rootEvidence(cMajor).tertianSkeleton[0]);
  });
});

describe("defining tones", () => {
  it("supports the quality whose tones are heard", () => {
    expect(definingToneEvidence(cMajor, 0).triad.major).toBe("supported");
  });

  it("contradicts a quality whose tone is denied", () => {
    // A major third that definitely sounds denies minor.
    expect(definingToneEvidence(cMajor, 0).triad.minor).toBe("contradicted");
  });

  it("leaves a quality undetermined when its tone is simply absent", () => {
    // Root and fifth only. Neither third is heard, so neither major nor minor is
    // denied — they are undetermined. Treating absence as denial is how a
    // detector asserts qualities it has no evidence for.
    const noThird = observe([note(36, 4, "bass"), note(60), note(67)]);
    const verdicts = definingToneEvidence(noThird, 0).triad;

    expect(verdicts.major).toBe("underdetermined");
    expect(verdicts.minor).toBe("underdetermined");
  });

  it("leaves the seventh undetermined when no seventh sounds", () => {
    const sevenths = definingToneEvidence(cMajor, 0).seventh;
    expect(sevenths.minor7).toBe("underdetermined");
    expect(sevenths.major7).toBe("underdetermined");
  });

  it("contradicts the major seventh when a minor seventh sounds", () => {
    const dominant = observe([note(36, 4, "bass"), note(60), note(64), note(67), note(70)]);
    const sevenths = definingToneEvidence(dominant, 0).seventh;

    expect(sevenths.minor7).toBe("supported");
    expect(sevenths.major7).toBe("contradicted");
  });

  it("gives a verdict for every triad and every seventh", () => {
    const evidence = definingToneEvidence(cMajor, 0);
    expect(Object.keys(evidence.triad)).toHaveLength(8);
    expect(Object.keys(evidence.seventh)).toHaveLength(3);
  });
});

describe("ambiguity", () => {
  it("names a pedal as pedal-or-root", () => {
    const pedal = observe([note(38, 4, "bass"), note(64), note(67), note(71)]);
    expect(shadowDiagnostics(pedal).ambiguities).toContain("pedal-or-root");
  });

  it("names a rootless voicing", () => {
    expect(shadowDiagnostics(observe([note(64), note(70)])).ambiguities)
      .toContain("rootless-inferred");
  });

  it("names an undetermined quality", () => {
    const noThird = observe([note(36, 4, "bass"), note(60), note(67)]);
    expect(shadowDiagnostics(noThird).ambiguities).toContain("quality-underdetermined");
  });

  it("names a short window as boundary-uncertain", () => {
    expect(shadowDiagnostics(observe([note(60), note(64), note(67)], 0.5)).ambiguities)
      .toContain("boundary-uncertain");
  });

  it("says nothing about a plain triad it is sure of", () => {
    expect(shadowDiagnostics(cMajor).ambiguities).not.toContain("quality-underdetermined");
    expect(shadowDiagnostics(cMajor).ambiguities).not.toContain("rootless-inferred");
  });
});

describe("the current hypothesis is a reference, not an input", () => {
  it("produces the same evidence whatever the product currently says", () => {
    const withHypothesis: ChordObservation = { ...cMajor, currentRoot: 7, currentBass: 7 };
    const without = cMajor;

    // Routing on the current answer would make the evidence a function of the
    // thing it is supposed to be evidence about.
    expect(JSON.stringify(shadowDiagnostics(withHypothesis).root))
      .toBe(JSON.stringify(shadowDiagnostics(without).root));
    expect(JSON.stringify(shadowDiagnostics(withHypothesis).bass))
      .toBe(JSON.stringify(shadowDiagnostics(without).bass));
    expect(JSON.stringify(shadowDiagnostics(withHypothesis).relation))
      .toBe(JSON.stringify(shadowDiagnostics(without).relation));
  });

  it("carries the current hypothesis through for comparison", () => {
    const diagnostics = shadowDiagnostics({ ...cMajor, currentRoot: 7, currentBass: 7 });
    expect(diagnostics.currentRoot).toBe(7);
  });
});

describe("determinism", () => {
  it("gives the same diagnostics three times over", () => {
    const first = JSON.stringify(shadowDiagnostics(cMajor));
    expect(JSON.stringify(shadowDiagnostics(cMajor))).toBe(first);
    expect(JSON.stringify(shadowDiagnostics(cMajor))).toBe(first);
  });
});
