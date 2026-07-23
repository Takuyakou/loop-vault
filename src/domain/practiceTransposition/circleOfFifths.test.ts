import { describe, expect, it } from "vitest";
import {
  createL4KeyPool,
  createL5KeyPool,
  getCanonicalKey,
  L4_FIFTH_OFFSETS,
} from ".";

describe("L4 key pool", () => {
  it("uses the stable nearest-first fifth offset order", () => {
    expect(L4_FIFTH_OFFSETS).toEqual([-1, 1, -2, 2, -3, 3]);
    expect(createL4KeyPool(0)).toEqual([5, 7, 10, 2, 3, 9]);
    expect(createL4KeyPool(0).map((pitchClass) => (
      getCanonicalKey(pitchClass, "major").canonicalName
    ))).toEqual(["F", "G", "Bb", "D", "Eb", "A"]);
  });

  it.each([
    ["C major", 0],
    ["F# major", 6],
    ["Bb minor", 10],
  ] as const)("returns six unique non-source keys for %s", (_name, source) => {
    const pool = createL4KeyPool(source);
    expect(pool).toHaveLength(6);
    expect(new Set(pool).size).toBe(6);
    expect(pool).not.toContain(source);
  });

  it("normalizes source pitch classes", () => {
    expect(createL4KeyPool(12)).toEqual(createL4KeyPool(0));
    expect(createL4KeyPool(-1)).toEqual(createL4KeyPool(11));
  });

  it.each([Number.NaN, Number.NEGATIVE_INFINITY, 0.5])(
    "rejects invalid L4 source pitch class %s",
    (source) => {
      expect(() => createL4KeyPool(source)).toThrow(
        "Pitch class must be a finite integer",
      );
    },
  );
});

describe("L5 key pool", () => {
  it("returns all pitch classes in fifth-circle order", () => {
    expect(createL5KeyPool(0)).toEqual([
      0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5,
    ]);
  });

  it.each([0, 6, 10])("includes normalized source %s exactly once", (source) => {
    const pool = createL5KeyPool(source);
    expect(pool).toHaveLength(12);
    expect(new Set(pool).size).toBe(12);
    expect(pool.filter((value) => value === source)).toHaveLength(1);
    expect(pool[0]).toBe(source);
  });

  it("keeps the selected mode when pitch classes become catalog keys", () => {
    expect(createL5KeyPool(10).map((pitchClass) => (
      getCanonicalKey(pitchClass, "minor").mode
    )).every((mode) => mode === "minor")).toBe(true);
  });

  it("rejects invalid L5 source pitch classes", () => {
    expect(() => createL5KeyPool(Number.POSITIVE_INFINITY)).toThrow(
      "Pitch class must be a finite integer",
    );
  });
});
