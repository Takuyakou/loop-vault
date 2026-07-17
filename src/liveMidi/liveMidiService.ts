import type { UnlistenFn } from "@tauri-apps/api/event";
import { tauriLiveMidiBridge, type LiveMidiBridge } from "./bridge";
import type {
  LiveMidiConnectionStatus,
  LiveMidiDevice,
  RawLiveMidiEventBatch,
} from "./types";

export interface LiveMidiServiceSnapshot {
  devices: LiveMidiDevice[];
  selected?: LiveMidiDevice;
  connectionId?: string;
  status: LiveMidiConnectionStatus;
  error?: string;
}

type SnapshotListener = (snapshot: LiveMidiServiceSnapshot) => void;
type BatchListener = (batch: RawLiveMidiEventBatch) => void;

export class LiveMidiService {
  private snapshot: LiveMidiServiceSnapshot = { devices: [], status: "idle" };
  private snapshotListeners = new Set<SnapshotListener>();
  private batchListeners = new Set<BatchListener>();
  private unlisten?: UnlistenFn;
  private operation = 0;

  constructor(private readonly bridge: LiveMidiBridge = tauriLiveMidiBridge) {}

  getSnapshot = (): LiveMidiServiceSnapshot => this.snapshot;

  subscribe = (listener: SnapshotListener): (() => void) => {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  };

  subscribeBatches = (listener: BatchListener): (() => void) => {
    this.batchListeners.add(listener);
    return () => this.batchListeners.delete(listener);
  };

  async refreshDevices(): Promise<LiveMidiDevice[]> {
    try {
      const devices = await this.bridge.listInputs();
      this.update({ devices });
      if (this.snapshot.selected && !devices.some((device) => device.backendId === this.snapshot.selected?.backendId)) {
        await this.stop("disconnected");
        this.update({ devices });
      }
      return devices;
    } catch (error) {
      this.update({ status: "error", error: messageFrom(error) });
      return [];
    }
  }

  async start(device: LiveMidiDevice): Promise<boolean> {
    const operation = ++this.operation;
    await this.closeTransport();
    if (operation !== this.operation) return false;
    this.update({ selected: device, status: "connecting", error: undefined, connectionId: undefined });
    try {
      this.unlisten = await this.bridge.listenBatches((batch) => this.acceptBatch(batch));
      const connectionId = await this.bridge.openInput(device);
      if (operation !== this.operation) {
        await this.closeTransport();
        return false;
      }
      this.update({ connectionId, status: "connected", error: undefined });
      return true;
    } catch (error) {
      await this.closeTransport();
      if (operation === this.operation) {
        this.update({ status: "error", connectionId: undefined, error: messageFrom(error) });
      }
      return false;
    }
  }

  async stop(status: LiveMidiConnectionStatus = "idle"): Promise<void> {
    this.operation += 1;
    await this.closeTransport();
    this.update({ status, selected: undefined, connectionId: undefined, error: undefined });
  }

  private acceptBatch(batch: RawLiveMidiEventBatch) {
    if (!this.snapshot.connectionId || batch.connectionId !== this.snapshot.connectionId) return;
    this.batchListeners.forEach((listener) => listener(batch));
  }

  private async closeTransport() {
    this.unlisten?.();
    this.unlisten = undefined;
    try {
      await this.bridge.closeInput();
    } catch {
      // A failed close must not keep stale frontend state alive.
    }
  }

  private update(changes: Partial<LiveMidiServiceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...changes };
    this.snapshotListeners.forEach((listener) => listener(this.snapshot));
  }
}

export const liveMidiService = new LiveMidiService();

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
