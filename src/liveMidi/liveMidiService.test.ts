import { describe, expect, it, vi } from "vitest";
import type { LiveMidiBridge } from "./bridge";
import { resolvePreferredInput } from "./deviceSelection";
import { LiveMidiService } from "./liveMidiService";
import type { LiveMidiDevice, RawLiveMidiEventBatch } from "./types";

const devices: LiveMidiDevice[] = [
  { backendId: "a", name: "Keyboard", index: 0 },
  { backendId: "b", name: "Keyboard", index: 1 },
];

function bridge() {
  let batchHandler: ((batch: RawLiveMidiEventBatch) => void) | undefined;
  const value: LiveMidiBridge = {
    listInputs: vi.fn(async () => devices),
    openInput: vi.fn(async () => "connection-new"),
    closeInput: vi.fn(async () => undefined),
    listenBatches: vi.fn(async (handler) => {
      batchHandler = handler;
      return () => undefined;
    }),
  };
  return { value, emit: (batch: RawLiveMidiEventBatch) => batchHandler?.(batch) };
}

describe("LiveMidiService", () => {
  it("discards stale batches from an earlier connection", async () => {
    const mock = bridge();
    const service = new LiveMidiService(mock.value);
    const received = vi.fn();
    service.subscribeBatches(received);
    await service.start(devices[0]);

    mock.emit({ connectionId: "connection-old", events: [] });
    mock.emit({ connectionId: "connection-new", events: [{ timestampMs: 1, status: 144, channel: 0, data1: 60, data2: 100 }] });

    expect(received).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().status).toBe("connected");
  });

  it("clears the selected input when it disappears", async () => {
    const mock = bridge();
    vi.mocked(mock.value.listInputs).mockResolvedValueOnce(devices).mockResolvedValueOnce([]);
    const service = new LiveMidiService(mock.value);
    await service.refreshDevices();
    await service.start(devices[0]);
    await service.refreshDevices();
    expect(service.getSnapshot().status).toBe("disconnected");
    expect(service.getSnapshot().selected).toBeUndefined();
  });
});

describe("resolvePreferredInput", () => {
  it("uses a stable id before name and index", () => {
    expect(resolvePreferredInput(devices, { backendId: "b", name: "Keyboard", previousIndex: 0 })).toEqual(devices[1]);
  });

  it("does not auto-select duplicate names without an index match", () => {
    expect(resolvePreferredInput(devices, { name: "Keyboard" })).toBeUndefined();
    expect(resolvePreferredInput(devices, { name: "Keyboard", previousIndex: 1 })).toEqual(devices[1]);
  });
});
