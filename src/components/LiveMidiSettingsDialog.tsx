import { useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { AppCopy } from "../i18n";
import type { LiveMidiStoreState } from "../liveMidi/liveMidiStore";
import { LiveMidiSettingsSection } from "./LiveMidiSettingsSection";
import { Modal } from "./Modal";
import { Button } from "./ui";

/**
 * P8.9-09: the practice screens' 「設定」 next to MIDI opens only the Live MIDI settings in a dialog,
 * so the practice screen stays mounted and keeps its state. Settings › Live MIDI is unchanged.
 */
export function LiveMidiSettingsDialog({ copy, onClose, store }: {
  copy: AppCopy["settingsUi"];
  onClose: () => void;
  store?: StoreApi<LiveMidiStoreState>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal ariaLabelledBy="live-midi-settings-dialog-title" initialFocusRef={closeRef} onClose={onClose} panelClassName="w-full max-w-2xl p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="live-midi-settings-dialog-title" className="text-lg font-semibold">Live MIDI の設定</h2>
        <Button ref={closeRef} variant="ghost" size="sm" onClick={onClose}>{copy.close}</Button>
      </div>
      <LiveMidiSettingsSection copy={copy} store={store} />
    </Modal>
  );
}
