import { describe, expect, it } from "vitest";
import {
  loadVoicingPracticePreferences,
  saveVoicingPracticePreferences,
} from "./preferences";

describe("voicing practice preference storage", () => {
  it("stores only the three versioned app preferences", () => {
    const storage = memoryStorage();
    saveVoicingPracticePreferences({
      maxLeftHandSpanSemitones: 14,
      maxRightHandSpanSemitones: 16,
      allowGlobalOctaveShift: false,
    }, storage);
    expect(loadVoicingPracticePreferences(storage)).toEqual({
      maxLeftHandSpanSemitones: 14,
      maxRightHandSpanSemitones: 16,
      allowGlobalOctaveShift: false,
    });
    expect(JSON.parse(storage.value ?? "{}")).toEqual({
      version: 1,
      preferences: {
        maxLeftHandSpanSemitones: 14,
        maxRightHandSpanSemitones: 16,
        allowGlobalOctaveShift: false,
      },
    });
  });

  it("falls back safely for corrupt or unknown versions", () => {
    const corrupt = memoryStorage("{");
    expect(loadVoicingPracticePreferences(corrupt)).toEqual({
      maxLeftHandSpanSemitones: 12,
      maxRightHandSpanSemitones: 12,
      allowGlobalOctaveShift: true,
    });
    const future = memoryStorage(JSON.stringify({ version: 2, preferences: {} }));
    expect(loadVoicingPracticePreferences(future)).toEqual({
      maxLeftHandSpanSemitones: 12,
      maxRightHandSpanSemitones: 12,
      allowGlobalOctaveShift: true,
    });
  });
});

function memoryStorage(initial?: string) {
  return {
    value: initial,
    getItem: () => initial ?? null,
    setItem(_key: string, value: string) {
      initial = value;
      this.value = value;
    },
  };
}
