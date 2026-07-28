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
import { MixPracticeWorkspace } from "../components/practice/MixPracticeWorkspace";
import { PracticeKeyboard } from "../components/practice/PracticeKeyboard";
import { TranspositionPracticeControls } from "../components/practice/TranspositionPracticeControls";
import { VoicingPracticeControls } from "../components/practice/VoicingPracticeControls";
import { VoicingSourceChip } from "../components/voicing/VoicingSourceChip";
import { voiceChordForPreview } from "../domain/chordVoicing";
import { degreeOf } from "../domain/harmony/degrees";
import { beatsPerBar } from "../domain/midi/timing";
import {
  buildPracticeChordRequirements,
  createPracticeSessionState,
  practiceInputFromLiveState,
  practiceProgressForCurrentFingerprint,
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
  type ProgressionPracticeProgress,
  type PracticeSessionContext,
  type PracticeSessionLevel,
  type PracticeSessionState,
} from "../domain/practice";
import {
  createMixSessionState,
  preflightMixSession,
  progressionReferenceKey,
  type MixPreflightError,
  type MixProgressionCandidate,
  type MixProgressionReference,
  type MixSessionConfig,
  type MixSessionState,
} from "../domain/practiceMix";
import {
  completeTranspositionRound,
  createPracticeTargetMatchEvaluator,
  createPracticeTargetPlan,
  createTranspositionSession,
  evaluateTranspositionEligibility,
  formatKeySignature,
  parseKeySignature,
  recordTranspositionPracticeRound,
  selectTranspositionKey,
  setTranspositionEligibility,
  skipTranspositionKey,
  transpositionCoverageSummary,
  transpositionProgressLevel,
  transposeProgression,
  type TranspositionPracticeLevel,
  type TranspositionSessionState,
} from "../domain/practiceTransposition";
import type {
  AppLanguage,
  ChordTimelineItem,
  SavedProgressionBlock,
  SongIdea,
} from "../domain/types";
import { resolveVoicingForUse, voicingSourceStatus } from "../domain/voicing";
import {
  DEFAULT_OCTAVE_SHIFT_CANDIDATES,
  generateStyleVoicingPlan,
  matchExactPitch,
  matchPitchClasses,
  type GeneratedStyleVoicing,
  type GenerateStyleVoicingOptions,
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
  practiceClock?: Pick<PracticeClock, "start" | "stop" | "pause" | "resume">;
}

type QueueFilter =
  | "recommended"
  | "favorite"
  | "unstarted"
  | "confirmation"
  | "l1"
  | "l2"
  | "l3"
  | "l4"
  | "l5";

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
    l4: "L4 近くのキーでも",
    l5: "L5 どのキーでも",
    leniency: "判定",
    easy: "ゆるい",
    normal: "ふつう",
    strict: "きびしい",
    modeLabel: "モード",
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
    flowClockStartFailed: "フロー練習を開始できませんでした。MIDI接続とオーディオ設定を確認してください。",
    current: "いま",
    next: "つぎ",
    progressionOverview: "進行全体",
    progressionPosition: (current: number, total: number) => `${current} / ${total}`,
    previewChord: (label: string) => `${label}を試聴`,
    currentKey: (key: string) => `Key ${key}`,
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
    transpositionNeedsKey: "L4/L5にはメジャーまたはマイナーのキー設定が必要です。",
    transpositionOpenDetail: "進行詳細でキーを設定",
    transpositionPractice: "移調練習",
    targetPlanRangeUnavailable: "このボイシングは移調後の鍵盤範囲に収まりません。別のボイシングを選んでください。",
    stepToFlow: "このキーをフローで弾いてみますか？",
    startFlow: "フローで練習",
    dirtyRetry: "このキーをもう一度練習します。",
    skipKey: "次のキーへ",
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
    mixSelect: "ミックス選択",
    mixUnavailable: "L4/L5の移調練習中はミックスを選択できません。",
    mixSelected: (count: number) => `${count}件選択`,
    mixMaximum: "ミックス練習では最大5進行まで選べます。",
    mixClear: "選択を解除",
    mixCancel: "キャンセル",
    mixSetup: "ミックス練習の共通設定",
    mixStart: "ミックス練習を開始",
    mixCycles: "巡数",
    mixCycle: (count: number) => `${count}巡`,
    mixNeedSelection: "2〜5進行を選択してください。",
    mixPreflightTitle: "ミックス練習を開始できません。",
    mixMissingBlock: "進行が見つかりません。",
    mixMissingKey: "Keyが設定されていないためL3を利用できません。",
    mixUnsupportedKey: "メジャーまたはマイナーのKeyを確認してください。",
    mixFlowSignature: "フローでは4/4の進行だけ利用できます。",
    mixTargetUnavailable: "選択中のボイシングを生成できません。",
    mixInvalid: "コード進行データを確認してください。",
    mixTargetSource: "練習するボイシング",
    mixResolved: "保存ボイシング",
    mixClose: "自動（クローズ）",
    mixShell: "シェル 1-7",
    mixOpen: "オープン 1-7",
    mixRootless: "ルートレス A/B",
    mixFallback: "未対応コードだけ自動（クローズ）を使用",
    mixExact: "指定音高",
    mixPitchClass: "ピッチクラス",
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
    l4: "L4 Nearby keys",
    l5: "L5 Any key",
    leniency: "Judgement",
    easy: "Easy",
    normal: "Normal",
    strict: "Strict",
    modeLabel: "Mode",
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
    flowClockStartFailed: "Flow practice could not start. Check the MIDI connection and audio settings.",
    current: "Now",
    next: "Next",
    progressionOverview: "Full progression",
    progressionPosition: (current: number, total: number) => `${current} / ${total}`,
    previewChord: (label: string) => `Preview ${label}`,
    currentKey: (key: string) => `Key ${key}`,
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
    transpositionNeedsKey: "L4/L5 requires a supported major or minor key.",
    transpositionOpenDetail: "Set the key in progression details",
    transpositionPractice: "Transposition practice",
    targetPlanRangeUnavailable: "This voicing does not fit the playable keyboard range after transposition. Choose another voicing.",
    stepToFlow: "Try this key in Flow mode?",
    startFlow: "Practice in Flow",
    dirtyRetry: "Retrying the same key.",
    skipKey: "Next key",
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
    mixSelect: "Mix selection",
    mixUnavailable: "Mix cannot be selected while L4/L5 transposition practice is active.",
    mixSelected: (count: number) => `${count} selected`,
    mixMaximum: "Mix practice supports up to five progressions.",
    mixClear: "Clear selection",
    mixCancel: "Cancel",
    mixSetup: "Shared Mix practice settings",
    mixStart: "Start Mix practice",
    mixCycles: "Cycles",
    mixCycle: (count: number) => `${count} cycle${count === 1 ? "" : "s"}`,
    mixNeedSelection: "Select two to five progressions.",
    mixPreflightTitle: "Mix practice cannot start.",
    mixMissingBlock: "The progression could not be found.",
    mixMissingKey: "A key is required to use L3.",
    mixUnsupportedKey: "Check that the key is major or minor.",
    mixFlowSignature: "Flow supports only 4/4 progressions.",
    mixTargetUnavailable: "The selected practice voicing could not be generated.",
    mixInvalid: "Check the chord progression data.",
    mixTargetSource: "Practice voicing",
    mixResolved: "Saved voicing",
    mixClose: "Automatic (close)",
    mixShell: "Shell 1-7",
    mixOpen: "Open 1-7",
    mixRootless: "Rootless A/B",
    mixFallback: "Use Automatic (close) only for unsupported chords",
    mixExact: "Exact pitch",
    mixPitchClass: "Pitch class",
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
  practiceClock,
}: PracticeViewProps) {
  const text = copy[language];
  const localDate = localDateString(new Date());
  const recommendations = useMemo(
    () => recommendPracticeBlocks(ideas, localDate),
    [ideas, localDate],
  );
  const mixCandidates = useMemo<readonly MixProgressionCandidate[]>(
    () => recommendations.map((item) => ({
      reference: { ideaId: item.ideaId, blockId: item.block.id },
      title: mixProgressionTitle(item),
      block: item.block,
      effectiveKeySignature: item.effectiveKeySignature,
    })),
    [recommendations],
  );
  const [filter, setFilter] = useState<QueueFilter>("recommended");
  const [target, setTarget] = useState<PracticeTarget | undefined>(initialTarget);
  const [level, setLevel] = useState<PracticeSessionLevel>(1);
  const [leniency, setLeniency] = useState<PracticeLeniency>("normal");
  const [mode, setMode] = useState<PracticeMode>("step");
  const [bpm, setBpm] = useState(60);
  const [session, setSession] = useState<PracticeSessionState>();
  const [transpositionSession, setTranspositionSession] = useState<
    TranspositionSessionState
  >();
  const [pendingFlowRestartKey, setPendingFlowRestartKey] = useState<number>();
  const [flowClockStarting, setFlowClockStarting] = useState(false);
  const [flowClockReady, setFlowClockReady] = useState(false);
  const [beat, setBeat] = useState(1);
  const [auditionEventIndex, setAuditionEventIndex] = useState<number>();
  const [previewSound, setPreviewSound] = useState<PreviewSound>("piano");
  const [targetSource, setTargetSource] = useState<PracticeTargetSource>({
    type: "resolved-voicing",
  });
  const [styleMatchMode, setStyleMatchMode] = useState<StyleVoicingMatchMode>("exact-pitch");
  const [allowUnsupportedFallback, setAllowUnsupportedFallback] = useState(false);
  const [mixSelecting, setMixSelecting] = useState(false);
  const [mixReferences, setMixReferences] = useState<MixProgressionReference[]>([]);
  const [mixCycles, setMixCycles] = useState<1 | 2 | 3>(1);
  const [mixErrors, setMixErrors] = useState<readonly MixPreflightError[]>([]);
  const [mixInitialState, setMixInitialState] = useState<MixSessionState>();
  const [voicingPreferences, setVoicingPreferences] = useState<VoicingPracticePreferences>(
    loadVoicingPracticePreferences,
  );
  const mixStyleOptions = useMemo<GenerateStyleVoicingOptions>(() => ({
    maxLeftHandSpanSemitones: voicingPreferences.maxLeftHandSpanSemitones,
    maxRightHandSpanSemitones: voicingPreferences.maxRightHandSpanSemitones,
    allowUnsupportedFallback,
  }), [allowUnsupportedFallback, voicingPreferences]);
  const clockRef = useRef<
    Pick<PracticeClock, "start" | "stop" | "pause" | "resume">
  >(practiceClock ?? new PracticeClock());
  const ownsMidiRef = useRef(false);
  const persistedRoundRef = useRef(0);
  const flowRestartingRef = useRef(false);
  const flowClockGenerationRef = useRef(0);
  const flowClockPendingGenerationRef = useRef<number>();
  const flowClockPausedGenerationRef = useRef<number>();
  const flowClockReadyRef = useRef(false);
  const transpositionSourceIdentityRef = useRef<string>();
  const latestSessionRef = useRef<PracticeSessionState>();
  const latestTranspositionSessionRef = useRef<TranspositionSessionState>();
  const latestBlockRef = useRef<SavedProgressionBlock>();
  const latestSelectedRef = useRef<PracticeRecommendation>();
  const latestPracticeProgressRef = useRef<ProgressionPracticeProgress>();
  const lastPersistedSessionRef = useRef<PracticeSessionState>();
  const styleModeRef = useRef(false);
  const mixModeRef = useRef(false);
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
    setTranspositionSession(undefined);
    setSession(undefined);
    setMixSelecting(false);
    setMixReferences([]);
    setMixErrors([]);
    setMixInitialState(undefined);
    mixModeRef.current = false;
  }, [initialTarget]);

  useEffect(() => {
    ownsMidiRef.current = !defaultLiveMidiStore.getState().active;
    if (ownsMidiRef.current) void defaultLiveMidiStore.getState().activate();
    const unregisterClosePreparation = registerClosePreparation(() => {
      persistPendingSession();
    });
    return () => {
      unregisterClosePreparation();
      flowClockGenerationRef.current += 1;
      flowClockPendingGenerationRef.current = undefined;
      flowClockPausedGenerationRef.current = undefined;
      flowClockReadyRef.current = false;
      clockRef.current.stop();
      persistPendingSession();
      if (ownsMidiRef.current) void defaultLiveMidiStore.getState().deactivate();
    };
  }, [updateProgressionBlock]);

  function persistPendingSession(): void {
    if (styleModeRef.current || mixModeRef.current) return;
    const current = latestSessionRef.current;
    const currentBlock = latestBlockRef.current;
    const currentSelected = latestSelectedRef.current;
    if (
      !current
      || current.status === "completed"
      || !currentBlock
      || !currentSelected
      || !isDojoPracticeLevel(current.level)
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
      }, currentSelected.effectiveKeySignature),
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
  const keySignature = block?.detectedKey ?? selectedIdea?.key;
  const sourceKey = useMemo(
    () => keySignature ? parseKeySignature(keySignature) : undefined,
    [keySignature],
  );
  const transpositionSourceIdentity = selected && block
    ? [
        selected.ideaId,
        block.id,
        progressionFingerprint(block),
        keySignature ?? "",
        selected.stale ? "stale" : "current",
      ].join(":")
    : undefined;
  const transpositionMode = isTranspositionLevel(level);
  const l3Available = Boolean(keySignature);
  const transpositionAvailable = Boolean(sourceKey);
  const styleMode = targetSource.type !== "resolved-voicing";
  const transpositionEligibility = useMemo(
    () => isTranspositionLevel(level)
      ? evaluateTranspositionEligibility({
          level,
          mode,
          bpm,
          targetTempo: block ? targetTempoFor(block) : 0,
          targetSource,
          confirmedLevel: block?.practice?.confirmedLevel,
          stale: Boolean(selected?.stale),
        })
      : { eligible: false, reasons: [] },
    [
      block,
      bpm,
      level,
      mode,
      selected?.stale,
      targetSource,
    ],
  );
  const flowAvailable = !block?.timeSignature || block.timeSignature === "4/4";
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
  const sourceGuides = useMemo(
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
  const sourceRequirements = useMemo(
    () => styleMode
      ? sourceGuides.map((guide, index) => {
          const pitchClasses = uniquePitchClasses(guide?.midiNotes ?? []);
          return {
            requiredPitchClasses: pitchClasses,
            optionalPitchClasses: [],
            allowedPitchClasses: pitchClasses,
            chordKey: standardRequirements[index]?.chordKey ?? "",
          };
        })
      : standardRequirements,
    [sourceGuides, standardRequirements, styleMode],
  );
  const styleMatchInput = useMemo(
    () => styleMode
      ? (
          _requirements: (typeof sourceRequirements)[number],
          input: Parameters<typeof matchExactPitch>[1],
          requiredAttackRevision: number,
          eventIndex: number,
        ) => {
          const targetNotes = sourceGuides[eventIndex]?.midiNotes ?? [];
          return styleMatchMode === "exact-pitch"
            ? matchExactPitch(targetNotes, input, requiredAttackRevision, {
                allowGlobalOctaveShift: voicingPreferences.allowGlobalOctaveShift,
                octaveShiftCandidates: DEFAULT_OCTAVE_SHIFT_CANDIDATES,
              })
            : matchPitchClasses(targetNotes, input, requiredAttackRevision);
        }
      : undefined,
    [
      sourceGuides,
      sourceRequirements,
      styleMatchMode,
      styleMode,
      voicingPreferences.allowGlobalOctaveShift,
    ],
  );
  const transposedProgression = useMemo(() => {
    if (
      !transpositionMode
      || !transpositionSession
      || !sourceKey
      || !selected
      || !block
    ) {
      return undefined;
    }
    return transposeProgression({
      sourceKey,
      sourceMode: sourceKey.mode,
      events: block.chords,
      targetTonicPitchClass: transpositionSession.currentTargetKeyPitchClass,
      sourceReference: {
        ideaId: selected.ideaId,
        blockId: block.id,
      },
    });
  }, [
    block,
    selected,
    sourceKey,
    transpositionMode,
    transpositionSession,
  ]);
  const transpositionTargetResult = useMemo(() => {
    if (!transposedProgression) return undefined;
    return createPracticeTargetPlan({
      progression: transposedProgression,
      targetSource,
      leniency,
      styleOptions: mixStyleOptions,
      styleMatchMode,
      exactPitchOptions: {
        allowGlobalOctaveShift: voicingPreferences.allowGlobalOctaveShift,
        octaveShiftCandidates: DEFAULT_OCTAVE_SHIFT_CANDIDATES,
      },
    });
  }, [
    allowUnsupportedFallback,
    leniency,
    styleMatchMode,
    targetSource,
    transposedProgression,
    voicingPreferences.allowGlobalOctaveShift,
    voicingPreferences.maxLeftHandSpanSemitones,
    voicingPreferences.maxRightHandSpanSemitones,
  ]);
  const transpositionTargetPlan = transpositionTargetResult?.ok
    ? transpositionTargetResult.plan
    : undefined;
  const practiceEvents = transpositionMode
    ? transposedProgression?.events ?? []
    : block?.chords ?? [];
  const activeGuides = useMemo(
    (): Array<PracticeVoicingGuide | undefined> => transpositionMode
      ? transpositionTargetPlan?.events.map((event) => ({
          midiNotes: [...event.midiNotes],
          leftHandNotes: [...event.leftHandNotes],
          rightHandNotes: [...event.rightHandNotes],
          origin: event.origin,
          styleId: event.styleId,
          variant: event.variant,
          addedColorIntervals: [...event.addedColorIntervals],
          fallback: event.fallback,
        })) ?? []
      : sourceGuides,
    [sourceGuides, transpositionMode, transpositionTargetPlan],
  );
  const requirements = transpositionMode
    ? transpositionTargetPlan?.requirements ?? []
    : sourceRequirements;
  const transpositionMatchInput = useMemo(
    () => transpositionTargetPlan
      ? createPracticeTargetMatchEvaluator(transpositionTargetPlan)
      : undefined,
    [transpositionTargetPlan],
  );
  const currentTarget = practiceEvents[displayedEventIndex];
  const nextTarget = practiceEvents.length > 1
    ? practiceEvents[(displayedEventIndex + 1) % practiceEvents.length]
    : undefined;
  const displayedKeySignature = transpositionMode && transposedProgression
    ? formatKeySignature(transposedProgression.targetKey, language)
    : keySignature;
  const sessionContext = useMemo(
    () => ({
      events: practiceEvents,
      requirements,
      ...((transpositionMode ? transpositionMatchInput : styleMatchInput)
        ? {
            matchInput: transpositionMode
              ? transpositionMatchInput
              : styleMatchInput,
          }
        : {}),
    }),
    [
      practiceEvents,
      requirements,
      styleMatchInput,
      transpositionMatchInput,
      transpositionMode,
    ],
  );
  const currentRequirement = requirements[displayedEventIndex];
  const guide = activeGuides[displayedEventIndex];
  const sourceEvent = block?.chords[displayedEventIndex];
  const currentVoicingSource = styleMode || !sourceEvent
    ? { status: "generated" as const, reason: "source-missing" as const }
    : voicingSourceStatus(sourceEvent.chord, sourceEvent.voicingMemory);
  const keyboardRange = useMemo(
    () => computePracticeKeyboardRange(
      activeGuides.flatMap((resolved) => resolved ? [resolved.midiNotes] : []),
    ),
    [activeGuides],
  );
  const eventBars = useMemo(
    () => Object.fromEntries(
      practiceEvents.map((event, index) => [
        event.eventId ?? practiceEventId(event, index),
        event.bar,
      ]),
    ),
    [practiceEvents],
  );
  const previewSourceId = block
    ? `${block.id}:voicing:${practiceTargetSourceKey(targetSource)}:${
        transpositionSession?.currentTargetKeyPitchClass ?? "source"
      }`
    : "voicing-practice";
  const previewing = playbackState.status !== "idle"
    && playbackState.source?.kind === "practice"
    && playbackState.source.id === previewSourceId;
  const stylePlanBlocked = styleMode
    && Boolean(
      transpositionMode
        ? transpositionTargetPlan?.unsupportedEvents.length
        : generatedStylePlan?.unsupportedEvents.length,
    )
    && !allowUnsupportedFallback;
  const filtered = recommendations.filter((item) => matchesQueueFilter(item, filter, localDate));
  const mixActive = Boolean(mixInitialState);
  const mixSelectionKeys = useMemo(
    () => new Set(mixReferences.map(progressionReferenceKey)),
    [mixReferences],
  );
  const running = session?.status === "running";
  const paused = session?.status === "paused";
  const flowRestartPending = pendingFlowRestartKey !== undefined;
  const previewDisabled = !block
    || running
    || stylePlanBlocked
    || (transpositionMode && !transpositionTargetPlan)
    || Boolean(
      transpositionMode
      && transpositionTargetPlan?.events.some((event) => !event.ready),
    )
    || activeGuides.length !== practiceEvents.length
    || activeGuides.some((item) => !item);
  const activeEventIndex = practiceEvents.length
    ? Math.max(0, Math.min(practiceEvents.length - 1, displayedEventIndex))
    : 0;

  useEffect(() => {
    styleModeRef.current = styleMode;
  }, [styleMode]);

  useEffect(() => {
    latestSessionRef.current = session;
    latestTranspositionSessionRef.current = transpositionSession;
    latestBlockRef.current = block;
    latestSelectedRef.current = selected;
  }, [block, selected, session, transpositionSession]);

  useEffect(() => {
    latestPracticeProgressRef.current = block?.practice;
  }, [block?.id, block?.practice]);

  useEffect(() => {
    setTranspositionSession((current) => current
      ? setTranspositionEligibility(current, transpositionEligibility)
      : current);
  }, [transpositionEligibility]);

  useEffect(() => {
    if (!transpositionMode) {
      transpositionSourceIdentityRef.current = undefined;
      return;
    }
    if (
      transpositionSourceIdentityRef.current === undefined
      || transpositionSourceIdentityRef.current === transpositionSourceIdentity
    ) {
      transpositionSourceIdentityRef.current = transpositionSourceIdentity;
      return;
    }

    transpositionSourceIdentityRef.current = transpositionSourceIdentity;
    invalidateFlowClock();
    clockRef.current.stop();
    playbackController.stop();
    setPendingFlowRestartKey(undefined);
    setSession(undefined);
    setAuditionEventIndex(undefined);
    if (!sourceKey || !isTranspositionLevel(level)) {
      setTranspositionSession(undefined);
      return;
    }
    const next = createTranspositionSession({
      level,
      sourceKeyPitchClass: sourceKey.tonicPitchClass,
      sourceMode: sourceKey.mode,
      seed: createSessionSeed(),
      eligibility: transpositionEligibility,
      progress: selected?.stale
        ? undefined
        : block?.practice?.transposition,
      provisional: selected?.stale
        ? undefined
        : block?.practice?.provisional,
      localDate,
    });
    latestTranspositionSessionRef.current = next;
    setTranspositionSession(next);
  }, [
    level,
    sourceKey,
    transpositionEligibility,
    transpositionMode,
    transpositionSourceIdentity,
  ]);

  useEffect(() => {
    if (
      pendingFlowRestartKey === undefined
      || flowRestartingRef.current
      || session?.status !== "paused"
      || session.mode !== "flow"
      || transposedProgression?.targetKey.tonicPitchClass !== pendingFlowRestartKey
      || !transpositionTargetPlan
    ) {
      return;
    }
    flowRestartingRef.current = true;
    const restartKey = pendingFlowRestartKey;
    void (async () => {
      const started = await startFlowClock(
        practiceEvents,
        sessionContext,
        "paused",
      );
      if (
        !started
        || latestSessionRef.current?.status !== "paused"
        || latestTranspositionSessionRef.current?.currentTargetKeyPitchClass
          !== restartKey
      ) {
        if (started) {
          invalidateFlowClock();
          clockRef.current.stop();
        }
        return;
      }
      setSession((current) => {
        if (!current || current.status !== "paused") return current;
        const resumed = reducePracticeSession(
          current,
          { type: "RESUME" },
          sessionContext,
        );
        latestSessionRef.current = resumed;
        return resumed;
      });
    })().finally(() => {
      flowRestartingRef.current = false;
      setPendingFlowRestartKey((current) => (
        current === restartKey ? undefined : current
      ));
    });
  }, [
    pendingFlowRestartKey,
    practiceEvents,
    session?.mode,
    session?.status,
    sessionContext,
    transposedProgression?.targetKey.tonicPitchClass,
    transpositionTargetPlan,
  ]);

  useEffect(() => {
    if (
      !running
      || !currentRequirement
      || (session?.mode === "flow" && !flowClockReady)
    ) {
      return;
    }
    const input = practiceInputFromLiveState(liveNotes, performance.now());
    setSession((current) => {
      if (!current) return current;
      const next = reducePracticeSession(
        current,
        { type: "MIDI_STATE_CHANGED", input },
        sessionContext,
      );
      latestSessionRef.current = next;
      return next;
    });
  }, [
    currentRequirement,
    flowClockReady,
    liveNotes,
    running,
    session?.mode,
    sessionContext,
  ]);

  useEffect(() => {
    const candidate = session?.provisionalCandidate;
    if (!candidate || !running) return undefined;
    const delay = Math.max(0, candidate.sinceMs + 100 - performance.now());
    const timer = globalThis.setTimeout(() => {
      setSession((current) => {
        if (!current) return current;
        const next = reducePracticeSession(
          current,
          { type: "STABLE_DEADLINE", nowMs: performance.now() },
          sessionContext,
        );
        latestSessionRef.current = next;
        return next;
      });
    }, delay);
    return () => globalThis.clearTimeout(timer);
  }, [running, session?.provisionalCandidate, sessionContext]);

  useEffect(() => {
    if (midiStatus !== "disconnected" && midiStatus !== "error") return;
    const canceledPendingStart = cancelPendingFlowClock();
    if (!canceledPendingStart) invalidateFlowClock();
    if (canceledPendingStart) {
      clockRef.current.stop();
    } else {
      clockRef.current.pause();
    }
    setSession((current) => {
      if (!current) return current;
      const next = reducePracticeSession(
        current,
        { type: "DEVICE_DISCONNECTED" },
        sessionContext,
      );
      latestSessionRef.current = next;
      return next;
    });
  }, [midiStatus, sessionContext]);

  useEffect(() => {
    if (
      styleMode
      || transpositionMode
      || !block
      || session?.mode !== "flow"
      || !session.lastRoundWasClean
      || session.roundNumber <= persistedRoundRef.current
    ) return;
    persistedRoundRef.current = session.roundNumber;
    persistProgress(block, session);
  }, [block, session, styleMode, transpositionMode]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || event.isComposing
        || event.altKey
        || event.ctrlKey
        || event.metaKey
      ) {
        return;
      }
      const element = event.target;
      if (
        element instanceof Element
        && element.matches("input, textarea, select, [contenteditable=true]")
      ) return;
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
        pauseSession();
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
    setTranspositionSession(undefined);
    const confirmed = item.block.practice?.confirmedLevel;
    const suggested = confirmed && confirmed < 3 ? (confirmed + 1) as DojoPracticeLevel : 1;
    setLevel(item.stale ? 1 : suggested);
    setBpm(Math.min(60, targetTempoFor(item.block)));
    setSession(undefined);
  }

  function changeLevel(nextLevel: PracticeSessionLevel): void {
    if (nextLevel === level || running) return;
    invalidateFlowClock();
    clockRef.current.stop();
    playbackController.stop();
    setSession(undefined);
    setAuditionEventIndex(undefined);
    persistedRoundRef.current = 0;
    setPendingFlowRestartKey(undefined);
    setLevel(nextLevel);
    if (
      isTranspositionLevel(nextLevel)
      && sourceKey
    ) {
      transpositionSourceIdentityRef.current = transpositionSourceIdentity;
      const next = createTranspositionSession({
        level: nextLevel,
        sourceKeyPitchClass: sourceKey.tonicPitchClass,
        sourceMode: sourceKey.mode,
        seed: createSessionSeed(),
        eligibility: evaluateTranspositionEligibility({
          level: nextLevel,
          mode,
          bpm,
          targetTempo: block ? targetTempoFor(block) : 0,
          targetSource,
          confirmedLevel: block?.practice?.confirmedLevel,
          stale: Boolean(selected?.stale),
        }),
        progress: selected?.stale
          ? undefined
          : block?.practice?.transposition,
        provisional: selected?.stale
          ? undefined
          : block?.practice?.provisional,
        localDate,
      });
      latestTranspositionSessionRef.current = next;
      setTranspositionSession(next);
    } else {
      setTranspositionSession(undefined);
    }
  }

  function selectTargetKey(pitchClass: number): void {
    if (
      running
      || flowRestartPending
      || flowClockStarting
      || latestTranspositionSessionRef.current?.inConfirmationChallenge
    ) return;
    invalidateFlowClock();
    clockRef.current.stop();
    playbackController.stop();
    setSession(undefined);
    setAuditionEventIndex(undefined);
    setPendingFlowRestartKey(undefined);
    setTranspositionSession((current) => current
      ? selectTranspositionKey(current, pitchClass)
      : current);
  }

  function skipCurrentTranspositionKey(): void {
    const currentTransposition = latestTranspositionSessionRef.current;
    if (
      !currentTransposition
      || !session
      || session.mode !== "flow"
      || session.lastRoundWasClean !== false
      || currentTransposition.inConfirmationChallenge
    ) {
      return;
    }
    invalidateFlowClock();
    clockRef.current.stop();
    const nextTransposition = skipTranspositionKey(currentTransposition);
    latestTranspositionSessionRef.current = nextTransposition;
    setTranspositionSession(nextTransposition);
    setAuditionEventIndex(undefined);

    const reset = createPracticeSessionState({
      blockId: session.blockId,
      progressionFingerprint: session.progressionFingerprint,
      level: session.level,
      mode: session.mode,
      leniency: session.leniency,
      bpm: session.bpm,
      targetTempo: session.targetTempo,
      eventCount: practiceEvents.length,
    });
    const runningSession = reducePracticeSession(
      reset,
      { type: "START_SESSION" },
      sessionContext,
    );
    const pausedSession = pauseForFlowRestart(runningSession, sessionContext);
    latestSessionRef.current = pausedSession;
    setSession(pausedSession);
    setPendingFlowRestartKey(nextTransposition.currentTargetKeyPitchClass);
  }

  function switchStepToFlow(): void {
    invalidateFlowClock();
    clockRef.current.stop();
    playbackController.stop();
    setMode("flow");
    setSession(undefined);
    setAuditionEventIndex(undefined);
  }

  function setFlowClockReadyStatus(next: boolean): void {
    flowClockReadyRef.current = next;
    setFlowClockReady(next);
  }

  function invalidateFlowClock(): void {
    flowClockGenerationRef.current += 1;
    flowClockPausedGenerationRef.current = undefined;
    setFlowClockReadyStatus(false);
  }

  function cancelPendingFlowClock(): boolean {
    if (flowClockPendingGenerationRef.current === undefined) return false;
    invalidateFlowClock();
    flowClockPendingGenerationRef.current = undefined;
    setFlowClockStarting(false);
    return true;
  }

  function isActiveFlowClockGeneration(generation: number): boolean {
    return flowClockGenerationRef.current === generation
      && flowClockReadyRef.current
      && latestSessionRef.current?.status === "running"
      && latestSessionRef.current.mode === "flow";
  }

  async function startFlowClock(
    events: readonly ChordTimelineItem[],
    context: PracticeSessionContext,
    expectedStatus: PracticeSessionState["status"],
  ): Promise<boolean> {
    const generation = flowClockGenerationRef.current + 1;
    flowClockGenerationRef.current = generation;
    flowClockPendingGenerationRef.current = generation;
    flowClockPausedGenerationRef.current = undefined;
    setFlowClockReadyStatus(false);
    setFlowClockStarting(true);
    const expectedTargetKeyPitchClass = latestTranspositionSessionRef.current
      ?.currentTargetKeyPitchClass;
    try {
      await clockRef.current.start({
        events,
        bpm,
        beatsPerBar: 4,
        callbacks: {
          onTargetOpen: (eventIndex) => {
            if (!isActiveFlowClockGeneration(generation)) return;
            setSession((current) => {
              if (!current) return current;
              const next = reducePracticeSession(
                current,
                { type: "FLOW_TARGET_OPEN", eventIndex },
                context,
              );
              latestSessionRef.current = next;
              return next;
            });
          },
          onTargetClose: (eventIndex) => {
            if (!isActiveFlowClockGeneration(generation)) return;
            setSession((current) => {
              if (!current) return current;
              const next = reducePracticeSession(
                current,
                { type: "FLOW_TARGET_CLOSE", eventIndex },
                context,
              );
              latestSessionRef.current = next;
              return next;
            });
          },
          onRoundCompleted: () => completeFlowRound(context, generation),
          onBeat: (nextBeat) => {
            if (isActiveFlowClockGeneration(generation)) {
              setBeat(nextBeat);
            }
          },
        },
      });
    } catch {
      if (flowClockGenerationRef.current !== generation) return false;
      invalidateFlowClock();
      clockRef.current.stop();
      setSession((current) => {
        if (!current || current.mode !== "flow" || current.status !== "running") {
          return current;
        }
        const pausedSession = reducePracticeSession(
          current,
          { type: "PAUSE" },
          context,
        );
        latestSessionRef.current = pausedSession;
        return pausedSession;
      });
      setToast(text.flowClockStartFailed);
      return false;
    } finally {
      if (flowClockPendingGenerationRef.current === generation) {
        flowClockPendingGenerationRef.current = undefined;
        setFlowClockStarting(false);
      }
    }
    const current = latestSessionRef.current;
    if (flowClockGenerationRef.current !== generation) return false;
    if (
      current?.status !== expectedStatus
      || current.mode !== "flow"
      || (
        isTranspositionLevel(current.level)
        && latestTranspositionSessionRef.current?.currentTargetKeyPitchClass
          !== expectedTargetKeyPitchClass
      )
    ) {
      invalidateFlowClock();
      clockRef.current.stop();
      return false;
    }
    setFlowClockReadyStatus(true);
    return true;
  }

  function pauseForFlowRestart(
    current: PracticeSessionState,
    context: PracticeSessionContext,
  ): PracticeSessionState {
    const pausedSession = reducePracticeSession(
      current,
      { type: "PAUSE" },
      context,
    );
    return {
      ...pausedSession,
      requiredAttackRevision: Math.max(
        pausedSession.requiredAttackRevision,
        nextRequiredAttackRevision(),
      ),
    };
  }

  function nextRequiredAttackRevision(): number {
    return practiceInputFromLiveState(
      defaultLiveMidiStore.getState().notes,
      performance.now(),
    ).attackRevision + 1;
  }

  function resetPausedFlowForNewStart(
    context: PracticeSessionContext,
  ): boolean {
    const current = latestSessionRef.current;
    if (!current || current.status !== "paused" || current.mode !== "flow") {
      return false;
    }
    const reset = reducePracticeSession(
      current,
      {
        type: "RESET_FLOW_FOR_RESTART",
        requiredAttackRevision: nextRequiredAttackRevision(),
      },
      context,
    );
    latestSessionRef.current = reset;
    setSession(reset);
    return true;
  }

  function resumePausedSession(
    context: PracticeSessionContext,
    requireFreshAttack: boolean,
  ): boolean {
    const current = latestSessionRef.current;
    if (!current || current.status !== "paused") return false;
    const guarded = requireFreshAttack
      ? {
          ...current,
          requiredAttackRevision: Math.max(
            current.requiredAttackRevision,
            nextRequiredAttackRevision(),
          ),
        }
      : current;
    const resumed = reducePracticeSession(
      guarded,
      { type: "RESUME" },
      context,
    );
    latestSessionRef.current = resumed;
    setSession(resumed);
    return true;
  }

  function completeFlowRound(
    context: PracticeSessionContext,
    generation: number,
  ): void {
    if (!isActiveFlowClockGeneration(generation)) return;
    const current = latestSessionRef.current;
    if (!current) return;
    const completed = reducePracticeSession(
      current,
      { type: "ROUND_COMPLETED" },
      context,
    );
    latestSessionRef.current = completed;
    setSession(completed);
    if (!isTranspositionLevel(completed.level)) return;

    const currentTransposition = latestTranspositionSessionRef.current;
    if (!currentTransposition) return;
    const nextTransposition = completeTranspositionRound(
      currentTransposition,
      {
        mode: "flow",
        clean: Boolean(completed.lastRoundWasClean),
        meetsTargetTempo: completed.bpm >= completed.targetTempo,
      },
    );
    persistTranspositionRound(
      currentTransposition,
      nextTransposition,
      completed,
    );
    if (
      nextTransposition.currentTargetKeyPitchClass
      === currentTransposition.currentTargetKeyPitchClass
    ) {
      return;
    }

    invalidateFlowClock();
    clockRef.current.stop();
    const pausedSession = pauseForFlowRestart(completed, context);
    latestSessionRef.current = pausedSession;
    setSession(pausedSession);
    setAuditionEventIndex(undefined);
    latestTranspositionSessionRef.current = nextTransposition;
    setTranspositionSession(nextTransposition);
    setPendingFlowRestartKey(
      nextTransposition.currentTargetKeyPitchClass,
    );
  }

  async function startSession() {
    if (!selected || !block || practiceEvents.length === 0) return;
    if (
      transpositionMode
      && (!transpositionSession || !transpositionTargetPlan)
    ) {
      return;
    }
    if (stylePlanBlocked) {
      setToast(text.styleStartBlocked);
      return;
    }
    if (
      !styleMode
      && practiceProgressState(
        block,
        localDate,
        selected.effectiveKeySignature,
      ) === "stale"
    ) {
      if (!globalThis.confirm(text.staleConfirm)) return;
      const reset = resetPracticeProgress(
        block,
        selected.effectiveKeySignature,
      );
      if (!updateProgressionBlock(selected.ideaId, block.id, { practice: reset })) {
        setToast(text.saveFailed);
        return;
      }
      const resetBlock = { ...block, practice: reset };
      const resetSelected = {
        ...selected,
        block: resetBlock,
        stale: false,
      };
      latestBlockRef.current = resetBlock;
      latestSelectedRef.current = resetSelected;
      latestPracticeProgressRef.current = reset;
      if (transpositionMode && sourceKey && isTranspositionLevel(level)) {
        const resetEligibility = evaluateTranspositionEligibility({
          level,
          mode,
          bpm,
          targetTempo: targetTempoFor(block),
          targetSource,
          confirmedLevel: reset.confirmedLevel,
          stale: false,
        });
        const rebuilt = createTranspositionSession({
          level,
          sourceKeyPitchClass: sourceKey.tonicPitchClass,
          sourceMode: sourceKey.mode,
          seed: createSessionSeed(),
          eligibility: resetEligibility,
          progress: reset.transposition,
          provisional: reset.provisional,
          localDate,
        });
        const resetSession = transpositionSession
          ? selectTranspositionKey(
              rebuilt,
              transpositionSession.currentTargetKeyPitchClass,
            )
          : rebuilt;
        latestTranspositionSessionRef.current = resetSession;
        setTranspositionSession(resetSession);
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
      progressionFingerprint: progressionFingerprint(
        block,
        selected.effectiveKeySignature,
      ),
      level,
      mode,
      leniency,
      bpm,
      targetTempo: targetTempoFor(block),
      eventCount: practiceEvents.length,
    });
    persistedRoundRef.current = 0;
    const runningSession = reducePracticeSession(
      next,
      { type: "START_SESSION" },
      sessionContext,
    );
    latestSessionRef.current = runningSession;
    setSession(runningSession);
    if (mode === "flow") {
      await startFlowClock(practiceEvents, sessionContext, "running");
    }
  }

  function pauseSession() {
    const current = latestSessionRef.current;
    const normalFlowPause = current?.status === "running"
      && current.mode === "flow"
      && flowClockReadyRef.current;
    if (normalFlowPause) {
      flowClockPausedGenerationRef.current = flowClockGenerationRef.current;
      setFlowClockReadyStatus(false);
    } else if (!cancelPendingFlowClock()) {
      setFlowClockReadyStatus(false);
    }
    clockRef.current.pause();
    setSession((current) => {
      if (!current) return current;
      const pausedSession = reducePracticeSession(
        current,
        { type: "PAUSE" },
        sessionContext,
      );
      latestSessionRef.current = pausedSession;
      return pausedSession;
    });
  }

  async function resumeSession() {
    if (flowRestartPending || flowClockStarting) return;
    const current = latestSessionRef.current;
    if (!current || current.status !== "paused") return;
    if (current.mode !== "flow") {
      resumePausedSession(sessionContext, true);
      return;
    }
    if (
      flowClockPausedGenerationRef.current === flowClockGenerationRef.current
    ) {
      if (!resumePausedSession(sessionContext, true)) return;
      flowClockPausedGenerationRef.current = undefined;
      setFlowClockReadyStatus(true);
      clockRef.current.resume();
      return;
    }
    if (!resetPausedFlowForNewStart(sessionContext)) return;
    const started = await startFlowClock(
      practiceEvents,
      sessionContext,
      "paused",
    );
    if (!started) return;
    resumePausedSession(sessionContext, true);
  }

  function endSession(save = true) {
    if (!cancelPendingFlowClock()) invalidateFlowClock();
    clockRef.current.stop();
    setPendingFlowRestartKey(undefined);
    if (save && block && session) persistProgress(block, session);
    setSession((current) => {
      if (!current) return current;
      const completed = reducePracticeSession(
        current,
        { type: "END_SESSION" },
        sessionContext,
      );
      latestSessionRef.current = completed;
      return completed;
    });
  }

  function persistProgress(targetBlock: SavedProgressionBlock, current: PracticeSessionState) {
    if (
      !selected
      || styleModeRef.current
      || !isDojoPracticeLevel(current.level)
    ) {
      return;
    }
    const practice = recordPracticeRound(targetBlock, {
      level: current.level,
      bpm: current.bpm,
      targetTempo: current.targetTempo,
      consecutiveCleanFlowRounds: current.consecutiveCleanFlowRounds,
      nowIso: new Date().toISOString(),
      localDate: localDateString(new Date()),
    }, selected.effectiveKeySignature);
    if (updateProgressionBlock(selected.ideaId, targetBlock.id, { practice })) {
      setToast(text.saved);
    } else {
      setToast(text.saveFailed);
    }
  }

  function persistTranspositionRound(
    currentTransposition: TranspositionSessionState,
    nextTransposition: TranspositionSessionState,
    completed: PracticeSessionState,
  ): void {
    const currentBlock = latestBlockRef.current;
    const currentSelected = latestSelectedRef.current;
    if (!currentBlock || !currentSelected || !isTranspositionLevel(completed.level)) {
      return;
    }
    const confirmationCompleted = currentTransposition.inConfirmationChallenge
      && !nextTransposition.inConfirmationChallenge;
    const storedProgress = latestPracticeProgressRef.current
      ?? currentBlock.practice;
    const currentProgress = practiceProgressForCurrentFingerprint(
      currentBlock,
      currentSelected.effectiveKeySignature,
      storedProgress,
    );
    const result = recordTranspositionPracticeRound(
      currentProgress,
      {
        progressionFingerprint: progressionFingerprint(
          currentBlock,
          currentSelected.effectiveKeySignature,
        ),
        level: completed.level,
        sourceKeyPitchClass: currentTransposition.sourceKeyPitchClass,
        targetKeyPitchClass: currentTransposition.currentTargetKeyPitchClass,
        mode: completed.mode,
        clean: Boolean(completed.lastRoundWasClean),
        bpm: completed.bpm,
        targetTempo: completed.targetTempo,
        targetSource,
        confirmedLevel: currentProgress?.confirmedLevel,
        stale: Boolean(storedProgress) && !currentProgress,
        nowIso: new Date().toISOString(),
        localDate: localDateString(new Date()),
        seed: currentTransposition.sessionSeed,
        inConfirmationChallenge: currentTransposition.inConfirmationChallenge,
        confirmationCompleted,
      },
    );
    if (!result.changed) return;
    if (updateProgressionBlock(currentSelected.ideaId, currentBlock.id, {
      practice: result.progress,
    })) {
      latestPracticeProgressRef.current = result.progress;
      setToast(text.saved);
      return;
    }
    setToast(text.saveFailed);
  }

  function prepareVoicingChange(): boolean {
    if (running && !globalThis.confirm(text.styleChangeConfirm)) return false;
    invalidateFlowClock();
    clockRef.current.stop();
    playbackController.stop();
    persistedRoundRef.current = 0;
    setPendingFlowRestartKey(undefined);
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
    const timeline = practiceEvents.map((event, index) => ({
      ...event,
      eventId: event.eventId ?? practiceEventId(event, index),
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
    const event = practiceEvents[index];
    const eventGuide = activeGuides[index];
    if (!event || !eventGuide) return;
    setAuditionEventIndex(index);
    try {
      await playbackController.toggle(
        {
          kind: "practice",
          id: `${previewSourceId}:event:${
            event.eventId ?? practiceEventId(event, index)
          }`,
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

  function beginMixSelection(): void {
    if (transpositionMode || mixActive) return;
    endSession(false);
    playbackController.stop();
    mixModeRef.current = true;
    setMixSelecting(true);
    setMixReferences([]);
    setMixErrors([]);
    setMixInitialState(undefined);
    if (!isDojoPracticeLevel(level)) setLevel(2);
  }

  function toggleMixReference(item: PracticeRecommendation): void {
    const reference = { ideaId: item.ideaId, blockId: item.block.id };
    const key = progressionReferenceKey(reference);
    setMixReferences((current) => {
      if (current.some((candidate) => progressionReferenceKey(candidate) === key)) {
        return current.filter((candidate) => progressionReferenceKey(candidate) !== key);
      }
      if (current.length >= 5) {
        setToast(text.mixMaximum);
        return current;
      }
      return [...current, reference];
    });
    setMixErrors([]);
  }

  function cancelMixSelection(): void {
    clockRef.current.stop();
    mixModeRef.current = false;
    setMixSelecting(false);
    setMixReferences([]);
    setMixErrors([]);
    setMixInitialState(undefined);
  }

  function startMixSession(): void {
    if (mixReferences.length < 2 || mixReferences.length > 5) {
      setMixErrors([{ code: "selection-count" }]);
      return;
    }
    const mixLevel: DojoPracticeLevel = isDojoPracticeLevel(level) ? level : 2;
    const config: MixSessionConfig = {
      references: mixReferences,
      level: mixLevel,
      mode,
      leniency,
      targetSource,
      styleMatchMode,
      allowUnsupportedFallback,
      cycles: mixCycles,
      bpm,
    };
    const result = preflightMixSession({
      config,
      candidates: mixCandidates,
      styleOptions: {
        maxLeftHandSpanSemitones: voicingPreferences.maxLeftHandSpanSemitones,
        maxRightHandSpanSemitones: voicingPreferences.maxRightHandSpanSemitones,
        allowUnsupportedFallback,
      },
    });
    if (!result.ok) {
      setMixErrors(result.errors);
      return;
    }
    const next = createMixSessionState(config, result.snapshots, createSessionSeed());
    mixModeRef.current = true;
    latestSessionRef.current = undefined;
    setSession(undefined);
    setMixSelecting(false);
    setMixErrors([]);
    setMixInitialState(next);
  }

  function reloadMixSession(config: MixSessionConfig): MixSessionState | undefined {
    const result = preflightMixSession({
      config,
      candidates: mixCandidates,
      styleOptions: {
        ...mixStyleOptions,
        allowUnsupportedFallback: config.allowUnsupportedFallback,
      },
    });
    if (!result.ok) {
      setMixErrors(result.errors);
      return undefined;
    }
    setMixErrors([]);
    return createMixSessionState(config, result.snapshots, createSessionSeed(), {
      allowSingle: config.references.length === 1,
    });
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
              {!mixSelecting && !mixActive ? (
                <button
                  type="button"
                  className="lv-button-ghost ml-auto px-2.5 py-1.5 text-xs"
                  disabled={transpositionMode}
                  title={transpositionMode ? text.mixUnavailable : undefined}
                  onClick={beginMixSelection}
                >
                  {text.mixSelect}
                </button>
              ) : null}
            </div>
            {mixSelecting ? (
              <div className="mt-3 border-y border-[var(--lv-border)] py-2">
                <p className="text-sm font-semibold" aria-live="polite">
                  {text.mixSelected(mixReferences.length)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="lv-button-ghost px-2 py-1 text-xs"
                    onClick={() => {
                      setMixReferences([]);
                      setMixErrors([]);
                    }}
                  >
                    {text.mixClear}
                  </button>
                  <button
                    type="button"
                    className="lv-button-ghost px-2 py-1 text-xs"
                    onClick={cancelMixSelection}
                  >
                    {text.mixCancel}
                  </button>
                </div>
              </div>
            ) : null}
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
              <option value="l4">L4</option>
              <option value="l5">L5</option>
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
                concealProgression={transpositionMode}
                disabled={mixActive}
                selectionMode={mixSelecting}
                selectedForMix={mixSelectionKeys.has(progressionReferenceKey({
                  ideaId: item.ideaId,
                  blockId: item.block.id,
                }))}
                selectionDisabled={
                  mixSelecting
                  && mixReferences.length >= 5
                  && !mixSelectionKeys.has(progressionReferenceKey({
                    ideaId: item.ideaId,
                    blockId: item.block.id,
                  }))
                }
                onToggleMix={() => toggleMixReference(item)}
                onClick={() => selectRecommendation(item)}
              />
            ))}
          </div>
        </aside>

        <section
          className="min-w-0 bg-[var(--lv-bg)] p-4 sm:p-6 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain"
          data-testid="practice-workspace-scroll"
        >
          {mixInitialState ? (
            <MixPracticeWorkspace
              initialState={mixInitialState}
              language={language}
              practiceClock={clockRef.current}
              candidates={mixCandidates}
              styleOptions={mixStyleOptions}
              midiStatus={midiStatus}
              midiDeviceName={selectedDevice?.name}
              midiError={midiError}
              createSeed={createSessionSeed}
              reloadSession={reloadMixSession}
              reconnectMidi={reconnectMidi}
              openSettings={openSettings}
              onError={setToast}
              onExit={cancelMixSelection}
            />
          ) : mixSelecting ? (
            <MixSetupPanel
              text={text}
              level={isDojoPracticeLevel(level) ? level : 2}
              mode={mode}
              leniency={leniency}
              bpm={bpm}
              cycles={mixCycles}
              targetSource={targetSource}
              styleMatchMode={styleMatchMode}
              allowUnsupportedFallback={allowUnsupportedFallback}
              selectedCount={mixReferences.length}
              errors={mixErrors}
              running={false}
              onLevelChange={(value) => setLevel(value)}
              onModeChange={setMode}
              onLeniencyChange={setLeniency}
              onBpmChange={setBpm}
              onCyclesChange={setMixCycles}
              onTargetSourceChange={(source) => {
                setTargetSource(source);
                setMixErrors([]);
              }}
              onStyleMatchModeChange={setStyleMatchMode}
              onAllowUnsupportedFallbackChange={setAllowUnsupportedFallback}
              onStart={startMixSession}
            />
          ) : !selected || !block ? (
            <div className="grid min-h-80 place-items-center text-sm text-[var(--lv-text-muted)]">
              {text.selectPrompt}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--lv-border)] pb-4">
                <div className="min-w-0">
                  <p className="text-xs text-[var(--lv-text-muted)]">{selected.ideaTitle}</p>
                  <h3 className="mt-1 truncate text-lg font-semibold">
                    {transpositionMode ? text.transpositionPractice : block.summaryText}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <PracticeBadge
                      block={block}
                      localDate={localDate}
                      language={language}
                      effectiveKeySignature={selected.effectiveKeySignature}
                    />
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
                  <div
                    className="flex flex-wrap gap-1"
                    role="radiogroup"
                    aria-label={text.level}
                  >
                    {([1, 2, 3, 4, 5] as const).map((value) => {
                      const unavailable = value >= 4 && !transpositionAvailable;
                      return (
                      <button
                        key={value}
                        className={segmentClass(level === value)}
                        role="radio"
                        aria-checked={level === value}
                        disabled={
                          running
                          || (value === 3 && !l3Available)
                          || unavailable
                        }
                        title={
                          value === 3 && !l3Available
                            ? text.l3NeedsKey
                            : unavailable
                              ? text.transpositionNeedsKey
                              : undefined
                        }
                        onClick={() => changeLevel(value)}
                      >
                        {value === 1
                          ? text.l1
                          : value === 2
                            ? text.l2
                            : value === 3
                              ? text.l3
                              : value === 4
                                ? text.l4
                                : text.l5}
                      </button>
                      );
                    })}
                  </div>
                  {!l3Available ? <p className="mt-2 text-xs text-amber-200">{text.l3NeedsKey}</p> : null}
                  {!transpositionAvailable ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-200">
                      <span>{text.transpositionNeedsKey}</span>
                      <button
                        type="button"
                        className="underline underline-offset-2"
                        onClick={() => openProgression(selected.ideaId, block.id)}
                      >
                        {text.transpositionOpenDetail}
                      </button>
                    </div>
                  ) : null}
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
                  <p className="mb-2 text-xs font-semibold text-[var(--lv-text-muted)]">
                    {text.modeLabel}
                  </p>
                  <div
                    className="flex gap-1"
                    role="radiogroup"
                    aria-label={text.modeLabel}
                  >
                    <button
                      className={segmentClass(mode === "step")}
                      role="radio"
                      aria-checked={mode === "step"}
                      disabled={running}
                      onClick={() => setMode("step")}
                    >
                      {text.step}
                    </button>
                    <button
                      className={segmentClass(mode === "flow")}
                      role="radio"
                      aria-checked={mode === "flow"}
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

              {transpositionMode && transpositionSession ? (
                <TranspositionPracticeControls
                  state={transpositionSession}
                  language={language}
                  manualSelectionDisabled={Boolean(
                    running
                    || flowRestartPending
                    || flowClockStarting
                    || transpositionSession.inConfirmationChallenge,
                  )}
                  targetTempo={targetTempoFor(block)}
                  onSelectKey={selectTargetKey}
                />
              ) : null}

              {transpositionMode && transpositionTargetResult && !transpositionTargetResult.ok ? (
                <p
                  className="border-b border-[var(--lv-border)] py-3 text-sm text-amber-200"
                  data-testid="transposition-target-plan-error"
                >
                  {text.targetPlanRangeUnavailable}
                </p>
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
                concealChordLabels={transpositionMode}
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
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-[var(--lv-accent)]">{text.current}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p
                        className="min-w-0 break-words text-3xl font-semibold"
                        data-testid="practice-current-chord"
                        aria-live="polite"
                      >
                        {practiceChordLabel(
                          currentTarget,
                          level,
                          displayedKeySignature,
                        )}
                      </p>
                      {displayedKeySignature ? (
                        <span
                          className="border border-[var(--lv-border-strong)] px-2 py-1 text-xs font-semibold text-[var(--lv-text-muted)]"
                          data-testid="practice-current-key"
                        >
                          {text.currentKey(displayedKeySignature)}
                        </span>
                      ) : null}
                      <VoicingSourceChip
                        status={currentVoicingSource.status}
                        reason={currentVoicingSource.reason}
                        language={language}
                        testId="dojo-voicing-source-chip"
                      />
                    </div>
                    {styleMode && guide && !transpositionMode ? (
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
                    <div className="mt-3 flex min-w-0 items-baseline gap-2 text-sm text-[var(--lv-text-muted)]">
                      <span className="text-xs font-semibold uppercase">{text.next}</span>
                      <span
                        className="min-w-0 break-words"
                        data-testid="practice-next-chord"
                      >
                        {practiceChordLabel(
                          nextTarget,
                          level,
                          displayedKeySignature,
                        )}
                      </span>
                    </div>
                  </div>
                  <ProgressionOverview
                    events={practiceEvents}
                    eventResults={session?.eventResults ?? []}
                    currentIndex={activeEventIndex}
                    level={level}
                    keySignature={displayedKeySignature}
                    text={text}
                    previewDisabled={Boolean(running)}
                    previewableEvents={activeGuides.map(Boolean)}
                    onPreviewChord={(index) => void previewChordAt(index)}
                  />
                  <div className="flex h-fit flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:border-l lg:border-[var(--lv-border)] lg:pl-4">
                    <span className="font-semibold">{text.round(session?.roundNumber ?? 1)}</span>
                    {mode === "flow" ? <span>{text.bpm} {bpm} · Beat {beat}</span> : null}
                    {!transpositionMode ? (
                      <span className="text-[var(--lv-text-muted)]">
                        {text.clean} {session?.consecutiveCleanFlowRounds ?? 0}/2
                      </span>
                    ) : null}
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
                ) : styleMode && guide && !transpositionMode ? (
                  <p className="mt-4 text-sm text-[var(--lv-text-muted)]">
                    {text.shape(guide.midiNotes.length)}
                  </p>
                ) : null}

                <div className="mt-4">
                  <PracticeKeyboard
                    range={keyboardRange}
                    guideNotes={transpositionMode ? [] : guide?.midiNotes ?? []}
                    leftHandGuideNotes={
                      !transpositionMode && styleMode
                        ? guide?.leftHandNotes ?? []
                        : []
                    }
                    rightHandGuideNotes={
                      !transpositionMode && styleMode
                        ? guide?.rightHandNotes ?? []
                        : []
                    }
                    allowedPitchClasses={currentRequirement?.allowedPitchClasses ?? []}
                    requiredPitchClasses={currentRequirement?.requiredPitchClasses ?? []}
                    level={level}
                    language={language}
                    matchState={session?.lastMatch?.state}
                    concealNoteNames={transpositionMode}
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
                        disabled={Boolean(running || paused)}
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
                          || practiceEvents.length === 0
                          || stylePlanBlocked
                          || (transpositionMode && !transpositionTargetPlan)
                          || flowClockStarting
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
                      <button
                        className="lv-button-primary inline-flex h-10 items-center gap-2 px-4 text-sm"
                        disabled={
                          flowRestartPending
                          || flowClockStarting
                          || !active
                          || midiStatus !== "connected"
                        }
                        onClick={() => void resumeSession()}
                      >
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
                  transpositionMode ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-teal-200">
                      <span>{text.stepToFlow}</span>
                      <button
                        type="button"
                        className="lv-button-ghost px-3 py-2 text-sm"
                        data-testid="transposition-step-to-flow"
                        onClick={switchStepToFlow}
                      >
                        {text.startFlow}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-teal-200">{text.flowSuggestion}</p>
                  )
                ) : null}
                {transpositionMode
                  && mode === "flow"
                  && session?.lastRoundWasClean === false
                  && !transpositionSession?.inConfirmationChallenge ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-amber-200">
                      <span>{text.dirtyRetry}</span>
                      <button
                        type="button"
                        className="lv-button-ghost px-3 py-2 text-sm"
                        data-testid="transposition-skip-key"
                        onClick={skipCurrentTranspositionKey}
                      >
                        {text.skipKey}
                      </button>
                    </div>
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
  concealProgression,
  disabled = false,
  selectionMode = false,
  selectedForMix = false,
  selectionDisabled = false,
  onToggleMix,
  onClick,
}: {
  item: PracticeRecommendation;
  active: boolean;
  localDate: string;
  language: AppLanguage;
  concealProgression: boolean;
  disabled?: boolean;
  selectionMode?: boolean;
  selectedForMix?: boolean;
  selectionDisabled?: boolean;
  onToggleMix?: () => void;
  onClick: () => void;
}) {
  const state = practiceProgressState(
    item.block,
    localDate,
    item.effectiveKeySignature,
  );
  if (selectionMode) {
    return (
      <label
        className={`flex w-full cursor-pointer items-start gap-3 border-b border-[var(--lv-border)] p-3 text-left ${
          selectedForMix ? "bg-[var(--lv-surface-raised)]" : "hover:bg-[var(--lv-surface-raised)]"
        } ${selectionDisabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-teal-300"
          checked={selectedForMix}
          disabled={selectionDisabled}
          aria-label={mixProgressionTitle(item)}
          onChange={onToggleMix}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{item.ideaTitle}</span>
          <span className="mt-1 block truncate text-xs text-[var(--lv-text-muted)]">
            {item.block.chords.slice(0, 4).map((event) => event.chord.label).join(" · ")
              || copy[language].miniSummaryEmpty}
          </span>
        </span>
      </label>
    );
  }
  return (
    <button
      className={`w-full border-b border-[var(--lv-border)] p-3 text-left ${
        active ? "bg-[var(--lv-surface-raised)]" : "hover:bg-[var(--lv-surface-raised)]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{item.ideaTitle}</span>
        {item.favorite ? <Heart aria-hidden="true" size={16} className="shrink-0 text-amber-200" /> : null}
      </span>
      <span className="mt-1 block truncate text-xs text-[var(--lv-text-muted)]">
        {concealProgression
          ? copy[language].transpositionPractice
          : item.block.chords.slice(0, 4).map((event) => event.chord.label).join(" · ")
            || copy[language].miniSummaryEmpty}
      </span>
      <span className={`mt-2 inline-flex border px-1.5 py-0.5 text-[10px] ${
        state === "confirmation-due"
          ? "border-teal-500 text-teal-200"
          : state === "stale"
            ? "border-amber-500 text-amber-200"
            : "border-[var(--lv-border)] text-[var(--lv-text-muted)]"
      }`}>
        {stateLabel(
          item.block,
          state,
          language,
        )}
      </span>
    </button>
  );
}

function PracticeBadge({
  block,
  localDate,
  language,
  effectiveKeySignature,
}: {
  block: SavedProgressionBlock;
  localDate: string;
  language: AppLanguage;
  effectiveKeySignature?: string;
}) {
  const state = practiceProgressState(block, localDate, effectiveKeySignature);
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
  level: PracticeSessionLevel;
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
  level: PracticeSessionLevel,
  keySignature?: string,
): string {
  if (!event) return "-";
  if (isTranspositionLevel(level)) {
    return "romanNumeral" in event && typeof event.romanNumeral === "string"
      ? event.romanNumeral
      : degreeOf(event.chord, keySignature)?.label ?? "-";
  }

  return level === 3
    ? degreeOf(event.chord, keySignature)?.label ?? "-"
    : event.chord.label;
}

function isTranspositionLevel(
  level: PracticeSessionLevel,
): level is TranspositionPracticeLevel {
  return level === 4 || level === 5;
}

function isDojoPracticeLevel(
  level: PracticeSessionLevel,
): level is DojoPracticeLevel {
  return level === 1 || level === 2 || level === 3;
}

function createSessionSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] ?? 0;
}

function practiceEventId(event: ChordTimelineItem, index: number): string {
  return event.eventId ?? `style-event-${index}`;
}

function practiceTargetSourceKey(source: PracticeTargetSource): string {
  return source.type === "style" ? source.styleId : source.type;
}

function mixProgressionTitle(item: PracticeRecommendation): string {
  const summary = item.block.summaryText.trim();
  return summary ? `${item.ideaTitle} · ${summary}` : item.ideaTitle;
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

function MixSetupPanel({
  text,
  level,
  mode,
  leniency,
  bpm,
  cycles,
  targetSource,
  styleMatchMode,
  allowUnsupportedFallback,
  selectedCount,
  errors,
  running,
  onLevelChange,
  onModeChange,
  onLeniencyChange,
  onBpmChange,
  onCyclesChange,
  onTargetSourceChange,
  onStyleMatchModeChange,
  onAllowUnsupportedFallbackChange,
  onStart,
}: {
  text: typeof copy.ja | typeof copy.en;
  level: DojoPracticeLevel;
  mode: PracticeMode;
  leniency: PracticeLeniency;
  bpm: number;
  cycles: 1 | 2 | 3;
  targetSource: PracticeTargetSource;
  styleMatchMode: StyleVoicingMatchMode;
  allowUnsupportedFallback: boolean;
  selectedCount: number;
  errors: readonly MixPreflightError[];
  running: boolean;
  onLevelChange(value: DojoPracticeLevel): void;
  onModeChange(value: PracticeMode): void;
  onLeniencyChange(value: PracticeLeniency): void;
  onBpmChange(value: number): void;
  onCyclesChange(value: 1 | 2 | 3): void;
  onTargetSourceChange(value: PracticeTargetSource): void;
  onStyleMatchModeChange(value: StyleVoicingMatchMode): void;
  onAllowUnsupportedFallbackChange(value: boolean): void;
  onStart(): void;
}) {
  const targetValue = practiceTargetSourceKey(targetSource);
  return (
    <section data-testid="mix-setup" aria-labelledby="mix-setup-title">
      <div className="border-b border-[var(--lv-border)] pb-4">
        <p className="text-xs font-semibold uppercase text-[var(--lv-accent)]">MIX SESSION</p>
        <h3 id="mix-setup-title" className="mt-1 text-xl font-semibold">{text.mixSetup}</h3>
        <p className="mt-2 text-sm text-[var(--lv-text-muted)]" aria-live="polite">
          {text.mixSelected(selectedCount)}
        </p>
      </div>

      <div className="grid gap-5 border-b border-[var(--lv-border)] py-5 md:grid-cols-2 xl:grid-cols-3">
        <fieldset>
          <legend className="text-xs font-semibold text-[var(--lv-text-muted)]">{text.level}</legend>
          <div className="mt-2 flex flex-wrap gap-1">
            {([1, 2, 3] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={segmentClass(level === value)}
                aria-pressed={level === value}
                disabled={running}
                onClick={() => onLevelChange(value)}
              >
                {value === 1 ? text.l1 : value === 2 ? text.l2 : text.l3}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-xs font-semibold text-[var(--lv-text-muted)]">{text.modeLabel}</legend>
          <div className="mt-2 flex gap-1">
            {(["step", "flow"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={segmentClass(mode === value)}
                aria-pressed={mode === value}
                disabled={running}
                onClick={() => onModeChange(value)}
              >
                {value === "step" ? text.step : text.flow}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="text-xs font-semibold text-[var(--lv-text-muted)]">
          {text.leniency}
          <select
            className="lv-input mt-2 block w-full text-sm"
            value={leniency}
            disabled={running}
            onChange={(event) => onLeniencyChange(event.target.value as PracticeLeniency)}
          >
            <option value="easy">{text.easy}</option>
            <option value="normal">{text.normal}</option>
            <option value="strict">{text.strict}</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-[var(--lv-text-muted)]">
          {text.mixCycles}
          <select
            className="lv-input mt-2 block w-full text-sm"
            value={cycles}
            disabled={running}
            onChange={(event) => onCyclesChange(Number(event.target.value) as 1 | 2 | 3)}
          >
            {([1, 2, 3] as const).map((value) => (
              <option key={value} value={value}>{text.mixCycle(value)}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-[var(--lv-text-muted)]">
          {text.bpm}
          <input
            className="lv-input mt-2 block w-full text-sm"
            type="number"
            min={40}
            max={300}
            value={bpm}
            disabled={running}
            onChange={(event) => onBpmChange(
              Math.max(40, Math.min(300, Number(event.target.value))),
            )}
          />
        </label>
        <label className="text-xs font-semibold text-[var(--lv-text-muted)]">
          {text.mixTargetSource}
          <select
            className="lv-input mt-2 block w-full text-sm"
            value={targetValue}
            disabled={running}
            onChange={(event) => onTargetSourceChange(
              mixTargetSourceFromValue(event.target.value),
            )}
          >
            <option value="resolved-voicing">{text.mixResolved}</option>
            <option value="generated-close">{text.mixClose}</option>
            <option value="shell-17">{text.mixShell}</option>
            <option value="open-17">{text.mixOpen}</option>
            <option value="rootless-ab">{text.mixRootless}</option>
          </select>
        </label>
      </div>

      {targetSource.type !== "resolved-voicing" ? (
        <div className="grid gap-4 border-b border-[var(--lv-border)] py-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[var(--lv-text-muted)]">
            {text.leniency}
            <select
              className="lv-input mt-2 block w-full text-sm"
              value={styleMatchMode}
              onChange={(event) => onStyleMatchModeChange(
                event.target.value as StyleVoicingMatchMode,
              )}
            >
              <option value="exact-pitch">{text.mixExact}</option>
              <option value="pitch-class">{text.mixPitchClass}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={allowUnsupportedFallback}
              onChange={(event) => onAllowUnsupportedFallbackChange(event.target.checked)}
            />
            {text.mixFallback}
          </label>
        </div>
      ) : null}

      {errors.length > 0 ? (
        <section
          className="mt-5 border border-amber-700 bg-amber-950/20 p-4"
          role="alert"
          data-testid="mix-preflight-errors"
        >
          <h4 className="font-semibold text-amber-100">{text.mixPreflightTitle}</h4>
          <ul className="mt-2 space-y-2 text-sm text-amber-100">
            {errors.map((error, index) => (
              <li key={`${error.code}:${error.reference?.ideaId ?? index}`}>
                {error.title ? <strong>{error.title}: </strong> : null}
                {mixErrorLabel(error, text)}
              </li>
            ))}
          </ul>
        </section>
      ) : selectedCount < 2 ? (
        <p className="mt-5 text-sm text-amber-200">{text.mixNeedSelection}</p>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          className="lv-button-primary px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          disabled={running || selectedCount < 2 || selectedCount > 5}
          onClick={onStart}
        >
          {text.mixStart}
        </button>
      </div>
    </section>
  );
}

function mixTargetSourceFromValue(value: string): PracticeTargetSource {
  if (value === "generated-close") return { type: "generated-close" };
  if (value === "shell-17" || value === "open-17" || value === "rootless-ab") {
    return { type: "style", styleId: value };
  }
  return { type: "resolved-voicing" };
}

function mixErrorLabel(
  error: MixPreflightError,
  text: typeof copy.ja | typeof copy.en,
): string {
  if (error.code === "selection-count") return text.mixNeedSelection;
  if (error.code === "missing-block") return text.mixMissingBlock;
  if (error.code === "missing-key") return text.mixMissingKey;
  if (error.code === "unsupported-key" || error.code === "roman-numeral-unavailable") {
    return text.mixUnsupportedKey;
  }
  if (error.code === "flow-time-signature" || error.code === "flow-timing") {
    return text.mixFlowSignature;
  }
  if (error.code === "target-plan-unavailable" || error.code === "target-plan-unsupported") {
    return text.mixTargetUnavailable;
  }
  return text.mixInvalid;
}

function stateLabel(
  block: SavedProgressionBlock,
  state: ReturnType<typeof practiceProgressState>,
  language: AppLanguage,
): string {
  const text = copy[language];
  const base = state === "stale"
    ? text.stale
    : state === "confirmation-due"
      ? text.confirmationDue
      : state === "provisional"
        ? text.provisional
        : state === "confirmed"
          ? text.confirmed(block.practice?.confirmedLevel ?? 1)
          : text.unstarted;
  const coverage = transpositionProgressLabel(block, language);
  return coverage && state !== "stale"
    ? `${base} · ${coverage}`
    : base;
}

function matchesQueueFilter(
  item: PracticeRecommendation,
  filter: QueueFilter,
  localDate: string,
): boolean {
  const state = practiceProgressState(
    item.block,
    localDate,
    item.effectiveKeySignature,
  );
  if (filter === "recommended") return true;
  if (filter === "favorite") return item.favorite;
  if (filter === "unstarted") return state === "unstarted";
  if (filter === "confirmation") return state === "confirmation-due";
  const targetLevel = Number(filter.slice(1));
  if (targetLevel === 4 || targetLevel === 5) {
    return state !== "stale"
      && transpositionProgressLevel(item.block.practice) === targetLevel;
  }
  return item.block.practice?.confirmedLevel === targetLevel
    || item.block.practice?.provisional?.level === targetLevel;
}

function transpositionProgressLabel(
  block: SavedProgressionBlock,
  language: AppLanguage,
): string | undefined {
  const count = block.practice?.transposition?.clearedKeyPitchClasses.length;
  if (count === undefined) return undefined;
  const summary = transpositionCoverageSummary(block.practice);
  if (!summary) return undefined;
  return language === "ja"
    ? `L${summary.level} キー ${summary.cleared}/${summary.total}`
    : `L${summary.level} keys ${summary.cleared}/${summary.total}`;
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
