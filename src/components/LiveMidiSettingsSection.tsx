import { Plug, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { AppCopy } from "../i18n";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import { resolvePreferredInput } from "../liveMidi/deviceSelection";
import type { LiveMidiStoreState } from "../liveMidi/liveMidiStore";
import { Button, StatusMessage } from "./ui";

const inputClass = "lv-input w-full px-3 text-sm";

export function LiveMidiSettingsSection({
  copy,
  store = defaultLiveMidiStore,
}: {
  copy: AppCopy["settingsUi"];
  store?: StoreApi<LiveMidiStoreState>;
}) {
  const devices = useStore(store, (state) => state.devices);
  const preferences = useStore(store, (state) => state.preferences);
  const refreshDevices = useStore(store, (state) => state.refreshDevices);
  const setPreferredDevice = useStore(store, (state) => state.setPreferredDevice);
  const testDevice = useStore(store, (state) => state.testDevice);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string }>();

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  const selected = useMemo(
    () => resolvePreferredInput(devices, preferences.preferredInput),
    [devices, preferences.preferredInput],
  );
  const selectedBackendId = selected?.backendId ?? "";

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
    <section id="settings-live-midi" aria-labelledby="settings-live-midi-title" className="lv-settings-card">
      <h2 id="settings-live-midi-title" className="lv-settings-card-title">{copy.liveMidiTitle}</h2>
      <p className="mt-2 text-sm text-[var(--lv-text-muted)]">{copy.liveMidiHelp}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
        <label>
          <span className="font-semibold">{copy.liveMidiDevice}</span>
          <select
            id="settings-live-midi-device"
            className={`${inputClass} mt-2`}
            value={selectedBackendId}
            onChange={(event) => {
              setPreferredDevice(event.target.value);
              setTestResult(undefined);
            }}
          >
            <option value="">{devices.length === 0 ? copy.liveMidiNoDevices : copy.liveMidiChooseDevice}</option>
            {devices.map((device) => <option key={device.backendId} value={device.backendId}>{device.name}</option>)}
          </select>
        </label>
        <Button
          type="button"
          variant="neutral"
          onClick={() => {
            setTestResult(undefined);
            void refreshDevices();
          }}
        >
          <RefreshCw aria-hidden="true" size={16} />
          {copy.liveMidiRefresh}
        </Button>
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
      {preferences.preferredInput && !selected ? (
        <StatusMessage className="mt-3" tone="warning" title={copy.liveMidiMissing(preferences.preferredInput.name)} />
      ) : null}
      {testResult ? (
        <StatusMessage
          className="mt-3"
          tone={testResult.ok ? "success" : "error"}
          title={testResult.ok ? copy.liveMidiTestSucceeded : copy.liveMidiTestFailed}
        >
          {!testResult.ok && testResult.error ? testResult.error : undefined}
        </StatusMessage>
      ) : null}
    </section>
  );
}
