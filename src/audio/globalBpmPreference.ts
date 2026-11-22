const STORAGE_KEY = "loop-vault:global-bpm:v1";

export const GLOBAL_BPM_MIN = 30;
export const GLOBAL_BPM_MAX = 240;
export const GLOBAL_BPM_DEFAULT = 120;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Any number becomes a whole BPM inside 30–240; anything else becomes the default. */
export function clampGlobalBpm(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return GLOBAL_BPM_DEFAULT;
  return Math.max(GLOBAL_BPM_MIN, Math.min(GLOBAL_BPM_MAX, Math.round(value)));
}

export function loadGlobalBpm(storage: StorageLike = window.localStorage): number {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return GLOBAL_BPM_DEFAULT;
    const parsed = JSON.parse(raw) as { version?: unknown; bpm?: unknown };
    return parsed.version === 1 ? clampGlobalBpm(parsed.bpm) : GLOBAL_BPM_DEFAULT;
  } catch {
    return GLOBAL_BPM_DEFAULT;
  }
}

export function saveGlobalBpm(bpm: number, storage: StorageLike = window.localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, bpm: clampGlobalBpm(bpm) }));
  } catch {
    // A blocked preference store must not prevent playback.
  }
}
