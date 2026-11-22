import { describe, expect, it } from "vitest";
import {
  AdvancedRepository,
  MemoryAdvancedStorage,
  appendAdvancedTrial,
  attemptById,
  clearAdvancedActive,
  createAdvancedStore,
  createAdvancedTrial,
  parseAdvancedStore,
  startAdvancedAttempt,
  validateAdvancedStore,
} from "./store";
import { advancedItemById, advancedSetIds } from "./bank";
import type { AdvancedStore, AdvancedTrial } from "./types";

const AT = "2026-11-18T00:00:00.000Z";
const NEXT = "2026-11-19T06:00:00.000Z";

function storeWithAttempt(practice = false): { store: AdvancedStore; attemptId: string } {
  const ids = advancedSetIds(4, "sameDay");
  const store = startAdvancedAttempt(createAdvancedStore(), { level: 4, block: "sameDay", setId: "sameDay", itemIds: ids, practice }, new Date(AT), { attemptId: practice ? "p-1" : "official-1" });
  return { store, attemptId: practice ? "p-1" : "official-1" };
}

function correct(store: AdvancedStore, attemptId: string, itemId: string, at: string): AdvancedTrial {
  const attempt = attemptById(store, attemptId)!;
  return createAdvancedTrial({ attempt, itemId, result: "correct", sealedNotes: [60, 64, 67], startedAt: at, sealedAt: at });
}

describe("P23-45 advanced store", () => {
  it("round-trips attempts and trials through the envelope", async () => {
    const storage = new MemoryAdvancedStorage();
    const repository = new AdvancedRepository(storage);
    const { store, attemptId } = storeWithAttempt();
    const item = advancedItemById(advancedSetIds(4, "sameDay")[0]!)!;
    await repository.save(appendAdvancedTrial(store, correct(store, attemptId, item.id, AT)));
    const loaded = await new AdvancedRepository(storage).load();
    expect(loaded.kind).toBe("ok");
    if (loaded.kind !== "ok") return;
    expect(loaded.store.trials).toHaveLength(1);
    expect(loaded.store.active).toBe("official-1");
    expect(loaded.store.attempts[0]!.itemIds).toHaveLength(20);
    expect(JSON.parse(storage.committed!).app).toBe("loopvault-guided-course-advanced");
    expect(JSON.parse(storage.committed!).fileVersion).toBe(1);
  });

  it("keeps free practice separate from the official attempt", () => {
    const { store, attemptId } = storeWithAttempt();
    const withFree = startAdvancedAttempt(store, { level: 5, block: "sameDay", setId: "practice", itemIds: advancedSetIds(5, "sameDay"), practice: true }, new Date(AT), { attemptId: "free-1" });
    expect(withFree.active).toBe(attemptId);
    expect(withFree.free).toBe("free-1");
    const cleared = clearAdvancedActive(withFree, "free");
    expect(cleared.active).toBe(attemptId);
    expect(cleared.free).toBeUndefined();
    const bothCleared = clearAdvancedActive(clearAdvancedActive(cleared, "official"), "free");
    expect(bothCleared.active).toBeUndefined();
  });

  it("does not rewrite a trial with the same id and different contents", () => {
    const { store, attemptId } = storeWithAttempt();
    const item = advancedItemById(advancedSetIds(4, "sameDay")[0]!)!;
    const trial = correct(store, attemptId, item.id, AT);
    const first = appendAdvancedTrial(store, trial);
    expect(appendAdvancedTrial(first, trial)).toBe(first);
    expect(() => appendAdvancedTrial(first, { ...trial, result: "wrong" })).toThrow();
  });

  it("quarantines unreadable data without re-initialising it", async () => {
    const storage = new MemoryAdvancedStorage();
    storage.committed = "{damaged";
    const loaded = await new AdvancedRepository(storage).load();
    expect(loaded.kind).toBe("unreadable");
    expect(storage.committed).toBe("{damaged");
    const name = await new AdvancedRepository(storage).quarantine();
    expect(name).toContain("guided-course-advanced-v1.corrupt-");
    expect(storage.committed).toBeUndefined();
  });

  it("keeps evidence from another bank version instead of calling it corrupt", async () => {
    const { store } = storeWithAttempt();
    const saved = JSON.stringify({ app: "loopvault-guided-course-advanced", fileVersion: 1, ...store, bankVersion: "p23-45.advanced.v0" });
    const loaded = parseAdvancedStore(saved);
    expect(loaded.kind).toBe("ok");
    if (loaded.kind !== "ok") return;
    expect(loaded.store.bankVersion).toBe("p23-45.advanced.v0");
    expect(loaded.store.attempts).toHaveLength(1);
  });

  it("rejects malformed attempts, duplicate ids and dangling active pointers", () => {
    const { store } = storeWithAttempt();
    expect(validateAdvancedStore(store).ok).toBe(true);
    expect(validateAdvancedStore({ ...store, active: "missing" }).ok).toBe(false);
    expect(validateAdvancedStore({ ...store, schema: "loopvault-guided-course" }).ok).toBe(false);
    expect(validateAdvancedStore({ ...store, attempts: [store.attempts[0], store.attempts[0]] }).ok).toBe(false);
    expect(validateAdvancedStore({ ...store, attempts: [{ ...store.attempts[0], itemIds: [] }] }).ok).toBe(false);
    expect(validateAdvancedStore({ ...store, trials: [{ ...correct(store, "official-1", advancedSetIds(4, "sameDay")[0]!, AT), sealedNotes: [200] }] }).ok).toBe(false);
    expect(validateAdvancedStore({ ...store, trials: [{ ...correct(store, "official-1", advancedSetIds(4, "sameDay")[0]!, AT), practice: "no" }] }).ok).toBe(false);
  });

  it("never touches the Lv1–3 course key or the ordinary Dojo store", async () => {
    const storage = new MemoryAdvancedStorage();
    const repository = new AdvancedRepository(storage);
    const { store } = storeWithAttempt();
    await repository.save(store);
    expect(storage.committed!.includes("loop-vault:guided-course-v1")).toBe(false);
    expect(storage.committed!.includes("chord-dojo")).toBe(false);
    expect(store.schema).not.toBe("loopvault-guided-course");
  });

  it("dates the delayed attempt independently of the same-day one", () => {
    const { store } = storeWithAttempt();
    const delay = startAdvancedAttempt(store, { level: 4, block: "delay", setId: "delay", itemIds: advancedSetIds(4, "delay") }, new Date(NEXT), { attemptId: "official-2" });
    expect(delay.attempts).toHaveLength(2);
    expect(delay.active).toBe("official-2");
    expect(delay.attempts[1]!.startedAt).toBe(NEXT);
  });
});
