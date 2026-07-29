import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { AppLanguage } from "../../i18n";

interface PreAnalysisTimeScrollbarProps {
  language: AppLanguage;
  totalBeats: number;
  visibleBeats: number;
  viewportStartBeat: number;
  positionBeat: number;
  beatsPerBar: number;
  onPositionBeatChange: (beat: number) => void;
}

export function PreAnalysisTimeScrollbar({
  language,
  totalBeats,
  visibleBeats,
  viewportStartBeat,
  positionBeat,
  beatsPerBar,
  onPositionBeatChange,
}: PreAnalysisTimeScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragPointerRef = useRef<number>();
  const safeTotal = Math.max(1, totalBeats);
  const safeVisible = Math.min(safeTotal, Math.max(0.25, visibleBeats));
  const maxStart = Math.max(0, safeTotal - safeVisible);
  const clampedStart = clamp(viewportStartBeat, 0, maxStart);
  const clampedPosition = clamp(positionBeat, 0, safeTotal);
  const viewportRatio = safeVisible / safeTotal;
  const viewportLeftRatio = clampedStart / safeTotal;
  const positionRatio = clampedPosition / safeTotal;
  const currentBar = Math.min(
    Math.max(1, Math.ceil(safeTotal / beatsPerBar)),
    Math.floor(clampedPosition / beatsPerBar) + 1,
  );
  const valueText = language === "ja"
    ? `${currentBar}小節目へ移動`
    : `Move to bar ${currentBar}`;

  function updateFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track) return;
    const bounds = track.getBoundingClientRect();
    const ratio = clamp(
      (clientX - bounds.left) / Math.max(1, bounds.width),
      0,
      1,
    );
    onPositionBeatChange(ratio * safeTotal);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    dragPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromClientX(event.clientX);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragPointerRef.current !== event.pointerId) return;
    updateFromClientX(event.clientX);
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (dragPointerRef.current !== event.pointerId) return;
    dragPointerRef.current = undefined;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const beatStep = Math.max(0.25, beatsPerBar / 4);
    const barStep = Math.max(0.25, beatsPerBar);
    let next = clampedPosition;
    if (event.key === "ArrowLeft") {
      next -= event.shiftKey ? barStep : beatStep;
    } else if (event.key === "ArrowRight") {
      next += event.shiftKey ? barStep : beatStep;
    } else if (event.key === "PageUp") {
      next -= safeVisible * 0.8;
    } else if (event.key === "PageDown") {
      next += safeVisible * 0.8;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = safeTotal;
    } else {
      return;
    }
    event.preventDefault();
    onPositionBeatChange(clamp(next, 0, safeTotal));
  }

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-[var(--lv-text-muted)]">
        <span>
          {language === "ja"
            ? "白いバーを動かして移動"
            : "Drag the white bar to move"}
        </span>
        <span aria-live="polite">{valueText}</span>
      </div>
      <div
        ref={trackRef}
        className="relative h-6 touch-none cursor-pointer border-y border-[var(--lv-border-strong)] bg-[#0a111b] focus:outline-none focus:ring-2 focus:ring-[var(--lv-accent)]"
        role="slider"
        tabIndex={0}
        aria-label={language === "ja"
          ? "ピアノロールの白い移動バー"
          : "Piano roll white navigation bar"}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.round(safeTotal * 100) / 100}
        aria-valuenow={Math.round(clampedPosition * 100) / 100}
        aria-valuetext={valueText}
        data-testid="pre-analysis-time-scrollbar"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      >
        <span
          className="pointer-events-none absolute inset-y-1 bg-white/10"
          style={{
            left: `${viewportLeftRatio * 100}%`,
            width: `${viewportRatio * 100}%`,
          }}
          data-testid="pre-analysis-visible-range"
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.65)]"
          style={{ left: `${positionRatio * 100}%` }}
          data-testid="pre-analysis-time-cursor"
        >
          <span
            className="absolute -left-1.5 top-0 h-1.5 w-3 bg-white"
            aria-hidden="true"
          />
        </span>
      </div>
    </div>
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
