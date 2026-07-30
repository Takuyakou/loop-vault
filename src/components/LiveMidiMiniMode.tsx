import { ArrowLeft, History, Piano, RefreshCw } from "lucide-react";
import { useStore } from "zustand";
import { noteNameFromPitchClass } from "../domain/chords";
import type { AppCopy } from "../i18n";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import type { LiveMidiConnectionStatus } from "../liveMidi/types";
import { Button, IconButton, StatusMessage } from "./ui";

export function LiveMidiMiniMode({ copy, onBack }: {
  copy: AppCopy["liveMidi"];
  onBack: () => void;
}) {
  const devices = useStore(defaultLiveMidiStore, (state) => state.devices);
  const selected = useStore(defaultLiveMidiStore, (state) => state.selected);
  const status = useStore(defaultLiveMidiStore, (state) => state.status);
  const error = useStore(defaultLiveMidiStore, (state) => state.error);
  const instant = useStore(defaultLiveMidiStore, (state) => state.instant);
  const provisionalChord = useStore(defaultLiveMidiStore, (state) => state.provisionalChord);
  const confirmedChord = useStore(defaultLiveMidiStore, (state) => state.confirmedChord);
  const history = useStore(defaultLiveMidiStore, (state) => state.history);
  const showHistory = useStore(defaultLiveMidiStore, (state) => state.preferences.showHistory ?? true);
  const selectDevice = useStore(defaultLiveMidiStore, (state) => state.selectDevice);
  const refreshDevices = useStore(defaultLiveMidiStore, (state) => state.refreshDevices);
  const setShowHistory = useStore(defaultLiveMidiStore, (state) => state.setShowHistory);
  const displayedChord = provisionalChord ?? confirmedChord;

  return (
    <main className="flex h-screen min-h-40 min-w-[280px] flex-col overflow-hidden bg-[var(--lv-bg)] p-3 text-[var(--lv-text)]">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--lv-border)] pb-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={16} />
          {copy.back}
        </Button>
        <label className="ml-auto min-w-0 flex-1">
          <span className="sr-only">{copy.chooseDevice}</span>
          <select
            className="lv-input h-10 w-full min-w-0 px-2 text-xs"
            value={selected?.backendId ?? ""}
            onChange={(event) => { void selectDevice(event.target.value); }}
          >
            <option value="">{devices.length === 0 ? copy.noDevices : copy.chooseDevice}</option>
            {devices.map((device) => <option key={device.backendId} value={device.backendId}>{device.name}</option>)}
          </select>
        </label>
        <IconButton variant="ghost" onClick={() => { void refreshDevices(); }} label={copy.refreshDevices}>
          <RefreshCw aria-hidden="true" size={16} />
        </IconButton>
        <IconButton variant="ghost" onClick={() => setShowHistory(!showHistory)} label={copy.history} aria-pressed={showHistory}>
          <History aria-hidden="true" size={16} />
        </IconButton>
      </header>

      <section className="flex min-h-0 flex-1 flex-col items-center justify-center py-2 text-center">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-[var(--lv-text-muted)]" data-status={status} role="status" aria-live="polite">
          <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
          {statusLabel(status, copy)}
        </div>
        <div className="flex items-center gap-2" aria-live="polite" aria-atomic="true">
          <Piano aria-hidden="true" className="shrink-0 text-[var(--lv-accent)]" size={20} />
          <strong className="max-w-[calc(100vw-4rem)] overflow-hidden text-ellipsis whitespace-nowrap text-4xl font-semibold leading-none sm:text-[2.65rem]">
            {displayedChord.label}
          </strong>
        </div>
        <p className="mt-2 max-w-full truncate text-xs text-[var(--lv-text-secondary)]">
          {copy.notes}: {instant.noteNames.length > 0 ? instant.noteNames.join(" · ") : "—"}
          <span className="mx-2 text-[var(--lv-border-strong)]">|</span>
          {copy.bass}: {instant.bass === undefined ? "—" : noteNameFromPitchClass(instant.bass)}
        </p>
        {error ? (
          <StatusMessage
            tone="error"
            title={copy.openFailed}
            className="mt-2 max-w-full p-2 text-left text-xs"
            action={(
              <Button size="sm" onClick={() => { void refreshDevices(); }}>
                <RefreshCw aria-hidden="true" size={16} />
                {copy.refreshDevices}
              </Button>
            )}
          >
            <p className="truncate" title={error}>{error}</p>
          </StatusMessage>
        ) : null}
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
