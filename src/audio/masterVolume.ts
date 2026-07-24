import * as Tone from "tone";

const storageKey = "loop-vault:master-volume:v1";
const minimumDecibels = -60;

export const DEFAULT_MASTER_VOLUME = 100;

export interface MasterVolumeDestination {
  mute: boolean;
  volume: { value: number };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function normalizeMasterVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MASTER_VOLUME;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function masterVolumePercentToDb(percent: number): number {
  const normalized = normalizeMasterVolume(percent);
  if (normalized === 0) return minimumDecibels;
  return Math.max(minimumDecibels, 20 * Math.log10(normalized / 100));
}

export function loadMasterVolume(
  storage: StorageLike = window.localStorage,
): number {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return DEFAULT_MASTER_VOLUME;
    const parsed = JSON.parse(raw) as { version?: unknown; volume?: unknown };
    return parsed.version === 1
      ? normalizeMasterVolume(parsed.volume)
      : DEFAULT_MASTER_VOLUME;
  } catch {
    return DEFAULT_MASTER_VOLUME;
  }
}

export function saveMasterVolume(
  volume: number,
  storage: StorageLike = window.localStorage,
): void {
  try {
    storage.setItem(storageKey, JSON.stringify({
      version: 1,
      volume: normalizeMasterVolume(volume),
    }));
  } catch {
    // Audio remains usable when local preferences cannot be persisted.
  }
}

export function applyMasterVolume(
  volume: number,
  destination: MasterVolumeDestination = Tone.getDestination(),
): void {
  const normalized = normalizeMasterVolume(volume);
  destination.volume.value = masterVolumePercentToDb(normalized);
  destination.mute = normalized === 0;
}
