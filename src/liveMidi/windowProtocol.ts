import { emitTo } from "@tauri-apps/api/event";
import type { AppLanguage } from "../domain/types";
import type {
  LiveChordDetection,
  LiveChordHistoryEntry,
} from "../domain/liveMidi";
import type { LiveMidiStoreState } from "./liveMidiStore";
import type { LiveMidiConnectionStatus, LiveMidiDevice } from "./types";
import { LIVE_MIDI_WINDOW_LABEL } from "./miniWindowController";

export const LIVE_MIDI_COMMAND_EVENT = "loop-vault://live-midi-command";
export const LIVE_MIDI_SNAPSHOT_EVENT = "loop-vault://live-midi-snapshot";

export type LiveMidiWindowCommand =
  | { type: "ready" }
  | { type: "show-main" }
  | { type: "close" }
  | { type: "refresh-devices" }
  | { type: "select-device"; backendId: string }
  | { type: "set-show-history"; show: boolean };

export interface LiveMidiWindowSnapshot {
  language: AppLanguage;
  devices: LiveMidiDevice[];
  selected?: LiveMidiDevice;
  status: LiveMidiConnectionStatus;
  error?: string;
  instant: LiveChordDetection;
  provisionalChord?: LiveChordDetection;
  confirmedChord: LiveChordDetection;
  history: LiveChordHistoryEntry[];
  showHistory: boolean;
}

export function createLiveMidiWindowSnapshot(
  state: LiveMidiStoreState,
  language: AppLanguage,
): LiveMidiWindowSnapshot {
  return {
    language,
    devices: state.devices,
    selected: state.selected,
    status: state.status,
    error: state.error,
    instant: state.instant,
    provisionalChord: state.provisionalChord,
    confirmedChord: state.confirmedChord,
    history: state.history,
    showHistory: state.preferences.showHistory ?? true,
  };
}

export function sendLiveMidiCommand(command: LiveMidiWindowCommand): Promise<void> {
  return emitTo("main", LIVE_MIDI_COMMAND_EVENT, command);
}

export function sendLiveMidiSnapshot(snapshot: LiveMidiWindowSnapshot): Promise<void> {
  return emitTo(LIVE_MIDI_WINDOW_LABEL, LIVE_MIDI_SNAPSHOT_EVENT, snapshot);
}
