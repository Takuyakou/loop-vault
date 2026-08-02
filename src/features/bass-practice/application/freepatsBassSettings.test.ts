import { describe, expect, it } from "vitest";
import { readBassPracticeTimbreSetting, writeBassPracticeTimbreSetting } from "./freepatsBassSettings";

describe("FreePats bass timbre setting", () => {
  it("defaults to the offline FreePats timbre and persists an explicit synth rollback", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    expect(readBassPracticeTimbreSetting(storage)).toBe("freepats");
    writeBassPracticeTimbreSetting("synth", storage);
    expect(readBassPracticeTimbreSetting(storage)).toBe("synth");
    writeBassPracticeTimbreSetting("freepats", storage);
    expect(readBassPracticeTimbreSetting(storage)).toBe("freepats");
  });
});