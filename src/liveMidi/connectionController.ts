import { createStore, type StoreApi } from "zustand/vanilla";
import { defaultLiveMidiStore } from "./defaultLiveMidiStore";
import { preferredInputFromDevice, resolvePreferredInput } from "./deviceSelection";
import { loadAutoConnect, saveAutoConnect } from "./connectionPreferences";
import { selectMidiConnection, type MidiConnectionView } from "./connectionView";
import type { LiveMidiDeviceTestResult, LiveMidiStoreState } from "./liveMidiStore";
import type { LiveMidiDevice } from "./types";

/**
 * P14 §2: the one owner of the MIDI input. Only this controller opens and closes it
 * (through the Live MIDI store); screens read `selectMidiConnection` and never take a lease.
 *
 * Every operation that touches the connection (connect, disconnect, retry, chooseDevice, the
 * automatic ones) bumps `generation` and asks for a reconcile. One reconcile runs at a time; it
 * moves the store towards what is wanted now, and an answer that arrives for an older generation
 * is dropped (spec 2.1): a connection that finishes after a disconnect is closed at once, and a
 * device chosen meanwhile wins.
 */

export interface MidiConnectionControllerState {
  intent: "on" | "off";
  /** The input that was connected at some point in this run; empty after a manual disconnect. */
  lastConnected?: { backendId: string; name: string };
  /** 「起動した時に自動でつなぐ」(saved under its own key). */
  autoConnect: boolean;
  /** Bumped by every connection operation (spec 2.1). */
  generation: number;
}

export interface CreateMidiConnectionControllerOptions {
  liveStore?: StoreApi<LiveMidiStoreState>;
  loadAutoConnect?: () => boolean;
  saveAutoConnect?: (autoConnect: boolean) => void;
}

export interface MidiConnectionController {
  readonly state: StoreApi<MidiConnectionControllerState>;
  getView(): MidiConnectionView;
  initOnAppStart(): Promise<void>;
  connect(): Promise<void>;
  /** Intent off and the input closed. Only for this run: nothing is saved (R5). */
  disconnect(): Promise<void>;
  retry(): Promise<void>;
  chooseDevice(backendId: string): Promise<void>;
  refreshDevices(): Promise<void>;
  setAutoConnect(autoConnect: boolean): void;
  /** The settings 接続テスト: pauses the connection, opens the chosen input once, then connects again if it was on. */
  testDevice(backendId: string): Promise<LiveMidiDeviceTestResult>;
  /** Closes the input and stops reconciling (the app is closing). */
  shutdown(): Promise<void>;
}

export function createMidiConnectionController(options: CreateMidiConnectionControllerOptions = {}): MidiConnectionController {
  const live = options.liveStore ?? defaultLiveMidiStore;
  const load = options.loadAutoConnect ?? (() => loadAutoConnect());
  const save = options.saveAutoConnect ?? ((value: boolean) => saveAutoConnect(value));
  const state = createStore<MidiConnectionControllerState>(() => ({ intent: "off", autoConnect: load(), generation: 0 }));

  let running: Promise<void> | undefined;
  let dirty = false;
  let testing = false;
  let started = false;
  let down = false;

  const isStale = (generation: number) => state.getState().generation !== generation;
  const bump = () => {
    state.setState((current) => ({ generation: current.generation + 1 }));
    return state.getState().generation;
  };

  function desiredDevice(): LiveMidiDevice | undefined {
    const current = live.getState();
    return resolvePreferredInput(current.devices, current.preferences.preferredInput);
  }

  function isConnectedTo(device: LiveMidiDevice): boolean {
    const current = live.getState();
    return current.status === "connected" && current.selected?.backendId === device.backendId;
  }

  /** One pass: move the store towards what is wanted now. Stops early when a newer operation arrived. */
  async function step(generation: number): Promise<void> {
    if (down || state.getState().intent === "off" || testing) {
      if (live.getState().active) await live.getState().deactivate();
      return;
    }
    if (!live.getState().active) {
      await live.getState().activate({ autoSelect: false });
      if (isStale(generation)) return;
    }
    const target = desiredDevice();
    if (!target || isConnectedTo(target)) return;
    await live.getState().selectDevice(target.backendId, { persist: false });
    if (isStale(generation)) return;
    if (isConnectedTo(target)) {
      // The result is current: this input is now the saved one (the store would only have saved it itself).
      const saved = live.getState().preferences.preferredInput;
      const wanted = preferredInputFromDevice(target);
      if (saved?.backendId !== wanted.backendId || saved?.name !== wanted.name || saved?.previousIndex !== wanted.previousIndex) {
        live.getState().setPreferredDevice(target.backendId);
      }
    }
  }

  async function loop(): Promise<void> {
    await Promise.resolve(); // `running` is assigned before the first pass runs
    try {
      while (dirty) {
        dirty = false;
        try {
          await step(state.getState().generation);
        } catch {
          // A failed open is shown through the store's error status.
        }
      }
    } finally {
      running = undefined;
    }
  }

  function request(): Promise<void> {
    dirty = true;
    if (!running) running = loop();
    return running;
  }

  const unsubscribe = live.subscribe((current) => {
    const controller = state.getState();
    // The input that connected in this run (only while the intent is on: a connection that is being
    // closed after a disconnect must not become 「前回」).
    if (controller.intent === "on" && current.status === "connected" && current.selected) {
      const last = controller.lastConnected;
      if (last?.backendId !== current.selected.backendId || last.name !== current.selected.name) {
        state.setState({ lastConnected: { backendId: current.selected.backendId, name: current.selected.name } });
      }
    }
    // A saved input that is found while the intent is on connects by itself: at start, and when it comes back.
    // After an error nothing is tried again by itself (retry or choosing a device does).
    if (down || testing || controller.intent !== "on" || running) return;
    if (!current.active || current.initializing) return;
    if (current.status === "connected" || current.status === "connecting" || current.status === "error") return;
    if (desiredDevice()) void request();
  });

  const controller: MidiConnectionController = {
    state,
    getView: () => selectMidiConnection(live.getState(), state.getState()),

    async initOnAppStart() {
      if (started) return;
      started = true;
      const autoConnect = load();
      state.setState({ autoConnect, intent: autoConnect ? "on" : "off" });
      bump();
      if (autoConnect) return request();
      // Off: nothing is opened, but the panel needs the input list and the saved input.
      await live.getState().refreshDevices();
    },

    connect() {
      state.setState({ intent: "on" });
      bump();
      return request();
    },

    disconnect() {
      state.setState({ intent: "off", lastConnected: undefined });
      bump();
      return request();
    },

    async retry() {
      state.setState({ intent: "on" });
      const generation = bump();
      await live.getState().refreshDevices();
      if (isStale(generation)) return running;
      return request();
    },

    async chooseDevice(backendId) {
      // The choice is saved at once; whatever finishes later for another input cannot overwrite it.
      live.getState().setPreferredDevice(backendId);
      if (state.getState().intent !== "on") return;
      bump();
      await request();
    },

    async refreshDevices() {
      await live.getState().refreshDevices();
    },

    setAutoConnect(autoConnect) {
      save(autoConnect);
      state.setState({ autoConnect });
    },

    async testDevice(backendId) {
      const resume = state.getState().intent === "on";
      testing = true;
      bump();
      await request();
      try {
        return await live.getState().testDevice(backendId);
      } finally {
        testing = false;
        if (resume) {
          bump();
          void request();
        }
      }
    },

    async shutdown() {
      down = true;
      unsubscribe();
      state.setState({ intent: "off" });
      bump();
      await request();
    },
  };
  return controller;
}

export const connectionController = createMidiConnectionController();
