import { resolvePreferredInput } from "./deviceSelection";
import type { LiveMidiStoreState } from "./liveMidiStore";

/**
 * P14 §3: the one place that decides whether MIDI is connected and what to say about it.
 * The header button, its panel, Chord Dojo, Master, Voicing Loop, Settings and Live MIDI all
 * read this and nothing else (no screen decides "connected" on its own).
 */

export type MidiConnectionKind =
  | "off"
  | "connected"
  | "connecting"
  | "error"
  | "searching"
  | "lost"
  | "missing"
  | "no-device"
  | "choose";

/** What the controller knows that the store does not (spec 2 and 3). */
export interface MidiConnectionControllerView {
  /** 「つなぐ」の意図。切断すると off（今の起動の間だけ）。 */
  intent: "on" | "off";
  /** The input connected at some point in this run; empty until then and after a manual disconnect. */
  lastConnected?: { backendId: string; name: string };
}

export type MidiConnectionLiveState = Pick<
  LiveMidiStoreState,
  "active" | "initializing" | "devices" | "selected" | "status" | "error" | "preferences"
>;

export interface MidiConnectionView {
  kind: MidiConnectionKind;
  /** The text on the header button (3章の表). */
  label: string;
  deviceName?: string;
  error?: string;
  connected: boolean;
  busy: boolean;
}

/** Spec 3: the first row that matches wins; intent off is judged before everything else (R1). */
export function selectMidiConnection(live: MidiConnectionLiveState, controller: MidiConnectionControllerView): MidiConnectionView {
  const view = (kind: MidiConnectionKind, label: string, extra: Partial<Pick<MidiConnectionView, "deviceName" | "error">> = {}): MidiConnectionView => ({
    kind,
    label,
    ...extra,
    connected: kind === "connected",
    busy: kind === "connecting" || kind === "searching",
  });
  if (controller.intent === "off") return view("off", "MIDI に接続");
  if (live.status === "connected" && live.selected) return view("connected", live.selected.name, { deviceName: live.selected.name });
  const preferred = live.preferences.preferredInput;
  if (live.status === "connecting") {
    const name = live.selected?.name ?? preferred?.name;
    return view("connecting", name ? `${name} に接続しています` : "MIDI に接続しています", name ? { deviceName: name } : {});
  }
  if (live.status === "error") return view("error", "MIDI エラー", live.error ? { error: live.error } : {});
  if (live.initializing || !live.active) return view("searching", "MIDI を探しています");
  // Not connected, and it was connected in this run: it dropped. A cold start never gets here (no lastConnected).
  if (controller.lastConnected) return view("lost", `${controller.lastConnected.name} が外れました`, { deviceName: controller.lastConnected.name });
  const found = resolvePreferredInput(live.devices, preferred);
  if (preferred && !found) return view("missing", `${preferred.name} が見つかりません`, { deviceName: preferred.name });
  if (live.devices.length === 0) return view("no-device", "MIDI 機器がありません");
  if (!found) return view("choose", "機器を選んでください");
  // The saved input is there and not connected yet: the controller is about to connect to it.
  return view("connecting", `${found.name} に接続しています`, { deviceName: found.name });
}

/** The panel's heading for each kind (3章の表). */
export const MIDI_PANEL_HEADING: Readonly<Record<MidiConnectionKind, string>> = {
  off: "つないでいません",
  connected: "つながっています",
  connecting: "接続しています",
  error: "つなげませんでした",
  searching: "機器を探しています",
  lost: "機器が外れました",
  missing: "前回の機器が見つかりません",
  "no-device": "MIDI 機器がありません",
  choose: "使う機器を選んでください",
};
