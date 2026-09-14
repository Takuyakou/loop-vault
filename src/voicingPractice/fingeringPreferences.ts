import {
  physicalVoicingSignature,
  type FingerNumber,
  type FingeringHand,
} from "../domain/progressionFingering";

const storageKey = "loop-vault:voicing-loop-fingering-preferences:v1";
const maximumEntries = 256;

export interface PersonalFingering {
  readonly signature: string;
  readonly hand: FingeringHand;
  readonly pitches: readonly number[];
  readonly fingers: readonly FingerNumber[];
  readonly updatedAt: number;
}

export interface FingeringPreferenceCollection {
  readonly version: 1;
  readonly entries: readonly PersonalFingering[];
}

export function loadFingeringPreferences(
  storage: StorageLike = window.localStorage,
): FingeringPreferenceCollection {
  const raw = storage.getItem(storageKey);
  if (!raw) return emptyCollection();
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; entries?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return emptyCollection();
    const entries = parsed.entries
      .filter(isPersonalFingering)
      .slice(0, maximumEntries);
    return { version: 1, entries };
  } catch {
    return emptyCollection();
  }
}

export function savePersonalFingering(
  collection: FingeringPreferenceCollection,
  input: Pick<PersonalFingering, "hand" | "pitches" | "fingers">,
  storage: StorageLike = window.localStorage,
  now: () => number = Date.now,
): FingeringPreferenceCollection {
  const signature = physicalVoicingSignature(input.hand, input.pitches);
  const candidate = {
    signature,
    hand: input.hand,
    pitches: [...new Set(input.pitches)].sort((a, b) => a - b),
    fingers: [...input.fingers],
    updatedAt: now(),
  };
  if (!isPersonalFingering(candidate)) return collection;
  const entries = [candidate, ...collection.entries.filter((entry) => entry.signature !== signature)]
    .slice(0, maximumEntries);
  const next = { version: 1 as const, entries };
  storage.setItem(storageKey, JSON.stringify(next));
  return next;
}

export function resetPersonalFingering(
  collection: FingeringPreferenceCollection,
  signature: string,
  storage: StorageLike = window.localStorage,
): FingeringPreferenceCollection {
  const next = {
    version: 1 as const,
    entries: collection.entries.filter((entry) => entry.signature !== signature),
  };
  storage.setItem(storageKey, JSON.stringify(next));
  return next;
}

export function findPersonalFingering(
  collection: FingeringPreferenceCollection,
  signature: string | undefined,
): PersonalFingering | undefined {
  return signature ? collection.entries.find((entry) => entry.signature === signature) : undefined;
}

export function isValidFingering(
  hand: FingeringHand,
  pitches: readonly number[],
  fingers: readonly number[],
): fingers is readonly FingerNumber[] {
  if (pitches.length < 1 || pitches.length > 5 || fingers.length !== pitches.length) return false;
  if (new Set(pitches).size !== pitches.length || new Set(fingers).size !== fingers.length) return false;
  if (pitches.some((pitch) => !Number.isInteger(pitch) || pitch < 0 || pitch > 127)) return false;
  if (fingers.some((finger) => !Number.isInteger(finger) || finger < 1 || finger > 5)) return false;
  for (let index = 1; index < pitches.length; index += 1) {
    if (pitches[index - 1]! >= pitches[index]!) return false;
    if (hand === "right" && fingers[index - 1]! >= fingers[index]!) return false;
    if (hand === "left" && fingers[index - 1]! <= fingers[index]!) return false;
  }
  return true;
}

function isPersonalFingering(value: unknown): value is PersonalFingering {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<PersonalFingering>;
  if (entry.hand !== "right" && entry.hand !== "left") return false;
  if (!Array.isArray(entry.pitches) || !Array.isArray(entry.fingers)) return false;
  if (!isValidFingering(entry.hand, entry.pitches, entry.fingers)) return false;
  return typeof entry.signature === "string"
    && entry.signature === physicalVoicingSignature(entry.hand, entry.pitches)
    && typeof entry.updatedAt === "number"
    && Number.isFinite(entry.updatedAt);
}

function emptyCollection(): FingeringPreferenceCollection {
  return { version: 1, entries: [] };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
