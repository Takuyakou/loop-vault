import { describe, expect, it } from "vitest";
import {
  applyMasterVolume,
  loadMasterVolume,
  masterVolumePercentToDb,
  normalizeMasterVolume,
  saveMasterVolume,
} from "./masterVolume";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
  };
}

describe("master volume", () => {
  it("normalizes values to an integer percentage", () => {
    expect(normalizeMasterVolume(-5)).toBe(0);
    expect(normalizeMasterVolume(45.6)).toBe(46);
    expect(normalizeMasterVolume(120)).toBe(100);
    expect(normalizeMasterVolume(Number.NaN)).toBe(100);
  });

  it("loads and persists the versioned local preference", () => {
    const storage = memoryStorage();
    expect(loadMasterVolume(storage)).toBe(100);
    saveMasterVolume(63, storage);
    expect(loadMasterVolume(storage)).toBe(63);
    expect(loadMasterVolume(memoryStorage("not-json"))).toBe(100);
  });

  it("maps percentage logarithmically and uses mute at zero", () => {
    expect(masterVolumePercentToDb(100)).toBe(0);
    expect(masterVolumePercentToDb(50)).toBeCloseTo(-6.0206, 3);
    expect(masterVolumePercentToDb(0)).toBe(-60);

    const destination = { mute: false, volume: { value: 0 } };
    applyMasterVolume(0, destination);
    expect(destination).toEqual({ mute: true, volume: { value: -60 } });
    applyMasterVolume(50, destination);
    expect(destination.mute).toBe(false);
    expect(destination.volume.value).toBeCloseTo(-6.0206, 3);
  });
});
