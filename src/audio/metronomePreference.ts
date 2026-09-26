const STORAGE_KEY = "loop-vault:metronome-enabled:v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadMetronomeEnabled(storage: StorageLike = window.localStorage): boolean {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return false;
    const parsed = JSON.parse(raw) as { version?: unknown; enabled?: unknown };
    return parsed.version === 1 && parsed.enabled === true;
  } catch {
    return false;
  }
}

export function saveMetronomeEnabled(enabled: boolean, storage: StorageLike = window.localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, enabled }));
  } catch {
    // A blocked preference store must not prevent playback.
  }
}
