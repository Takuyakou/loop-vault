import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { appCopy } from "../i18n";
import {
  LIVE_MIDI_SNAPSHOT_EVENT,
  sendLiveMidiCommand,
  type LiveMidiWindowSnapshot,
} from "../liveMidi/windowProtocol";
import { LiveMidiMiniMode } from "./LiveMidiMiniMode";

export function LiveMidiWindowRoot() {
  const [snapshot, setSnapshot] = useState<LiveMidiWindowSnapshot>();

  useEffect(() => {
    let disposed = false;
    let unlistenSnapshot: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;

    void listen<LiveMidiWindowSnapshot>(LIVE_MIDI_SNAPSHOT_EVENT, (event) => {
      if (!disposed) setSnapshot(event.payload);
    }).then((unlisten) => {
      unlistenSnapshot = unlisten;
      return getCurrentWindow().onCloseRequested((event) => {
        event.preventDefault();
        void sendLiveMidiCommand({ type: "close" });
      });
    }).then((unlisten) => {
      unlistenClose = unlisten;
      return sendLiveMidiCommand({ type: "ready" });
    });

    return () => {
      disposed = true;
      unlistenSnapshot?.();
      unlistenClose?.();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void sendLiveMidiCommand({ type: "close" });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!snapshot) {
    return (
      <main className="flex h-screen items-center justify-center bg-[var(--lv-bg)] text-sm text-[var(--lv-text-secondary)]" role="status">
        Live MIDIを準備しています…
      </main>
    );
  }

  return (
    <LiveMidiMiniMode
      copy={appCopy[snapshot.language].liveMidi}
      snapshot={snapshot}
      onShowMain={() => { void sendLiveMidiCommand({ type: "show-main" }); }}
      onRefreshDevices={() => { void sendLiveMidiCommand({ type: "refresh-devices" }); }}
      onSelectDevice={(backendId) => { void sendLiveMidiCommand({ type: "select-device", backendId }); }}
      onSetShowHistory={(show) => { void sendLiveMidiCommand({ type: "set-show-history", show }); }}
    />
  );
}
