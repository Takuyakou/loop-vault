import { describe, expect, it } from "vitest";
import { BrowserPracticeStorage } from "../../features/bass-practice/infra/repository/practiceStorage";
import {
  VOICING_DRILL_APP, emptyDrillRecords, parseDrillRecords, drillEntryFor,
  type DrillRecordCard, type VoicingDrillRepository,
} from "./voicingDrillRecords";
import { VoicingDrillRepository as Repository } from "./voicingDrillRecords";

class MemoryKeys {
  files = new Map<string, string>();
  get length() { return this.files.size; }
  key(index: number) { return [...this.files.keys()][index] ?? null; }
  getItem(key: string) { return this.files.get(key) ?? null; }
  setItem(key: string, value: string) { this.files.set(key, value); }
  removeItem(key: string) { this.files.delete(key); }
}

const cards: DrillRecordCard[] = [
  { id: "1", label: "CΔ7", degree: "IΔ7", form: null, left: [48], right: [67, 71, 76] },
  { id: "2", label: "Am7", degree: "VIm7", form: null, left: [45], right: [67, 72, 76] },
];
const repo = (keys: MemoryKeys): VoicingDrillRepository => new Repository(new BrowserPracticeStorage(keys as never, "voicing-drill"));

const lap = (totalMs: number) => ({ totalMs, cardMs: [300, totalMs - 300], operation: `op-${totalMs}` });
const input = (totalMs: number, extra: Partial<Parameters<VoicingDrillRepository["record"]>[0]> = {}) => ({
  setId: "cycle-a", setRevision: "rev-1", cards, key: 0, stage: "see" as const,
  totalMs, cardMs: [300, totalMs - 300], marks: [] as number[], operation: `op-${totalMs}`, ...extra,
});

describe("P19 voicing drill records", () => {
  it("starts empty in its own file and keeps version 1", async () => {
    const keys = new MemoryKeys();
    const { file } = await repo(keys).load();
    expect(file).toEqual(emptyDrillRecords());
    expect(file.app).toBe(VOICING_DRILL_APP);
    expect(file.fileVersion).toBe(1);
    expect([...keys.files.keys()].every((key) => key.startsWith("loop-vault:voicing-drill-v1:"))).toBe(true);
  });

  it("stores the first lap as both best and last", async () => {
    const keys = new MemoryKeys();
    const file = await repo(keys).record(input(1200));
    const entry = drillEntryFor(file, "cycle-a", "rev-1", 0, "see")!;
    expect(entry.laps).toBe(1);
    expect(entry.best?.totalMs).toBe(1200);
    expect(entry.last?.totalMs).toBe(1200);
    expect(file.sets["cycle-a"]?.["rev-1"]?.cards).toEqual(cards);
  });

  it("keeps the fastest lap as the best and the newest as the last", async () => {
    const keys = new MemoryKeys();
    await repo(keys).record(input(1200));
    const slower = await repo(keys).record(input(1500, { operation: "op-1500" }));
    expect(drillEntryFor(slower, "cycle-a", "rev-1", 0, "see")!.best?.totalMs).toBe(1200);
    expect(drillEntryFor(slower, "cycle-a", "rev-1", 0, "see")!.last?.totalMs).toBe(1500);
    const faster = await repo(keys).record(input(900, { operation: "op-900" }));
    expect(drillEntryFor(faster, "cycle-a", "rev-1", 0, "see")!.best?.totalMs).toBe(900);
    expect(drillEntryFor(faster, "cycle-a", "rev-1", 0, "see")!.laps).toBe(3);
  });

  it("never counts the same operation twice", async () => {
    const keys = new MemoryKeys();
    await repo(keys).record(input(1200));
    const again = await repo(keys).record(input(1200));
    expect(drillEntryFor(again, "cycle-a", "rev-1", 0, "see")!.laps).toBe(1);
  });

  it("keeps an older content revision when the cards change", async () => {
    const keys = new MemoryKeys();
    await repo(keys).record(input(1200));
    const nextCards = [...cards, { id: "3", label: "FΔ7", degree: "IVΔ7", form: null, left: [41], right: [69, 72, 76] }];
    const file = await repo(keys).record(input(2000, { setRevision: "rev-2", cards: nextCards, operation: "op-2" }));
    expect(file.sets["cycle-a"]?.["rev-1"]?.cards).toEqual(cards);
    expect(file.sets["cycle-a"]?.["rev-2"]?.cards).toEqual(nextCards);
    expect(drillEntryFor(file, "cycle-a", "rev-1", 0, "see")!.best?.totalMs).toBe(1200);
    expect(drillEntryFor(file, "cycle-a", "rev-2", 0, "see")!.best?.totalMs).toBe(2000);
  });

  it("keeps the marks of the last lap", async () => {
    const keys = new MemoryKeys();
    const file = await repo(keys).record(input(1200, { marks: [1] }));
    expect(drillEntryFor(file, "cycle-a", "rev-1", 0, "see")!.last?.marks).toEqual([1]);
  });

  it("drops only the timing that no longer matches its cards", () => {
    const file = emptyDrillRecords();
    file.sets["cycle-a"] = {
      "rev-1": {
        cards,
        keys: {
          "0": {
            see: { laps: 2, best: { totalMs: 900, cardMs: [400], at: "2026-11-01T00:00:00.000Z" }, last: { totalMs: 900, cardMs: [400], at: "2026-11-01T00:00:00.000Z", marks: [] } },
            recall: { laps: 1, best: { totalMs: 800, cardMs: [300, 500], at: "2026-11-01T00:00:00.000Z" } },
          },
        },
      },
    };
    const parsed = parseDrillRecords(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rejected).toEqual(["cycle-a/rev-1/0/see"]);
    expect(parsed.file.sets["cycle-a"]?.["rev-1"]?.keys["0"]?.see).toBeUndefined();
    expect(parsed.file.sets["cycle-a"]?.["rev-1"]?.keys["0"]?.recall?.laps).toBe(1);
  });

  it("refuses a file written by a newer version and leaves its bytes alone", async () => {
    const keys = new MemoryKeys();
    const future = JSON.stringify({ ...emptyDrillRecords(), fileVersion: 2, version: 2 });
    keys.setItem("loop-vault:voicing-drill-v1:data", future);
    await expect(repo(keys).load()).rejects.toThrow(/新しい版/);
    expect(keys.getItem("loop-vault:voicing-drill-v1:data")).toBe(future);
  });

  it("recovers a damaged file from a validated backup", async () => {
    const keys = new MemoryKeys();
    await repo(keys).record(input(1200));
    const good = keys.getItem("loop-vault:voicing-drill-v1:data")!;
    keys.files.set("loop-vault:voicing-drill-v1:data", "{damaged");
    keys.files.set("loop-vault:voicing-drill-v1:backup:20261101-000000-000000", good);
    const { file } = await repo(keys).load();
    expect(drillEntryFor(file, "cycle-a", "rev-1", 0, "see")?.laps).toBe(1);
    expect([...keys.files.keys()].some((key) => key.startsWith("loop-vault:voicing-drill-v1:corrupt:"))).toBe(true);
  });

  it("saves and reads the same file back", async () => {
    const keys = new MemoryKeys();
    await repo(keys).record(input(1200, { stage: "recall" }));
    const loaded = parseDrillRecords(keys.getItem("loop-vault:voicing-drill-v1:data")!);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.file.sets["cycle-a"]?.["rev-1"]?.keys["0"]?.recall?.laps).toBe(1);
    void lap;
  });
});
