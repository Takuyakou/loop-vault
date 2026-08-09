import { describe, expect, test } from "vitest";
import {
  BASS_PRACTICE_BASSLINE_ECHO_FEATURE_STORAGE_KEY,
  BASS_PRACTICE_CHORD_CONTEXT_FEATURE_STORAGE_KEY,
  BASS_PRACTICE_DEGREE_ECHO_FEATURE_STORAGE_KEY,
  BASS_PRACTICE_RECORD_COMPARE_FEATURE_STORAGE_KEY,
  BASS_PRACTICE_RHYTHM_ECHO_FEATURE_STORAGE_KEY,
  BASS_PRACTICE_ROOT_MOTION_FEATURE_STORAGE_KEY,
  DEFAULT_BASS_PRACTICE_BASSLINE_ECHO_ENABLED,
  DEFAULT_BASS_PRACTICE_CHORD_CONTEXT_ENABLED,
  DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED,
  DEFAULT_BASS_PRACTICE_RECORD_COMPARE_ENABLED,
  DEFAULT_BASS_PRACTICE_RHYTHM_ECHO_ENABLED,
  DEFAULT_BASS_PRACTICE_ROOT_MOTION_ENABLED,
  isBassPracticeBasslineEchoEnabled,
  isBassPracticeChordContextEnabled,
  isBassPracticeDegreeEchoEnabled,
  isBassPracticeRecordCompareEnabled,
  isBassPracticeRhythmEchoEnabled,
  isBassPracticeRootMotionEnabled,
} from "./featureFlag";

function storage(key: string, value: string | null) {
  return {
    getItem: (requestedKey: string) => requestedKey === key ? value : null,
  };
}

describe("Bass Practice production feature flags", () => {
  test("ships every P5.16 mode enabled when no rollback value is stored", () => {
    expect(DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED).toBe(true);
    expect(DEFAULT_BASS_PRACTICE_RHYTHM_ECHO_ENABLED).toBe(true);
    expect(DEFAULT_BASS_PRACTICE_BASSLINE_ECHO_ENABLED).toBe(true);
    expect(DEFAULT_BASS_PRACTICE_CHORD_CONTEXT_ENABLED).toBe(true);
    expect(DEFAULT_BASS_PRACTICE_ROOT_MOTION_ENABLED).toBe(true);
    expect(isBassPracticeDegreeEchoEnabled(storage(BASS_PRACTICE_DEGREE_ECHO_FEATURE_STORAGE_KEY, null))).toBe(true);
    expect(isBassPracticeRhythmEchoEnabled(storage(BASS_PRACTICE_RHYTHM_ECHO_FEATURE_STORAGE_KEY, "invalid"))).toBe(true);
    expect(isBassPracticeBasslineEchoEnabled(storage(BASS_PRACTICE_BASSLINE_ECHO_FEATURE_STORAGE_KEY, null))).toBe(true);
    expect(isBassPracticeChordContextEnabled(storage(BASS_PRACTICE_CHORD_CONTEXT_FEATURE_STORAGE_KEY, null))).toBe(true);
    expect(isBassPracticeRootMotionEnabled(storage(BASS_PRACTICE_ROOT_MOTION_FEATURE_STORAGE_KEY, null))).toBe(true);
  });

  test("keeps independently stored explicit false values as a rollback", () => {
    expect(isBassPracticeDegreeEchoEnabled(storage(BASS_PRACTICE_DEGREE_ECHO_FEATURE_STORAGE_KEY, "false"))).toBe(false);
    expect(isBassPracticeRhythmEchoEnabled(storage(BASS_PRACTICE_RHYTHM_ECHO_FEATURE_STORAGE_KEY, "false"))).toBe(false);
    expect(isBassPracticeBasslineEchoEnabled(storage(BASS_PRACTICE_BASSLINE_ECHO_FEATURE_STORAGE_KEY, "false"))).toBe(false);
    expect(isBassPracticeChordContextEnabled(storage(BASS_PRACTICE_CHORD_CONTEXT_FEATURE_STORAGE_KEY, "false"))).toBe(false);
    expect(isBassPracticeRootMotionEnabled(storage(BASS_PRACTICE_ROOT_MOTION_FEATURE_STORAGE_KEY, "false"))).toBe(false);
  });

  test("uses the production defaults when application flag storage is unavailable", () => {
    const unavailableStorage = {
      getItem() {
        throw new DOMException("Storage denied", "SecurityError");
      },
    };
    expect(isBassPracticeDegreeEchoEnabled(unavailableStorage)).toBe(true);
    expect(isBassPracticeRhythmEchoEnabled(unavailableStorage)).toBe(true);
    expect(isBassPracticeBasslineEchoEnabled(unavailableStorage)).toBe(true);
    expect(isBassPracticeChordContextEnabled(unavailableStorage)).toBe(true);
    expect(isBassPracticeRecordCompareEnabled(unavailableStorage)).toBe(true);
  });

  test("Record & Compare ships enabled with an independent explicit-false rollback", () => {
    expect(DEFAULT_BASS_PRACTICE_RECORD_COMPARE_ENABLED).toBe(true);
    expect(isBassPracticeRecordCompareEnabled(storage(BASS_PRACTICE_RECORD_COMPARE_FEATURE_STORAGE_KEY, null))).toBe(true);
    expect(isBassPracticeRecordCompareEnabled(storage(BASS_PRACTICE_RECORD_COMPARE_FEATURE_STORAGE_KEY, "invalid"))).toBe(true);
    expect(isBassPracticeRecordCompareEnabled(storage(BASS_PRACTICE_RECORD_COMPARE_FEATURE_STORAGE_KEY, "false"))).toBe(false);
    // independent of the Degree Echo flag
    expect(isBassPracticeRecordCompareEnabled(storage(BASS_PRACTICE_DEGREE_ECHO_FEATURE_STORAGE_KEY, "false"))).toBe(true);
  });
});