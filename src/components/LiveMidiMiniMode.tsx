import { ArrowLeft, History, Piano, RefreshCw } from "lucide-react";
import { useStore } from "zustand";
import { noteNameFromPitchClass } from "../domain/chords";
import type { AppCopy } from "../i18n";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import type { LiveMidiConnectionStatus } from "../liveMidi/types";

export function LiveMidiMiniMode({ copy, onBack }: {
  copy: AppCopy["liveMidi"];
  onBack: () => void;
}) {
  const devices = useStore(defaultLiveMidiStore, (state) => state.devices);
  const selected = useStore(defaultLiveMidiStore, (state) => state.selected);
  const status = useStore(defaultLiveMidiStore, (state) => state.status);
  const error = useStore(defaultLiveMidiStore, (state) => state.error);
  const current = useStore(defaultLiveMidiStore, (state) => state.current);
  const history = useStore(defaultLiveMidiStore, (state) => state.history);
  const showHistory = useStore(defaultLiveMidiStore, (state) => state.preferences.showHistory ?? true);
  const selectDevice = useStore(defaultLiveMidiStore, (state) => state.selectDevice);
  const refreshDevices = useStore(defaultLiveMidiStore, (state) => state.refreshDevices);
  const setShowHistory = useStore(defaultLiveMidiStore, (state) => state.setShowHistory);

  return (
    <main className="flex h-screen min-h-40 min-w-[280px] flex-col overflow-hidden bg-[var(--lv-bg)] p-3 text-[var(--lv-text)]">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--lv-border)] pb-2">
        <button className="lv-button-ghost inline-flex h-8 items-center gap-1.5 px-2 text-xs" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={16} />
          {copy.back}
        </button>
        <label className="ml-auto min-w-0 flex-1">
          <span className="sr-only">{copy.chooseDevice}</span>
          <select
            className="h-8 w-full min-w-0 rounded border border-[var(--lv-border-strong)] bg-[var(--lv-surface)] px-2 text-xs text-[var(--lv-text)]"
            value={selected?.backendId ?? ""}
            onChange={(event) => { void selectDevice(event.target.value); }}
          >
            <option value="">{devices.length === 0 ? copy.noDevices : copy.chooseDevice}</option>
            {devices.map((device) => <option key={device.backendId} value={device.backendId}>{device.name}</option>)}
          </select>
        </label>
        <button className="lv-button-ghost grid h-8 w-8 place-items-center" onClick={() => { void refreshDevices(); }} aria-label={copy.refreshDevices} title={copy.refreshDevices}>
          <RefreshCw aria-hidden="true" size={16} />
        </button>
        <button className="lv-button-ghost grid h-8 w-8 place-items-center" onClick={() => setShowHistory(!showHistory)} aria-label={copy.history} title={copy.history} aria-pressed={showHistory}>
          <History aria-hidden="true" size={16} />
        </button>
      </header>

      <section className="flex min-h-0 flex-1 flex-col items-center justify-center py-2 text-center">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-[var(--lv-text-muted)]" data-status={status}>
          <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
          {statusLabel(status, copy)}
        </div>
        <div className="flex items-center gap-2" aria-live="polite" aria-atomic="true">
          <Piano aria-hidden="true" className="shrink-0 text-[var(--lv-accent)]" size={20} />
          <strong className="max-w-[calc(100vw-4rem)] overflow-hidden text-ellipsis whitespace-nowrap text-4xl font-semibold leading-none sm:text-[2.65rem]">
            {current.label}
          </strong>
        </div>
        <p className="mt-2 max-w-full truncate text-xs text-[var(--lv-text-secondary)]">
          {copy.notes}: {current.noteNames.length > 0 ? current.noteNames.join(" · ") : "—"}
          <span className="mx-2 text-[var(--lv-border-strong)]">|</span>
          {copy.bass}: {current.bass === undefined ? "—" : noteNameFromPitchClass(current.bass)}
        </p>
        {error ? <p role="alert" className="mt-1 line-clamp-2 text-xs text-red-300">{copy.openFailed}</p> : null}
      </section>

      {showHistory ? (
        <section className="h-10 shrink-0 border-t border-[var(--lv-border)] pt-2" aria-label={copy.history}>
          <div className="flex min-w-0 items-center gap-2 overflow-hidden text-xs">
            <span className="shrink-0 text-[var(--lv-text-muted)]">{copy.history}</span>
            {history.length > 0 ? history.slice(-5).map((entry) => (
              <span key={entry.id} className="shrink-0 font-semibold text-[var(--lv-text-secondary)]">{entry.label}</span>
            )) : <span className="truncate text-[var(--lv-text-muted)]">{copy.noHistory}</span>}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function statusLabel(status: LiveMidiConnectionStatus, copy: AppCopy["liveMidi"]): string {
  return copy[status];
}
