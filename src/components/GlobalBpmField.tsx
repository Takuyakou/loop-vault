import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronsUpDown } from "lucide-react";
import { GLOBAL_BPM_MAX, GLOBAL_BPM_MIN } from "../audio/globalBpmPreference";
import { useGlobalBpm } from "./GlobalBpmProvider";
import { Button } from "./ui/primitives";

const PRESETS = [60, 80, 100, 120, 140] as const;
/** A press that moves less than this is a click. */
const DRAG_START_PX = 3;
/** Each this many pixels up (down) while dragging is +1 (−1). */
const PX_PER_BPM = 4;

/** P23-05: the one app-wide BPM in the header. Wheel, drag up/down, keys, a list of presets, or type a number. */
export function GlobalBpmField() {
  const { bpm, setBpm, nudgeBpm, songBpm } = useGlobalBpm();
  const rootRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gesture = useRef<{ pointerId: number; startY: number; startBpm: number; lastBpm: number; dragging: boolean }>();
  const finishing = useRef(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [roll, setRoll] = useState<{ dir: "up" | "down"; tick: number }>();
  const rollTimer = useRef<number | null>(null);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

  useEffect(() => () => {
    if (rollTimer.current !== null) window.clearTimeout(rollTimer.current);
  }, []);

  const triggerRoll = (dir: "up" | "down") => {
    if (rollTimer.current !== null) window.clearTimeout(rollTimer.current);
    setRoll((prev) => ({ dir, tick: (prev?.tick ?? 0) + 1 }));
    rollTimer.current = window.setTimeout(() => {
      rollTimer.current = null;
      setRoll(undefined);
    }, 130);
  };

  const backToValue = () => valueRef.current?.focus();

  // The wheel needs a non-passive listener so the page does not scroll.
  useEffect(() => {
    const field = valueRef.current;
    if (!field || editing) return undefined;
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      event.preventDefault();
      const delta = (event.deltaY < 0 ? 1 : -1) * (event.shiftKey ? 5 : 1);
      const next = Math.max(GLOBAL_BPM_MIN, Math.min(GLOBAL_BPM_MAX, bpmRef.current + delta));
      if (next !== bpmRef.current) triggerRoll(next > bpmRef.current ? "up" : "down");
      nudgeBpm(delta);
    };
    field.addEventListener("wheel", wheel, { passive: false });
    return () => field.removeEventListener("wheel", wheel);
  }, [editing, nudgeBpm]);

  // While the list is open, a press outside the field closes it.
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (editing || event.button !== 0) return;
    gesture.current = { pointerId: event.pointerId, startY: event.clientY, startBpm: bpm, lastBpm: bpm, dragging: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const distance = current.startY - event.clientY;
    if (!current.dragging && Math.abs(distance) < DRAG_START_PX) return;
    current.dragging = true;
    event.preventDefault();
    const next = Math.max(GLOBAL_BPM_MIN, Math.min(GLOBAL_BPM_MAX, current.startBpm + Math.trunc(distance / PX_PER_BPM)));
    if (next !== current.lastBpm) {
      triggerRoll(next > current.lastBpm ? "up" : "down");
      current.lastBpm = next;
    }
    setBpm(next);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointerId) return;
    gesture.current = undefined;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!current.dragging && event.type === "pointerup") setOpen(value => !value);
  }

  function startEdit() {
    setOpen(false);
    setDraft(String(bpm));
    finishing.current = false;
    setEditing(true);
  }

  function finishEdit(apply: boolean) {
    if (finishing.current) return;
    finishing.current = true;
    const parsed = Number(draft);
    if (apply && draft.trim() && Number.isFinite(parsed)) setBpm(parsed);
    setEditing(false);
    // The value comes back on the next render; put the cursor on it then.
    requestAnimationFrame(backToValue);
  }

  function valueKey(event: KeyboardEvent<HTMLDivElement>) {
    if (editing) return;
    const step = event.shiftKey ? 5 : 1;
    const actions: Record<string, () => void> = {
      ArrowUp: () => nudgeBpm(step),
      ArrowDown: () => nudgeBpm(-step),
      PageUp: () => nudgeBpm(10),
      PageDown: () => nudgeBpm(-10),
      Home: () => setBpm(GLOBAL_BPM_MIN),
      End: () => setBpm(GLOBAL_BPM_MAX),
      Enter: () => setOpen(value => !value),
      " ": () => setOpen(value => !value),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  function groupKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    backToValue();
  }

  const showSong = songBpm !== undefined && songBpm !== bpm;

  return (
    <div ref={rootRef} className="lv-global-bpm" role="group" aria-label="共通 BPM" data-testid="global-bpm" onKeyDown={groupKey}>
      {showSong ? (
        <button
          type="button"
          className="lv-global-bpm-song"
          data-testid="global-bpm-song"
          title="押すと、この曲の BPM にします"
          aria-label={`曲の BPM ${songBpm} に合わせる`}
          onClick={() => setBpm(songBpm)}
        >
          曲 {songBpm}
        </button>
      ) : null}

      <div
        ref={valueRef}
        className="lv-global-bpm-value"
        role="spinbutton"
        tabIndex={0}
        data-testid="global-bpm-value"
        aria-label="共通 BPM"
        aria-valuemin={GLOBAL_BPM_MIN}
        aria-valuemax={GLOBAL_BPM_MAX}
        aria-valuenow={bpm}
        aria-haspopup="dialog"
        data-open={open || undefined}
        title="ホイール・上下ドラッグで変更。押すと一覧。ダブルクリックで入力"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => { gesture.current = undefined; }}
        onDoubleClick={() => { if (!editing) startEdit(); }}
        onKeyDown={valueKey}
      >
        <span className="lv-global-bpm-label" aria-hidden="true">BPM</span>
        {editing ? (
          <input
            ref={inputRef}
            className="lv-global-bpm-input"
            data-testid="global-bpm-input"
            inputMode="numeric"
            aria-label="共通 BPM を入力"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={() => finishEdit(true)}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                finishEdit(true);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                finishEdit(false);
              }
            }}
          />
        ) : (
          <b key={roll ? `roll-${roll.tick}` : "idle"} className="lv-global-bpm-number" data-roll={roll?.dir}>{bpm}</b>
        )}
        <span className="lv-global-bpm-arrows" aria-hidden="true"><ChevronsUpDown size={16} /></span>
      </div>

      {open ? (
        <div className="lv-global-bpm-popover" role="dialog" aria-label="共通 BPM を選ぶ" data-testid="global-bpm-popover">
          <div className="lv-global-bpm-presets">
            {PRESETS.map(preset => (
              <Button
                key={preset}
                variant="neutral"
                size="sm"
                aria-pressed={bpm === preset}
                onClick={() => {
                  setBpm(preset);
                  setOpen(false);
                  backToValue();
                }}
              >
                {preset}
              </Button>
            ))}
            <Button variant="neutral" size="sm" aria-label="5 下げる" onClick={() => nudgeBpm(-5)}>−5</Button>
            <Button variant="neutral" size="sm" aria-label="5 上げる" onClick={() => nudgeBpm(5)}>+5</Button>
          </div>
          <p className="lv-global-bpm-hint">
            ホイール：1 ずつ（Shift で 5 ずつ）／上下にドラッグ／ダブルクリックで数字を入力。<br />この値はアプリ全体で 1 つ。閉じても残ります。
          </p>
        </div>
      ) : null}
    </div>
  );
}
