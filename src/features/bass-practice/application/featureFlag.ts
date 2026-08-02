export const BASS_PRACTICE_DEGREE_ECHO_FEATURE_STORAGE_KEY = "loop-vault:bass-practice-degree-echo-enabled:v1";
export const BASS_PRACTICE_RHYTHM_ECHO_FEATURE_STORAGE_KEY = "loop-vault:bass-practice-rhythm-echo-enabled:v1";
export const DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED = false;
export const DEFAULT_BASS_PRACTICE_RHYTHM_ECHO_ENABLED = false;

interface StorageLike { getItem(key: string): string | null; }

export function isBassPracticeDegreeEchoEnabled(storage?: StorageLike): boolean { return readFlag(BASS_PRACTICE_DEGREE_ECHO_FEATURE_STORAGE_KEY, DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED, storage); }
export function isBassPracticeRhythmEchoEnabled(storage?: StorageLike): boolean { return readFlag(BASS_PRACTICE_RHYTHM_ECHO_FEATURE_STORAGE_KEY, DEFAULT_BASS_PRACTICE_RHYTHM_ECHO_ENABLED, storage); }

function readFlag(key: string, fallback: boolean, storage?: StorageLike): boolean {
  let target = storage;
  if (!target && typeof window !== "undefined") { try { target = window.localStorage; } catch { return fallback; } }
  if (!target) return fallback;
  try { const value = target.getItem(key); return value === "true" ? true : value === "false" ? false : fallback; } catch { return fallback; }
}
