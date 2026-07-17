import { createStore, type StoreApi } from "zustand/vanilla";
import {
  createLiveChordHistoryState,
  createLiveChordStabilizerState,
  createLiveNoteState,
  detectLiveChord,
  emptyLiveChordDetection,
  liveChordHistoryDeadline,
  provisionalChordReadyAt,
  reduceLiveNoteState,
  stabilizeLiveChord,
  updateLiveChordHistory,
  detectionKey,
  type LiveChordDetection,
  type LiveChordHistoryEntry,
  type LiveChordHistoryState,
  type LiveChordStabilizerState,
  type LiveNoteState,
} from "../domain/liveMidi";
import { preferredInputFromDevice, resolvePreferredInput } from "./deviceSelection";
import { liveMidiService, type LiveMidiServiceSnapshot } from "./liveMidiService";
import {
  LiveMidiLatencyTracker,
  type LiveMidiLatencyReport,
} from "./latencyMetrics";
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
  instant: LiveChordDetection;
  provisionalChord?: LiveChordDetection;
  confirmedChord: LiveChordDetection;
  historyState: LiveChordHistoryState;
  history: LiveChordHistoryEntry[];
  latency: LiveMidiLatencyReport;
  activate: () => Promise<void>;
  deactivate: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  selectDevice: (backendId: string) => Promise<void>;
  setPreferredDevice: (backendId: string) => void;
  testDevice: (backendId: string) => Promise<LiveMidiDeviceTestResult>;
  setShowHistory: (show: boolean) => void;
  clearSession: () => void;
  resetLatencyMetrics: () => void;
}

export interface LiveMidiDeviceTestResult {
  ok: boolean;
  error?: string;
}

export interface CreateLiveMidiStoreOptions {
  service?: LiveMidiServicePort;
  now?: () => number;
  epochNow?: () => number;
  loadPreferences?: () => LiveMidiPreferences;
  savePreferences?: (preferences: LiveMidiPreferences) => void;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export function createLiveMidiStore(options: CreateLiveMidiStoreOptions = {}): StoreApi<LiveMidiStoreState> {
  const service = options.service ?? liveMidiService;
  const now = options.now ?? (() => performance.now());
  const epochNow = options.epochNow ?? (() => performance.timeOrigin + performance.now());
  const loadPreferences = options.loadPreferences ?? (() => loadLiveMidiPreferences());
  const savePreferences = options.savePreferences ?? ((preferences) => saveLiveMidiPreferences(preferences));
  const scheduleInterval = options.setInterval ?? globalThis.setInterval;
  const cancelInterval = options.clearInterval ?? globalThis.clearInterval;
  const scheduleTimeout = options.setTimeout ?? globalThis.setTimeout;
  const cancelTimeout = options.clearTimeout ?? globalThis.clearTimeout;
  let unlistenSnapshot: (() => void) | undefined;
  let unlistenBatches: (() => void) | undefined;
  let deadlineTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let deviceTimer: ReturnType<typeof globalThis.setInterval> | undefined;
  let lastEventTimestampMs = 0;
  let lastBatchReceivedAt = 0;
  let historySequence = 0;
  let lastCandidateKey: string | undefined;
  let candidateOriginReceivedAtMs: number | undefined;
  const latencyTracker = new LiveMidiLatencyTracker();

  const store = createStore<LiveMidiStoreState>((set, get) => ({
    active: false,
    devices: [],
    status: "idle",
    preferences: { alwaysOnTop: true, showHistory: true },
    notes: createLiveNoteState(),
    stabilizer: createLiveChordStabilizerState(),
    instant: emptyLiveChordDetection(),
    confirmedChord: emptyLiveChordDetection(),
    historyState: createLiveChordHistoryState(),
    history: [],
    latency: latencyTracker.report(),

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
        if (snapshot.status === "disconnected" || snapshot.status === "error") resetRuntimeNotes(set, get);
      });
      unlistenBatches = service.subscribeBatches((batch) => processBatch(batch, set, get));
      deviceTimer = scheduleInterval(() => { void get().refreshDevices(); }, 2000);
      await get().refreshDevices();
      if (!get().active) return;
      const preferred = resolvePreferredInput(get().devices, preferences.preferredInput);
      if (preferred) await get().selectDevice(preferred.backendId);
    },

    async deactivate() {
      if (!get().active) return;
      set({ active: false });
      if (deadlineTimer !== undefined) cancelTimeout(deadlineTimer);
      if (deviceTimer !== undefined) cancelInterval(deviceTimer);
      deadlineTimer = undefined;
      deviceTimer = undefined;
      unlistenSnapshot?.();
      unlistenBatches?.();
      unlistenSnapshot = undefined;
      unlistenBatches = undefined;
      await service.stop();
      resetRuntimeNotes(set, get);
      set({ status: "idle", selected: undefined });
    },

    async refreshDevices() {
      const devices = await service.refreshDevices();
      const preferences = get().active ? get().preferences : loadPreferences();
      set({ devices, preferences });
    },

    async selectDevice(backendId) {
      const device = get().devices.find((entry) => entry.backendId === backendId);
      if (!device) return;
      resetRuntimeNotes(set, get);
      const opened = await service.start(device);
      if (!opened || !get().active) return;
      const preferences = { ...get().preferences, preferredInput: preferredInputFromDevice(device) };
      set({ preferences });
      savePreferences(preferences);
    },

    setPreferredDevice(backendId) {
      const device = get().devices.find((entry) => entry.backendId === backendId);
      const preferences = {
        ...get().preferences,
        preferredInput: device ? preferredInputFromDevice(device) : undefined,
      };
      set({ preferences, error: undefined });
      savePreferences(preferences);
    },

    async testDevice(backendId) {
      const device = get().devices.find((entry) => entry.backendId === backendId);
      if (!device) return { ok: false, error: "Selected MIDI input is no longer available." };
      if (get().active) return { ok: false, error: "Live MIDI is already active." };

      set({ status: "connecting", error: undefined });
      const opened = await service.start(device);
      const error = service.getSnapshot().error;
      await service.stop();
      set({ status: opened ? "idle" : "error", selected: undefined, error });
      return opened ? { ok: true } : { ok: false, error };
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

    resetLatencyMetrics() {
      latencyTracker.reset();
      set({ latency: latencyTracker.report() });
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
      if (event.receivedAtMs !== undefined) {
        latencyTracker.record("rustMidiReceived", 0);
        if (batch.emittedAtMs !== undefined) {
          latencyTracker.record("rustBatchEmitted", batch.emittedAtMs - event.receivedAtMs);
        }
        if (batch.frontendReceivedAtMs !== undefined) {
          latencyTracker.record(
            "frontendBatchReceived",
            batch.frontendReceivedAtMs - event.receivedAtMs,
          );
        }
      }
    }
    for (const event of batch.events) {
      lastEventTimestampMs = Math.max(lastEventTimestampMs, event.timestampMs);
      const notes = reduceLiveNoteState(get().notes, event);
      set({ notes });
      if (event.receivedAtMs !== undefined) {
        latencyTracker.record("noteStateUpdated", epochNow() - event.receivedAtMs);
      }
      advance(event.timestampMs, set, get, event.receivedAtMs);
    }
    scheduleNextDeadline(set, get);
  }

  function sessionNow(): number {
    return lastEventTimestampMs + Math.max(0, now() - lastBatchReceivedAt);
  }

  function advance(
    timestampMs: number,
    set: StoreApi<LiveMidiStoreState>["setState"],
    get: StoreApi<LiveMidiStoreState>["getState"],
    inputReceivedAtMs?: number,
  ) {
    if (!get().active) return;
    const detection = detectLiveChord(get().notes);
    const nextCandidateKey = detectionKey(detection);
    if (nextCandidateKey !== lastCandidateKey) {
      lastCandidateKey = nextCandidateKey;
      candidateOriginReceivedAtMs = inputReceivedAtMs;
      if (detection.kind === "chord" && inputReceivedAtMs !== undefined) {
        latencyTracker.record(
          "provisionalCandidateGenerated",
          epochNow() - inputReceivedAtMs,
        );
      }
    }
    const previousProvisional = get().stabilizer.provisional;
    const previousProvisionalKey = previousProvisional
      ? detectionKey(previousProvisional)
      : undefined;
    const previousConfirmedKey = detectionKey(get().stabilizer.confirmed);
    const stabilizer = stabilizeLiveChord(
      get().stabilizer,
      detection,
      timestampMs,
      provisionalChordReadyAt(get().notes, detection),
    );
    const beforeCount = get().historyState.entries.length;
    const historyState = updateLiveChordHistory(
      get().historyState,
      stabilizer.confirmed,
      timestampMs,
      `live-${historySequence + 1}`,
    );
    if (historyState.entries.length > beforeCount) historySequence += 1;
    if (
      stabilizer.provisional
      && detectionKey(stabilizer.provisional) !== previousProvisionalKey
      && candidateOriginReceivedAtMs !== undefined
    ) {
      latencyTracker.record(
        "provisionalChordDisplayed",
        epochNow() - candidateOriginReceivedAtMs,
      );
    }
    if (
      stabilizer.confirmed.kind === "chord"
      && detectionKey(stabilizer.confirmed) !== previousConfirmedKey
      && candidateOriginReceivedAtMs !== undefined
    ) {
      latencyTracker.record(
        "confirmedChordDisplayed",
        epochNow() - candidateOriginReceivedAtMs,
      );
    }
    set({
      stabilizer,
      instant: detection,
      provisionalChord: stabilizer.provisional,
      confirmedChord: stabilizer.confirmed,
      historyState,
      history: historyState.entries,
      latency: latencyTracker.report(),
    });
  }

  function scheduleNextDeadline(
    set: StoreApi<LiveMidiStoreState>["setState"],
    get: StoreApi<LiveMidiStoreState>["getState"],
  ) {
    if (deadlineTimer !== undefined) cancelTimeout(deadlineTimer);
    deadlineTimer = undefined;
    const deadlines = [
      get().stabilizer.nextDeadlineMs,
      liveChordHistoryDeadline(get().historyState),
    ].filter((value): value is number => value !== undefined);
    const deadlineMs = deadlines.length > 0 ? Math.min(...deadlines) : undefined;
    if (!get().active || deadlineMs === undefined) return;
    const delayMs = Math.max(0, deadlineMs - sessionNow());
    deadlineTimer = scheduleTimeout(() => {
      deadlineTimer = undefined;
      advance(sessionNow(), set, get);
      scheduleNextDeadline(set, get);
    }, delayMs);
  }

  function resetRuntimeNotes(
    set: StoreApi<LiveMidiStoreState>["setState"],
    get: StoreApi<LiveMidiStoreState>["getState"],
  ) {
    if (deadlineTimer !== undefined) cancelTimeout(deadlineTimer);
    deadlineTimer = undefined;
    lastCandidateKey = undefined;
    candidateOriginReceivedAtMs = undefined;
    resetNotes(set, get);
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
    instant: emptyLiveChordDetection(),
    provisionalChord: undefined,
    confirmedChord: emptyLiveChordDetection(),
    historyState: { entries: get().historyState.entries },
    latency: get().latency,
  });
}
