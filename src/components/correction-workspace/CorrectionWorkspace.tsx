import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { PreviewSound } from "../../audio/chordPreview";
import { samePlaybackSource, type PlaybackController, type PlaybackRequest, type PlayingSource } from "../../audio/playbackController";
import { chooseName, cutBars, deleteCard, markReviewed, mergeSameNotes, mergeWithNext, moveBoundary, positionLabel, sameFixTargets, sameNotesGroups, splitCard } from "../../domain/correction/cardEdits";
import type { CorrectionCard, CorrectionModel, CorrectionNote, CorrectionSegment, NameSource } from "../../domain/correction/correctionModel";
import { barRangeLabel, noteLabel, notesByCard, removedBarsOf } from "../../domain/correction/correctionModel";
import { recommendedOnScreen, shiftRangeKey, shiftSaveRange } from "../../domain/correction/barMap";
import { cardForBar, cardsBarRange, pickRangeCard, rangeCaption, rangeChipText } from "../../domain/correction/rangePick";
import { moveSegmentEdge, type SegmentEdge } from "../../domain/correction/segmentEdits";
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
  PLAYER_DEFAULT_BPM,
  TEMPO_MAX,
  TEMPO_MIN,
  type EditResult,
} from "../../domain/correction/edits";
import { commitEdit, editCount, editKindCounts, lastEditLabel, redo, savedContentDiffers, startHistory, undo, type CorrectionHistory } from "../../domain/correction/history";
import { buildMetricsRecord, type CorrectionMetricsSession } from "../../domain/correction/metrics";
import { appendCorrectionMetrics } from "../../storage/correctionMetricsStorage";
import { registerClosePreparation } from "../../store/closePreparation";
import { nameCandidatesFor } from "../../domain/correction/nameCandidates";
import { beatsPerBar as beatsPerBarFor } from "../../domain/midi/timing";
import type { EditableChordSlot } from "../../domain/progressionEditing";
import type { ChordSymbol, ChordTimelineItem, ProgressionBlockCandidate } from "../../domain/types";
import { cardsInRange, type SaveRange } from "../../domain/correction/saveCandidate";
import { registerCloseBlocker } from "../../store/closeBlocker";
import { cardAuditionNotes } from "../../domain/correction/saveCandidate";
import { songClicks, songPlaybackNotes } from "../../domain/correction/songPlayback";
import { sectionSaveRows, wholeSongRange, type SectionSaveRow } from "../../domain/correction/sectionSave";
import type { SaveKind } from "../../domain/correction/metrics";
import { SectionSaveDialog } from "./SectionSaveDialog";
import { useMetronome } from "../MetronomeProvider";
import { GearIcon, UndoIcon } from "../icons";
import { useFadingNotice } from "./useFadingNotice";
import { usePlaybackState } from "../../hooks/usePlaybackState";
import { preferredScrollBehavior } from "../../ui/motion";
import { ConfirmDialog } from "../ConfirmDialog";
import { QuickChordEditor } from "../progression-editing/QuickChordEditor";
import { CorrectionInspector } from "./CorrectionInspector";
import { CardContextMenu, BarContextMenu } from "./CardContextMenu";
import { NoSaveRange, RecommendedRanges, rangeKey, useRecommendedOpen, WorkspaceSaveForm, type WorkspaceSaveActions } from "./WorkspaceSaveForm";
import { PianoRoll, ROW_PX } from "./PianoRoll";
import { cardLabel, cardSize, followScrollLeft, leftCardInView, overlaps, playheadBeatAt, visibleBeatRange, zoomScrollLeft } from "./workspaceGeometry";
import { getCardClickAudition, setCardClickAudition } from "../../storage/cardClickAuditionSettings";
import { getLegendVisible, setLegendVisible as storeLegendVisible } from "../../storage/workspaceLegendSettings";
import { usedNotes, guardProgressionNotes, replaceProgressionName, changedProgressionCards, progressionChanges, deleteProgressionCard, resetProgressionCard } from "../../domain/progressionWorkspace/progressionWorkspace";
import { getAlignProgressionNotes, setAlignProgressionNotes } from "../../storage/progressionWorkspaceSettings";
import { UNSAVED_TITLE, unsavedMessage } from "./unsavedText";

/**
 * The correction workspace (spec v2.5 with the P10.1 overrides): display, note and card
 * editing with one undo history, saving. One control bar on top (P10.1 §1); the song
 * plays the workspace's notes (P10.2 §2) from the selected card, or from the first card
 * in view when none is selected (P10.2 §3), with the header's metronome (P10.2 §6).
 * Only the visible beats are drawn.
 */

type Zoom = "all" | "16" | "8" | "4" | "custom";
type Mode = "check" | "edit";

export interface ProgressionWorkspaceOptions {
  selectedCardId?:string;
  onSelectedCardChange?:(id:string|undefined)=>void;
  base: import("../../domain/types").SavedProgressionBlock;
  namesFor: (model: CorrectionModel, card: CorrectionCard) => ChordSymbol[];
  header: (model: CorrectionModel, apply: (result: EditResult) => void) => ReactNode;
  save: (model: CorrectionModel, range: SaveRange | undefined, reset: () => void) => ReactNode;
  onModelChange?: (model: CorrectionModel) => void;
}

export interface CorrectionWorkspaceProps {
  progression?: ProgressionWorkspaceOptions;
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
  const progression = props.progression;
  const [alignNotes, setAlignNotes] = useState(getAlignProgressionNotes);
  const { timeline, controller, previewSound, fullSource, onPlaybackError } = props;
  const loopTimer=useRef<ReturnType<typeof setTimeout>>();
  const [loopWaiting,setLoopWaiting]=useState(false);
  const stopPlayback=useCallback(()=>{clearTimeout(loopTimer.current);loopTimer.current=undefined;setLoopWaiting(false);controller.stop();},[controller]);
  useEffect(()=>()=>{clearTimeout(loopTimer.current);},[]);
  const [history, setHistory] = useState<CorrectionHistory>(() => startHistory(props.model));
  const [preview, setPreview] = useState<CorrectionModel>();
  const present = history.present;
  const shown = preview ?? present;
  const meter = beatsPerBarFor(present.timeSignature);
  const totalBars = Math.ceil(present.totalBeats / meter);
  const firstBeat = progression ? present.cards[0]?.start ?? 0 : 0;
  const durationBars = Math.ceil((present.totalBeats-firstBeat)/meter);
  const reviewCards = useMemo(() => present.cards.filter((card) => card.reviewReasons.length > 0), [present.cards]);
  // P17-02: recommendations are analysis bars (source time); move them to the screen and
  // leave out the ranges that touch a cut (their content is no longer contiguous).
  const recommendedCandidates = useMemo(
    () => progression ? [] : recommendedOnScreen(props.blockCandidates, removedBarsOf(present), meter, totalBars),
    [progression, props.blockCandidates, present, meter, totalBars],
  );
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
      if (props.progression) return;
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
  const [selectedId, setSelectedId] = useState<string | undefined>(progression?.selectedCardId);
  const [selectedNotes, setSelectedNotes] = useState<ReadonlySet<string>>(() => new Set());
  const [mode, setMode] = useState<Mode>("check");
  const [melodyLine, setMelodyLine] = useState<number>();
  // P10.3 §1: notices go after 5 s (they stay while the pointer is on them).
  const { notice, say: setNotice, hold: holdNotice } = useFadingNotice();
  // P10.3 §1: deciding and dropping the save range is said to screen readers only.
  const [announcement, setAnnouncement] = useState("");
  const [zoom, setZoom] = useState<Zoom>(() => progression ? (durationBars<=8?"8":"16") : totalBars <= 16 ? "all" : "16");
  const [customPx, setCustomPx] = useState(24);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [follow, setFollow] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [closedSuggestions, setClosedSuggestions] = useState<ReadonlySet<string>>(() => new Set());
  const [confirm, setConfirm] = useState<"runs" | "same-fix" | "restart">();
  const [nameEditor, setNameEditor] = useState<{ cardId: string; anchor: HTMLElement }>();
  const [rename, setRename] = useState<{ cardId: string; before: string }>();
  const [boundaryTip, setBoundaryTip] = useState<{ x: number; text: string }>();
  const boundaryDrag = useRef<{ leftId: string; pointerId: number; result?: EditResult }>();
  const [segmentsOpen, setSegmentsOpen] = useState(() => typeof window === "undefined" || !window.matchMedia?.("(max-width: 959px)").matches);
  const [panelOpen, setPanelOpen] = useState(false);
  const [saveRange, setSaveRange] = useState<SaveRange>();
  // P10.2 addendum 2 §2: the rows of 「区切りごとに保存」 while its dialog is open.
  const [sectionRows, setSectionRows] = useState<SectionSaveRow[]>();
  // P10.2 §9: 「ここから」 after a first right-click on a card, and the card the pointer is on.
  const [rangeFrom, setRangeFrom] = useState<string>();
  const [rangeHover, setRangeHover] = useState<string>();
  const keyboardMenuRef = useRef<{ cardId: string; at: number }>();
  const [hoverBar, setHoverBar] = useState<number>();
  const segmentDrag = useRef<{ segment: CorrectionSegment; edge: SegmentEdge; pointerId: number; x: number; moved: boolean; result?: EditResult }>();
  const [segmentTip, setSegmentTip] = useState<{ x: number; text: string }>();
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
  const { enabled: metronome } = useMetronome();
  // P10.2 §1: the settings menu (押して鳴らす, 凡例を出す, 最初からやり直す…).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [legendVisible, setLegendVisible] = useState(getLegendVisible);
  const [recommendedOpen, toggleRecommended] = useRecommendedOpen();
  // P10.2 §10.1: in the full-height layout the piano roll takes the room left, with more pitch rows.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [rollRoom, setRollRoom] = useState(0);

  const minPx = viewportWidth > 0 ? viewportWidth / Math.max(meter, present.totalBeats-firstBeat) : 8;
  const maxPx = viewportWidth > 0 ? viewportWidth / 8 : 60;
  const pxPerBeat = Math.min(maxPx, Math.max(minPx, zoom === "all" ? minPx
    : zoom === "16" ? viewportWidth / (16 * meter)
      : zoom === "8" ? viewportWidth / (8 * meter)
      : zoom === "4" ? viewportWidth / (4 * meter)
        : customPx)) || 8;
  const initialScroll=useRef(false);
  useLayoutEffect(()=>{
    if(!progression || viewportWidth<=0 || !scrollRef.current)return;
    if(!initialScroll.current || zoom==='all') {scrollRef.current.scrollLeft=firstBeat*pxPerBeat;setScrollLeft(firstBeat*pxPerBeat);initialScroll.current=true;}
  },[Boolean(progression),viewportWidth,zoom,firstBeat,pxPerBeat]);
  const canvasWidth = Math.max(viewportWidth, present.totalBeats * pxPerBeat);
  const extraRows = Math.max(0, Math.floor(rollRoom / ROW_PX) - (present.pitchRange.high - present.pitchRange.low + 1));
  const addLow = Math.min(present.pitchRange.low, Math.floor(extraRows / 2));
  const low = present.pitchRange.low - addLow;
  const high = Math.min(127, present.pitchRange.high + extraRows - addLow);
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

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || typeof ResizeObserver === "undefined") return undefined;
    const media = window.matchMedia?.("(min-width: 1220px)");
    const update = () => {
      const roll = body.querySelector<HTMLElement>(".lv-cw-roll");
      const scroll = scrollRef.current;
      // Only where the workspace has a fixed height; elsewhere the page grows with the roll.
      if (!media?.matches || !roll || !scroll) { setRollRoom(0); return; }
      setRollRoom(body.clientHeight - roll.offsetTop - (scroll.offsetHeight - scroll.clientHeight));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(body);
    media?.addEventListener?.("change", update);
    return () => { observer.disconnect(); media?.removeEventListener?.("change", update); };
  }, [segmentsOpen]);

  // ---- editing ---------------------------------------------------------------------------
  const apply = useCallback((result: EditResult) => {
    result = guardProgressionNotes(result);
    if (!result.changed) { setNotice(result.message); return; }
    const before = new Map(historyRef.current.present.cards.map((card) => [card.id, card.name.label]));
    const renamed = result.kind === "name" ? [] : result.model.cards.filter((card) => before.has(card.id) && before.get(card.id) !== card.name.label);
    // P5.26.1: a span edit keeps the names; when the notes now read differently, say where to take it.
    const offered = result.kind === "name" ? [] : result.model.cards.filter((card) => card.suggestedName && card.suggestedName.label !== card.name.label && historyRef.current.present.cards.find((entry) => entry.id === card.id)?.suggestedName?.label !== card.suggestedName.label);
    setNotice(result.message ?? (renamed.length === 1 ? `名前を ${renamed[0]!.name.label} にしました（音から）` : renamed.length > 1 ? `${renamed.length}枚の名前を音から変えました` : offered.length === 1 ? `音からの判別：${offered[0]!.suggestedName!.label}（名前は変えていません。右の欄で選べます）` : offered.length > 1 ? `${offered.length}枚に音からの判別があります（名前は変えていません）` : undefined));
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
  const songPlaying = loopWaiting || (playback.status !== "idle" && samePlaybackSource(playback.source, fullSource));
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

  // P17-01 §3: picking a card by click or right-click drops any note selection, so Delete
  // cannot mean two things. The piano roll keeps its own note selection.
  const selectCardRow = useCallback((card: CorrectionCard, reveal = true) => {
    setSelectedNotes(new Set());
    selectCard(card, reveal);
  }, [selectCard]);
  const [cardMenu, setCardMenu] = useState<{ card: CorrectionCard; x: number; y: number }>();
  const cardMenuReturn = useRef<HTMLElement | null>(null);
  const closeCardMenu = useCallback((restoreFocus = false) => {
    setCardMenu(undefined);
    if (restoreFocus) cardMenuReturn.current?.focus?.();
  }, []);
  const openCardMenu = useCallback((card: CorrectionCard, x: number, y: number, from?: HTMLElement) => {
    setSelectedNotes(new Set());
    setSelectedId(card.id);
    cardMenuReturn.current = from ?? null;
    setCardMenu({ card, x, y });
  }, []);
  // P17-02 §10: the bar row's menu (right-click a bar number).
  const [barMenu, setBarMenu] = useState<{ bar: number; x: number; y: number }>();
  const closeBarMenu = useCallback(() => setBarMenu(undefined), []);
  /** Remove whole bars and close the gap; the selection, the range and the 保存済み marks follow. */
  const cut = useCallback((startBar: number, endBar: number) => {
    const before = historyRef.current.present;
    const result = cutBars(before, startBar, endBar);
    if (!result.changed) {
      setNotice(result.message);
      setBarMenu(undefined);
      setCardMenu(undefined);
      return;
    }
    const next = result.model;
    if (selectedId && !next.cards.some((card) => card.id === selectedId)) {
      const at = before.cards.findIndex((card) => card.id === selectedId);
      const beat = before.cards[at]?.start ?? 0;
      const fallback = next.cards.find((card) => card.start >= beat - 1e-6) ?? next.cards[next.cards.length - 1];
      setSelectedId(fallback?.id);
    }
    setSelectedNotes(new Set());
    setRangeHover(undefined);
    if (rangeFrom && !next.cards.some((card) => card.id === rangeFrom)) setRangeFrom(undefined);
    if (saveRange) setSaveRange(shiftSaveRange(saveRange, startBar, endBar));
    setSavedRanges((current) => {
      const out = new Set<string>();
      for (const key of current) {
        const shifted = shiftRangeKey(key, startBar, endBar);
        if (shifted) out.add(shifted);
      }
      return out;
    });
    setSectionRows(undefined);
    setBarMenu(undefined);
    setCardMenu(undefined);
    apply(result);
  }, [apply, rangeFrom, saveRange, selectedId]);

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

  // P10.2 §3: with no card selected, the song starts at the first card in view (「▶ ここから」).
  const cueCard = selected ? undefined : leftCardInView(present.cards, scrollLeft / pxPerBeat, (scrollLeft + viewportWidth) / pxPerBeat);
  const playFrom = progression && saveRange ? Math.max(songStartBeat, (saveRange.startBar - 1) * meter) : selected?.start ?? (progression ? songStartBeat : cueCard?.start) ?? songStartBeat;
  // Where the playhead is now (the rAF loop keeps it), for carrying on after a tempo or metronome change.
  const playBeatRef = useRef(songStartBeat);

  /**
   * P10.2 §2: the workspace's notes (each card's 「B」, what saving writes) from `fromBeat` to
   * the end, as a notes request; with the header's metronome on, clicks on the song's beats (§6).
   * Following turns on with every play (P10.1 §4).
   */
  const playSongRef=useRef<(beat:number,bpm?:number,clicks?:boolean)=>void>();
  const loopRangeRef=useRef(saveRange);loopRangeRef.current=saveRange;
  const playSong = useCallback((fromBeat: number, bpm = songBpm, clicks = metronome) => {
    clearTimeout(loopTimer.current);loopTimer.current=undefined;setLoopWaiting(false);
    let loopStarted=performance.now();
    const loopDuration=saveRange ? (Math.min(saveRange.endBar*meter,present.totalBeats)-fromBeat)*60000/bpm : 0;
    const request: PlaybackRequest = { type: "notes", notes: progression ? progressionSongNotes(present, fromBeat, bpm, clicks, saveRange) : songPlaybackNotes(present, timeline, fromBeat, bpm, clicks), bpm, sound: previewSound };
    if (import.meta.env.VITE_P527_E2E_FIXTURE === "1") (window as { __lvWorkspaceSong?: unknown }).__lvWorkspaceSong = { fromBeat, ...request };
    playBeatRef.current = fromBeat;
    if(progression&&import.meta.env.VITE_P527_E2E_FIXTURE==='1') {const target=window as typeof window&{__lvProgressionPlayback?:{count:number;request:PlaybackRequest}};target.__lvProgressionPlayback={count:(target.__lvProgressionPlayback?.count??0)+1,request};}
    setPlayStartBeat(fromBeat);
    setFollow(true);
    void controller.play(fullSource, request, progression && saveRange ? { onStarted:()=>{loopStarted=performance.now();}, onEnded: (reason) => { if (reason === "completed" && loopRangeRef.current) {
      setLoopWaiting(true);
      loopTimer.current=setTimeout(()=>{setLoopWaiting(false);if(loopRangeRef.current)playSongRef.current?.(Math.max(songStartBeat,(loopRangeRef.current.startBar-1)*meter));},Math.max(0,loopDuration-(performance.now()-loopStarted)));
    } } } : undefined).catch(onPlaybackError);
  }, [controller, fullSource, metronome, onPlaybackError, present, previewSound, songBpm, timeline, progression, saveRange]);
  playSongRef.current=playSong;
  const toggleSong = useCallback(() => {
    if (playingRef.current) stopPlayback();
    else playSong(playFrom);
  }, [controller, playFrom, playSong]);
  /** The head of the card sounding now (undefined when stopped): a change while playing carries on from there. */
  const soundingCardStart = () => playingRef.current ? (present.cards.find((card) => playBeatRef.current >= card.start && playBeatRef.current < card.start + card.duration)?.start ?? playBeatRef.current) : undefined;
  // P10.2 §6: the header's metronome switched while the song plays → carry on from the sounding card.
  const metronomeRef = useRef(metronome);
  const resumeRef = useRef<(clicks: boolean) => void>(() => undefined);
  resumeRef.current = (clicks) => { const at = soundingCardStart(); if (at !== undefined) playSong(at, songBpm, clicks); };
  useEffect(() => {
    if (metronomeRef.current === metronome) return;
    metronomeRef.current = metronome;
    resumeRef.current(metronome);
  }, [metronome]);
  /** P10.2 §4: ⏮ and Home — no card selected, the view at the start; playing, from the start again. */
  const goToStart = useCallback(() => {
    setSelectedId(undefined);
    const element = scrollRef.current;
    if (element) element.scrollLeft = firstBeat*pxPerBeat;
    setScrollLeft(firstBeat*pxPerBeat);
    if (playingRef.current) playSong(songStartBeat);
  }, [playSong, songStartBeat,firstBeat,pxPerBeat]);

  const auditionNotes = (model: CorrectionModel, card: CorrectionCard) => progression ? (card.name.label === "N.C." ? [] : usedNotes(model, card.id)) : cardAuditionNotes(model, card, timeline);
  const sourceId = (kind: string, card: CorrectionCard): PlayingSource => ({ kind: "capture", id: `${fullSource.id}:workspace-${kind}:${card.id}` });
  const playNotes = useCallback((kind: string, card: CorrectionCard, notes: readonly number[]) => {
    void controller.toggle(sourceId(kind, card), { type: "chord", chord: card.name, sound: previewSound, explicitMidiNotes: [...notes] })
      .catch(onPlaybackError);
  }, [controller, fullSource.id, onPlaybackError, previewSound]);
  const auditionCard = (card: CorrectionCard) => {
    void controller.play(sourceId("card", card), { type: "chord", chord: card.name, sound: previewSound, explicitMidiNotes: auditionNotes(present, card) })
      .catch(onPlaybackError);
  };
  const cardNotesOf = (card: CorrectionCard) => byCard.get(card.id) ?? [];
  const playCard = useCallback((kind: "source" | "card") => {
    if (!selected) return;
    const mine = present.notes.filter((note) => note.cardId === selected.id);
    const savedCard = progression ? props.model.cards.find(c => c.id === selected.id) : undefined;
    const notes = kind === "source" && progression
      ? savedCard ? usedNotes(props.model, savedCard.id) : []
      : kind === "source"
      ? [...new Set(mine.filter((note) => note.provenance === "SOURCE").map((note) => note.originalPitch ?? note.pitch))].sort((a, b) => a - b)
      : progression ? usedNotes(present, selected.id) : cardAuditionNotes(present, selected, timeline); // exactly what saving writes (P10.0-06)
    playNotes(kind, selected, notes);
  }, [playNotes, present, selected, timeline]);
  const cardPlaying = selected && playback.status !== "idle"
    ? samePlaybackSource(playback.source, sourceId("source", selected)) ? "source"
      : samePlaybackSource(playback.source, sourceId("card", selected)) ? "card" : null
    : null;

  const enterEdit = useCallback(() => {
    setMode("edit");
    if (selected && !progression) {
      const top = Math.max(...present.notes.filter((note) => note.cardId === selected.id).map((note) => note.pitch), low);
      setMelodyLine(top - 1);
    }
  }, [low, present.notes, selected, progression]);

  // ---- card edits (P10.0-04) -------------------------------------------------------------
  const pickName = useCallback((name: ChordSymbol, cardId: string, source: NameSource = "chosen") => {
    const before = present.cards.find((card) => card.id === cardId)?.name.label;
    const result = edit((model) => progression ? replaceProgressionName(model, cardId, name, alignNotes) : chooseName(model, cardId, name, source));
    if (result.changed && before) setRename({ cardId, before });
  }, [edit, present.cards, progression, alignNotes]);
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
    () => !progression && rename && selected && rename.cardId === selected.id ? sameFixTargets(present, selected.id, rename.before) : [],
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
    const step = !progression && event.altKey ? 0.25 : 1;
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
        if (key === "Enter" && confirm !== "restart") { handled(); runConfirm(); }
        return;
      }
      if (nameEditor || event.defaultPrevented || event.isComposing || event.altKey || event.metaKey) return;
      // P17-01 §3.2: while the card menu is open it owns the keys (Esc closes it and returns the focus).
      if (cardMenu) { if (key === "Escape") { handled(); closeCardMenu(true); } return; }
      // P17-02: the bar menu owns the keys while open.
      if (barMenu) { if (key === "Escape") { handled(); closeBarMenu(); } return; }
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
      else if (key === "Home") { handled(); goToStart(); }
      else if (key === "End") { handled(); stopFollow(); selectCard(present.cards[present.cards.length - 1]); }
      else if (key === "?") { handled(); setHelpOpen((value) => !value); }
      else if (key === "Delete" && !ids.length && selected) {
        handled();
        if (progression) edit(model => deleteProgressionCard(progression.base, model, selected.id, "extend-previous"));
        else {
          // P17-01 §1: the card that took the deleted card's place becomes the selection.
          const at = present.cards.findIndex((card) => card.id === selected.id);
          const keep = present.cards[at - 1] ?? present.cards[at + 1];
          edit((model) => deleteCard(model, selected.id, "extend-previous"));
          if (keep) setSelectedId(keep.id);
        }
      }
      else if ((key === "Delete" || key === "Backspace") && ids.length) { handled(); edit((model) => deleteNotes(model, ids)); }
      else if ((key === "r" || key === "R") && ids.length) { handled(); edit((model) => restoreNotes(model, ids)); }
      else if (key === "n" || key === "N") { handled(); if (progression && mode === "edit") setMode("check"); else enterEdit(); }
      else if ((key === "m" || key === "M") && event.shiftKey) { handled(); askMergeRuns(); }
      else if ((key === "m" || key === "M") && selected) { handled(); edit((model) => mergeWithNext(model, selected.id)); }
      else if ((key === "s" || key === "S") && selected) { handled(); edit((model) => splitCard(model, selected.id)); }
      else if (key === "y" || key === "Y") { handled(); markAndNext(); }
      else if (key === "F2" && selected) { handled(); openNameEditor(selected.id); }
      else if (/^[1-4]$/.test(key) && selected) {
        const name = (progression ? progression.namesFor(present, selected) : nameCandidatesFor(selected, present.notes.filter((note) => note.cardId === selected.id)))[Number(key) - 1];
        if (name) { handled(); pickName(name, selected.id); }
      }
      else if (key === "a" || key === "A") { handled(); playCard("source"); }
      else if (key === "b" || key === "B") { handled(); playCard("card"); }
      else if (key === "Enter") { handled(); setMode("check"); setSelectedNotes(new Set()); }
      else if (key === "Escape") {
        if (helpOpen) { handled(); setHelpOpen(false); }
        else if (settingsOpen) { handled(); setSettingsOpen(false); }
        else if (ids.length) { handled(); setSelectedNotes(new Set()); }
        else if (rangeFrom) { handled(); setRangeFrom(undefined); setRangeHover(undefined); }
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
  }, [askMergeRuns, barMenu, cardMenu, closeBarMenu, closeCardMenu, confirm, edit, enterEdit, goToStart, helpOpen, markAndNext, nameEditor, nextReview, openNameEditor, pickName, playCard, present, rangeFrom, runConfirm, selectCard, saveRange, settingsOpen, selectNotes, selected, selectedId, selectedIndex, selectedNotes, stopFollow, toggleSong, undoOnce, progression, mode]);

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

  const suggestion = progression ? undefined : present.suggestions.find((entry) => !closedSuggestions.has(entry.kind));
  const closeSuggestion = (kind: string) => setClosedSuggestions((current) => new Set([...current, kind]));
  const barStep = pxPerBeat * meter < 18 ? 8 : pxPerBeat * meter < 36 ? 4 : 1;
  const viewStart = scrollLeft / pxPerBeat;
  const viewEnd = (scrollLeft + viewportWidth) / pxPerBeat;
  const cardAt = (beat: number) => present.cards.find((card) => beat >= card.start && beat < card.start + card.duration);
  const positionOf = (beat: number) => {
    const card = cardAt(beat);
    return card ? `${card.bar}.${card.beat}` : `${Math.floor(beat / meter) + 1}.1`;
  };
  const position = positionOf(playFrom);
  // Spec v2.5 §7.3: the playhead moves every frame (transform only; the workspace is not
  // re-rendered), and following scrolls in the same frame. Reduced motion keeps it moving:
  // it is position information, and following never scrolls smoothly.
  const startedAt = songPlaying && playback.status === "playing" ? playback.startedAt : undefined;
  const positionRef = useRef(positionOf);
  positionRef.current = positionOf;
  const cardAtRef = useRef(cardAt);
  cardAtRef.current = cardAt;
  useEffect(() => {
    if (startedAt === undefined) return undefined;
    let frame = 0;
    let lastLabel = "";
    let lastCard: string | undefined;
    const canvas = scrollRef.current;
    const unmark = () => canvas?.querySelectorAll("[data-playing]").forEach((element) => element.removeAttribute("data-playing"));
    const step = () => {
      const beat = playheadBeatAt(performance.now(), startedAt, songBpm, playStartBeat);
      playBeatRef.current = beat;
      // P10.2 §5: the sounding card and its notes are marked only when the card changes
      // (or when its element is drawn again after scrolling), never by re-rendering.
      const card = cardAtRef.current(beat);
      const cardElement = card ? canvas?.querySelector<HTMLElement>(`.lv-cw-card[data-card-id="${card.id}"]`) : null;
      if (card?.id !== lastCard || (cardElement && !cardElement.hasAttribute("data-playing"))) {
        unmark();
        lastCard = card?.id;
        if (card && canvas) {
          canvas.querySelectorAll(`.lv-cw-note[data-card="${card.id}"]`).forEach((element) => element.setAttribute("data-playing", ""));
          if (cardElement) {
            cardElement.style.setProperty("--lv-cw-play-ms", `${card.duration * 60000 / songBpm}ms`);
            cardElement.style.setProperty("--lv-cw-play-at", `${-(beat - card.start) * 60000 / songBpm}ms`);
            cardElement.setAttribute("data-playing", "");
          }
        }
      }
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
    return () => { cancelAnimationFrame(frame); unmark(); };
  }, [playStartBeat, pxPerBeat, present.totalBeats, songBpm, startedAt]);
  // P10.2 §10.2: the bars and the tempo are in the control bar, not repeated here.
  const fileMeta = [present.timeSignature ?? "4/4", props.analysisModeLabel, props.analysisTargetLabel]
    .filter(Boolean).join("・");
  const count = editCount(history);
  const last = lastEditLabel(history);
  const next = history.future[history.future.length - 1]?.label;
  const midiBpm = present.bpm ? Math.round(present.bpm) : PLAYER_DEFAULT_BPM;
  const tempoMissing = props.tempoMissing || !present.bpm;
  /** A tempo from the field, the drag, the wheel or ↺ MIDI: one edit; playing, it carries on from the sounding card. */
  const commitTempo = (bpm: number) => {
    const result = setTempo(present, bpm);
    if (!result.changed) return;
    const resumeAt = soundingCardStart();
    apply(result);
    if (resumeAt !== undefined) playSong(resumeAt, bpm);
  };
  /** P10.2 §12: back to the workspace as it was right after the import; the history goes too. */
  const restart = () => {
    if (playingRef.current) stopPlayback();
    setHistory(startHistory(props.model));
    setPreview(undefined);
    setSelectedId(undefined);
    setSelectedNotes(new Set());
    setSaveRange(undefined);
    setRangeFrom(undefined);
    setRangeHover(undefined);
    setMode("check");
    setMelodyLine(undefined);
    setRename(undefined);
    if (scrollRef.current) scrollRef.current.scrollLeft = firstBeat*pxPerBeat;
    setScrollLeft(firstBeat*pxPerBeat);
    metricsRef.current.restarts = (metricsRef.current.restarts ?? 0) + 1;
    setNotice(progression ? "保存した時に戻しました" : "最初からやり直しました");
  };
  // P10.3 §1: whichever way the range is set or dropped, it is announced (not shown: the frame and the chip show it).
  const announcedRange = useRef<SaveRange>();
  useEffect(() => {
    const before = announcedRange.current;
    announcedRange.current = saveRange;
    if (saveRange) setAnnouncement(`保存する範囲を ${barRangeLabel(saveRange.startBar, saveRange.endBar)}（${cardsInRange(historyRef.current.present, saveRange).length}コード）にしました`);
    else if (before) setAnnouncement("保存する範囲を外しました");
  }, [saveRange]);
  // The settings menu closes on a press outside it.
  useEffect(() => {
    if (!settingsOpen) return undefined;
    const close = (event: PointerEvent) => { if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false); };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [settingsOpen]);
  useEffect(()=>{progression?.onSelectedCardChange?.(selectedId);},[selectedId,progression?.onSelectedCardChange]);
  useEffect(() => { progression?.onModelChange?.(present); }, [present, progression?.onModelChange]);
  const changedCards = progression ? changedProgressionCards(progression.base, present) : [];
  const dirty = progression ? Object.keys(progressionChanges(progression.base,present)).length>0 : count > 0 && savedContentDiffers(history.present, savedPresent);
  const unsavedCount = dirty ? Math.max(1, count - savedCount) : 0;
  const { onDirtyChange } = props;
  useEffect(() => { onDirtyChange?.(unsavedCount); }, [unsavedCount, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(0), [onDirtyChange]);
  useEffect(() => unsavedCount && !progression ? registerCloseBlocker({
    title: UNSAVED_TITLE,
    message: unsavedMessage(unsavedCount, "閉じる"),
    confirmLabel: "保存せずに閉じる",
    cancelLabel: "戻る",
  }) : undefined, [unsavedCount]);
  const guarded = (action: () => void) => () => { if (dirty) setPendingLeave(() => action); else action(); };
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
  // P10.2 addendum 2 §1: with no range chosen, the whole song (first card's bar to last card's bar).
  const formRange = saveRange ?? wholeSongRange(present);
  /** Saved ranges get 「保存済み」; what is saved now is the last saved state (unsaved changes). */
  const markSaved = (ranges: readonly SaveRange[], kind: SaveKind) => {
    setSavedRanges((current) => new Set([...current, ...ranges.map(rangeKey)]));
    setSavedPresent(history.present);
    setSavedCount(editCount(history));
    for (let index = 0; index < ranges.length; index += 1) metricsRef.current.saves.push({ atMs: Date.now(), reviewMarks: reviewCards.length, kind });
  };
  /** P10.2 §9 / P10.3 §1: the range decided by right-clicks (the decided range is announced below). */
  const chooseRange = (next: SaveRange) => setSaveRange(next);
  const markRange = (card: CorrectionCard, immediate: boolean) => {
    const pending = rangeFrom ? present.cards.find((entry) => entry.id === rangeFrom) : undefined;
    const next = pickRangeCard(pending, card, meter, immediate);
    setRangeFrom(next.pending?.id);
    setRangeHover(undefined);
    if (next.range) chooseRange(next.range);
  };
  const rangeFromCard = rangeFrom ? present.cards.find((card) => card.id === rangeFrom) : undefined;
  const rangeHoverCard = rangeHover ? present.cards.find((card) => card.id === rangeHover) : undefined;
  const pendingRange = rangeFromCard ? cardsBarRange(rangeFromCard, rangeHoverCard ?? rangeFromCard, meter) : undefined;
  /** P10.2 §8: the bar under the pointer on the bar row. */
  const barAtPointer = (event: { clientX: number; currentTarget: HTMLElement }) => {
    const box = event.currentTarget.getBoundingClientRect();
    return Math.min(totalBars, Math.max(1, Math.floor((event.clientX - box.left) / pxPerBeat / meter) + 1));
  };
  /** P10.2 §11: a segment edge moved; a save range that was this segment follows it. */
  const applySegment = (result: EditResult, segment: CorrectionSegment) => {
    if (!result.changed) return;
    apply(result);
    const moved = result.model.segments.find((entry) => entry.id === segment.id);
    if (moved && saveRange?.startBar === segment.startBar && saveRange.endBar === segment.endBar) setSaveRange({ startBar: moved.startBar, endBar: moved.endBar });
  };
  function startSegmentEdge(event: ReactPointerEvent<HTMLSpanElement>, segment: CorrectionSegment, edge: SegmentEdge) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    segmentDrag.current = { segment, edge, pointerId: event.pointerId, x: event.clientX, moved: false };
  }
  function dragSegmentEdge(event: ReactPointerEvent<HTMLSpanElement>) {
    const drag = segmentDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.abs(event.clientX - drag.x) < 4) return;
    drag.moved = true;
    const box = event.currentTarget.parentElement!.getBoundingClientRect();
    const line = Math.round((event.clientX - box.left) / pxPerBeat / meter); // the bar line nearest the pointer
    const result = moveSegmentEdge(present, drag.segment.id, drag.edge, drag.edge === "end" ? line : line + 1);
    drag.result = result.changed ? result : undefined;
    setPreview(drag.result?.model);
    const moved = drag.result?.model.segments.find((entry) => entry.id === drag.segment.id);
    setSegmentTip(moved ? { x: (drag.edge === "end" ? moved.endBar : moved.startBar - 1) * meter * pxPerBeat, text: drag.edge === "end" ? `${moved.endBar}小節まで` : `${moved.startBar}小節から` } : undefined);
  }
  function endSegmentEdge(event: ReactPointerEvent<HTMLSpanElement>) {
    const drag = segmentDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    segmentDrag.current = undefined;
    setPreview(undefined);
    setSegmentTip(undefined);
    // Pressed without moving: the segment becomes the save range, as a click on it does.
    if (!drag.moved) setSaveRange({ startBar: drag.segment.startBar, endBar: drag.segment.endBar });
    else if (drag.result) applySegment(drag.result, drag.segment);
  }
  const rangeDrag=useRef<{end:'a'|'b';pointer:number}>();
  const moveRange=(event:ReactPointerEvent<HTMLElement>)=>{
    if(!rangeDrag.current||!saveRange||rangeDrag.current.pointer!==event.pointerId)return;
    const box=scrollRef.current?.querySelector('.lv-cw-canvas')?.getBoundingClientRect();if(!box)return;
    const bar=Math.max(Math.floor(firstBeat/meter)+1,Math.min(totalBars,Math.floor((event.clientX-box.left)/pxPerBeat/meter)+1));
    setSaveRange(rangeDrag.current.end==='a'?{...saveRange,startBar:Math.min(bar,saveRange.endBar)}:{...saveRange,endBar:Math.max(bar,saveRange.startBar)});
  };
  const rangeHandle=(end:'a'|'b')=>progression?<button type="button" className="lv-cw-range-handle" data-end={end} aria-label={`範囲の${end==='a'?'始まり':'終わり'}`} onPointerDown={event=>{rangeDrag.current={end,pointer:event.pointerId};event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();}} onPointerMove={moveRange} onPointerUp={()=>{rangeDrag.current=undefined;}} onPointerCancel={()=>{rangeDrag.current=undefined;}} onKeyDown={event=>{if(!saveRange||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopPropagation();const delta=event.key==='ArrowLeft'?-1:1;if(end==='a')setSaveRange({...saveRange,startBar:Math.max(Math.floor(firstBeat/meter)+1,Math.min(saveRange.endBar,saveRange.startBar+delta))});else setSaveRange({...saveRange,endBar:Math.min(totalBars,Math.max(saveRange.startBar,saveRange.endBar+delta))});}}>{end.toUpperCase()}</button>:<i data-end={end}>{end.toUpperCase()}</i>;
  // P10.2 addendum 1 §1.2: with a pending range as well, its frame goes under the decided one.
  const cardsRowHeight = saveRange && pendingRange ? 94 : 80;
  const barNumbers = Array.from({ length: totalBars }, (_, index) => index + 1)
    .filter((bar) => (bar - 1) % barStep === 0 && overlaps((bar - 1) * meter, meter * barStep, range));
  // P17-02: the bars a card covers (the card menu's 「◯小節を消して詰める」).
  const cardMenuCutFrom = cardMenu ? Math.floor(cardMenu.card.start / meter + 1e-6) + 1 : 1;
  const cardMenuCutTo = cardMenu
    ? Math.max(cardMenuCutFrom, Math.floor((cardMenu.card.start + cardMenu.card.duration - 1e-6) / meter) + 1)
    : 1;
  const cardMenuCutDisabled = cardMenuCutTo >= totalBars;

  return (
    <section
      ref={rootRef}
      className="lv-cw"
      data-progression={progression ? true : undefined}
      tabIndex={-1}
      data-testid="correction-workspace"
      data-mode={mode}
      aria-label="修正作業場"
      onPointerDownCapture={() => { pointerUsedRef.current = true; }}
    >
      {progression ? progression.header(present, apply) : <div className="lv-cw-file">
        <span className="lv-cw-file-name">{props.fileName}</span>
        <span className="lv-cw-file-meta" title={fileMeta} data-testid="capture-analysis-preset-summary">{fileMeta}</span>
        <span className="lv-cw-spacer" />
        <button type="button" className="lv-cw-stat" data-kind="warn" onClick={() => nextReview(1)} disabled={!reviewCards.length} data-testid="correction-review-count">
          要確認 <b>{reviewCards.length}</b>
        </button>
        <span className="lv-cw-stat" data-testid="correction-edit-count">直した回数 <b>{count}</b></span>
        {props.onPartSettings ? <button type="button" className="lv-cw-btn" onClick={guarded(props.onPartSettings)} data-testid="capture-change-part-selection">パートの設定</button> : null}
        <button type="button" className="lv-cw-btn" onClick={guarded(props.onChooseAnotherMidi)} data-testid="correction-another-midi">別の MIDI</button>
      </div>}

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

        <div className="lv-cw-bar" role="toolbar" aria-label="操作" data-testid="correction-control-bar" data-review={reviewCards.length ? true : undefined}>
          {/* P10.1 §1: 再生 and 表示 always share the first line. P10.2: the bar spans the workspace (one line from 1280). */}
          <div className="lv-cw-bar-lead">
          <div className="lv-cw-group" role="group" aria-label="再生">
            <button type="button" className="lv-cw-btn lv-cw-icon" onClick={goToStart} aria-label="曲の先頭へ（Home）" title="曲の先頭へ（Home）" data-testid="correction-go-start">⏮</button>
            <button
              type="button"
              className="lv-cw-btn"
              data-kind="accent"
              aria-pressed={songPlaying}
              aria-label={songPlaying ? "停止（Space）" : `${position} から再生（Space）`}
              title={songPlaying ? "停止（Space）" : `${position} から再生（Space）`}
              onClick={toggleSong}
              data-testid="correction-play-song"
            >
              {songPlaying ? "■ 停止" : "▶ 再生"}
            </button>
            <button type="button" className="lv-cw-btn" aria-pressed={follow} onClick={() => setFollow((value) => !value)} data-testid="correction-follow">追従</button>
            <TempoField
              value={songBpm}
              title={`テンポ（BPM）。上下にドラッグ・ホイールで変える。ダブルクリックで入力${tempoMissing ? "。MIDI にテンポの情報がありません" : ""}`}
              onCommit={commitTempo}
            />
            {present.tempo !== undefined ? (
              <button type="button" className="lv-cw-btn lv-cw-tempo-midi" onClick={() => commitTempo(midiBpm)} title={`MIDI の値（${midiBpm}${tempoMissing ? "・MIDI にテンポなし" : ""}）に戻す`} data-testid="correction-tempo-midi">↺ MIDI</button>
            ) : null}
            <span className="lv-cw-time" data-testid="correction-position">
              {startedAt !== undefined ? <span ref={timeRef} /> : `${position} から`} ／ {durationBars}小節
            </span>
          </div>
          <div className="lv-cw-group" role="group" aria-label="表示">
            <span className="lv-cw-seg">
              {([["all", "全体", "全体"], ["16", "16", "16小節"], ["8", "8", "8小節"], ["4", "4", "4小節"]] as const).map(([value, text, label]) => (
                <button key={value} type="button" aria-pressed={zoom === value} aria-label={label} onClick={() => setZoom(value)}>{text}</button>
              ))}
              <small aria-hidden="true">小節</small>
            </span>
          </div>
          </div>
          {/* P10.2 §1: no review buttons when there is nothing to review (the file bar still says 0). */}
          {reviewCards.length ? (
            <div className="lv-cw-group" role="group" aria-label="要確認">
              <button type="button" className="lv-cw-btn lv-cw-icon" onClick={() => nextReview(-1)} aria-label="前の要確認" title="前の要確認（[）">◀</button>
              <span className="lv-cw-nav-count">要確認 <span data-testid="correction-review-position">{reviewIndex >= 0 ? reviewIndex + 1 : "–"} / {reviewCards.length}</span></span>
              <button type="button" className="lv-cw-btn lv-cw-icon" onClick={() => nextReview(1)} aria-label="次の要確認" title="次の要確認（]）">▶</button>
            </div>
          ) : null}
          <div className="lv-cw-group" role="group" aria-label="モード">
            <span className="lv-cw-seg" title="N で音を直す・Enter で確かめるに戻る">
              <button type="button" aria-pressed={mode === "check"} onClick={() => setMode("check")} data-testid="correction-mode-check">確かめる</button>
              <button type="button" aria-pressed={mode === "edit"} onClick={() => { if (mode !== "edit") enterEdit(); }} data-testid="correction-mode-edit">音を直す</button>
            </span>
          </div>
          <div className="lv-cw-group" role="group" aria-label="履歴">
            <button type="button" className="lv-cw-btn lv-cw-icon" onClick={undoOnce} disabled={!history.past.length} aria-label={last ? `元に戻す：${last}（Ctrl+Z）` : "元に戻す（Ctrl+Z）"} title={last ? `元に戻す：${last}（Ctrl+Z）` : "元に戻す（Ctrl+Z）"} data-testid="correction-undo"><UndoIcon size={15} /></button>
            <button type="button" className="lv-cw-btn lv-cw-icon" onClick={() => setHistory(redo)} disabled={!history.future.length} aria-label={next ? `やり直す：${next}（Ctrl+Y）` : "やり直す（Ctrl+Y）"} title={next ? `やり直す：${next}（Ctrl+Y）` : "やり直す（Ctrl+Y）"} data-testid="correction-redo"><UndoIcon size={15} className="lv-cw-mirror" /></button>
          </div>
          {saveRange ? (() => {
            // P10.3 §3: the decided range as a chip (like Voicing Loop's 区間 chip); × drops it, the words show its start.
            const chords = cardsInRange(present, saveRange).length;
            return (
              <span className="lv-cw-range-chip" data-testid="correction-range-chip" title={rangeChipText(saveRange, chords)}>
                <button type="button" className="lv-cw-range-chip-text" onClick={() => { stopFollow(); scrollToBeat((saveRange.startBar - 1) * meter, "left"); }}>
                  <span className="lv-cw-chip-long">{rangeChipText(saveRange, chords)}{progression ? "・くり返し" : ""}</span>
                  <span className="lv-cw-chip-short" aria-hidden="true">{rangeChipText(saveRange, chords, true)}</span>
                </button>
                <button type="button" className="lv-cw-range-chip-clear" aria-label="範囲を外す（Esc）" title="範囲を外す（Esc）" onClick={() => setSaveRange(undefined)} data-testid="correction-range-chip-clear">×</button>
              </span>
            );
          })() : null}
          <span className="lv-cw-notice" role="status" data-testid="correction-notice" title={notice} onMouseEnter={() => holdNotice(true)} onMouseLeave={() => holdNotice(false)}>{notice}</span>
          <span className="sr-only" aria-live="polite" data-testid="correction-announce">{announcement}</span>
          <div className="lv-cw-group lv-cw-settings" ref={settingsRef}>
            <button type="button" className="lv-cw-btn lv-cw-icon" aria-haspopup="true" aria-expanded={settingsOpen} aria-label="この画面の設定" title="この画面の設定" onClick={() => setSettingsOpen((value) => !value)} data-testid="correction-settings"><GearIcon size={15} /></button>
            {settingsOpen ? (
              <div className="lv-cw-menu" role="group" aria-label="この画面の設定" data-testid="correction-settings-menu">
                <label className="lv-cw-check">
                  <input
                    type="checkbox"
                    checked={clickAudition}
                    data-testid="correction-click-audition"
                    onChange={(event) => { setClickAudition(event.target.checked); setCardClickAudition(event.target.checked); }}
                  />
                  押して鳴らす
                </label>
                <label className="lv-cw-check">
                  <input
                    type="checkbox"
                    checked={legendVisible}
                    data-testid="correction-legend-toggle"
                    onChange={(event) => { setLegendVisible(event.target.checked); storeLegendVisible(event.target.checked); }}
                  />
                  凡例を出す
                </label>
                <hr />
                <button type="button" className="lv-cw-menu-danger" disabled={history.present === props.model} onClick={() => { setSettingsOpen(false); setConfirm("restart"); }} data-testid="correction-restart">
                  {progression ? "保存した時に戻す…" : "最初からやり直す…"}
                </button>
              </div>
            ) : null}
          </div>
        </div>

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
              {shown.segments.map((segment, index) => (
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
              {saveRange ? <span className="lv-cw-ov-range" data-testid="correction-overview-range" style={{ left: pct((saveRange.startBar - 1) * meter, present.totalBeats), width: pct((saveRange.endBar - saveRange.startBar + 1) * meter, present.totalBeats) }} /> : null}
              <span className="lv-cw-ov-view" style={{ left: pct(viewStart, present.totalBeats), width: pct(Math.min(present.totalBeats, viewEnd) - viewStart, present.totalBeats) }} />
              {startedAt !== undefined ? <span ref={overviewPlayheadRef} className="lv-cw-ov-ph" data-testid="correction-overview-playhead" /> : null}
            </div>
          </div>

          <div ref={bodyRef} className="lv-cw-body">
            <div className="lv-cw-left">
              <span className="lv-cw-label" style={{ height: 26 }}>小節</span>
              {!progression ? <button type="button" className="lv-cw-label lv-cw-seg-toggle" style={{ height: segmentsOpen ? 30 : 20 }} aria-expanded={segmentsOpen} onClick={() => setSegmentsOpen((value) => !value)}>区切り</button> : null}
              <span className="lv-cw-label" style={{ height: cardsRowHeight }}>コード</span>
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
                <div
                  className="lv-cw-ruler"
                  data-testid="correction-ruler"
                  title={hoverBar ? `${hoverBar}小節の頭のカードを選ぶ` : undefined}
                  onPointerMove={(event) => setHoverBar(barAtPointer(event))}
                  onPointerLeave={() => setHoverBar(undefined)}
                  onContextMenu={(event) => {
                    // P17-02 §10: right-click a bar to remove it and close the gap (capture only).
                    if (progression) return;
                    event.preventDefault();
                    const bar = barAtPointer(event);
                    setHoverBar(bar);
                    setBarMenu({ bar, x: event.clientX, y: event.clientY });
                  }}
                  onClick={(event) => {
                    // P10.2 §8: the card sounding on the bar's first beat; Shift = the range from the selected card.
                    const card = cardForBar(present.cards, barAtPointer(event), meter);
                    if (!card) return;
                    if (event.shiftKey && selected) setSaveRange(cardsBarRange(selected, card, meter));
                    selectCard(card);
                  }}
                >
                  {hoverBar ? <span className="lv-cw-bar-hover" style={{ left: (hoverBar - 1) * meter * pxPerBeat, width: meter * pxPerBeat }} /> : null}
                  {barNumbers.map((bar) => (
                    <span key={bar} className="lv-cw-bar-no" style={{ left: (bar - 1) * meter * pxPerBeat }}>{bar}</span>
                  ))}
                </div>
                <div className="lv-cw-segments" hidden={Boolean(progression)} data-open={segmentsOpen || undefined}>
                  {segmentsOpen ? shown.segments.map((segment, index, segments) => {
                    const width = (segment.endBar - segment.startBar + 1) * meter * pxPerBeat - 2;
                    const segmentLeft = (segment.startBar - 1) * meter * pxPerBeat + 1;
                    // The name sticks to the left edge of the view (spec v2.4 §4.3), within its band.
                    const shift = Math.max(0, Math.min(scrollLeft - segmentLeft, width - 160));
                    const previous = segments[index - 1];
                    const edge = (side: SegmentEdge, x: number) => (
                      <span
                        key={`${segment.id}-${side}`}
                        className="lv-cw-seg-edge"
                        role="separator"
                        aria-label={`${segment.label}の${side === "start" ? "始まり" : "終わり"}（ドラッグで小節ずつ）`}
                        data-testid="correction-segment-edge"
                        data-edge={side}
                        data-segment-id={segment.id}
                        style={{ left: x - 3 }}
                        onPointerDown={(event) => startSegmentEdge(event, segment, side)}
                        onPointerMove={dragSegmentEdge}
                        onPointerUp={endSegmentEdge}
                        onPointerCancel={endSegmentEdge}
                      />
                    );
                    return (
                      <Fragment key={segment.id}>
                      {/* A border shared with the segment before is moved from that segment's end. */}
                      {previous && previous.endBar !== segment.startBar - 1 ? edge("start", segmentLeft - 1) : null}
                      <button type="button" className="lv-cw-segment" data-testid="correction-segment"
                        aria-pressed={saveRange?.startBar === segment.startBar && saveRange.endBar === segment.endBar}
                        data-saved={savedRanges.has(rangeKey(segment)) || undefined}
                        title={`${segment.label}を保存する範囲にする（端をドラッグ・Alt＋←→ で範囲を変える）`}
                        style={{ left: segmentLeft, width }}
                        onClick={() => setSaveRange({ startBar: segment.startBar, endBar: segment.endBar })}
                        onKeyDown={(event) => {
                          // P10.2 §11: Alt+←/→ the right edge, Alt+Shift+←/→ the left edge, a bar at a time.
                          if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
                          event.preventDefault();
                          event.stopPropagation();
                          const side: SegmentEdge = event.shiftKey ? "start" : "end";
                          const step = event.key === "ArrowRight" ? 1 : -1;
                          applySegment(moveSegmentEdge(present, segment.id, side, (side === "end" ? segment.endBar : segment.startBar) + step), segment);
                        }}>
                        <span className="lv-cw-segment-name" style={shift > 0 ? { transform: `translateX(${shift}px)` } : undefined}>
                          {segment.label}{segment.repeatCount ? (width < 140 ? ` ×${segment.repeatCount}` : ` · ${segment.repeatCount}回出てくる`) : ""}
                          {savedRanges.has(rangeKey(segment)) ? <span className="lv-cw-saved">保存済み</span> : null}
                        </span>
                      </button>
                      {index < segments.length - 1 ? edge("end", segmentLeft + width + 1) : null}
                      </Fragment>
                    );
                  }) : null}
                  {segmentTip ? <span className="lv-cw-pitch-tip" style={{ left: segmentTip.x, top: 12 }} data-testid="correction-segment-tip">{segmentTip.text}</span> : null}
                </div>
                <div className="lv-cw-cards" data-progression-card-stage={progression ? true : undefined} style={{ height: cardsRowHeight }}>
                  {shown.cards.filter((card) => overlaps(card.start, card.duration, range)).map((card) => {
                    const width = card.duration * pxPerBeat - 2;
                    const size = cardSize(width);
                    const label = cardLabel(card.name.label, width);
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
                        data-chord-card={progression ? true : undefined}
                        aria-pressed={card.id === selected?.id}
                        aria-label={`${card.bar}小節${card.beat}拍 ${card.name.label}${review ? "（要確認）" : ""}`}
                        title={card.name.label}
                        style={{ left: card.start * pxPerBeat + 1, width: Math.max(2, width) }}
                        data-card-id={card.id}
                        data-out-of-range={!inSaveRange(card) || undefined}
                        data-in-range={(saveRange && inSaveRange(card)) || undefined}
                        data-start-cue={(!songPlaying && !rangeFrom && card.id === cueCard?.id) || undefined}
                        data-range-from={card.id === rangeFrom || undefined}
                        onPointerEnter={() => { if (rangeFrom) setRangeHover(card.id); }}
                        onContextMenu={(event) => {
                          // P17-01 §3.2: the card's menu; while a save range start is pending, another card decides the range.
                          event.preventDefault();
                          const keyboard = keyboardMenuRef.current;
                          keyboardMenuRef.current = undefined;
                          if (event.detail === 0 && keyboard?.cardId === card.id && performance.now() - keyboard.at < 500) return;
                          if (event.shiftKey) { markRange(card, true); return; }
                          if (rangeFrom && card.id !== rangeFrom) { markRange(card, false); return; }
                          openCardMenu(card, event.clientX, event.clientY, event.currentTarget);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "ContextMenu" || event.key === "Menu" || (event.shiftKey && event.key === "F10")) {
                            event.preventDefault();
                            event.stopPropagation();
                            keyboardMenuRef.current = { cardId: card.id, at: performance.now() };
                            const box = event.currentTarget.getBoundingClientRect();
                            openCardMenu(card, box.left + 24, box.bottom, event.currentTarget);
                          }
                        }}
                        onClick={(event) => {
                          // Shift+click: the range from the selected card to this one, in whole bars.
                          if (event.shiftKey && selected) setSaveRange(cardsBarRange(selected, card, meter));
                          selectCardRow(card, false);
                          // 「押して鳴らす」: only a plain click, never while the song plays; the last audition stops.
                          if (clickAudition && !event.shiftKey && !songPlaying) auditionCard(card);
                        }}
                        onDoubleClick={() => openNameEditor(card.id)}
                      >
                        <span className="lv-cw-card-name" data-full-name={card.name.label} data-small={label.small}>{label.text}</span>
                        <span className="lv-cw-card-sub">
                          {review ? <span className="lv-cw-flag" aria-hidden="true" /> : null}
                          {/* P10.2 §1.1: a card exactly one bar long does not say 「4拍」. */}
                          {Math.abs(card.duration - meter) > 1e-6 ? <span>{formatBeats(card.duration)}拍</span> : null}
                          {progression && changedCards.some(c=>c.id===card.id) ? <span className="lv-cw-change">{props.model.cards.some(c=>c.id===card.id)?"変更":"追加"}</span> : null}
                          {card.attacks > 1 ? <span className="lv-cw-x">×{card.attacks}</span> : null}
                        </span>
                      </button>
                    );
                  })}
                  {shown.cards.map((card, index) => {
                    const next = shown.cards[index + 1];
                    if (!next || Math.abs(card.start + card.duration - next.start) > 1e-6 || next.start < range.from || next.start > range.to) return null;
                    return (
                      <Fragment key={`edge-${card.id}`}>
                      {progression ? <button type="button" className="lv-cw-insert" aria-label={`${card.name.label}の後に分けて足す`} style={{left:next.start*pxPerBeat-9}} onClick={()=>edit(model=>splitCard(model,card.id))}>＋</button> : null}
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
                      </Fragment>
                    );
                  })}
                  {boundaryTip ? <span className="lv-cw-pitch-tip" style={{ left: boundaryTip.x, top: 12 }}>{boundaryTip.text}</span> : null}
                  {saveRange ? (() => {
                    // P10.2 addendum 1 §1.2: the decided range stays framed (solid, A and B), its words in view.
                    const left = (saveRange.startBar - 1) * meter * pxPerBeat + 1;
                    const width = (saveRange.endBar - saveRange.startBar + 1) * meter * pxPerBeat - 2;
                    const shift = Math.max(0, Math.min(scrollLeft - left, width - 260));
                    return (
                      <span className="lv-cw-range-brace" data-confirmed data-testid="correction-range-confirmed" style={{ left, width }}>
                        {rangeHandle("a")}{rangeHandle("b")}
                        <span style={shift > 0 ? { transform: `translateX(${shift}px)` } : undefined}>{rangeCaption(saveRange, cardsInRange(present, saveRange).length)}</span>
                      </span>
                    );
                  })() : null}
                  {pendingRange ? (
                    <span className="lv-cw-range-brace" data-second={saveRange ? true : undefined} data-testid="correction-range-pending" style={{ left: (pendingRange.startBar - 1) * meter * pxPerBeat + 1, width: (pendingRange.endBar - pendingRange.startBar + 1) * meter * pxPerBeat - 2 }}>
                      <span>{rangeCaption(pendingRange, cardsInRange(present, pendingRange).length, true)}</span>
                    </span>
                  ) : null}
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
                  onPreview={(model) => setPreview(model && progression && model.cards.some(c=>c.name.label!=="N.C."&&usedNotes(model,c.id).length<2) ? undefined : model)}
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

          {legendVisible ? <div className="lv-cw-legend" aria-label="凡例" data-testid="correction-legend">
            <span><i data-kind="harmony" />使っている和音の音</span>
            <span><i data-kind="bass" />使っているベース</span>
            {!progression ? <span><i data-kind="warn" />要確認の原因</span> : null}
            <span><i data-kind="manual" />{progression ? "変えた・足した音（まだ保存していない）" : "足した音"}</span>
            {!progression ? <span><i data-kind="moved" />高さを直した音</span> : null}
            {!progression ? <span><i data-kind="melody" />メロディとして使っていない音</span> : null}
            <span><i data-kind="off" />{progression ? "外した音（破線）" : "使っていない音（破線）"}</span>
          </div> : null}

        </div>

        <aside className="lv-cw-insp" data-open={panelOpen || undefined} aria-label="選んだカード">
          <button type="button" className="lv-cw-panel-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen((value) => !value)} data-testid="correction-panel-toggle">
            {selected ? `${selected.name.label}${selected.reviewReasons.length ? "・要確認" : ""}` : "カード"}（{panelOpen ? "閉じる" : "開く"}）
          </button>
          {!progression ? <RecommendedRanges
            candidates={recommendedCandidates}
            open={recommendedOpen}
            onToggle={toggleRecommended}
            {...(saveRange ? { current: saveRange } : {})}
            saved={savedRanges}
            onPick={setSaveRange}
          /> : null}
          <div className="lv-cw-insp-scroll">
            {selected ? (
              <CorrectionInspector
                progression={progression ? {
                  names:progression.namesFor(present,selected), alignNotes, onAlignNotes:(value)=>{setAlignNotes(value);setAlignProgressionNotes(value);},
                  singleCard:present.cards.length===1, changed:changedCards.some(c=>c.id===selected.id), onReset:()=>edit(model=>resetProgressionCard(progression.base,model,selected.id)),
                  onDeleteCard:kind=>edit(model=>deleteProgressionCard(progression.base,model,selected.id,kind)),
                } : undefined}
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
                canUndo={history.past.length > 0}
                onUndo={undoOnce}
                onChooseName={(name) => pickName(name, selected.id)}
                onUseSuggestedName={(name) => pickName(name, selected.id, "auto")}
                onTypeName={() => openNameEditor(selected.id)}
                onReviewed={markAndNext}
                {...(selectedIndex > 0 ? { onMergePrevious: () => { const previous = present.cards[selectedIndex - 1]!; setSelectedId(previous.id); edit((model) => mergeWithNext(model, previous.id)); } } : {})}
                {...(selectedIndex < present.cards.length - 1 ? { onMergeNext: () => edit((model) => mergeWithNext(model, selected.id)) } : {})}
                onSplit={() => edit((model) => splitCard(model, selected.id))}
                cardCount={present.cards.length}
                {...(progression ? {} : { onDeleteCard: (mode: "extend-previous" | "extend-next") => edit((model) => deleteCard(model, selected.id, mode)) })}
                {...(sameFix.length ? { sameFix: { count: sameFix.length, onApply: () => setConfirm("same-fix") } } : {})}
              />
            ) : (
              <div className="lv-cw-insp-empty" data-testid="correction-inspector-empty">
                <p className="lv-cw-muted">{present.cards.length ? "カードを押すと、ここに音と名前が出ます。小節の番号を押すと、その小節の頭のカードを選べます。" : "カードがありません。"}</p>
                {reviewCards.length ? <button type="button" className="lv-cw-btn" data-kind="warn" onClick={() => nextReview(1)}>要確認 {reviewCards.length}</button> : null}
              </div>
            )}
          </div>
          {/* P10.2 §10.3: 保存する範囲 pinned to the bottom of the panel (おすすめ is on top, addendum 1 §2). */}
          <div className="lv-cw-insp-foot">
          {progression ? progression.save(present, saveRange, restart) : formRange ? (
            <WorkspaceSaveForm
              key={saveRange ? "range" : "whole"}
              model={present}
              timeline={timeline}
              range={formRange}
              whole={!saveRange}
              saved={savedRanges.has(rangeKey(formRange))}
              actions={props.save}
              onGoToCard={(cardId) => selectCard(present.cards.find((card) => card.id === cardId))}
              onSaved={() => markSaved([formRange], saveRange ? "range" : "whole")}
              {...(present.segments.length ? { menuExtras: [{
                label: <>区切りごとに保存… <small className="lv-cw-muted">{present.segments.length}個・同じものは1つに</small></>,
                onSelect: () => setSectionRows(sectionSaveRows(present, timeline, savedRanges)),
                testId: "correction-save-by-section",
              }] } : {})}
            />
          ) : <NoSaveRange />}
          </div>
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
            {!progression ? <span><kbd>[</kbd><kbd>]</kbd> 前後の要確認</span> : null}
            <span><kbd>N</kbd> 音を直す</span>
            <span><kbd>M</kbd> つなぐ・<kbd>S</kbd> 分ける</span>
            <span><kbd>Delete</kbd> カードを消す</span>
            <span><kbd>1</kbd>〜<kbd>4</kbd> {progression ? "コードを替える" : <>名前・<kbd>Y</kbd> このままでよい</>}</span>
            <span>{progression ? "音を直す：押して外す・空いた所で足す・上下にドラッグ" : "ロールの右クリック：外す・ダブルクリック：足す"}</span>
            <span>カードの右クリック：メニュー（消す・つなぐ・保存する範囲）</span>
            {!progression ? <span>小節の行の右クリック：その小節を消して詰める</span> : null}
            <span><kbd>A</kbd><kbd>B</kbd> 聴き比べ</span>
            <span><kbd>Space</kbd> 再生・停止（どこでも）</span>
            <span><kbd>Home</kbd> 曲の先頭へ</span>
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
      {sectionRows ? (
        <SectionSaveDialog
          rows={sectionRows}
          ideas={props.save.ideas}
          ideaTitle={props.fileName.replace(/\.midi?$/i, "")}
          onCreate={(ready, title, memoNote) => props.save.onCreate(ready, title, props.save.defaultNextAction, false, { memoNote })}
          onAppend={(ready, ideaId, memoNote) => props.save.onAppend(ready, ideaId, false, { memoNote })}
          onGoToCard={(cardId) => selectCard(present.cards.find((card) => card.id === cardId))}
          onClose={() => setSectionRows(undefined)}
          onDone={(saved, failed) => {
            setSectionRows(undefined);
            if (saved.length) markSaved(saved.map((row) => row.range), "section");
            setNotice(failed
              ? `${saved.length}個を保存しました。${failed.segment.label}で止まりました（${failed.segment.label}から後は保存していません）`
              : `${saved.length}個の進行を保存しました`);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirm === "restart"}
        title={progression ? "保存した時に戻しますか？" : "最初からやり直しますか？"}
        description={progression ? "変更を捨てて保存した状態に戻します。元に戻すでは戻せません。" : "この曲で直した内容をすべて消して、MIDI を取り込んだ直後の状態に戻します。Vault に保存した進行は消えません。"}
        confirmLabel={progression ? "変更を捨てる" : "最初からやり直す"}
        cancelLabel="戻る"
        tone="danger"
        onConfirm={() => { setConfirm(undefined); restart(); }}
        onCancel={() => setConfirm(undefined)}
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
      {cardMenu ? (
        <CardContextMenu
          x={cardMenu.x}
          y={cardMenu.y}
          card={cardMenu.card}
          progression={Boolean(progression)}
          hasPrevious={present.cards.findIndex((card) => card.id === cardMenu.card.id) > 0}
          hasNext={present.cards.findIndex((card) => card.id === cardMenu.card.id) >= 0 && present.cards.findIndex((card) => card.id === cardMenu.card.id) < present.cards.length - 1}
          singleCard={present.cards.length <= 1}
          rangePending={rangeFrom === cardMenu.card.id}
          onClose={closeCardMenu}
          onMergePrevious={() => {
            const index = present.cards.findIndex((card) => card.id === cardMenu.card.id);
            const previous = present.cards[index - 1];
            if (!previous) return;
            setSelectedId(previous.id);
            setRangeFrom(undefined);
            edit((model) => mergeWithNext(model, previous.id));
          }}
          onMergeNext={() => { setRangeFrom(undefined); edit((model) => mergeWithNext(model, cardMenu.card.id)); }}
          onSplit={() => { setRangeFrom(undefined); edit((model) => splitCard(model, cardMenu.card.id)); }}
          onTypeName={() => { setRangeFrom(undefined); openNameEditor(cardMenu.card.id); }}
          onReset={progression ? () => edit((model) => resetProgressionCard(progression.base, model, cardMenu.card.id)) : undefined}
          onStartRange={() => { setRangeFrom(cardMenu.card.id); setRangeHover(undefined); }}
          onCancelRange={() => { setRangeFrom(undefined); setRangeHover(undefined); }}
          onThisBar={() => { setSaveRange(cardsBarRange(cardMenu.card, cardMenu.card, meter)); setRangeFrom(undefined); setRangeHover(undefined); }}
          onDelete={(kind) => {
            setRangeFrom(undefined);
            if (progression) { edit((model) => deleteProgressionCard(progression.base, model, cardMenu.card.id, kind)); return; }
            if (kind === "extend-previous" || kind === "extend-next") {
              const at = present.cards.findIndex((card) => card.id === cardMenu.card.id);
              const keep = kind === "extend-previous" ? present.cards[at - 1] ?? present.cards[at + 1] : present.cards[at + 1] ?? present.cards[at - 1];
              edit((model) => deleteCard(model, cardMenu.card.id, kind));
              if (keep) setSelectedId(keep.id);
            }
          }}
          {...(progression ? {} : {
            onCutBars: () => cut(cardMenuCutFrom, cardMenuCutTo),
            cutBarsLabel: `${barRangeLabel(cardMenuCutFrom, cardMenuCutTo)}を消して詰める`,
            cutBarsDisabled: cardMenuCutDisabled,
            cutBarsHint: cardMenuCutDisabled ? "最後の1小節は消せません" : "その小節を時間ごと消して、後ろを前に詰める",
          })}
        />
      ) : null}
      {barMenu ? (
        <BarContextMenu
          x={barMenu.x}
          y={barMenu.y}
          bar={barMenu.bar}
          disabled={barMenu.bar >= totalBars}
          onClose={closeBarMenu}
          onCut={() => cut(barMenu.bar, barMenu.bar)}
        />
      ) : null}
    </section>
  );
}

/**
 * BPM 40–240 (P10.1 §12.1, P10.2 §7). Drag up/down (4px a step, Shift 12px) or the wheel
 * (±1, Shift ±10) changes the number; the value is committed once — when the drag ends,
 * or when the wheel has been still for 400ms. A double-click (or reaching it by keyboard)
 * types: Enter or leaving commits, ↑/↓ ±1 (Shift ±10) commit at once, Esc goes back.
 */
function TempoField({ value, title, onCommit }: { value: number; title: string; onCommit: (bpm: number) => void }) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number>();
  const draftRef = useRef<number>();
  draftRef.current = draft;
  const valueRef = useRef(value);
  valueRef.current = value;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  // Enter and Esc leave the field themselves; the blur that follows must not commit again.
  const skipBlur = useRef(false);
  const drag = useRef<{ y: number; from: number; pointerId: number; moved: boolean }>();
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = editing ? text : String(draft ?? value);
  const clamp = (bpm: number) => Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, bpm));
  const commit = (raw: string) => {
    setEditing(false);
    const bpm = Number(raw.trim());
    if (raw.trim() !== "" && Number.isInteger(bpm) && bpm >= TEMPO_MIN && bpm <= TEMPO_MAX && bpm !== value) onCommit(bpm);
  };
  // The wheel: a native listener so the page does not scroll.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (event: WheelEvent) => {
      if (document.activeElement === input) return;
      const delta = event.deltaY || event.deltaX;
      if (!delta) return;
      event.preventDefault();
      const next = clamp((draftRef.current ?? valueRef.current) + (event.shiftKey ? 10 : 1) * (delta < 0 ? 1 : -1));
      draftRef.current = next;
      setDraft(next);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const bpm = draftRef.current;
        setDraft(undefined);
        if (bpm !== undefined && bpm !== valueRef.current) commitRef.current(bpm);
      }, 400);
    };
    input.addEventListener("wheel", onWheel, { passive: false });
    return () => { input.removeEventListener("wheel", onWheel); clearTimeout(timer); };
  }, []);
  const endDrag = (event: ReactPointerEvent<HTMLInputElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = undefined;
    const bpm = draftRef.current;
    setDraft(undefined);
    if (current.moved && bpm !== undefined && bpm !== value) onCommit(bpm);
  };
  return (
    <label className="lv-cw-tempo" title={title}>
      BPM
      <span className="lv-cw-tempo-box" data-editing={editing || undefined}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          aria-label="テンポ（BPM）"
          data-testid="correction-tempo"
          value={shown}
          maxLength={3}
          onMouseDown={(event) => { if (!editing) event.preventDefault(); }}
          onPointerDown={(event) => {
            // A press is for dragging (no caret); a double-click types.
            if (editing || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            drag.current = { y: event.clientY, from: value, pointerId: event.pointerId, moved: false };
          }}
          onPointerMove={(event) => {
            const current = drag.current;
            if (!current || current.pointerId !== event.pointerId) return;
            const steps = Math.trunc((current.y - event.clientY) / (event.shiftKey ? 12 : 4));
            if (!steps && !current.moved) return;
            current.moved = true;
            setDraft(clamp(current.from + steps));
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={(event) => { const input = event.currentTarget; input.focus(); input.select(); }}
          onFocus={() => { setText(String(value)); setEditing(true); }}
          onChange={(event) => { setEditing(true); setText(event.target.value); }}
          onBlur={() => { if (skipBlur.current) skipBlur.current = false; else commit(text); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); commit(text); skipBlur.current = true; event.currentTarget.blur(); }
            else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditing(false); setText(String(value)); skipBlur.current = true; event.currentTarget.blur(); }
            else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
              const next = clamp((Number(text) || value) + step);
              setText(String(next));
              if (next !== value) onCommit(next);
            }
          }}
        />
        <i aria-hidden="true">↕</i>
      </span>
    </label>
  );
}

function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["← →", "前後のカード"], ["[ ]", "前後の要確認"], ["Space", "再生・停止（どこでも。選んだカードから／選んでいなければ見えている一番左のカードから）"], ["Enter", "フォーカスのあるボタンを押す"], ["F", "再生位置に追従する／しない"],
    ["Home", "曲の先頭へ（再生中なら先頭から鳴らし直す）"], ["End", "最後のカード"], ["Ctrl＋ホイール", "マウスの位置を中心に拡大縮小"],
    ["M", "次のカードとつなぐ"], ["Shift＋M", "同じ音が続く所を確認してつなぐ"], ["S", "カードを半分に分ける"],
    ["境目の取っ手", "ドラッグで1拍ずつ（Alt で ¼拍）"], ["1〜4", "名前の候補を選ぶ"], ["F2・名前をダブルクリック", "名前を文字で入れる"], ["Y", "このままでよい（次の要確認へ）"], ["N", "② 音を直す"], ["Enter", "直し終わる（①へ）"],
    ["右クリック・右ドラッグ（ピアノロール）", "元の音を外す／足した音を消す"],
    ["カードを右クリック", "メニュー（消す・つなぐ・保存する範囲）。Shift＋右クリックはそのカードの小節だけ。Shift＋F10・メニューキーでも開く"],
    ["小節の行をクリック", "その小節の頭のカードを選ぶ（Shift で範囲）"], ["小節の行を右クリック", "その小節を消して詰める（最後の1小節は消せません）"], ["区切りの端", "ドラッグで小節ずつ（Alt＋←→ 右端・Alt＋Shift＋←→ 左端）"], ["左クリック・ドラッグ（外した音）", "戻す"], ["空いた所", "①ダブルクリック／②クリックで足す"],
    ["上下ドラッグ・↑↓", "半音ずつ高さを直す"], ["Ctrl＋↑↓", "1オクターブ"], ["Delete", "音を選んでいれば外す／消す。音を選んでいなければカードを消す（前を伸ばす）。Backspace は音だけ"], ["R", "戻す"],
    ["Ctrl＋A", "選んだカードの音を全部選ぶ"], ["Ctrl＋クリック（鍵盤）", "その高さの音を曲全体で選ぶ"], ["A B", "元の音／カードの音を鳴らす"],
    ["Ctrl＋Z", "元に戻す"], ["Ctrl＋Shift＋Z・Ctrl＋Y", "やり直す"], ["?", "この一覧"], ["BPM の欄", "上下にドラッグ・ホイールで変える（Shift で細かく／大きく）。ダブルクリックで入力"],
    ["Esc", "閉じる → 音の選択 → ここから → 保存する範囲 → カードの選択の順に外す"],
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

function progressionSongNotes(model: CorrectionModel, from: number, bpm: number, clicks: boolean, range?: SaveRange) {
  const end = range ? Math.min(range.endBar * model.context.meter, model.totalBeats) : model.totalBeats;
  return [...model.cards.flatMap(card => {
    const start = Math.max(from,card.start); const stop = Math.min(end,card.start+card.duration);
    return stop <= start || card.name.label === "N.C." ? [] : usedNotes(model,card.id).map(pitch=>({pitch,startBeat:start-from,durationBeats:Math.min(stop-start,Math.max(0.4*bpm/60,(stop-start)*0.9)),velocity:89}));
  }), ...(clicks ? songClicks(from,end,model.context.meter) : [])];
}
