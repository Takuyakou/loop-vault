import { ArrowLeft, History, Piano, RefreshCw } from "lucide-react";
import { useStore } from "zustand";
import { noteNameFromPitchClass } from "../domain/chords";
import type { AppCopy } from "../i18n";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import type { LiveMidiConnectionStatus } from "../liveMidi/types";
import type { LiveMidiWindowSnapshot } from "../liveMidi/windowProtocol";
import { Button, IconButton, StatusMessage } from "./ui";

export function LiveMidiMiniMode({
  copy,
  snapshot,
  onShowMain,
  onBack,
  onRefreshDevices,
  onSelectDevice,
  onSetShowHistory,
}: {
  copy: AppCopy["liveMidi"];
  snapshot?: LiveMidiWindowSnapshot;
  onShowMain?: () => void;
  onBack?: () => void;
  onRefreshDevices?: () => void;
  onSelectDevice?: (backendId: string) => void;
  onSetShowHistory?: (show: boolean) => void;
}) {
  const localDevices = useStore(defaultLiveMidiStore, (state) => state.devices);
  const localSelected = useStore(defaultLiveMidiStore, (state) => state.selected);
  const localStatus = useStore(defaultLiveMidiStore, (state) => state.status);
  const localError = useStore(defaultLiveMidiStore, (state) => state.error);
  const localInstant = useStore(defaultLiveMidiStore, (state) => state.instant);
  const localProvisionalChord = useStore(defaultLiveMidiStore, (state) => state.provisionalChord);
  const localConfirmedChord = useStore(defaultLiveMidiStore, (state) => state.confirmedChord);
  const localHistory = useStore(defaultLiveMidiStore, (state) => state.history);
  const localShowHistory = useStore(defaultLiveMidiStore, (state) => state.preferences.showHistory ?? true);
  const localSelectDevice = useStore(defaultLiveMidiStore, (state) => state.selectDevice);
  const localRefreshDevices = useStore(defaultLiveMidiStore, (state) => state.refreshDevices);
  const localSetShowHistory = useStore(defaultLiveMidiStore, (state) => state.setShowHistory);
  const devices = snapshot?.devices ?? localDevices;
  const selected = snapshot?.selected ?? localSelected;
  const status = snapshot?.status ?? localStatus;
  const error = snapshot?.error ?? localError;
  const instant = snapshot?.instant ?? localInstant;
  const provisionalChord = snapshot?.provisionalChord ?? localProvisionalChord;
  const confirmedChord = snapshot?.confirmedChord ?? localConfirmedChord;
  const history = snapshot?.history ?? localHistory;
  const showHistory = snapshot?.showHistory ?? localShowHistory;
  const displayedChord = provisionalChord ?? confirmedChord;
  const detectionState = provisionalChord
    ? copy.provisional
    : confirmedChord.label === "—"
      ? copy.waitingForChord
      : copy.confirmed;

  return (
    <main className="lv-live-mini flex h-screen min-h-40 min-w-[280px] flex-col overflow-hidden p-3">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--lv-border)] pb-2">
        <Button variant="ghost" size="sm" onClick={onShowMain ?? onBack}>
          <ArrowLeft aria-hidden="true" size={16} />
          {copy.showMain}
        </Button>
        <label className="ml-auto min-w-0 flex-1">
          <span className="sr-only">{copy.chooseDevice}</span>
          <select
            className="lv-input h-8 w-full min-w-0 px-2 text-xs"
            value={selected?.backendId ?? ""}
            onChange={(event) => {
              if (onSelectDevice) onSelectDevice(event.target.value);
              else void localSelectDevice(event.target.value);
            }}
          >
            <option value="">{devices.length === 0 ? copy.noDevices : copy.chooseDevice}</option>
            {devices.map((device) => <option key={device.backendId} value={device.backendId}>{device.name}</option>)}
          </select>
        </label>
        <IconButton
          variant="ghost"
          onClick={() => {
            if (onRefreshDevices) onRefreshDevices();
            else void localRefreshDevices();
          }}
          label={copy.refreshDevices}
        >
          <RefreshCw aria-hidden="true" size={16} />
        </IconButton>
        <IconButton
          variant="ghost"
          onClick={() => {
            if (onSetShowHistory) onSetShowHistory(!showHistory);
            else localSetShowHistory(!showHistory);
          }}
          label={copy.history}
          aria-pressed={showHistory}
        >
          <History aria-hidden="true" size={16} />
        </IconButton>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--lv-border)] py-2">
        <div className="lv-live-mini-status flex items-center gap-1.5 text-xs text-[var(--lv-text-secondary)]" data-status={status} role="status" aria-live="polite">
          <span className="lv-live-mini-dot" aria-hidden="true" />
          {statusLabel(status, copy)}
        </div>
        {selected ? <span className="min-w-0 truncate text-xs text-[var(--lv-text-secondary)]">{selected.name}</span> : null}
      </div>

      <section className="lv-live-mini-chord my-2 flex min-h-0 flex-1 flex-col items-center justify-center p-3 text-center" data-live-midi-current-chord>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-[var(--lv-text-secondary)]">{copy.currentChord}</span>
          <span className="lv-live-mini-badge" data-detection-state={detectionState}>
            {detectionState}
          </span>
        </div>
        <div className="flex items-center gap-2" aria-live="polite" aria-atomic="true">
          <Piano aria-hidden="true" className="shrink-0 text-[var(--lv-accent)]" size={20} />
          <strong className="lv-live-mini-label max-w-[calc(100vw-4rem)] overflow-hidden text-ellipsis whitespace-nowrap text-4xl font-semibold leading-none sm:text-[2.65rem]">
            {displayedChord.label}
          </strong>
        </div>
        <p className="mt-2 max-w-full truncate text-xs text-[var(--lv-text-secondary)]">
          {copy.notes}: {instant.noteNames.length > 0 ? instant.noteNames.join(" · ") : "—"}
          <span className="mx-2 text-[var(--lv-text-muted)]">·</span>
          {copy.bass}: {instant.bass === undefined ? "—" : noteNameFromPitchClass(instant.bass)}
        </p>
        {error ? (
          <StatusMessage
            tone="error"
            title={copy.openFailed}
            className="mt-2 max-w-full p-2 text-left text-xs"
            action={(
              <Button
                variant="neutral"
                size="sm"
                onClick={() => {
                  if (onRefreshDevices) onRefreshDevices();
                  else void localRefreshDevices();
                }}
              >
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
        <section className="shrink-0 border-t border-[var(--lv-border)] pt-2" aria-label={copy.history}>
          <p className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[var(--lv-text-secondary)]">{copy.history}</p>
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs">
            {history.length > 0 ? history.slice(-5).map((entry) => (
              <span key={entry.id} className="lv-live-mini-history-chip">{entry.label}</span>
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
