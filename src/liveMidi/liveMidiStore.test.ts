import { describe, expect, it, vi } from "vitest";
import type { LiveMidiServiceSnapshot } from "./liveMidiService";
import { createLiveMidiStore, type LiveMidiServicePort } from "./liveMidiStore";
import type { LiveMidiDevice, RawLiveMidiEventBatch } from "./types";

const device: LiveMidiDevice = { backendId: "one", name: "Keyboard", index: 0 };

function service() {
  let snapshotHandler: ((snapshot: LiveMidiServiceSnapshot) => void) | undefined;
  let batchHandler: ((batch: RawLiveMidiEventBatch) => void) | undefined;
  const value: LiveMidiServicePort = {
    getSnapshot: () => ({ devices: [device], status: "idle" }),
    subscribe: (handler) => { snapshotHandler = handler; return () => undefined; },
    subscribeBatches: (handler) => { batchHandler = handler; return () => undefined; },
    refreshDevices: vi.fn(async () => [device]),
    start: vi.fn(async (selected) => {
      snapshotHandler?.({ devices: [device], selected, status: "connected", connectionId: "new" });
      return true;
    }),
    stop: vi.fn(async () => undefined),
  };
  return {
    value,
    batch: (events: RawLiveMidiEventBatch["events"]) => batchHandler?.({ connectionId: "new", events }),
  };
}

describe("Live MIDI store", () => {
  it("auto-connects only a safely resolved preferred device and keeps preferences outside Vault", async () => {
    const mock = service();
    const saved = vi.fn();
    const store = createLiveMidiStore({
      service: mock.value,
      loadPreferences: () => ({ preferredInput: { backendId: "one", name: "Keyboard", previousIndex: 0 }, showHistory: true }),
      savePreferences: saved,
      setInterval: (() => 1) as never,
      clearInterval: vi.fn(),
    });
    await store.getState().activate();
    expect(mock.value.start).toHaveBeenCalledWith(device);
    expect(saved).toHaveBeenCalled();
    expect(JSON.stringify(store.getState().preferences)).not.toContain("fileVersion");
  });

  it("feeds batches into the domain and clears notes on deactivate", async () => {
    const mock = service();
    const store = createLiveMidiStore({
      service: mock.value,
      loadPreferences: () => ({}),
      savePreferences: vi.fn(),
      setInterval: (() => 1) as never,
      clearInterval: vi.fn(),
    });
    await store.getState().activate();
    await store.getState().selectDevice("one");
    mock.batch([
      { timestampMs: 0, status: 0x90, channel: 0, data1: 60, data2: 100 },
      { timestampMs: 10, status: 0x90, channel: 0, data1: 64, data2: 100 },
      { timestampMs: 20, status: 0x90, channel: 0, data1: 67, data2: 100 },
      { timestampMs: 140, status: 0xb0, channel: 0, data1: 1, data2: 0 },
    ]);
    expect(store.getState().current.label).toBe("C");
    await store.getState().deactivate();
    expect(store.getState().notes.held.size).toBe(0);
    expect(mock.value.stop).toHaveBeenCalled();
  });
});
