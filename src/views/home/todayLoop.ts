// 今日のループ (P8.9-04, rules decided by the human; see contracts/P8.9-ui-direction.md §10).
// Pure selection over device-local state. Nothing here is written to the Vault.

export const TODAY_LOOP_STORAGE_KEY = "loop-vault:today-loop:v1";
export const TODAY_LOOP_RECENT_DAYS = 7;
export const TODAY_LOOP_PINNED_WEIGHT = 3;

export interface TodayLoopCandidate {
  /** `${ideaId}:${blockId}` */
  id: string;
  pinned: boolean;
}

export interface TodayLoopState {
  version: 1;
  /** Progressions that appeared as the day's loop, per local date (YYYY-MM-DD). */
  shown: Record<string, string[]>;
  /** The loop currently chosen for each date, including a same-day swap. */
  picks: Record<string, string>;
}

export function emptyTodayLoopState(): TodayLoopState {
  return { version: 1, shown: {}, picks: {} };
}

export function localDateKey(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Today's loop: stable for the day; skips the last 7 days' loops unless that leaves nothing; pinned ×3. */
export function resolveTodayLoop(
  candidates: readonly TodayLoopCandidate[],
  state: TodayLoopState,
  date: string,
): { id?: string; state: TodayLoopState } {
  const ordered = [...candidates].sort((left, right) => left.id.localeCompare(right.id));
  if (!ordered.length) return { state };
  const kept = state.picks[date];
  if (kept && ordered.some((candidate) => candidate.id === kept)) return { id: kept, state };
  const recent = recentlyShown(state, date);
  const fresh = ordered.filter((candidate) => !recent.has(candidate.id));
  const id = weightedPick(fresh.length ? fresh : ordered, date);
  return { id, state: withPick(state, date, id) };
}

/** Swap: skip the current loop, today's earlier loops and the last 7 days'; relax to "not the current one". */
export function swapTodayLoop(
  candidates: readonly TodayLoopCandidate[],
  state: TodayLoopState,
  date: string,
): { id?: string; previousId?: string; state: TodayLoopState } {
  const ordered = [...candidates].sort((left, right) => left.id.localeCompare(right.id));
  const previousId = state.picks[date];
  const excluded = recentlyShown(state, date);
  (state.shown[date] ?? []).forEach((id) => excluded.add(id));
  if (previousId) excluded.add(previousId);
  const fresh = ordered.filter((candidate) => !excluded.has(candidate.id));
  const pool = fresh.length ? fresh : ordered.filter((candidate) => candidate.id !== previousId);
  if (!pool.length) return { id: previousId, previousId, state };
  const id = weightedPick(pool, `${date}#${state.shown[date]?.length ?? 0}`);
  return { id, previousId, state: withPick(state, date, id) };
}

/** Undo a swap: restore the previous loop and forget that the swapped-in one appeared. */
export function undoTodayLoopSwap(state: TodayLoopState, date: string, swappedId: string, previousId: string): TodayLoopState {
  return {
    ...state,
    picks: { ...state.picks, [date]: previousId },
    shown: { ...state.shown, [date]: (state.shown[date] ?? []).filter((id) => id !== swappedId) },
  };
}

function recentlyShown(state: TodayLoopState, date: string): Set<string> {
  const ids = new Set<string>();
  for (let offset = 1; offset <= TODAY_LOOP_RECENT_DAYS; offset += 1) {
    (state.shown[shiftDate(date, -offset)] ?? []).forEach((id) => ids.add(id));
  }
  return ids;
}

function withPick(state: TodayLoopState, date: string, id: string): TodayLoopState {
  const shown = state.shown[date] ?? [];
  return prune({
    version: 1,
    picks: { ...state.picks, [date]: id },
    shown: { ...state.shown, [date]: shown.includes(id) ? shown : [...shown, id] },
  }, date);
}

/** Keep two weeks of history; older days cannot affect the 7-day rule. */
function prune(state: TodayLoopState, date: string): TodayLoopState {
  const oldest = shiftDate(date, -14);
  const keep = <T,>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).filter(([day]) => day >= oldest));
  return { version: 1, shown: keep(state.shown), picks: keep(state.picks) };
}

function weightedPick(pool: readonly TodayLoopCandidate[], seed: string): string {
  const weights = pool.map((candidate) => (candidate.pinned ? TODAY_LOOP_PINNED_WEIGHT : 1));
  let point = seededUnit(seed) * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < pool.length; index += 1) {
    point -= weights[index];
    if (point < 0) return pool[index].id;
  }
  return pool[pool.length - 1].id;
}

/** FNV-1a then a mulberry32 step: a deterministic float in [0, 1) per seed. */
function seededUnit(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  let value = (hash + 0x6d2b79f5) | 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return localDateKey(new Date(year, month - 1, day + days));
}

export interface TodayLoopStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadTodayLoopState(storage?: TodayLoopStorage): TodayLoopState {
  try {
    const raw = (storage ?? window.localStorage).getItem(TODAY_LOOP_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<TodayLoopState> : undefined;
    if (parsed?.version !== 1 || !isRecord(parsed.shown) || !isRecord(parsed.picks)) return emptyTodayLoopState();
    const shown = Object.fromEntries(Object.entries(parsed.shown)
      .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((id) => typeof id === "string")));
    const picks = Object.fromEntries(Object.entries(parsed.picks)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    return { version: 1, shown, picks };
  } catch {
    return emptyTodayLoopState();
  }
}

export function saveTodayLoopState(state: TodayLoopState, storage?: TodayLoopStorage): void {
  try {
    (storage ?? window.localStorage).setItem(TODAY_LOOP_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Home stays usable when device storage is unavailable; the loop is then per session.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
