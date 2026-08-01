export const BASS_PRACTICE_DEGREE_ECHO_FEATURE_STORAGE_KEY =
  "loop-vault:bass-practice-degree-echo-enabled:v1";

export const DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED = false;

interface StorageLike {
  getItem(key: string): string | null;
}

export function isBassPracticeDegreeEchoEnabled(storage?: StorageLike): boolean {
  let target = storage;
  if (!target && typeof window !== "undefined") {
    try {
      target = window.localStorage;
    } catch {
      return DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED;
    }
  }
  if (!target) return DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED;
  let value: string | null;
  try {
    value = target.getItem(BASS_PRACTICE_DEGREE_ECHO_FEATURE_STORAGE_KEY);
  } catch {
    return DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED;
  }
  if (value === "true") return true;
  if (value === "false") return false;
  return DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED;
}
