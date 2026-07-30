import type { CSSProperties } from "react";
import type { PlaybackStatus } from "../audio/playbackController";

interface MeterStyle extends CSSProperties {
  "--lv-meter-level": number;
  "--lv-meter-low": number;
}

export function PlaybackLevelMeter({
  label,
  masterVolume,
  onStop,
  status,
  stopLabel,
}: {
  label: string;
  masterVolume: number;
  onStop: () => void;
  status: PlaybackStatus;
  stopLabel: string;
}) {
  const active = status !== "idle";
  const normalizedVolume = Math.max(0, Math.min(100, masterVolume));
  const level = active
    ? normalizedVolume / 100 * (status === "starting" ? 0.42 : 0.82)
    : 0;
  const title = active
    ? `${label}: ${Math.round(level * 100)}% / ${stopLabel}`
    : `${label}: 0%`;

  return (
    <button
      type="button"
      className="lv-level-meter shrink-0"
      disabled={!active}
      onClick={onStop}
      aria-label={active ? stopLabel : title}
      title={title}
      data-playback-level-meter
      data-playback-status={status}
    >
      <span className="sr-only">{title}</span>
      <span className="lv-level-meter-track" aria-hidden="true">
        <span
          className="lv-level-meter-fill"
          style={{
            "--lv-meter-level": level,
            "--lv-meter-low": level * 0.78,
          } as MeterStyle}
        />
      </span>
      <span className="lv-level-meter-track" aria-hidden="true">
        <span
          className="lv-level-meter-fill lv-level-meter-fill-secondary"
          style={{
            "--lv-meter-level": level * 0.86,
            "--lv-meter-low": level * 0.58,
          } as MeterStyle}
        />
      </span>
    </button>
  );
}
