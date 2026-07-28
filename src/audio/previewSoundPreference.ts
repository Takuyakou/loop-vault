import type { PreviewSound } from "./chordPreview";

const storageKey = "loop-vault:preview-sound:v1";

export const DEFAULT_PREVIEW_SOUND: PreviewSound = "piano";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function normalizePreviewSound(value: unknown): PreviewSound {
  return value === "electric-piano" ? value : DEFAULT_PREVIEW_SOUND;
}

export function loadPreviewSound(
  storage: StorageLike = window.localStorage,
): PreviewSound {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return DEFAULT_PREVIEW_SOUND;
    const parsed = JSON.parse(raw) as { version?: unknown; sound?: unknown };
    return parsed.version === 1
      ? normalizePreviewSound(parsed.sound)
      : DEFAULT_PREVIEW_SOUND;
  } catch {
    return DEFAULT_PREVIEW_SOUND;
  }
}

export function savePreviewSound(
  sound: PreviewSound,
  storage: StorageLike = window.localStorage,
): void {
  try {
    storage.setItem(storageKey, JSON.stringify({
      version: 1,
      sound: normalizePreviewSound(sound),
    }));
  } catch {
    // Preview remains usable when local preferences cannot be persisted.
  }
}
