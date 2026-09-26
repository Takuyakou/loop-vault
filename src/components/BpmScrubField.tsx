import { useEffect, useRef, useState, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";

export function BpmScrubField({
  idPrefix,
  inputTestId,
  onExplicitInput,
  emptyWhenUnset = false,
  disabled = false,
  dragLabel,
  label,
  onChange,
  value,
}: {
  readonly idPrefix: string;
  readonly inputTestId?: string;
  readonly onExplicitInput?: (value: number) => void;
  readonly emptyWhenUnset?: boolean;
  readonly disabled?: boolean;
  readonly dragLabel: string;
  readonly label: string;
  readonly onChange: (value: number) => void;
  readonly value: number;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gestureRef = useRef<{
    pointerId: number;
    startY: number;
    startValue: number;
    lastValue: number;
    dragging: boolean;
  }>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const valueRef = useRef(value);
  valueRef.current = value;

  function apply(next: number) {
    if (disabled || !Number.isFinite(next)) return;
    const clamped = Math.max(30, Math.min(240, Math.round(next)));
    const gesture = gestureRef.current;
    if (gesture ? clamped === gesture.lastValue : clamped === valueRef.current) return;
    if (gesture) gesture.lastValue = clamped;
    onChange(clamped);
  }

  function finishEdit() {
    const parsed = Number(draft);
    if (draft.trim() && Number.isFinite(parsed)) apply(parsed);
    setEditing(false);
  }

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const wheel = (event: WheelEvent) => {
      if (disabled || !event.deltaY) return;
      event.preventDefault();
      apply(valueRef.current + (event.deltaY < 0 ? 1 : -1));
    };
    field.addEventListener("wheel", wheel, { passive: false });
    return () => field.removeEventListener("wheel", wheel);
  });

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startValue: value,
      lastValue: value,
      dragging: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const distance = gesture.startY - event.clientY;
    if (!gesture.dragging && Math.abs(distance) < 3) return;
    if (!gesture.dragging) {
      gesture.dragging = true;
      setEditing(false);
      inputRef.current?.blur();
    }
    event.preventDefault();
    const pixelsPerBpm = event.shiftKey ? 10 : 4;
    const multiplier = event.ctrlKey ? 5 : 1;
    apply(gesture.startValue + Math.round(distance / pixelsPerBpm) * multiplier);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gestureRef.current = undefined;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!gesture.dragging && event.type === "pointerup") {
      setDraft(emptyWhenUnset ? "" : String(value));
      setEditing(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }

  return (
    <div className="inline-flex min-h-8 items-center gap-2 text-[10px] font-bold tracking-[0.08em] text-[var(--lv-text-muted)]">
      <label htmlFor={idPrefix}>{label}</label>
      <button type="button" className="lv-button-secondary min-h-8 min-w-8 px-1 text-sm" aria-label={`${label} −`} disabled={disabled} onClick={() => apply(value - 1)}>−</button>
      <div
        ref={fieldRef}
        className={`relative touch-none select-none ${editing ? "cursor-text" : "cursor-ns-resize"}`}
        data-testid={`${idPrefix}-field`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => { gestureRef.current = undefined; }}
        onDoubleClick={() => {
          setDraft(emptyWhenUnset ? "" : String(value));
          setEditing(true);
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
      >
        <input
          ref={inputRef}
          id={idPrefix}
          data-testid={inputTestId}
          disabled={disabled}
          aria-describedby={`${idPrefix}-drag-help`}
          className={`lv-field-control min-h-8 w-20 px-2 pr-6 font-mono text-sm ${editing ? "cursor-text" : "cursor-ns-resize"}`}
          type="text"
          inputMode="numeric"
          role="spinbutton"
          aria-valuemin={30}
          aria-valuemax={240}
          aria-valuenow={value}
          value={editing ? draft : emptyWhenUnset ? "" : value}
          placeholder={emptyWhenUnset ? "—" : undefined}
          onFocus={() => { setDraft(emptyWhenUnset ? "" : String(value)); setEditing(true); }}
          onChange={(event) => {
            const typed = Number(event.currentTarget.value);
            setDraft(event.currentTarget.value);
            if (event.currentTarget.value.trim() && Number.isFinite(typed) && typed === valueRef.current) onExplicitInput?.(typed);
            if (!editing) apply(typed);
          }}
          onBlur={finishEdit}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              apply(value + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1));
              setDraft(String(Math.max(30, Math.min(240, value + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1)))));
            } else if (event.key === "Enter") {
              finishEdit();
              inputRef.current?.blur();
            } else if (event.key === "Escape") {
              setDraft(String(value));
              setEditing(false);
              inputRef.current?.blur();
            }
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 flex w-6 items-center justify-center text-[var(--lv-text-muted)]"
          data-testid={`${idPrefix}-drag`}
          title={dragLabel}
        >
          <GripVertical size={16} />
        </span>
        <span className="sr-only" id={`${idPrefix}-drag-help`}>{dragLabel}</span>
      </div>
      <button type="button" className="lv-button-secondary min-h-8 min-w-8 px-1 text-sm" aria-label={`${label} ＋`} disabled={disabled} onClick={() => apply(value + 1)}>＋</button>
    </div>
  );
}
