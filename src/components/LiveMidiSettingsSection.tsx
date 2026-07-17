import { Plug, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { AppCopy } from "../i18n";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import { resolvePreferredInput } from "../liveMidi/deviceSelection";
import type { LiveMidiStoreState } from "../liveMidi/liveMidiStore";

const inputClass = "w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm text-[var(--lv-text)] outline-none focus:border-teal-400";

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
    <section aria-labelledby="settings-live-midi-title" className="mt-5 border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4">
      <h3 id="settings-live-midi-title" className="text-sm font-semibold text-[var(--lv-accent)]">{copy.liveMidiTitle}</h3>
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
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 text-sm"
          onClick={() => {
            setTestResult(undefined);
            void refreshDevices();
          }}
        >
          <RefreshCw aria-hidden="true" size={16} />
          {copy.liveMidiRefresh}
        </button>
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center gap-2 rounded bg-[var(--lv-accent)] px-3 text-sm font-semibold text-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!selectedBackendId || testing}
          onClick={() => void runConnectionTest()}
        >
          <Plug aria-hidden="true" size={16} />
          {testing ? copy.liveMidiTesting : copy.liveMidiTest}
        </button>
      </div>
      {preferences.preferredInput && !selected ? (
        <p role="status" className="mt-3 text-sm text-amber-200">{copy.liveMidiMissing(preferences.preferredInput.name)}</p>
      ) : null}
      {testResult ? (
        <p role="status" className={`mt-3 text-sm ${testResult.ok ? "text-teal-200" : "text-red-200"}`}>
          {testResult.ok ? copy.liveMidiTestSucceeded : `${copy.liveMidiTestFailed}${testResult.error ? ` ${testResult.error}` : ""}`}
        </p>
      ) : null}
    </section>
  );
}
