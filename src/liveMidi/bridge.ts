import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { LiveMidiDevice, RawLiveMidiEventBatch } from "./types";

export const LIVE_MIDI_BATCH_EVENT = "live-midi-event-batch";

export interface LiveMidiBridge {
  listInputs: () => Promise<LiveMidiDevice[]>;
  openInput: (device: LiveMidiDevice) => Promise<string>;
  closeInput: () => Promise<void>;
  listenBatches: (handler: (batch: RawLiveMidiEventBatch) => void) => Promise<UnlistenFn>;
}

export const tauriLiveMidiBridge: LiveMidiBridge = {
  async listInputs() {
    if (!isTauri()) return [];
    return invoke<LiveMidiDevice[]>("list_live_midi_inputs");
  },
  async openInput(device) {
    if (!isTauri()) throw new Error("Live MIDI is available in the desktop app only.");
    return invoke<string>("open_live_midi_input", { device });
  },
  async closeInput() {
    if (!isTauri()) return;
    await invoke("close_live_midi_input");
  },
  async listenBatches(handler) {
    if (!isTauri()) return () => undefined;
    return listen<RawLiveMidiEventBatch>(LIVE_MIDI_BATCH_EVENT, (event) => {
      const batch = normalizeBatch(event.payload);
      if (batch) handler(batch);
    });
  },
};

export function normalizeBatch(value: unknown): RawLiveMidiEventBatch | undefined {
  if (!isRecord(value) || typeof value.connectionId !== "string" || !Array.isArray(value.events)) {
    return undefined;
  }
  const events = value.events.flatMap((event) => {
    if (!isRecord(event)) return [];
    const fields = [event.timestampMs, event.status, event.channel, event.data1, event.data2];
    if (!fields.every((field) => typeof field === "number" && Number.isFinite(field))) return [];
    return [{
      timestampMs: event.timestampMs as number,
      status: event.status as number,
      channel: event.channel as number,
      data1: event.data1 as number,
      data2: event.data2 as number,
    }];
  });
  return { connectionId: value.connectionId, events };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
