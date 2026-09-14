import { describe, expect, it } from "vitest";
import {
  findPersonalFingering,
  isValidFingering,
  loadFingeringPreferences,
  resetPersonalFingering,
  savePersonalFingering,
} from "./fingeringPreferences";

describe("voicing loop fingering preferences", () => {
  it("stores only a versioned physical voicing signature and validated fingers", () => {
    const storage = memoryStorage();
    const saved = savePersonalFingering(loadFingeringPreferences(storage), {
      hand: "right",
      pitches: [60, 64, 67],
      fingers: [1, 3, 5],
    }, storage, () => 123);
    expect(findPersonalFingering(saved, "R:60,64,67")).toEqual({
      signature: "R:60,64,67",
      hand: "right",
      pitches: [60, 64, 67],
      fingers: [1, 3, 5],
      updatedAt: 123,
    });
    expect(storage.value).not.toContain("path");
  });

  it("deduplicates, orders by recent update, resets, and caps the collection", () => {
    const storage = memoryStorage();
    let collection = loadFingeringPreferences(storage);
    for (let index = 0; index < 260; index += 1) {
      collection = savePersonalFingering(collection, {
        hand: index % 2 ? "left" : "right",
        pitches: [index % 128],
        fingers: [index % 2 ? 5 : 1],
      }, storage, () => index);
    }
    expect(collection.entries.length).toBeLessThanOrEqual(256);
    collection = savePersonalFingering(collection, {
      hand: "right", pitches: [60, 64], fingers: [1, 5],
    }, storage, () => 999);
    expect(collection.entries[0]?.signature).toBe("R:60,64");
    expect(collection.entries.filter((entry) => entry.signature === "R:60,64")).toHaveLength(1);
    expect(resetPersonalFingering(collection, "R:60,64", storage).entries.some((entry) => entry.signature === "R:60,64")).toBe(false);
  });

  it("fails corrupt, future, and invalid values closed", () => {
    expect(loadFingeringPreferences(memoryStorage("{"))).toEqual({ version: 1, entries: [] });
    expect(loadFingeringPreferences(memoryStorage(JSON.stringify({ version: 2, entries: [] })))).toEqual({ version: 1, entries: [] });
    expect(isValidFingering("right", [60, 64], [5, 1])).toBe(false);
    expect(isValidFingering("left", [60, 64], [5, 1])).toBe(true);
    expect(isValidFingering("right", [60, 64, 67, 71, 74, 77], [1, 2, 3, 4, 5, 5])).toBe(false);
  });
});

function memoryStorage(initial?: string) {
  return {
    value: initial ?? "",
    getItem: () => initial ?? null,
    setItem(_key: string, value: string) {
      initial = value;
      this.value = value;
    },
  };
}
