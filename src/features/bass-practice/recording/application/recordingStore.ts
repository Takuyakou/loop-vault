import {
  canKeepTake,
  detectOrphans,
  isReadableMetadata,
  RECORDING_SCHEMA_VERSION,
  type StoredRecordingMetadata,
} from "../domain/persistence";
import type { KeepContext, RecordingTake, RecordingTakeRepository } from "./ports";
import type { RecordingTakeMetadata } from "../domain/types";

/**
 * Low-level binary + metadata persistence (contract 02). A `RecordingStore` is
 * a Vault-independent, binary-safe key/value store: IndexedDB in the browser, a
 * Tauri command adapter on desktop, and an in-memory fake in tests. The quota,
 * metadata and orphan policy lives in `PersistentRecordingTakeRepository` on top.
 */

export interface StoredRecording {
  readonly metadata: StoredRecordingMetadata;
  readonly data: Uint8Array;
}

export interface RecordingStore {
  put(record: StoredRecording): Promise<void>;
  /** Raw metadata as stored (may be corrupt/future-version — validated above). */
  listRawMetadata(): Promise<readonly unknown[]>;
  getData(recordingId: string): Promise<Uint8Array | undefined>;
  delete(recordingId: string): Promise<void>;
  usedBytes(): Promise<number>;
}

const FALLBACK_CONTEXT: KeepContext = {
  practiceSessionId: "unknown-session",
  exerciseSignature: "unknown-exercise",
  mode: "degree",
  inputDeviceName: "Input",
  playedBackBeforeReview: false,
};

export class InMemoryRecordingStore implements RecordingStore {
  private readonly records = new Map<string, StoredRecording>();
  /** Test hook: raw records that bypass validation (corruption / future version). */
  readonly rawOverrides = new Map<string, unknown>();
  failPut = false;

  async put(record: StoredRecording): Promise<void> {
    if (this.failPut) throw new Error("injected store put failure");
    this.records.set(record.metadata.recordingId, record);
  }
  async listRawMetadata(): Promise<readonly unknown[]> {
    const stored = [...this.records.values()].map((record) => record.metadata as unknown);
    return [...stored, ...this.rawOverrides.values()];
  }
  async getData(recordingId: string): Promise<Uint8Array | undefined> {
    return this.records.get(recordingId)?.data;
  }
  async delete(recordingId: string): Promise<void> {
    this.records.delete(recordingId);
    this.rawOverrides.delete(recordingId);
  }
  async usedBytes(): Promise<number> {
    return [...this.records.values()].reduce((sum, record) => sum + record.data.byteLength, 0);
  }
  /** Test helper: remove a binary while leaving its metadata (orphan metadata). */
  dropBinary(recordingId: string): void {
    const record = this.records.get(recordingId);
    if (record) this.records.set(recordingId, { metadata: record.metadata, data: new Uint8Array() });
  }
  binaryIds(): readonly string[] {
    return [...this.records.keys()];
  }
}

export type KeepFailureReason = "duration" | "quota" | "store";

export class RecordingQuotaError extends Error {
  constructor(readonly reason: KeepFailureReason) {
    super(`Recording could not be kept: ${reason}.`);
    this.name = "RecordingQuotaError";
  }
}

/**
 * Quota-aware, Vault-independent take repository. Keep fails (never auto-deletes)
 * when a take is too long or the quota is full, leaving the ephemeral take
 * playable. Corrupt or future-version metadata is skipped on read so History
 * stays intact.
 */
export class PersistentRecordingTakeRepository implements RecordingTakeRepository {
  constructor(
    private readonly store: RecordingStore,
    private readonly newId: () => string = defaultId,
  ) {}

  async keep(take: RecordingTake, context: KeepContext = FALLBACK_CONTEXT): Promise<string> {
    const data = await toBytes(take.data);
    const usedBytes = await this.store.usedBytes();
    const decision = canKeepTake({
      durationMs: take.metadata.durationMs,
      byteSize: data.byteLength,
      usedBytes,
    });
    if (!decision.ok) throw new RecordingQuotaError(decision.reason);

    const recordingId = this.newId();
    const metadata: StoredRecordingMetadata = {
      recordingId,
      schemaVersion: RECORDING_SCHEMA_VERSION,
      practiceSessionId: context.practiceSessionId,
      exerciseSignature: context.exerciseSignature,
      mode: context.mode,
      createdAt: new Date().toISOString(),
      durationMs: take.metadata.durationMs,
      mimeType: take.metadata.mimeType,
      byteSize: data.byteLength,
      channelMode: take.metadata.channelMode,
      resolvedChannel: take.metadata.resolvedChannel,
      inputDeviceName: context.inputDeviceName,
      playedBackBeforeReview: context.playedBackBeforeReview,
    };
    try {
      await this.store.put({ metadata, data });
    } catch {
      throw new RecordingQuotaError("store");
    }
    return recordingId;
  }

  /** Only readable, current-version metadata (contract 02 / brief §15). */
  async listStored(): Promise<readonly StoredRecordingMetadata[]> {
    const raw = await this.store.listRawMetadata();
    return raw.filter(isReadableMetadata).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async list(): Promise<readonly RecordingTakeMetadata[]> {
    const stored = await this.listStored();
    return stored.map((metadata) => ({
      mimeType: metadata.mimeType,
      durationMs: metadata.durationMs,
      byteSize: metadata.byteSize,
      channelMode: metadata.channelMode,
      resolvedChannel: metadata.resolvedChannel,
      startOffsetMs: 0,
    }));
  }

  async load(recordingId: string): Promise<RecordingTake | undefined> {
    const stored = (await this.listStored()).find((metadata) => metadata.recordingId === recordingId);
    const data = await this.store.getData(recordingId);
    if (!stored || !data || data.byteLength === 0) return undefined; // missing/corrupt binary
    return {
      data,
      metadata: {
        mimeType: stored.mimeType,
        durationMs: stored.durationMs,
        byteSize: stored.byteSize,
        channelMode: stored.channelMode,
        resolvedChannel: stored.resolvedChannel,
        startOffsetMs: 0,
      },
    };
  }

  async remove(recordingId: string): Promise<void> {
    await this.store.delete(recordingId);
  }

  /** Bytes currently used by kept takes, for the capacity display. */
  async usedBytes(): Promise<number> {
    return this.store.usedBytes();
  }

  /** Detects and removes orphaned metadata/binaries; returns the removed ids. */
  async cleanupOrphans(binaryIds: readonly string[]): Promise<readonly string[]> {
    const stored = await this.listStored();
    const report = detectOrphans(stored.map((metadata) => metadata.recordingId), binaryIds);
    const removed = [...report.metadataWithoutBinary, ...report.binaryWithoutMetadata];
    for (const id of removed) await this.store.delete(id);
    return removed;
  }
}

async function toBytes(data: RecordingTake["data"]): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  // Blob path runs only in the browser/Tauri runtime; tests use Uint8Array.
  return new Uint8Array(await data.arrayBuffer());
}

function defaultId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
