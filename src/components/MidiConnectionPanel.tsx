import { useEffect, useRef, type RefObject } from "react";
import { useStore } from "zustand";
import { connectionController } from "../liveMidi/connectionController";
import { MIDI_PANEL_HEADING, type MidiConnectionKind } from "../liveMidi/connectionView";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import { resolvePreferredInput } from "../liveMidi/deviceSelection";
import { closeMidiPanel, midiPanelStore, openMidiPanel } from "../liveMidi/midiPanel";
import { useMidiConnection } from "../liveMidi/useMidiConnection";
import { Button, Select } from "./ui";

/** P14 §4: the header button and the panel it opens. Both read their state from `useMidiConnection`. */

const DESCRIPTION: Record<MidiConnectionKind, string> = {
  off: "「接続」を押すと、選んだ機器につなぎます",
  connected: "どの画面に移っても、このまま使えます",
  connecting: "しばらくお待ちください",
  error: "",
  searching: "しばらくお待ちください",
  lost: "USB をつなぎ直すと、自動でもう一度つなぎます",
  missing: "前回の機器をつなぐと、自動で接続します",
  "no-device": "USB でつなぐと、自動で見つけます",
  choose: "下の「使う機器」から選んでください",
};

export function MidiConnectionButton({ openLiveMidi, openSettings }: { openLiveMidi: () => void; openSettings: () => void }) {
  const view = useMidiConnection();
  const open = useStore(midiPanelStore, (state) => state.open);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="lv-midi-anchor">
      <button
        ref={buttonRef}
        type="button"
        className="lv-midi-chip"
        data-midi-kind={view.kind}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`MIDI 入力：${view.label}`}
        title={`MIDI 入力：${view.label}`}
        onClick={() => (open ? closeMidiPanel() : openMidiPanel(buttonRef.current ?? undefined))}
      >
        <span className="lv-midi-dot" aria-hidden="true" />
        <span className="lv-midi-label">{view.label}</span>
      </button>
      {open ? <MidiConnectionPanel anchor={buttonRef} openLiveMidi={openLiveMidi} openSettings={openSettings} /> : null}
    </div>
  );
}

function MidiConnectionPanel({ anchor, openLiveMidi, openSettings }: {
  anchor: RefObject<HTMLButtonElement>;
  openLiveMidi: () => void;
  openSettings: () => void;
}) {
  const view = useMidiConnection();
  const devices = useStore(defaultLiveMidiStore, (state) => state.devices);
  const preferred = useStore(defaultLiveMidiStore, (state) => state.preferences.preferredInput);
  const autoConnect = useStore(connectionController.state, (state) => state.autoConnect);
  const panelRef = useRef<HTMLDivElement>(null);
  // The store forgets the opener as soon as the panel closes, so keep it here for the focus return.
  const openerRef = useRef(midiPanelStore.getState().opener);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const found = resolvePreferredInput(devices, preferred);
  const missingPreferred = Boolean(preferred && !found);
  const kind = view.kind;

  // Focus goes to the main button (or the device list); closing gives it back to whoever opened the panel.
  useEffect(() => {
    (primaryRef.current ?? panelRef.current?.querySelector<HTMLSelectElement>("select"))?.focus();
    void connectionController.refreshDevices();
    const stopTracking = midiPanelStore.subscribe((state) => { if (state.opener) openerRef.current = state.opener; });
    return () => {
      stopTracking();
      const opener = openerRef.current;
      const target = opener && opener.isConnected ? opener : anchor.current;
      target?.focus();
    };
  }, [anchor]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeMidiPanel();
    };
    const onPointer = (event: PointerEvent) => {
      const node = event.target as Node;
      if (panelRef.current?.contains(node) || anchor.current?.contains(node)) return;
      closeMidiPanel();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [anchor]);

  const search = <Button key="search" size="sm" variant="neutral" onClick={() => void connectionController.refreshDevices()}>機器を探し直す</Button>;
  const disconnect = <Button key="disconnect" size="sm" variant="neutral" onClick={() => void connectionController.disconnect()}>切断</Button>;
  const buttons =
    kind === "connected" || kind === "connecting" ? [disconnect, search]
      : kind === "off" ? [<Button key="connect" ref={primaryRef} size="sm" variant="primary" onClick={() => void connectionController.connect()}>接続</Button>, search]
        : kind === "error" ? [<Button key="retry" ref={primaryRef} size="sm" variant="primary" onClick={() => void connectionController.retry()}>もう一度試す</Button>, search]
          : [search, disconnect];

  return (
    <div ref={panelRef} className="lv-midi-panel" role="dialog" aria-label="MIDI 接続" data-testid="midi-panel" data-midi-kind={kind}>
      <div className="lv-midi-panel-status">
        <span className="lv-midi-dot" data-midi-kind={kind} aria-hidden="true" />
        <div>
          <b>{MIDI_PANEL_HEADING[kind]}</b>
          <p>{[view.deviceName, kind === "error" ? undefined : DESCRIPTION[kind]].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      {kind === "error" ? (
        <div className="lv-midi-panel-error" role="alert">
          ほかのアプリがこの機器を使っている可能性があります。{view.error ? `（元の文：${view.error}）` : null}
        </div>
      ) : null}
      {kind === "lost" ? <div className="lv-midi-panel-warn">ほかの機器を使う時は、下で選び直してください。</div> : null}
      <label className="lv-midi-panel-field">
        <span>使う機器</span>
        <Select
          value={found?.backendId ?? (missingPreferred ? "__missing__" : "")}
          onChange={(event) => {
            if (event.target.value && event.target.value !== "__missing__") void connectionController.chooseDevice(event.target.value);
          }}
        >
          {!found && !missingPreferred ? <option value="">{devices.length === 0 ? "機器がありません" : "選んでください"}</option> : null}
          {missingPreferred && preferred ? <option value="__missing__" disabled>{preferred.name}（見つかりません）</option> : null}
          {devices.map((device) => <option key={device.backendId} value={device.backendId}>{device.name}</option>)}
        </Select>
      </label>
      <div className="lv-midi-panel-buttons">{buttons}</div>
      <label className="lv-midi-panel-check">
        <input type="checkbox" checked={autoConnect} onChange={(event) => connectionController.setAutoConnect(event.target.checked)} />
        起動した時に自動でつなぐ
      </label>
      <div className="lv-midi-panel-links">
        <button type="button" onClick={() => { closeMidiPanel(); openSettings(); }}>詳しい設定…</button>
        <button type="button" onClick={() => { closeMidiPanel(); openLiveMidi(); }}>Live MIDI（ミニ表示）を開く</button>
      </div>
    </div>
  );
}
