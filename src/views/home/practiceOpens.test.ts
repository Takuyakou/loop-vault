import { describe, expect, it } from "vitest";
import {
  loadPracticeOpens,
  practicedDays,
  PRACTICE_OPENS_KEY,
  recordPracticeOpen,
  topOpenedProgressions,
  type PracticeOpen,
  type PracticeOpensStorage,
} from "./practiceOpens";

const memory = (initial?: string): PracticeOpensStorage & { value: string | null } => {
  const state = { value: initial ?? null };
  return {
    get value() { return state.value; },
    set value(next: string | null) { state.value = next; },
    getItem: (key) => (key === PRACTICE_OPENS_KEY ? state.value : null),
    setItem: (key, value) => { if (key === PRACTICE_OPENS_KEY) state.value = value; },
  };
};

const now = new Date(2026, 10, 13, 12, 0);
const minutes = (count: number) => count * 60_000;
const before = (ms: number) => new Date(now.getTime() - ms);
const DAY = 24 * 60 * minutes(1);
const open = (ideaId: string, blockId: string, via: PracticeOpen["via"], at: Date): PracticeOpen => ({ ideaId, blockId, via, at: at.toISOString() });
const always = () => true;

describe("practice opens (P23-08 §1)", () => {
  it("T1: one recorded open reads back the same", () => {
    const storage = memory();
    recordPracticeOpen({ ideaId: "idea", blockId: "block" }, "chord-dojo", now, storage);
    expect(loadPracticeOpens(storage)).toEqual([{ ideaId: "idea", blockId: "block", via: "chord-dojo", at: now.toISOString() }]);
    expect(JSON.parse(storage.value!)).toEqual({ version: 1, opens: [{ ideaId: "idea", blockId: "block", via: "chord-dojo", at: now.toISOString() }] });
  });

  it("T2: a broken value reads as empty and a broken entry is dropped alone", () => {
    const good = open("idea", "block", "voicing-loop", now);
    expect(loadPracticeOpens(memory("{not json"))).toEqual([]);
    expect(loadPracticeOpens(memory(JSON.stringify({ version: 2, opens: [good] })))).toEqual([]);
    expect(loadPracticeOpens(memory(JSON.stringify({ version: 1, opens: { 0: good } })))).toEqual([]);
    expect(loadPracticeOpens(memory(JSON.stringify({ version: 1, opens: [
      good,
      { ideaId: "idea", blockId: "block", via: "voicing-loop" },
      { ideaId: "idea", via: "chord-dojo", at: now.toISOString() },
      { ideaId: "idea", blockId: "block", via: "bass-practice", at: now.toISOString() },
      { ideaId: "idea", blockId: "block", via: "chord-dojo", at: "not a date" },
    ] })))).toEqual([good]);
    expect(loadPracticeOpens(memory(JSON.stringify({ version: 1, opens: [{ ideaId: "idea" }] })))).toEqual([]);
  });

  it("T3: an open older than 14 days goes on the next write; 13 days stays", () => {
    const old = open("old", "block", "voicing-loop", before(14 * DAY + minutes(1)));
    const kept = open("kept", "block", "voicing-loop", before(13 * DAY));
    const storage = memory(JSON.stringify({ version: 1, opens: [kept, old] }));
    recordPracticeOpen({ ideaId: "new", blockId: "block" }, "voicing-loop", now, storage);
    expect(loadPracticeOpens(storage).map((entry) => entry.ideaId)).toEqual(["new", "kept"]);
  });

  it("T4: the 501st open keeps 500, dropping the oldest", () => {
    const opens = Array.from({ length: 500 }, (_, index) => open(`idea-${index}`, "block", "chord-dojo", before(minutes(index + 1))));
    const storage = memory(JSON.stringify({ version: 1, opens }));
    recordPracticeOpen({ ideaId: "newest", blockId: "block" }, "chord-dojo", now, storage);
    const read = loadPracticeOpens(storage);
    expect(read).toHaveLength(500);
    expect(read[0]!.ideaId).toBe("newest");
    expect(read.some((entry) => entry.ideaId === "idea-499")).toBe(false);
    expect(read[499]!.ideaId).toBe("idea-498");
  });

  it("T5: a failing write never throws", () => {
    const storage: PracticeOpensStorage = { getItem: () => null, setItem: () => { throw new Error("full"); } };
    expect(() => recordPracticeOpen({ ideaId: "idea", blockId: "block" }, "voicing-loop", now, storage)).not.toThrow();
  });

  it("T6: counts both practices per progression, most first, newer on ties, three at most", () => {
    const opens = [
      open("A", "a", "voicing-loop", before(minutes(60))),
      open("A", "a", "voicing-loop", before(minutes(50))),
      open("A", "a", "chord-dojo", before(minutes(40))),
      open("B", "b", "voicing-loop", before(minutes(30))),
      open("B", "b", "chord-dojo", before(minutes(29))),
      open("C", "c", "voicing-loop", before(minutes(20))),
      open("C", "c", "voicing-loop", before(minutes(10))),
      open("D", "d", "chord-dojo", before(minutes(5))),
    ];
    expect(topOpenedProgressions(opens, now, always)).toEqual([
      { ideaId: "A", blockId: "a", count: 3, lastAt: before(minutes(40)).toISOString() },
      { ideaId: "C", blockId: "c", count: 2, lastAt: before(minutes(10)).toISOString() },
      { ideaId: "B", blockId: "b", count: 2, lastAt: before(minutes(29)).toISOString() },
    ]);
  });

  it("T7: exactly 7 days ago is not counted; 6 days 23 hours is", () => {
    const opens = [
      open("week", "block", "voicing-loop", before(7 * DAY)),
      open("inside", "block", "voicing-loop", before(6 * DAY + 23 * minutes(60))),
    ];
    expect(topOpenedProgressions(opens, now, always)).toEqual([
      { ideaId: "inside", blockId: "block", count: 1, lastAt: before(6 * DAY + 23 * minutes(60)).toISOString() },
    ]);
  });

  it("T8: a progression that no longer exists is left out and the next moves up", () => {
    const opens = [
      open("A", "a", "voicing-loop", before(minutes(5))),
      open("A", "a", "voicing-loop", before(minutes(4))),
      open("A", "a", "voicing-loop", before(minutes(3))),
      open("B", "b", "voicing-loop", before(minutes(9))),
      open("B", "b", "voicing-loop", before(minutes(8))),
      open("C", "c", "voicing-loop", before(minutes(7))),
      open("D", "d", "voicing-loop", before(minutes(6))),
    ];
    expect(topOpenedProgressions(opens, now, (ideaId) => ideaId !== "A").map((entry) => [entry.ideaId, entry.count]))
      .toEqual([["B", 2], ["D", 1], ["C", 1]]);
  });

  it("T9: practiced days are this PC's dates, one per day, of one practice only", () => {
    const opens = [
      open("A", "a", "voicing-loop", new Date(2026, 10, 12, 9, 0)),
      open("B", "b", "voicing-loop", new Date(2026, 10, 12, 23, 59)),
      open("A", "a", "voicing-loop", new Date(2026, 10, 13, 0, 1)),
      open("A", "a", "chord-dojo", new Date(2026, 10, 10, 10, 0)),
    ];
    expect([...practicedDays(opens, "voicing-loop", now)].sort()).toEqual(["2026-11-12", "2026-11-13"]);
    expect([...practicedDays(opens, "chord-dojo", now)]).toEqual(["2026-11-10"]);
  });
});
