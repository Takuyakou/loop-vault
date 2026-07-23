import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  AlertTriangle,
  Check,
  Dumbbell,
  Heart,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Square,
} from "lucide-react";
import type { PreviewSound } from "../audio/chordPreview";
import { playbackController } from "../audio/playbackController";
import {
  computePracticeKeyboardRange,
  formatMidiNoteForDisplay,
} from "../components/music-keyboard";
import { PracticeKeyboard } from "../components/practice/PracticeKeyboard";
import { VoicingPracticeControls } from "../components/practice/VoicingPracticeControls";
import { voiceChordForPreview } from "../domain/chordVoicing";
import { degreeOf } from "../domain/harmony/degrees";
import { beatsPerBar } from "../domain/midi/timing";
import {
  buildPracticeChordRequirements,
  createPracticeSessionState,
  practiceInputFromLiveState,
  practiceProgressState,
  progressionFingerprint,
  recommendPracticeBlocks,
  recordPracticeRound,
  reducePracticeSession,
  resetPracticeProgress,
  type DojoPracticeLevel,
  type PracticeLeniency,
  type PracticeMode,
  type PracticeRecommendation,
  type PracticeSessionState,
} from "../domain/practice";
import type {
  AppLanguage,
  ChordTimelineItem,
  SavedProgressionBlock,
  SongIdea,
} from "../domain/types";
import { resolveVoicingForUse } from "../domain/voicing";
import {
  DEFAULT_OCTAVE_SHIFT_CANDIDATES,
  generateStyleVoicingPlan,
  matchExactPitch,
  matchPitchClasses,
  type GeneratedStyleVoicing,
  type PracticeTargetSource,
  type StyleVoicingMatchMode,
  type VoicingPracticePreferences,
} from "../domain/voicingPractice";
import { usePlaybackState } from "../hooks/usePlaybackState";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import { PracticeClock } from "../practice/PracticeClock";
import { registerClosePreparation } from "../store/closePreparation";
import {
  loadVoicingPracticePreferences,
  saveVoicingPracticePreferences,
} from "../voicingPractice/preferences";

interface PracticeTarget {
  ideaId: string;
  blockId: string;
}

interface PracticeVoicingGuide {
  midiNotes: number[];
  leftHandNotes: number[];
  rightHandNotes: number[];
  origin?: "practice-override" | "source-verified" | "source-auto" | "generated";
  styleId?: GeneratedStyleVoicing["styleId"];
  variant?: string;
  addedColorIntervals: string[];
  fallback: boolean;
}

interface PracticeViewProps {
  ideas: readonly SongIdea[];
  initialTarget?: PracticeTarget;
  language: AppLanguage;
  updateProgressionBlock: (
    ideaId: string,
    blockId: string,
    changes: Partial<SavedProgressionBlock>,
  ) => boolean;
  openProgression: (ideaId: string, blockId: string) => void;
  openSettings: () => void;
  setToast: (message: string) => void;
}

type QueueFilter = "recommended" | "favorite" | "unstarted" | "confirmation" | "l1" | "l2" | "l3";

const copy = {
  ja: {
    eyebrow: "CHORD DOJO",
    title: "進行を、自分の手で覚える",
    queue: "練習キュー",
    recommended: "おすすめ",
    favorite: "Favorite",
    unstarted: "未着手",
    confirmation: "確認待ち",
    noProgressions: "保存済みのコード進行がありません。",
    noMatches: "この条件に合う進行はありません。",
    openDetail: "進行を開く",
    selectPrompt: "左の練習キューから進行を選んでください。",
    level: "レベル",
    l1: "L1 見て弾く",
    l2: "L2 名前で弾く",
    l3: "L3 度数で弾く",
    leniency: "判定",
    easy: "ゆるい",
    normal: "ふつう",
    strict: "きびしい",
    step: "ステップ",
    flow: "フロー",
    midi: "MIDI入力",
    connected: "接続済み",
    connecting: "接続中",
    disconnected: "未接続",
    reconnect: "再接続",
    settings: "設定",
    start: "練習を開始",
    pause: "一時停止",
    resume: "再開",
    end: "終了",
    current: "いま",
    next: "つぎ",
    progressionOverview: "進行全体",
    progressionPosition: (current: number, total: number) => `${current} / ${total}`,
    previewChord: (label: string) => `${label}を試聴`,
    barLabel: (bar: number) => `${bar}小節`,
    stepCurrent: "いま",
    stepComplete: "完了",
    stepMissed: "再挑戦",
    stepUpcoming: "これから",
    guide: "お手本",
    generated: "自動生成",
    source: "元MIDI",
    sourceInferred: "元MIDIから推定",
    practice: "鍵盤で記録",
    held: "押している音",
    bass: "Bass",
    partial: "あと少し",
    match: "合っています",
    wrong: "構成外の音があります",
    ready: "準備完了",
    clean: "クリーン",
    round: (value: number) => `${value}周目`,
    bpm: "BPM",
    targetTempo: (value: number) => `段位目標 ${value} BPM`,
    flowUnsupported: "フローモードは現在4/4に対応しています。ステップモードは利用できます。",
    l3NeedsKey: "L3を使うには進行のKeyを設定してください。",
    chordAsBlock: "このPhaseでは和音として押さえてください。アルペジオ練習は今後対応予定です。",
    noSound: "音源なしコントローラ向けの内蔵音源／MIDI Thruは今回の対象外です。",
    provisional: "仮クリア",
    confirmationDue: "別日確認",
    confirmed: (level: number) => `L${level} 確定`,
    stale: "進行更新・要確認",
    staleConfirm: "進行のコード内容が変更されています。この進行の練習段位を新しく開始しますか？",
    staleReset: "練習段位を現在の進行に合わせてリセットしました。",
    saved: "練習進捗を保存しました。",
    saveFailed: "練習進捗を保存できませんでした。",
    flowSuggestion: "1周完了。フローで弾いてみますか？",
    miniSummaryEmpty: "コード情報なし",
    styleChangeConfirm: "一時停止してボイシングを変更しますか？現在の周回は破棄されます。",
    styleStartBlocked: "未対応コードがあります。自動フォールバックを許可するか、別のボイシングを選んでください。",
    previewFailed: "ボイシングの試聴を開始できませんでした。",
    leftGuide: "左手の目安",
    rightGuide: "右手の目安",
    shape: (count: number) => `${count}音の形`,
    styleShell: "シェル 1-7",
    styleOpen: "オープン 1-7",
    styleRootless: (variant?: string) => `ルートレス ${variant ?? "A/B"}`,
    styleClose: "自動",
    addedColor: (intervals: readonly string[]) => `響きを補う音: ${intervals.join("・")}`,
  },
  en: {
    eyebrow: "CHORD DOJO",
    title: "Turn progressions into muscle memory",
    queue: "Practice queue",
    recommended: "Recommended",
    favorite: "Favorite",
    unstarted: "Unstarted",
    confirmation: "Confirmation",
    noProgressions: "No saved chord progressions yet.",
    noMatches: "No progressions match this filter.",
    openDetail: "Open progression",
    selectPrompt: "Choose a progression from the practice queue.",
    level: "Level",
    l1: "L1 See and play",
    l2: "L2 Play by name",
    l3: "L3 Play by degree",
    leniency: "Judgement",
    easy: "Easy",
    normal: "Normal",
    strict: "Strict",
    step: "Step",
    flow: "Flow",
    midi: "MIDI input",
    connected: "Connected",
    connecting: "Connecting",
    disconnected: "Not connected",
    reconnect: "Reconnect",
    settings: "Settings",
    start: "Start practice",
    pause: "Pause",
    resume: "Resume",
    end: "End",
    current: "Now",
    next: "Next",
    progressionOverview: "Full progression",
    progressionPosition: (current: number, total: number) => `${current} / ${total}`,
    previewChord: (label: string) => `Preview ${label}`,
    barLabel: (bar: number) => `Bar ${bar}`,
    stepCurrent: "Now",
    stepComplete: "Complete",
    stepMissed: "Retry",
    stepUpcoming: "Upcoming",
    guide: "Guide",
    generated: "Generated",
    source: "Source MIDI",
    sourceInferred: "Inferred from MIDI",
    practice: "Keyboard capture",
    held: "Held notes",
    bass: "Bass",
    partial: "Almost there",
    match: "Matched",
    wrong: "A foreign tone is held",
    ready: "Ready",
    clean: "Clean",
    round: (value: number) => `Round ${value}`,
    bpm: "BPM",
    targetTempo: (value: number) => `Level target ${value} BPM`,
    flowUnsupported: "Flow currently supports 4/4. Step mode is still available.",
    l3NeedsKey: "Set a key on the progression to use L3.",
    chordAsBlock: "Play the notes as a held chord in this phase. Arpeggio practice is planned later.",
    noSound: "Built-in sound and MIDI Thru for silent controllers are outside this phase.",
    provisional: "Provisional",
    confirmationDue: "Confirm another day",
    confirmed: (level: number) => `L${level} confirmed`,
    stale: "Progression changed",
    staleConfirm: "The chord content changed. Start practice progress again for the current progression?",
    staleReset: "Practice progress was reset for the current progression.",
    saved: "Practice progress saved.",
    saveFailed: "Could not save practice progress.",
    flowSuggestion: "Round complete. Try it in Flow mode?",
    miniSummaryEmpty: "No chord data",
    styleChangeConfirm: "Pause and change the voicing? The current round will be discarded.",
    styleStartBlocked: "Unsupported chords remain. Allow automatic fallback or choose another voicing.",
    previewFailed: "Could not start the voicing preview.",
    leftGuide: "Left-hand guide",
    rightGuide: "Right-hand guide",
    shape: (count: number) => `${count}-note shape`,
    styleShell: "Shell 1-7",
    styleOpen: "Open 1-7",
    styleRootless: (variant?: string) => `Rootless ${variant ?? "A/B"}`,
    styleClose: "Automatic",
    addedColor: (intervals: readonly string[]) => `Added color tones: ${intervals.join(", ")}`,
  },
} as const;

export function PracticeView({
  ideas,
  initialTarget,
  language,
  updateProgressionBlock,
  openProgression,
  openSettings,
  setToast,
}: PracticeViewProps) {
  const text = copy[language];
  const localDate = localDateString(new Date());
  const recommendations = useMemo(
    () => recommendPracticeBlocks(ideas, localDate),
    [ideas, localDate],
  );
  const [filter, setFilter] = useState<QueueFilter>("recommended");
  const [target, setTarget] = useState<PracticeTarget | undefined>(initialTarget);
  const [level, setLevel] = useState<DojoPracticeLevel>(1);
  const [leniency, setLeniency] = useState<PracticeLeniency>("normal");
  const [mode, setMode] = useState<PracticeMode>("step");
  const [bpm, setBpm] = useState(60);
  const [session, setSession] = useState<PracticeSessionState>();
  const [beat, setBeat] = useState(1);
  const [auditionEventIndex, setAuditionEventIndex] = useState<number>();
  const [previewSound, setPreviewSound] = useState<PreviewSound>("piano");
  const [targetSource, setTargetSource] = useState<PracticeTargetSource>({
    type: "resolved-voicing",
  });
  const [styleMatchMode, setStyleMatchMode] = useState<StyleVoicingMatchMode>("exact-pitch");
  const [allowUnsupportedFallback, setAllowUnsupportedFallback] = useState(false);
  const [voicingPreferences, setVoicingPreferences] = useState<VoicingPracticePreferences>(
    loadVoicingPracticePreferences,
  );
  const clockRef = useRef(new PracticeClock());
  const ownsMidiRef = useRef(false);
  const persistedRoundRef = useRef(0);
  const latestSessionRef = useRef<PracticeSessionState>();
  const latestBlockRef = useRef<SavedProgressionBlock>();
  const latestSelectedRef = useRef<PracticeRecommendation>();
  const lastPersistedSessionRef = useRef<PracticeSessionState>();
  const styleModeRef = useRef(false);
  const active = useStore(defaultLiveMidiStore, (state) => state.active);
  const midiStatus = useStore(defaultLiveMidiStore, (state) => state.status);
  const selectedDevice = useStore(defaultLiveMidiStore, (state) => state.selected);
  const liveNotes = useStore(defaultLiveMidiStore, (state) => state.notes);
  const midiError = useStore(defaultLiveMidiStore, (state) => state.error);
  const playbackState = usePlaybackState();

  useEffect(() => {
    if (!initialTarget) return;
    setTarget(initialTarget);
    setTargetSource({ type: "resolved-voicing" });
    setStyleMatchMode("exact-pitch");
    setAllowUnsupportedFallback(false);
    setAuditionEventIndex(undefined);
    setSession(undefined);
  }, [initialTarget]);

  useEffect(() => {
    ownsMidiRef.current = !defaultLiveMidiStore.getState().active;
    if (ownsMidiRef.current) void defaultLiveMidiStore.getState().activate();
    const unregisterClosePreparation = registerClosePreparation(() => {
      persistPendingSession();
    });
    return () => {
      unregisterClosePreparation();
      clockRef.current.stop();
      persistPendingSession();
      if (ownsMidiRef.current) void defaultLiveMidiStore.getState().deactivate();
    };
  }, [updateProgressionBlock]);

  function persistPendingSession(): void {
    if (styleModeRef.current) return;
    const current = latestSessionRef.current;
    const currentBlock = latestBlockRef.current;
    const currentSelected = latestSelectedRef.current;
    if (
      !current
      || current.status === "completed"
      || !currentBlock
      || !currentSelected
      || lastPersistedSessionRef.current === current
    ) {
      return;
    }
    const updated = updateProgressionBlock(currentSelected.ideaId, currentBlock.id, {
      practice: recordPracticeRound(currentBlock, {
        level: current.level,
        bpm: current.bpm,
        targetTempo: current.targetTempo,
        consecutiveCleanFlowRounds: current.consecutiveCleanFlowRounds,
        nowIso: new Date().toISOString(),
        localDate: localDateString(new Date()),
      }),
    });
    if (updated) lastPersistedSessionRef.current = current;
  }

  const selected = recommendations.find(
    (item) => item.ideaId === target?.ideaId && item.block.id === target.blockId,
  ) ?? recommendations[0];
  const selectedIdea = selected
    ? ideas.find((idea) => idea.id === selected.ideaId)
    : undefined;
  const block = selected?.block;
  const practiceEventIndex = session?.currentEventIndex ?? 0;
  const displayedEventIndex = session?.status === "running"
    ? practiceEventIndex
    : auditionEventIndex ?? practiceEventIndex;
  const currentTarget = block?.chords[displayedEventIndex];
  const nextTarget = block && block.chords.length > 1
    ? block.chords[(displayedEventIndex + 1) % block.chords.length]
    : undefined;
  const keySignature = block?.detectedKey ?? selectedIdea?.key;
  const l3Available = Boolean(keySignature);
  const flowAvailable = !block?.timeSignature || block.timeSignature === "4/4";
  const styleMode = targetSource.type !== "resolved-voicing";
  const standardRequirements = useMemo(
    () => block?.chords.map((event) => buildPracticeChordRequirements(event.chord, leniency)) ?? [],
    [block, leniency],
  );
  const resolvedGuides = useMemo(
    () => block?.chords.map((event) => resolveVoicingForUse(
      event.chord,
      event.voicingMemory,
      voiceChordForPreview(event.chord).notes,
    )) ?? [],
    [block?.chords],
  );
  const generatedStylePlan = useMemo(() => {
    if (!block || targetSource.type === "resolved-voicing") return undefined;
    const styleId = targetSource.type === "generated-close"
      ? "generated-close"
      : targetSource.styleId;
    return generateStyleVoicingPlan(block.chords, styleId, {
      maxLeftHandSpanSemitones: voicingPreferences.maxLeftHandSpanSemitones,
      maxRightHandSpanSemitones: voicingPreferences.maxRightHandSpanSemitones,
      allowUnsupportedFallback,
    });
  }, [
    allowUnsupportedFallback,
    block,
    targetSource,
    voicingPreferences.maxLeftHandSpanSemitones,
    voicingPreferences.maxRightHandSpanSemitones,
  ]);
  const generatedGuides = useMemo(() => {
    const byEventId = new Map(
      generatedStylePlan?.events.map((event) => [event.eventId, event]) ?? [],
    );
    return block?.chords.map((event, index): PracticeVoicingGuide | undefined => {
      const generated = byEventId.get(practiceEventId(event, index));
      if (!generated) return undefined;
      return {
        midiNotes: [...generated.allNotes],
        leftHandNotes: [...generated.leftHandNotes],
        rightHandNotes: [...generated.rightHandNotes],
        styleId: generated.styleId,
        variant: generated.variant,
        addedColorIntervals: [...generated.addedColorIntervals],
        fallback: generated.warnings.includes("fallback-close"),
      };
    }) ?? [];
  }, [block?.chords, generatedStylePlan]);
  const activeGuides = useMemo(
    (): Array<PracticeVoicingGuide | undefined> => styleMode
      ? generatedGuides
      : resolvedGuides.map((resolved) => ({
          midiNotes: [...resolved.midiNotes],
          leftHandNotes: [],
          rightHandNotes: [],
          origin: resolved.origin,
          addedColorIntervals: [],
          fallback: false,
        })),
    [generatedGuides, resolvedGuides, styleMode],
  );
  const requirements = useMemo(
    () => styleMode
      ? activeGuides.map((guide, index) => {
          const pitchClasses = uniquePitchClasses(guide?.midiNotes ?? []);
          return {
            requiredPitchClasses: pitchClasses,
            optionalPitchClasses: [],
            allowedPitchClasses: pitchClasses,
            chordKey: standardRequirements[index]?.chordKey ?? "",
          };
        })
      : standardRequirements,
    [activeGuides, standardRequirements, styleMode],
  );
  const styleMatchInput = useMemo(
    () => styleMode
      ? (
          _requirements: (typeof requirements)[number],
          input: Parameters<typeof matchExactPitch>[1],
          requiredAttackRevision: number,
          eventIndex: number,
        ) => {
          const targetNotes = activeGuides[eventIndex]?.midiNotes ?? [];
          return styleMatchMode === "exact-pitch"
            ? matchExactPitch(targetNotes, input, requiredAttackRevision, {
                allowGlobalOctaveShift: voicingPreferences.allowGlobalOctaveShift,
                octaveShiftCandidates: DEFAULT_OCTAVE_SHIFT_CANDIDATES,
              })
            : matchPitchClasses(targetNotes, input, requiredAttackRevision);
        }
      : undefined,
    [
      activeGuides,
      requirements,
      styleMatchMode,
      styleMode,
      voicingPreferences.allowGlobalOctaveShift,
    ],
  );
  const sessionContext = useMemo(
    () => ({
      events: block?.chords ?? [],
      requirements,
      ...(styleMatchInput ? { matchInput: styleMatchInput } : {}),
    }),
    [block?.chords, requirements, styleMatchInput],
  );
  const currentRequirement = requirements[displayedEventIndex];
  const guide = activeGuides[displayedEventIndex];
  const keyboardRange = useMemo(
    () => computePracticeKeyboardRange(
      activeGuides.flatMap((resolved) => resolved ? [resolved.midiNotes] : []),
    ),
    [activeGuides],
  );
  const eventBars = useMemo(
    () => Object.fromEntries(
      block?.chords.map((event, index) => [practiceEventId(event, index), event.bar]) ?? [],
    ),
    [block?.chords],
  );
  const previewSourceId = block
    ? `${block.id}:voicing:${practiceTargetSourceKey(targetSource)}`
    : "voicing-practice";
  const previewing = playbackState.status !== "idle"
    && playbackState.source?.kind === "practice"
    && playbackState.source.id === previewSourceId;
  const stylePlanBlocked = styleMode
    && Boolean(generatedStylePlan?.unsupportedEvents.length)
    && !allowUnsupportedFallback;
  const filtered = recommendations.filter((item) => matchesQueueFilter(item, filter, localDate));
  const running = session?.status === "running";
  const paused = session?.status === "paused";
  const previewDisabled = !block
    || running
    || stylePlanBlocked
    || activeGuides.length !== block.chords.length
    || activeGuides.some((item) => !item);
  const activeEventIndex = block?.chords.length
    ? Math.max(0, Math.min(block.chords.length - 1, displayedEventIndex))
    : 0;

  useEffect(() => {
    styleModeRef.current = styleMode;
  }, [styleMode]);

  useEffect(() => {
    latestSessionRef.current = session;
    latestBlockRef.current = block;
    latestSelectedRef.current = selected;
  }, [block, selected, session]);

  useEffect(() => {
    if (!running || !currentRequirement) return;
    const input = practiceInputFromLiveState(liveNotes, performance.now());
    setSession((current) => current
      ? reducePracticeSession(current, { type: "MIDI_STATE_CHANGED", input }, sessionContext)
      : current);
  }, [currentRequirement, liveNotes, running, sessionContext]);

  useEffect(() => {
    const candidate = session?.provisionalCandidate;
    if (!candidate || !running) return undefined;
    const delay = Math.max(0, candidate.sinceMs + 100 - performance.now());
    const timer = globalThis.setTimeout(() => {
      setSession((current) => current
        ? reducePracticeSession(
            current,
            { type: "STABLE_DEADLINE", nowMs: performance.now() },
            sessionContext,
          )
        : current);
    }, delay);
    return () => globalThis.clearTimeout(timer);
  }, [running, session?.provisionalCandidate, sessionContext]);

  useEffect(() => {
    if (midiStatus !== "disconnected" && midiStatus !== "error") return;
    clockRef.current.pause();
    setSession((current) => current
      ? reducePracticeSession(current, { type: "DEVICE_DISCONNECTED" }, sessionContext)
      : current);
  }, [midiStatus, sessionContext]);

  useEffect(() => {
    if (
      styleMode
      ||
      !block
      || session?.mode !== "flow"
      || !session.lastRoundWasClean
      || session.roundNumber <= persistedRoundRef.current
    ) return;
    persistedRoundRef.current = session.roundNumber;
    persistProgress(block, session);
  }, [block, session, styleMode]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const element = event.target as HTMLElement | null;
      if (element?.matches("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setSession((current) => {
          if (!current || current.status === "running") return current;
          const delta = event.key === "ArrowLeft" ? -1 : 1;
          return {
            ...current,
            currentEventIndex: Math.max(
              0,
              Math.min(current.eventResults.length - 1, current.currentEventIndex + delta),
            ),
          };
        });
      } else if (event.key === "Escape") {
        setSession((current) => {
          if (!current || current.status !== "running") return current;
          clockRef.current.pause();
          return reducePracticeSession(current, { type: "PAUSE" }, sessionContext);
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sessionContext]);

  function selectRecommendation(item: PracticeRecommendation) {
    endSession();
    playbackController.stop();
    setTarget({ ideaId: item.ideaId, blockId: item.block.id });
    setTargetSource({ type: "resolved-voicing" });
    setStyleMatchMode("exact-pitch");
    setAllowUnsupportedFallback(false);
    setAuditionEventIndex(undefined);
    const confirmed = item.block.practice?.confirmedLevel;
    const suggested = confirmed && confirmed < 3 ? (confirmed + 1) as DojoPracticeLevel : 1;
    setLevel(item.stale ? 1 : suggested);
    setBpm(Math.min(60, targetTempoFor(item.block)));
    setSession(undefined);
  }

  async function startSession() {
    if (!selected || !block || block.chords.length === 0) return;
    if (stylePlanBlocked) {
      setToast(text.styleStartBlocked);
      return;
    }
    if (!styleMode && practiceProgressState(block, localDate) === "stale") {
      if (!globalThis.confirm(text.staleConfirm)) return;
      if (!updateProgressionBlock(selected.ideaId, block.id, { practice: resetPracticeProgress(block) })) {
        setToast(text.saveFailed);
        return;
      }
      setToast(text.staleReset);
    }
    if (!defaultLiveMidiStore.getState().active) {
      ownsMidiRef.current = true;
      await defaultLiveMidiStore.getState().activate();
    }
    playbackController.stop();
    setAuditionEventIndex(undefined);
    const next = createPracticeSessionState({
      blockId: block.id,
      progressionFingerprint: progressionFingerprint(block),
      level,
      mode,
      leniency,
      bpm,
      targetTempo: targetTempoFor(block),
      eventCount: block.chords.length,
    });
    persistedRoundRef.current = 0;
    setSession(reducePracticeSession(next, { type: "START_SESSION" }, sessionContext));
    if (mode === "flow") {
      await clockRef.current.start({
        events: block.chords,
        bpm,
        beatsPerBar: 4,
        callbacks: {
          onTargetOpen: (eventIndex) => setSession((current) => current
            ? reducePracticeSession(current, { type: "FLOW_TARGET_OPEN", eventIndex }, sessionContext)
            : current),
          onTargetClose: (eventIndex) => setSession((current) => current
            ? reducePracticeSession(current, { type: "FLOW_TARGET_CLOSE", eventIndex }, sessionContext)
            : current),
          onRoundCompleted: () => setSession((current) => current
            ? reducePracticeSession(current, { type: "ROUND_COMPLETED" }, sessionContext)
            : current),
          onBeat: setBeat,
        },
      });
    }
  }

  function pauseSession() {
    clockRef.current.pause();
    setSession((current) => current
      ? reducePracticeSession(current, { type: "PAUSE" }, sessionContext)
      : current);
  }

  function resumeSession() {
    clockRef.current.resume();
    setSession((current) => current
      ? reducePracticeSession(current, { type: "RESUME" }, sessionContext)
      : current);
  }

  function endSession(save = true) {
    clockRef.current.stop();
    if (save && block && session) persistProgress(block, session);
    setSession((current) => current
      ? reducePracticeSession(current, { type: "END_SESSION" }, sessionContext)
      : current);
  }

  function persistProgress(targetBlock: SavedProgressionBlock, current: PracticeSessionState) {
    if (!selected || styleModeRef.current) return;
    const practice = recordPracticeRound(targetBlock, {
      level: current.level,
      bpm: current.bpm,
      targetTempo: current.targetTempo,
      consecutiveCleanFlowRounds: current.consecutiveCleanFlowRounds,
      nowIso: new Date().toISOString(),
      localDate: localDateString(new Date()),
    });
    if (updateProgressionBlock(selected.ideaId, targetBlock.id, { practice })) {
      setToast(text.saved);
    } else {
      setToast(text.saveFailed);
    }
  }

  function prepareVoicingChange(): boolean {
    if (running && !globalThis.confirm(text.styleChangeConfirm)) return false;
    clockRef.current.stop();
    playbackController.stop();
    persistedRoundRef.current = 0;
    setBeat(1);
    setSession(undefined);
    return true;
  }

  function changeTargetSource(source: PracticeTargetSource): void {
    if (practiceTargetSourceKey(source) === practiceTargetSourceKey(targetSource)) return;
    if (!prepareVoicingChange()) return;
    setTargetSource(source);
    setAllowUnsupportedFallback(false);
  }

  function changeVoicingPreferences(next: VoicingPracticePreferences): void {
    if (!prepareVoicingChange()) return;
    setVoicingPreferences(next);
    try {
      saveVoicingPracticePreferences(next);
    } catch {
      // The session can continue when browser preference storage is unavailable.
    }
  }

  function changeStyleMatchMode(next: StyleVoicingMatchMode): void {
    if (next === styleMatchMode || !prepareVoicingChange()) return;
    setStyleMatchMode(next);
  }

  function changeUnsupportedFallback(next: boolean): void {
    if (next === allowUnsupportedFallback || !prepareVoicingChange()) return;
    setAllowUnsupportedFallback(next);
  }

  async function toggleVoicingPreview(): Promise<void> {
    if (!block || previewDisabled) return;
    const timeline = block.chords.map((event, index) => ({
      ...event,
      eventId: practiceEventId(event, index),
    }));
    const explicitMidiNotesByEventId = Object.fromEntries(
      timeline.flatMap((event, index) => {
        const notes = activeGuides[index]?.midiNotes;
        return notes ? [[event.eventId, notes] as const] : [];
      }),
    );
    try {
      await playbackController.toggle(
        { kind: "practice", id: previewSourceId },
        {
          type: "timeline",
          timeline,
          bpm,
          sound: previewSound,
          beatsPerBar: beatsPerBar(block.timeSignature),
          explicitMidiNotesByEventId,
        },
      );
    } catch {
      setToast(text.previewFailed);
    }
  }

  function changePreviewSound(sound: PreviewSound): void {
    playbackController.stop();
    setPreviewSound(sound);
  }

  async function previewChordAt(index: number): Promise<void> {
    if (!block || running) return;
    const event = block.chords[index];
    const eventGuide = activeGuides[index];
    if (!event || !eventGuide) return;
    setAuditionEventIndex(index);
    try {
      await playbackController.toggle(
        {
          kind: "practice",
          id: `${previewSourceId}:event:${practiceEventId(event, index)}`,
        },
        {
          type: "chord",
          chord: event.chord,
          sound: previewSound,
          explicitMidiNotes: eventGuide.midiNotes,
        },
      );
    } catch {
      setToast(text.previewFailed);
    }
  }

  async function reconnectMidi() {
    const store = defaultLiveMidiStore.getState();
    if (!store.active) {
      ownsMidiRef.current = true;
      await store.activate();
      return;
    }
    await store.refreshDevices();
    const refreshed = defaultLiveMidiStore.getState();
    const preferred = refreshed.preferences.preferredInput;
    const device = refreshed.devices.find((candidate) => (
      candidate.backendId === preferred?.backendId
      || candidate.name === preferred?.name
    ));
    if (device) await refreshed.selectDevice(device.backendId);
  }

  return (
    <div className="py-5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <div className="shrink-0 border-b border-[var(--lv-border)] pb-4">
        <p className="text-xs font-semibold uppercase text-[var(--lv-accent)]">{text.eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold text-[var(--lv-text)]">{text.title}</h2>
      </div>

      <div
        className="grid min-h-[36rem] gap-0 border-x border-b border-[var(--lv-border)] lg:min-h-0 lg:flex-1 lg:grid-cols-[17rem_minmax(0,1fr)] lg:overflow-hidden"
        data-testid="practice-layout"
      >
        <aside className="border-b border-[var(--lv-border)] bg-[var(--lv-surface)] lg:flex lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b border-[var(--lv-border)] p-3">
            <div className="flex items-center gap-2">
              <Dumbbell aria-hidden="true" size={16} className="text-[var(--lv-accent)]" />
              <h3 className="text-sm font-semibold">{text.queue}</h3>
            </div>
            <select
              className="lv-input mt-3 w-full text-sm"
              value={filter}
              onChange={(event) => setFilter(event.target.value as QueueFilter)}
              aria-label={text.queue}
            >
              <option value="recommended">{text.recommended}</option>
              <option value="favorite">{text.favorite}</option>
              <option value="unstarted">{text.unstarted}</option>
              <option value="confirmation">{text.confirmation}</option>
              <option value="l1">L1</option>
              <option value="l2">L2</option>
              <option value="l3">L3</option>
            </select>
          </div>
          <div
            className="max-h-[37rem] overflow-y-auto lg:min-h-0 lg:flex-1 lg:max-h-none lg:overscroll-contain"
            data-testid="practice-queue-scroll"
          >
            {recommendations.length === 0 ? (
              <p className="p-4 text-sm text-[var(--lv-text-muted)]">{text.noProgressions}</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-[var(--lv-text-muted)]">{text.noMatches}</p>
            ) : filtered.map((item) => (
              <QueueItem
                key={`${item.ideaId}:${item.block.id}`}
                item={item}
                active={selected?.ideaId === item.ideaId && selected.block.id === item.block.id}
                localDate={localDate}
                language={language}
                onClick={() => selectRecommendation(item)}
              />
            ))}
          </div>
        </aside>

        <section
          className="min-w-0 bg-[var(--lv-bg)] p-4 sm:p-6 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain"
          data-testid="practice-workspace-scroll"
        >
          {!selected || !block ? (
            <div className="grid min-h-80 place-items-center text-sm text-[var(--lv-text-muted)]">
              {text.selectPrompt}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--lv-border)] pb-4">
                <div className="min-w-0">
                  <p className="text-xs text-[var(--lv-text-muted)]">{selected.ideaTitle}</p>
                  <h3 className="mt-1 truncate text-lg font-semibold">{block.summaryText}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <PracticeBadge block={block} localDate={localDate} language={language} />
                    {block.pinned ? (
                      <span className="inline-flex items-center gap-1 border border-[var(--lv-border)] px-2 py-1 text-xs">
                        <Heart aria-hidden="true" size={16} /> {text.favorite}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  className="lv-button-ghost px-3 py-2 text-sm"
                  onClick={() => openProgression(selected.ideaId, block.id)}
                >
                  {text.openDetail}
                </button>
              </div>

              <div className="grid gap-4 border-b border-[var(--lv-border)] py-4 xl:grid-cols-[1fr_auto_auto]">
                <div>
                  <p className="mb-2 text-xs font-semibold text-[var(--lv-text-muted)]">{text.level}</p>
                  <div className="flex flex-wrap gap-1">
                    {([1, 2, 3] as const).map((value) => (
                      <button
                        key={value}
                        className={segmentClass(level === value)}
                        disabled={running || (value === 3 && !l3Available)}
                        title={value === 3 && !l3Available ? text.l3NeedsKey : undefined}
                        onClick={() => setLevel(value)}
                      >
                        {value === 1 ? text.l1 : value === 2 ? text.l2 : text.l3}
                      </button>
                    ))}
                  </div>
                  {!l3Available ? <p className="mt-2 text-xs text-amber-200">{text.l3NeedsKey}</p> : null}
                </div>
                {!styleMode ? (
                  <label className="text-xs font-semibold text-[var(--lv-text-muted)]">
                    {text.leniency}
                    <select
                      className="lv-input mt-2 block min-w-28 text-sm"
                      value={leniency}
                      disabled={running}
                      onChange={(event) => setLeniency(event.target.value as PracticeLeniency)}
                    >
                      <option value="easy">{text.easy}</option>
                      <option value="normal">{text.normal}</option>
                      <option value="strict">{text.strict}</option>
                    </select>
                  </label>
                ) : <span />}
                <div>
                  <p className="mb-2 text-xs font-semibold text-[var(--lv-text-muted)]">Mode</p>
                  <div className="flex gap-1">
                    <button className={segmentClass(mode === "step")} disabled={running} onClick={() => setMode("step")}>
                      {text.step}
                    </button>
                    <button
                      className={segmentClass(mode === "flow")}
                      disabled={running || !flowAvailable}
                      title={!flowAvailable ? text.flowUnsupported : undefined}
                      onClick={() => setMode("flow")}
                    >
                      {text.flow}
                    </button>
                  </div>
                </div>
              </div>

              {!flowAvailable ? (
                <p className="border-b border-[var(--lv-border)] py-3 text-sm text-amber-200">{text.flowUnsupported}</p>
              ) : null}

              <VoicingPracticeControls
                language={language}
                targetSource={targetSource}
                preferences={voicingPreferences}
                matchMode={styleMatchMode}
                allowUnsupportedFallback={allowUnsupportedFallback}
                plan={generatedStylePlan}
                eventBars={eventBars}
                running={Boolean(running)}
                previewing={previewing}
                previewDisabled={previewDisabled}
                previewSound={previewSound}
                onTargetSourceChange={changeTargetSource}
                onPreferencesChange={changeVoicingPreferences}
                onMatchModeChange={changeStyleMatchMode}
                onAllowUnsupportedFallbackChange={changeUnsupportedFallback}
                onPreviewSoundChange={changePreviewSound}
                onPreview={() => void toggleVoicingPreview()}
              />

              <div className="flex flex-wrap items-center gap-3 border-b border-[var(--lv-border)] py-4">
                <span className="text-xs font-semibold text-[var(--lv-text-muted)]">{text.midi}</span>
                <span className={`inline-flex items-center gap-1.5 text-sm ${
                  midiStatus === "connected" ? "text-teal-200" : "text-amber-200"
                }`}>
                  <span className={`h-2 w-2 rounded-full ${
                    midiStatus === "connected" ? "bg-teal-300" : "bg-amber-300"
                  }`} />
                  {midiStatus === "connected"
                    ? `${text.connected}${selectedDevice ? ` · ${selectedDevice.name}` : ""}`
                    : midiStatus === "connecting"
                      ? text.connecting
                      : text.disconnected}
                </span>
                {midiError ? <span className="text-xs text-amber-200">{midiError}</span> : null}
                <button
                  className="lv-button-ghost ml-auto inline-flex h-9 items-center gap-2 px-3 text-sm"
                  onClick={() => void reconnectMidi()}
                >
                  <RefreshCw aria-hidden="true" size={16} /> {text.reconnect}
                </button>
                <button
                  className="lv-button-ghost inline-flex h-9 items-center gap-2 px-3 text-sm"
                  onClick={openSettings}
                >
                  <Settings aria-hidden="true" size={16} /> {text.settings}
                </button>
              </div>

              <div className="py-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(7rem,0.65fr)_minmax(18rem,2fr)_auto]">
                  <div>
                    <p className="text-xs font-semibold uppercase text-[var(--lv-accent)]">{text.current}</p>
                    <p
                      className="mt-2 text-3xl font-semibold"
                      data-testid="practice-current-chord"
                    >
                      {practiceChordLabel(currentTarget, level, keySignature)}
                    </p>
                    {styleMode && guide ? (
                      <span
                        className="mt-2 inline-flex border border-teal-700 px-2 py-1 text-xs font-semibold text-teal-200"
                        title={guide.addedColorIntervals.length > 0
                          ? text.addedColor(guide.addedColorIntervals)
                          : undefined}
                        data-testid="practice-style-chip"
                      >
                        {styleGuideLabel(guide, text)}
                      </span>
                    ) : null}
                    <div className="mt-3 flex items-baseline gap-2 text-sm text-[var(--lv-text-muted)]">
                      <span className="text-xs font-semibold uppercase">{text.next}</span>
                      <span>{practiceChordLabel(nextTarget, level, keySignature)}</span>
                    </div>
                  </div>
                  <ProgressionOverview
                    events={block.chords}
                    eventResults={session?.eventResults ?? []}
                    currentIndex={activeEventIndex}
                    level={level}
                    keySignature={keySignature}
                    text={text}
                    previewDisabled={Boolean(running)}
                    previewableEvents={activeGuides.map(Boolean)}
                    onPreviewChord={(index) => void previewChordAt(index)}
                  />
                  <div className="flex h-fit flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:border-l lg:border-[var(--lv-border)] lg:pl-4">
                    <span className="font-semibold">{text.round(session?.roundNumber ?? 1)}</span>
                    {mode === "flow" ? <span>{text.bpm} {bpm} · Beat {beat}</span> : null}
                    <span className="text-[var(--lv-text-muted)]">{text.clean} {session?.consecutiveCleanFlowRounds ?? 0}/2</span>
                  </div>
                </div>

                {level === 1 && guide ? (
                  <div className="mt-4 border border-[var(--lv-border)] bg-[var(--lv-surface)] px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[var(--lv-text-muted)]">{text.guide}</p>
                      <span className="border border-[var(--lv-border)] px-2 py-1 text-xs text-[var(--lv-text-muted)]">
                        {styleMode
                          ? styleGuideLabel(guide, text)
                          : guide.origin === "practice-override"
                            ? text.practice
                            : guide.origin === "source-verified"
                              ? text.source
                              : guide.origin === "source-auto"
                                ? text.sourceInferred
                                : text.generated}
                      </span>
                    </div>
                    {styleMode ? (
                      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                        <p data-testid="practice-left-hand-guide">
                          <span className="block text-xs text-[var(--lv-text-muted)]">{text.leftGuide}</span>
                          {formatGuideNotes(guide.leftHandNotes)}
                        </p>
                        <p data-testid="practice-right-hand-guide">
                          <span className="block text-xs text-[var(--lv-text-muted)]">{text.rightGuide}</span>
                          {formatGuideNotes(guide.rightHandNotes)}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-sm">{formatGuideNotes(guide.midiNotes)}</p>
                    )}
                  </div>
                ) : styleMode && guide ? (
                  <p className="mt-4 text-sm text-[var(--lv-text-muted)]">
                    {text.shape(guide.midiNotes.length)}
                  </p>
                ) : null}

                <div className="mt-4">
                  <PracticeKeyboard
                    range={keyboardRange}
                    guideNotes={guide?.midiNotes ?? []}
                    leftHandGuideNotes={styleMode ? guide?.leftHandNotes ?? [] : []}
                    rightHandGuideNotes={styleMode ? guide?.rightHandNotes ?? [] : []}
                    allowedPitchClasses={currentRequirement?.allowedPitchClasses ?? []}
                    requiredPitchClasses={currentRequirement?.requiredPitchClasses ?? []}
                    level={level}
                    language={language}
                    matchState={session?.lastMatch?.state}
                  />
                </div>

                <div className="mt-3 flex min-h-10 items-center gap-3 border-y border-[var(--lv-border)] py-2.5">
                  <MatchState state={session?.lastMatch?.state} text={text} />
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  {mode === "flow" ? (
                    <label className="text-xs font-semibold text-[var(--lv-text-muted)]">
                      {text.bpm}
                      <input
                        className="lv-input mt-2 block w-24 text-sm"
                        type="number"
                        min={40}
                        max={300}
                        value={bpm}
                        disabled={running}
                        onChange={(event) => setBpm(Math.max(40, Math.min(300, Number(event.target.value))))}
                      />
                    </label>
                  ) : null}
                  {!styleMode ? (
                    <span className="pb-2 text-xs text-[var(--lv-text-muted)]">{text.targetTempo(targetTempoFor(block))}</span>
                  ) : null}
                  <div className="ml-auto flex gap-2">
                    {!running && !paused ? (
                      <button
                        data-testid="practice-start"
                        className="lv-button-primary inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold"
                        disabled={
                          !active
                          || midiStatus !== "connected"
                          || block.chords.length === 0
                          || stylePlanBlocked
                        }
                        onClick={() => void startSession()}
                      >
                        <Play aria-hidden="true" size={16} /> {text.start}
                      </button>
                    ) : null}
                    {running ? (
                      <button className="lv-button-ghost inline-flex h-10 items-center gap-2 px-4 text-sm" onClick={pauseSession}>
                        <Pause aria-hidden="true" size={16} /> {text.pause}
                      </button>
                    ) : null}
                    {paused ? (
                      <button className="lv-button-primary inline-flex h-10 items-center gap-2 px-4 text-sm" onClick={resumeSession}>
                        <Play aria-hidden="true" size={16} /> {text.resume}
                      </button>
                    ) : null}
                    {session && session.status !== "completed" ? (
                      <button className="lv-button-ghost inline-flex h-10 items-center gap-2 px-4 text-sm" onClick={() => endSession()}>
                        <Square aria-hidden="true" size={16} /> {text.end}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-4 text-xs text-[var(--lv-text-muted)]">{text.chordAsBlock}</p>
                <p className="mt-1 text-xs text-[var(--lv-text-muted)]">{text.noSound}</p>
                {session?.lastRoundWasClean && mode === "step" ? (
                  <p className="mt-3 text-sm text-teal-200">{text.flowSuggestion}</p>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function QueueItem({
  item,
  active,
  localDate,
  language,
  onClick,
}: {
  item: PracticeRecommendation;
  active: boolean;
  localDate: string;
  language: AppLanguage;
  onClick: () => void;
}) {
  const state = practiceProgressState(item.block, localDate);
  return (
    <button
      className={`w-full border-b border-[var(--lv-border)] p-3 text-left ${
        active ? "bg-[var(--lv-surface-raised)]" : "hover:bg-[var(--lv-surface-raised)]"
      }`}
      onClick={onClick}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{item.ideaTitle}</span>
        {item.favorite ? <Heart aria-hidden="true" size={16} className="shrink-0 text-amber-200" /> : null}
      </span>
      <span className="mt-1 block truncate text-xs text-[var(--lv-text-muted)]">
        {item.block.chords.slice(0, 4).map((event) => event.chord.label).join(" · ") || copy[language].miniSummaryEmpty}
      </span>
      <span className={`mt-2 inline-flex border px-1.5 py-0.5 text-[10px] ${
        state === "confirmation-due"
          ? "border-teal-500 text-teal-200"
          : state === "stale"
            ? "border-amber-500 text-amber-200"
            : "border-[var(--lv-border)] text-[var(--lv-text-muted)]"
      }`}>
        {stateLabel(item.block, state, language)}
      </span>
    </button>
  );
}

function PracticeBadge({
  block,
  localDate,
  language,
}: {
  block: SavedProgressionBlock;
  localDate: string;
  language: AppLanguage;
}) {
  const state = practiceProgressState(block, localDate);
  const outlined = state === "provisional" || state === "confirmation-due";
  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-1 text-xs ${
      state === "stale"
        ? "border-amber-500 text-amber-200"
        : outlined
          ? "border-teal-400 text-teal-200"
          : state === "confirmed"
            ? "border-teal-300 bg-teal-300 text-black"
            : "border-[var(--lv-border)] text-[var(--lv-text-muted)]"
    }`}>
      {state === "stale" ? <AlertTriangle aria-hidden="true" size={16} /> : null}
      {state === "confirmed" ? <Check aria-hidden="true" size={16} /> : null}
      {stateLabel(block, state, language)}
    </span>
  );
}

function ProgressionOverview({
  events,
  eventResults,
  currentIndex,
  level,
  keySignature,
  text,
  previewDisabled,
  previewableEvents,
  onPreviewChord,
}: {
  events: readonly ChordTimelineItem[];
  eventResults: ReadonlyArray<"pending" | "match" | "miss">;
  currentIndex: number;
  level: DojoPracticeLevel;
  keySignature?: string;
  text: typeof copy.ja | typeof copy.en;
  previewDisabled: boolean;
  previewableEvents: readonly boolean[];
  onPreviewChord: (index: number) => void;
}) {
  const total = events.length;
  const progress = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;
  return (
    <div
      className="min-w-0 border-y border-[var(--lv-border)] py-3 lg:border-x lg:border-y-0 lg:px-4 lg:py-0"
      data-testid="practice-progression-overview"
      aria-label={text.progressionOverview}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">
          {text.progressionOverview}
        </p>
        <span className="text-xs font-semibold text-[var(--lv-accent)]">
          {text.progressionPosition(Math.min(currentIndex + 1, total), total)}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden bg-[var(--lv-surface-raised)]"
        role="progressbar"
        aria-label={text.progressionOverview}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={total > 0 ? currentIndex + 1 : 0}
      >
        <span
          className="block h-full bg-[var(--lv-accent)] transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div
        className="mt-2 grid gap-1.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(6.25rem, 1fr))" }}
      >
        {events.map((event, index) => {
          const current = index === currentIndex;
          const result = eventResults[index] ?? "pending";
          const status = current
            ? text.stepCurrent
            : result === "match"
              ? text.stepComplete
              : result === "miss"
                ? text.stepMissed
                : text.stepUpcoming;
          return (
            <button
              key={event.eventId ?? `${event.bar}:${event.beat}:${index}`}
              type="button"
              className={`${progressionStepClass(current, result)} text-left transition-colors enabled:hover:border-teal-500 disabled:cursor-default`}
              data-progression-index={index}
              data-progression-state={current ? "current" : result}
              aria-current={current ? "step" : undefined}
              aria-label={text.previewChord(practiceChordLabel(event, level, keySignature))}
              disabled={previewDisabled || !previewableEvents[index]}
              onClick={() => onPreviewChord(index)}
            >
              <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--lv-text-muted)]">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span>{text.barLabel(event.bar)}</span>
              </div>
              <p className="mt-1 truncate text-sm font-semibold">
                {practiceChordLabel(event, level, keySignature)}
              </p>
              <p className={`mt-1 text-[10px] ${
                current
                  ? "text-teal-200"
                  : result === "miss"
                    ? "text-amber-200"
                    : "text-[var(--lv-text-muted)]"
              }`}>
                {status}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function progressionStepClass(
  current: boolean,
  result: "pending" | "match" | "miss",
): string {
  const base = "min-w-0 border px-2 py-1.5";
  if (current) {
    return `${base} border-teal-300 bg-teal-950/40`;
  }
  if (result === "match") {
    return `${base} border-teal-800 bg-teal-950/20`;
  }
  if (result === "miss") {
    return `${base} border-amber-700 bg-amber-950/20`;
  }
  return `${base} border-[var(--lv-border)] bg-[var(--lv-surface)]`;
}

function practiceChordLabel(
  event: ChordTimelineItem | undefined,
  level: DojoPracticeLevel,
  keySignature?: string,
): string {
  if (!event) return "-";
  return level === 3
    ? degreeOf(event.chord, keySignature)?.label ?? "-"
    : event.chord.label;
}

function practiceEventId(event: ChordTimelineItem, index: number): string {
  return event.eventId ?? `style-event-${index}`;
}

function practiceTargetSourceKey(source: PracticeTargetSource): string {
  return source.type === "style" ? source.styleId : source.type;
}

function uniquePitchClasses(notes: readonly number[]): number[] {
  return [...new Set(notes.map((note) => ((note % 12) + 12) % 12))]
    .sort((left, right) => left - right);
}

function formatGuideNotes(notes: readonly number[]): string {
  return notes.length > 0
    ? notes
      .map((note) => formatMidiNoteForDisplay(note, "fl-studio", "flat"))
      .join(" · ")
    : "-";
}

function styleGuideLabel(
  guide: PracticeVoicingGuide,
  text: typeof copy.ja | typeof copy.en,
): string {
  if (guide.fallback) return text.styleClose;
  if (guide.styleId === "shell-17") return text.styleShell;
  if (guide.styleId === "open-17") return text.styleOpen;
  if (guide.styleId === "rootless-ab") return text.styleRootless(guide.variant);
  return text.styleClose;
}

function MatchState({
  state,
  text,
}: {
  state: PracticeSessionState["lastMatch"] extends infer _Value
    ? "empty" | "partial" | "match" | "wrong" | undefined
    : never;
  text: typeof copy.ja | typeof copy.en;
}) {
  const label = state === "match"
    ? text.match
    : state === "wrong"
      ? text.wrong
      : state === "partial"
        ? text.partial
        : text.ready;
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-semibold ${
      state === "match" ? "text-teal-200" : state === "wrong" ? "text-amber-200" : "text-[var(--lv-text-secondary)]"
    }`}>
      {state === "match" ? <Check aria-hidden="true" size={16} /> : null}
      {state === "wrong" ? <AlertTriangle aria-hidden="true" size={16} /> : null}
      {label}
    </span>
  );
}

function stateLabel(
  block: SavedProgressionBlock,
  state: ReturnType<typeof practiceProgressState>,
  language: AppLanguage,
): string {
  const text = copy[language];
  if (state === "stale") return text.stale;
  if (state === "confirmation-due") return text.confirmationDue;
  if (state === "provisional") return text.provisional;
  if (state === "confirmed") return text.confirmed(block.practice?.confirmedLevel ?? 1);
  return text.unstarted;
}

function matchesQueueFilter(
  item: PracticeRecommendation,
  filter: QueueFilter,
  localDate: string,
): boolean {
  const state = practiceProgressState(item.block, localDate);
  if (filter === "recommended") return true;
  if (filter === "favorite") return item.favorite;
  if (filter === "unstarted") return state === "unstarted";
  if (filter === "confirmation") return state === "confirmation-due";
  const targetLevel = Number(filter.slice(1));
  return item.block.practice?.confirmedLevel === targetLevel
    || item.block.practice?.provisional?.level === targetLevel;
}

function segmentClass(active: boolean): string {
  return active
    ? "rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-black disabled:opacity-40"
    : "rounded border border-[var(--lv-border)] px-3 py-2 text-sm text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)] disabled:opacity-40";
}

function targetTempoFor(block: SavedProgressionBlock): number {
  return block.bpm ? Math.max(60, Math.round(block.bpm * 0.7)) : 60;
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
