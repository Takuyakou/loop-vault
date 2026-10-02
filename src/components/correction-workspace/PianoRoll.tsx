import { useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { CorrectionCard, CorrectionModel, CorrectionNote } from "../../domain/correction/correctionModel";
import { noteLabel } from "../../domain/correction/correctionModel";
import { aboveLineIds, deleteNotes, movePitch, restoreNotes, type EditResult } from "../../domain/correction/edits";
import { overlaps, type BeatRange } from "./workspaceGeometry";

export const ROW_PX = 6;

/**
 * The piano roll and its FL-style gestures (spec v2.3 §7.2). Edits are computed
 * from `present` and shown through `shown` while a drag lasts, then committed once
 * (one drag = one history entry). Notes never move sideways.
 */
export interface PianoRollProps {
  present: CorrectionModel;
  shown: CorrectionModel;
  range: BeatRange;
  pxPerBeat: number;
  low: number;
  high: number;
  mode: "check" | "edit";
  selectedCard?: CorrectionCard;
  selectedNoteIds: ReadonlySet<string>;
  warnNoteIds: ReadonlySet<string>;
  melodyLine?: number;
  /** ① a click on empty space with no notes selected also clears the card selection (P10.1 §2). */
  onClearCard?: () => void;
  /** P10.1 §7: while notes are selected, a bar at the left edge of the view to act on them or stop. */
  selectionBar?: ReactNode;
  /** The view's scroll position in px, to keep the bar at the left edge. */
  leftEdge?: number;
  onPreview: (model: CorrectionModel | undefined) => void;
  onCommit: (result: EditResult) => void;
  onSelectNotes: (ids: string[], how: "replace" | "add" | "toggle") => void;
  onSelectCard: (cardId: string) => void;
  onPlayPitch: (pitch: number) => void;
  onAdd: (cardId: string, pitch: number) => void;
  onMelodyLine: (pitch: number) => void;
}

type Gesture =
  | { kind: "paint"; op: "exclude" | "restore"; ids: Set<string>; pointerId: number }
  | { kind: "move"; ids: string[]; noteId: string; startY: number; semitones: number; pointerId: number }
  | { kind: "marquee"; from: { beat: number; pitch: number }; to: { beat: number; pitch: number }; add: boolean; moved: boolean; pointerId: number }
  | { kind: "line"; pointerId: number };

export function PianoRoll(props: PianoRollProps) {
  const { shown, pxPerBeat, low, high, range, mode, selectedCard } = props;
  const rollRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>();
  const [tip, setTip] = useState<{ text: string; x: number; y: number }>();
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number }>();
  const height = (high - low + 1) * ROW_PX;

  const at = (event: { clientX: number; clientY: number }) => {
    const box = rollRef.current!.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    return { x, y, beat: x / pxPerBeat, pitch: high - Math.floor(y / ROW_PX) };
  };
  const noteAt = (event: { clientX: number; clientY: number; target?: EventTarget | null }): CorrectionNote | undefined => {
    const direct = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-note-id]") : null;
    const element = direct ?? (typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(event.clientX, event.clientY).find((entry): entry is HTMLElement => entry instanceof HTMLElement && entry.dataset.noteId !== undefined)
      : undefined);
    const id = element?.dataset.noteId;
    return id ? props.present.notes.find((note) => note.id === id) : undefined;
  };
  const cardAt = (beat: number) => props.present.cards.find((card) => beat >= card.start && beat < card.start + card.duration);
  const paintResult = (op: "exclude" | "restore", ids: Set<string>) => op === "exclude" ? deleteNotes(props.present, ids) : restoreNotes(props.present, ids);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 2) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-roll-control]")) return;
    const point = at(event);
    if (target?.closest("[data-melody-line]")) {
      gesture.current = { kind: "line", pointerId: event.pointerId };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }
    const note = noteAt(event);
    if (note) {
      if (event.button === 2) {
        gesture.current = { kind: "paint", op: "exclude", ids: new Set([note.id]), pointerId: event.pointerId };
        props.onPreview(paintResult("exclude", gesture.current.ids).model);
      } else if (!note.used && note.provenance === "SOURCE") {
        gesture.current = { kind: "paint", op: "restore", ids: new Set([note.id]), pointerId: event.pointerId };
        props.onPreview(paintResult("restore", gesture.current.ids).model);
      } else if (event.shiftKey || event.ctrlKey || event.metaKey) {
        props.onSelectNotes([note.id], event.ctrlKey || event.metaKey ? "toggle" : "add");
        return;
      } else {
        const ids = props.selectedNoteIds.has(note.id) ? [...props.selectedNoteIds] : [note.id];
        gesture.current = { kind: "move", ids, noteId: note.id, startY: point.y, semitones: 0, pointerId: event.pointerId };
      }
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    // ② adds with one click (FL pencil); Ctrl+drag selects there. ① always selects by dragging.
    if (mode === "edit" && !(event.ctrlKey || event.metaKey) && !event.shiftKey) {
      const card = cardAt(point.beat);
      if (card) props.onAdd(card.id, point.pitch);
      return;
    }
    gesture.current = { kind: "marquee", from: point, to: point, add: event.shiftKey, moved: false, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = at(event);
    if (current.kind === "paint") {
      const note = noteAt(event);
      const wanted = note && (current.op === "exclude" ? note.used || note.provenance === "MANUAL_ADDED" : !note.used && note.provenance === "SOURCE");
      if (note && wanted && !current.ids.has(note.id)) {
        current.ids.add(note.id);
        props.onPreview(paintResult(current.op, current.ids).model);
      }
    } else if (current.kind === "move") {
      const semitones = Math.round((current.startY - point.y) / ROW_PX);
      if (semitones === current.semitones) return;
      current.semitones = semitones;
      const source = props.present.notes.find((note) => note.id === current.noteId)!;
      props.onPreview(semitones ? movePitch(props.present, current.ids, semitones).model : undefined);
      setTip(semitones ? { text: `${noteLabel(source.pitch)} → ${noteLabel(source.pitch + semitones)}`, x: point.x, y: point.y } : undefined);
    } else if (current.kind === "marquee") {
      current.to = point;
      current.moved = current.moved || Math.abs(point.beat - current.from.beat) * pxPerBeat > 3 || Math.abs(point.pitch - current.from.pitch) > 0;
      if (current.moved) {
        const left = Math.min(current.from.beat, point.beat) * pxPerBeat;
        const top = (high - Math.max(current.from.pitch, point.pitch)) * ROW_PX;
        setMarquee({ left, top, width: Math.abs(point.beat - current.from.beat) * pxPerBeat, height: (Math.abs(point.pitch - current.from.pitch) + 1) * ROW_PX });
      }
    } else if (current.kind === "line") {
      props.onMelodyLine(Math.max(low, Math.min(high, point.pitch)));
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = undefined;
    setTip(undefined);
    setMarquee(undefined);
    if (current.kind === "paint") {
      props.onPreview(undefined);
      props.onCommit(paintResult(current.op, current.ids));
    } else if (current.kind === "move") {
      props.onPreview(undefined);
      if (current.semitones) {
        props.onCommit(movePitch(props.present, current.ids, current.semitones));
      } else {
        const note = props.present.notes.find((entry) => entry.id === current.noteId)!;
        props.onSelectNotes([note.id], "replace");
        props.onSelectCard(note.cardId);
        props.onPlayPitch(note.pitch);
      }
    } else if (current.kind === "marquee") {
      if (!current.moved) {
        if (!current.add) {
          if (props.selectedNoteIds.size === 0) props.onClearCard?.();
          props.onSelectNotes([], "replace");
        }
        return;
      }
      const from = Math.min(current.from.beat, current.to.beat);
      const to = Math.max(current.from.beat, current.to.beat);
      const top = Math.max(current.from.pitch, current.to.pitch);
      const bottom = Math.min(current.from.pitch, current.to.pitch);
      const ids = props.present.notes
        .filter((note) => note.pitch <= top && note.pitch >= bottom && note.start < to && note.start + note.duration > from)
        .map((note) => note.id);
      props.onSelectNotes(ids, current.add ? "add" : "replace");
    }
  }

  function onDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (mode === "edit" || noteAt(event)) return;
    const point = at(event);
    const card = cardAt(point.beat);
    if (card) props.onAdd(card.id, point.pitch);
  }

  const visible = shown.notes.filter((note) => overlaps(note.start, note.duration, range));
  const lineIds = props.melodyLine !== undefined ? aboveLineIds(props.present, props.melodyLine) : [];
  // The line's own selection is on: its button stops it (P10.1 §7).
  const lineSelected = lineIds.length > 0 && props.selectedNoteIds.size === lineIds.length && lineIds.every((id) => props.selectedNoteIds.has(id));
  return (
    <div
      ref={rollRef}
      className="lv-cw-roll"
      data-mode={mode}
      style={{ height }}
      data-testid="correction-piano-roll"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={(event) => event.preventDefault()}
    >
      {selectedCard ? <span className="lv-cw-window" style={{ left: selectedCard.start * pxPerBeat, width: selectedCard.duration * pxPerBeat }} /> : null}
      {mode === "edit" && selectedCard ? (
        <>
          <span className="lv-cw-shade" style={{ left: 0, width: selectedCard.start * pxPerBeat }} />
          <span className="lv-cw-shade" style={{ left: (selectedCard.start + selectedCard.duration) * pxPerBeat, right: 0 }} />
        </>
      ) : null}
      {visible.map((note) => {
        const top = (high - note.pitch) * ROW_PX;
        return (
          <span key={note.id} className="lv-cw-note-wrap">
            {note.originalPitch !== undefined ? (
              <span className="lv-cw-ghost" style={{ left: note.start * pxPerBeat, width: Math.max(4, note.duration * pxPerBeat - 1), top: (high - note.originalPitch) * ROW_PX, height: ROW_PX - 1 }} />
            ) : null}
            <span
              className="lv-cw-note"
              data-note-id={note.id}
              data-card={note.cardId}
              data-kind={noteKind(note, props.warnNoteIds)}
              data-moved={note.originalPitch !== undefined || undefined}
              data-selected={props.selectedNoteIds.has(note.id) || undefined}
              title={noteTitle(note)}
              style={{ left: note.start * pxPerBeat, width: Math.max(4, note.duration * pxPerBeat - 1), top, height: ROW_PX - 1 }}
            />
          </span>
        );
      })}
      {mode === "edit" && selectedCard && props.melodyLine !== undefined ? (
        <span className="lv-cw-mel-line" data-melody-line style={{ left: selectedCard.start * pxPerBeat, width: selectedCard.duration * pxPerBeat, top: (high - props.melodyLine) * ROW_PX }}>
          {lineSelected ? (
            <button type="button" className="lv-cw-mel-button" data-roll-control onClick={() => props.onSelectNotes([], "replace")} data-testid="correction-select-above-line">
              選択をやめる（Esc）
            </button>
          ) : (
            <button type="button" className="lv-cw-mel-button" data-roll-control onClick={() => props.onSelectNotes(lineIds, "replace")} data-testid="correction-select-above-line">
              線より上の音を選ぶ（{lineIds.length}）
            </button>
          )}
        </span>
      ) : null}
      {props.selectionBar ? (
        <div className="lv-cw-selbar" data-roll-control role="group" aria-label="選んだ音" data-testid="correction-selection-bar" style={{ left: (props.leftEdge ?? 0) + 8 }}>
          {props.selectionBar}
        </div>
      ) : null}
      {marquee ? <span className="lv-cw-marquee" style={marquee} /> : null}
      {tip ? <span className="lv-cw-pitch-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</span> : null}
    </div>
  );
}

export function noteKind(note: CorrectionNote, warn: ReadonlySet<string>): string {
  if (note.provenance === "MANUAL_ADDED") return "manual";
  if (note.used) return warn.has(note.id) ? "warn" : note.roleHint === "bass" ? "bass" : "harmony";
  return note.roleHint === "melody" ? "melody" : "off";
}

export function noteTitle(note: CorrectionNote): string {
  const beats = Number.isInteger(note.duration) ? String(note.duration) : note.duration.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  if (note.provenance === "MANUAL_ADDED") return `${noteLabel(note.pitch)} · 手動で足した音`;
  if (note.originalPitch !== undefined) return `${noteLabel(note.pitch)}（元は ${noteLabel(note.originalPitch)}） · ${beats}拍 · ${note.used ? "使っている" : "使っていない"}`;
  return `${noteLabel(note.pitch)} · ${beats}拍 · ${note.used ? "使っている" : "使っていない"}`;
}
