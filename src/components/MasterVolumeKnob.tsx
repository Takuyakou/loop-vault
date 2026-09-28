import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { DEFAULT_MASTER_VOLUME } from "../audio/masterVolume";

/** Pixels of vertical drag for the whole 0–100 range; Shift makes it 4× finer. */
const DRAG_RANGE_PX = 150;

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/**
 * Always-visible header knob (P8.9-09b): drag up/down, wheel, double-click to reset,
 * and slider keys. The value is stored by the caller (useMasterVolume) unchanged.
 */
export function MasterVolumeKnob({ value, onChange, label }: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const normalized = clamp(value);
  const drag = useRef<{ y: number; start: number; fine: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const set = (next: number) => {
    const clamped = clamp(next);
    if (clamped !== normalized) onChange(clamped);
  };

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    drag.current = { y: event.clientY, start: normalized, fine: event.shiftKey };
    setDragging(true);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    if (current.fine !== event.shiftKey) {
      // Re-anchor so pressing or releasing Shift mid-drag never jumps.
      drag.current = { y: event.clientY, start: normalized, fine: event.shiftKey };
      return;
    }
    const range = DRAG_RANGE_PX * (current.fine ? 4 : 1);
    set(current.start + (current.y - event.clientY) / range * 100);
  }

  function pointerEnd() {
    drag.current = null;
    setDragging(false);
  }

  function wheel(event: WheelEvent<HTMLDivElement>) {
    if (event.deltaY === 0) return;
    const step = event.shiftKey ? 1 : 2;
    set(normalized + (event.deltaY < 0 ? step : -step));
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = { ArrowUp: 2, ArrowRight: 2, ArrowDown: -2, ArrowLeft: -2, PageUp: 10, PageDown: -10 };
    let next: number | undefined;
    if (event.key in steps) next = normalized + steps[event.key]!;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 100;
    if (next === undefined) return;
    event.preventDefault();
    set(next);
  }

  const style = { "--lv-knob-value": normalized / 100 } as CSSProperties;
  return (
    <div
      className="lv-volume-knob"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalized}
      aria-valuetext={`${normalized}%`}
      data-volume-knob
      data-dragging={dragging || undefined}
      style={style}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      onLostPointerCapture={pointerEnd}
      onDoubleClick={() => set(DEFAULT_MASTER_VOLUME)}
      onWheel={wheel}
      onKeyDown={keyDown}
    >
      <span className="lv-volume-knob-arc" aria-hidden="true" />
      <span className="lv-volume-knob-line" aria-hidden="true" />
      <span className="lv-volume-knob-tip" aria-hidden="true" data-volume-tooltip>{`音量 ${normalized}%`}</span>
    </div>
  );
}
