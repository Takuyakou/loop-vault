/**
 * P22-03 §0: the Voicing Loop's own last practice, for the Home's 「続きから」. The recents list
 * (`recentProgressions.ts`) has no date, so this one small note of this PC only carries the time:
 * `loop-vault:voicing-loop-last:v1`. It is never a practice record: the Vault, the records and the
 * exports are only read, and a broken value is treated as 「なし」.
 */
export const LAST_VOICING_PRACTICE_KEY = "loop-vault:voicing-loop-last:v1";
export const LAST_VOICING_PRACTICE_VERSION = 1;

export interface LastVoicingPracticeReference {
  readonly ideaId: string;
  readonly blockId: string;
}

export interface LastVoicingPractice {
  readonly reference: LastVoicingPracticeReference;
  /** ISO instant of when the practice screen was opened. */
  readonly at: string;
}

export interface LastPracticeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const defaultStorage = (): LastPracticeStorage | undefined => {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160;

const isReference = (value: unknown): value is LastVoicingPracticeReference => {
  if (!value || typeof value !== "object") return false;
  const reference = value as { ideaId?: unknown; blockId?: unknown };
  return isText(reference.ideaId) && isText(reference.blockId);
};

const isInstant = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const time = new Date(value);
  return !Number.isNaN(time.getTime());
};

/** The last practice this PC kept, or undefined when there is none (or it cannot be read). */
export function readLastVoicingPractice(storage: LastPracticeStorage | undefined = defaultStorage()): LastVoicingPractice | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(LAST_VOICING_PRACTICE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    const value = parsed as { version?: unknown; reference?: unknown; at?: unknown };
    if (value.version !== LAST_VOICING_PRACTICE_VERSION) return undefined;
    if (!isReference(value.reference) || !isInstant(value.at)) return undefined;
    return { reference: { ideaId: value.reference.ideaId, blockId: value.reference.blockId }, at: value.at };
  } catch {
    return undefined;
  }
}

/** Notes that this progression's practice screen was opened (the screen goes on even if the write fails). */
export function rememberLastVoicingPractice(
  reference: LastVoicingPracticeReference,
  at: string = new Date().toISOString(),
  storage: LastPracticeStorage | undefined = defaultStorage(),
): void {
  if (!storage || !isReference(reference) || !isInstant(at)) return;
  try {
    storage.setItem(LAST_VOICING_PRACTICE_KEY, JSON.stringify({ version: LAST_VOICING_PRACTICE_VERSION, reference, at }));
  } catch {
    /* the screen goes on without it */
  }
}
