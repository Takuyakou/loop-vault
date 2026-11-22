/**
 * P23-08 §1: how often a progression was opened for practice (Voicing Loop / Chord Dojo), a small note of this PC
 * only (`loop-vault:practice-opens:v1`). Like `lastPractice.ts`: a broken value reads as empty and a failed write
 * never throws. Viewing in the Vault, the Home's ▶ and Bass Practice are not counted.
 */
import { localDateKey } from "./todayLoop";

export const PRACTICE_OPENS_KEY = "loop-vault:practice-opens:v1";
export const PRACTICE_OPENS_VERSION = 1;
export const PRACTICE_OPENS_KEEP_DAYS = 14;
export const PRACTICE_OPENS_MAX = 500;
const DAY = 24 * 60 * 60 * 1000;

export type PracticeOpenVia = "voicing-loop" | "chord-dojo";

export interface PracticeOpen {
  readonly ideaId: string;
  readonly blockId: string;
  readonly via: PracticeOpenVia;
  /** ISO instant of when the practice was opened. */
  readonly at: string;
}

export interface PracticeOpensStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const defaultStorage = (): PracticeOpensStorage | undefined => {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160;
const timeOf = (at: string) => new Date(at).getTime();

const isOpen = (value: unknown): value is PracticeOpen => {
  if (!value || typeof value !== "object") return false;
  const open = value as Partial<Record<keyof PracticeOpen, unknown>>;
  return isText(open.ideaId) && isText(open.blockId)
    && (open.via === "voicing-loop" || open.via === "chord-dojo")
    && typeof open.at === "string" && !Number.isNaN(timeOf(open.at));
};

/** Every open this PC kept (only the readable ones), or [] when there is none. */
export function loadPracticeOpens(storage: PracticeOpensStorage | undefined = defaultStorage()): PracticeOpen[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(PRACTICE_OPENS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const value = parsed as { version?: unknown; opens?: unknown };
    if (value.version !== PRACTICE_OPENS_VERSION || !Array.isArray(value.opens)) return [];
    return value.opens.filter(isOpen).map(({ ideaId, blockId, via, at }) => ({ ideaId, blockId, via, at }));
  } catch {
    return [];
  }
}

/** Adds one open; keeps the last 14 days, newest first, at most 500. The practice goes on even if the write fails. */
export function recordPracticeOpen(
  reference: { readonly ideaId: string; readonly blockId: string },
  via: PracticeOpenVia,
  now: Date = new Date(),
  storage: PracticeOpensStorage | undefined = defaultStorage(),
): void {
  if (!storage) return;
  const open = { ideaId: reference.ideaId, blockId: reference.blockId, via, at: now.toISOString() };
  if (!isOpen(open)) return;
  const oldest = now.getTime() - PRACTICE_OPENS_KEEP_DAYS * DAY;
  const opens = [open, ...loadPracticeOpens(storage)]
    .filter((entry) => timeOf(entry.at) >= oldest)
    .sort((left, right) => timeOf(right.at) - timeOf(left.at))
    .slice(0, PRACTICE_OPENS_MAX);
  try {
    storage.setItem(PRACTICE_OPENS_KEY, JSON.stringify({ version: PRACTICE_OPENS_VERSION, opens }));
  } catch {
    /* the practice goes on without it */
  }
}

export interface TopOpenedProgression {
  readonly ideaId: string;
  readonly blockId: string;
  readonly count: number;
  readonly lastAt: string;
}

/** The (at most 3) progressions opened most in the 7 days before `now`; ties go to the one opened last. */
export function topOpenedProgressions(
  opens: readonly PracticeOpen[],
  now: Date,
  exists: (ideaId: string, blockId: string) => boolean,
): TopOpenedProgression[] {
  const since = now.getTime() - 7 * DAY;
  const counts = new Map<string, { ideaId: string; blockId: string; count: number; lastAt: string }>();
  for (const open of opens) {
    if (timeOf(open.at) <= since || !exists(open.ideaId, open.blockId)) continue;
    const key = JSON.stringify([open.ideaId, open.blockId]);
    const entry = counts.get(key);
    if (!entry) counts.set(key, { ideaId: open.ideaId, blockId: open.blockId, count: 1, lastAt: open.at });
    else {
      entry.count += 1;
      if (timeOf(open.at) > timeOf(entry.lastAt)) entry.lastAt = open.at;
    }
  }
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || timeOf(right.lastAt) - timeOf(left.lastAt))
    .slice(0, 3);
}

/** The days (this PC's date, `YYYY-MM-DD`) this practice was opened. */
export function practicedDays(opens: readonly PracticeOpen[], via: PracticeOpenVia, _now?: Date): Set<string> {
  return new Set(opens.filter((open) => open.via === via).map((open) => localDateKey(new Date(open.at))));
}
