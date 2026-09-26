import { useEffect } from "react";
import type { TextPlaybackSnapshot, TextTransport, TextTransportState } from "../../audio/textTransport";
import type { AppLanguage } from "../../i18n";

interface Props {
  readonly language: AppLanguage;
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

export function TextTransportBar({ language, transport, state, snapshot, disabled, sourceMatches,
  primaryTestId = "text-transport-primary", frozenTestId = "text-transport-frozen" }: Props) {
  const ja = language === "ja";
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
  const primaryLabel = state.status === "playing" ? (ja ? "Ⅱ 一時停止" : "Ⅱ Pause")
    : state.status === "paused" ? (ja ? "▶ 再開" : "▶ Resume") : (ja ? "▶ 再生" : "▶ Play");
  return <div className="flex flex-wrap items-center gap-2" data-testid="text-transport">
    <button type="button" data-testid={primaryTestId} className="lv-button-primary min-h-9 px-3 text-sm"
      disabled={disabled || (state.status === "stopped" && snapshot.lengthBeats <= 0)} onClick={primary}>{primaryLabel}</button>
    <button type="button" data-testid="text-transport-stop" className="lv-button-secondary min-h-9 px-3 text-sm"
      disabled={disabled || state.status === "stopped"} onClick={() => transport.stop()}>{ja ? "■ 停止" : "■ Stop"}</button>
    <button type="button" data-testid="text-transport-beginning" className="lv-button-secondary min-h-9 px-3 text-sm"
      disabled={disabled} onClick={() => transport.beginning()}>{ja ? "|◀ 最初から" : "|◀ Beginning"}</button>
    <button type="button" data-testid="text-transport-loop" className="lv-button-secondary min-h-9 px-3 text-sm"
      disabled={disabled} aria-pressed={state.loop} onClick={() => transport.setLoop(!state.loop)}>
      {ja ? "全体ループ" : "Loop all"} {state.loop ? "ON" : "OFF"}</button>
    <span className="text-xs text-[var(--lv-text-muted)]" data-testid="text-transport-position" aria-live="off" />
    <span className="sr-only" role="status" aria-live="polite" data-testid="text-transport-status">
      {primaryLabel}{state.status === "stopped" ? (ja ? "・停止中" : " · stopped") : ""}
    </span>
    {state.snapshot && !sourceMatches ? <span className="text-xs text-[var(--lv-warning)]" data-testid={frozenTestId}>
      {ja ? "編集中の変更は次回再生から反映されます" : "Edits apply on the next Play."}
    </span> : null}
  </div>;
}
