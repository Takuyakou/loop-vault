import { useEffect, useRef, useState } from "react";
import { isBassPracticeRecordCompareEnabled } from "../../application/featureFlag";
import type { ChannelMode } from "../domain/types";
import type { RecorderState } from "../domain/recorderStateMachine";
import { createBrowserRecordingController } from "../application/createController";
import type { RecordingSessionController } from "../application/recordingSessionController";

/**
 * Diagnostic harness for the capture foundation (P5.17-01). It is intentionally
 * not wired into the three Echo modes yet — that is P5.17-02. It exists to
 * exercise and demonstrate the controller against the real browser adapters (or
 * a fake controller in tests), so it renders only when the feature flag is on
 * and never requests permission until the user asks.
 */

export interface RecordingDiagnosticsPanelProps {
  /** Injected in tests; defaults to the browser adapter controller. */
  readonly controller?: RecordingSessionController;
  /** Overrides the feature flag in tests. */
  readonly enabledOverride?: boolean;
}

const CHANNELS: readonly ChannelMode[] = ["auto", "left", "right", "mono-sum"];

export function RecordingDiagnosticsPanel({
  controller,
  enabledOverride,
}: RecordingDiagnosticsPanelProps) {
  const enabled = enabledOverride ?? isBassPracticeRecordCompareEnabled();
  const controllerRef = useRef<RecordingSessionController | null>(controller ?? null);
  const [state, setState] = useState<RecorderState | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const active = controllerRef.current ?? createBrowserRecordingController();
    controllerRef.current = active;
    const unsubscribe = active.subscribe(setState);
    setState(active.probe());
    return () => {
      unsubscribe();
      active.dispose();
      controllerRef.current = null;
    };
  }, [enabled]);

  if (!enabled) return null;
  const active = controllerRef.current;
  const status = state?.status ?? "idle";

  return (
    <section aria-label="Record & Compare diagnostics">
      <h3>Record &amp; Compare (diagnostics)</h3>
      <p aria-live="polite" data-testid="recorder-status">
        Status: {status}
      </p>
      {state?.errorCode ? <p role="alert">Error: {state.errorCode}</p> : null}
      {state?.saveFailed ? <p role="alert">Save failed — take kept for playback.</p> : null}

      <label>
        Input channel
        <select
          value={state?.channelMode ?? "auto"}
          onChange={(event) => active?.setChannel(event.target.value as ChannelMode)}
          disabled={!active}
        >
          {CHANNELS.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>

      <div>
        <button type="button" onClick={() => void active?.enableRecording()} disabled={status !== "idle"}>
          Enable recording
        </button>
        <button type="button" onClick={() => active?.startCountIn()} disabled={status !== "ready"}>
          Start count-in
        </button>
        <button
          type="button"
          onClick={() => void active?.beginRecording({ mimeType: "audio/webm;codecs=opus" })}
          disabled={status !== "counting-in"}
        >
          Begin recording
        </button>
        <button type="button" onClick={() => void active?.stop()} disabled={status !== "recording"}>
          Stop
        </button>
        <button type="button" onClick={() => active?.playTake()} disabled={status !== "recorded"}>
          Hear My Take
        </button>
        <button type="button" onClick={() => active?.retake()} disabled={status !== "recorded"}>
          Retake
        </button>
        <button type="button" onClick={() => void active?.keep()} disabled={status !== "recorded"}>
          Keep Take
        </button>
      </div>
    </section>
  );
}
