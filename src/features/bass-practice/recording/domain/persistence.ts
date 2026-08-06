import type { ChannelMode, ResolvedChannel } from "./types";

/**
 * Persistence contract for Keep Take (P5.17-03, contract 02). Kept takes live in
 * a Vault-independent binary store, addressed by opaque id, with non-identifying
 * metadata and a bounded quota. Nothing here auto-deletes: over-quota keeps fail
 * and leave the ephemeral take playable.
 */

export const RECORDING_SCHEMA_VERSION = 1;

/**
 * Per-take duration cap. The longest exercises are a few bars; 60s leaves a
 * generous safety margin while bounding a single take. Recorded in the report.
 */
export const MAX_TAKE_DURATION_MS = 60_000;

/**
 * Total retained-take quota. 200 MiB holds many minutes of Opus/WebM takes
 * without unbounded growth. Recorded in the report.
 */
export const TOTAL_QUOTA_BYTES = 200 * 1024 * 1024;

export type RecordingMode = "degree" | "rhythm" | "bassline";

/** Non-identifying metadata stored with a kept take (contract 02 §14.3). */
export interface StoredRecordingMetadata {
  readonly recordingId: string;
  readonly schemaVersion: number;
  readonly practiceSessionId: string;
  /** Stable exercise signature — never a personal path or raw content. */
  readonly exerciseSignature: string;
  readonly mode: RecordingMode;
  readonly createdAt: string;
  readonly durationMs: number;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly channelMode: ChannelMode;
  readonly resolvedChannel: ResolvedChannel;
  /** Non-identifying display name; never a raw OS device id. */
  readonly inputDeviceName: string;
  /** Whether the user heard My Take before reviewing (fact, not a score). */
  readonly playedBackBeforeReview: boolean;
}

export type QuotaDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "duration" | "quota" };

/** Decides whether a candidate take may be kept. Never proposes auto-deletion. */
export function canKeepTake(input: {
  readonly durationMs: number;
  readonly byteSize: number;
  readonly usedBytes: number;
  readonly maxDurationMs?: number;
  readonly totalQuotaBytes?: number;
}): QuotaDecision {
  const maxDurationMs = input.maxDurationMs ?? MAX_TAKE_DURATION_MS;
  const totalQuotaBytes = input.totalQuotaBytes ?? TOTAL_QUOTA_BYTES;
  if (!(input.durationMs >= 0) || !(input.byteSize >= 0) || !(input.usedBytes >= 0)) {
    throw new RangeError("Quota inputs must be finite and non-negative.");
  }
  if (input.durationMs > maxDurationMs) {
    return { ok: false, reason: "duration" };
  }
  if (input.usedBytes + input.byteSize > totalQuotaBytes) {
    return { ok: false, reason: "quota" };
  }
  return { ok: true };
}

/**
 * Validates a stored metadata record on read. Corrupt or future-version records
 * are rejected (the History entry then shows "Recording unavailable") without
 * throwing, so one bad record never breaks the rest of History.
 */
export function isReadableMetadata(value: unknown): value is StoredRecordingMetadata {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === RECORDING_SCHEMA_VERSION
    && typeof record.recordingId === "string"
    && typeof record.mode === "string"
    && typeof record.createdAt === "string"
    && typeof record.durationMs === "number"
    && typeof record.byteSize === "number"
    && typeof record.mimeType === "string"
  );
}

export interface OrphanReport {
  /** Metadata records whose binary is missing. */
  readonly metadataWithoutBinary: readonly string[];
  /** Binary ids with no readable metadata. */
  readonly binaryWithoutMetadata: readonly string[];
}

/** Detects orphaned metadata and orphaned binaries for safe cleanup. */
export function detectOrphans(
  metadataIds: readonly string[],
  binaryIds: readonly string[],
): OrphanReport {
  const binarySet = new Set(binaryIds);
  const metadataSet = new Set(metadataIds);
  return Object.freeze({
    metadataWithoutBinary: metadataIds.filter((id) => !binarySet.has(id)),
    binaryWithoutMetadata: binaryIds.filter((id) => !metadataSet.has(id)),
  });
}
