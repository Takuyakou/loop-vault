import { createStore, type StoreApi } from "zustand/vanilla";
import {
  createLiveChordHistoryState,
  createLiveChordStabilizerState,
  createLiveNoteState,
  detectLiveChord,
  emptyLiveChordDetection,
  reduceLiveNoteState,
  stabilizeLiveChord,
  updateLiveChordHistory,
  type LiveChordDetection,
  type LiveChordHistoryEntry,
  type LiveChordHistoryState,
  type LiveChordStabilizerState,
  type LiveNoteState,
} from "../domain/liveMidi";
import { preferredInputFromDevice, resolvePreferredInput } from "./deviceSelection";
import { liveMidiService, type LiveMidiServiceSnapshot } from "./liveMidiService";
import {
  loadLiveMidiPreferences,
  saveLiveMidiPreferences,
  type LiveMidiPreferences,
} from "./preferences";
import type { LiveMidiConnectionStatus, LiveMidiDevice, RawLiveMidiEventBatch } from "./types";

export interface LiveMidiServicePort {
  getSnapshot: () => LiveMidiServiceSnapshot;
  subscribe: (listener: (snapshot: LiveMidiServiceSnapshot) => void) => () => void;
  subscribeBatches: (listener: (batch: RawLiveMidiEventBatch) => void) => () => void;
  refreshDevices: () => Promise<LiveMidiDevice[]>;
  start: (device: LiveMidiDevice) => Promise<boolean>;
  stop: (status?: LiveMidiConnectionStatus) => Promise<void>;
}

export interface LiveMidiStoreState {
  active: boolean;
  devices: LiveMidiDevice[];
  selected?: LiveMidiDevice;
  status: LiveMidiConnectionStatus;
  error?: string;
  preferences: LiveMidiPreferences;
  notes: LiveNoteState;
  stabilizer: LiveChordStabilizerState;
  current: LiveChordDetection;
  historyState: LiveChordHistoryState;
  history: LiveChordHistoryEntry[];
  activate: () => Promise<void>;
  deactivate: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  selectDevice: (backendId: string) => Promise<void>;
  setShowHistory: (show: boolean) => void;
  clearSession: () => void;
}

export interface CreateLiveMidiStoreOptions {
  service?: LiveMidiServicePort;
  now?: () => number;
  loadPreferences?: () => LiveMidiPreferences;
  savePreferences?: (preferences: LiveMidiPreferences) => void;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

export function createLiveMidiStore(options: CreateLiveMidiStoreOptions = {}): StoreApi<LiveMidiStoreState> {
  const service = options.service ?? liveMidiService;
  const now = options.now ?? (() => performance.now());
  const loadPreferences = options.loadPreferences ?? (() => loadLiveMidiPreferences());
  const savePreferences = options.savePreferences ?? ((preferences) => saveLiveMidiPreferences(preferences));
  const schedule = options.setInterval ?? globalThis.setInterval;
  const cancel = options.clearInterval ?? globalThis.clearInterval;
  let unlistenSnapshot: (() => void) | undefined;
  let unlistenBatches: (() => void) | undefined;
  let tickTimer: ReturnType<typeof globalThis.setInterval> | undefined;
  let deviceTimer: ReturnType<typeof globalThis.setInterval> | undefined;
  let lastEventTimestampMs = 0;
  let lastBatchReceivedAt = 0;
  let historySequence = 0;

  const store = createStore<LiveMidiStoreState>((set, get) => ({
    active: false,
    devices: [],
    status: "idle",
    preferences: { alwaysOnTop: true, showHistory: true },
    notes: createLiveNoteState(),
    stabilizer: createLiveChordStabilizerState(),
    current: emptyLiveChordDetection(),
    historyState: createLiveChordHistoryState(),
    history: [],

    async activate() {
      if (get().active) return;
      const preferences = loadPreferences();
      set({ active: true, preferences, error: undefined });
      unlistenSnapshot = service.subscribe((snapshot) => {
        set({
          devices: snapshot.devices,
          selected: snapshot.selected,
          status: snapshot.status,
          error: snapshot.error,
        });
        if (snapshot.status === "disconnected" || snapshot.status === "error") resetNotes(set, get);
      });
      unlistenBatches = service.subscribeBatches((batch) => processBatch(batch, set, get));
      tickTimer = schedule(() => advance(sessionNow(), set, get), 40);
      deviceTimer = schedule(() => { void get().refreshDevices(); }, 2000);
      await get().refreshDevices();
      if (!get().active) return;
      const preferred = resolvePreferredInput(get().devices, preferences.preferredInput);
      if (preferred) await get().selectDevice(preferred.backendId);
    },

    async deactivate() {
      if (!get().active) return;
      set({ active: false });
      if (tickTimer !== undefined) cancel(tickTimer);
      if (deviceTimer !== undefined) cancel(deviceTimer);
      tickTimer = undefined;
      deviceTimer = undefined;
      unlistenSnapshot?.();
      unlistenBatches?.();
      unlistenSnapshot = undefined;
      unlistenBatches = undefined;
      await service.stop();
      resetNotes(set, get);
      set({ status: "idle", selected: undefined });
    },

    async refreshDevices() {
      const devices = await service.refreshDevices();
      if (get().active) set({ devices });
    },

    async selectDevice(backendId) {
      const device = get().devices.find((entry) => entry.backendId === backendId);
      if (!device) return;
      resetNotes(set, get);
      const opened = await service.start(device);
      if (!opened || !get().active) return;
      const preferences = { ...get().preferences, preferredInput: preferredInputFromDevice(device) };
      set({ preferences });
      savePreferences(preferences);
    },

    setShowHistory(show) {
      const preferences = { ...get().preferences, showHistory: show };
      set({ preferences });
      savePreferences(preferences);
    },

    clearSession() {
      historySequence = 0;
      set({ historyState: createLiveChordHistoryState(), history: [] });
    },
  }));

  function processBatch(
    batch: RawLiveMidiEventBatch,
    set: StoreApi<LiveMidiStoreState>["setState"],
    get: StoreApi<LiveMidiStoreState>["getState"],
  ) {
    if (!get().active) return;
    lastBatchReceivedAt = now();
    for (const event of batch.events) {
      lastEventTimestampMs = Math.max(lastEventTimestampMs, event.timestampMs);
      const notes = reduceLiveNoteState(get().notes, event);
      set({ notes });
      advance(event.timestampMs, set, get);
    }
  }

  function sessionNow(): number {
    return lastEventTimestampMs + Math.max(0, now() - lastBatchReceivedAt);
  }

  function advance(
    timestampMs: number,
    set: StoreApi<LiveMidiStoreState>["setState"],
    get: StoreApi<LiveMidiStoreState>["getState"],
  ) {
    if (!get().active) return;
    const detection = detectLiveChord(get().notes);
    const stabilizer = stabilizeLiveChord(get().stabilizer, detection, timestampMs);
    const beforeCount = get().historyState.entries.length;
    const historyState = updateLiveChordHistory(
      get().historyState,
      stabilizer.displayed,
      timestampMs,
      `live-${historySequence + 1}`,
    );
    if (historyState.entries.length > beforeCount) historySequence += 1;
    set({ stabilizer, current: stabilizer.displayed, historyState, history: historyState.entries });
  }

  return store;
}

function resetNotes(
  set: StoreApi<LiveMidiStoreState>["setState"],
  get: StoreApi<LiveMidiStoreState>["getState"],
) {
  set({
    notes: createLiveNoteState(),
    stabilizer: createLiveChordStabilizerState(),
    current: emptyLiveChordDetection(),
    historyState: { entries: get().historyState.entries },
  });
}
