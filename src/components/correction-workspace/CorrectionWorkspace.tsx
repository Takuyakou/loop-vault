import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { PreviewSound } from "../../audio/chordPreview";
import { samePlaybackSource, type PlaybackController, type PlayingSource } from "../../audio/playbackController";
import { chooseName, markReviewed, mergeSameNotes, mergeWithNext, moveBoundary, positionLabel, sameFixTargets, sameNotesGroups, splitCard } from "../../domain/correction/cardEdits";
import type { CorrectionCard, CorrectionModel, CorrectionNote, NameSource } from "../../domain/correction/correctionModel";
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
  setTempo,
  effectiveTempo,
  TEMPO_MAX,
  TEMPO_MIN,
  type EditResult,
} from "../../domain/correction/edits";
import { commitEdit, editCount, editKindCounts, lastEditLabel, redo, startHistory, undo, type CorrectionHistory } from "../../domain/correction/history";
import { buildMetricsRecord, type CorrectionMetricsSession } from "../../domain/correction/metrics";
import { appendCorrectionMetrics } from "../../storage/correctionMetricsStorage";
import { registerClosePreparation } from "../../store/closePreparation";
import { nameCandidatesFor } from "../../domain/correction/nameCandidates";
import { beatsPerBar as beatsPerBarFor } from "../../domain/midi/timing";
import type { EditableChordSlot } from "../../domain/progressionEditing";
import type { ChordSymbol, ChordTimelineItem, ProgressionBlockCandidate } from "../../domain/types";
import type { SaveRange } from "../../domain/correction/saveCandidate";
import { registerCloseBlocker } from "../../store/closeBlocker";
import { createTimelineVoicingPlaybackPlan } from "../../domain/voicing";
import { cardAuditionNotes } from "../../domain/correction/saveCandidate";
import { usePlaybackState } from "../../hooks/usePlaybackState";
import { preferredScrollBehavior } from "../../ui/motion";
import { ConfirmDialog } from "../ConfirmDialog";
import { QuickChordEditor } from "../progression-editing/QuickChordEditor";
import { CorrectionInspector } from "./CorrectionInspector";
import { NoSaveRange, RecommendedRanges, rangeKey, WorkspaceSaveForm, type WorkspaceSaveActions } from "./WorkspaceSaveForm";
import { PianoRoll, ROW_PX } from "./PianoRoll";
import { cardLabel, cardSize, followScrollLeft, overlaps, playheadBeatAt, timelineFrom, visibleBeatRange, zoomScrollLeft } from "./workspaceGeometry";
import { getCardClickAudition, setCardClickAudition } from "../../storage/cardClickAuditionSettings";
import { UNSAVED_TITLE, unsavedMessage } from "./unsavedText";

/**
 * The correction workspace (spec v2.5 with the P10.1 overrides): display, note and card
 * editing with one undo history, saving. One control bar on top (P10.1 §1); the song
 * plays from the selected card, or from the start when none is selected (§2).
 * Only the visible beats are drawn.
 */

type Zoom = "all" | "16" | "8" | "4" | "custom";
type Mode = "check" | "edit";

export interface CorrectionWorkspaceProps {
  model: CorrectionModel;
  timeline: readonly ChordTimelineItem[];
  fileName: string;
  analysisTargetLabel?: string;
  /** 「標準モードで解析済み」「和声コアで解析済み」 (the old screen's header, now in the file bar). */
  analysisModeLabel?: string;
  previewSound: PreviewSound;
  controller: PlaybackController;
  /** The capture full-timeline source, shared with the current screen. */
  fullSource: PlayingSource;
  onPlaybackError: (error: unknown) => void;
  onChooseAnotherMidi: () => void;
  onPartSettings?: () => void;
  /** P10.0-06: saving from the workspace. */
  save: WorkspaceSaveActions;
  /** 「おすすめの範囲」 (analysis.result.blockCandidates). */
  blockCandidates: readonly ProgressionBlockCandidate[];
  /** Operations not yet saved (0 = nothing to lose); the leave guard and its text use it. */
  onDirtyChange?: (unsavedCount: number) => void;
  /** The MIDI has no tempo of its own (P10.1 §12.1). */
  tempoMissing?: boolean;
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
  // Local edit metrics (spec v2.5 §13): counts and times only, one row when this import's workspace goes away.
  const metricsRef = useRef<CorrectionMetricsSession>({
    startedAtMs: Date.now(),
    bars: Math.round(props.model.totalBeats / beatsPerBarFor(props.model.timeSignature)),
    cards: props.model.cards.length,
    reviewAtStart: props.model.cards.filter((card) => card.reviewReasons.length > 0).length,
    saves: [],
    undos: 0,
  });
  const historyRef = useRef(history);
  historyRef.current = history;
  const undoOnce = useCallback(() => {
    if (historyRef.current.past.length) metricsRef.current.undos += 1;
    setHistory(undo);
    setPreview(undefined);
  }, []);
  useEffect(() => {
    let written = false;
    const write = () => {
      if (written) return;
      written = true;
      const session = metricsRef.current;
      // ponytail: React StrictMode (dev) unmounts once right away; a session under 1s is not an import someone worked on.
      if (Date.now() - session.startedAtMs < 1000) return;
      const current = historyRef.current;
      void appendCorrectionMetrics(buildMetricsRecord(session, { ms: Date.now(), iso: new Date().toISOString() }, {
        reviewedCards: current.present.cards.filter((card) => card.reviewed).length,
        edits: editKindCounts(current),
      }));
    };
    const unregister = registerClosePreparation(write);
    return () => { unregister(); write(); };
  }, []);
  const [selectedId, setSelectedId] = useState<string>();
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
  const [closedSuggestions, setClosedSuggestions] = useState<ReadonlySet<string>>(() => new Set());
  const [confirm, setConfirm] = useState<"runs" | "same-fix">();
  const [nameEditor, setNameEditor] = useState<{ cardId: string; anchor: HTMLElement }>();
  const [rename, setRename] = useState<{ cardId: string; before: string }>();
  const [boundaryTip, setBoundaryTip] = useState<{ x: number; text: string }>();
  const boundaryDrag = useRef<{ leftId: string; pointerId: number; result?: EditResult }>();
  const [segmentsOpen, setSegmentsOpen] = useState(() => typeof window === "undefined" || !window.matchMedia?.("(max-width: 959px)").matches);
  const [panelOpen, setPanelOpen] = useState(false);
  const [saveRange, setSaveRange] = useState<SaveRange>();
  const [savedRanges, setSavedRanges] = useState<ReadonlySet<string>>(() => new Set());
  const [savedPresent, setSavedPresent] = useState<CorrectionModel>();
  const [savedCount, setSavedCount] = useState(0);
  const [pendingLeave, setPendingLeave] = useState<() => void>();
  const scrollRef = useRef<HTMLDivElement>(null);
  // P10.1 §6: the workspace takes focus back (no ring) after a mouse press and a shortcut.
  const rootRef = useRef<HTMLElement>(null);
  const pointerUsedRef = useRef(false);
  const playback = usePlaybackState(controller);
  const [clickAudition, setClickAudition] = useState(getCardClickAudition);

  const minPx = viewportWidth > 0 ? viewportWidth / Math.max(meter, present.totalBeats) : 8;
  const maxPx = viewportWidth > 0 ? viewportWidth / 8 : 60;
  const pxPerBeat = Math.min(maxPx, Math.max(minPx, zoom === "all" ? minPx
    : zoom === "16" ? viewportWidth / (16 * meter)
      : zoom === "8" ? viewportWidth / (8 * meter)
      : zoom === "4" ? viewportWidth / (4 * meter)
        : customPx)) || 8;
  const canvasWidth = Math.max(viewportWidth, present.totalBeats * pxPerBeat);
  const { low, high } = present.pitchRange;
  const rollHeight = (high - low + 1) * ROW_PX;
  const selected = selectedId === undefined ? undefined : present.cards.find((card) => card.id === selectedId);
  const editorCard = nameEditor ? present.cards.find((card) => card.id === nameEditor.cardId) : undefined;
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
    if (!result.changed) { setNotice(result.message); return; }
    const before = new Map(historyRef.current.present.cards.map((card) => [card.id, card.name.label]));
    const renamed = result.kind === "name" ? [] : result.model.cards.filter((card) => before.has(card.id) && before.get(card.id) !== card.name.label);
    setNotice(result.message ?? (renamed.length === 1 ? `名前を ${renamed[0]!.name.label} にしました（音から）` : renamed.length > 1 ? `${renamed.length}枚の名前を音から変えました` : undefined));
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
  const songPlaying = playback.status !== "idle" && samePlaybackSource(playback.source, fullSource);
  // Moving the view by hand (wheel, overview, keys) while the song plays stops following (spec 7.3).
  const playingRef = useRef(songPlaying);
  playingRef.current = songPlaying;
  const stopFollow = useCallback(() => { if (playingRef.current) setFollow(false); }, []);
  const songStartBeat = present.cards[0]?.start ?? 0;
  // The beat the current playback started from (the selected card's, or the song's start).
  const [playStartBeat, setPlayStartBeat] = useState(songStartBeat);
  // One tempo for the sound, the playhead and saving (P10.1 §12; 96 = the player's own default).
  const songBpm = effectiveTempo(present);
  const playheadRef = useRef<HTMLSpanElement>(null);
  const playTagRef = useRef<HTMLSpanElement>(null);
  const overviewPlayheadRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const followRef = useRef(follow);
  followRef.current = follow;

  const scrollToBeat = useCallback((beat: number, align: "center" | "left" = "center") => {
    const element = scrollRef.current;
    if (!element) return;
    const target = beat * pxPerBeat - (align === "center" ? element.clientWidth / 2 : element.clientWidth * 0.2);
    if (element.scrollTo) element.scrollTo({ left: Math.max(0, target), behavior: preferredScrollBehavior() });
    else element.scrollLeft = Math.max(0, target);
  }, [pxPerBeat]);


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

  /** P10.1 §2: from `fromBeat` (a card's start) to the end, or the whole song; following turns on (§4). */
  const playSong = useCallback((fromBeat: number | undefined, bpm = songBpm) => {
    const plan = createTimelineVoicingPlaybackPlan(timelineFrom(timeline, fromBeat, meter), "capture-full");
    setPlayStartBeat(fromBeat ?? songStartBeat);
    setFollow(true);
    void controller.play(fullSource, {
      type: "timeline",
      timeline: plan.timeline,
      bpm,
      sound: previewSound,
      beatsPerBar: meter,
      explicitMidiNotesByEventId: plan.explicitMidiNotesByEventId,
    }).catch(onPlaybackError);
  }, [controller, fullSource, meter, onPlaybackError, previewSound, songBpm, songStartBeat, timeline]);
  const toggleSong = useCallback(() => {
    if (playingRef.current) controller.stop();
    else playSong(selected?.start);
  }, [controller, playSong, selected?.start]);

  const sourceId = (kind: string, card: CorrectionCard): PlayingSource => ({ kind: "capture", id: `${fullSource.id}:workspace-${kind}:${card.id}` });
  const playNotes = useCallback((kind: string, card: CorrectionCard, notes: readonly number[]) => {
    void controller.toggle(sourceId(kind, card), { type: "chord", chord: card.name, sound: previewSound, explicitMidiNotes: [...notes] })
      .catch(onPlaybackError);
  }, [controller, fullSource.id, onPlaybackError, previewSound]);
  const auditionCard = (card: CorrectionCard) => {
    void controller.play(sourceId("card", card), { type: "chord", chord: card.name, sound: previewSound, explicitMidiNotes: cardAuditionNotes(present, card, timeline) })
      .catch(onPlaybackError);
  };
  const cardNotesOf = (card: CorrectionCard) => byCard.get(card.id) ?? [];
  const playCard = useCallback((kind: "source" | "card") => {
    if (!selected) return;
    const mine = present.notes.filter((note) => note.cardId === selected.id);
    const notes = kind === "source"
      ? [...new Set(mine.filter((note) => note.provenance === "SOURCE").map((note) => note.originalPitch ?? note.pitch))].sort((a, b) => a - b)
      : cardAuditionNotes(present, selected, timeline); // exactly what saving writes (P10.0-06)
    playNotes(kind, selected, notes);
  }, [playNotes, present, selected, timeline]);
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

  // ---- card edits (P10.0-04) -------------------------------------------------------------
  const pickName = useCallback((name: ChordSymbol, cardId: string, source: NameSource = "chosen") => {
    const before = present.cards.find((card) => card.id === cardId)?.name.label;
    const result = edit((model) => chooseName(model, cardId, name, source));
    if (result.changed && before) setRename({ cardId, before });
  }, [edit, present.cards]);
  const markAndNext = useCallback(() => {
    if (!selected) return;
    const result = edit((model) => markReviewed(model, selected.id));
    selectCard(result.model.cards.find((card) => card.start > selected.start && card.reviewReasons.length > 0));
  }, [edit, selectCard, selected]);
  const openNameEditor = useCallback((cardId: string) => {
    const anchor = scrollRef.current?.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`);
    if (anchor) setNameEditor({ cardId, anchor });
  }, []);
  const askMergeRuns = useCallback(() => {
    if (sameNotesGroups(present).length) setConfirm("runs");
    else setNotice("同じ音が続く所はありません");
  }, [present]);
  const sameFix = useMemo(
    () => rename && selected && rename.cardId === selected.id ? sameFixTargets(present, selected.id, rename.before) : [],
    [present, rename, selected],
  );
  const runConfirm = useCallback(() => {
    if (confirm === "runs") apply(mergeSameNotes(present));
    else if (confirm === "same-fix" && selected) { apply(chooseName(present, sameFix, selected.name, selected.nameSource === "typed" ? "typed" : "chosen")); setRename(undefined); }
    setConfirm(undefined);
  }, [apply, confirm, present, sameFix, selected]);

  function startBoundary(event: ReactPointerEvent<HTMLSpanElement>, leftId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    boundaryDrag.current = { leftId, pointerId: event.pointerId };
  }
  function dragBoundary(event: ReactPointerEvent<HTMLSpanElement>) {
    const drag = boundaryDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const box = event.currentTarget.parentElement!.getBoundingClientRect();
    const step = event.altKey ? 0.25 : 1;
    const beat = Math.round((event.clientX - box.left) / pxPerBeat / step) * step;
    const result = moveBoundary(present, drag.leftId, beat);
    drag.result = result.changed ? result : undefined;
    setPreview(drag.result?.model);
    setBoundaryTip(drag.result ? { x: beat * pxPerBeat, text: positionLabel(beat, meter) } : undefined);
  }
  function endBoundary(event: ReactPointerEvent<HTMLSpanElement>) {
    const drag = boundaryDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    boundaryDrag.current = undefined;
    setPreview(undefined);
    setBoundaryTip(undefined);
    if (drag.result) apply(drag.result);
  }

  // ---- keys (spec 7.1–7.5) ---------------------------------------------------------------
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key;
      if (key === "Tab") { pointerUsedRef.current = false; return; }
      // P10.1 §6: after a mouse press, a handled shortcut (and Esc) moves focus to the workspace, so no ring appears.
      const releaseFocus = () => {
        const root = rootRef.current;
        const active = document.activeElement;
        if (pointerUsedRef.current && root && active instanceof HTMLElement && active !== root && root.contains(active) && !isEditable(active)) root.focus({ preventScroll: true });
      };
      const handled = () => { event.preventDefault(); if (key !== "Enter") releaseFocus(); };
      if (confirm) {
        if (key === "Enter") { handled(); runConfirm(); }
        return;
      }
      if (nameEditor || event.defaultPrevented || event.isComposing || event.altKey || event.metaKey) return;
      // P10.1 §5: Space plays and stops everywhere except where text is typed, in a select and in dialogs.
      if (key === " " && !event.ctrlKey && !isEditable(event.target) && !inDialog(event.target)) { handled(); toggleSong(); return; }
      if (isEditable(event.target)) return;
      if (key === "Escape") releaseFocus();
      // Enter on a focused button, link or summary presses that control (keyboard users).
      if (key === "Enter" && isPressable(event.target)) return;
      const ids = [...selectedNotes];
      if (event.ctrlKey) {
        const lower = key.toLowerCase();
        if (lower === "z" && !event.shiftKey) { handled(); undoOnce(); }
        else if ((lower === "z" && event.shiftKey) || lower === "y") { handled(); setHistory(redo); setPreview(undefined); }
        else if (lower === "a" && selected) { handled(); selectNotes(cardNoteIds(present, selected.id), "replace"); }
        else if ((key === "ArrowUp" || key === "ArrowDown") && ids.length) { handled(); edit((model) => movePitch(model, ids, key === "ArrowUp" ? 12 : -12)); }
        return;
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        if (!ids.length) return;
        handled();
        edit((model) => movePitch(model, ids, key === "ArrowUp" ? 1 : -1));
      } else if (key === "ArrowRight") { handled(); stopFollow(); selectCard(present.cards[Math.min(present.cards.length - 1, selectedIndex + 1)]); }
      else if (key === "ArrowLeft") { handled(); stopFollow(); selectCard(present.cards[Math.max(0, selectedIndex - 1)]); }
      else if (key === "]") { handled(); stopFollow(); nextReview(1); }
      else if (key === "[") { handled(); stopFollow(); nextReview(-1); }
      else if (key === "f" || key === "F") { handled(); setFollow((value) => !value); }
      else if (key === "Home") { handled(); stopFollow(); selectCard(present.cards[0]); }
      else if (key === "End") { handled(); stopFollow(); selectCard(present.cards[present.cards.length - 1]); }
      else if (key === "?") { handled(); setHelpOpen((value) => !value); }
      else if ((key === "Delete" || key === "Backspace") && ids.length) { handled(); edit((model) => deleteNotes(model, ids)); }
      else if ((key === "r" || key === "R") && ids.length) { handled(); edit((model) => restoreNotes(model, ids)); }
      else if (key === "n" || key === "N") { handled(); enterEdit(); }
      else if ((key === "m" || key === "M") && event.shiftKey) { handled(); askMergeRuns(); }
      else if ((key === "m" || key === "M") && selected) { handled(); edit((model) => mergeWithNext(model, selected.id)); }
      else if ((key === "s" || key === "S") && selected) { handled(); edit((model) => splitCard(model, selected.id)); }
      else if (key === "y" || key === "Y") { handled(); markAndNext(); }
      else if (key === "F2" && selected) { handled(); openNameEditor(selected.id); }
      else if (/^[1-4]$/.test(key) && selected) {
        const name = nameCandidatesFor(selected, present.notes.filter((note) => note.cardId === selected.id))[Number(key) - 1];
        if (name) { handled(); pickName(name, selected.id); }
      }
      else if (key === "a" || key === "A") { handled(); playCard("source"); }
      else if (key === "b" || key === "B") { handled(); playCard("card"); }
      else if (key === "Enter") { handled(); setMode("check"); setSelectedNotes(new Set()); }
      else if (key === "Escape") {
        if (helpOpen) { handled(); setHelpOpen(false); }
        else if (ids.length) { handled(); setSelectedNotes(new Set()); }
        else if (saveRange) { handled(); setSaveRange(undefined); }
        else if (selectedId !== undefined) { handled(); setSelectedId(undefined); }
      }
    }
    // The key up of a Space that played must not press the focused button or tick the box.
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === " " && !confirm && !nameEditor && !isEditable(event.target) && !inDialog(event.target)) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [askMergeRuns, confirm, edit, enterEdit, helpOpen, markAndNext, nameEditor, nextReview, openNameEditor, pickName, playCard, present, runConfirm, selectCard, saveRange, selectNotes, selected, selectedId, selectedIndex, selectedNotes, stopFollow, toggleSong, undoOnce]);

  // Wheel on the timeline (spec 9): sideways; Shift = up/down (the page, keys included);
  // Ctrl = zoom around the pointer. A native listener, so preventDefault works.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        if (event.shiftKey) {
          event.preventDefault();
          verticalScroller(element).scrollBy({ top: event.deltaY || event.deltaX });
          return;
        }
        stopFollow();
        if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return; // a touchpad already scrolls sideways
        event.preventDefault();
        element.scrollLeft += event.deltaY;
        return;
      }
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
  }, [maxPx, minPx, pxPerBeat, stopFollow]);

  const overviewRef = useRef<HTMLDivElement>(null);
  const moveFromOverview = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = overviewRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    stopFollow();
    scrollToBeat(((event.clientX - box.left) / box.width) * present.totalBeats);
  };

  const suggestion = present.suggestions.find((entry) => !closedSuggestions.has(entry.kind));
  const closeSuggestion = (kind: string) => setClosedSuggestions((current) => new Set([...current, kind]));
  const barStep = pxPerBeat * meter < 18 ? 8 : pxPerBeat * meter < 36 ? 4 : 1;
  const viewStart = scrollLeft / pxPerBeat;
  const viewEnd = (scrollLeft + viewportWidth) / pxPerBeat;
  const cardAt = (beat: number) => present.cards.find((card) => beat >= card.start && beat < card.start + card.duration);
  const positionOf = (beat: number) => {
    const card = cardAt(beat);
    return card ? `${card.bar}.${card.beat}` : `${Math.floor(beat / meter) + 1}.1`;
  };
  const position = positionOf(selected?.start ?? songStartBeat);
  // Spec v2.5 §7.3: the playhead moves every frame (transform only; the workspace is not
  // re-rendered), and following scrolls in the same frame. Reduced motion keeps it moving:
  // it is position information, and following never scrolls smoothly.
  const startedAt = songPlaying && playback.status === "playing" ? playback.startedAt : undefined;
  const positionRef = useRef(positionOf);
  positionRef.current = positionOf;
  useEffect(() => {
    if (startedAt === undefined) return undefined;
    let frame = 0;
    let lastLabel = "";
    const step = () => {
      const beat = playheadBeatAt(performance.now(), startedAt, songBpm, playStartBeat);
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${beat * pxPerBeat}px)`;
      const overview = overviewPlayheadRef.current;
      const overviewWidth = overview?.parentElement?.clientWidth ?? 0;
      if (overview) overview.style.transform = `translateX(${(Math.min(beat, present.totalBeats) / Math.max(1, present.totalBeats)) * overviewWidth}px)`;
      const label = positionRef.current(beat);
      if (label !== lastLabel) {
        if (timeRef.current) timeRef.current.textContent = label;
        if (playTagRef.current) playTagRef.current.textContent = label;
        lastLabel = label;
      }
      const element = scrollRef.current;
      if (followRef.current && element) {
        const next = followScrollLeft(beat, element.scrollLeft, element.clientWidth, pxPerBeat);
        if (next !== undefined) element.scrollLeft = next;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playStartBeat, pxPerBeat, present.totalBeats, songBpm, startedAt]);
  const tempoText = present.tempo !== undefined
    ? `${present.tempo}BPM（MIDI ${props.tempoMissing || !present.bpm ? "にテンポなし" : Math.round(present.bpm)}）`
    : `${songBpm}BPM${props.tempoMissing || !present.bpm ? "（MIDI にテンポなし）" : ""}`;
  const fileMeta = [`${totalBars}小節`, tempoText, present.timeSignature ?? "4/4", props.analysisModeLabel, props.analysisTargetLabel]
    .filter(Boolean).join("・");
  const count = editCount(history);
  const last = lastEditLabel(history);
  const dirty = count > 0 && history.present !== savedPresent;
  const unsavedCount = dirty ? Math.max(1, count - savedCount) : 0;
  const { onDirtyChange } = props;
  useEffect(() => { onDirtyChange?.(unsavedCount); }, [unsavedCount, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(0), [onDirtyChange]);
  useEffect(() => unsavedCount ? registerCloseBlocker({
    title: UNSAVED_TITLE,
    message: unsavedMessage(unsavedCount, "閉じる"),
    confirmLabel: "保存せずに閉じる",
    cancelLabel: "戻る",
  }) : undefined, [unsavedCount]);
  const guarded = (action: () => void) => () => { if (dirty) setPendingLeave(() => action); else action(); };
  const lastBarOf = (card: CorrectionCard) => Math.floor((card.start + card.duration - 1e-6) / meter) + 1;
  const inSaveRange = (card: CorrectionCard) => !saveRange || (card.start < saveRange.endBar * meter - 1e-6 && card.start + card.duration > (saveRange.startBar - 1) * meter + 1e-6);
  const selectedNoteList = present.notes.filter((note) => selectedNotes.has(note.id));
  const selectionBar = selectedNoteList.length ? (
    <>
      <span>{selectedNoteList.length}音を選択中</span>
      {selectedNoteList.some((note) => note.used || note.provenance === "MANUAL_ADDED")
        ? <button type="button" className="lv-cw-btn" onClick={() => edit((model) => deleteNotes(model, selectedNoteList.map((note) => note.id)))}>外す <kbd>Delete</kbd></button> : null}
      {selectedNoteList.some((note) => !note.used && note.provenance === "SOURCE")
        ? <button type="button" className="lv-cw-btn" onClick={() => edit((model) => restoreNotes(model, selectedNoteList.map((note) => note.id)))}>戻す <kbd>R</kbd></button> : null}
      <button type="button" className="lv-cw-btn" onClick={() => setSelectedNotes(new Set())} data-testid="correction-selection-clear">選択をやめる <kbd>Esc</kbd></button>
    </>
  ) : undefined;
  const barNumbers = Array.from({ length: totalBars }, (_, index) => index + 1)
    .filter((bar) => (bar - 1) % barStep === 0 && overlaps((bar - 1) * meter, meter * barStep, range));

  return (
    <section
      ref={rootRef}
      className="lv-cw"
      tabIndex={-1}
      data-testid="correction-workspace"
      data-mode={mode}
      aria-label="修正作業場"
      onPointerDownCapture={() => { pointerUsedRef.current = true; }}
    >
      <div className="lv-cw-file">
        <span className="lv-cw-file-name">{props.fileName}</span>
        <span className="lv-cw-file-meta" title={fileMeta} data-testid="capture-analysis-preset-summary">{fileMeta}</span>
        <span className="lv-cw-spacer" />
        <button type="button" className="lv-cw-stat" data-kind="warn" onClick={() => nextReview(1)} disabled={!reviewCards.length} data-testid="correction-review-count">
          要確認 <b>{reviewCards.length}</b>
        </button>
        <span className="lv-cw-stat" data-testid="correction-edit-count">直した回数 <b>{count}</b></span>
        {props.onPartSettings ? <button type="button" className="lv-cw-btn" onClick={guarded(props.onPartSettings)} data-testid="capture-change-part-selection">パートの設定</button> : null}
        <button type="button" className="lv-cw-btn" onClick={guarded(props.onChooseAnotherMidi)} data-testid="correction-another-midi">別の MIDI</button>
      </div>

      {suggestion?.kind === "melody-voice" ? (
        <div className="lv-cw-suggestion" role="status" data-testid="correction-suggestion" data-kind={suggestion.kind}>
          <span>メロディの Voice（{suggestion.voiceLabel}）の音が {suggestion.cardCount} 枚のカードに入っています。まとめて選んで、外すかどうかを決められます（外すのは <kbd>Delete</kbd> か右の欄）。</span>
          <span className="lv-cw-actions">
            <button type="button" className="lv-cw-btn" data-kind="accent" onClick={() => selectNotes(suggestion.noteIds, "replace")} data-testid="correction-select-melody">まとめて選ぶ（{suggestion.noteIds.length}）</button>
            <button type="button" className="lv-cw-btn" onClick={() => closeSuggestion(suggestion.kind)}>閉じる</button>
          </span>
        </div>
      ) : suggestion?.kind === "same-notes-run" ? (
        <div className="lv-cw-suggestion" role="status" data-testid="correction-suggestion" data-kind={suggestion.kind}>
          <span>同じ音が続く所が {suggestion.count} か所あります。つなぐと1枚のカードになります（打ち直しは ×n で残ります）。</span>
          <span className="lv-cw-actions">
            <button type="button" className="lv-cw-btn" data-kind="accent" onClick={askMergeRuns} data-testid="correction-confirm-runs">確認してつなぐ</button>
            <button type="button" className="lv-cw-btn" onClick={() => closeSuggestion(suggestion.kind)}>閉じる</button>
          </span>
        </div>
      ) : null}

      <div className="lv-cw-work">
        <div className="lv-cw-timeline">
          <div className="lv-cw-bar" role="toolbar" aria-label="操作" data-testid="correction-control-bar">
            {/* P10.1 §1: 再生 and 表示 always share the first line. */}
            <div className="lv-cw-bar-lead">
            <div className="lv-cw-group" role="group" aria-label="再生">
              <button
                type="button"
                className="lv-cw-btn"
                data-kind="accent"
                aria-pressed={songPlaying}
                aria-label={songPlaying ? "停止（Space）" : selected ? `${position} から再生（Space）` : "最初から再生（Space）"}
                title={songPlaying ? "停止（Space）" : selected ? `${position} から再生（Space）` : "最初から再生（Space）"}
                onClick={toggleSong}
                data-testid="correction-play-song"
              >
                {songPlaying ? "■ 停止" : "▶ 再生"}
              </button>
              <button type="button" className="lv-cw-btn" aria-pressed={follow} onClick={() => setFollow((value) => !value)} data-testid="correction-follow">追従</button>
              <TempoField
                value={songBpm}
                {...(props.tempoMissing || !present.bpm ? { title: "MIDI にテンポの情報がありません" } : {})}
                onCommit={(bpm) => {
                  const result = setTempo(present, bpm);
                  if (!result.changed) return;
                  // Playing: carry on from the head of the card sounding now, at the new tempo.
                  const resumeAt = playingRef.current && startedAt !== undefined
                    ? cardAt(playheadBeatAt(performance.now(), startedAt, songBpm, playStartBeat))?.start
                    : undefined;
                  apply(result);
                  if (resumeAt !== undefined) playSong(resumeAt, bpm);
                }}
              />
              <span className="lv-cw-time" data-testid="correction-position">
                {startedAt !== undefined ? <span ref={timeRef} /> : `${position} から`} ／ {totalBars}小節
              </span>
            </div>
            <div className="lv-cw-group" role="group" aria-label="表示">
              {([["all", "全体"], ["16", "16小節"], ["8", "8小節"], ["4", "4小節"]] as const).map(([value, label]) => (
                <button key={value} type="button" className="lv-cw-btn" aria-pressed={zoom === value} onClick={() => setZoom(value)}>{label}</button>
              ))}
              <label className="lv-cw-check">
                <input
                  type="checkbox"
                  checked={clickAudition}
                  data-testid="correction-click-audition"
                  onChange={(event) => { setClickAudition(event.target.checked); setCardClickAudition(event.target.checked); }}
                />
                押して鳴らす
              </label>
            </div>
            </div>
            <div className="lv-cw-group" role="group" aria-label="要確認">
              <button type="button" className="lv-cw-btn" onClick={() => nextReview(-1)} disabled={!reviewCards.length} aria-label="前の要確認">◀ 前の要確認</button>
              <span className="lv-cw-nav-count" data-testid="correction-review-position">{reviewIndex >= 0 ? reviewIndex + 1 : "–"} / {reviewCards.length}</span>
              <button type="button" className="lv-cw-btn" onClick={() => nextReview(1)} disabled={!reviewCards.length} aria-label="次の要確認">次の要確認 ▶</button>
            </div>
            <div className="lv-cw-group" role="group" aria-label="モード">
              <button type="button" className="lv-cw-btn" aria-pressed={mode === "edit"} onClick={() => mode === "edit" ? setMode("check") : enterEdit()} data-testid="correction-mode-edit">
                {mode === "edit" ? "② 音を直す（Enter で戻る）" : "① 確かめる（N で音を直す）"}
              </button>
            </div>
            <div className="lv-cw-group" role="group" aria-label="履歴">
              <button type="button" className="lv-cw-btn" onClick={undoOnce} disabled={!count} aria-label="元に戻す（Ctrl+Z）">元に戻す</button>
              <button type="button" className="lv-cw-btn" onClick={() => setHistory(redo)} disabled={!history.future.length} aria-label="やり直す（Ctrl+Y）">やり直す</button>
              <span className="lv-cw-history" data-testid="correction-history" title={`操作 ${count}${last ? `・最後：${last}` : ""}`}>
                操作 {count}{last ? <span className="lv-cw-history-last">・最後：{last}</span> : null}
              </span>
            </div>
            <span className="lv-cw-notice" role="status" data-testid="correction-notice" title={notice}>{notice}</span>
          </div>

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
              {startedAt !== undefined ? <span ref={overviewPlayheadRef} className="lv-cw-ov-ph" data-testid="correction-overview-playhead" /> : null}
            </div>
          </div>

          <div className="lv-cw-body">
            <div className="lv-cw-left">
              <span className="lv-cw-label" style={{ height: 26 }}>小節</span>
              <button type="button" className="lv-cw-label lv-cw-seg-toggle" style={{ height: segmentsOpen ? 30 : 20 }} aria-expanded={segmentsOpen} onClick={() => setSegmentsOpen((value) => !value)}>区切り</button>
              <span className="lv-cw-label" style={{ height: 98 }}>コード</span>
              <span className="lv-cw-label" style={{ height: 20 }} aria-hidden="true" />
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
                    const segmentLeft = (segment.startBar - 1) * meter * pxPerBeat + 1;
                    // The name sticks to the left edge of the view (spec v2.4 §4.3), within its band.
                    const shift = Math.max(0, Math.min(scrollLeft - segmentLeft, width - 160));
                    return (
                      <button key={segment.id} type="button" className="lv-cw-segment" data-testid="correction-segment"
                        aria-pressed={saveRange?.startBar === segment.startBar && saveRange.endBar === segment.endBar}
                        data-saved={savedRanges.has(rangeKey(segment)) || undefined}
                        title={`${segment.label}を保存する範囲にする`}
                        style={{ left: segmentLeft, width }}
                        onClick={() => setSaveRange({ startBar: segment.startBar, endBar: segment.endBar })}>
                        <span className="lv-cw-segment-name" style={shift > 0 ? { transform: `translateX(${shift}px)` } : undefined}>
                          {segment.label}{segment.repeatCount ? (width < 140 ? ` ×${segment.repeatCount}` : ` · ${segment.repeatCount}回出てくる`) : ""}
                          {savedRanges.has(rangeKey(segment)) ? <span className="lv-cw-saved">保存済み</span> : null}
                        </span>
                      </button>
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
                        data-name-unreadable={card.nameUnreadable || undefined}
                        data-testid="correction-card"
                        aria-pressed={card.id === selected?.id}
                        aria-label={`${card.bar}小節${card.beat}拍 ${card.name.label}${review ? "（要確認）" : ""}`}
                        title={card.name.label}
                        style={{ left: card.start * pxPerBeat + 1, width: Math.max(2, width) }}
                        data-card-id={card.id}
                        data-out-of-range={!inSaveRange(card) || undefined}
                        onClick={(event) => {
                          // Shift+click: the range from the selected card to this one, in whole bars.
                          if (event.shiftKey && selected) setSaveRange({ startBar: Math.min(selected.bar, card.bar), endBar: Math.max(lastBarOf(selected), lastBarOf(card)) });
                          selectCard(card, false);
                          // 「押して鳴らす」: only a plain click, never while the song plays; the last audition stops.
                          if (clickAudition && !event.shiftKey && !songPlaying) auditionCard(card);
                        }}
                        onDoubleClick={() => openNameEditor(card.id)}
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
                  {shown.cards.map((card, index) => {
                    const next = shown.cards[index + 1];
                    if (!next || Math.abs(card.start + card.duration - next.start) > 1e-6 || next.start < range.from || next.start > range.to) return null;
                    return (
                      <span
                        key={`edge-${card.id}`}
                        className="lv-cw-handle"
                        role="separator"
                        aria-label={`${positionLabel(next.start, meter)} の境目（ドラッグで動かす・Alt で ¼拍）`}
                        data-testid="correction-boundary"
                        data-left-card={card.id}
                        style={{ left: next.start * pxPerBeat - 4 }}
                        onPointerDown={(event) => startBoundary(event, card.id)}
                        onPointerMove={dragBoundary}
                        onPointerUp={endBoundary}
                        onPointerCancel={endBoundary}
                      />
                    );
                  })}
                  {boundaryTip ? <span className="lv-cw-pitch-tip" style={{ left: boundaryTip.x, top: 12 }}>{boundaryTip.text}</span> : null}
                </div>
                <div className="lv-cw-chips">
                  {present.cards.filter((card) => overlaps(card.start, card.duration, range) && card.reviewReasons.some((reason) => reason.kind === "same-chord-split")).map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      className="lv-cw-chip"
                      data-testid="correction-merge-chip"
                      style={{ left: (card.start + card.duration) * pxPerBeat }}
                      onClick={() => { setSelectedId(card.id); edit((model) => mergeWithNext(model, card.id)); }}
                    >
                      つなぐ
                    </button>
                  ))}
                </div>
                {startedAt !== undefined ? (
                  <span ref={playheadRef} className="lv-cw-playline" data-testid="correction-playhead">
                    <span ref={playTagRef} className="lv-cw-playline-tag" />
                  </span>
                ) : null}
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
                  onClearCard={() => { if (mode === "check") setSelectedId(undefined); }}
                  selectionBar={selectionBar}
                  leftEdge={scrollLeft}
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

        </div>

        <aside className="lv-cw-insp" data-open={panelOpen || undefined} aria-label="選んだカード">
          <button type="button" className="lv-cw-panel-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen((value) => !value)} data-testid="correction-panel-toggle">
            {selected ? `${selected.name.label}${selected.reviewReasons.length ? "・要確認" : ""}` : "カード"}（{panelOpen ? "閉じる" : "開く"}）
          </button>
          {saveRange ? (
            <WorkspaceSaveForm
              model={present}
              timeline={timeline}
              range={saveRange}
              saved={savedRanges.has(rangeKey(saveRange))}
              actions={props.save}
              onClear={() => setSaveRange(undefined)}
              onGoToCard={(cardId) => selectCard(present.cards.find((card) => card.id === cardId))}
              onSaved={() => {
                setSavedRanges((current) => new Set([...current, rangeKey(saveRange)]));
                setSavedPresent(history.present);
                setSavedCount(editCount(history));
                metricsRef.current.saves.push({ atMs: Date.now(), reviewMarks: reviewCards.length });
              }}
            />
          ) : <NoSaveRange />}
          <RecommendedRanges candidates={props.blockCandidates} onPick={setSaveRange} />
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
              canUndo={count > 0}
              onUndo={undoOnce}
              onChooseName={(name) => pickName(name, selected.id)}
              onUseSuggestedName={(name) => pickName(name, selected.id, "auto")}
              onTypeName={() => openNameEditor(selected.id)}
              onReviewed={markAndNext}
              {...(selectedIndex > 0 ? { onMergePrevious: () => { const previous = present.cards[selectedIndex - 1]!; setSelectedId(previous.id); edit((model) => mergeWithNext(model, previous.id)); } } : {})}
              {...(selectedIndex < present.cards.length - 1 ? { onMergeNext: () => edit((model) => mergeWithNext(model, selected.id)) } : {})}
              onSplit={() => edit((model) => splitCard(model, selected.id))}
              {...(sameFix.length ? { sameFix: { count: sameFix.length, onApply: () => setConfirm("same-fix") } } : {})}
            />
          ) : (
            <div className="lv-cw-insp-empty" data-testid="correction-inspector-empty">
              <p className="lv-cw-muted">{present.cards.length ? "カードを押すと、ここに音と名前が出ます。" : "カードがありません。"}</p>
              {reviewCards.length ? <button type="button" className="lv-cw-btn" data-kind="warn" onClick={() => nextReview(1)}>要確認 {reviewCards.length}</button> : null}
            </div>
          )}
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
            <span><kbd>M</kbd> つなぐ・<kbd>S</kbd> 分ける</span>
            <span><kbd>1</kbd>〜<kbd>4</kbd> 名前・<kbd>Y</kbd> このままでよい</span>
            <span>右クリック：外す・ダブルクリック：足す</span>
            <span><kbd>A</kbd><kbd>B</kbd> 聴き比べ</span>
            <span><kbd>Space</kbd> 再生・停止（どこでも）</span>
            <span><kbd>Enter</kbd> フォーカスのあるボタンを押す</span>
            <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> 元に戻す</span>
            <span><kbd>?</kbd> ショートカット一覧</span>
          </>
        )}
      </div>

      {helpOpen ? <ShortcutSheet onClose={() => setHelpOpen(false)} /> : null}
      <ConfirmDialog
        open={Boolean(pendingLeave)}
        title={UNSAVED_TITLE}
        description={unsavedMessage(unsavedCount, "開く")}
        confirmLabel="保存せずに開く"
        cancelLabel="戻る"
        tone="danger"
        onCancel={() => setPendingLeave(undefined)}
        onConfirm={() => { const action = pendingLeave; setPendingLeave(undefined); action?.(); }}
      />
      <ConfirmDialog
        open={confirm === "runs"}
        title="同じ音が続く所をつなぐ"
        description={confirm === "runs" ? runsDescription(present) : ""}
        confirmLabel="つなぐ（Enter）"
        cancelLabel="やめる（Esc）"
        onConfirm={runConfirm}
        onCancel={() => setConfirm(undefined)}
      />
      <ConfirmDialog
        open={confirm === "same-fix" && Boolean(selected && rename)}
        title="同じ直しを他にも反映"
        description={selected && rename ? `同じ音で名前が「${rename.before}」の他の ${sameFix.length} か所も「${selected.name.label}」にします。` : ""}
        confirmLabel="反映する（Enter）"
        cancelLabel="やめる（Esc）"
        onConfirm={runConfirm}
        onCancel={() => setConfirm(undefined)}
      />
      {nameEditor && editorCard ? (
        <QuickChordEditor
          key={editorCard.id}
          slot={slotFor(editorCard, timeline)}
          anchorElement={nameEditor.anchor}
          resetLabel="自動の名前に戻す"
          onPreview={() => undefined}
          onApply={(chord, source) => { pickName(chord, editorCard.id, source === "alternative" ? "chosen" : "typed"); setNameEditor(undefined); }}
          onReset={() => { edit((model) => chooseName(model, editorCard.id, timeline[editorCard.timelineIndex]!.chord, "auto")); setNameEditor(undefined); }}
          onOpenInspector={() => setNameEditor(undefined)}
          onClose={() => setNameEditor(undefined)}
        />
      ) : null}
    </section>
  );
}

/**
 * BPM 40–240 (P10.1 §12.1): Enter or leaving commits, ↑/↓ ±1 (Shift ±10) commit at once,
 * Esc goes back to the value before typing. Anything else returns to the last value.
 */
function TempoField({ value, title, onCommit }: { value: number; title?: string; onCommit: (bpm: number) => void }) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  // Enter and Esc leave the field themselves; the blur that follows must not commit again.
  const skipBlur = useRef(false);
  const shown = editing ? text : String(value);
  const commit = (raw: string) => {
    setEditing(false);
    const bpm = Number(raw.trim());
    if (raw.trim() !== "" && Number.isInteger(bpm) && bpm >= TEMPO_MIN && bpm <= TEMPO_MAX && bpm !== value) onCommit(bpm);
  };
  return (
    <label className="lv-cw-tempo" title={title}>
      BPM
      <input
        type="text"
        inputMode="numeric"
        aria-label="テンポ（BPM）"
        data-testid="correction-tempo"
        value={shown}
        maxLength={3}
        onFocus={() => { setText(String(value)); setEditing(true); }}
        onChange={(event) => { setEditing(true); setText(event.target.value); }}
        onBlur={() => { if (skipBlur.current) skipBlur.current = false; else commit(text); }}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); commit(text); skipBlur.current = true; event.currentTarget.blur(); }
          else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditing(false); setText(String(value)); skipBlur.current = true; event.currentTarget.blur(); }
          else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
            const next = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, (Number(text) || value) + step));
            setText(String(next));
            if (next !== value) onCommit(next);
          }
        }}
      />
    </label>
  );
}

function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["← →", "前後のカード"], ["[ ]", "前後の要確認"], ["Space", "再生・停止（どこでも。選んだカードから／選んでいなければ最初から）"], ["Enter", "フォーカスのあるボタンを押す"], ["F", "再生位置に追従する／しない"],
    ["Home End", "最初／最後のカード"], ["Ctrl＋ホイール", "マウスの位置を中心に拡大縮小"],
    ["M", "次のカードとつなぐ"], ["Shift＋M", "同じ音が続く所を確認してつなぐ"], ["S", "カードを半分に分ける"],
    ["境目の取っ手", "ドラッグで1拍ずつ（Alt で ¼拍）"], ["1〜4", "名前の候補を選ぶ"], ["F2・名前をダブルクリック", "名前を文字で入れる"], ["Y", "このままでよい（次の要確認へ）"], ["N", "② 音を直す"], ["Enter", "直し終わる（①へ）"],
    ["右クリック・右ドラッグ", "元の音を外す／足した音を消す"], ["左クリック・ドラッグ（外した音）", "戻す"], ["空いた所", "①ダブルクリック／②クリックで足す"],
    ["上下ドラッグ・↑↓", "半音ずつ高さを直す"], ["Ctrl＋↑↓", "1オクターブ"], ["Delete", "外す・消す"], ["R", "戻す"],
    ["Ctrl＋A", "選んだカードの音を全部選ぶ"], ["Ctrl＋クリック（鍵盤）", "その高さの音を曲全体で選ぶ"], ["A B", "元の音／カードの音を鳴らす"],
    ["Ctrl＋Z", "元に戻す"], ["Ctrl＋Shift＋Z・Ctrl＋Y", "やり直す"], ["?", "この一覧"], ["Esc", "閉じる → 音の選択 → 保存する範囲 → カードの選択の順に外す"],
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

function runsDescription(model: CorrectionModel): string {
  const groups = sameNotesGroups(model);
  const byId = new Map(model.cards.map((card) => [card.id, card]));
  const places = groups.map((group) => {
    const first = byId.get(group[0]!)!;
    return `${positionLabel(first.start, model.context.meter)} ${first.name.label} ×${group.length}`;
  });
  const listed = places.slice(0, 12).join("、");
  return `同じ音が続く所を ${groups.length} か所つなぎます：${listed}${places.length > 12 ? ` ほか ${places.length - 12} か所` : ""}。名前が同じでも音が違う所はつなぎません。`;
}

function slotFor(card: CorrectionCard, timeline: readonly ChordTimelineItem[]): EditableChordSlot {
  const item = timeline[card.timelineIndex]!;
  return {
    id: card.id,
    position: { bar: card.bar, beat: card.beat, durationBeats: card.duration },
    originalChord: item.chord,
    currentChord: card.name,
    alternatives: item.alternatives,
    warnings: [],
    edited: card.nameSource !== "auto",
  };
}

function pct(value: number, total: number): string {
  return `${(Math.max(0, value) / Math.max(1, total)) * 100}%`;
}

function formatBeats(beats: number): string {
  return Number.isInteger(beats) ? String(beats) : beats.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function verticalScroller(from: HTMLElement): Element {
  for (let element = from.parentElement; element; element = element.parentElement) {
    const overflow = getComputedStyle(element).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && element.scrollHeight > element.clientHeight) return element;
  }
  return document.scrollingElement ?? document.documentElement;
}

function isPressable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("button, a[href], summary, [role='button'], [role='menuitem']"));
}

const NOT_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);

/** Where keys type text or pick an option (P10.1 §5: a checkbox is not one). */
function isEditable(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  if (element.isContentEditable || element.tagName === "TEXTAREA" || element.tagName === "SELECT") return true;
  return element instanceof HTMLInputElement && !NOT_TEXT_INPUTS.has(element.type);
}

function inDialog(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("[role='dialog'], [aria-modal='true'], [data-quick-chord-editor]"));
}

export type { CorrectionNote };
