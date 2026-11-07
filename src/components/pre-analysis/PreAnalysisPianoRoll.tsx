import { useEffect, useMemo, useRef } from "react";
import type { KeyboardEvent, MutableRefObject, PointerEvent } from "react";
import type {
  AnalysisSession,
  AnalysisSessionVoice,
  PreAnalysisNote,
} from "../../domain/midi/preAnalysis";
import { ROLE_COLOR, voiceRoleView } from "./sessionView";

/** Pixels per beat at zoom 1. Notes are never stretched sideways to fill a wide window. */
export const BASE_PIXELS_PER_BEAT = 26;
export const MIN_ROW_HEIGHT = 6;
export const MAX_ROW_HEIGHT = 16;
export const PIANO_ROLL_GUTTER = 38;
export const PIANO_ROLL_RULER = 22;
/** The playhead: the accent colour of the app (Stage 01 §3). */
export const PLAYHEAD_COLOR = "#42d8c6";

interface NoteHitArea {
  voiceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PianoRollLayout {
  minPitch: number;
  maxPitch: number;
  rowHeight: number;
  /** Height of the whole roll including the ruler; larger than `height` when it has to scroll. */
  contentHeight: number;
}

/**
 * Rows are sized from the room there is: the range of pitches in use ±2 semitones is fitted to
 * `height` with 6〜16 px per semitone. A shorter range is widened so the roll leaves no empty
 * space below; one that does not fit even at 6 px scrolls.
 */
export function pianoRollLayout(
  session: AnalysisSession,
  height: number,
): PianoRollLayout {
  const visible = visibleNotes(session);
  const pitches = visible.map((note) => note.pitch);
  let minPitch = (pitches.length ? Math.min(...pitches) : 60) - 2;
  let maxPitch = (pitches.length ? Math.max(...pitches) : 72) + 2;
  minPitch = Math.max(0, minPitch);
  maxPitch = Math.min(127, maxPitch);
  const avail = Math.max(1, height - PIANO_ROLL_RULER);
  const count = maxPitch - minPitch + 1;
  const rowHeight = Math.max(
    MIN_ROW_HEIGHT,
    Math.min(MAX_ROW_HEIGHT, Math.floor(avail / count)),
  );
  const extra = Math.floor((avail - count * rowHeight) / rowHeight);
  if (extra > 0) {
    maxPitch = Math.min(127, maxPitch + Math.ceil(extra / 2));
    minPitch = Math.max(0, minPitch - Math.floor(extra / 2));
  }
  const rows = maxPitch - minPitch + 1;
  return {
    minPitch,
    maxPitch,
    rowHeight,
    contentHeight: Math.max(height, PIANO_ROLL_RULER + rows * rowHeight),
  };
}

/**
 * What the playing loop of the parent calls, once per frame. The upper layer is drawn from here, so
 * the screen is not rendered again for a frame (spec v2.5 §7.3); the lower layer is not touched.
 */
export interface PianoRollOverlayApi {
  /** Playing: the line at `beat`, and the notes that sound lit. */
  frame(beat: number, sounding: readonly PreAnalysisNote[]): void;
  /** Stopped: no light, the line stays where it stopped. */
  rest(beat: number): void;
}

interface PreAnalysisPianoRollProps {
  session: AnalysisSession;
  selectedVoiceId?: string;
  /** Width and height of the area the roll may use (measured by the parent). */
  width: number;
  height: number;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  playheadBeat: number;
  /** 「アプリに任せる」: the weight Harmonic Core gives each note (see harmonicCorePreview). */
  multipliers?: ReadonlyMap<PreAnalysisNote, number>;
  /** 「線で分ける」: part id → the pitch the melody starts at. Notes at or above it are drawn as melody. */
  splits?: Readonly<Record<string, { melodyFrom: number }>>;
  onSplitChange?: (voiceId: string, melodyFrom: number) => void;
  onSelectVoice: (voiceId: string) => void;
  onViewportStartChange: (beat: number) => void;
  onPlayheadBeatChange: (beat: number) => void;
  onZoomStep?: (direction: 1 | -1) => void;
  overlayApiRef?: MutableRefObject<PianoRollOverlayApi | null>;
}

const NO_NOTES: readonly PreAnalysisNote[] = [];

export function PreAnalysisPianoRoll({
  session,
  selectedVoiceId,
  width,
  height,
  pixelsPerBeat,
  viewportStartBeat,
  playheadBeat,
  multipliers,
  splits,
  onSplitChange,
  onSelectVoice,
  onViewportStartChange,
  onPlayheadBeatChange,
  onZoomStep,
  overlayApiRef,
}: PreAnalysisPianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const overlayState = useRef({ beat: playheadBeat, sounding: NO_NOTES, playing: false });
  const hitAreasRef = useRef<NoteHitArea[]>([]);
  const pointerRef = useRef<number>();
  const lineDragRef = useRef<{ pointerId: number; voiceId: string }>();
  const layout = useMemo(
    () => pianoRollLayout(session, height),
    [session, height],
  );
  const visibleBeats = Math.max(1, (width - PIANO_ROLL_GUTTER) / pixelsPerBeat);
  const voiceById = useMemo(() => new Map(session.voices.map((voice) => [voice.id, voice])), [session.voices]);
  const shownSources = useMemo(
    () => new Set(session.sources.filter((source) => source.visible).map((source) => source.id)),
    [session.sources],
  );
  // The upper layer is drawn from the latest of these, by the effect below and by the playing loop.
  const latest = useRef({ width, layout, pixelsPerBeat, viewportStartBeat, voiceById, shownSources, splits });
  latest.current = { width, layout, pixelsPerBeat, viewportStartBeat, voiceById, shownSources, splits };

  const drawOverlay = () => {
    const canvas = overlayRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const view = latest.current;
    const state = overlayState.current;
    const lit = drawPlaybackOverlay(context, view.width, view.layout, {
      voiceById: view.voiceById,
      shownSources: view.shownSources,
      pixelsPerBeat: view.pixelsPerBeat,
      viewportStartBeat: view.viewportStartBeat,
      beat: state.beat,
      sounding: state.playing ? state.sounding : NO_NOTES,
      splits: view.splits,
    });
    const value = String(lit);
    if (canvas.dataset.soundingCount !== value) canvas.dataset.soundingCount = value;
  };

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(layout.contentHeight * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${layout.contentHeight}px`;
    canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawOverlay();
  }, [width, layout.contentHeight]);

  // Not playing: the line is where the position is. Playing: the loop moves it; this only redraws it after the
  // view changed (paging, zoom, a different part selected).
  useEffect(() => {
    if (!overlayState.current.playing) overlayState.current.beat = playheadBeat;
    drawOverlay();
  }, [playheadBeat, viewportStartBeat, pixelsPerBeat, layout, voiceById, shownSources, splits]);

  useEffect(() => {
    if (!overlayApiRef) return undefined;
    overlayApiRef.current = {
      frame(beat, sounding) {
        overlayState.current = { beat, sounding, playing: true };
        drawOverlay();
      },
      rest(beat) {
        overlayState.current = { beat, sounding: NO_NOTES, playing: false };
        drawOverlay();
      },
    };
    return () => { overlayApiRef.current = null; };
  }, [overlayApiRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(layout.contentHeight * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${layout.contentHeight}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawPianoRoll(context, width, layout, {
      session,
      selectedVoiceId,
      pixelsPerBeat,
      viewportStartBeat,
      multipliers,
      splits,
    }, hitAreasRef);
  }, [
    layout,
    multipliers,
    splits,
    pixelsPerBeat,
    selectedVoiceId,
    session,
    viewportStartBeat,
    width,
  ]);

  // Ctrl + wheel zooms. A listener of our own, because React's wheel handler cannot cancel the page zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onZoomStep) return undefined;
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      onZoomStep(event.deltaY < 0 ? 1 : -1);
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, [onZoomStep]);

  function totalBeats() {
    return sessionDuration(session);
  }

  /** The part whose line is under the pointer (within a few pixels), if any. */
  function lineAt(event: PointerEvent<HTMLCanvasElement>): string | undefined {
    if (!splits) return undefined;
    const bounds = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - bounds.top;
    const near = (melodyFrom: number) =>
      Math.abs(y - lineY(layout, melodyFrom)) <= 6;
    if (selectedVoiceId && splits[selectedVoiceId] && near(splits[selectedVoiceId]!.melodyFrom)) {
      return selectedVoiceId;
    }
    return Object.keys(splits).find((id) => near(splits[id]!.melodyFrom));
  }

  function pitchAtLine(event: PointerEvent<HTMLCanvasElement>): number {
    const bounds = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - bounds.top;
    return Math.round(layout.maxPitch + 1 - (y - PIANO_ROLL_RULER) / layout.rowHeight);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    const maxStart = Math.max(0, totalBeats() - visibleBeats);
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onViewportStartChange(Math.max(0, viewportStartBeat - visibleBeats / 16));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onViewportStartChange(Math.min(maxStart, viewportStartBeat + visibleBeats / 16));
    } else if (event.key === "Home") {
      event.preventDefault();
      onViewportStartChange(0);
    }
  }

  function updatePlayheadFromPointer(event: PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const beat = viewportStartBeat
      + (event.clientX - bounds.left - PIANO_ROLL_GUTTER) / pixelsPerBeat;
    onPlayheadBeatChange(clamp(beat, 0, totalBeats()));
  }

  return (
    <div
      className="lv-pa-roll-scroll"
      style={{ height }}
      data-testid="pre-analysis-roll-scroll"
    >
      <div className="lv-pa-roll-stack" style={{ width, height: layout.contentHeight }}>
      <canvas
        ref={canvasRef}
        className="lv-pa-roll"
        role="img"
        tabIndex={0}
        aria-label="パートを役割の色で表したピアノロール。クリックした位置から再生できます。左右キーで表示範囲を動かせます。"
        title="クリックで再生位置を決める。Ctrl + ホイールで拡大・縮小"
        data-testid="pre-analysis-piano-roll"
        data-pixels-per-beat={pixelsPerBeat}
        data-row-height={layout.rowHeight}
        data-min-pitch={layout.minPitch}
        data-max-pitch={layout.maxPitch}
        data-viewport-start-beat={viewportStartBeat}
        data-playhead-beat={playheadBeat}
        data-visible-note-count={visibleNotes(session).length}
        data-weighted-note-count={multipliers?.size ?? 0}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const dragged = lineAt(event);
          if (dragged && onSplitChange) {
            lineDragRef.current = { pointerId: event.pointerId, voiceId: dragged };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            onSelectVoice(dragged);
            return;
          }
          if (event.clientX - bounds.left < PIANO_ROLL_GUTTER) return;
          pointerRef.current = event.pointerId;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          const x = event.clientX - bounds.left;
          const y = event.clientY - bounds.top;
          const hit = [...hitAreasRef.current].reverse().find((area) =>
            x >= area.x && x <= area.x + area.width
            && y >= area.y && y <= area.y + area.height);
          if (hit) onSelectVoice(hit.voiceId);
          updatePlayheadFromPointer(event);
        }}
        onPointerMove={(event) => {
          const drag = lineDragRef.current;
          if (drag && drag.pointerId === event.pointerId) {
            onSplitChange?.(drag.voiceId, pitchAtLine(event));
            return;
          }
          event.currentTarget.style.cursor = lineAt(event) ? "ns-resize" : "";
          if (pointerRef.current !== event.pointerId) return;
          updatePlayheadFromPointer(event);
        }}
        onPointerUp={(event) => {
          if (lineDragRef.current?.pointerId === event.pointerId) {
            lineDragRef.current = undefined;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            return;
          }
          if (pointerRef.current !== event.pointerId) return;
          pointerRef.current = undefined;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }}
        onPointerCancel={() => { pointerRef.current = undefined; }}
      />
      <canvas
        ref={overlayRef}
        className="lv-pa-roll-overlay"
        aria-hidden="true"
        data-testid="pre-analysis-roll-overlay"
      />
      </div>
    </div>
  );
}

export interface PianoRollDrawOptions {
  session: AnalysisSession;
  selectedVoiceId?: string;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  multipliers?: ReadonlyMap<PreAnalysisNote, number>;
  splits?: Readonly<Record<string, { melodyFrom: number }>>;
}

/** Where a line is drawn: between the row of `melodyFrom − 1` and the row of `melodyFrom`. */
export function lineY(layout: PianoRollLayout, melodyFrom: number): number {
  return PIANO_ROLL_RULER + (layout.maxPitch - melodyFrom + 1) * layout.rowHeight;
}

/** The colour a note is drawn in: the role of its part (greyed and faint when the part is not used). */
export function noteColor(voice: AnalysisSessionVoice): string {
  return ROLE_COLOR[voiceRoleView(voice)];
}

/** How opaque a note is: muted / not soloed parts and unused parts are faint; weighted notes follow their weight. */
export function noteAlpha(
  voice: AnalysisSessionVoice,
  anySolo: boolean,
  selected: boolean,
  multiplier = 1,
): number {
  if (voice.muted || (anySolo && !voice.solo)) return 0.25;
  const base = voiceRoleView(voice) === "off" ? 0.45 : selected ? 1 : 0.88;
  return base * Math.min(1, Math.max(0.2, multiplier));
}

export function drawPianoRoll(
  context: CanvasRenderingContext2D,
  width: number,
  layout: PianoRollLayout,
  options: PianoRollDrawOptions,
  hitAreasRef: { current: NoteHitArea[] },
) {
  const { session, selectedVoiceId, pixelsPerBeat, viewportStartBeat, multipliers, splits } = options;
  const { minPitch, maxPitch, rowHeight, contentHeight } = layout;
  const gutter = PIANO_ROLL_GUTTER;
  const ruler = PIANO_ROLL_RULER;
  const noteWidth = width - gutter;
  const endBeat = viewportStartBeat + noteWidth / pixelsPerBeat;
  const master = session.sources.find((source) => source.id === session.masterSourceId)
    ?? session.sources[0];
  const meter = master?.timeSignatures[0];
  const beatsPerBar = meter ? meter.numerator * 4 / meter.denominator : 4;
  const voiceById = new Map(session.voices.map((voice) => [voice.id, voice]));
  const anySolo = session.voices.some((voice) => voice.solo);

  context.clearRect(0, 0, width, contentHeight);
  context.fillStyle = "#0a111b";
  context.fillRect(0, 0, width, contentHeight);
  context.fillStyle = "#111a27";
  context.fillRect(0, ruler, gutter, contentHeight - ruler);
  context.font = "10px system-ui";
  context.textAlign = "right";
  context.textBaseline = "middle";

  for (let pitch = minPitch; pitch <= maxPitch; pitch += 1) {
    const y = ruler + (maxPitch - pitch) * rowHeight;
    const pitchClass = pitch % 12;
    context.fillStyle = [1, 3, 6, 8, 10].includes(pitchClass) ? "#0d1521" : "#101b29";
    context.fillRect(gutter, y, noteWidth, rowHeight);
    if (pitchClass === 0) {
      context.fillStyle = "#8da2bd";
      context.fillText(`C${Math.floor(pitch / 12) - 1}`, gutter - 5, y + rowHeight / 2);
    }
  }

  context.textAlign = "left";
  context.textBaseline = "middle";
  for (let beat = Math.floor(viewportStartBeat); beat <= endBeat; beat += 1) {
    const x = gutter + (beat - viewportStartBeat) * pixelsPerBeat;
    if (x < gutter) continue;
    const isBar = Math.abs(beat / beatsPerBar - Math.round(beat / beatsPerBar)) < 1e-6;
    context.strokeStyle = isBar ? "#50627a" : "#26364a";
    context.lineWidth = isBar ? 1.2 : 0.5;
    context.beginPath();
    context.moveTo(x, ruler);
    context.lineTo(x, contentHeight);
    context.stroke();
    if (isBar) {
      context.fillStyle = "#a8b8cc";
      context.fillText(String(Math.round(beat / beatsPerBar) + 1), x + 4, ruler / 2);
    }
  }

  const hitAreas: NoteHitArea[] = [];
  const selectedNotes: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const note of visibleNotes(session)) {
    if (note.startBeat + note.durationBeats < viewportStartBeat || note.startBeat > endBeat) continue;
    const voice = voiceById.get(note.voiceId);
    if (!voice) continue;
    const x = gutter + (note.startBeat - viewportStartBeat) * pixelsPerBeat;
    const y = ruler + (maxPitch - note.pitch) * rowHeight + 1;
    const clippedX = Math.max(gutter, x);
    const clippedEnd = Math.min(width, x + note.durationBeats * pixelsPerBeat);
    const rectWidth = Math.max(2, clippedEnd - clippedX);
    const rectHeight = Math.max(2, rowHeight - 2);
    const selected = note.voiceId === selectedVoiceId;
    const split = splits?.[note.voiceId];
    const aboveLine = split !== undefined && note.pitch >= split.melodyFrom;
    // Notes above a line are not analysed; they are drawn as melody (the colour says how they are treated).
    context.globalAlpha = aboveLine
      ? (selected ? 0.95 : 0.8)
      : noteAlpha(voice, anySolo, selected, multipliers?.get(note));
    context.fillStyle = aboveLine ? ROLE_COLOR.melody : noteColor(voice);
    context.fillRect(clippedX, y, rectWidth, rectHeight);
    if (selected) selectedNotes.push({ x: clippedX, y, w: rectWidth, h: rectHeight });
    hitAreas.push({ voiceId: note.voiceId, x: clippedX, y, width: rectWidth, height: rectHeight });
  }
  // The selected part is outlined, so it can be found without dimming the others.
  context.globalAlpha = 1;
  context.strokeStyle = "#ffffff";
  context.lineWidth = 1;
  for (const rect of selectedNotes) context.strokeRect(rect.x, rect.y, rect.w, rect.h);

  // Lines (dashed). The selected part's line carries its pitch name.
  for (const [partId, split] of Object.entries(splits ?? {})) {
    if (split.melodyFrom < minPitch || split.melodyFrom > maxPitch + 1) continue;
    const y = lineY(layout, split.melodyFrom);
    const isSelected = partId === selectedVoiceId;
    context.strokeStyle = ROLE_COLOR.melody;
    context.lineWidth = isSelected ? 1.8 : 1;
    context.setLineDash?.([6, 5]);
    context.beginPath();
    context.moveTo(gutter, y);
    context.lineTo(width, y);
    context.stroke();
    context.setLineDash?.([]);
    if (isSelected) {
      const label = `⇕ メロディとの境目 ${pitchName(split.melodyFrom)}`;
      context.fillStyle = "#0b1118";
      context.fillRect(gutter + 6, y - 20, 150, 18);
      context.strokeStyle = ROLE_COLOR.melody;
      context.lineWidth = 1;
      context.strokeRect(gutter + 6, y - 20, 150, 18);
      context.fillStyle = ROLE_COLOR.melody;
      context.textAlign = "left";
      context.fillText(label, gutter + 12, y - 11);
    }
  }

  hitAreasRef.current = hitAreas;
}

export interface PlaybackOverlayOptions {
  voiceById: ReadonlyMap<string, AnalysisSessionVoice>;
  /** Ids of the files that are shown. */
  shownSources: ReadonlySet<string>;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  beat: number;
  /** The notes that sound now (empty when stopped). */
  sounding: readonly PreAnalysisNote[];
  splits?: Readonly<Record<string, { melodyFrom: number }>>;
}

/**
 * The upper layer: what moves while playing. The playhead (the accent colour), the notes that sound lit
 * (their role colour, brighter, with a white edge), and the rows of the key column they are on.
 * Returns how many notes were lit. Draws nothing of the grid or the notes: that is the lower layer.
 */
export function drawPlaybackOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  layout: PianoRollLayout,
  options: PlaybackOverlayOptions,
): number {
  const { voiceById, shownSources, pixelsPerBeat, viewportStartBeat, beat, sounding, splits } = options;
  const { minPitch, maxPitch, rowHeight, contentHeight } = layout;
  const gutter = PIANO_ROLL_GUTTER;
  const endBeat = viewportStartBeat + (width - gutter) / pixelsPerBeat;
  context.clearRect(0, 0, width, contentHeight);

  let lit = 0;
  const keys = new Map<number, string>();
  for (const note of sounding) {
    const voice = voiceById.get(note.voiceId);
    if (!voice) continue;
    const color = litColor(note, voice, splits);
    if (note.pitch >= minPitch && note.pitch <= maxPitch) keys.set(note.pitch, color);
    // A note of a hidden part is heard but not drawn: nothing to light.
    if (!voice.visible || !shownSources.has(note.sourceId)) continue;
    if (note.startBeat + note.durationBeats < viewportStartBeat || note.startBeat > endBeat) continue;
    const rect = noteRect(note, layout, width, viewportStartBeat, pixelsPerBeat);
    context.globalAlpha = 1;
    context.fillStyle = color;
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
    context.globalAlpha = 0.4;
    context.fillStyle = "#ffffff";
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
    context.globalAlpha = 1;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.5;
    context.strokeRect(rect.x, rect.y, rect.w, rect.h);
    lit += 1;
  }
  // The key column: the rows that sound, in the colour of the role.
  context.globalAlpha = 1;
  for (const [pitch, color] of keys) {
    const y = PIANO_ROLL_RULER + (maxPitch - pitch) * rowHeight;
    context.fillStyle = color;
    context.fillRect(0, y, gutter, rowHeight);
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    context.strokeRect(0.5, y + 0.5, gutter - 1, Math.max(1, rowHeight - 1));
  }

  if (beat >= viewportStartBeat && beat <= endBeat) {
    const x = gutter + (beat - viewportStartBeat) * pixelsPerBeat;
    context.strokeStyle = PLAYHEAD_COLOR;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, contentHeight);
    context.stroke();
  }
  return lit;
}

/** Where a note is drawn (the lower layer and the lit note use the same rectangle). */
function noteRect(
  note: PreAnalysisNote,
  layout: PianoRollLayout,
  width: number,
  viewportStartBeat: number,
  pixelsPerBeat: number,
): { x: number; y: number; w: number; h: number } {
  const x = PIANO_ROLL_GUTTER + (note.startBeat - viewportStartBeat) * pixelsPerBeat;
  const y = PIANO_ROLL_RULER + (layout.maxPitch - note.pitch) * layout.rowHeight + 1;
  const clippedX = Math.max(PIANO_ROLL_GUTTER, x);
  const clippedEnd = Math.min(width, x + note.durationBeats * pixelsPerBeat);
  return { x: clippedX, y, w: Math.max(2, clippedEnd - clippedX), h: Math.max(2, layout.rowHeight - 2) };
}

/** The colour a note is drawn in: its part’s role, or melody above a line. */
function litColor(
  note: PreAnalysisNote,
  voice: AnalysisSessionVoice,
  splits: Readonly<Record<string, { melodyFrom: number }>> | undefined,
): string {
  const split = splits?.[note.voiceId];
  return split !== undefined && note.pitch >= split.melodyFrom ? ROLE_COLOR.melody : noteColor(voice);
}

/** Notes of the files and parts that are shown (every part is drawn; the unused ones are faint). */
export function visibleNotes(session: AnalysisSession): PreAnalysisNote[] {
  const voices = new Map(session.voices.map((voice) => [voice.id, voice]));
  const sources = new Map(session.sources.map((source) => [source.id, source]));
  return session.notes.filter((note) =>
    voices.get(note.voiceId)?.visible && sources.get(note.sourceId)?.visible);
}

export function sessionDuration(session: AnalysisSession): number {
  return Math.max(1, ...session.sources.map((source) => source.durationBeats));
}

export function pitchName(pitch: number): string {
  const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
