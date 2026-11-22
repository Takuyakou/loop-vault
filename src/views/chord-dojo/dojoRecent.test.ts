import { describe, expect, it } from "vitest";
import { DOJO_RECENT_KEY, DOJO_RECENT_MAX, createDojoRecentStore, readDojoRecent, type DojoRecentStorage } from "./dojoRecent";

const memory = (initial?: string): DojoRecentStorage & { value?: string; failWrite?: boolean } => {
  const store = {
    value: initial,
    failWrite: false,
    getItem: (key: string) => key === DOJO_RECENT_KEY ? store.value ?? null : null,
    setItem: (key: string, value: string) => {
      if (store.failWrite) throw new Error("quota");
      if (key === DOJO_RECENT_KEY) store.value = value;
    },
  };
  return store;
};
const at = (minute: number) => new Date(Date.UTC(2026, 10, 9, 0, minute)).toISOString();

describe("P20 recent practices", () => {
  it("keeps at most three, newest first", () => {
    const store = createDojoRecentStore(memory());
    for (let index = 0; index < 4; index += 1) {
      store.getState().remember({ kind: "standard", id: `builtin-${index}`, key: index, at: at(index) });
    }
    expect(store.getState().entries).toHaveLength(DOJO_RECENT_MAX);
    expect(store.getState().entries.map((entry) => entry.id)).toEqual(["builtin-3", "builtin-2", "builtin-1"]);
    expect(store.getState().entries[0]!.at).toBe(at(3));
  });

  it("updates the same kind and id instead of making a second entry", () => {
    const store = createDojoRecentStore(memory());
    store.getState().remember({ kind: "jazz", id: "jazz-001", key: 0, stage: "see", at: at(1) });
    store.getState().remember({ kind: "jazz", id: "jazz-001", key: 7, stage: "recall", at: at(2) });
    expect(store.getState().entries).toHaveLength(1);
    expect(store.getState().entries[0]).toMatchObject({ key: 7, stage: "recall" });
    // the same id in another kind is another practice
    store.getState().remember({ kind: "drill", id: "jazz-001", key: 2, stage: "see", at: at(3) });
    expect(store.getState().entries).toHaveLength(2);
  });

  it("drops one broken entry and keeps the rest", () => {
    const storage = memory(JSON.stringify({ version: 1, entries: [
      { kind: "standard", id: "ok", key: 3, at: at(1) },
      { kind: "standard", id: "bad-key", key: 12, at: at(2) },
      { kind: "jazz", id: "bad-stage", key: 3, at: at(3) },
      { kind: "original", id: "original-ok", key: -6, at: at(4) },
      { kind: "ear", id: "ear", at: "not-a-date" },
    ] }));
    const entries = readDojoRecent(storage);
    expect(entries.map((entry) => entry.id)).toEqual(["original-ok", "ok"]);
  });

  it("reads an older bare array as well as the envelope", () => {
    const bare = memory(JSON.stringify([{ kind: "ear", id: "ear", at: at(1) }]));
    expect(readDojoRecent(bare)).toHaveLength(1);
    const broken = memory("{");
    expect(readDojoRecent(broken)).toEqual([]);
  });

  it("works without storage and when writing fails", () => {
    const none = createDojoRecentStore(undefined);
    none.getState().remember({ kind: "ear", id: "ear", at: at(1) });
    expect(none.getState().entries).toHaveLength(1);
    const failing = memory();
    failing.failWrite = true;
    const store = createDojoRecentStore(failing);
    store.getState().remember({ kind: "ear", id: "ear", at: at(1) });
    expect(store.getState().entries).toHaveLength(1);
    expect(failing.value).toBeUndefined();
  });

  it("does not write an invalid entry", () => {
    const storage = memory();
    const store = createDojoRecentStore(storage);
    store.getState().remember({ kind: "drill", id: "tension-all", key: 12, stage: "see", at: at(1) });
    expect(store.getState().entries).toEqual([]);
    expect(storage.value).toBeUndefined();
  });
});
