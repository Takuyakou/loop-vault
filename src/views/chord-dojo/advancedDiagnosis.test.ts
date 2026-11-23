import { describe, expect, it } from "vitest";
import { ADVANCED_ITEMS } from "../../domain/chordDojo/guidedCourse/advanced/bank";
import { expectedChords } from "../../domain/chordDojo/guidedCourse/advanced/judge";
import type { AdvancedChord, AdvancedItem, AdvancedTrial } from "../../domain/chordDojo/guidedCourse/advanced/types";
import { diagnoseRound } from "./advancedDiagnosis";
import { advancedTipFor, advancedTipVariants, variantHash } from "./advancedTips";

const at = "2026-11-22T00:00:00.000Z";

function trialFor(item: AdvancedItem, overrides: Partial<AdvancedTrial> = {}): AdvancedTrial {
  return {
    trialId: `trial:${item.id}`, attemptId: "attempt", block: "sameDay", setId: item.setId, itemId: item.id,
    level: item.level, result: "wrong", steps: [], sealedNotes: [],
    hintUsed: false, selfConfirmed: false, midiConfirmed: true, practice: false, startedAt: at, sealedAt: at,
    ...overrides,
  };
}

/** A wrong answer that keeps the chord's tones but puts another pitch class lowest. */
function wrongBass(chord: AdvancedChord): number[] {
  return [48 + ((chord.root + 5) % 12), ...chord.referenceNotes.slice(1)];
}

/** The chord without one required tone. */
function without(chord: AdvancedChord, pitchClass: number): number[] {
  return chord.referenceNotes.filter((note) => ((note % 12) + 12) % 12 !== pitchClass);
}

function progressionTrial(item: AdvancedItem, badIndex: number, notes: (chord: AdvancedChord) => number[]): AdvancedTrial {
  const chords = expectedChords(item);
  return trialFor(item, {
    steps: chords.map((chord, index) => ({ notes: index === badIndex ? notes(chord) : [...chord.referenceNotes], ok: index !== badIndex })),
    sealedNotes: [],
  });
}

const byId = (id: string): AdvancedItem => ADVANCED_ITEMS.find((item) => item.id === id)!;
const find = (predicate: (item: AdvancedItem) => boolean): AdvancedItem | undefined => ADVANCED_ITEMS.find(predicate);

describe("P24-04 diagnoseRound", () => {
  it("names the slash chord's written bass", () => {
    const item = find((entry) => entry.level === 4 && entry.chords.length === 1 && entry.chords[0]!.bassPitchClass !== undefined)!;
    const chord = item.chords[0]!;
    const diagnosis = diagnoseRound([trialFor(item, { sealedNotes: wrongBass(chord) })], 4);
    expect(diagnosis.kind).toBe("lv4-slash-bass");
    expect(diagnosis.values?.bassName).toBe(["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][chord.bassPitchClass!]);
    expect(diagnosis.values?.cardNo).toBe(1);
  });

  it("separates a Lv5 mid-card start from the normal progression", () => {
    const mid = byId("lv5-mid-01");
    const normal = find((entry) => entry.level === 5 && entry.startIndex === undefined)!;
    expect(diagnoseRound([progressionTrial(mid, 0, (chord) => without(chord, chord.root))], 5).kind).toBe("lv5-midstart");
    expect(diagnoseRound([progressionTrial(normal, 1, (chord) => without(chord, chord.root))], 5).kind).toBe("lv5-progression");
  });

  it("names a transposed progression", () => {
    const item = find((entry) => entry.level === 6)!;
    const diagnosis = diagnoseRound([progressionTrial(item, 1, (chord) => without(chord, chord.root))], 6);
    expect(diagnosis.kind).toBe("lv6-transpose");
    expect(diagnosis.values?.cardNo).toBe(2);
  });

  it("separates a wrong lowest note from wrong upper notes in the ear progression", () => {
    const item = find((entry) => entry.level === 7 && entry.chords[0]!.bassPitchClass !== undefined)!;
    const chord = expectedChords(item)[0]!;
    expect(diagnoseRound([progressionTrial(item, 0, () => wrongBass(chord))], 7).kind).toBe("lv7-bass");
    // The lowest note stays the written bass; one upper note is a semitone off.
    const upper = [...chord.referenceNotes];
    upper[upper.length - 1] = upper[upper.length - 1]! + 1;
    expect(diagnoseRound([progressionTrial(item, 0, () => upper)], 7).kind).toBe("lv7-upper");
  });

  it("names a missing colour tone, a rootless voicing and a recolour", () => {
    const colour = byId("lv8-six-name-01");
    const colourChord = colour.chords[0]!;
    const tone = colourChord.requiredPitchClasses.find((value) => value !== colourChord.root)!;
    expect(diagnoseRound([trialFor(colour, { sealedNotes: without(colourChord, tone) })], 8).kind).toBe("lv8-tension-missing");

    const rootless = find((entry) => entry.level === 8
      && !entry.chords[0]!.requiredPitchClasses.includes(entry.chords[0]!.root)
      && (entry.chords[0]!.quality === "dom13" || entry.chords[0]!.quality === "dom9"))!;
    expect(diagnoseRound([trialFor(rootless, { sealedNotes: without(rootless.chords[0]!, rootless.chords[0]!.requiredPitchClasses[0]!) })], 8).kind)
      .toBe("lv8-rootless");

    const recolour = find((entry) => entry.level === 8 && (entry.plainChords?.length ?? 0) > 0)!;
    expect(diagnoseRound([progressionTrial(recolour, 1, (chord) => without(chord, chord.root))], 8).kind).toBe("lv8-recolor");
    expect(diagnoseRound([progressionTrial(recolour, 1, (chord) => without(chord, chord.root))], 8).values?.plainLabel)
      .toBe(recolour.plainChords![1]!.label);
  });

  it("names the capstone parts", () => {
    const name = find((entry) => entry.kind === "capstone-name")!;
    expect(diagnoseRound([trialFor(name, { sealedNotes: without(name.chords[0]!, name.chords[0]!.root) })], "capstone").kind).toBe("cap-name");

    const sight = find((entry) => entry.kind === "capstone-sight")!;
    const stopped = trialFor(sight, {
      steps: sight.chords.flatMap((chord, index) => Array.from({ length: 4 }, (_, beat) => ({
        notes: index === 2 && beat < 3 ? [] : [...chord.referenceNotes],
        ok: !(index === 2 && beat < 3),
      }))),
    });
    const stopDiagnosis = diagnoseRound([stopped], "capstone");
    expect(stopDiagnosis.kind).toBe("cap-sight-stop");
    expect(stopDiagnosis.values?.longestStop).toBe(3);
    // The failing beat is on card 3 (beats 8-11), so the card number is Math.floor(8 / 4) + 1.
    expect(stopDiagnosis.values?.cardNo).toBe(3);

    const slipped = trialFor(sight, {
      steps: sight.chords.flatMap((chord, index) => Array.from({ length: 4 }, (_, beat) => ({
        notes: index === 1 && beat === 2 ? [] : [...chord.referenceNotes],
        ok: !(index === 1 && beat === 2),
      }))),
    });
    expect(diagnoseRound([slipped], "capstone").kind).toBe("cap-sight-accuracy");
  });

  it("keeps the level's sentence for a self-confirmed trial and for no sound", () => {
    const item = byId("lv5-mid-01");
    expect(diagnoseRound([progressionTrial(item, 0, () => [])], 5).kind).toBe("no-input");
    expect(diagnoseRound([progressionTrial(item, 0, () => [])], 5).values).toBeUndefined();
    expect(diagnoseRound([trialFor(item, { result: "incomplete" })], 5).kind).toBe("incomplete");
    expect(diagnoseRound([trialFor(item, { result: "wrong", sealedNotes: [], selfConfirmed: true })], 6).values).toBeUndefined();
    expect(diagnoseRound([trialFor(item, { result: "correct" })], 5).kind).toBe("all-correct");
  });
});

describe("P24-04 advancedTipFor", () => {
  const item = byId("lv5-mid-01");
  const diagnosis = diagnoseRound([progressionTrial(item, 0, (chord) => without(chord, chord.root))], 5);

  it("is deterministic and fills the values", () => {
    const first = advancedTipFor(diagnosis, 5, 1, item.id);
    expect(first).toBe(advancedTipFor(diagnosis, 5, 1, item.id));
    expect(first).toContain("**");
    expect(first).toContain(expectedChords(item)[0]!.label);
    const slashTip = advancedTipFor({ kind: "lv4-slash-bass", values: { label: "C/E", bassName: "E", lowestPlayed: "C" } }, 4, 1, "x");
    expect(slashTip).toContain("E");
    // fix-2 item 4: the lowest note is held with the left pinky; the thumb is not the lowest finger.
    const slashVariants = advancedTipVariants("lv4-slash-bass");
    expect(slashVariants.some((variant) => variant.includes("左手の小指で支えましょう"))).toBe(true);
    expect(slashVariants.every((variant) => !variant.includes("小指か親指"))).toBe(true);
  });

  it("picks a different variant for a different item", () => {
    const variants = new Set<string>();
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      const tip = advancedTipFor(diagnosis, 5, 1, id);
      if (tip) variants.add(tip);
    }
    expect(variants.size).toBeGreaterThan(1);
    expect(variantHash("x")).toBe(variantHash("x"));
  });

  it("has two all-correct texts per level", () => {
    const tips = new Set<string>();
    for (let round = 1; round <= 8; round += 1) {
      const tip = advancedTipFor({ kind: "all-correct", values: {} }, 8, round);
      if (tip) tips.add(tip);
    }
    expect(tips.size).toBe(2);
  });

  it("returns undefined when the diagnosis asks for the level's own sentence", () => {
    expect(advancedTipFor({ kind: "no-input", values: undefined }, 5, 1)).toBeUndefined();
  });
});
