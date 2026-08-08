export const BASS_PRACTICE_DEGREE_ECHO_FEATURE_STORAGE_KEY = "loop-vault:bass-practice-degree-echo-enabled:v1";
export const BASS_PRACTICE_RHYTHM_ECHO_FEATURE_STORAGE_KEY = "loop-vault:bass-practice-rhythm-echo-enabled:v1";
export const BASS_PRACTICE_BASSLINE_ECHO_FEATURE_STORAGE_KEY = "loop-vault:bass-practice-bassline-echo-enabled:v1";
/** P5.17 Record & Compare, independent of the three Echo mode flags. */
export const BASS_PRACTICE_RECORD_COMPARE_FEATURE_STORAGE_KEY = "loop-vault:bass-practice-record-compare-enabled:v1";
/** P5.18 Chord Context, independent of the existing Echo and Record & Compare flags. */
export const BASS_PRACTICE_CHORD_CONTEXT_FEATURE_STORAGE_KEY = "loop-vault:bass-practice-chord-context-enabled:v1";

/**
 * P5.16 is a shipped product surface. Keep it on in a normal build, while an
 * explicit local `false` remains an immediate, non-destructive rollback.
 */
export const DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED = true;
export const DEFAULT_BASS_PRACTICE_RHYTHM_ECHO_ENABLED = true;
export const DEFAULT_BASS_PRACTICE_BASSLINE_ECHO_ENABLED = true;
/**
 * Final production default for Record & Compare is `true`. It ships enabled with
 * an explicit local `false` as immediate, non-destructive rollback, independent
 * of the three Echo mode flags.
 */
export const DEFAULT_BASS_PRACTICE_RECORD_COMPARE_ENABLED = true;
/** Chord Context ships enabled; an explicit local `false` is a non-destructive rollback. */
export const DEFAULT_BASS_PRACTICE_CHORD_CONTEXT_ENABLED = true;

interface StorageLike { getItem(key: string): string | null; }

export function isBassPracticeDegreeEchoEnabled(storage?: StorageLike): boolean { return readFlag(BASS_PRACTICE_DEGREE_ECHO_FEATURE_STORAGE_KEY, DEFAULT_BASS_PRACTICE_DEGREE_ECHO_ENABLED, storage); }
export function isBassPracticeRhythmEchoEnabled(storage?: StorageLike): boolean { return readFlag(BASS_PRACTICE_RHYTHM_ECHO_FEATURE_STORAGE_KEY, DEFAULT_BASS_PRACTICE_RHYTHM_ECHO_ENABLED, storage); }
export function isBassPracticeBasslineEchoEnabled(storage?: StorageLike): boolean { return readFlag(BASS_PRACTICE_BASSLINE_ECHO_FEATURE_STORAGE_KEY, DEFAULT_BASS_PRACTICE_BASSLINE_ECHO_ENABLED, storage); }
export function isBassPracticeRecordCompareEnabled(storage?: StorageLike): boolean { return readFlag(BASS_PRACTICE_RECORD_COMPARE_FEATURE_STORAGE_KEY, DEFAULT_BASS_PRACTICE_RECORD_COMPARE_ENABLED, storage); }
export function isBassPracticeChordContextEnabled(storage?: StorageLike): boolean { return readFlag(BASS_PRACTICE_CHORD_CONTEXT_FEATURE_STORAGE_KEY, DEFAULT_BASS_PRACTICE_CHORD_CONTEXT_ENABLED, storage); }

function readFlag(key: string, fallback: boolean, storage?: StorageLike): boolean {
  let target = storage;
  if (!target && typeof window !== "undefined") { try { target = window.localStorage; } catch { return fallback; } }
  if (!target) return fallback;
  try { const value = target.getItem(key); return value === "true" ? true : value === "false" ? false : fallback; } catch { return fallback; }
}