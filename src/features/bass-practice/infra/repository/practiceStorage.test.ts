import { describe, expect, it } from "vitest";
import type { PracticeStorage } from "./practiceRepository";
import { BrowserPracticeStorage, MemoryPracticeStorage, TauriPracticeStorage } from "./practiceStorage";

class MapStorage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  entries() { return [...this.values.entries()]; }
}

function document(revision: number, marker: string): string {
  return `${JSON.stringify({ app: "loopvault-practice", fileVersion: 1, revision, marker })}\n`;
}

describe.each([
  ["browser", () => new BrowserPracticeStorage(new MapStorage())],
  ["memory", () => new MemoryPracticeStorage()],
] as const)("%s PracticeStorage CAS", (_name, createStorage) => {
  it("returns the committed revision and rejects a stale writer without replacing data", async () => {
    const storage = createStorage();
    await expect(storage.commit(document(1, "one"), "20260802-123456", undefined)).resolves.toBe(1);
    const first = await storage.readCommitted();
    await expect(storage.commit(document(2, "two"), "20260802-123457", 1, first?.token)).resolves.toBe(2);

    await expect(storage.commit(document(2, "stale"), "20260802-123458", 1, first?.token)).rejects.toThrow("stale");
    await expect(storage.readCommitted()).resolves.toMatchObject({ contents: document(2, "two"), revision: 2, token: expect.stringMatching(/^sha256-/) });
  });

  it("restores only a listed valid backup as a new revision", async () => {
    const storage = createStorage();
    await storage.commit(document(1, "one"), "20260802-123456", undefined);
    const first = await storage.readCommitted();
    await storage.commit(document(2, "two"), "20260802-123457", 1, first?.token);
    const [backup] = await storage.listBackups();
    const current = await storage.readCommitted();

    const restored = await storage.restoreBackup(backup.name, backup.token, 2, current?.token);

    expect(restored.revision).toBe(3);
    expect(JSON.parse(restored.contents)).toMatchObject({ revision: 3, marker: "one" });
    await expect(storage.readBackup("../../private.json")).rejects.toThrow("invalid");
  });
});

describe("BrowserPracticeStorage retention", () => {
  it("keeps 20 same-second backups with monotonic collision-free names", async () => {
    const storage = new BrowserPracticeStorage(new MapStorage());
    await storage.commit(document(1, "1"), "20260802-123456", undefined);
    for (let revision = 2; revision <= 24; revision += 1) {
      const current = await storage.readCommitted();
      await storage.commit(document(revision, String(revision)), "20260802-123456", revision - 1, current?.token);
    }

    const backups = await storage.listBackups();
    expect(backups).toHaveLength(20);
    expect(backups[0].name).toMatch(/-000022$/);
    expect(backups[0].revision).toBe(23);
  });
});

describe("PracticeStorage recovery artifact discovery", () => {
  it("lists only fixed Browser corrupt keys without exposing stored contents", async () => {
    const map = new MapStorage();
    const valid = "loop-vault:practice-v1:corrupt:20260802-123456-000000";
    map.setItem(valid, "private retained contents");
    map.setItem("loop-vault:practice-v1:corrupt:../../private", "private");
    map.setItem("loop-vault:practice-v1:backup:20260802-123456-000000", "backup");
    map.setItem("unrelated-private-key", "private");
    const storage = new BrowserPracticeStorage(map);

    await expect(storage.listRecoveryArtifacts()).resolves.toEqual([valid]);
  });

  it("lists retained Memory artifacts after canonical quarantine", async () => {
    const storage = new MemoryPracticeStorage(); storage.committed = "{broken";
    const current = await storage.readCommitted();
    const retained = await storage.quarantineCommitted("20260802-123456", current!.token);
    await expect(storage.listRecoveryArtifacts()).resolves.toEqual([retained]);
  });
});

describe("PracticeStorage content-token quarantine CAS", () => {
  it.each([
    ["browser", () => {
      const map = new MapStorage(); map.setItem("loop-vault:practice-v1:data", "{broken");
      return new BrowserPracticeStorage(map);
    }],
    ["memory", () => { const storage = new MemoryPracticeStorage(); storage.committed = "{broken"; return storage; }],
  ] as const)("preserves a newer valid %s commit when stale quarantine races", async (_name, createStorage) => {
    const storage: PracticeStorage = createStorage();
    const stale = await storage.readCommitted();
    expect(stale).toMatchObject({ contents: "{broken", revision: 0, token: expect.stringMatching(/^sha256-/) });
    await storage.commit(document(1, "new-valid"), "20260802-123456", 0, stale?.token);

    await expect(storage.quarantineCommitted("20260802-123457", stale!.token)).rejects.toThrow(/stale/i);
    await expect(storage.readCommitted()).resolves.toMatchObject({ contents: document(1, "new-valid"), revision: 1 });
  });
});

describe("BrowserPracticeStorage partial artifact cleanup", () => {
  it("treats post-commit temporary cleanup failure as a successful commit", async () => {
    class CleanupFailingMap extends MapStorage {
      failures = 1;
      override removeItem(key: string) {
        if (key === "loop-vault:practice-v1:tmp" && this.failures-- > 0) throw new Error("cleanup failed");
        super.removeItem(key);
      }
    }
    const map = new CleanupFailingMap(); const storage = new BrowserPracticeStorage(map);
    await expect(storage.commit(document(1, "committed"), "20260802-123456", undefined)).resolves.toBe(1);
    await expect(storage.readCommitted()).resolves.toMatchObject({ revision: 1, contents: document(1, "committed") });
    expect(map.entries().some(([key]) => key === "loop-vault:practice-v1:tmp")).toBe(false);
  });

  it("removes a newly-created backup if canonical replacement fails", async () => {
    class ReplaceFailingMap extends MapStorage {
      failReplace = false;
      override setItem(key: string, value: string) {
        if (this.failReplace && key === "loop-vault:practice-v1:data") throw new Error("replace failed");
        super.setItem(key, value);
      }
    }
    const map = new ReplaceFailingMap(); const storage = new BrowserPracticeStorage(map);
    await storage.commit(document(1, "last-good"), "20260802-123456", undefined);
    const current = await storage.readCommitted(); map.failReplace = true;
    await expect(storage.commit(document(2, "new"), "20260802-123457", 1, current?.token)).rejects.toThrow("replace failed");
    expect(map.entries().filter(([key]) => key.includes(":backup:"))).toEqual([]);
    await expect(storage.readCommitted()).resolves.toMatchObject({ revision: 1, contents: document(1, "last-good") });
  });
});

describe("TauriPracticeStorage error normalization", () => {
  it.each([
    "Practice storage could not save stale revision.",
    new Error("Practice storage could not save stale revision."),
    { error: { message: "Practice storage could not save stale revision." } },
  ])("preserves a detectable stale revision from invoke variant %#", async (rawError) => {
    const rejectInvoke = <T>() => Promise.reject<T>(rawError);
    const storage = new TauriPracticeStorage(rejectInvoke);
    await expect(storage.commit(document(1, "one"), "20260802-123456", undefined))
      .rejects.toThrow(/stale revision/i);
  });
});
