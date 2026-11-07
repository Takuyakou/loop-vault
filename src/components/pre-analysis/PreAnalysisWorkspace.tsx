import {
  CircleHelp,
  Eye,
  EyeOff,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject } from "react";
import {
  previewMidiNotes,
  stopPreview,
} from "../../audio/chordPreview";
import { usePreviewSound } from "../PreviewSoundProvider";
import { hasRobustTempoVariation } from "../../domain/midi/tempoAnalysis";
import {
  applyAnalysisSessionPreset,
  analysisSessionVoiceContributionPreset,
  resetAnalysisSessionAuto,
  setAnalysisSessionVoiceContributionPreset,
  sessionPreviewNotes,
  updateAnalysisSessionSource,
  updateAnalysisSessionVoice,
  type AnalysisSession,
  type PreAnalysisNote,
  type PreAnalysisSelectionPreset,
} from "../../domain/midi/preAnalysis";
import type { VoiceContributionPreset } from "../../domain/midi/types";
import {
  canSplitPart,
  deriveSplitSession,
  type PartSplits,
} from "../../domain/preAnalysisParts/splitSession";
import {
  chordsAboveLine,
  suggestMelodyFrom,
} from "../../domain/preAnalysisParts/suggestLine";
import { TimelineNavigator } from "../timeline/TimelineNavigator";
import {
  BASE_PIXELS_PER_BEAT,
  PIANO_ROLL_GUTTER,
  PreAnalysisPianoRoll,
  sessionDuration,
  type PianoRollOverlayApi,
  visibleNotes,
} from "./PreAnalysisPianoRoll";
import { harmonicCoreNoteMultipliers } from "./harmonicCorePreview";
import { buildSoundingIndex, soundingAt, soundingText } from "./playbackView";
import {
  ROLE_COLOR,
  ROLE_LABEL,
  ROLE_ORDER,
  analyzedVoiceCount,
  autoOffReason,
  autoTooltip,
  isAnalyzedVoice,
  isAutoVoice,
  partNames,
  pitchLabel,
  roleValue,
  sessionSummary,
  voiceRoleView,
  type RoleView,
} from "./sessionView";
import { findPreAnalysisMemory } from "../../storage/preAnalysisMemory";
import { needsPreAnalysisReview } from "../../storage/preAnalysisSettings";
import { applyPreAnalysisMemory } from "../../domain/preAnalysisParts/applyMemory";
import { isUnusualMeter } from "../../domain/preAnalysisParts/meterReading";
import { Button, IconButton } from "../ui";

interface PreAnalysisWorkspaceProps {
  session: AnalysisSession;
  busy?: boolean;
  requiresReanalysis?: boolean;
  /** 「線で分ける」: part id → where the melody starts. Session-only; empty = no line anywhere. */
  splits?: PartSplits;
  onSplitsChange?: (splits: PartSplits) => void;
  onSessionChange: (session: AnalysisSession) => void;
  onAddMidi: () => void;
  onRemoveSource: (sourceId: string) => void;
  onAnalyze: () => void;
  onPlay?: () => void;
  onStop?: () => void;
}

const NO_SPLITS: PartSplits = {};
const MAX_ZOOM = 8;
const MAX_NAMES_PER_ROLE = 4;

/**
 * 取り込み前の確認 (P15-01). Three things are taught to the app before it analyses:
 * is the tempo / meter right, which part is chords / bass / melody, and is this what should be analysed.
 * Words and layout changed; what is passed to the analysis did not (same session, same request).
 */
export function PreAnalysisWorkspace({
  session,
  busy = false,
  requiresReanalysis = false,
  splits = NO_SPLITS,
  onSplitsChange,
  onSessionChange,
  onAddMidi,
  onRemoveSource,
  onAnalyze,
  onPlay,
  onStop,
}: PreAnalysisWorkspaceProps) {
  const [selectedVoiceId, setSelectedVoiceId] = useState(session.voices[0]?.id);
  const [zoom, setZoom] = useState(1);
  const [viewportStartBeat, setViewportStartBeat] = useState(0);
  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [follow, setFollow] = useState(true);
  const [playbackActive, setPlaybackActive] = useState(false);
  /** The frame loop is running: the names of the sounding notes take the place of the colour legend. */
  const [framesRunning, setFramesRunning] = useState(false);
  const [playbackError, setPlaybackError] = useState<string>();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  /** What the screen had before 「前回の設定を使う」, so that 「元に戻す」 can put it back. */
  const [memoryUndo, setMemoryUndo] = useState<{ session: AnalysisSession; splits: PartSplits }>();
  const [highlightedSourceId, setHighlightedSourceId] = useState(session.latestSourceId);
  const [rollSize, setRollSize] = useState({ width: 760, height: 320 });
  const rollAreaRef = useRef<HTMLDivElement>(null);
  // Playing (spec v2.5 §7.3): the position lives in refs and a frame loop moves the line, the lights and the
  // overview head directly. The screen is not rendered again for a frame; the position is written to
  // `playheadBeat` once, when playback stops.
  const frameIdRef = useRef<number>();
  const playingRef = useRef(false);
  const playTokenRef = useRef(0);
  const playheadRef = useRef(0);
  const rollApiRef = useRef<PianoRollOverlayApi | null>(null);
  const overviewApiRef = useRef<OverviewApi | null>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const soundingRef = useRef<HTMLSpanElement>(null);
  const { sound: previewSound } = usePreviewSound();

  const contribution = analysisSessionVoiceContributionPreset(session);
  const names = useMemo(() => partNames(session), [session.voices]);
  const analyzedCount = analyzedVoiceCount(session);
  // The parts whose line is really in effect (something below it, something above it).
  const activeLines = useMemo(() => {
    const lines: Record<string, number> = {};
    for (const part of deriveSplitSession(session, splits).excluded) {
      lines[part.partId] = part.melodyFrom;
    }
    return lines;
  }, [session, splits]);
  const notesByVoice = useMemo(() => {
    const map = new Map<string, PreAnalysisNote[]>();
    for (const note of session.notes) {
      const list = map.get(note.voiceId);
      if (list) list.push(note);
      else map.set(note.voiceId, [note]);
    }
    return map;
  }, [session.notes]);
  const summary = useMemo(
    () => sessionSummary(session, activeLines),
    [session.voices, activeLines],
  );
  const totalBeats = sessionDuration(session);
  const pixelsPerBeat = BASE_PIXELS_PER_BEAT * zoom;
  const visibleBeats = Math.min(
    totalBeats,
    Math.max(1, (rollSize.width - PIANO_ROLL_GUTTER) / pixelsPerBeat),
  );
  const maxStart = Math.max(0, totalBeats - visibleBeats);
  const beatsPerBar = sessionBeatsPerBar(session);
  // The notes that sound when the session is played, in the order they start (for the lights).
  const soundingIndex = useMemo(() => buildSoundingIndex(session), [session]);
  // The frame loop reads the latest of these (it is not recreated when they change).
  const live = useRef({ index: soundingIndex, totalBeats, beatsPerBar, visibleBeats, maxStart, follow, viewportStart: viewportStartBeat });
  live.current = { index: soundingIndex, totalBeats, beatsPerBar, visibleBeats, maxStart, follow, viewportStart: viewportStartBeat };
  useEffect(() => {
    if (!playingRef.current) playheadRef.current = playheadBeat;
  }, [playheadBeat]);

  // Only the roles and the notes matter for Harmonic Core's weights; solo / mute / visibility do not.
  const roleSignature = session.voices
    .map((voice) => `${voice.id}:${voice.assignedRole}:${voice.included}`)
    .join("|");
  const multipliers = useMemo(
    () => (contribution === "harmonic-core"
      ? harmonicCoreNoteMultipliers(session, splits)
      : undefined),
    // roleSignature stands for the roles; solo / mute / visibility do not change the weights.
    [contribution, session.notes, session.controlChanges, session.sources, roleSignature, splits],
  );

  useEffect(() => () => {
    stopPreview();
    cancelFrame(frameIdRef.current);
  }, []);

  // The roll takes all the room the right column has; its rows are sized from the height.
  useEffect(() => {
    const element = rollAreaRef.current;
    if (!element) return undefined;
    const measure = () => setRollSize({
      width: Math.max(280, Math.floor(element.clientWidth)),
      height: Math.max(120, Math.floor(element.clientHeight)),
    });
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      globalThis.cancelAnimationFrame?.(frame);
      frame = globalThis.requestAnimationFrame
        ? globalThis.requestAnimationFrame(measure)
        : 0;
      if (!globalThis.requestAnimationFrame) measure();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      globalThis.cancelAnimationFrame?.(frame);
    };
  }, []);

  useEffect(() => {
    const latestSourceId = session.latestSourceId;
    if (!latestSourceId) {
      setHighlightedSourceId(undefined);
      return undefined;
    }
    setHighlightedSourceId(latestSourceId);
    const newest = session.voices.find((voice) => voice.sourceId === latestSourceId);
    if (newest) setSelectedVoiceId(newest.id);
    const timer = globalThis.setTimeout(() => setHighlightedSourceId(undefined), 1800);
    return () => globalThis.clearTimeout(timer);
  }, [session.latestSourceId]);

  useEffect(() => {
    if (session.voices.some((voice) => voice.id === selectedVoiceId)) return;
    setSelectedVoiceId(session.voices[0]?.id);
  }, [selectedVoiceId, session.voices]);

  useEffect(() => {
    setViewportStartBeat((current) => Math.min(current, maxStart));
  }, [maxStart]);

  /** The frame loop ends. The place it stopped at is written to the state once; the lights go out, the line stays. */
  const endFrames = useCallback(() => {
    playTokenRef.current += 1;
    cancelFrame(frameIdRef.current);
    frameIdRef.current = undefined;
    if (!playingRef.current) return;
    playingRef.current = false;
    setFramesRunning(false);
    setPlayheadBeat(playheadRef.current);
    rollApiRef.current?.rest(playheadRef.current);
    if (soundingRef.current) {
      soundingRef.current.textContent = "";
      soundingRef.current.removeAttribute("title");
    }
  }, []);

  const stopSessionPlayback = useCallback(() => {
    onStop?.();
    stopPreview();
    endFrames();
    setPlaybackActive(false);
  }, [endFrames, onStop]);

  function startFrames(startBeat: number, bpm: number) {
    cancelFrame(frameIdRef.current);
    const startedAt = performanceNow();
    playingRef.current = true;
    setFramesRunning(true);
    playheadRef.current = startBeat;
    let lastBar = -1;
    // Not set yet: the first frame always writes the names (even when nothing sounds).
    let sounding: readonly PreAnalysisNote[] | undefined;
    const step = () => {
      const now = live.current;
      const beat = Math.min(now.totalBeats, startBeat + (performanceNow() - startedAt) / 1000 * bpm / 60);
      playheadRef.current = beat;
      const next = soundingAt(now.index, beat, sounding);
      if (next !== sounding) {
        sounding = next;
        if (soundingRef.current) {
          // The whole list is in the tooltip: on a narrow row the text is cut short.
          soundingRef.current.textContent = soundingText(next) || "鳴っている音 なし";
          soundingRef.current.title = soundingRef.current.textContent;
        }
      }
      rollApiRef.current?.frame(beat, sounding ?? []);
      overviewApiRef.current?.moveHead(beat);
      const bar = Math.floor(beat / now.beatsPerBar) + 1;
      if (bar !== lastBar) {
        lastBar = bar;
        if (barRef.current) barRef.current.textContent = String(bar);
      }
      if (now.follow) {
        const start = followStart(now.viewportStart, beat, now.visibleBeats, now.maxStart);
        if (start !== now.viewportStart) {
          now.viewportStart = start;
          setViewportStartBeat(start);
        }
      }
      frameIdRef.current = requestFrame(step);
    };
    frameIdRef.current = requestFrame(step);
  }

  async function playSession() {
    if (onPlay) {
      setPlaybackActive(true);
      onPlay();
      return;
    }
    setPlaybackError(undefined);
    const master = session.sources.find((source) =>
      source.id === session.masterSourceId) ?? session.sources[0];
    const bpm = master?.representativeBpm ?? 96;
    const startBeat = playheadBeat >= totalBeats ? 0 : playheadBeat;
    const notes = sessionPreviewNotes(session, startBeat);
    if (!notes.length) {
      setPlaybackError("再生できるパートがありません。ソロと消音を確認してください。");
      return;
    }
    setPlayheadBeat(startBeat);
    setPlaybackActive(true);
    const token = playTokenRef.current + 1;
    playTokenRef.current = token;
    try {
      await previewMidiNotes(notes, bpm, previewSound, {
        onStarted() {
          if (playTokenRef.current !== token) return; // stopped before the sound began
          setPlaybackActive(true);
          startFrames(startBeat, bpm);
        },
        onEnded() {
          if (playTokenRef.current === token) endFrames();
          setPlaybackActive(false);
        },
      });
    } catch {
      stopSessionPlayback();
      setPlaybackError("MIDIパートを再生できませんでした。");
    }
  }
  function togglePlayback() {
    if (playbackActive) stopSessionPlayback();
    else void playSession();
  }

  function setPreset(preset: PreAnalysisSelectionPreset) {
    stopSessionPlayback();
    onSessionChange(applyAnalysisSessionPreset(session, preset));
  }

  function setContribution(preset: VoiceContributionPreset) {
    stopSessionPlayback();
    onSessionChange(setAnalysisSessionVoiceContributionPreset(session, preset));
  }

  function moveContribution(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    current: VoiceContributionPreset,
  ) {
    const presets: readonly VoiceContributionPreset[] = ["standard", "harmonic-core"];
    const index = presets.indexOf(current);
    const next = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? (index + 1) % presets.length
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? (index + presets.length - 1) % presets.length
        : event.key === "Home" ? 0 : event.key === "End" ? presets.length - 1 : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setContribution(presets[next]!);
    event.currentTarget.closest<HTMLElement>("[role='radiogroup']")
      ?.querySelector<HTMLButtonElement>(`[data-analysis-contribution-preset='${presets[next]}']`)
      ?.focus();
  }

  const setRole = useCallback((voiceId: string, role: RoleView) => {
    stopSessionPlayback();
    const assignedRole = roleValue(role);
    const next = updateAnalysisSessionVoice(session, voiceId, {
      assignedRole,
      included: assignedRole !== "exclude",
    });
    onSessionChange({ ...next, preset: "custom" });
  }, [onSessionChange, session, stopSessionPlayback]);

  function updateVoice(
    voiceId: string,
    changes: Parameters<typeof updateAnalysisSessionVoice>[2],
  ) {
    if (changes.muted !== undefined || changes.solo !== undefined) stopSessionPlayback();
    onSessionChange(updateAnalysisSessionVoice(session, voiceId, changes));
  }

  function toggleSolo(voiceId: string) {
    stopSessionPlayback();
    const current = session.voices.find((voice) => voice.id === voiceId);
    onSessionChange({
      ...session,
      voices: session.voices.map((voice) => ({
        ...voice,
        solo: voice.id === voiceId ? !current?.solo : false,
      })),
    });
  }

  function setTimelinePosition(beat: number) {
    const next = clamp(beat, 0, totalBeats);
    stopSessionPlayback();
    setPlayheadBeat(next);
    setViewportStartBeat(clamp(next - visibleBeats / 2, 0, maxStart));
  }

  function setViewportPosition(beat: number) {
    stopSessionPlayback();
    setViewportStartBeat(clamp(beat, 0, maxStart));
  }

  // 「このパートを線で分ける」. The line is session-only and never touches the part itself.
  function voicePitchRange(voiceId: string): { low: number; high: number } | undefined {
    const notes = notesByVoice.get(voiceId);
    if (!notes?.length) return undefined;
    let low = 127;
    let high = 0;
    for (const note of notes) {
      low = Math.min(low, note.pitch);
      high = Math.max(high, note.pitch);
    }
    return { low, high };
  }

  function changeSplits(next: PartSplits) {
    stopSessionPlayback();
    onSplitsChange?.(next);
  }

  function startSplit(voiceId: string) {
    const range = voicePitchRange(voiceId);
    if (!range) return;
    const suggested = suggestMelodyFrom(notesByVoice.get(voiceId) ?? []);
    // Nothing found: the line sits above the highest note (nothing is cut off) and the card says so.
    changeSplits({ ...splits, [voiceId]: { melodyFrom: suggested ?? Math.min(127, range.high + 1) } });
    setSelectedVoiceId(voiceId);
  }

  function moveSplit(voiceId: string, pitch: number) {
    const range = voicePitchRange(voiceId);
    if (!range || !splits[voiceId]) return;
    // The line has to leave at least one note below it.
    const melodyFrom = clamp(Math.round(pitch), range.low + 1, Math.min(127, range.high + 1));
    if (melodyFrom === splits[voiceId]!.melodyFrom) return;
    changeSplits({ ...splits, [voiceId]: { ...splits[voiceId]!, melodyFrom } });
  }

  function removeSplit(voiceId: string) {
    const rest = { ...splits };
    delete rest[voiceId];
    changeSplits(rest);
  }

  // A line of a part that is gone, or is no longer a chord part, is dropped.
  useEffect(() => {
    const stale = Object.keys(splits).filter((id) => {
      const voice = session.voices.find((entry) => entry.id === id);
      return !voice || !canSplitPart(voice);
    });
    if (!stale.length) return;
    const rest = { ...splits };
    for (const id of stale) delete rest[id];
    onSplitsChange?.(rest);
  }, [onSplitsChange, session.voices, splits]);

  const zoomStep = useCallback((direction: 1 | -1) => {
    setZoom((current) => clamp(current + direction, 1, MAX_ZOOM));
  }, []);

  // Keyboard: ↑↓ part, 1 2 3 0 role, S solo, M mute, Space play, Enter analyse.
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>();
  keyHandlerRef.current = (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (target.closest("input, select, textarea, [contenteditable='true']")) return;
      if (document.querySelector("[role='dialog']")) return;
      // A focused button keeps Enter / Space for itself.
      if ((event.key === "Enter" || event.key === " ") && target.closest("button, a, [role='radio']")) return;
    }
    const index = session.voices.findIndex((voice) => voice.id === selectedVoiceId);
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === "ArrowDown" || key === "ArrowUp") {
      if (!session.voices.length) return;
      event.preventDefault();
      const next = key === "ArrowDown"
        ? Math.min(session.voices.length - 1, Math.max(0, index) + 1)
        : Math.max(0, (index < 0 ? 0 : index) - 1);
      setSelectedVoiceId(session.voices[next]!.id);
      return;
    }
    if ((key === "1" || key === "2" || key === "3" || key === "0") && selectedVoiceId) {
      const voice = session.voices.find((entry) => entry.id === selectedVoiceId);
      if (!voice || voice.isDrum) return;
      event.preventDefault();
      setRole(voice.id, { "1": "chord", "2": "bass", "3": "melody", "0": "off" }[key] as RoleView);
    } else if (key === "s" && selectedVoiceId) {
      event.preventDefault();
      toggleSolo(selectedVoiceId);
    } else if (key === "m" && selectedVoiceId) {
      const voice = session.voices.find((entry) => entry.id === selectedVoiceId);
      if (!voice) return;
      event.preventDefault();
      updateVoice(voice.id, { muted: !voice.muted });
    } else if (key === " ") {
      event.preventDefault();
      togglePlayback();
    } else if (key === "Enter") {
      if (!busy && analyzedCount > 0) {
        event.preventDefault();
        onAnalyze();
      }
    } else if (key === "Escape") {
      setAdvancedOpen(false);
      setHelpOpen(false);
    }
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => keyHandlerRef.current?.(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const meterUnusual = session.sources.some((source) => {
    const meter = source.timeSignatures[0];
    return meter !== undefined && isUnusualMeter(meter.numerator, meter.denominator);
  });
  const tempoVaries = session.sources.some((source) => tempoVariationLabel(source) !== undefined);
  // 「前回と同じ設定」: offered only when the shape of the parts matches; applied only on a press.
  const memoryEntry = useMemo(
    () => findPreAnalysisMemory({ voices: session.voices }),
    [session.voices],
  );
  const memoryApplied = useMemo(
    () => (memoryEntry ? applyPreAnalysisMemory(session, splits, memoryEntry) : undefined),
    [session, splits, memoryEntry],
  );
  const notices = buildNotices({
    session,
    names,
    memoryOffer: memoryApplied?.changed === true && memoryUndo === undefined,
  });
  const allClear = notices.length === 0 && !meterUnusual && !tempoVaries && memoryUndo === undefined;

  const multiSource = session.sources.length > 1;
  // 単純な MIDI: one part, used as chords, nothing the app wants looked at (the condition of the old
  // compact view, `needsPreAnalysisReview`). The roll stays; only the list of parts is folded.
  const onlyPart = analyzedCount === 1 ? session.voices.find(isAnalyzedVoice) : undefined;
  const collapsed = !partsOpen
    && onlyPart !== undefined
    && voiceRoleView(onlyPart) === "chord"
    && Object.keys(splits).length === 0
    && !needsPreAnalysisReview(session);
  const collapsedText = onlyPart
    ? `${names.get(onlyPart.id) ?? onlyPart.displayName} 1パートをコードとして解析します`
    : "";

  function applyMemory() {
    if (!memoryApplied?.changed) return;
    stopSessionPlayback();
    setMemoryUndo({ session, splits });
    onSessionChange(memoryApplied.session);
    onSplitsChange?.(memoryApplied.splits);
  }

  function runNoticeAction(notice: Notice, kind: NoticeActionKind) {
    if (kind === "use-memory") applyMemory();
    else if (kind === "use-both" && notice.voiceId) {
      stopSessionPlayback();
      onSessionChange({
        ...updateAnalysisSessionVoice(session, notice.voiceId, { assignedRole: "harmony", included: true }),
        preset: "custom",
      });
    }
  }

  return (
    <section
      className="lv-pa"
      data-testid="pre-analysis-workspace"
      data-pre-analysis-mode="review"
      aria-label="取り込み前の確認"
    >
      <header className="lv-pa-head">
        <h2>取り込み前の確認</h2>
        <div className="lv-pa-files">
          {session.sources.map((source) => (
            <div
              key={source.id}
              className="lv-pa-file"
              data-source-id={source.id}
              data-new-source={highlightedSourceId === source.id || undefined}
            >
              <span className="lv-pa-file-name" title={source.displayName}>{source.displayName}</span>
              <span className="lv-pa-file-meta">{sourceSummary(source)}</span>
            </div>
          ))}
        </div>
        {allClear ? <span className="lv-pa-ok">✓ テンポ・拍子に問題なし</span> : null}
        <span className="lv-pa-spacer" />
        <div className="lv-pa-help">
          <IconButton
            variant="ghost"
            size="sm"
            label="この画面について"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen((open) => !open)}
          >
            <CircleHelp size={16} aria-hidden="true" />
          </IconButton>
          {helpOpen ? (
            <p className="lv-pa-popover lv-pa-help-text" role="note">
              解析の前に、使うパートと役割を確かめます。ファイル名とMIDIの内容は、この画面の中だけで使います。
            </p>
          ) : null}
        </div>
        <Button
          variant="secondary"
          data-testid="pre-analysis-add-midi"
          onClick={onAddMidi}
        >
          <Plus size={16} aria-hidden="true" />
          MIDIを追加
        </Button>
      </header>

      {requiresReanalysis || notices.length || memoryUndo ? (
        <div className="lv-pa-notices" data-testid="pre-analysis-notices">
          {requiresReanalysis ? (
            <p className="lv-pa-notice" data-testid="pre-analysis-reanalysis-required" role="status">
              <span title="再解析が必要です。変更した設定はまだ結果に反映されていません。「解析する」を押してください。">
                ⚠ 再解析が必要です。変更した設定はまだ結果に反映されていません。「解析する」を押してください。
              </span>
            </p>
          ) : null}
          {memoryUndo ? (
            <p className="lv-pa-notice" data-tone="info" data-testid="pre-analysis-memory-applied" role="status">
              <span>前回の役割を使いました。今回の曲にも合っているか、色で確かめてください</span>
              <button
                type="button"
                className="lv-pa-notice-button"
                data-testid="pre-analysis-memory-undo"
                onClick={() => {
                  stopSessionPlayback();
                  onSessionChange(memoryUndo.session);
                  onSplitsChange?.(memoryUndo.splits);
                  setMemoryUndo(undefined);
                }}
              >
                元に戻す
              </button>
            </p>
          ) : null}
          {notices.map((notice) => (
            <p
              className="lv-pa-notice"
              key={notice.id}
              data-testid={`pre-analysis-notice-${notice.id}`}
              data-tone={notice.tone}
              role="status"
            >
              <span title={notice.text}>{notice.tone === "info" ? "" : "⚠ "}{notice.text}</span>
              {notice.actions.map((action) => (
                <button
                  type="button"
                  className="lv-pa-notice-button"
                  key={action.label}
                  data-testid={action.testId}
                  onClick={() => runNoticeAction(notice, action.kind)}
                >
                  {action.label}
                </button>
              ))}
            </p>
          ))}
        </div>
      ) : null}

      <div className="lv-pa-main">
        <aside className="lv-pa-parts" aria-label="パート" data-collapsed={collapsed || undefined}>
          {collapsed ? (
            <div className="lv-pa-collapsed" data-testid="pre-analysis-collapsed">
              <p>{collapsedText}</p>
              <button type="button" className="lv-pa-link" aria-expanded="false" onClick={() => setPartsOpen(true)}>
                パートを確認する ▾
              </button>
            </div>
          ) : null}
          <div className="lv-pa-parts-head">
            <h3>パート</h3>
            <span className="lv-pa-parts-count">{session.voices.length}つ</span>
            <span className="lv-pa-spacer" />
            <button
              type="button"
              className="lv-pa-link"
              onClick={() => {
                stopSessionPlayback();
                onSessionChange(resetAnalysisSessionAuto(session));
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              自動の見立てに戻す
            </button>
          </div>

          <div className="lv-pa-mix">
            <h4 id="pre-analysis-voice-contribution">コードとメロディが混ざっていたら（全パート共通）</h4>
            <div
              className="lv-pa-seg"
              role="radiogroup"
              aria-labelledby="pre-analysis-voice-contribution"
              aria-describedby="pre-analysis-mix-note"
            >
              {([["standard", "分けない"], ["harmonic-core", "アプリに任せる"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  data-analysis-contribution-preset={value}
                  aria-checked={contribution === value}
                  tabIndex={contribution === value ? 0 : -1}
                  data-on={contribution === value || undefined}
                  onKeyDown={(event) => moveContribution(event, value)}
                  onClick={() => setContribution(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p id="pre-analysis-mix-note" className="lv-pa-mix-note">
              {contribution === "harmonic-core"
                ? "和音の名前の決め方を変えます。曲によっては結果が変わらないこともあります"
                : "すべてコードの音として扱います（今までの「標準」）"}
            </p>
          </div>

          <div className="lv-pa-plist" data-testid="pre-analysis-part-list">
            {session.sources.map((source) => {
              const voices = session.voices.filter((voice) => voice.sourceId === source.id);
              return (
                <section
                  key={source.id}
                  className="lv-pa-source"
                  data-new-source={highlightedSourceId === source.id || undefined}
                >
                  {multiSource ? (
                    <div className="lv-pa-source-head">
                      <span className="lv-pa-source-name" title={source.displayName}>{source.displayName}</span>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        label={source.visible ? "ファイルを非表示" : "ファイルを表示"}
                        aria-pressed={!source.visible}
                        onClick={() => onSessionChange(updateAnalysisSessionSource(
                          session,
                          source.id,
                          { visible: !source.visible },
                        ))}
                      >
                        {source.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </IconButton>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        label={source.muted ? "ファイルの消音を解除" : "ファイルを消音"}
                        aria-pressed={source.muted}
                        onClick={() => {
                          stopSessionPlayback();
                          onSessionChange(updateAnalysisSessionSource(
                            session,
                            source.id,
                            { muted: !source.muted },
                          ));
                        }}
                      >
                        {source.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </IconButton>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        label={`MIDIを削除: ${source.displayName}`}
                        title="MIDIを削除"
                        disabled={session.sources.length === 1}
                        onClick={() => {
                          stopSessionPlayback();
                          onRemoveSource(source.id);
                        }}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </IconButton>
                    </div>
                  ) : null}
                  {voices.map((voice) => {
                    const name = names.get(voice.id) ?? voice.displayName;
                    const role = voiceRoleView(voice);
                    const auto = isAutoVoice(voice);
                    const reason = autoOffReason(voice);
                    const locked = voice.isDrum
                      || (session.preset !== "custom" && Boolean(voice.duplicateOf));
                    const selected = selectedVoiceId === voice.id;
                    return (
                      <div
                        key={voice.id}
                        className="lv-pa-part"
                        data-voice-id={voice.id}
                        data-voice-channel={voice.channel}
                        data-role={role}
                        data-selected={selected || undefined}
                        data-off={role === "off" || undefined}
                        onClick={() => setSelectedVoiceId(voice.id)}
                      >
                        <div className="lv-pa-prow">
                          <span
                            className="lv-pa-dot"
                            style={{ backgroundColor: ROLE_COLOR[role] }}
                            aria-hidden="true"
                          />
                          <span className="lv-pa-pname" title={name}>{name}</span>
                          <span
                            className="lv-pa-badge"
                            data-changed={!auto || undefined}
                            title={auto ? autoTooltip(voice) : "手で変えています。「自動の見立てに戻す」で戻せます"}
                          >
                            {auto ? "自動" : "変更"}
                          </span>
                        </div>
                        {multiSource ? (
                          <div className="lv-pa-pmeta lv-pa-pfile" title={source.displayName}>{source.displayName}</div>
                        ) : null}
                        <div className="lv-pa-pmeta">{voiceMetadata(voice)}</div>
                        {reason ? <div className="lv-pa-pmeta lv-pa-preason">{reason}</div> : null}
                        <div className="lv-pa-roles" role="group" aria-label={`${name}の役割`}>
                          {ROLE_ORDER.map((candidate) => (
                            <button
                              key={candidate}
                              type="button"
                              className="lv-pa-role"
                              data-r={candidate}
                              data-on={role === candidate || undefined}
                              aria-pressed={role === candidate}
                              disabled={locked}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedVoiceId(voice.id);
                                setRole(voice.id, candidate);
                              }}
                            >
                              {ROLE_LABEL[candidate]}
                            </button>
                          ))}
                        </div>
                        <div className="lv-pa-pact">
                          <button
                            type="button"
                            className="lv-pa-mini"
                            data-on={voice.solo || undefined}
                            aria-pressed={voice.solo}
                            aria-label={`${name}をソロ`}
                            onClick={(event) => { event.stopPropagation(); toggleSolo(voice.id); }}
                          >
                            ソロ
                          </button>
                          <button
                            type="button"
                            className="lv-pa-mini"
                            data-on={voice.muted || undefined}
                            aria-pressed={voice.muted}
                            aria-label={voice.muted ? `${name}の消音を解除` : `${name}を消音`}
                            onClick={(event) => {
                              event.stopPropagation();
                              updateVoice(voice.id, { muted: !voice.muted });
                            }}
                          >
                            消音
                          </button>
                          <button
                            type="button"
                            className="lv-pa-mini"
                            data-on={!voice.visible || undefined}
                            aria-pressed={!voice.visible}
                            aria-label={voice.visible ? `${name}を非表示` : `${name}を表示`}
                            onClick={(event) => {
                              event.stopPropagation();
                              updateVoice(voice.id, { visible: !voice.visible });
                            }}
                          >
                            {voice.visible ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
                          </button>
                        </div>
                        {canSplitPart(voice) ? (
                          <SplitTool
                            name={name}
                            line={splits[voice.id]?.melodyFrom}
                            notes={notesByVoice.get(voice.id) ?? []}
                            onStart={() => startSplit(voice.id)}
                            onMove={(pitch) => moveSplit(voice.id, pitch)}
                            onRemove={() => removeSplit(voice.id)}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </aside>

        <section className="lv-pa-stage" aria-label="ピアノロール">
          <div className="lv-pa-transport" data-sounding={framesRunning || undefined}>
            <Button
              variant={playbackActive ? "danger" : "primary"}
              data-testid="pre-analysis-playback-toggle"
              data-active={playbackActive || undefined}
              title={playbackActive ? "停止（Space）" : "再生（Space）"}
              aria-label={playbackActive ? "停止" : "再生"}
              onClick={togglePlayback}
            >
              {playbackActive
                ? <Square size={16} aria-hidden="true" />
                : <Play size={16} fill="currentColor" aria-hidden="true" />}
              {playbackActive ? "停止" : "再生"}
            </Button>
            <span className="lv-pa-time" data-testid="pre-analysis-bar-label" aria-live="off">
              <span ref={barRef}>{Math.floor(playheadBeat / beatsPerBar) + 1}</span>小節目 / {Math.max(1, Math.ceil(totalBeats / beatsPerBar))}
            </span>
            <label className="lv-pa-follow">
              <input
                type="checkbox"
                checked={follow}
                onChange={(event) => setFollow(event.currentTarget.checked)}
              />
              再生位置を追う
            </label>
            <label className="lv-pa-zoom">
              ズーム
              <input
                id="pre-analysis-zoom"
                type="range"
                min="1"
                max={MAX_ZOOM}
                step="1"
                value={zoom}
                aria-label="ズーム"
                onChange={(event) => setZoom(Number(event.currentTarget.value))}
              />
              <span>{zoom}x</span>
            </label>
            <span className="lv-pa-sounding" ref={soundingRef} data-testid="pre-analysis-sounding" />
            <div className="lv-pa-legend" aria-label="色の意味">
              {ROLE_ORDER.map((role) => (
                <span key={role}><i style={{ background: ROLE_COLOR[role] }} />{ROLE_LABEL[role]}</span>
              ))}
            </div>
          </div>
          {playbackError ? <p className="lv-pa-error" role="alert">{playbackError}</p> : null}
          <div className="lv-pa-roll-area" ref={rollAreaRef}>
            <PreAnalysisPianoRoll
              session={session}
              selectedVoiceId={selectedVoiceId}
              width={rollSize.width}
              height={rollSize.height}
              pixelsPerBeat={pixelsPerBeat}
              viewportStartBeat={viewportStartBeat}
              playheadBeat={playheadBeat}
              overlayApiRef={rollApiRef}
              multipliers={multipliers}
              splits={splits}
              onSplitChange={moveSplit}
              onSelectVoice={setSelectedVoiceId}
              onViewportStartChange={setViewportPosition}
              onPlayheadBeatChange={(beat) => {
                stopSessionPlayback();
                setPlayheadBeat(beat);
              }}
              onZoomStep={zoomStep}
            />
          </div>
          <OverviewBand
            session={session}
            totalBeats={totalBeats}
            visibleBeats={visibleBeats}
            viewportStartBeat={viewportStartBeat}
            playheadBeat={playheadBeat}
            apiRef={overviewApiRef}
            onSeek={setTimelinePosition}
            onMoveWindow={setViewportPosition}
          />
        </section>
      </div>

      <footer className="lv-pa-bottom">
        <div className="lv-pa-sum" data-testid="pre-analysis-summary" aria-live="polite">
          {analyzedCount === 0 ? (
            <p id="pre-analysis-disabled-reason" className="lv-pa-warn">
              解析するパートを1つ以上選んでください。
            </p>
          ) : summary.map((group) => {
            const shown = group.names.slice(0, MAX_NAMES_PER_ROLE);
            const rest = group.names.length - shown.length;
            return (
              <span
                className="lv-pa-chip"
                key={group.role}
                data-role={group.role}
                title={`${ROLE_LABEL[group.role]}: ${group.names.join("、")}`}
              >
                <i style={{ background: ROLE_COLOR[group.role] }} />
                {ROLE_LABEL[group.role]}: {shown.join("、")}{rest > 0 ? ` ほか ${rest} 件` : ""}
              </span>
            );
          })}
        </div>
        <div className="lv-pa-adv-wrap">
          <Button
            variant="secondary"
            aria-expanded={advancedOpen}
            aria-controls="pre-analysis-advanced"
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            詳しい設定 {advancedOpen ? "▴" : "▾"}
          </Button>
          {advancedOpen ? (
            <div id="pre-analysis-advanced" className="lv-pa-popover lv-pa-adv" data-testid="pre-analysis-advanced">
              <h4 id="pre-analysis-bulk-title">まとめて役割を決める</h4>
              <p>パートの役割を、一度に入れ替えます。</p>
              <div className="lv-pa-seg" role="radiogroup" aria-labelledby="pre-analysis-bulk-title">
                {([
                  ["auto", "自動"],
                  ["harmony-bass", "コード+ベース"],
                  ["accompaniment-only", "伴奏のみ"],
                  ["all-pitched", "全部"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    data-analysis-preset={value}
                    aria-checked={session.preset === value}
                    data-on={session.preset === value || undefined}
                    onClick={() => setPreset(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <h4>前回と同じ設定</h4>
              <p>同じ作り方の MIDI なら、役割をそのまま使えます（線の高さは、今回の曲に合わせて提案します）。</p>
              <Button
                variant="secondary"
                data-testid="pre-analysis-use-memory"
                disabled={!memoryApplied?.changed}
                onClick={applyMemory}
              >
                前回の設定を使う
              </Button>
              <p className="lv-pa-adv-note">
                {session.preset === "custom" ? "今は、パートごとに手で決めた役割です。" : ""}
              </p>
            </div>
          ) : null}
        </div>
        <span className="lv-pa-keys">
          ↑↓ パート ・ 1 コード 2 ベース 3 メロディ 0 使わない ・ S ソロ ・ M 消音 ・ Space 再生 ・ Enter 解析
        </span>
        <Button
          variant="primary"
          className="lv-pa-go"
          data-testid="pre-analysis-analyze"
          disabled={busy || analyzedCount === 0}
          onClick={onAnalyze}
          aria-describedby={analyzedCount === 0 ? "pre-analysis-disabled-reason" : undefined}
        >
          {busy ? "準備中…" : "解析する ▶"}
        </Button>
      </footer>
      <span className="sr-only" data-testid="pre-analysis-part-count">
        {session.voices.length}パート中 {analyzedCount}パートを解析します
      </span>
    </section>
  );
}

interface OverviewApi {
  moveHead(beat: number): void;
}

/** The whole-song strip: the frame is what the roll shows, the white line is where playback is. */
function OverviewBand({
  session,
  totalBeats,
  visibleBeats,
  viewportStartBeat,
  playheadBeat,
  apiRef,
  onSeek,
  onMoveWindow,
}: {
  session: AnalysisSession;
  totalBeats: number;
  visibleBeats: number;
  viewportStartBeat: number;
  playheadBeat: number;
  /** The playing loop moves the head through this, without rendering the screen. */
  apiRef: MutableRefObject<OverviewApi | null>;
  onSeek: (beat: number) => void;
  onMoveWindow: (beat: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const total = Math.max(1, totalBeats);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.style.left = `${(viewportStartBeat / total) * 100}%`;
    frame.style.width = `${Math.min(1, visibleBeats / total) * 100}%`;
  }, [total, viewportStartBeat, visibleBeats]);

  // The head: where the position is when stopped; while playing the loop moves it (and paging does not move it back).
  useEffect(() => {
    if (headRef.current) headRef.current.style.left = `${(playheadBeat / total) * 100}%`;
  }, [playheadBeat, total]);

  useEffect(() => {
    apiRef.current = {
      moveHead(beat) {
        if (headRef.current) headRef.current.style.left = `${(beat / total) * 100}%`;
      },
    };
    return () => { apiRef.current = null; };
  }, [apiRef, total]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = containerRef.current;
    if (!canvas || !box) return;
    const width = Math.max(1, Math.floor(box.clientWidth));
    const height = Math.max(1, Math.floor(box.clientHeight));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    const voices = new Map(session.voices.map((voice) => [voice.id, voice]));
    const notes = visibleNotes(session);
    const pitches = notes.map((note) => note.pitch);
    if (!pitches.length) return;
    const low = Math.min(...pitches);
    const high = Math.max(...pitches);
    const span = Math.max(1, high - low);
    context.globalAlpha = 0.75;
    for (const note of notes) {
      const voice = voices.get(note.voiceId);
      if (!voice) continue;
      const role = voiceRoleView(voice);
      if (role === "off") continue;
      context.fillStyle = ROLE_COLOR[role];
      const x = (note.startBeat / total) * width;
      const y = 2 + (1 - (note.pitch - low) / span) * Math.max(1, height - 6);
      context.fillRect(x, y, Math.max(1, (note.durationBeats / total) * width), 2);
    }
  }, [session, total]);

  return (
    <div className="lv-pa-overview">
      <TimelineNavigator
        frameRef={frameRef}
        headRef={headRef}
        containerRef={containerRef}
        onSeek={(fraction) => onSeek(fraction * total)}
        onMoveWindow={(left) => onMoveWindow(left * total)}
        label="曲全体の帯"
        testId="pre-analysis-overview"
        heightClass="h-9"
      >
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
      </TimelineNavigator>
    </div>
  );
}

/** 「このパートを線で分ける」 in a chord part's card: the line, how to move it, and what is said about it. */
function SplitTool({
  name,
  line,
  notes,
  onStart,
  onMove,
  onRemove,
}: {
  name: string;
  line: number | undefined;
  notes: readonly PreAnalysisNote[];
  onStart: () => void;
  onMove: (pitch: number) => void;
  onRemove: () => void;
}) {
  if (line === undefined) {
    return (
      <div className="lv-pa-split">
        <button
          type="button"
          className="lv-pa-mini"
          data-testid="pre-analysis-split-start"
          onClick={(event) => { event.stopPropagation(); onStart(); }}
        >
          このパートを線で分ける
        </button>
      </div>
    );
  }
  const highest = notes.reduce((value, note) => Math.max(value, note.pitch), 0);
  const none = line > highest;
  const chords = !none && chordsAboveLine(notes, line);
  return (
    <div className="lv-pa-split" data-active data-testid="pre-analysis-split" onClick={(event) => event.stopPropagation()}>
      <div className="lv-pa-split-row">
        <span>
          線：<b data-testid="pre-analysis-split-pitch">{pitchLabel(line)}</b> より上をメロディに
        </span>
        <button type="button" className="lv-pa-mini" aria-label={`${name}の線を半音上げる`} onClick={() => onMove(line + 1)}>▲</button>
        <button type="button" className="lv-pa-mini" aria-label={`${name}の線を半音下げる`} onClick={() => onMove(line - 1)}>▼</button>
        <button type="button" className="lv-pa-mini" data-testid="pre-analysis-split-remove" onClick={onRemove}>線を外す</button>
      </div>
      <p className="lv-pa-pmeta lv-pa-split-note" data-testid="pre-analysis-split-check">
        線より上の音は解析に使いません。和音の音が混ざっていないか、色で確かめてください（消さず、解析の後に表示だけ戻します）。このパートでは、線がパート全体の設定より優先されます。音域が重なる曲では分けきれない簡易的な方法です。
      </p>
      {none ? (
        <p className="lv-pa-split-warn" role="status" data-testid="pre-analysis-split-none">
          自動では線の位置を決められませんでした。線を置けば分けられます
        </p>
      ) : null}
      {chords ? (
        <p className="lv-pa-split-warn" role="status" data-testid="pre-analysis-split-chords">
          線より上でも和音が鳴っている所があります。和音の音を切っている可能性があります
        </p>
      ) : null}
    </div>
  );
}

function followStart(
  start: number,
  beat: number,
  visibleBeats: number,
  maxStart: number,
): number {
  if (beat >= start && beat <= start + visibleBeats * 0.8) return start;
  return clamp(beat - visibleBeats * 0.2, 0, maxStart);
}

function sessionBeatsPerBar(session: AnalysisSession): number {
  const source = session.sources.find((candidate) =>
    candidate.id === session.masterSourceId) ?? session.sources[0];
  const meter = source?.timeSignatures[0];
  return meter ? meter.numerator * 4 / meter.denominator : 4;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function sourceSummary(source: AnalysisSession["sources"][number]): string {
  const bpm = source.representativeBpm ?? 120;
  const meter = source.timeSignatures[0];
  const perBar = meter ? meter.numerator * 4 / meter.denominator : 4;
  const bars = Math.max(1, Math.ceil(source.durationBeats / perBar));
  const seconds = Math.max(0, Math.round(source.durationBeats * 60 / bpm));
  return [
    `${bars}小節`,
    `♩${Math.round(bpm)}`,
    meter ? `${meter.numerator}/${meter.denominator}` : "4/4",
    formatClock(seconds),
    tempoVariationLabel(source),
  ].filter(Boolean).join(" ・ ");
}

function tempoVariationLabel(
  source: AnalysisSession["sources"][number],
): string | undefined {
  const low = source.tempoDiagnostics?.weightedP05Bpm;
  const high = source.tempoDiagnostics?.weightedP95Bpm;
  if (!hasRobustTempoVariation(source.tempoDiagnostics) || low === undefined || high === undefined) {
    return undefined;
  }
  return `テンポ変動あり ${Math.round(low)}〜${Math.round(high)} BPM`;
}

function voiceMetadata(voice: AnalysisSession["voices"][number]): string {
  const range = voice.minPitch !== undefined && voice.maxPitch !== undefined
    ? `${midiPitchName(voice.minPitch)}〜${midiPitchName(voice.maxPitch)}`
    : "音域不明";
  return [
    `ch${voice.channel + 1}`,
    voice.gmProgramName && !voice.isDrum ? `音色: ${voice.gmProgramName}` : undefined,
    `${voice.noteCount}音`,
    range,
  ].filter(Boolean).join(" ・ ");
}

function midiPitchName(pitch: number): string {
  const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

function requestFrame(callback: () => void): number {
  return globalThis.requestAnimationFrame
    ? globalThis.requestAnimationFrame(callback)
    : (globalThis.setTimeout(callback, 16) as unknown as number);
}

function cancelFrame(id: number | undefined): void {
  if (id === undefined) return;
  if (globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame(id);
  else globalThis.clearTimeout(id);
}

function performanceNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

type NoticeActionKind = "use-both" | "use-memory";

interface Notice {
  id: string;
  text: string;
  /** "info" is a plain statement; the others ask to be looked at. */
  tone: "info" | "warning";
  voiceId?: string;
  actions: Array<{ label: string; kind: NoticeActionKind; testId: string }>;
}

/**
 * The band at the top: what the files say that is worth a look, with a button where it can be fixed.
 * (P15-03) Closing a notice with 「このまま」 hides it for as long as the files are open.
 */
function buildNotices(input: {
  session: AnalysisSession;
  names: ReadonlyMap<string, string>;
  memoryOffer: boolean;
}): Notice[] {
  const { session, names } = input;
  const notices: Notice[] = [];
  const sourceName = (id: string) =>
    session.sources.find((source) => source.id === id)?.displayName ?? id;
  const several = session.sources.length > 1;
  const label = (source: AnalysisSession["sources"][number], text: string) =>
    several ? `「${source.displayName}」${text}` : text;

  for (const source of session.sources) {
    if (tempoVariationLabel(source) !== undefined) {
      const bpm = Math.round(source.representativeBpm ?? 120);
      notices.push({
        id: `tempo:${source.id}`,
        text: label(source, `途中でテンポが変わっています（${bpm}BPM前後を使います）`),
        tone: "info",
        actions: [],
      });
    }
    const meter = source.timeSignatures[0];
    // Information only: the meter of the file is never rewritten (KNOWN-FAILURES: do not rewrite the
    // source meter; P5.38 keeps meter, totalBars and the timeline as the source truth).
    if (meter && isUnusualMeter(meter.numerator, meter.denominator)) {
      notices.push({
        id: `meter:${source.id}`,
        text: label(
          source,
          `拍子が ${meter.numerator}/${meter.denominator} と書かれています。解析は書かれた拍子のまま行います`,
        ),
        tone: "info",
        actions: [],
      });
    }
  }

  const voiceById = new Map(session.voices.map((voice) => [voice.id, voice]));
  const partLabel = (voiceId: string) => {
    const voice = voiceById.get(voiceId);
    const name = names.get(voiceId) ?? voice?.displayName ?? voiceId;
    return several && voice ? `${name}（${sourceName(voice.sourceId)}）` : name;
  };
  const seen = new Set<string>();
  for (const warning of session.warnings) {
    const [first, second] = warning.sourceIds;
    const key = `${warning.code}:${warning.sourceIds.join(",")}:${warning.voiceIds?.join(",") ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (warning.code === "exact-duplicate") {
      const [kept, duplicate] = warning.voiceIds ?? [];
      if (!kept || !duplicate || voiceById.get(duplicate)?.included) continue;
      notices.push({
        id: `duplicate:${duplicate}`,
        text: `${partLabel(kept)} と ${partLabel(duplicate)} は同じ内容なので、片方だけ使います`,
        tone: "warning",
        voiceId: duplicate,
        actions: [{ label: "両方使う", kind: "use-both", testId: "pre-analysis-use-both" }],
      });
      continue;
    }
    if (warning.code === "near-duplicate") {
      const [left, right] = warning.voiceIds ?? [];
      if (!left || !right) continue;
      notices.push({
        id: `near:${left}:${right}`,
        text: `${partLabel(left)} と ${partLabel(right)} はよく似ています。自動では外さず、両方を残しています`,
        tone: "info",
        actions: [],
      });
      continue;
    }
    const master = first ? sourceName(first) : "最初のファイル";
    const other = second ? sourceName(second) : "追加したファイル";
    const text = warning.code === "tempo-map-mismatch"
      ? `「${other}」のテンポが「${master}」と違います。「${master}」のテンポを使います`
      : warning.code === "time-signature-mismatch"
        ? `「${other}」の拍子が「${master}」と違います`
        : warning.code === "duration-mismatch"
          ? `「${other}」の長さが「${master}」と大きく違います`
          : `「${other}」の開始位置が「${master}」と合っていない可能性があります。自動では直しません`;
    notices.push({ id: `${warning.code}:${second ?? ""}`, text, tone: "warning", actions: [] });
  }

  if (input.memoryOffer) {
    notices.push({
      id: "memory",
      text: "前回と同じ並びです",
      tone: "info",
      actions: [{ label: "前回の設定を使う", kind: "use-memory", testId: "pre-analysis-offer-memory" }],
    });
  }
  return notices;
}
