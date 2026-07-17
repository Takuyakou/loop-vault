import { z } from "zod";
import type { PreferredMidiInput } from "./types";

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LiveMidiPreferences {
  preferredInput?: PreferredMidiInput;
  miniBounds?: WindowBounds;
  alwaysOnTop?: boolean;
  showHistory?: boolean;
}

const preferredInputSchema = z.object({
  backendId: z.string().min(1).optional(),
  name: z.string().min(1),
  previousIndex: z.number().int().nonnegative().optional(),
}).strict();

const windowBoundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
}).strict();

export const liveMidiPreferencesSchema = z.object({
  preferredInput: preferredInputSchema.optional(),
  miniBounds: windowBoundsSchema.optional(),
  alwaysOnTop: z.boolean().default(true),
  showHistory: z.boolean().default(true),
}).strict();

const storageKey = "loop-vault:live-midi-preferences:v1";

export function loadLiveMidiPreferences(storage: StorageLike = window.localStorage): LiveMidiPreferences {
  const raw = storage.getItem(storageKey);
  if (!raw) return defaultLiveMidiPreferences();
  try {
    const result = liveMidiPreferencesSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : defaultLiveMidiPreferences();
  } catch {
    return defaultLiveMidiPreferences();
  }
}

export function saveLiveMidiPreferences(
  preferences: LiveMidiPreferences,
  storage: StorageLike = window.localStorage,
): void {
  const parsed = liveMidiPreferencesSchema.parse(preferences);
  storage.setItem(storageKey, JSON.stringify(parsed));
}

export function defaultLiveMidiPreferences(): LiveMidiPreferences {
  return { alwaysOnTop: true, showHistory: true };
}

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}
