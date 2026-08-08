import type {
  CaptureDevice,
  PermissionState,
  RecordingTakeMetadata,
} from "../domain/types";
import type {
  CaptureDeviceRepository,
  PracticeRecorder,
  RecordingCapability,
  RecordingCapabilityReport,
  RecordingTake,
  RecordingTakeRepository,
  StartRecordingOptions,
} from "./ports";

/**
 * Deterministic fakes so unit/component tests never require a real microphone
 * (brief §11.1, §21). They also record how they were used, which lets tests
 * assert resource discipline (every start is disposed, no dangling handles).
 */

export class FakeRecordingCapability implements RecordingCapability {
  constructor(private readonly report: RecordingCapabilityReport) {}
  probe(): RecordingCapabilityReport {
    return this.report;
  }
  static available(): FakeRecordingCapability {
    return new FakeRecordingCapability({ available: true, missing: [] });
  }
  static unavailable(missing: readonly string[]): FakeRecordingCapability {
    return new FakeRecordingCapability({ available: false, missing });
  }
}

export class FakeCaptureDeviceRepository implements CaptureDeviceRepository {
  permission: PermissionState;
  devices: CaptureDevice[];
  private readonly listeners = new Set<() => void>();
  readonly liveListenerCount = () => this.listeners.size;

  constructor(options?: {
    permission?: PermissionState;
    devices?: CaptureDevice[];
  }) {
    this.permission = options?.permission ?? "prompt";
    this.devices = options?.devices ?? [{ id: "fake-input-1", label: "Fake Input 1" }];
  }

  async requestPermission(): Promise<PermissionState> {
    if (this.permission === "prompt" || this.permission === "unknown") {
      this.permission = "granted";
    }
    return this.permission;
  }
  async currentPermission(): Promise<PermissionState> {
    return this.permission;
  }
  async listDevices(): Promise<readonly CaptureDevice[]> {
    return this.permission === "granted" ? [...this.devices] : [];
  }
  onDeviceChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** Test helper: simulate a hot-plug event. */
  emitDeviceChange(devices?: CaptureDevice[]): void {
    if (devices) this.devices = devices;
    for (const listener of this.listeners) listener();
  }
  denyPermission(): void {
    this.permission = "denied";
  }
}

export class FakePracticeRecorder implements PracticeRecorder {
  startCount = 0;
  stopCount = 0;
  disposeCount = 0;
  active = false;
  /** When set, the next stop resolves to this take; otherwise a default one. */
  nextTake?: RecordingTake;
  /** When true, start rejects (simulates a recorder error). */
  failStart = false;
  /** Optional test-only gate for a pending getUserMedia / recorder start. */
  startGate?: Promise<void>;

  async start(options: StartRecordingOptions): Promise<void> {
    if (this.startGate) await this.startGate;
    if (this.failStart) throw new Error("fake recorder start failed");
    this.startCount += 1;
    this.active = true;
    this.lastOptions = options;
  }
  async stop(): Promise<RecordingTake | undefined> {
    this.stopCount += 1;
    this.active = false;
    if (this.nextTake) return this.nextTake;
    return {
      metadata: defaultTakeMetadata(this.lastOptions),
      data: new Uint8Array([1, 2, 3, 4]),
    };
  }
  dispose(): void {
    this.disposeCount += 1;
    this.active = false;
  }
  /** True when every start has been balanced by a dispose. */
  get leaked(): boolean {
    return this.active || this.startCount > this.disposeCount;
  }
  private lastOptions?: StartRecordingOptions;
}

export class InMemoryRecordingTakeRepository implements RecordingTakeRepository {
  private readonly takes = new Map<string, RecordingTake>();
  private sequence = 0;
  /** When true, keep rejects (simulates quota exceeded / storage denial). */
  failKeep = false;

  async keep(take: RecordingTake): Promise<string> {
    if (this.failKeep) throw new Error("fake storage keep failed");
    const id = `take-${String(this.sequence).padStart(4, "0")}`;
    this.sequence += 1;
    this.takes.set(id, take);
    return id;
  }
  async list(): Promise<readonly RecordingTakeMetadata[]> {
    return [...this.takes.values()].map((take) => take.metadata);
  }
  async load(id: string): Promise<RecordingTake | undefined> {
    return this.takes.get(id);
  }
  async remove(id: string): Promise<void> {
    this.takes.delete(id);
  }
  get size(): number {
    return this.takes.size;
  }
}

function defaultTakeMetadata(
  options?: StartRecordingOptions,
): RecordingTakeMetadata {
  return {
    mimeType: options?.mimeType ?? "audio/webm;codecs=opus",
    durationMs: 2_000,
    byteSize: 4,
    channelMode: options?.channelMode ?? "auto",
    resolvedChannel: options?.resolvedChannel ?? "mono-sum",
    startOffsetMs: 0,
  };
}
