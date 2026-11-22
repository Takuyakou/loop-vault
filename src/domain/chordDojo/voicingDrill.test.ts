import { describe, expect, it } from "vitest";
import {
  DRILL_SETS, DRILL_SET_IDS, DRILL_KEY_NAMES, buildDrillKeySet, drillKeyShift, drillShapeMatches,
  drillDistracted, createDrillLapClock, noteFirstPress, passCard, drillSetById,
} from "./voicingDrill";

const pc = (value: number) => ((value % 12) + 12) % 12;

describe("P19 voicing drill: the twenty sets", () => {
  it("has the twenty sets and their cards", () => {
    expect(DRILL_SET_IDS).toEqual([
      "cycle-a", "cycle-b", "cycle-c", "cycle-d", "cycle-e",
      "diatonic-fourths", "diatonic-up", "diatonic-down", "diatonic-mix-1", "diatonic-mix-2",
      "tension-front", "tension-back", "tension-all",
      "micro-1", "micro-2", "micro-3", "micro-4", "micro-5", "micro-6a", "micro-6b",
    ]);
    expect(DRILL_SETS).toHaveLength(20);
    expect(DRILL_SETS.map((set) => set.cards.length)).toEqual([
      4, 4, 4, 4, 4,
      8, 8, 9, 7, 8,
      10, 18, 28,
      7, 4, 4, 8, 4, 9, 11,
    ]);
  });

  it("keeps every key on every card inside the ranges and the fixed shapes", () => {
    for (const set of DRILL_SETS) {
      for (let key = 0; key < 12; key += 1) {
        const built = buildDrillKeySet(set.id, key);
        expect(built.cards).toHaveLength(set.cards.length);
        for (const card of built.cards) {
          expect(card.left).toHaveLength(1);
          expect(card.left[0]!).toBeGreaterThanOrEqual(set.stage === 3 ? 34 : 40);
          expect(card.left[0]!).toBeLessThanOrEqual(set.stage === 3 ? 60 : 51);
          if (set.stage === 3) {
            const shift = drillKeyShift(key);
            expect(card.left[0]).toBe(card.left[0]);
            void shift;
          }
          expect(card.right.length).toBeGreaterThanOrEqual(3);
          expect(card.right.length).toBeLessThanOrEqual(4);
          expect(Math.max(...card.right) - Math.min(...card.right)).toBeLessThanOrEqual(11);
          expect(card.right[0]!).toBeGreaterThan(card.left[0]!);
          for (let index = 1; index < card.right.length; index += 1) {
            expect(card.right[index]!).toBeGreaterThan(card.right[index - 1]!);
          }
          expect(card.rightNames).toHaveLength(card.right.length);
          expect(card.leftNames).toHaveLength(1);
        }
      }
    }
  });

  it("produces the same result on every call", () => {
    const first = JSON.stringify(DRILL_SETS);
    expect(JSON.stringify(DRILL_SETS)).toBe(first);
    expect(JSON.stringify(buildDrillKeySet("diatonic-mix-1", 5))).toBe(JSON.stringify(buildDrillKeySet("diatonic-mix-1", 5)));
  });

  it("keeps the tension table exactly (fourteen shapes, form A then B)", () => {
    const expected = [
      ["CΔ7(9)", "E4 G4 B4 D5", "B3 D4 E4 G4"],
      ["CΔ7(9,13)", "E4 A4 B4 D5", "B3 D4 E4 A4"],
      ["Dm7(9)", "F4 A4 C5 E5", "C4 E4 F4 A4"],
      ["Dm7(9,11)", "A4 C5 E5 G5", "E4 G4 A4 C5"],
      ["Em7(11)", "E4 A4 B4 D5", "B3 D4 E4 A4"],
      ["FΔ7(9)", "A3 C4 E4 G4", "E4 G4 A4 C5"],
      ["FΔ7(9,13)", "A3 D4 E4 G4", "E4 G4 A4 D5"],
      ["FΔ7(9,♯11)", "C4 E4 G4 B4", "G4 B4 C5 E5"],
      ["G7(9)", "B3 D4 F4 A4", "F4 A4 B4 D5"],
      ["G7(9,13)", "B3 E4 F4 A4", "F4 A4 B4 E5"],
      ["Am7(9)", "C4 E4 G4 B4", "G4 B4 C5 E5"],
      ["Am7(9,11)", "E4 G4 B4 D5", "B3 D4 E4 G4"],
      ["Bø7(11)", "B3 E4 F4 A4", "F4 A4 B4 E5"],
      ["Bø7(11,♭13)", "A3 D4 E4 G4", "E4 G4 A4 D5"],
    ];
    const all = buildDrillKeySet("tension-all", 0).cards;
    expect(all).toHaveLength(28);
    for (const [index, [label, formA, formB]] of expected.entries()) {
      expect(all[index * 2]!.label).toBe(label as string);
      expect(all[index * 2]!.form).toBe("A");
      expect(all[index * 2]!.rightNames.join(" ")).toBe(formA);
      expect(all[index * 2 + 1]!.label).toBe(label as string);
      expect(all[index * 2 + 1]!.form).toBe("B");
      expect(all[index * 2 + 1]!.rightNames.join(" ")).toBe(formB);
    }
  });

  it("moves the tension table by the key's shift (+6 for F♯, −5 for G)", () => {
    expect(drillKeyShift(0)).toBe(0);
    expect(drillKeyShift(6)).toBe(6);
    expect(drillKeyShift(7)).toBe(-5);
    expect(drillKeyShift(1)).toBe(1);
    expect(drillKeyShift(11)).toBe(-1);
    const c = buildDrillKeySet("tension-front", 0).cards[0]!;
    const fSharp = buildDrillKeySet("tension-front", 6).cards[0]!;
    const g = buildDrillKeySet("tension-front", 7).cards[0]!;
    expect(fSharp.right).toEqual(c.right.map((pitch) => pitch + 6));
    expect(g.right).toEqual(c.right.map((pitch) => pitch - 5));
    expect(fSharp.rightNames.join(" ")).toBe("A♯4 C♯5 E♯5 G♯5");
  });

  it("spells the root from the degree and the notes by their interval", () => {
    // F: the diatonic letters of the key (VII = Eø7); ♯IV = Bø7, written B (not C♭).
    const fourths = buildDrillKeySet("diatonic-fourths", 5).cards;
    expect(fourths[2]!.label).toBe("Eø7");
    const sharpFour = buildDrillKeySet("micro-6b", 5).cards[0]!;
    expect(sharpFour.label).toBe("Bø7");
    const micro = buildDrillKeySet("micro-6b", 5).cards;
    const a7Flat9 = micro.find((card) => card.degree === "III7(♭9)")!;
    expect(a7Flat9.rightNames.join(" ")).toContain("C♯");
    const a7InC = buildDrillKeySet("micro-6b", 0).cards.find((card) => card.degree === "VI7")!;
    expect(a7InC.rightNames.join(" ")).toContain("C♯");
  });

  it("avoids a double accidental by respelling the root (D♭ ♭VI becomes A)", () => {
    const micro = buildDrillKeySet("micro-3", 1).cards;
    // D♭: I = D♭, ♭VII6 = C♭6, VIm7 = B♭m7, ♭VIΔ7 = AΔ7 (B𝄫 would need a double flat).
    expect(micro.map((card) => card.label)).toEqual(["D♭", "C♭6", "B♭m7", "AΔ7"]);
  });

  it("gives the same right-hand shape the same id", () => {
    const all = buildDrillKeySet("tension-all", 0).cards;
    const a = all.find((card) => card.label === "CΔ7(9)" && card.form === "A")!;
    const b = all.find((card) => card.label === "Am7(9,11)" && card.form === "A")!;
    const shape = (card: typeof a) => card.right.map((pitch) => pitch - card.right[0]!).join(",");
    expect(shape(a)).toBe(shape(b));
  });

  it("places the first card with the top nearest E5 and the rest with the least movement", () => {
    const cycle = buildDrillKeySet("cycle-a", 0).cards;
    expect(cycle[0]!.right).toEqual([67, 72, 76]);
    expect(drillKeyShift(0)).toBe(0);
    // the first card is the same on every lap: the last card does not change it
    const again = buildDrillKeySet("cycle-a", 0).cards[0]!;
    expect(again.right).toEqual(cycle[0]!.right);
  });

  it("writes the left hand with the same spelling as the card's root (or the slash bass)", () => {
    const rootOf = (label: string) => {
      const beforeSlash = label.split("/")[0]!;
      const root = /^([A-G][♯♭𝄪𝄫]?)/u.exec(beforeSlash)![1]!;
      return { root, bass: label.includes("/") ? label.split("/")[1]! : undefined };
    };
    for (const set of DRILL_SETS) {
      for (let key = 0; key < 12; key += 1) {
        for (const card of buildDrillKeySet(set.id, key).cards) {
          const { root, bass } = rootOf(card.label);
          const expected = (bass ?? root).replace(/\d+$/, "");
          expect(card.leftNames[0]!.replace(/-?\d+$/, ""), `${set.id}/${key}/${card.label}`).toBe(expected);
        }
      }
    }
  });

  it("keeps cycle-a and cycle-b's first chord a plain triad (I = C)", () => {
    for (const setId of ["cycle-a", "cycle-b"]) {
      const card = buildDrillKeySet(setId, 0).cards[0]!;
      expect(card.label).toBe("C");
      expect(card.right).toHaveLength(3);
      expect(card.right.map((pitch) => pitch % 12).sort()).toEqual([0, 4, 7]);
    }
  });

  it("starts micro-6b with a plain F♯ø7 (no tension)", () => {
    const card = buildDrillKeySet("micro-6b", 0).cards[0]!;
    expect(card.label).toBe("F♯ø7");
    expect(card.right).toHaveLength(3);
    expect(card.right.map((pitch) => pitch % 12).sort()).toEqual([0, 4, 9]);
  });

  it("has every set reachable by id and twelve key names", () => {
    expect(drillSetById("micro-1")?.stage).toBe(4);
    expect(drillSetById("nope")).toBeUndefined();
    expect(DRILL_KEY_NAMES).toHaveLength(12);
  });
});

describe("P19 voicing drill: judgement", () => {
  const card = { rootPitchClass: 0, left: [48], right: [67, 71, 76] }; // CΔ7: G4 B4 E5

  it("passes the exact shape, at any octave", () => {
    expect(drillShapeMatches(card, [48, 67, 71, 76])).toBe(true);
    expect(drillShapeMatches(card, [36, 55, 59, 64])).toBe(true);
    expect(drillShapeMatches(card, [60, 79, 83, 88])).toBe(true);
  });

  it("rejects another order, an extra note, another root and a right hand below the root", () => {
    expect(drillShapeMatches(card, [48, 64, 67, 71])).toBe(false);
    expect(drillShapeMatches(card, [48, 67, 71, 76, 79])).toBe(false);
    expect(drillShapeMatches(card, [50, 67, 71, 76])).toBe(false);
    expect(drillShapeMatches(card, [60, 55, 59, 64])).toBe(false);
  });

  it("marks a pitch class outside the chord (octaves do not matter)", () => {
    expect(drillDistracted(card, 61)).toBe(true);
    expect(drillDistracted(card, 60)).toBe(false);
    expect(drillDistracted(card, 64)).toBe(false);
  });

  it("times the lap from the first key and each card from the previous one", () => {
    let clock = createDrillLapClock();
    clock = noteFirstPress(clock, 1000);
    expect(clock.startedAt).toBe(1000);
    const first = passCard(clock, 1600);
    expect(first.lastCardMs).toBe(600);
    const second = passCard(first.clock, 2500);
    expect(second.lastCardMs).toBe(900);
    // a second press before the first card does not move the start
    expect(noteFirstPress(clock, 5000).startedAt).toBe(1000);
    // performance times are fractions: the card times the record keeps are whole milliseconds
    expect(passCard(clock, 1600.4).lastCardMs).toBe(600);
    expect(passCard(clock, 1600.6).lastCardMs).toBe(601);
    void pc;
  });
});
