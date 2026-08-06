import type {
  CaptureDevice,
  ChannelMode,
  PermissionState,
  RecordingTakeMetadata,
  ResolvedChannel,
} from "../domain/types";
import type { RecordingMode } from "../domain/persistence";

/**
 * Boundaries for Record & Compare (brief §11.1). The UI never touches
 * `navigator.mediaDevices` or `MediaRecorder`; it goes through these ports,
 * which have browser/Tauri and deterministic fake implementations.
 */

/** Opaque, binary-safe audio payload. Browser Blob or fake bytes in tests. */
export type RecordingData = Blob | Uint8Array;

export interface RecordingTake {
  readonly metadata: RecordingTakeMetadata;
  readonly data: RecordingData;
}

/** Runtime capability probe (brief §11.2). */
export interface RecordingCapabilityReport {
  readonly available: boolean;
  /** Names of the required APIs that were missing, for the report/UI. */
  readonly missing: readonly string[];
}

export interface RecordingCapability {
  probe(): RecordingCapabilityReport;
}

/** Device enumeration + permission + hot-plug notification. */
export interface CaptureDeviceRepository {
  /** Requests microphone permission; only called when the user enables recording. */
  requestPermission(): Promise<PermissionState>;
  currentPermission(): Promise<PermissionState>;
  listDevices(): Promise<readonly CaptureDevice[]>;
  /** Subscribes to device add/remove; returns an unsubscribe function. */
  onDeviceChange(listener: () => void): () => void;
}

export interface StartRecordingOptions {
  readonly deviceId?: string;
  readonly channelMode: ChannelMode;
  readonly resolvedChannel: ResolvedChannel;
  readonly mimeType: string;
}

/** Owns the capture graph and releases every resource on stop/dispose. */
export interface PracticeRecorder {
  start(options: StartRecordingOptions): Promise<void>;
  stop(): Promise<RecordingTake | undefined>;
  /** Releases tracks, nodes, listeners, timers — safe to call repeatedly. */
  dispose(): void;
}

/** Non-identifying context supplied when keeping a take (for its metadata). */
export interface KeepContext {
  readonly practiceSessionId: string;
  readonly exerciseSignature: string;
  readonly mode: RecordingMode;
  readonly inputDeviceName: string;
  readonly playedBackBeforeReview: boolean;
}

/** Ephemeral + Keep Take persistence. */
export interface RecordingTakeRepository {
  keep(take: RecordingTake, context?: KeepContext): Promise<string>;
  list(): Promise<readonly RecordingTakeMetadata[]>;
  load(id: string): Promise<RecordingTake | undefined>;
  remove(id: string): Promise<void>;
}
