import { describe, expect, it } from "vitest";
import { GLOBAL_BPM_DEFAULT, clampGlobalBpm, loadGlobalBpm, saveGlobalBpm } from "./globalBpmPreference";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set("loop-vault:global-bpm:v1", initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

const stored = (bpm: unknown, version: unknown = 1) => memoryStorage(JSON.stringify({ version, bpm }));

describe("global BPM preference", () => {
  it("starts at 120 when nothing is stored", () => {
    expect(GLOBAL_BPM_DEFAULT).toBe(120);
    expect(loadGlobalBpm(memoryStorage())).toBe(120);
  });

  it("reads a stored value", () => {
    expect(loadGlobalBpm(stored(96))).toBe(96);
  });

  it("keeps the value inside 30–240 and whole", () => {
    expect(loadGlobalBpm(stored(10))).toBe(30);
    expect(loadGlobalBpm(stored(999))).toBe(240);
    expect(loadGlobalBpm(stored(100.6))).toBe(101);
    expect(clampGlobalBpm(Number.NaN)).toBe(120);
  });

  it("uses the default for a value that is not a number, broken JSON and another version", () => {
    expect(loadGlobalBpm(stored("abc"))).toBe(120);
    expect(loadGlobalBpm(memoryStorage("{broken"))).toBe(120);
    expect(loadGlobalBpm(stored(96, 2))).toBe(120);
  });

  it("stores a clamped value", () => {
    const storage = memoryStorage();
    saveGlobalBpm(300, storage);
    expect(loadGlobalBpm(storage)).toBe(240);
  });

  it("does not throw when the store throws", () => {
    const broken = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(loadGlobalBpm(broken)).toBe(120);
    expect(() => saveGlobalBpm(90, broken)).not.toThrow();
  });
});
