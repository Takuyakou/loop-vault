/**
 * Record & Compare (P5.17) domain types.
 *
 * These describe recording as a mirror for self-review — never a grader. No
 * pitch, rhythm, or accuracy is ever represented here. See
 * docs/phase5.17/contracts for the binding rules.
 */

/** Input channel selection for multi-input interfaces (e.g. MOTU M4). */
export type ChannelMode = "auto" | "left" | "right" | "mono-sum";

/** The resolved concrete channel a recording actually captured (always mono). */
export type ResolvedChannel = "left" | "right" | "mono-sum";

/** Microphone permission as understood by the recorder. */
export type PermissionState = "unknown" | "prompt" | "granted" | "denied";

/** A capture device, identified opaquely; the raw OS id is never persisted. */
export interface CaptureDevice {
  /** Opaque, stable-per-session id used to select the device. */
  readonly id: string;
  /** Non-identifying display label shown in the UI. */
  readonly label: string;
}

/**
 * Metadata for a single take. Non-identifying only (contract 02). Never carries
 * audio bytes, device ids, absolute paths, or any inferred musical content.
 */
export interface RecordingTakeMetadata {
  readonly mimeType: string;
  readonly durationMs: number;
  readonly byteSize: number;
  readonly channelMode: ChannelMode;
  readonly resolvedChannel: ResolvedChannel;
  /** Measured count-in / recording start offset, milliseconds. */
  readonly startOffsetMs: number;
}

/** Reasons the recorder can enter the `error` state. */
export type RecorderErrorCode =
  | "capability-unavailable"
  | "permission-denied"
  | "device-missing"
  | "no-codec"
  | "recorder-error"
  | "blob-error"
  | "device-disconnected"
  | "permission-revoked"
  | "save-failed";

/** Codec probe result carried on a take and reported (contract 04). */
export interface CodecChoice {
  readonly mimeType: string;
  /** Ordered list of candidates that were probed, for the report. */
  readonly consideredOrder: readonly string[];
}
