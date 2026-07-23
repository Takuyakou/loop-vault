import type { VoicingPracticePreferences } from "./types";

export const DEFAULT_VOICING_PRACTICE_PREFERENCES: VoicingPracticePreferences = {
  maxLeftHandSpanSemitones: 12,
  maxRightHandSpanSemitones: 12,
  allowGlobalOctaveShift: true,
};

export function normalizeVoicingPracticePreferences(
  value: unknown,
): VoicingPracticePreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_VOICING_PRACTICE_PREFERENCES };
  }
  const candidate = value as Partial<VoicingPracticePreferences>;
  return {
    maxLeftHandSpanSemitones: normalizeSpan(candidate.maxLeftHandSpanSemitones),
    maxRightHandSpanSemitones: normalizeSpan(candidate.maxRightHandSpanSemitones),
    allowGlobalOctaveShift: typeof candidate.allowGlobalOctaveShift === "boolean"
      ? candidate.allowGlobalOctaveShift
      : DEFAULT_VOICING_PRACTICE_PREFERENCES.allowGlobalOctaveShift,
  };
}

function normalizeSpan(value: unknown): 12 | 14 | 16 {
  return value === 14 || value === 16 ? value : 12;
}
