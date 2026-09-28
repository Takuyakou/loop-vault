import { describe, expect, it } from "vitest";
import {
  emptyTodayLoopState,
  loadTodayLoopState,
  localDateKey,
  resolveTodayLoop,
  saveTodayLoopState,
  swapTodayLoop,
  TODAY_LOOP_STORAGE_KEY,
  undoTodayLoopSwap,
  type TodayLoopCandidate,
  type TodayLoopState,
} from "./todayLoop";

const candidates = (count: number, pinned: string[] = []): TodayLoopCandidate[] =>
  Array.from({ length: count }, (_, index) => ({ id: `idea:block-${index}`, pinned: pinned.includes(`idea:block-${index}`) }));

function dayOffset(base: string, days: number): string {
  const [year, month, day] = base.split("-").map(Number);
  return localDateKey(new Date(year, month - 1, day + days));
}

describe("today's loop", () => {
  it("uses the device's local date", () => {
    expect(localDateKey(new Date(2026, 8, 28, 23, 59))).toBe("2026-09-28");
    expect(localDateKey(new Date(2026, 0, 3, 0, 0))).toBe("2026-01-03");
  });

  it("returns the same progression for the same day, even from a fresh state", () => {
    const pool = candidates(12);
    const first = resolveTodayLoop(pool, emptyTodayLoopState(), "2026-09-28");
    const reopened = resolveTodayLoop(pool, first.state, "2026-09-28");
    const otherDevice = resolveTodayLoop([...pool].reverse(), emptyTodayLoopState(), "2026-09-28");
    expect(first.id).toBeDefined();
    expect(reopened.id).toBe(first.id);
    expect(reopened.state).toBe(first.state);
    expect(otherDevice.id).toBe(first.id);
  });

  it("skips progressions shown in the last 7 days", () => {
    const pool = candidates(10);
    let state = emptyTodayLoopState();
    const seen: string[] = [];
    for (let day = 0; day < 8; day += 1) {
      const result = resolveTodayLoop(pool, state, dayOffset("2026-09-01", day));
      expect(seen.slice(-7)).not.toContain(result.id);
      seen.push(result.id!);
      state = result.state;
    }
  });

  it("drops the 7-day rule when every progression was shown recently", () => {
    const pool = candidates(2);
    const state: TodayLoopState = { version: 1, picks: {}, shown: { "2026-09-27": ["idea:block-0"], "2026-09-26": ["idea:block-1"] } };
    const result = resolveTodayLoop(pool, state, "2026-09-28");
    expect(pool.map(({ id }) => id)).toContain(result.id);
    const outside: TodayLoopState = { version: 1, picks: {}, shown: { "2026-09-20": ["idea:block-0", "idea:block-1"] } };
    expect(resolveTodayLoop(pool, outside, "2026-09-28").id).toBe(resolveTodayLoop(pool, emptyTodayLoopState(), "2026-09-28").id);
  });

  it("makes favorite progressions three times as likely", () => {
    const pool = candidates(4, ["idea:block-2"]);
    const counts = new Map<string, number>();
    for (let day = 0; day < 3000; day += 1) {
      const id = resolveTodayLoop(pool, emptyTodayLoopState(), dayOffset("2020-01-01", day)).id!;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const pinnedShare = (counts.get("idea:block-2") ?? 0) / 3000;
    expect(pinnedShare).toBeGreaterThan(0.44);
    expect(pinnedShare).toBeLessThan(0.56);
  });

  it("swaps away from the current and recent loops, keeps the swap for the day, and undoes it", () => {
    const pool = candidates(10);
    const today = "2026-09-28";
    const start: TodayLoopState = { version: 1, picks: {}, shown: { [dayOffset(today, -1)]: ["idea:block-3"] } };
    const first = resolveTodayLoop(pool, start, today);
    const swapped = swapTodayLoop(pool, first.state, today);
    expect(swapped.previousId).toBe(first.id);
    expect(swapped.id).not.toBe(first.id);
    expect(swapped.id).not.toBe("idea:block-3");
    expect(resolveTodayLoop(pool, swapped.state, today).id).toBe(swapped.id);

    const again = swapTodayLoop(pool, swapped.state, today);
    expect([first.id, swapped.id]).not.toContain(again.id);

    const undone = undoTodayLoopSwap(swapped.state, today, swapped.id!, swapped.previousId!);
    expect(resolveTodayLoop(pool, undone, today).id).toBe(first.id);
    expect(undone.shown[today]).toEqual([first.id]);
  });

  it("swaps between the only two progressions and does nothing with one", () => {
    const two = candidates(2);
    const first = resolveTodayLoop(two, emptyTodayLoopState(), "2026-09-28");
    const swapped = swapTodayLoop(two, first.state, "2026-09-28");
    expect(swapped.id).not.toBe(first.id);
    const back = swapTodayLoop(two, swapped.state, "2026-09-28");
    expect(back.id).toBe(first.id);

    const one = candidates(1);
    const only = resolveTodayLoop(one, emptyTodayLoopState(), "2026-09-28");
    expect(swapTodayLoop(one, only.state, "2026-09-28").id).toBe(only.id);
  });

  it("forgets a kept pick whose progression was deleted", () => {
    const pool = candidates(5);
    const state: TodayLoopState = { version: 1, picks: { "2026-09-28": "gone:block" }, shown: { "2026-09-28": ["gone:block"] } };
    const result = resolveTodayLoop(pool, state, "2026-09-28");
    expect(pool.map(({ id }) => id)).toContain(result.id);
  });

  it("keeps only two weeks of device-local history and never throws on bad storage", () => {
    const pool = candidates(3);
    const old: TodayLoopState = { version: 1, picks: { "2026-08-01": "idea:block-0" }, shown: { "2026-08-01": ["idea:block-0"] } };
    const result = resolveTodayLoop(pool, old, "2026-09-28");
    expect(Object.keys(result.state.shown)).toEqual(["2026-09-28"]);

    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => void memory.set(key, value) };
    saveTodayLoopState(result.state, storage);
    expect(loadTodayLoopState(storage)).toEqual(result.state);
    memory.set(TODAY_LOOP_STORAGE_KEY, "{not json");
    expect(loadTodayLoopState(storage)).toEqual(emptyTodayLoopState());
    expect(() => saveTodayLoopState(result.state, { getItem: () => null, setItem: () => { throw new Error("full"); } })).not.toThrow();
  });
});
