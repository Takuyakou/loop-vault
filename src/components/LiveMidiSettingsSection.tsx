import { Plug, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { AppCopy } from "../i18n";
import { noteNameFromPitchClass } from "../domain/chords";
import { connectionController } from "../liveMidi/connectionController";
import { MIDI_PANEL_HEADING, selectMidiConnection, type MidiConnectionView } from "../liveMidi/connectionView";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import { resolvePreferredInput } from "../liveMidi/deviceSelection";
import { useMidiConnection } from "../liveMidi/useMidiConnection";
import type { LiveMidiStoreState } from "../liveMidi/liveMidiStore";
import { LiveMidiKeyStrip } from "./LiveMidiKeyStrip";
import { SettingsRow } from "./SettingsRow";
import { Button, Select, StatusMessage, Switch } from "./ui";

/** The note with its octave, as the small window writes it (「E♭2」). */
const noteLabel = (pitch: number) => `${noteNameFromPitchClass(pitch)}${Math.floor(pitch / 12) - 1}`;

/**
 * P23-26 S1/S5: the whole 「MIDI 入力」 section. The old 「音と MIDI」 and 「Live MIDI」 sections are one:
 * the state of the input on top (device, 88 keys, last note, 探し直す), then one row per setting.
 */
export function LiveMidiSettingsSection({
  copy,
  store = defaultLiveMidiStore,
  children,
}: {
  copy: AppCopy["settingsUi"];
  store?: StoreApi<LiveMidiStoreState>;
  /** Rows that belong to this section but live elsewhere (the Bass Practice recording channel). */
  children?: React.ReactNode;
}) {
  const devices = useStore(store, (state) => state.devices);
  const preferences = useStore(store, (state) => state.preferences);
  const refreshDevices = useStore(store, (state) => state.refreshDevices);
  const storeSetPreferredDevice = useStore(store, (state) => state.setPreferredDevice);
  const storeTestDevice = useStore(store, (state) => state.testDevice);
  const status = useStore(store, (state) => state.status);
  const selectedDevice = useStore(store, (state) => state.selected);
  const storeError = useStore(store, (state) => state.error);
  const instant = useStore(store, (state) => state.instant);
  const setAlwaysOnTop = useStore(store, (state) => state.setAlwaysOnTop);
  // P14 §2: on the app's own store the one connection controller makes the choice and runs the test.
  const shared = store === defaultLiveMidiStore;
  const sharedView = useMidiConnection();
  const autoConnect = useStore(connectionController.state, (state) => state.autoConnect);
  // A store of its own (the tests) has no controller behind it; the same function words its state.
  const localView: MidiConnectionView = useMemo(
    () => selectMidiConnection(
      { active: true, initializing: false, devices, selected: selectedDevice, status, error: storeError, preferences },
      { intent: "on" },
    ),
    [devices, selectedDevice, status, storeError, preferences],
  );
  const view = shared ? sharedView : localView;
  // The test button is for a connection that is not working; while connected it would only interrupt it.
  const showTest = !shared || view.kind === "off" || view.kind === "error" || view.kind === "choose";
  const setPreferredDevice = shared ? (backendId: string) => { void connectionController.chooseDevice(backendId); } : storeSetPreferredDevice;
  const testDevice = shared ? connectionController.testDevice : storeTestDevice;
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string }>();
  // S5 「最後に届いた音」: the newest note that arrived (the last one added to the held notes).
  const [lastNote, setLastNote] = useState<number>();
  useEffect(() => {
    if (instant.notes.length > 0) setLastNote(instant.notes[instant.notes.length - 1]);
  }, [instant.notes]);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  const selected = useMemo(
    () => resolvePreferredInput(devices, preferences.preferredInput),
    [devices, preferences.preferredInput],
  );
  const selectedBackendId = selected?.backendId ?? "";
  const noDevice = view.kind === "no-device" || view.kind === "missing" || view.kind === "choose";

  async function runConnectionTest() {
    if (!selectedBackendId || testing) return;
    setTesting(true);
    try {
      setTestResult(await testDevice(selectedBackendId));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div id="settings-live-midi">
      <div className="lv-settings-midi" data-state={view.kind === "error" ? "error" : noDevice ? "none" : "ok"}>
        <div className="lv-settings-midi-line">
          <span className="lv-midi-dot lv-settings-midi-dot" data-midi-kind={view.kind} aria-hidden="true" />
          <div className="lv-settings-midi-name">
            <b>
              {view.kind === "error"
                ? "MIDI 機器につなげませんでした"
                : noDevice
                  ? "MIDI 機器がつながっていません"
                  : view.deviceName ?? view.label}
            </b>
            <span aria-live="polite" data-testid="settings-midi-status" data-midi-kind={view.kind}>
              {view.kind === "error"
                ? `${MIDI_PANEL_HEADING.error}${view.error ? `：${view.error}` : ""}`
                : noDevice
                  ? "鍵盤をつなぐと、自動で見つけます。"
                  : MIDI_PANEL_HEADING[view.kind]}
            </span>
          </div>
          <Button type="button" variant="neutral" size="sm" onClick={() => { setTestResult(undefined); void refreshDevices(); }}>
            <RefreshCw aria-hidden="true" size={16} />
            探し直す
          </Button>
        </div>
        <LiveMidiKeyStrip pressed={instant.notes} className="lv-live-mini-keys lv-settings-keys" testId="settings-midi-keys" />
        <p className="lv-settings-midi-last" data-testid="settings-midi-last-note">
          {noDevice
            ? "つながると、弾いた鍵がここで光ります。"
            : lastNote === undefined
              ? "鍵盤を弾くと、届いた音がここで光ります。"
              : <>最後に届いた音 <b>{noteLabel(lastNote)}</b></>}
        </p>
      </div>

      <div className="lv-settings-rows">
        <SettingsRow
          title={copy.liveMidiDevice}
          description="ここで選んだ機器に、次からも自動でつなぎます。"
          control={(
            <Select
              id="settings-live-midi-device"
              aria-label={copy.liveMidiDevice}
              wrapperClassName="w-full"
              className="w-full"
              value={selectedBackendId}
              onChange={(event) => {
                setPreferredDevice(event.target.value);
                setTestResult(undefined);
              }}
            >
              <option value="">{devices.length === 0 ? copy.liveMidiNoDevices : copy.liveMidiChooseDevice}</option>
              {devices.map((device) => <option key={device.backendId} value={device.backendId}>{device.name}</option>)}
            </Select>
          )}
        />
        {shared ? (
          <SettingsRow
            title="起動した時に自動でつなぐ"
            description="切ると、上の帯の MIDI の札から自分でつなぎます。"
            control={<Switch label="起動した時に自動でつなぐ" checked={autoConnect} onChange={(next) => connectionController.setAutoConnect(next)} />}
          />
        ) : null}
        {showTest ? (
          <SettingsRow
            title={copy.liveMidiTest}
            description="うまく弾けないときに、機器を開けるかだけ確かめます。"
            control={(
              <div className="lv-settings-row-inline">
                {testResult ? (
                  <span className="lv-settings-test-result" data-tone={testResult.ok ? "ok" : "error"} data-testid="settings-midi-test-result">
                    {testResult.ok ? `✓ ${copy.liveMidiTestSucceeded}` : `× ${copy.liveMidiTestFailed}`}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="neutral"
                  disabled={!selectedBackendId || testing}
                  aria-busy={testing}
                  onClick={() => void runConnectionTest()}
                >
                  <Plug aria-hidden="true" size={16} />
                  {testing ? copy.liveMidiTesting : copy.liveMidiTest}
                </Button>
              </div>
            )}
          />
        ) : null}
        {/* S7: the new setting (the record is already there; the small window reads it when it opens). */}
        <SettingsRow
          title="Live MIDI の小さい窓を、常に手前に出す"
          badge="足す"
          description="ほかのアプリを使っている間も、窓が隠れません。次に小さい窓を開いたときから効きます。"
          control={(
            <Switch
              label="Live MIDI の小さい窓を、常に手前に出す"
              data-testid="settings-live-midi-always-on-top"
              checked={preferences.alwaysOnTop ?? true}
              onChange={(next) => setAlwaysOnTop(next)}
            />
          )}
        />
        {children}
      </div>

      {preferences.preferredInput && !selected ? (
        <StatusMessage className="mt-3" tone="warning" title={copy.liveMidiMissing(preferences.preferredInput.name)} />
      ) : null}
      {testResult && !testResult.ok && testResult.error ? (
        <StatusMessage className="mt-3" tone="error" title={testResult.error} />
      ) : null}
    </div>
  );
}
