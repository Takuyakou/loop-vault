import { describe, expect, it } from "vitest";
import { selectMidiConnection, type MidiConnectionControllerView, type MidiConnectionLiveState } from "./connectionView";
import type { LiveMidiDevice } from "./types";

/** P14 §3: every row of the state table, and the two R1 cases. */

const piano: LiveMidiDevice = { backendId: "usb-1", name: "Digital Piano", index: 0 };
const synth: LiveMidiDevice = { backendId: "usb-2", name: "Synth", index: 1 };

const live = (overrides: Partial<MidiConnectionLiveState> = {}): MidiConnectionLiveState => ({
  active: true,
  initializing: false,
  devices: [piano],
  selected: undefined,
  status: "idle",
  error: undefined,
  preferences: { alwaysOnTop: true, showHistory: true },
  ...overrides,
});
const on: MidiConnectionControllerView = { intent: "on" };
const saved = { backendId: "usb-1", name: "Digital Piano" };

describe("selectMidiConnection (P14 §3)", () => {
  it("off: the intent is off", () => {
    expect(selectMidiConnection(live(), { intent: "off" })).toMatchObject({ kind: "off", label: "MIDI に接続", connected: false, busy: false });
  });

  it("connected: connected with a device, labelled by its name", () => {
    expect(selectMidiConnection(live({ status: "connected", selected: piano }), on)).toMatchObject({ kind: "connected", label: "Digital Piano", deviceName: "Digital Piano", connected: true, busy: false });
  });

  it("connecting: 「{機器名} に接続しています」, busy", () => {
    expect(selectMidiConnection(live({ status: "connecting", selected: piano }), on)).toMatchObject({ kind: "connecting", label: "Digital Piano に接続しています", connected: false, busy: true });
    // Before the service names the device, the saved input does.
    expect(selectMidiConnection(live({ status: "connecting", preferences: { alwaysOnTop: true, showHistory: true, preferredInput: saved } }), on).label).toBe("Digital Piano に接続しています");
  });

  it("error: 「MIDI エラー」 with the error text", () => {
    expect(selectMidiConnection(live({ status: "error", error: "合成接続エラー" }), on)).toMatchObject({ kind: "error", label: "MIDI エラー", error: "合成接続エラー", connected: false, busy: false });
  });

  it("searching: the first look for devices after start, busy", () => {
    expect(selectMidiConnection(live({ initializing: true }), on)).toMatchObject({ kind: "searching", label: "MIDI を探しています", busy: true });
    expect(selectMidiConnection(live({ active: false }), on).kind).toBe("searching");
  });

  it("lost: it was connected in this run and is not now (device missing from the list, or the status says so)", () => {
    const lost = { intent: "on", lastConnected: saved } as const;
    expect(selectMidiConnection(live({ status: "disconnected", devices: [] }), lost)).toMatchObject({ kind: "lost", label: "Digital Piano が外れました", deviceName: "Digital Piano" });
    expect(selectMidiConnection(live({ status: "idle", devices: [piano] }), lost).kind).toBe("lost");
  });

  it("missing: never connected in this run, a saved input exists, and it is not in the list", () => {
    const preferences = { alwaysOnTop: true, showHistory: true, preferredInput: saved };
    expect(selectMidiConnection(live({ devices: [synth], preferences }), on)).toMatchObject({ kind: "missing", label: "Digital Piano が見つかりません" });
    expect(selectMidiConnection(live({ devices: [], preferences }), on).kind).toBe("missing");
  });

  it("no-device: no input at all and nothing saved", () => {
    expect(selectMidiConnection(live({ devices: [] }), on)).toMatchObject({ kind: "no-device", label: "MIDI 機器がありません" });
  });

  it("choose: inputs exist but none was saved", () => {
    expect(selectMidiConnection(live({ devices: [piano, synth] }), on)).toMatchObject({ kind: "choose", label: "機器を選んでください" });
  });

  it("R1: a cold start that never connected is never 「外れました」", () => {
    for (const devices of [[], [piano], [synth]]) {
      const kind = selectMidiConnection(live({ status: "disconnected", devices, preferences: { alwaysOnTop: true, showHistory: true, preferredInput: saved } }), on).kind;
      expect(kind).not.toBe("lost");
      expect(["missing", "no-device", "choose", "connecting"]).toContain(kind);
    }
  });

  it("R1: the intent off wins over an error, a connection and a lost input", () => {
    expect(selectMidiConnection(live({ status: "error", error: "x" }), { intent: "off" }).kind).toBe("off");
    expect(selectMidiConnection(live({ status: "connected", selected: piano }), { intent: "off" }).kind).toBe("off");
    expect(selectMidiConnection(live({ status: "disconnected" }), { intent: "off", lastConnected: saved }).kind).toBe("off");
  });

  it("connected is only true for the connected kind; busy only while connecting or searching", () => {
    const kinds = [
      selectMidiConnection(live(), { intent: "off" }),
      selectMidiConnection(live({ status: "connected", selected: piano }), on),
      selectMidiConnection(live({ status: "connecting", selected: piano }), on),
      selectMidiConnection(live({ status: "error" }), on),
      selectMidiConnection(live({ initializing: true }), on),
    ];
    expect(kinds.map((entry) => [entry.kind, entry.connected, entry.busy])).toEqual([
      ["off", false, false], ["connected", true, false], ["connecting", false, true], ["error", false, false], ["searching", false, true],
    ]);
  });
});
