import { describe, expect, it } from "vitest";
import {
  loadRecentVoicingLoopProgressions,
  MAX_RECENT_VOICING_LOOP_PROGRESSIONS,
  RECENT_VOICING_LOOP_STORAGE_KEY,
  recordRecentVoicingLoopProgression,
  retainAvailableRecentVoicingLoopProgressions,
  saveRecentVoicingLoopProgressions,
  type RecentProgressionStorage,
} from "./recentProgressions";

describe("recent Voicing Loop progressions", () => {
  it("keeps a deterministic five-item LRU without duplicates", () => {
    const initial = Array.from({ length: 6 }, (_, index) => reference(index));
    const withDuplicate = recordRecentVoicingLoopProgression(initial, reference(2));
    expect(withDuplicate).toHaveLength(MAX_RECENT_VOICING_LOOP_PROGRESSIONS);
    expect(withDuplicate.map(({ ideaId }) => ideaId)).toEqual(["idea-2", "idea-0", "idea-1", "idea-3", "idea-4"]);
  });

  it("loads only valid unique references and excludes deleted or ineligible sources", () => {
    const storage = memoryStorage();
    storage.setItem(RECENT_VOICING_LOOP_STORAGE_KEY, JSON.stringify({
      version: 1,
      references: [reference(0), reference(0), { ideaId: "", blockId: "bad" }, reference(1)],
    }));
    const loaded = loadRecentVoicingLoopProgressions(storage);
    expect(loaded).toEqual([reference(0), reference(1)]);
    expect(retainAvailableRecentVoicingLoopProgressions(loaded, [reference(1)])).toEqual([reference(1)]);
  });

  it("fails open for unavailable preference storage without persisting private facts", () => {
    const unavailable: RecentProgressionStorage = {
      getItem() { throw new Error("unavailable"); },
      setItem() { throw new Error("unavailable"); },
    };
    expect(loadRecentVoicingLoopProgressions(unavailable)).toEqual([]);
    expect(() => saveRecentVoicingLoopProgressions([reference(0)], unavailable)).not.toThrow();

    const storage = memoryStorage();
    saveRecentVoicingLoopProgressions([reference(0)], storage);
    expect(storage.getItem(RECENT_VOICING_LOOP_STORAGE_KEY)).toBe(
      '{"version":1,"references":[{"ideaId":"idea-0","blockId":"block-0"}]}',
    );
  });
});

function reference(index: number) {
  return { ideaId: `idea-${index}`, blockId: `block-${index}` };
}

function memoryStorage(): RecentProgressionStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}
