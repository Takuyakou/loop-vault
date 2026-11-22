import { describe, expect, it, vi } from "vitest";
import { courseItemById, sameDayIds } from "./bank";
import { coursePlan, startCourseAttempt } from "./review";
import {
  BrowserCourseStorage,
  COURSE_BROWSER_KEY,
  COURSE_ENVELOPE_APP,
  COURSE_FILE_VERSION,
  CourseRepository,
  MemoryCourseStorage,
  TauriCourseStorage,
  createCourseStore,
  createCourseTrial,
  validateCourseStore,
} from "./store";
import type { ActiveAttempt, CourseTrial } from "./types";

const fs = vi.hoisted(() => ({
  exists: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ BaseDirectory: { AppData: 16 }, ...fs }));

class MapKV {
  readonly map = new Map<string, string>();
  get length() { return this.map.size; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
}

const at = new Date(2026, 10, 17, 20, 0, 0).toISOString();

function trial(overrides: Partial<CourseTrial> = {}): CourseTrial {
  const item = courseItemById(overrides.itemId ?? sameDayIds(1)[0]!)!;
  const attempt: ActiveAttempt = {
    level: 1,
    block: "sameDay",
    attemptId: overrides.attemptId ?? "a-1",
    startedAt: at,
    mode: "midi",
  };
  return createCourseTrial({
    attempt,
    itemId: item.id,
    quality: item.quality,
    root: item.root,
    result: "correct",
    sealedNotes: item.referenceNotes,
    speedMs: 1200,
    startedAt: at,
    sealedAt: at,
    ...overrides,
  });
}

describe("P23-40 dedicated course store", () => {
  it("round-trips the envelope and leaves every other localStorage key untouched", async () => {
    const kv = new MapKV();
    kv.setItem("loop-vault:chord-dojo-txt-jazz-v1:data", "dojo");
    kv.setItem("loop-vault:ear-practice-v1:data", "ear");
    const repository = new CourseRepository(new BrowserCourseStorage(kv));
    const store = { ...createCourseStore(), trials: [trial()] };
    await repository.save(store);
    const loaded = await repository.load();
    expect(loaded.kind).toBe("ok");
    if (loaded.kind !== "ok") throw new Error("load failed");
    expect(loaded.store.pairId).toBe(store.pairId);
    expect(loaded.store.trials).toHaveLength(1);
    const envelope = JSON.parse(kv.getItem(COURSE_BROWSER_KEY)!);
    expect(envelope.app).toBe(COURSE_ENVELOPE_APP);
    expect(envelope.fileVersion).toBe(COURSE_FILE_VERSION);
    expect(kv.getItem("loop-vault:chord-dojo-txt-jazz-v1:data")).toBe("dojo");
    expect(kv.getItem("loop-vault:ear-practice-v1:data")).toBe("ear");
    expect([...kv.map.keys()].filter((key) => key.includes("guided-course"))).toEqual([COURSE_BROWSER_KEY]);
  });

  it("starts empty without writing and keeps damaged bytes instead of initialising", async () => {
    const kv = new MapKV();
    const repository = new CourseRepository(new BrowserCourseStorage(kv));
    const empty = await repository.load();
    expect(empty.kind).toBe("empty");
    expect(kv.length).toBe(0);

    kv.setItem(COURSE_BROWSER_KEY, "{damaged");
    const damaged = await repository.load();
    expect(damaged.kind).toBe("unreadable");
    expect(kv.getItem(COURSE_BROWSER_KEY)).toBe("{damaged");
  });

  it("rejects an old pair and never migrates it", async () => {
    const kv = new MapKV();
    const v2 = {
      app: COURSE_ENVELOPE_APP,
      fileVersion: COURSE_FILE_VERSION,
      ...createCourseStore(),
      bankVersion: "p23-39.bank.lv1-3.v2",
      policyVersion: "p23-39.policy.lv1-3.v2",
      pairId: "p23-39.bank.lv1-3.v2+p23-39.policy.lv1-3.v2",
    };
    kv.setItem(COURSE_BROWSER_KEY, JSON.stringify(v2));
    const loaded = await new CourseRepository(new BrowserCourseStorage(kv)).load();
    expect(loaded.kind).toBe("unreadable");
    if (loaded.kind === "unreadable") expect(loaded.reason).toContain("version pair");
  });

  it("quarantines corrupt data explicitly and keeps the bytes", async () => {
    const kv = new MapKV();
    kv.setItem(COURSE_BROWSER_KEY, "{damaged");
    const storage = new BrowserCourseStorage(kv);
    const name = await storage.quarantine();
    expect(name).toContain("guided-course-v1:corrupt:");
    expect(kv.getItem(COURSE_BROWSER_KEY)).toBeNull();
    expect(kv.getItem(name!)).toBe("{damaged");
  });

  it("rejects a forbidden field, an unknown item and a wrong quality; accepts an idempotent retry", async () => {
    const storage = new MemoryCourseStorage();
    const repository = new CourseRepository(storage);
    expect(validateCourseStore({ ...createCourseStore(), trials: [{ ...trial(), audio: "x" }] }).ok).toBe(false);
    expect(validateCourseStore({ ...createCourseStore(), trials: [{ ...trial(), itemId: "nope" }] }).ok).toBe(false);
    const majItem = sameDayIds(1).map((id) => courseItemById(id)!).find((item) => item.quality === "maj")!;
    expect(validateCourseStore({ ...createCourseStore(), trials: [trial({ itemId: majItem.id, quality: "min" })] }).ok).toBe(false);

    const store = createCourseStore();
    const once = await repository.appendTrial(store, trial());
    expect(once.trials).toHaveLength(1);
    const again = await repository.appendTrial(once, trial());
    expect(again.trials).toHaveLength(1);
    expect(storage.operations.filter((op) => op === "write")).toHaveLength(1);
    await expect(repository.appendTrial(once, trial({ result: "wrong" }))).rejects.toThrow("同じ試行 id");
  });

  it("keeps the in-memory store when the write fails and never writes partially", async () => {
    const storage = new MemoryCourseStorage();
    const repository = new CourseRepository(storage);
    const before = await repository.appendTrial(createCourseStore(), trial());
    const committed = storage.committed;
    storage.failWrite = true;
    const next = trial({ attemptId: "a-2" });
    await expect(repository.appendTrial(before, next)).rejects.toThrow("injected write failure");
    expect(storage.committed).toBe(committed);
  });

  it("keeps the saved trials ordered and the active attempt is part of the store", async () => {
    const store = startCourseAttempt(createCourseStore(), 1, "sameDay", new Date(at), { attemptId: "a-9" });
    const storage = new MemoryCourseStorage();
    const repository = new CourseRepository(storage);
    await repository.save(store);
    const loaded = await repository.load();
    expect(loaded.kind).toBe("ok");
    if (loaded.kind === "ok") {
      expect(loaded.store.active).toMatchObject({ attemptId: "a-9", block: "sameDay" });
      expect(coursePlan(loaded.store, new Date(at)).kind).toBe("question");
    }
  });

  it("writes the native file through the frozen envelope with a temp+rename", async () => {
    fs.exists.mockResolvedValue(false);
    fs.mkdir.mockResolvedValue(undefined);
    fs.writeTextFile.mockResolvedValue(undefined);
    fs.rename.mockResolvedValue(undefined);
    fs.remove.mockResolvedValue(undefined);
    const storage = new TauriCourseStorage();
    expect(await storage.read()).toBeUndefined();
    async function readFails(contents: string): Promise<string> {
      fs.exists.mockResolvedValue(true);
      fs.readTextFile.mockResolvedValue(contents);
      return (await storage.read())!;
    }
    expect(await readFails("{}")).toBe("{}");
    await storage.write("contents");
    expect(fs.writeTextFile).toHaveBeenCalledWith("loopvault/guided-course-v1.json.tmp", "contents", { baseDir: 16 });
    expect(fs.rename).toHaveBeenCalledWith("loopvault/guided-course-v1.json.tmp", "loopvault/guided-course-v1.json", { oldPathBaseDir: 16, newPathBaseDir: 16 });

    fs.rename.mockRejectedValueOnce(new Error("rename failed"));
    await expect(storage.write("again")).rejects.toThrow("rename failed");
    expect(fs.remove).toHaveBeenCalledWith("loopvault/guided-course-v1.json.tmp", { baseDir: 16 });
  });
});
