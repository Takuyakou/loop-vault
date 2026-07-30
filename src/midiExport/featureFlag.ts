export const MIDI_EXPORT_FEATURE_STORAGE_KEY =
  "loop-vault:progression-midi-export-enabled:v1";
export const DEFAULT_MIDI_EXPORT_FEATURE_ENABLED = false;

interface StorageLike {
  getItem(key: string): string | null;
}

export function isProgressionMidiExportEnabled(
  storage?: StorageLike,
): boolean {
  const target = storage ?? (
    typeof window === "undefined" ? undefined : window.localStorage
  );
  if (!target) return DEFAULT_MIDI_EXPORT_FEATURE_ENABLED;
  const value = target.getItem(MIDI_EXPORT_FEATURE_STORAGE_KEY);
  if (value === "true") return true;
  if (value === "false") return false;
  return DEFAULT_MIDI_EXPORT_FEATURE_ENABLED;
}
