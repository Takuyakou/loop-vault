import { useEffect } from "react";
import { TransportButton } from "../TransportButton";
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
  return <div className="lv-text-transport flex items-center gap-1" data-testid="text-transport">
    <TransportButton variant="primary" fixedPrimary data-testid={primaryTestId}
      disabled={disabled || (state.status === "stopped" && snapshot.lengthBeats <= 0)} onClick={primary}>{primaryLabel}</TransportButton>
    <TransportButton variant="neutral" data-testid="text-transport-stop"
      disabled={disabled || state.status === "stopped"} onClick={() => transport.stop()}>{"■ 停止"}</TransportButton>
    <TransportButton variant="neutral" data-testid="text-transport-beginning"
      disabled={disabled} aria-label={"最初から"} title={"最初から"} onClick={() => transport.beginning()}>{"|◀ 最初から"}</TransportButton>
    <TransportButton variant="loop" active={state.loop} data-testid="text-transport-loop"
      disabled={disabled} aria-pressed={state.loop} aria-label={("全体ループ ") + (state.loop ? "ON" : "OFF")} onClick={() => transport.setLoop(!state.loop)}>
      {"↻ ループ"}</TransportButton>
    <span className="lv-text-transport-position font-mono text-xs text-[var(--lv-text-muted)]" data-testid="text-transport-position" aria-live="off" />
    <span className="sr-only" role="status" aria-live="polite" data-testid="text-transport-status">
      {primaryLabel}{state.status === "stopped" ? ("・停止中") : ""}
    </span>
    {state.snapshot && !sourceMatches ? <span className="text-xs text-[var(--lv-warning)]" data-testid={frozenTestId}>
      {"編集中の変更は次回再生から反映されます"}
    </span> : null}
  </div>;
}
