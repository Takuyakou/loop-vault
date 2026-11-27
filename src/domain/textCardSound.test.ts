import { describe, expect, it } from "vitest";
import { parseExtendedTextChordLabel } from "./extendedTextProgression";
import {
  approachPrevious, basicNotesValid, cardKeyRoles, cardShapeMarkOf, cardShapeNotes, cardSoundKindOf, createTextHandSnapshot,
  createTextShapeSnapshot, defaultCardNotes, hasFixedBass, invertDown, invertUp, shiftOctave,
} from "./textCardSound";
import { DEFAULT_GENERATED_SHAPE_OPTIONS, DEFAULT_VOICING_SHAPE_OPTIONS } from "./voicingShapes";
import { textProgressionVoicingNotes } from "./textProgressionVoicing";
import type { ChordSymbol } from "./types";

const chord = (label: string): ChordSymbol => parseExtendedTextChordLabel(label)!;

describe("P25-03 C4: the card's shape notes", () => {
  it("defaults to 基本: today's recommended text sound (generated-close)", () => {
    for (const label of ["Em7", "Cmaj7", "G7alt", "C7(b9,#9,#11,b13)"]) {
      expect(defaultCardNotes(chord(label))).toEqual(textProgressionVoicingNotes(chord(label), "generated-close") ?? []);
    }
  });

  it("writes the shape snapshot id with the ② form actually used", () => {
    const c = chord("G7sus4");
    const snapshot = createTextShapeSnapshot(c, { ...DEFAULT_VOICING_SHAPE_OPTIONS, shape: "rootless", rootlessOrder: "A" })!;
    // G7sus4 ② only places the B order.
    expect(snapshot.extractorVersion).toBe("text-shape-v1:rootless:B");
    expect(cardShapeMarkOf(snapshot, c).options?.rootlessOrder).toBe("B");
    expect(cardSoundKindOf(snapshot)).toBe("shape");
  });

  it("reads a legacy style snapshot as its shape and keeps its notes", () => {
    const c = chord("Cmaj7");
    const legacy = { ...createTextHandSnapshot(c, [48, 59, 64, 67])!, extractorVersion: "text-style-v1:open-17" };
    expect(cardShapeMarkOf(legacy, c)).toEqual({ options: { ...DEFAULT_VOICING_SHAPE_OPTIONS, spread: true }, legacy: true });
    expect(cardShapeMarkOf({ ...legacy, extractorVersion: "text-style-v1:generated-close" }, c)).toEqual({ options: DEFAULT_GENERATED_SHAPE_OPTIONS, legacy: true });
    expect(cardShapeMarkOf(undefined, c)).toEqual({ options: DEFAULT_GENERATED_SHAPE_OPTIONS, legacy: false });
  });

  it("marks hand-edited notes as hand, not as a shape", () => {
    const snapshot = createTextHandSnapshot(chord("C"), [48, 64, 67])!;
    expect(snapshot.extractorVersion).toBe("text-hand-v1");
    expect(cardSoundKindOf(snapshot)).toBe("hand");
    expect(createTextHandSnapshot(chord("C"), [60])).toBeUndefined();
  });

  it("the basic check: 2–10 integers 0–127 without a repeated pitch", () => {
    expect(basicNotesValid([60, 64])).toBe(true);
    expect(basicNotesValid([60])).toBe(false);
    expect(basicNotesValid([60, 60])).toBe(false);
    expect(basicNotesValid([60, 128])).toBe(false);
    expect(basicNotesValid([60, 64.5])).toBe(false);
    expect(basicNotesValid(Array.from({ length: 11 }, (_, i) => 40 + i))).toBe(false);
    expect(cardShapeNotes(chord("C7(b9,#9,#11,b13)"), DEFAULT_VOICING_SHAPE_OPTIONS)?.result.used).toBe("legacy");
  });
});

describe("P25-03 C4: inversion, height and approach-previous", () => {
  const c = chord("C");
  it("keeps the bass when the lowest of 3+ notes is the bass", () => {
    expect(hasFixedBass([48, 64, 67], c)).toBe(true);
    expect(hasFixedBass([48, 64], c)).toBe(false);
    expect(hasFixedBass([52, 60, 67], c)).toBe(false);
    expect(invertUp([48, 64, 67], c)).toEqual([48, 67, 76]);
    expect(invertDown([48, 64, 67], c)).toEqual([48, 55, 64]);
  });

  it("moves every note when there is no bass", () => {
    expect(invertUp([52, 55, 60], c)).toEqual([55, 60, 64]);
    expect(invertDown([52, 55, 60], c)).toEqual([48, 52, 55]);
  });

  it("does nothing at the range edges, at or below the bass, or onto an existing note", () => {
    expect(invertUp([60, 76, 79], c)).toEqual([60, 79, 88].every((n) => n <= 84) ? [60, 79, 88] : undefined);
    expect(invertDown([48, 52, 55], c)).toBeUndefined(); // 55 - 12 = 43 is below the bass 48
    expect(invertDown([36, 40], c)).toBeUndefined();     // 40 - 12 = 28 < 36
    expect(invertUp([60, 72], chord("C5"))).toBeUndefined(); // 60 + 12 = 72 is already there
  });

  it("height moves all notes unless one leaves 36–84", () => {
    expect(shiftOctave([48, 64, 67], 1)).toEqual([60, 76, 79]);
    expect(shiftOctave([48, 64, 76], 1)).toBeUndefined();
    expect(shiftOctave([36, 52], -1)).toBeUndefined();
  });

  it("approach-previous picks the closest inversion and keeps an equally close one", () => {
    const g7 = chord("G7");
    // Previous Cmaj7 upper notes around E5–B5; G7 voiced high should come down.
    const result = approachPrevious([55, 77, 83], [48, 64, 67, 71], g7);
    expect(result).toBeDefined();
    const upper = result!.slice(1);
    expect(Math.max(...upper)).toBeLessThan(83);
    expect(approachPrevious([48, 64, 67], [48, 64, 67], c)).toBeUndefined();
    expect(approachPrevious([48, 64, 67], [], c)).toBeUndefined();
  });
});

describe("P25-03 C3 / K9-2: key roles", () => {
  it("names chord tones by K degree; only safe colours and written tensions are tensions", () => {
    const roles = cardKeyRoles(chord("Em7"));
    expect(roles.kindOf(64)).toBe("tone");
    expect(roles.degreeOf(64)).toBe("R");
    expect(roles.degreeOf(67)).toBe("♭3");
    expect(roles.degreeOf(74)).toBe("♭7");
    expect(roles.kindOf(66)).toBe("tension"); // 9 is safe on m7
    expect(roles.degreeOf(66)).toBe("9");
    expect(roles.kindOf(69)).toBe("tension"); // 11 is safe on m7
    expect(roles.kindOf(65)).toBe("other");   // ♭9 is not safe on m7
    expect(roles.kindOf(70)).toBe("other");   // ♯11 is not safe on m7
  });

  it("the design's example: Cmaj7's D♭ is 「other」; a written tension keeps its tension colour", () => {
    const cmaj7 = cardKeyRoles(chord("Cmaj7"));
    expect(cmaj7.kindOf(61)).toBe("other");
    expect(cmaj7.degreeOf(61)).toBeUndefined();
    expect(cmaj7.kindOf(62)).toBe("tension");
    expect(cmaj7.kindOf(69)).toBe("tension"); // 13
    const c7b9 = cardKeyRoles(chord("C7(b9)"));
    expect(["tone", "tension"]).toContain(c7b9.kindOf(61));
    expect(cardKeyRoles(chord("C7")).kindOf(63)).toBe("other"); // ♯9 is not safe on a plain C7
    expect(cardKeyRoles(chord("C11")).kindOf(64)).not.toBe("tone"); // dom11 has no third
  });
});
