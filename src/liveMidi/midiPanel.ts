import { createStore } from "zustand/vanilla";

/**
 * P14 §4: the one MIDI connection panel. It always hangs under the header button; whoever opens it
 * (the header, a mode's 「MIDI 設定」) passes the button so focus goes back to it when the panel closes (R6).
 */
export interface MidiPanelState {
  open: boolean;
  opener?: HTMLElement;
}

export const midiPanelStore = createStore<MidiPanelState>(() => ({ open: false }));

export function openMidiPanel(opener?: HTMLElement): void {
  midiPanelStore.setState({ open: true, opener });
}

export function closeMidiPanel(): void {
  midiPanelStore.setState({ open: false, opener: undefined });
}
