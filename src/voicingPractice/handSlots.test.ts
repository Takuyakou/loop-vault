import { describe, expect, it } from "vitest";
import type { RankedFingering } from "../domain/progressionFingering";
import { FINGER_ORDER, buildHandSlots, degreeFromRoot, slotDegree } from "./handSlots";

const ranked = (pitches: number[], fingers: RankedFingering["fingers"]): RankedFingering => ({ id: "t", status: "supported", signature: "t", pitches, fingers });
const BB = 10;

describe("hand finger slots (P5.26.2-02)", () => {
  it("always has five slots per hand, whatever the notes: left 1 / right 5 and left 3 / right 2 have the same shape", () => {
    const shapes = [
      [buildHandSlots("left", [46]), buildHandSlots("right", [60, 64, 67, 71, 74])],
      [buildHandSlots("left", [40, 47, 52]), buildHandSlots("right", [67, 71])],
      [buildHandSlots("left", []), buildHandSlots("right", [])],
    ];
    for (const [left, right] of shapes) {
      expect(left!.slots.map((slot) => slot.finger)).toEqual([5, 4, 3, 2, 1]);
      expect(right!.slots.map((slot) => slot.finger)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("an unused finger is an empty slot: Bb9's right hand skips R4", () => {
    const right = buildHandSlots("right", [68, 72, 74, 78], ranked([68, 72, 74, 78], [1, 2, 3, 5]));
    expect(right.slots.map((slot) => slot.pitch)).toEqual([68, 72, 74, undefined, 78]);
    const left = buildHandSlots("left", [46], ranked([46], [5]));
    expect(left.slots.map((slot) => slot.pitch)).toEqual([46, undefined, undefined, undefined, undefined]);
  });

  it("the screen order L5…L1 | R1…R5 is the keyboard's low-to-high order", () => {
    const left = buildHandSlots("left", [40, 47, 52], ranked([40, 47, 52], [5, 3, 1]));
    const right = buildHandSlots("right", [60, 64, 67, 71, 74], ranked([60, 64, 67, 71, 74], [1, 2, 3, 4, 5]));
    const onScreen = [...FINGER_ORDER.left.map((_, i) => left.slots[i]!), ...right.slots].flatMap((slot) => slot.pitch === undefined ? [] : [slot.pitch]);
    expect(onScreen).toEqual([...onScreen].sort((a, b) => a - b));
    expect(onScreen).toEqual([40, 47, 52, 60, 64, 67, 71, 74]);
  });

  it("without a fingering the notes keep pitch order from the outer finger (L5 / R1)", () => {
    expect(buildHandSlots("left", [43, 47]).slots.map((slot) => slot.pitch)).toEqual([43, 47, undefined, undefined, undefined]);
    expect(buildHandSlots("right", [60, 64]).slots.map((slot) => slot.pitch)).toEqual([60, 64, undefined, undefined, undefined]);
  });

  it("a sixth note does not add a slot: it goes to the overflow list", () => {
    const six = buildHandSlots("right", [60, 62, 64, 65, 67, 69]);
    expect(six.slots).toHaveLength(5);
    expect(six.overflow).toEqual([69]);
    expect(buildHandSlots("right", [60, 64]).overflow).toEqual([]);
  });
});

describe("degrees are root-relative (P5.26.2-02)", () => {
  it("F♯ over a B♭ root is ♭13 (it was a dash)", () => {
    expect(degreeFromRoot(BB, 78)).toBe("b13");
    expect(slotDegree(new Map([[68, "b7"]]), BB, 78)).toEqual({ label: "b13", chordTone: false });
  });

  it("every pitch gets a name for every root, and the chord's own name wins", () => {
    for (let root = 0; root < 12; root += 1) {
      for (let pitch = 40; pitch < 52; pitch += 1) {
        expect(degreeFromRoot(root, pitch)).toMatch(/^(1|b9|9|#9|3|11|#11|5|b13|13|b7|7)$/);
      }
    }
    expect(slotDegree(new Map([[64, "3"]]), 0, 64)).toEqual({ label: "3", chordTone: true });
  });

  it("is a dash only when the root is unknown", () => {
    expect(slotDegree(new Map(), undefined, 60)).toEqual({ label: "—", chordTone: false });
    expect(slotDegree(new Map(), 0, 60).label).toBe("1");
  });
});
