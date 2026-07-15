import {
  playbackController,
  samePlaybackSource,
  type PlaybackController,
  type PlaybackRequest,
  type PlayingSource,
} from "../audio/playbackController";
import { usePlaybackState } from "../hooks/usePlaybackState";

export function PlayToggle({
  source,
  request,
  playLabel,
  stopLabel,
  className = "lv-button-ghost inline-flex min-h-9 items-center justify-center gap-2 px-3",
  showLabel = true,
  onError,
  controller = playbackController,
}: {
  source: PlayingSource;
  request: PlaybackRequest;
  playLabel: string;
  stopLabel: string;
  className?: string;
  showLabel?: boolean;
  onError?: (error: unknown) => void;
  controller?: PlaybackController;
}) {
  const state = usePlaybackState(controller);
  const active = state.status !== "idle" && samePlaybackSource(state.source, source);
  const label = active ? stopLabel : playLabel;

  return (
    <button
      type="button"
      className={className}
      onClick={() => void controller.toggle(source, request).catch((error) => onError?.(error))}
      aria-label={label}
      aria-pressed={active}
      aria-busy={active && state.status === "starting"}
      title={label}
    >
      <span aria-hidden="true">{active ? "■" : "▶"}</span>
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}
