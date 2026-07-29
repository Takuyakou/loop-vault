import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { AppLanguage } from "../../i18n";

interface PreAnalysisTimeScrollbarProps {
  language: AppLanguage;
  totalBeats: number;
  visibleBeats: number;
  startBeat: number;
  beatsPerBar: number;
  onStartBeatChange: (beat: number) => void;
}

interface DragState {
  pointerId: number;
  grabOffset: number;
}

export function PreAnalysisTimeScrollbar({
  language,
  totalBeats,
  visibleBeats,
  startBeat,
  beatsPerBar,
  onStartBeatChange,
}: PreAnalysisTimeScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>();
  const safeTotal = Math.max(1, totalBeats);
  const safeVisible = Math.min(safeTotal, Math.max(0.25, visibleBeats));
  const maxStart = Math.max(0, safeTotal - safeVisible);
  const clampedStart = clamp(startBeat, 0, maxStart);
  const thumbRatio = safeVisible / safeTotal;
  const thumbLeftRatio = clampedStart / safeTotal;
  const startBar = Math.floor(clampedStart / beatsPerBar) + 1;
  const endBar = Math.max(
    startBar,
    Math.ceil((clampedStart + safeVisible) / beatsPerBar),
  );
  const valueText = language === "ja"
    ? `${startBar}〜${endBar}小節を表示`
    : `Showing bars ${startBar} to ${endBar}`;

  function updateFromClientX(clientX: number, grabOffset: number) {
    const track = trackRef.current;
    if (!track || maxStart <= 0) return;
    const bounds = track.getBoundingClientRect();
    const thumbWidth = bounds.width * thumbRatio;
    const travelWidth = Math.max(1, bounds.width - thumbWidth);
    const thumbLeft = clamp(
      clientX - bounds.left - grabOffset,
      0,
      travelWidth,
    );
    onStartBeatChange(thumbLeft / travelWidth * maxStart);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (maxStart <= 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const thumbWidth = bounds.width * thumbRatio;
    const thumbLeft = bounds.left + bounds.width * thumbLeftRatio;
    const target = event.target as HTMLElement;
    const onThumb = Boolean(target.closest("[data-scroll-thumb]"));
    const grabOffset = onThumb
      ? clamp(event.clientX - thumbLeft, 0, thumbWidth)
      : thumbWidth / 2;
    dragRef.current = { pointerId: event.pointerId, grabOffset };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromClientX(event.clientX, grabOffset);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateFromClientX(event.clientX, drag.grabOffset);
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (maxStart <= 0) return;
    const smallStep = Math.max(0.25, safeVisible / 16);
    const barStep = Math.max(0.25, beatsPerBar);
    let next = clampedStart;
    if (event.key === "ArrowLeft") {
      next -= event.shiftKey ? barStep : smallStep;
    } else if (event.key === "ArrowRight") {
      next += event.shiftKey ? barStep : smallStep;
    } else if (event.key === "PageUp") {
      next -= safeVisible * 0.8;
    } else if (event.key === "PageDown") {
      next += safeVisible * 0.8;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = maxStart;
    } else {
      return;
    }
    event.preventDefault();
    onStartBeatChange(clamp(next, 0, maxStart));
  }

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-[var(--lv-text-muted)]">
        <span>{language === "ja" ? "時間位置" : "Timeline position"}</span>
        <span aria-live="polite">{valueText}</span>
      </div>
      <div
        ref={trackRef}
        className={`relative h-4 touch-none border border-[var(--lv-border-strong)] bg-[var(--lv-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--lv-accent)] ${
          maxStart > 0 ? "cursor-pointer" : "opacity-50"
        }`}
        role="scrollbar"
        tabIndex={0}
        aria-label={language === "ja"
          ? "ピアノロールの時間位置"
          : "Piano roll timeline position"}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxStart * 100) / 100}
        aria-valuenow={Math.round(clampedStart * 100) / 100}
        aria-valuetext={valueText}
        data-testid="pre-analysis-time-scrollbar"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      >
        <span
          className="absolute inset-y-0 min-w-6 border-x border-teal-200/80 bg-teal-400/45"
          style={{
            left: `${thumbLeftRatio * 100}%`,
            width: `${thumbRatio * 100}%`,
          }}
          data-scroll-thumb
          data-testid="pre-analysis-time-scroll-thumb"
        >
          <span
            className="absolute left-1/2 top-1/2 h-2.5 w-2 -translate-x-1/2 -translate-y-1/2 border-x border-teal-50/80"
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
