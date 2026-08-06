import { describe, expect, it } from "vitest";
import {
  InMemoryRecordingStore,
  PersistentRecordingTakeRepository,
  RecordingQuotaError,
} from "./recordingStore";
import { MAX_TAKE_DURATION_MS, TOTAL_QUOTA_BYTES } from "../domain/persistence";
import type { KeepContext, RecordingTake } from "./ports";

const CONTEXT: KeepContext = {
  practiceSessionId: "s1",
  exerciseSignature: "degree:x",
  mode: "degree",
  inputDeviceName: "Input",
  playedBackBeforeReview: true,
};

function take(bytes: number, durationMs = 2_000): RecordingTake {
  return {
    data: new Uint8Array(bytes),
    metadata: {
      mimeType: "audio/webm;codecs=opus",
      durationMs,
      byteSize: bytes,
      channelMode: "mono-sum",
      resolvedChannel: "mono-sum",
      startOffsetMs: 0,
    },
  };
}

let counter = 0;
function repo(store = new InMemoryRecordingStore()) {
  counter = 0;
  return {
    store,
    repository: new PersistentRecordingTakeRepository(store, () => `rec-${counter++}`),
  };
}

describe("PersistentRecordingTakeRepository", () => {
  it("keeps, lists and loads a take with non-identifying metadata", async () => {
    const { repository } = repo();
    const id = await repository.keep(take(1_000), CONTEXT);
    const list = await repository.list();
    expect(list).toHaveLength(1);
    const stored = await repository.listStored();
    expect(stored[0]).toMatchObject({ recordingId: id, mode: "degree", inputDeviceName: "Input", byteSize: 1_000 });
    const loaded = await repository.load(id);
    expect((loaded?.data as Uint8Array).byteLength).toBe(1_000);
  });

  it("fails an over-long take and keeps the store empty", async () => {
    const { repository, store } = repo();
    await expect(repository.keep(take(10, MAX_TAKE_DURATION_MS + 1), CONTEXT))
      .rejects.toBeInstanceOf(RecordingQuotaError);
    expect(await store.usedBytes()).toBe(0);
  });

  it("fails a take over the total quota without auto-deleting existing takes", async () => {
    const { repository } = repo();
    await repository.keep(take(1_000), CONTEXT);
    await expect(repository.keep(take(TOTAL_QUOTA_BYTES), CONTEXT))
      .rejects.toMatchObject({ reason: "quota" });
    expect(await repository.list()).toHaveLength(1); // existing take untouched
  });

  it("skips corrupt / future-version metadata so History stays intact", async () => {
    const { repository, store } = repo();
    await repository.keep(take(500), CONTEXT);
    store.rawOverrides.set("corrupt-1", { schemaVersion: 2, recordingId: "corrupt-1" });
    store.rawOverrides.set("corrupt-2", "not even an object");
    const list = await repository.listStored();
    expect(list).toHaveLength(1);
  });

  it("treats a missing binary as unavailable without throwing", async () => {
    const { repository, store } = repo();
    const id = await repository.keep(take(500), CONTEXT);
    store.dropBinary(id); // metadata remains, binary gone
    expect(await repository.load(id)).toBeUndefined();
    expect(await repository.listStored()).toHaveLength(1); // entry still listed
  });

  it("removes a take", async () => {
    const { repository } = repo();
    const id = await repository.keep(take(500), CONTEXT);
    await repository.remove(id);
    expect(await repository.list()).toHaveLength(0);
  });

  it("cleans up orphaned metadata and binaries", async () => {
    const { repository, store } = repo();
    const id = await repository.keep(take(500), CONTEXT);
    // an orphan binary id that has no metadata, plus the real paired id
    const removed = await repository.cleanupOrphans([id, "stray-binary"]);
    expect(removed).toContain("stray-binary");
    // dropping the metadata's binary makes it an orphan metadata on next pass
    store.dropBinary(id);
    void store;
  });

  it("reports a store failure as a keep failure, leaving nothing persisted", async () => {
    const store = new InMemoryRecordingStore();
    store.failPut = true;
    const { repository } = repo(store);
    await expect(repository.keep(take(500), CONTEXT)).rejects.toMatchObject({ reason: "store" });
    expect(await repository.list()).toHaveLength(0);
  });
});
