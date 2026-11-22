import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "zustand";
import { noteNameFromPitchClass } from "../domain/chords";
import type { AppCopy } from "../i18n";
import { connectionController } from "../liveMidi/connectionController";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import { useMidiConnection } from "../liveMidi/useMidiConnection";
import type { LiveMidiWindowSnapshot } from "../liveMidi/windowProtocol";
import { Button, IconButton, Select, StatusMessage } from "./ui";
import { LiveMidiKeyStrip } from "./LiveMidiKeyStrip";

/** How many chords of the trail the bottom row shows (the newest is on the right). */
const TRAIL_LENGTH = 9;

/** P23-18: the small Live MIDI window. One row of controls, the chord, an 88-key strip, the trail. */
export function LiveMidiMiniMode({
  copy,
  snapshot,
  onShowMain,
  onBack,
  onRefreshDevices,
  onSelectDevice,
  onSave,
  onClearHistory,
}: {
  copy: AppCopy["liveMidi"];
  snapshot?: LiveMidiWindowSnapshot;
  onShowMain?: () => void;
  onBack?: () => void;
  onRefreshDevices?: () => void;
  onSelectDevice?: (backendId: string) => void;
  /** Closes the small window; the save dialog opens when chords were played. */
  onSave?: () => void;
  /** Empties the trail. Without it, the store of this window is emptied. */
  onClearHistory?: () => void;
}) {
  const localDevices = useStore(defaultLiveMidiStore, (state) => state.devices);
  const localSelected = useStore(defaultLiveMidiStore, (state) => state.selected);
  const localStatus = useStore(defaultLiveMidiStore, (state) => state.status);
  const localView = useMidiConnection();
  const localError = useStore(defaultLiveMidiStore, (state) => state.error);
  const localInstant = useStore(defaultLiveMidiStore, (state) => state.instant);
  const localProvisionalChord = useStore(defaultLiveMidiStore, (state) => state.provisionalChord);
  const localConfirmedChord = useStore(defaultLiveMidiStore, (state) => state.confirmedChord);
  const localHistory = useStore(defaultLiveMidiStore, (state) => state.history);
  // The web preview talks to the one connection controller as well (P14 §2).
  const localSelectDevice = connectionController.chooseDevice;
  const localRefreshDevices = connectionController.refreshDevices;
  const localClearSession = useStore(defaultLiveMidiStore, (state) => state.clearSession);
  const devices = snapshot?.devices ?? localDevices;
  const selected = snapshot?.selected ?? localSelected;
  const status = snapshot?.status ?? localStatus;
  const connection = { kind: snapshot?.kind ?? localView.kind, label: snapshot?.label ?? localView.label };
  const error = snapshot?.error ?? localError;
  const instant = snapshot?.instant ?? localInstant;
  const provisionalChord = snapshot?.provisionalChord ?? localProvisionalChord;
  const confirmedChord = snapshot?.confirmedChord ?? localConfirmedChord;
  const history = snapshot?.history ?? localHistory;
  const displayedChord = provisionalChord ?? confirmedChord;
  const waiting = displayedChord.label === "—";
  const detectionState = provisionalChord
    ? copy.provisional
    : waiting
      ? copy.waitingForChord
      : copy.confirmed;
  const refreshDevices = () => {
    if (onRefreshDevices) onRefreshDevices();
    else void localRefreshDevices();
  };
  const clearHistory = () => {
    if (onClearHistory) onClearHistory();
    else localClearSession();
  };
  const save = onSave ?? onShowMain ?? onBack;
  // Nothing is connected and nothing is sounding: say so instead of an empty chord.
  const noDevice = !error && devices.length === 0 && instant.notes.length === 0 && waiting;
  const trail = history.slice(-TRAIL_LENGTH);

  return (
    <main className="lv-live-mini">
      <header className="lv-live-mini-head">
        <Button variant="ghost" size="sm" aria-label={copy.showMain} title={copy.showMain} onClick={onShowMain ?? onBack}>
          <ArrowLeft aria-hidden="true" size={16} />
          <span className="lv-live-mini-back-text">メイン画面</span>
        </Button>
        <label className="lv-live-mini-device" data-status={status} data-midi-kind={connection.kind} title={connection.label}>
          <span className="lv-live-mini-dot" aria-hidden="true" />
          <span className="sr-only">{copy.chooseDevice}</span>
          <Select
            wrapperClassName="min-w-0 flex-1"
            className="w-full"
            value={selected?.backendId ?? ""}
            onChange={(event) => {
              if (onSelectDevice) onSelectDevice(event.target.value);
              else void localSelectDevice(event.target.value);
            }}
          >
            <option value="">{devices.length === 0 ? copy.noDevices : copy.chooseDevice}</option>
            {devices.map((device) => <option key={device.backendId} value={device.backendId}>{device.name}</option>)}
          </Select>
        </label>
        <IconButton variant="ghost" onClick={refreshDevices} label={copy.refreshDevices}>
          <RefreshCw aria-hidden="true" size={16} />
        </IconButton>
      </header>
      <span className="sr-only" role="status" aria-live="polite">{connection.label}</span>

      <section className="lv-live-mini-chord" data-live-midi-current-chord aria-labelledby="live-midi-mini-title">
        <h2 id="live-midi-mini-title" className="sr-only">{copy.currentChord}</h2>
        {error ? (
          <StatusMessage
            tone="error"
            title={copy.openFailed}
            className="max-w-full p-2 text-left text-xs"
            action={(
              <Button variant="neutral" size="sm" onClick={refreshDevices}>
                <RefreshCw aria-hidden="true" size={16} />
                {copy.refreshDevices}
              </Button>
            )}
          >
            <p className="truncate" title={error}>{error}</p>
          </StatusMessage>
        ) : noDevice ? (
          <div className="lv-live-mini-message" data-testid="live-midi-mini-no-device">
            <p className="lv-live-mini-message-title">MIDI 機器がつながっていません</p>
            <p className="lv-live-mini-message-text">鍵盤をつなぐと、自動で見つけます。</p>
            <Button variant="neutral" size="sm" onClick={refreshDevices}>探し直す</Button>
          </div>
        ) : (
          <>
            <span className="lv-live-mini-badge" data-detection-state={detectionState}>{detectionState}</span>
            <div className="lv-live-mini-label-row" aria-live="polite" aria-atomic="true">
              <svg className="lv-live-mini-piano" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M8 5v8M12 5v8M16 5v8M6 13v6M10 13v6M14 13v6M18 13v6" />
              </svg>
              <strong className="lv-live-mini-label" data-waiting={waiting || undefined}>{displayedChord.label}</strong>
            </div>
            {instant.noteNames.length > 0 ? (
              <p className="lv-live-mini-notes">
                {copy.notes}: {instant.noteNames.join(" · ")}
                <span className="lv-live-mini-notes-gap" aria-hidden="true">·</span>
                {copy.bass}: {instant.bass === undefined ? "—" : noteNameFromPitchClass(instant.bass)}
              </p>
            ) : (
              <p className="lv-live-mini-notes" data-testid="live-midi-mini-hint">
                {waiting ? "鍵盤を弾くと、コード名が出ます。" : "鍵盤から手を離しています。"}
              </p>
            )}
          </>
        )}
      </section>

      <LiveMidiKeyStrip pressed={instant.notes} testId="live-midi-mini-keys" />

      <section className="lv-live-mini-foot" aria-label={copy.history}>
        <div className="lv-live-mini-trail" data-testid="live-midi-mini-trail">
          {trail.length > 0 ? trail.map((entry, index) => (
            <span key={entry.id} className="lv-live-mini-history-chip" data-last={index === trail.length - 1 || undefined}>{entry.label}</span>
          )) : <span className="lv-live-mini-trail-empty">弾いたコードが、ここに並びます。</span>}
        </div>
        {history.length > 0 ? (
          <>
            <span className="lv-live-mini-count" data-testid="live-midi-mini-count"><b>{history.length}</b> 個</span>
            <IconButton variant="ghost" onClick={clearHistory} label="弾いた並びを消す">
              <Trash2 aria-hidden="true" size={16} />
            </IconButton>
          </>
        ) : null}
        <Button variant="primary" size="sm" data-testid="live-midi-mini-save" title="窓を閉じて、保存の窓を開きます" disabled={history.length === 0} onClick={save}>
          保存…
        </Button>
      </section>
    </main>
  );
}
