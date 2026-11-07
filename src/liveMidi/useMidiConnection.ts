import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { connectionController } from "./connectionController";
import { selectMidiConnection, type MidiConnectionView } from "./connectionView";
import { defaultLiveMidiStore } from "./defaultLiveMidiStore";

/** P14 §3: every screen reads the connection through this one hook (header, panel, Dojo, Master, Voicing Loop, Settings). */
export function useMidiConnection(): MidiConnectionView {
  const live = useStore(
    defaultLiveMidiStore,
    useShallow((state) => ({
      active: state.active,
      initializing: state.initializing,
      devices: state.devices,
      selected: state.selected,
      status: state.status,
      error: state.error,
      preferences: state.preferences,
    })),
  );
  const controller = useStore(
    connectionController.state,
    useShallow((state) => ({ intent: state.intent, lastConnected: state.lastConnected })),
  );
  return selectMidiConnection(live, controller);
}
