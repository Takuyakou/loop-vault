import { describe, expect, test } from "vitest";
import {
  BASS_PRACTICE_DEGREE_ECHO_FEATURE_STORAGE_KEY,
  DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED,
  isBassPracticeDegreeEchoEnabled,
  isBassPracticeRhythmEchoEnabled,
} from "./featureFlag";

function storage(value: string | null) {
  return {
    getItem: (key: string) => (
      key === BASS_PRACTICE_DEGREE_ECHO_FEATURE_STORAGE_KEY ? value : null
    ),
  };
}

describe("Degree Echo feature flag", () => {
  test("is independently disabled by default", () => {
    expect(DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED).toBe(false);
    expect(isBassPracticeDegreeEchoEnabled(storage(null))).toBe(false);
    expect(isBassPracticeDegreeEchoEnabled(storage("invalid"))).toBe(false);
  });

  test("supports explicit local enablement and rollback", () => {
    expect(isBassPracticeDegreeEchoEnabled(storage("true"))).toBe(true);
    expect(isBassPracticeDegreeEchoEnabled(storage("false"))).toBe(false);
  });

  test("fails closed when application flag storage is unavailable", () => {
    expect(isBassPracticeDegreeEchoEnabled({
      getItem() {
        throw new DOMException("Storage denied", "SecurityError");
      },
    })).toBe(false);
  });
});
  test("keeps Rhythm Echo separately disabled and supports its own rollback", () => {
    const rhythmKey = "loop-vault:bass-practice-rhythm-echo-enabled:v1";
    const rhythmStorage = (value: string | null) => ({ getItem: (key: string) => key === rhythmKey ? value : null });
    expect(isBassPracticeRhythmEchoEnabled(rhythmStorage(null))).toBe(false);
    expect(isBassPracticeRhythmEchoEnabled(rhythmStorage("true"))).toBe(true);
    expect(isBassPracticeRhythmEchoEnabled(rhythmStorage("false"))).toBe(false);
  });
