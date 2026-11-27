import { useEffect } from "react";
import { PlaybackRow } from "../PlaybackRow";
import type { TextPlaybackSnapshot, TextTransport, TextTransportState } from "../../audio/textTransport";

interface Props {
  readonly transport: TextTransport;
  readonly state: TextTransportState;
  readonly snapshot: TextPlaybackSnapshot;
  readonly disabled: boolean;
  readonly sourceMatches: boolean;
  readonly primaryTestId?: string;
  readonly frozenTestId?: string;
}

function isEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true'], [role='textbox'], [role='spinbutton'], [role='button']"));
}

/**
 * P23-17 V5: the text intake's transport is the shared `PlaybackRow` (pausable: ▶/Ⅱ, ■, |◀, ↻).
 * The test ids, the words, the Space key, the disabled rules and the frozen notice stay exactly as they were.
 */
export function TextTransportBar({ transport, state, snapshot, disabled, sourceMatches,
  primaryTestId = "text-transport-primary", frozenTestId = "text-transport-frozen" }: Props) {
  const primary = () => {
    if (disabled) return;
    if (state.status === "playing") transport.pause();
    else if (state.status === "paused") transport.play();
    else transport.play(snapshot);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.altKey || event.ctrlKey || event.metaKey
        || isEditing(event.target) || disabled) return;
      event.preventDefault();
      primary();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  const primaryLabel = state.status === "playing" ? ("Ⅱ 一時停止")
    : state.status === "paused" ? ("▶ 再開") : ("▶ 再生");
  return <div className="lv-text-transport" data-testid="text-transport">
    <PlaybackRow
      label="再生"
      status={state.status}
      pausable
      disabled={disabled}
      primaryDisabled={state.status === "stopped" && snapshot.lengthBeats <= 0}
      onPrimary={primary}
      onStop={() => transport.stop()}
      onBeginning={() => transport.beginning()}
      loop={state.loop}
      onLoop={(loop) => transport.setLoop(loop)}
      primaryProps={{ "data-testid": primaryTestId }}
      stopProps={{ "data-testid": "text-transport-stop" }}
      beginningProps={{ "data-testid": "text-transport-beginning" }}
      loopProps={{ "data-testid": "text-transport-loop" }}
    >
      <span className="sr-only" role="status" aria-live="polite" data-testid="text-transport-status">
        {primaryLabel}{state.status === "stopped" ? ("・停止中") : ""}
      </span>
      {state.snapshot && !sourceMatches ? <span className="text-xs text-[var(--lv-warning)]" data-testid={frozenTestId}>
        {"編集中の変更は次回再生から反映されます"}
      </span> : null}
    </PlaybackRow>
  </div>;
}
