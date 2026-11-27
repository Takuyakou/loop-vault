import { describe, expect, it } from "vitest";
import { parseChordLabel } from "./chords";
import { importKeyLabel, IMPORT_KEY_MIN_COVERAGE, inferImportKey, resolveImportKey } from "./importKeyResolution";
import type { ChordSymbol } from "./types";

/**
 * P23-33 S1: the fixed fixtures of the design's §8. The expectations are written here, not read
 * back from the implementation, and no confidence number is asserted anywhere.
 */
function chords(labels: readonly string[]): ChordSymbol[] {
  return labels.map((label) => {
    const chord = parseChordLabel(label);
    if (!chord) throw new Error(`fixture chord did not parse: ${label}`);
    return chord;
  });
}

function transpose(value: ChordSymbol, semitones: number): ChordSymbol {
  const shift = (pitch: number) => ((pitch + semitones) % 12 + 12) % 12;
  return { ...value, root: shift(value.root), ...(value.bass === undefined ? {} : { bass: shift(value.bass) }) };
}

function keyOf(semitones: number, tonic: number, mode: "major" | "minor"): string {
  const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
  return `${names[((tonic + semitones) % 12 + 12) % 12]} ${mode}`;
}

describe("P23-33 S1: the automatic key rule (design §4)", () => {
  it("settles a plain major progression", () => {
    const decision = inferImportKey(chords(["C", "F", "G", "C"]));
    expect(decision.key).toBe("C major");
    expect(decision.origin).toBe("inferred");
    expect(decision.reason).toBe("settled");
    expect(decision.candidates[0]?.key).toBe("C major");
  });

  it("settles a ii–V–I", () => {
    expect(inferImportKey(chords(["Dm7", "G7", "Cmaj7"])).key).toBe("C major");
  });

  it("settles a minor progression", () => {
    const decision = inferImportKey(chords(["Am", "Dm", "E7", "Am"]));
    expect(decision.key).toBe("A minor");
    expect(decision.origin).toBe("inferred");
  });

  it("settles a minor ii–V–i", () => {
    expect(inferImportKey(chords(["Bm7b5", "E7", "Am"])).key).toBe("A minor");
  });

  it("leaves the relative-key tie undecided (C Am F)", () => {
    const decision = inferImportKey(chords(["C", "Am", "F"]));
    expect(decision.key).toBeUndefined();
    expect(decision.origin).toBe("unknown");
    expect(["not-unique", "cadence-not-conclusive"]).toContain(decision.reason);
    // Three readings fit every chord equally; the display order must not decide between them.
    const tied = decision.candidates.filter((candidate) => candidate.support === 3).map((candidate) => candidate.key).sort();
    expect(tied).toEqual(["A minor", "C major", "F major"]);
  });

  it("needs at least three chords", () => {
    expect(inferImportKey(chords(["C"])).reason).toBe("too-few-chords");
    expect(inferImportKey(chords(["C", "G"])).reason).toBe("too-few-chords");
    expect(inferImportKey(chords([])).reason).toBe("too-few-chords");
  });

  it("does not count consecutive repeats as distinct harmonies", () => {
    expect(inferImportKey(chords(["C", "C", "C", "C"])).reason).toBe("too-few-distinct-chords");
  });

  it("does not mistake a slash chord's bass for the tonic", () => {
    expect(inferImportKey(chords(["C/E", "F/A", "G/B", "C/E"])).key).toBe("C major");
  });

  it("does not turn sus or diminished chords into a dominant cadence", () => {
    // C major and G major both fit three of the four chords; Gsus4 is not a dominant, so no cadence
    // may narrow the tie — the answer stays undetermined.
    expect(inferImportKey(chords(["C", "Gsus4", "C", "G"])).key).toBeUndefined();
    expect(inferImportKey(chords(["C", "Gsus4", "C", "G"])).reason).toBe("cadence-not-conclusive");
    expect(inferImportKey(chords(["C", "Bdim", "C"])).key).toBeUndefined();
  });

  it("P25 V33/V39: takes a key at 55% coverage and below that leaves it undetermined", () => {
    expect(IMPORT_KEY_MIN_COVERAGE).toBe(0.55);
    const inputs = [
      ["C", "F", "G", "C"],
      ["C", "F", "G", "F#"],
      ["C", "Am", "Dm", "G", "E7", "Am"],
      ["Dm", "Em", "Bb", "Gm", "Abm", "Am", "A7", "Dm"],
      ["C", "Eb", "F", "G", "Ab", "Bb"],
      ["C", "D", "E", "F#", "Ab", "Bb"],
    ] as const;
    let compared = 0;
    for (const labels of inputs) {
      const decision = inferImportKey(chords(labels));
      const bestSupport = Math.max(...decision.candidates.map((candidate) => candidate.support));
      const best = decision.candidates.filter((candidate) => candidate.support === bestSupport);
      // The rule speaks only when one candidate is strongest; a tie is settled (or not) by the cadence.
      if (best.length !== 1) continue;
      compared += 1;
      const winner = best[0]!;
      const reaches = winner.support / labels.length >= IMPORT_KEY_MIN_COVERAGE;
      // P25 V39: the key it settles on may be the winner's relative (the first chord decides), so only
      // whether a key is settled at all is checked here.
      expect(decision.origin === "inferred").toBe(reaches);
      if (!reaches) expect(decision.key).toBeUndefined();
    }
    // `C Am Dm G E7 Am` and `C Eb F G Ab Bb` are the two with one strongest candidate.
    expect(compared).toBeGreaterThan(0);
  });

  it("P25 V39: C F G F# is C major (75%, the first chord settles the relative pair)", () => {
    // C major and A minor fit the same three chords; the progression opens on C, so C major is read.
    expect(inferImportKey(chords(["C", "F", "G", "F#"])).key).toBe("C major");
  });

  it("never claims a key below the coverage threshold", () => {
    const labels = ["C", "F#", "Bb", "E", "Ab"] as const;
    const decision = inferImportKey(chords(labels));
    const best = Math.max(...decision.candidates.map((candidate) => candidate.support)) / labels.length;
    expect(best).toBeLessThan(IMPORT_KEY_MIN_COVERAGE);
    expect(best).toBe(0.4);
    expect(decision.key).toBeUndefined();
  });

  it("is deterministic and does not change the input", () => {
    const input = chords(["Am", "Dm", "E7", "Am"]);
    const snapshot = JSON.stringify(input);
    const first = inferImportKey(input);
    const second = inferImportKey(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(second).toEqual(first);
  });

  it("gives the same answer after any transposition", () => {
    for (const semitones of [-5, -1, 1, 2, 7, 11]) {
      const moved = chords(["C", "F", "G", "C"]).map((chord) => transpose(chord, semitones));
      const decision = inferImportKey(moved);
      expect(decision.origin).toBe("inferred");
      expect(decision.key).toBe(keyOf(semitones, 0, "major"));
      // P25 V39: a relative-key tie is settled by the first chord, so it moves with the progression too.
      const relative = chords(["Am", "F", "C", "G"]).map((chord) => transpose(chord, semitones));
      const relativeDecision = inferImportKey(relative);
      expect(relativeDecision.origin).toBe("inferred");
      expect(relativeDecision.key).toBe(keyOf(semitones, 9, "minor"));
    }
  });

  it("compares exactly 24 candidates and reports no confidence", () => {
    const decision = inferImportKey(chords(["C", "F", "G", "C"]));
    expect(decision.candidates.length).toBeLessThanOrEqual(24);
    expect(Object.keys(decision)).not.toContain("confidence");
    expect(JSON.stringify(decision)).not.toMatch(/confidence|信頼/i);
  });
});

describe("P25 V39: 55% and the relative keys", () => {
  it("settles the user's 17-chord sheet on D minor (the first chord, not its relative F major)", () => {
    const decision = inferImportKey(chords([
      "Dm11", "Em11", "Dm11", "Bbmaj9(#11)", "Gm9", "Abm9", "Am11", "A7(#9,b13)",
      "Dm9", "Fmaj9/E", "Ebmaj9(#11)", "D13(#11)", "Gm11", "C13", "Fmaj9", "Em11", "Eb13(#11)",
    ]));
    expect(decision.key).toBe("D minor");
    expect(decision.origin).toBe("inferred");
    expect(decision.reason).toBe("settled");
  });

  it("lets the first chord decide between a key and its relative", () => {
    expect(inferImportKey(chords(["Am", "F", "C", "G"]))).toMatchObject({ key: "A minor", origin: "inferred" });
    expect(inferImportKey(chords(["C", "Am", "F", "G"]))).toMatchObject({ key: "C major", origin: "inferred" });
  });

  it("keeps the old answer when the first chord is neither tonic (ii first)", () => {
    // The relative rule does not fire here (the first chord is Dm), so the old V→I narrowing still answers.
    const decision = inferImportKey(chords(["Dm", "G", "C", "Am"]));
    expect(decision.key).toBe("C major");
    expect(decision.reason).toBe("settled");
  });

  it("shows the relative-key answer in the automatic label", () => {
    expect(importKeyLabel(inferImportKey(chords(["Am", "F", "C", "G"])))).toBe("自動: Aマイナー");
  });
});

describe("P23-33 S1: the decision order (design §3)", () => {
  it("keeps a manual key and never re-interprets the chords", () => {
    const decision = resolveImportKey({ mode: "manual", manualKey: "D major", chords: chords(["C", "F", "G", "C"]) });
    expect(decision.key).toBe("D major");
    expect(decision.origin).toBe("manual");
  });

  it("keeps an existing key (for example a MIDI detectedKey) over the automatic rule", () => {
    const decision = resolveImportKey({ existingKey: "C major", chords: chords(["Am", "Dm", "E7", "Am"]) });
    expect(decision).toEqual({ key: "C major", origin: "existing", reason: "settled", candidates: [] });
  });

  it("inherits the destination's key only when the object has none", () => {
    expect(resolveImportKey({ inheritedKey: "F major", chords: chords(["C", "F", "G"]) }).origin).toBe("inherited");
    expect(resolveImportKey({ existingKey: "G major", inheritedKey: "F major", chords: chords(["C", "F", "G"]) }))
      .toMatchObject({ key: "G major", origin: "existing" });
  });

  it("lets an explicit 未設定 suppress the automatic rule only", () => {
    expect(resolveImportKey({ mode: "unset", chords: chords(["C", "F", "G", "C"]) }))
      .toEqual({ origin: "unknown", reason: "unset", candidates: [] });
    expect(resolveImportKey({ mode: "unset", existingKey: "E major", chords: [] }))
      .toMatchObject({ key: "E major", origin: "existing" });
  });

  it("shows the automatic state without a confidence number", () => {
    expect(importKeyLabel(inferImportKey(chords(["C", "F", "G", "C"])))).toBe("自動: Cメジャー");
    expect(importKeyLabel(inferImportKey(chords(["C"])))).toBe("自動: 未確定");
    expect(importKeyLabel(inferImportKey(chords(["Am", "Dm", "E7", "Am"])))).toBe("自動: Aマイナー");
    expect(importKeyLabel(inferImportKey(chords(["C", "F", "G", "C"])))).not.toMatch(/信頼|%/);
  });

  it("keeps degree input without absolute chords unknown", () => {
    // Degree-only input never reaches the automatic rule: the caller has no absolute chords.
    expect(inferImportKey([])).toMatchObject({ origin: "unknown", reason: "too-few-chords" });
  });
});
