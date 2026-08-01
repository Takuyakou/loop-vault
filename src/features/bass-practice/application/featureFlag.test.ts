import { describe, expect, test } from "vitest";
import {
  BASS_PRACTICE_DEGREE_ECHO_FEATURE_STORAGE_KEY,
  DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED,
  isBassPracticeDegreeEchoEnabled,
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
