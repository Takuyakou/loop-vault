import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { PreviewSound } from "../../audio/chordPreview";
import { samePlaybackSource, type PlaybackController, type PlayingSource } from "../../audio/playbackController";
import type { CorrectionCard, CorrectionModel, CorrectionNote } from "../../domain/correction/correctionModel";
import { noteLabel, notesByCard } from "../../domain/correction/correctionModel";
import {
  addNote,
  cardNoteIds,
  chordRegisterPitch,
  deleteNotes,
  movePitch,
  pitchIds,
  restoreNotes,
  sameShortPitchIds,
  type EditResult,
} from "../../domain/correction/edits";
import { commitEdit, editCount, lastEditLabel, redo, startHistory, undo, type CorrectionHistory } from "../../domain/correction/history";
import { beatsPerBar as beatsPerBarFor } from "../../domain/midi/timing";
import type { ChordTimelineItem } from "../../domain/types";
import { createTimelineVoicingPlaybackPlan, resolveTimelineItemVoicing } from "../../domain/voicing";
import { usePlaybackState } from "../../hooks/usePlaybackState";
import { preferredScrollBehavior } from "../../ui/motion";
import { CorrectionInspector } from "./CorrectionInspector";
import { PianoRoll, ROW_PX } from "./PianoRoll";
import { cardLabel, cardSize, followScrollLeft, overlaps, visibleBeatRange, zoomScrollLeft } from "./workspaceGeometry";

/**
 * The correction workspace (spec v2.3): display (P10.0-02), note editing with one
 * undo history (P10.0-03). Only the visible beats are drawn. Saving still happens
 * on the current screen until P10.0-06.
 */

type Zoom = "all" | "16" | "4" | "custom";
type Mode = "check" | "edit";

export interface CorrectionWorkspaceProps {
  model: CorrectionModel;
  timeline: readonly ChordTimelineItem[];
  fileName: string;
  analysisTargetLabel?: string;
  previewSound: PreviewSound;
  controller: PlaybackController;
  /** The capture full-timeline source, shared with the current screen. */
  fullSource: PlayingSource;
  onPlaybackError: (error: unknown) => void;
  onUseCurrentScreen: () => void;
  onChooseAnotherMidi: () => void;
  onPartSettings?: () => void;
}

export function CorrectionWorkspace(props: CorrectionWorkspaceProps) {
  const { timeline, controller, previewSound, fullSource, onPlaybackError } = props;
  const [history, setHistory] = useState<CorrectionHistory>(() => startHistory(props.model));
  const [preview, setPreview] = useState<CorrectionModel>();
  const present = history.present;
  const shown = preview ?? present;
  const meter = beatsPerBarFor(present.timeSignature);
  const totalBars = Math.round(present.totalBeats / meter);
  const reviewCards = useMemo(() => present.cards.filter((card) => card.reviewReasons.length > 0), [present.cards]);
  const [selectedId, setSelectedId] = useState(() => (reviewCards[0] ?? present.cards[0])?.id);
  const [selectedNotes, setSelectedNotes] = useState<ReadonlySet<string>>(() => new Set());
  const [mode, setMode] = useState<Mode>("check");
  const [melodyLine, setMelodyLine] = useState<number>();
  const [notice, setNotice] = useState<string>();
  const [zoom, setZoom] = useState<Zoom>(() => totalBars <= 16 ? "all" : "16");
  const [customPx, setCustomPx] = useState(24);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [follow, setFollow] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [suggestionClosed, setSuggestionClosed] = useState(false);
  const [segmentsOpen, setSegmentsOpen] = useState(() => typeof window === "undefined" || !window.matchMedia?.("(max-width: 959px)").matches);
  const [panelOpen, setPanelOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const playback = usePlaybackState(controller);
  const [, tick] = useState(0);

  const minPx = viewportWidth > 0 ? viewportWidth / Math.max(meter, present.totalBeats) : 8;
  const maxPx = viewportWidth > 0 ? viewportWidth / 8 : 60;
  const pxPerBeat = Math.min(maxPx, Math.max(minPx, zoom === "all" ? minPx
    : zoom === "16" ? viewportWidth / (16 * meter)
      : zoom === "4" ? viewportWidth / (4 * meter)
        : customPx)) || 8;
  const canvasWidth = Math.max(viewportWidth, present.totalBeats * pxPerBeat);
  const { low, high } = present.pitchRange;
  const rollHeight = (high - low + 1) * ROW_PX;
  const selected = present.cards.find((card) => card.id === selectedId) ?? present.cards[0];
  const byCard = useMemo(() => notesByCard(shown.notes), [shown.notes]);
  const warnNoteIds = useMemo(() => new Set(present.cards.flatMap((card) => card.reviewReasons.flatMap((reason) => reason.noteIds))), [present.cards]);
  const range = visibleBeatRange(scrollLeft, viewportWidth, pxPerBeat, present.totalBeats);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const update = () => setViewportWidth(element.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // ---- editing ---------------------------------------------------------------------------
  const apply = useCallback((result: EditResult) => {
    setNotice(result.message);
    if (!result.changed) return;
    setHistory((current) => commitEdit(current, result));
  }, []);
  const edit = useCallback((run: (model: CorrectionModel) => EditResult) => {
    const result = run(history.present);
    apply(result);
    return result;
  }, [apply, history.present]);
  const selectNotes = useCallback((ids: string[], how: "replace" | "add" | "toggle") => {
    setSelectedNotes((current) => {
      if (how === "replace") return new Set(ids);
      const next = new Set(current);
      for (const id of ids) {
        if (how === "toggle" && next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  // ---- playback --------------------------------------------------------------------------
  const fullPlan = useMemo(() => createTimelineVoicingPlaybackPlan(timeline, "capture-full"), [timeline]);
  const songPlaying = playback.status !== "idle" && samePlaybackSource(playback.source, fullSource);
  useEffect(() => {
    if (!songPlaying || playback.status !== "playing") return undefined;
    const interval = window.setInterval(() => tick((value) => value + 1), 100);
    return () => window.clearInterval(interval);
  }, [playback.status, songPlaying]);
  const firstBeat = present.cards[0]?.start ?? 0;
  const playheadBeat = songPlaying && playback.status === "playing" && playback.startedAt !== undefined
    ? firstBeat + Math.max(0, (performance.now() - playback.startedAt) / 1000) * (present.bpm ?? 96) / 60
    : undefined;

  const scrollToBeat = useCallback((beat: number, align: "center" | "left" = "center") => {
    const element = scrollRef.current;
    if (!element) return;
    const target = beat * pxPerBeat - (align === "center" ? element.clientWidth / 2 : element.clientWidth * 0.2);
    if (element.scrollTo) element.scrollTo({ left: Math.max(0, target), behavior: preferredScrollBehavior() });
    else element.scrollLeft = Math.max(0, target);
  }, [pxPerBeat]);

  useEffect(() => {
    if (!follow || playheadBeat === undefined || !scrollRef.current) return;
    const next = followScrollLeft(playheadBeat, scrollRef.current.scrollLeft, scrollRef.current.clientWidth, pxPerBeat);
    if (next !== undefined) scrollRef.current.scrollLeft = next;
  });

  const selectCard = useCallback((card: CorrectionCard | undefined, reveal = true) => {
    if (!card) return;
    setSelectedId(card.id);
    const element = scrollRef.current;
    if (!reveal || !element) return;
    const left = card.start * pxPerBeat;
    const right = (card.start + card.duration) * pxPerBeat;
    if (left < element.scrollLeft || right > element.scrollLeft + element.clientWidth) scrollToBeat(card.start + card.duration / 2);
  }, [pxPerBeat, scrollToBeat]);

  const selectedIndex = present.cards.findIndex((card) => card.id === selected?.id);
  const reviewIndex = reviewCards.findIndex((card) => card.id === selected?.id);
  const nextReview = useCallback((direction: 1 | -1) => {
    if (!reviewCards.length) return;
    const from = selected?.start ?? -1;
    const next = direction === 1
      ? reviewCards.find((card) => card.start > from) ?? reviewCards[0]
      : [...reviewCards].reverse().find((card) => card.start < from) ?? reviewCards[reviewCards.length - 1];
    selectCard(next);
  }, [reviewCards, selectCard, selected?.start]);

  const toggleSong = useCallback(() => {
    void controller.toggle(fullSource, {
      type: "timeline",
      timeline: fullPlan.timeline,
      bpm: present.bpm,
      sound: previewSound,
      beatsPerBar: meter,
      explicitMidiNotesByEventId: fullPlan.explicitMidiNotesByEventId,
    }).catch(onPlaybackError);
  }, [controller, fullPlan, fullSource, meter, present.bpm, onPlaybackError, previewSound]);

  const sourceId = (kind: string, card: CorrectionCard): PlayingSource => ({ kind: "capture", id: `${fullSource.id}:workspace-${kind}:${card.id}` });
  const playNotes = useCallback((kind: string, card: CorrectionCard, notes: readonly number[]) => {
    void controller.toggle(sourceId(kind, card), { type: "chord", chord: card.name, sound: previewSound, explicitMidiNotes: [...notes] })
      .catch(onPlaybackError);
  }, [controller, fullSource.id, onPlaybackError, previewSound]);
  const cardNotesOf = (card: CorrectionCard) => byCard.get(card.id) ?? [];
  const playCard = useCallback((kind: "source" | "card") => {
    if (!selected) return;
    const mine = present.notes.filter((note) => note.cardId === selected.id);
    const notes = kind === "source"
      ? [...new Set(mine.filter((note) => note.provenance === "SOURCE").map((note) => note.originalPitch ?? note.pitch))].sort((a, b) => a - b)
      : selected.edited
        ? [...new Set(mine.filter((note) => note.used).map((note) => note.pitch))].sort((a, b) => a - b)
        : resolveTimelineItemVoicing(timeline[selected.timelineIndex]!).midiNotes;
    playNotes(kind, selected, notes);
  }, [playNotes, present.notes, selected, timeline]);
  const cardPlaying = selected && playback.status !== "idle"
    ? samePlaybackSource(playback.source, sourceId("source", selected)) ? "source"
      : samePlaybackSource(playback.source, sourceId("card", selected)) ? "card" : null
    : null;

  const enterEdit = useCallback(() => {
    setMode("edit");
    if (selected) {
      const top = Math.max(...present.notes.filter((note) => note.cardId === selected.id).map((note) => note.pitch), low);
      setMelodyLine(top - 1);
    }
  }, [low, present.notes, selected]);

  // ---- keys (spec 7.2–7.5) ---------------------------------------------------------------
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.metaKey || isEditable(event.target)) return;
      const key = event.key;
      const handled = () => event.preventDefault();
      const ids = [...selectedNotes];
      if (event.ctrlKey) {
        const lower = key.toLowerCase();
        if (lower === "z" && !event.shiftKey) { handled(); setHistory(undo); setPreview(undefined); }
        else if ((lower === "z" && event.shiftKey) || lower === "y") { handled(); setHistory(redo); setPreview(undefined); }
        else if (lower === "a" && selected) { handled(); selectNotes(cardNoteIds(present, selected.id), "replace"); }
        else if ((key === "ArrowUp" || key === "ArrowDown") && ids.length) { handled(); edit((model) => movePitch(model, ids, key === "ArrowUp" ? 12 : -12)); }
        return;
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        if (!ids.length) return;
        handled();
        edit((model) => movePitch(model, ids, key === "ArrowUp" ? 1 : -1));
      } else if (key === "ArrowRight") { handled(); selectCard(present.cards[Math.min(present.cards.length - 1, selectedIndex + 1)]); }
      else if (key === "ArrowLeft") { handled(); selectCard(present.cards[Math.max(0, selectedIndex - 1)]); }
      else if (key === "]") { handled(); nextReview(1); }
      else if (key === "[") { handled(); nextReview(-1); }
      else if (key === " ") { handled(); toggleSong(); }
      else if (key === "f" || key === "F") { handled(); setFollow((value) => !value); }
      else if (key === "Home") { handled(); selectCard(present.cards[0]); }
      else if (key === "End") { handled(); selectCard(present.cards[present.cards.length - 1]); }
      else if (key === "?") { handled(); setHelpOpen((value) => !value); }
      else if ((key === "Delete" || key === "Backspace") && ids.length) { handled(); edit((model) => deleteNotes(model, ids)); }
      else if ((key === "r" || key === "R") && ids.length) { handled(); edit((model) => restoreNotes(model, ids)); }
      else if (key === "n" || key === "N") { handled(); enterEdit(); }
      else if (key === "a" || key === "A") { handled(); playCard("source"); }
      else if (key === "b" || key === "B") { handled(); playCard("card"); }
      else if (key === "Enter") { handled(); setMode("check"); setSelectedNotes(new Set()); }
      else if (key === "Escape") {
        if (helpOpen) { handled(); setHelpOpen(false); }
        else if (ids.length) { handled(); setSelectedNotes(new Set()); }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [edit, enterEdit, helpOpen, nextReview, playCard, present, selectCard, selectNotes, selected, selectedIndex, selectedNotes, toggleSong]);

  // Ctrl + wheel zooms around the pointer (a native listener, so preventDefault works).
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const pointerX = event.clientX - box.left;
      const beat = (element.scrollLeft + pointerX) / pxPerBeat;
      const next = Math.min(maxPx, Math.max(minPx, pxPerBeat * (event.deltaY < 0 ? 1.25 : 0.8)));
      setZoom("custom");
      setCustomPx(next);
      requestAnimationFrame(() => { element.scrollLeft = zoomScrollLeft(beat, pointerX, next); });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [maxPx, minPx, pxPerBeat]);

  const overviewRef = useRef<HTMLDivElement>(null);
  const moveFromOverview = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = overviewRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    scrollToBeat(((event.clientX - box.left) / box.width) * present.totalBeats);
  };

  const melodySuggestion = present.suggestions.find((entry) => entry.kind === "melody-voice");
  const suggestion = suggestionClosed ? undefined : melodySuggestion;
  const barStep = pxPerBeat * meter < 18 ? 8 : pxPerBeat * meter < 36 ? 4 : 1;
  const viewStart = scrollLeft / pxPerBeat;
  const viewEnd = (scrollLeft + viewportWidth) / pxPerBeat;
  const cardAt = (beat: number) => present.cards.find((card) => beat >= card.start && beat < card.start + card.duration);
  const position = (() => {
    const beat = playheadBeat ?? selected?.start ?? 0;
    const card = cardAt(beat);
    return card ? `${card.bar}.${card.beat}` : `${Math.floor(beat / meter) + 1}.1`;
  })();
  const count = editCount(history);
  const last = lastEditLabel(history);
  const barNumbers = Array.from({ length: totalBars }, (_, index) => index + 1)
    .filter((bar) => (bar - 1) % barStep === 0 && overlaps((bar - 1) * meter, meter * barStep, range));

  return (
    <section className="lv-cw" data-testid="correction-workspace" data-mode={mode} aria-label="修正作業場（試作）">
      <div className="lv-cw-file">
        <span className="lv-cw-file-name">{props.fileName}</span>
        <span className="lv-cw-file-meta">
          {totalBars}小節・{present.bpm ? `${Math.round(present.bpm)}BPM` : "BPM なし"}・{present.timeSignature ?? "4/4"}
          {props.analysisTargetLabel ? `・${props.analysisTargetLabel}` : ""}
        </span>
        <span className="lv-cw-spacer" />
        <button type="button" className="lv-cw-stat" data-kind="warn" onClick={() => nextReview(1)} disabled={!reviewCards.length} data-testid="correction-review-count">
          要確認 <b>{reviewCards.length}</b>
        </button>
        <span className="lv-cw-stat" data-testid="correction-edit-count">直した回数 <b>{count}</b></span>
        {props.onPartSettings ? <button type="button" className="lv-cw-btn" onClick={props.onPartSettings}>パートの設定</button> : null}
        <button type="button" className="lv-cw-btn" onClick={props.onChooseAnotherMidi}>別の MIDI</button>
        <button type="button" className="lv-cw-btn" data-kind="accent" onClick={props.onUseCurrentScreen} data-testid="correction-use-current-screen">今の画面で保存する</button>
      </div>

      {suggestion?.kind === "melody-voice" ? (
        <div className="lv-cw-suggestion" role="status" data-testid="correction-suggestion">
          <span>メロディの Voice（{suggestion.voiceLabel}）の音が {suggestion.cardCount} 枚のカードに入っています。まとめて選んで、外すかどうかを決められます（外すのは <kbd>Delete</kbd> か右の欄）。</span>
          <span className="lv-cw-actions">
            <button type="button" className="lv-cw-btn" data-kind="accent" onClick={() => selectNotes(suggestion.noteIds, "replace")} data-testid="correction-select-melody">まとめて選ぶ（{suggestion.noteIds.length}）</button>
            <button type="button" className="lv-cw-btn" onClick={() => setSuggestionClosed(true)}>閉じる</button>
          </span>
        </div>
      ) : null}

      <div className="lv-cw-work">
        <div className="lv-cw-timeline">
          <div className="lv-cw-overview-row">
            <span className="lv-cw-label">曲全体</span>
            <div
              ref={overviewRef}
              className="lv-cw-overview"
              data-testid="correction-overview"
              onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); moveFromOverview(event); }}
              onPointerMove={(event) => { if (event.buttons === 1) moveFromOverview(event); }}
            >
              {present.segments.map((segment, index) => (
                <span key={segment.id} className="lv-cw-ov-seg" data-alt={index % 2 === 1 || undefined}
                  style={{ left: pct((segment.startBar - 1) * meter, present.totalBeats), width: pct((segment.endBar - segment.startBar + 1) * meter, present.totalBeats) }}>
                  <span className="lv-cw-ov-seg-name">{segment.label}</span>
                </span>
              ))}
              {present.cards.map((card) => (
                <span key={card.id} className="lv-cw-ov-card" style={{ left: pct(card.start, present.totalBeats), width: pct(card.duration, present.totalBeats) }} />
              ))}
              {reviewCards.map((card) => (
                <span key={card.id} className="lv-cw-ov-mark" style={{ left: pct(card.start + card.duration / 2, present.totalBeats) }} />
              ))}
              <span className="lv-cw-ov-view" style={{ left: pct(viewStart, present.totalBeats), width: pct(Math.min(present.totalBeats, viewEnd) - viewStart, present.totalBeats) }} />
              {playheadBeat !== undefined ? <span className="lv-cw-ov-ph" style={{ left: pct(playheadBeat, present.totalBeats) }} /> : null}
            </div>
          </div>

          <div className="lv-cw-tools">
            <span className="lv-cw-tools-label">表示</span>
            {([["all", "全体"], ["16", "16小節"], ["4", "4小節"]] as const).map(([value, label]) => (
              <button key={value} type="button" className="lv-cw-btn" aria-pressed={zoom === value} onClick={() => setZoom(value)}>{label}</button>
            ))}
            <span className="lv-cw-sep" />
            <button type="button" className="lv-cw-btn" onClick={() => nextReview(-1)} disabled={!reviewCards.length} aria-label="前の要確認">◀ 前の要確認</button>
            <span className="lv-cw-nav-count" data-testid="correction-review-position">{reviewIndex >= 0 ? reviewIndex + 1 : "–"} / {reviewCards.length}</span>
            <button type="button" className="lv-cw-btn" onClick={() => nextReview(1)} disabled={!reviewCards.length} aria-label="次の要確認">次の要確認 ▶</button>
            <span className="lv-cw-sep" />
            <button type="button" className="lv-cw-btn" aria-pressed={mode === "edit"} onClick={() => mode === "edit" ? setMode("check") : enterEdit()} data-testid="correction-mode-edit">
              {mode === "edit" ? "② 音を直す（Enter で戻る）" : "① 確かめる（N で音を直す）"}
            </button>
          </div>

          <div className="lv-cw-body">
            <div className="lv-cw-left">
              <span className="lv-cw-label" style={{ height: 26 }}>小節</span>
              <button type="button" className="lv-cw-label lv-cw-seg-toggle" style={{ height: segmentsOpen ? 30 : 20 }} aria-expanded={segmentsOpen} onClick={() => setSegmentsOpen((value) => !value)}>区切り</button>
              <span className="lv-cw-label" style={{ height: 98 }}>コード</span>
              <div className="lv-cw-keys" style={{ height: rollHeight }}>
                {Array.from({ length: high - low + 1 }, (_, index) => {
                  const pitch = high - index;
                  const black = [1, 3, 6, 8, 10].includes(pitch % 12);
                  return (
                    <button
                      key={pitch}
                      type="button"
                      tabIndex={-1}
                      className="lv-cw-key"
                      data-black={black || undefined}
                      aria-label={`${noteLabel(pitch)} を鳴らす（Ctrl で曲全体のこの高さを選ぶ）`}
                      style={{ top: index * ROW_PX, height: ROW_PX }}
                      onClick={(event) => {
                        if (event.ctrlKey || event.metaKey) selectNotes(pitchIds(present, pitch), event.shiftKey ? "add" : "replace");
                        else if (selected) playNotes("key", selected, [pitch]);
                      }}
                    >
                      {pitch % 12 === 0 ? <span className="lv-cw-oct">{noteLabel(pitch)}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div ref={scrollRef} className="lv-cw-scroll" data-testid="correction-timeline-scroll" onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}>
              <div className="lv-cw-canvas" style={{ width: canvasWidth, "--lv-cw-beat": `${pxPerBeat}px`, "--lv-cw-bar": `${pxPerBeat * meter}px` } as CSSProperties}>
                <div className="lv-cw-ruler">
                  {barNumbers.map((bar) => (
                    <span key={bar} className="lv-cw-bar-no" style={{ left: (bar - 1) * meter * pxPerBeat }}>{bar}</span>
                  ))}
                </div>
                <div className="lv-cw-segments" data-open={segmentsOpen || undefined}>
                  {segmentsOpen ? present.segments.map((segment) => {
                    const width = (segment.endBar - segment.startBar + 1) * meter * pxPerBeat - 2;
                    return (
                      <span key={segment.id} className="lv-cw-segment" data-testid="correction-segment"
                        style={{ left: (segment.startBar - 1) * meter * pxPerBeat + 1, width }}>
                        {segment.label}{segment.repeatCount ? (width < 140 ? ` ×${segment.repeatCount}` : ` · ${segment.repeatCount}回出てくる`) : ""}
                      </span>
                    );
                  }) : null}
                </div>
                <div className="lv-cw-cards">
                  {shown.cards.filter((card) => overlaps(card.start, card.duration, range)).map((card) => {
                    const width = card.duration * pxPerBeat - 2;
                    const size = cardSize(width);
                    const review = card.reviewReasons.length > 0;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        className="lv-cw-card"
                        data-size={size === "full" ? undefined : size}
                        data-review={review || undefined}
                        data-edited={card.edited || undefined}
                        data-testid="correction-card"
                        aria-pressed={card.id === selected?.id}
                        aria-label={`${card.bar}小節${card.beat}拍 ${card.name.label}${review ? "（要確認）" : ""}`}
                        title={card.name.label}
                        style={{ left: card.start * pxPerBeat + 1, width: Math.max(2, width) }}
                        onClick={() => selectCard(card, false)}
                      >
                        <span className="lv-cw-card-name" data-full-name={card.name.label}>{cardLabel(card.name.label, width)}</span>
                        <span className="lv-cw-card-sub">
                          {review ? <span className="lv-cw-flag" aria-hidden="true" /> : null}
                          <span>{formatBeats(card.duration)}拍</span>
                          {card.attacks > 1 ? <span className="lv-cw-x">×{card.attacks}</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <PianoRoll
                  present={present}
                  shown={shown}
                  range={range}
                  pxPerBeat={pxPerBeat}
                  low={low}
                  high={high}
                  mode={mode}
                  {...(selected ? { selectedCard: selected } : {})}
                  selectedNoteIds={selectedNotes}
                  warnNoteIds={warnNoteIds}
                  {...(melodyLine !== undefined ? { melodyLine } : {})}
                  {...(playheadBeat !== undefined ? { playheadBeat } : {})}
                  onPreview={setPreview}
                  onCommit={apply}
                  onSelectNotes={selectNotes}
                  onSelectCard={(cardId) => setSelectedId(cardId)}
                  onPlayPitch={(pitch) => { if (selected) playNotes("note", selected, [pitch]); }}
                  onAdd={(cardId, pitch) => { setSelectedId(cardId); edit((model) => addNote(model, cardId, pitch)); }}
                  onMelodyLine={setMelodyLine}
                />
              </div>
            </div>
          </div>

          <div className="lv-cw-legend" aria-label="凡例">
            <span><i data-kind="harmony" />使っている和音の音</span>
            <span><i data-kind="bass" />使っているベース</span>
            <span><i data-kind="warn" />要確認の原因</span>
            <span><i data-kind="manual" />足した音</span>
            <span><i data-kind="moved" />高さを直した音</span>
            <span><i data-kind="melody" />メロディとして使っていない音</span>
            <span><i data-kind="off" />使っていない音（破線）</span>
          </div>

          <div className="lv-cw-transport">
            <button type="button" className="lv-cw-btn" data-kind="accent" aria-pressed={songPlaying} onClick={toggleSong} data-testid="correction-play-song">
              {songPlaying ? "■ 停止" : "▶ 再生"}
            </button>
            <button type="button" className="lv-cw-btn" aria-pressed={follow} onClick={() => setFollow((value) => !value)}>追従</button>
            <span className="lv-cw-time">{position} / {totalBars}小節</span>
            <button type="button" className="lv-cw-btn" onClick={() => setHistory(undo)} disabled={!count} aria-label="元に戻す（Ctrl+Z）">元に戻す</button>
            <button type="button" className="lv-cw-btn" onClick={() => setHistory(redo)} disabled={!history.future.length} aria-label="やり直す（Ctrl+Y）">やり直す</button>
            <span className="lv-cw-history" data-testid="correction-history">操作 {count}{last ? `・最後：${last}` : ""}</span>
            {notice ? <span className="lv-cw-notice" role="status" data-testid="correction-notice">{notice}</span> : null}
          </div>
        </div>

        <aside className="lv-cw-insp" data-open={panelOpen || undefined} aria-label="選んだカード">
          <button type="button" className="lv-cw-panel-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen((value) => !value)} data-testid="correction-panel-toggle">
            {selected ? `${selected.name.label}${selected.reviewReasons.length ? "・要確認" : ""}` : "カード"}（{panelOpen ? "閉じる" : "開く"}）
          </button>
          {selected ? (
            <CorrectionInspector
              card={selected}
              notes={cardNotesOf(selected)}
              playing={cardPlaying}
              onPlaySource={() => playCard("source")}
              onPlayCard={() => playCard("card")}
              onDelete={(ids) => edit((model) => deleteNotes(model, ids))}
              onRestore={(ids) => edit((model) => restoreNotes(model, ids))}
              onAddPitchClass={(pc) => edit((model) => addNote(model, selected.id, chordRegisterPitch(pc)))}
              onSelectShortSame={(noteId) => selectNotes(sameShortPitchIds(present, noteId), "replace")}
              shortSameCount={(noteId) => sameShortPitchIds(present, noteId).length}
              onEditNotes={enterEdit}
            />
          ) : <p className="lv-cw-muted">カードがありません。</p>}
        </aside>
      </div>

      <div className="lv-cw-keys-help">
        {mode === "edit" ? (
          <>
            <span>空いた所をクリック：足す</span>
            <span>右クリック・なぞる：外す</span>
            <span>上下ドラッグ・<kbd>↑</kbd><kbd>↓</kbd>：高さ</span>
            <span><kbd>Delete</kbd> 外す・消す</span>
            <span><kbd>R</kbd> 戻す</span>
            <span><kbd>Ctrl</kbd>＋ドラッグ 範囲で選ぶ</span>
            <span><kbd>Enter</kbd> 直し終わる</span>
            <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> 元に戻す</span>
          </>
        ) : (
          <>
            <span><kbd>←</kbd><kbd>→</kbd> 前後のカード</span>
            <span><kbd>[</kbd><kbd>]</kbd> 前後の要確認</span>
            <span><kbd>N</kbd> 音を直す</span>
            <span>右クリック：外す・ダブルクリック：足す</span>
            <span><kbd>A</kbd><kbd>B</kbd> 聴き比べ</span>
            <span><kbd>Space</kbd> 再生・停止</span>
            <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> 元に戻す</span>
            <span><kbd>?</kbd> ショートカット一覧</span>
          </>
        )}
      </div>

      {helpOpen ? <ShortcutSheet onClose={() => setHelpOpen(false)} /> : null}
    </section>
  );
}

function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["← →", "前後のカード"], ["[ ]", "前後の要確認"], ["Space", "曲全体の再生・停止"], ["F", "再生位置に追従する／しない"],
    ["Home End", "最初／最後のカード"], ["Ctrl＋ホイール", "マウスの位置を中心に拡大縮小"], ["N", "② 音を直す"], ["Enter", "直し終わる（①へ）"],
    ["右クリック・右ドラッグ", "元の音を外す／足した音を消す"], ["左クリック・ドラッグ（外した音）", "戻す"], ["空いた所", "①ダブルクリック／②クリックで足す"],
    ["上下ドラッグ・↑↓", "半音ずつ高さを直す"], ["Ctrl＋↑↓", "1オクターブ"], ["Delete", "外す・消す"], ["R", "戻す"],
    ["Ctrl＋A", "選んだカードの音を全部選ぶ"], ["Ctrl＋クリック（鍵盤）", "その高さの音を曲全体で選ぶ"], ["A B", "元の音／カードの音を鳴らす"],
    ["Ctrl＋Z", "元に戻す"], ["Ctrl＋Shift＋Z・Ctrl＋Y", "やり直す"], ["?", "この一覧"], ["Esc", "選択を外す・閉じる"],
  ];
  return (
    <div className="lv-cw-cheat" role="dialog" aria-modal="true" aria-label="ショートカット一覧" onClick={onClose}>
      <div className="lv-cw-cheat-box" onClick={(event) => event.stopPropagation()}>
        <h3>ショートカット</h3>
        <dl>{rows.map(([key, text]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{text}</dd></div>)}</dl>
        <button type="button" className="lv-cw-btn" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

function pct(value: number, total: number): string {
  return `${(Math.max(0, value) / Math.max(1, total)) * 100}%`;
}

function formatBeats(beats: number): string {
  return Number.isInteger(beats) ? String(beats) : beats.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function isEditable(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)));
}

export type { CorrectionNote };
