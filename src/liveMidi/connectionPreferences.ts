import { z } from "zod";

/**
 * P14 §2: 「起動した時に自動でつなぐ」. Its own key, because the Live MIDI preferences schema is strict:
 * an older build reading an extra field there would lose the saved input.
 * A missing or broken value means on. A manual disconnect is never saved here (R5).
 */
export const LIVE_MIDI_CONNECTION_KEY = "loop-vault:live-midi-connection:v1";

const schema = z.object({ autoConnect: z.boolean() }).strict();

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadAutoConnect(storage: StorageLike | undefined = defaultStorage()): boolean {
  try {
    const raw = storage?.getItem(LIVE_MIDI_CONNECTION_KEY);
    if (!raw) return true;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.autoConnect : true;
  } catch {
    return true;
  }
}

export function saveAutoConnect(autoConnect: boolean, storage: StorageLike | undefined = defaultStorage()): void {
  try {
    storage?.setItem(LIVE_MIDI_CONNECTION_KEY, JSON.stringify({ autoConnect }));
  } catch {
    // Device-local only; without storage the choice lasts until the app closes.
  }
}
