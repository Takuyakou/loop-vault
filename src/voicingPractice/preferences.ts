import {
  normalizeVoicingPracticePreferences,
  type VoicingPracticePreferences,
} from "../domain/voicingPractice";

const storageKey = "loop-vault:voicing-practice-preferences:v1";

export function loadVoicingPracticePreferences(
  storage: StorageLike = window.localStorage,
): VoicingPracticePreferences {
  const raw = storage.getItem(storageKey);
  if (!raw) return normalizeVoicingPracticePreferences(undefined);
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; preferences?: unknown };
    return parsed.version === 1
      ? normalizeVoicingPracticePreferences(parsed.preferences)
      : normalizeVoicingPracticePreferences(undefined);
  } catch {
    return normalizeVoicingPracticePreferences(undefined);
  }
}

export function saveVoicingPracticePreferences(
  preferences: VoicingPracticePreferences,
  storage: StorageLike = window.localStorage,
): void {
  storage.setItem(storageKey, JSON.stringify({
    version: 1,
    preferences: normalizeVoicingPracticePreferences(preferences),
  }));
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
