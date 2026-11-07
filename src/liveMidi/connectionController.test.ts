import { describe, expect, it, vi } from "vitest";
import { createMidiConnectionController } from "./connectionController";
import { LIVE_MIDI_CONNECTION_KEY, loadAutoConnect, saveAutoConnect } from "./connectionPreferences";
import { createLiveMidiStore } from "./liveMidiStore";
import { LiveMidiService } from "./liveMidiService";
import type { LiveMidiPreferences } from "./preferences";
import type { LiveMidiBridge } from "./bridge";
import type { LiveMidiDevice } from "./types";

/**
 * P14 §2 and §2.1: intent, start, coming back, errors, persistence, and the races.
 * The real LiveMidiService runs over a fake bridge, so a stale open behaves as it does in the app.
 */

const piano: LiveMidiDevice = { backendId: "usb-1", name: "Digital Piano", index: 0 };
const synth: LiveMidiDevice = { backendId: "usb-2", name: "Synth", index: 1 };
const flush = async () => { for (let i = 0; i < 12; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

function rig(options: { devices?: LiveMidiDevice[]; preferred?: LiveMidiDevice; autoConnect?: boolean } = {}) {
  let available = options.devices ?? [piano];
  let preferences: LiveMidiPreferences = {
    alwaysOnTop: true,
    showHistory: true,
    ...(options.preferred ? { preferredInput: { backendId: options.preferred.backendId, name: options.preferred.name, previousIndex: options.preferred.index } } : {}),
  };
  const saves: LiveMidiPreferences[] = [];
  const stats = { opens: 0, closes: 0, openedIds: [] as string[] };
  let deferNext = false;
  let pending: { resolve: () => void; reject: (error: Error) => void } | undefined;
  let failNext = false;
  let isOpen = false; // closes count only real connections: the service also closes before each open
  const bridge: LiveMidiBridge = {
    listInputs: async () => [...available],
    openInput: async (device) => {
      stats.opens += 1;
      stats.openedIds.push(device.backendId);
      if (deferNext) {
        deferNext = false;
        await new Promise<void>((resolve, reject) => { pending = { resolve, reject }; });
      }
      if (failNext) { failNext = false; throw new Error("合成接続エラー"); }
      isOpen = true;
      return `${device.backendId}-connection`;
    },
    closeInput: async () => { if (isOpen) stats.closes += 1; isOpen = false; },
    listenBatches: async () => () => undefined,
  };
  const service = new LiveMidiService(bridge);
  const liveStore = createLiveMidiStore({
    service,
    loadPreferences: () => preferences,
    savePreferences: (next) => { preferences = next; saves.push(next); },
    setInterval: (() => 1) as never,
    clearInterval: vi.fn(),
  });
  const autoSaves: boolean[] = [];
  let autoConnect = options.autoConnect ?? true;
  const controller = createMidiConnectionController({
    liveStore,
    loadAutoConnect: () => autoConnect,
    saveAutoConnect: (value) => { autoConnect = value; autoSaves.push(value); },
  });
  return {
    controller,
    liveStore,
    stats,
    saves,
    autoSaves,
    kind: () => controller.getView().kind,
    saved: () => preferences.preferredInput?.backendId,
    plug: async (...devices: LiveMidiDevice[]) => { available = devices.length ? devices : [piano]; await liveStore.getState().refreshDevices(); },
    unplug: async () => { available = []; await liveStore.getState().refreshDevices(); },
    deferOpen: () => { deferNext = true; },
    resumeOpen: (fail = false) => { if (fail) failNext = true; pending?.resolve(); pending = undefined; },
  };
}

describe("start (P14 §2)", () => {
  it("connects the saved input at start and keeps one open", async () => {
    const t = rig({ preferred: piano });
    await t.controller.initOnAppStart();
    expect(t.kind()).toBe("connected");
    expect(t.stats).toMatchObject({ opens: 1, closes: 0 });
    // Starting twice (a second window, StrictMode) does nothing more.
    await t.controller.initOnAppStart();
    expect(t.stats.opens).toBe(1);
  });

  it("waits with the intent on when the saved input is not there, and connects when it shows up", async () => {
    const t = rig({ devices: [], preferred: piano });
    await t.controller.initOnAppStart();
    expect(t.kind()).toBe("missing");
    expect(t.stats.opens).toBe(0);
    await t.plug(piano);
    await flush();
    expect(t.kind()).toBe("connected");
    expect(t.stats.opens).toBe(1);
  });

  it("starts with the intent off, and opens nothing, when auto-connect is off", async () => {
    const t = rig({ preferred: piano, autoConnect: false });
    await t.controller.initOnAppStart();
    await flush();
    expect(t.kind()).toBe("off");
    expect(t.stats).toMatchObject({ opens: 0, closes: 0 });
    expect(t.liveStore.getState().devices).toEqual([piano]); // the panel still lists them
    expect(t.liveStore.getState().active).toBe(false);
  });

  it("does not connect by itself when nothing was saved, but offers the choice", async () => {
    const t = rig({ devices: [piano, synth] });
    await t.controller.initOnAppStart();
    await flush();
    expect(t.kind()).toBe("choose");
    expect(t.stats.opens).toBe(0);
  });
});

describe("disconnect and connect (P14 §2, R5)", () => {
  it("a manual disconnect closes the input, stays off, saves nothing, and clears the last input", async () => {
    const t = rig({ preferred: piano });
    await t.controller.initOnAppStart();
    expect(t.controller.state.getState().lastConnected).toEqual({ backendId: "usb-1", name: "Digital Piano" });
    await t.controller.disconnect();
    expect(t.kind()).toBe("off");
    expect(t.stats.closes).toBe(1);
    expect(t.controller.state.getState().lastConnected).toBeUndefined();
    await t.plug(piano);
    await flush();
    expect(t.stats.opens).toBe(1); // nothing connects it again
    expect(t.autoSaves).toEqual([]); // R5: the disconnect is for this run only
    await t.controller.connect();
    expect(t.kind()).toBe("connected");
    expect(t.stats.opens).toBe(2);
  });

  it("the next start follows the auto-connect setting, not the last disconnect", async () => {
    const t = rig({ preferred: piano });
    await t.controller.initOnAppStart();
    await t.controller.disconnect();
    const next = createMidiConnectionController({ liveStore: t.liveStore, loadAutoConnect: () => true, saveAutoConnect: () => undefined });
    await next.initOnAppStart();
    expect(next.getView().kind).toBe("connected");
  });

  it("setAutoConnect saves the choice for the next start and does not change this run", async () => {
    const t = rig({ preferred: piano });
    await t.controller.initOnAppStart();
    t.controller.setAutoConnect(false);
    expect(t.autoSaves).toEqual([false]);
    expect(t.kind()).toBe("connected");
  });
});

describe("coming back and errors (P14 §2)", () => {
  it("an unplugged input is 「外れました」, and it connects again by itself when it returns", async () => {
    const t = rig({ preferred: piano });
    await t.controller.initOnAppStart();
    await t.unplug();
    expect(t.kind()).toBe("lost");
    expect(t.controller.getView().label).toBe("Digital Piano が外れました");
    await t.plug(piano);
    await flush();
    expect(t.kind()).toBe("connected");
    expect(t.stats.opens).toBe(2);
  });

  it("after an error nothing is tried again by itself; retry tries once", async () => {
    const t = rig({ preferred: piano });
    t.deferOpen();
    const start = t.controller.initOnAppStart();
    await flush();
    t.resumeOpen(true);
    await start;
    expect(t.kind()).toBe("error");
    expect(t.stats.opens).toBe(1);
    for (let i = 0; i < 5; i += 1) await t.plug(piano);
    await flush();
    expect(t.stats.opens).toBe(1);
    await t.controller.retry();
    expect(t.kind()).toBe("connected");
    expect(t.stats.opens).toBe(2);
  });
});

describe("auto-connect storage (P14 §2)", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, data };
  };

  it("is on when nothing or something broken is saved, and keeps its own key", () => {
    const storage = memory();
    expect(loadAutoConnect(storage)).toBe(true);
    for (const broken of ["not json", "{}", '{"autoConnect":"yes"}', '{"autoConnect":false,"extra":1}', "null"]) {
      storage.data.set(LIVE_MIDI_CONNECTION_KEY, broken);
      expect(loadAutoConnect(storage)).toBe(true);
    }
    saveAutoConnect(false, storage);
    expect(storage.data.get(LIVE_MIDI_CONNECTION_KEY)).toBe('{"autoConnect":false}');
    expect(loadAutoConnect(storage)).toBe(false);
    expect(LIVE_MIDI_CONNECTION_KEY).toBe("loop-vault:live-midi-connection:v1");
  });
});

describe("races (P14 §2.1, R2)", () => {
  it("a disconnect while connecting: the late connection is closed, it never becomes connected, the view stays off", async () => {
    const t = rig({ preferred: piano, autoConnect: false });
    await t.controller.initOnAppStart();
    t.deferOpen();
    void t.controller.connect();
    await flush();
    expect(t.stats).toMatchObject({ opens: 1, closes: 0 });
    const disconnecting = t.controller.disconnect();
    expect(t.kind()).toBe("off"); // the intent counts at once
    t.resumeOpen();
    await disconnecting;
    await flush();
    expect(t.kind()).toBe("off");
    expect(t.liveStore.getState().status).toBe("idle");
    expect(t.liveStore.getState().active).toBe(false);
    expect(t.stats.closes).toBe(1);
    expect(t.controller.state.getState().lastConnected).toBeUndefined();
  });

  it("choosing B while A is connecting ends on B, saved as the input; A never overwrites it", async () => {
    const t = rig({ devices: [piano, synth], preferred: piano, autoConnect: false });
    await t.controller.initOnAppStart();
    t.deferOpen();
    void t.controller.connect();
    await flush();
    const choosing = t.controller.chooseDevice("usb-2");
    expect(t.saved()).toBe("usb-2"); // saved at once
    t.resumeOpen();
    await choosing;
    await flush();
    expect(t.kind()).toBe("connected");
    expect(t.liveStore.getState().selected?.backendId).toBe("usb-2");
    expect(t.saved()).toBe("usb-2");
    expect(t.saves.every((entry) => entry.preferredInput?.backendId === "usb-2")).toBe(true);
    expect(t.stats.openedIds).toEqual(["usb-1", "usb-2"]);
  });

  it("only one connection runs at a time: many requests at once open the input once", async () => {
    const t = rig({ preferred: piano, autoConnect: false });
    await t.controller.initOnAppStart();
    await Promise.all([t.controller.connect(), t.controller.connect(), t.controller.connect()]);
    expect(t.stats.opens).toBe(1);
    expect(t.kind()).toBe("connected");
  });

  it("every operation bumps the generation", async () => {
    const t = rig({ preferred: piano, autoConnect: false });
    const before = t.controller.state.getState().generation;
    await t.controller.connect();
    await t.controller.disconnect();
    expect(t.controller.state.getState().generation).toBeGreaterThanOrEqual(before + 2);
  });

  it("a settings connection test pauses the connection and puts it back", async () => {
    const t = rig({ preferred: piano });
    await t.controller.initOnAppStart();
    const result = await t.controller.testDevice("usb-1");
    await flush();
    expect(result.ok).toBe(true);
    expect(t.kind()).toBe("connected");
    expect(t.stats.opens).toBe(3); // start, the test, the reconnection
  });
});
