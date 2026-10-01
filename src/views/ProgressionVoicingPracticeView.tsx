import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useReserveBottomSpace } from "../components/notifications";
import { ChevronLeft, ChevronRight, Minus, Pause, Play, Plus, RefreshCw, Search, Settings, Square, Volume2 } from "lucide-react";
import { useStore } from "zustand";
import {
  formatMidiNoteForDisplay,
  type NoteAccidentalStyle,
} from "../components/music-keyboard";
import { Modal } from "../components/Modal";
import { BpmScrubField } from "../components/BpmScrubField";
import { PracticeKeyboard } from "../components/practice/PracticeKeyboard";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { useMetronome } from "../components/MetronomeProvider";
import { TransportButton } from "../components/TransportButton";
import { Button, EmptyState, Field, SectionHeading, StatusMessage, Surface } from "../components/ui";
import {
  createProgressionPracticeClockState,
  projectProgressionPracticeClock,
  reduceProgressionPracticeClock,
  resolveProgressionPracticeVoicings,
  progressionPracticePlaybackNotes,
  progressionPracticeDegreeLabel,
  transposeProgressionVoicingPracticeSnapshot,
  type ResolveProgressionPracticeVoicingsOptions,
  type ProgressionPracticeVoicingResolution,
  type ProgressionPracticeVoicingPlan,
  type ProgressionPracticeClockStatus,
  type ProgressionPracticeEvent,
  type ProgressionVoicingPracticeSnapshot,
  type ProgressionVoicingPracticeSnapshots,
  type ProgressionVoicingSelection,
  type ResolvedProgressionPracticeVoicing,
  filterVoicingLoopVaultCandidates,
  voicingLoopSourceId,
  type ProgressionPracticeSourceReference,
  type VoicingLoopVaultCandidate,
} from "../domain/progressionVoicingPractice";
import { cancelVoicingLoopRangePending, emptyVoicingLoopRangeSelection, rangeBeatBounds,
  rangeContainsCard, selectVoicingLoopRangeCard, type VoicingLoopRangeSelection } from "../domain/progressionVoicingPractice/rangeLoop";
import { chordIndexAtTimelineBeat } from "../domain/progressionVoicingPractice/timelineNavigation";
import { clampTimelineScale, compactTimelineCard, remainingBeatsLabel, visualTransportBeat, timelinePixelsPerBeat as pixelsPerBeatForTimeline } from "../domain/progressionVoicingPractice/timelineLayout";
import type {
  VoicingCoverage,
  VoicingBaseStudy,
  VoicingRuleExplanation,
  VoicingRuleFamily,
  VoicingTopContext,
} from "../domain/voicingRules";
import { accidentalPreferenceForKey } from "../domain/chords";
import { keyCatalogForMode, parseKeySignature } from "../domain/practiceTransposition";
import {
  rankCyclicFingerings,
  type FingerNumber,
  type FingeringHand,
  type RankedFingering,
} from "../domain/progressionFingering";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import { liveMidiActivation, type LiveMidiActivationLease } from "../liveMidi/activationLease";
import {
  ProgressionVoicingTransport,
  ProgressionVoicingTransportV2,
  type ProgressionVoicingTransportPort,
} from "../practice/ProgressionVoicingTransport";
import {
  loadRecentVoicingLoopProgressions,
  retainAvailableRecentVoicingLoopProgressions,
  saveRecentVoicingLoopProgressions,
} from "../voicingPractice/recentProgressions";
import {
  findPersonalFingering,
  isValidFingering,
  loadFingeringPreferences,
  resetPersonalFingering,
  savePersonalFingering,
  type FingeringPreferenceCollection,
} from "../voicingPractice/fingeringPreferences";
import { assignPracticeHandsAcrossProgression, isPracticeHandAssignmentPlayable, type ProgressionFingeringHandTargets } from "../voicingPractice/fingeringDisplay";
import { easeOutCubic, pageTurnTarget, playheadSafetyTarget, shouldHoldCardPageTurn, type TimelineSeekOrigin } from "../voicingPractice/timelineFollow";
import { preferenceId, rememberVoicingSource, restoreVoicingSource, sourceCoverage } from "../voicingPractice/sourcePreference";
import { cardAuditionResolution } from "../voicingPractice/cardAudition";
import { computeNextMoves, fixedFingerSlots, handMoveSummary, movementInterval, type FingerMovement } from "../voicingPractice/nextMove";
import { isBlack, nextShapeRanges, type MiniKeyboardRange } from "../voicingPractice/nextShape";

const ALL_PITCH_CLASSES = Object.freeze(Array.from({ length: 12 }, (_, index) => index));
const EMPTY_NOTES: readonly number[] = Object.freeze([]);
const EMPTY_VAULT_PROGRESSIONS: readonly VoicingLoopVaultCandidate[] = Object.freeze([]);
const VOICING_LOOP_KEYBOARD_RANGE = Object.freeze({ minMidiNote: 9, maxMidiNote: 96 });

export interface ProgressionVoicingPracticeViewProps {
  readonly snapshots?: ProgressionVoicingPracticeSnapshots;
  readonly initialSelection?: ProgressionVoicingSelection;
  readonly monitorMidi?: boolean;
  readonly vaultProgressions?: readonly VoicingLoopVaultCandidate[];
  readonly bulkSourcePreview?: {
    readonly eligible: number;
    readonly changed: number;
    readonly skippedCustom: number;
    readonly skippedMissingSource: number;
  };
  readonly onBulkSourceApply?: () => boolean;
  readonly onSelectProgression: (reference: ProgressionPracticeSourceReference) => boolean;
  readonly onEnterText: () => void;
  readonly openMidiSettings?: () => void;
  readonly transportFactory?: () => ProgressionVoicingTransportPort;
  readonly resolutionOptions?: ResolveProgressionPracticeVoicingsOptions;
}

const sourceSelections = [
  { id: "saved", ja: "保存した音" },
  { id: "source-midi", ja: "元MIDI" },
  { id: "custom", ja: "カスタム" },
  { id: "basic-full", ja: "自動生成" },
] as const;
const advancedSelections = [
  { id: "basic-full", label: "基本（旧 basic-full）" },
  { id: "basic-shell", label: "ルートありシェル（basic-shell）" },
  { id: "rootless-shell", label: "ルートレスシェル（rootless-shell）" },
  { id: "full-shell", label: "フルシェル（full-shell）" },
  { id: "left-hand", label: "左手 Rootless A/B（left-hand）" },
] as const;

const copy = {
  ja: {
    title: "Voicing Loop",
    description: "コードを見た瞬間に、左手・右手それぞれ何指か分かる。",
    source: "Voicingを選択",
    sourceHelp: "保存した音・元MIDI・カスタムは保存済みの実音を使います。一部に音がない場合だけ自動生成で補完し、カードに印を表示します。",
    studyHelp: "基本または骨組みを選択します。Color・Openやその他の既存の形は詳しい設定で選べます。固定音では変更できません。",
    teacherHelp: "先生由来の考え方を一般化した実用Voicing",
    coreHelp: "コードの骨格・特徴音を中心に練習",
    colorModifier: "Colorを加える",
    colorHelp: "9th/11th/13thなどの安全な色付けをCreative Enrichmentとして加えます。元のコード構成音は変更しません。",
    openModifier: "Open配置",
    openHelp: "同じ和音を広い音域へ配置します。スラッシュベースは固定します。",
    optimizeProgression: "進行に合わせて最適化",
    optimizeHelp: "最後から先頭まで含む進行全体で、トップノートと内声のつながりを選びます。OFFでは各コード単体の代表候補を使います。",
    candidateHelp: "同じコードで使える別のVoicing候補",
    previousCandidate: "前のVoicing候補",
    nextCandidate: "次のVoicing候補",
    rootShell: "ルートありシェル 1·3·7",
    rootShellShort: "ルートあり 1·3·7",
    rootlessShell: "ルートレスシェル 3·7",
    rootlessShellShort: "ルートレス 3·7",
    rootShellHelp: "Root・3rd・7thと、コード識別に必要な承認済み特徴音を練習します。表記は固定pitch順ではありません。",
    rootlessShellHelp: "Rootを省き、3rd・7thのvoice leadingと、コード識別に必要な承認済み特徴音を練習します。",
    leftHandHelp: "上部コードのRootless A/Bを左手で練習します。スラッシュベースは独立した参照音として鳴り、練習対象には含みません。",
    current: "現在",
    next: "次",
    beat: "拍",
    countIn: "カウントイン",
    chordProgress: "コード",
    progressionProgress: "進行",
    position: "位置",
    timeline: "進行タイムライン",
    progressionSection: "進行",
    cardAuditionOnly: "カードクリック = 試聴のみ",
    keyboardTitle: "鍵盤 — 88鍵 / A0–C8",
    loop: "ループ",
    pitches: "音名",
    chordTone: "構成音",
    suggestedFingering: "おすすめ運指",
    finger: "指",
    showFingering: "おすすめ運指を表示",
    rightHand: "右手",
    leftHand: "左手",
    rightHandDisplay: "右手",
    leftHandDisplay: "左手",
    personal: "自分の運指",
    automatic: "おすすめ",
    editFingering: "運指を編集",
    saveFingering: "保存",
    resetFingering: "おすすめに戻す",
    cancel: "キャンセル",
    fingeringUnavailable: "この手では運指を表示できません",
    fingeringUnavailableBody: "選択中のVoicingに1〜5音の練習対象がある場合に表示します。音やVoicingは変更されません。",
    fingerForNote: (note: string) => `${note}の指`,
    learn: "覚える（Voicing表示）",
    recall: "思い出す（コード名のみ）",
    displayMode: "Voicing表示モード",
    rule: "ルール",
    omit: "省略",
    top: "トップ",
    none: "なし",
    bpm: "BPM",
    key: "キー",
    octave: "オクターブ",
    octaveShift: (value: number) => value === 0 ? "元" : `${value > 0 ? "+" : ""}${value}`,
    octaveDown: "1オクターブ下げる",
    octaveUp: "1オクターブ上げる",
    originalKey: "元",
    bpmDrag: "上下にドラッグしてBPMを変更",
    metronome: "メトロノーム",
    referenceSound: "お手本音",
    countInBars: "カウントイン",
    noCountIn: "なし",
    oneBar: "1小節",
    twoBars: "2小節",
    start: "開始",
    pause: "一時停止",
    resume: "再開",
    restart: "最初から",
    stop: "停止",
    reference: "現在のコードを試聴",
    auditionCard: "このコードを試聴",
    ready: "開始できます",
    running: "自動送り中",
    paused: "一時停止中",
    stopped: "停止しました",
    chooseProgression: "練習する進行",
    chooseProgressionBody: "My Vaultの保存済み進行を選ぶと、すぐに練習を始められます。",
    search: "進行を検索",
    searchPlaceholder: "タイトル、コード、Keyで検索",
    recent: "最近使った進行",
    saved: "保存済み進行",
    all: "すべての進行",
    results: "検索結果",
    noSaved: "練習できる保存済み進行はまだありません。",
    noMatches: "検索に一致する進行はありません。",
    showAll: "すべての進行を見る",
    practice: "練習する",
    enterText: "＋ Textで新しい進行を入力",
    unavailable: "選択したVoicingを利用できません",
    unavailableBody: "このコードには選択したSource/Custom Voicingが保存されていません。別の明示的なVoicingを選んでください。",
    unsupported: "このコードにはこの生成タイプの形がありません。",
    unsupportedBody: "元MIDI、カスタム、または対応している生成タイプへ切り替えてください。",
    generationError: "Voicingを生成できませんでした",
    generationErrorBody: "選択中のLesson規則は対応していますが、安全な音域へ配置できませんでした。",
    playbackError: "再生できませんでした",
    playbackErrorBody: "音声を安全に停止しました。もう一度お試しください。",
    unavailableStatus: "利用不可",
    unsupportedStatus: "未対応の規則",
    leftHandUpperUnsupported: "上部コードに対応するLeft-hand規則がありません",
    generationErrorStatus: "生成エラー",
    unresolvedSummary: (count: number) => `${count}個のコードを再生できません`,
    midi: "MIDI入力",
    connected: "接続済み",
    connecting: "接続中",
    disconnected: "未接続",
    reconnect: "再接続",
    settings: "設定",
    midiActivationFailed: "MIDI入力を開始できませんでした。",
    positionLabel: (group: number, total: number) => `${group} / ${total} 練習グループ`,
    beatLabel: (beat: number, total: number) => `${beat} / ${total} 拍`,
    loopLabel: (count: number) => `${count} 周完了`,
  },
} as const;

export function ProgressionVoicingPracticeView({
  initialSelection = "source-midi",
  monitorMidi = true,
  onSelectProgression,
  onEnterText,
  bulkSourcePreview,
  onBulkSourceApply,
  openMidiSettings,
  resolutionOptions,
  snapshots,
  transportFactory = createDefaultTransport,
  vaultProgressions = EMPTY_VAULT_PROGRESSIONS,
}: ProgressionVoicingPracticeViewProps) {
  const text = copy.ja;
  const { sound: previewSound } = usePreviewSound();
  const { enabled: metronomeEnabled, toggle: toggleGlobalMetronome } = useMetronome();
  const [selection, setSelection] = useState<ProgressionVoicingSelection>(() => restoreVoicingSource(snapshots, initialSelection));
  const [sourceInfo, setSourceInfo] = useState<string>();
  const progressionPreferenceId = preferenceId(snapshots);
  const previousPreferenceId = useRef(progressionPreferenceId);
  const [studyCategory, setStudyCategory] = useState<VoicingBaseStudy>("teacher");
  const [colorEnabled, setColorEnabled] = useState(false);
  const [openEnabled, setOpenEnabled] = useState(false);
  const [leftHandVariant, setLeftHandVariant] = useState<"auto" | "A" | "B">(resolutionOptions?.leftHandVariant ?? "auto");
  const [progressionOptimizationEnabled, setProgressionOptimizationEnabled] = useState(true);
  const lessonRulesSelected = selection !== "saved" && selection !== "source-midi" && selection !== "custom";
  const sourceSnapshot = snapshots?.[selection];
  const sourceKey = useMemo(
    () => sourceSnapshot?.key ? parseKeySignature(sourceSnapshot.key) : undefined,
    [sourceSnapshot?.key],
  );
  const sourceIdentity = sourceSnapshot
    ? `${sourceSnapshot.source.reference.ideaId}:${sourceSnapshot.source.reference.blockId}`
    : undefined;
  const [targetKeyChoice, setTargetKeyChoice] = useState<{ sourceIdentity: string; tonicPitchClass: number }>();
  const [octaveChoice, setOctaveChoice] = useState<{ sourceIdentity: string; value: -2 | -1 | 0 | 1 | 2 }>();
  const targetTonicPitchClass = sourceKey
    ? targetKeyChoice && targetKeyChoice.sourceIdentity === sourceIdentity
      ? targetKeyChoice.tonicPitchClass
      : sourceKey.tonicPitchClass
    : undefined;
  const octaveShift = sourceIdentity && octaveChoice?.sourceIdentity === sourceIdentity
    ? octaveChoice.value
    : 0;
  const transposition = useMemo(
    () => sourceSnapshot && targetTonicPitchClass !== undefined
      ? transposeProgressionVoicingPracticeSnapshot(sourceSnapshot, targetTonicPitchClass)
      : undefined,
    [sourceSnapshot, targetTonicPitchClass],
  );
  const snapshot = transposition
    ? transposition.ok ? transposition.snapshot : undefined
    : sourceSnapshot;
  const candidateSessionKey = snapshot
    ? [snapshot.fingerprint, selection, studyCategory, colorEnabled, openEnabled, progressionOptimizationEnabled].join(":")
    : undefined;
  const [manualCandidateSelection, setManualCandidateSelection] = useState<{
    readonly key: string;
    readonly indexes: Readonly<Record<string, number>>;
  }>();
  const lessonCandidateIndexes = candidateSessionKey
    && manualCandidateSelection?.key === candidateSessionKey
    ? manualCandidateSelection.indexes
    : undefined;
  const targetKey = transposition?.ok ? transposition.targetKey : sourceKey;
  const keyOptions = sourceKey ? keyCatalogForMode(sourceKey.mode) : [];
  const progressionLoaded = Boolean(snapshots && Object.values(snapshots).some(Boolean));
  const activeTempoOrigin = sourceSnapshot && vaultProgressions.find((candidate) =>
    candidate.sourceReference.ideaId === sourceSnapshot.source.reference.ideaId
    && candidate.sourceReference.blockId === sourceSnapshot.source.reference.blockId)?.tempoOrigin;
  const [query, setQuery] = useState("");
  const [showAllProgressions, setShowAllProgressions] = useState(false);
  const [recentReferences, setRecentReferences] = useState(loadRecentVoicingLoopProgressions);
  const retainedRecentReferences = useMemo(
    () => retainAvailableRecentVoicingLoopProgressions(
      recentReferences,
      vaultProgressions.map(({ sourceReference }) => sourceReference),
    ),
    [recentReferences, vaultProgressions],
  );
  const recentProgressions = useMemo(() => {
    const candidatesById = new Map(vaultProgressions.map((candidate) => [candidate.id, candidate]));
    return retainedRecentReferences.flatMap((reference) => {
      const candidate = candidatesById.get(voicingLoopSourceId(reference));
      return candidate ? [candidate] : [];
    });
  }, [retainedRecentReferences, vaultProgressions]);
  const filteredProgressions = useMemo(
    () => filterVoicingLoopVaultCandidates(vaultProgressions, query),
    [query, vaultProgressions],
  );
  const defaultProgressions = Array.from(new Map([
    ...recentProgressions,
    ...vaultProgressions.slice(0, 5),
    ...vaultProgressions.filter((candidate) => candidate.unavailableReason),
  ].map((candidate) => [candidate.id, candidate])).values());
  const visibleProgressions = query.trim()
    ? filteredProgressions
    : showAllProgressions ? vaultProgressions : defaultProgressions;
  const progressionListTitle = query.trim()
    ? text.results
    : showAllProgressions ? text.all : recentProgressions.length ? text.recent : text.saved;
  const effectiveResolutionOptions = useMemo<ResolveProgressionPracticeVoicingsOptions>(
    () => lessonRulesSelected && selection === "basic-full" ? {
      ...resolutionOptions,
      lessonStudyCategory: studyCategory,
      lessonColorEnabled: colorEnabled,
      lessonOpenEnabled: openEnabled,
      lessonProgressionOptimization: progressionOptimizationEnabled,
      lessonCandidateIndexes,
      octaveShift,
      lessonContext: resolutionOptions?.lessonContext ?? {
        bass: "self-played",
        top: "normal-voicing-top",
      },
    } : { ...resolutionOptions, leftHandVariant, octaveShift },
    [colorEnabled, leftHandVariant, lessonCandidateIndexes, lessonRulesSelected, octaveShift, openEnabled, progressionOptimizationEnabled, resolutionOptions, selection, studyCategory],
  );
  const plan = useMemo(
    () => snapshot ? resolveProgressionPracticeVoicings(snapshot, effectiveResolutionOptions) : undefined,
    [effectiveResolutionOptions, snapshot],
  );
  const cardAuditionPlans = useMemo(() => {
    const fromSelection = (family: "saved" | "source-midi" | "custom" | "basic-full") => {
      const original = snapshots?.[family];
      if (!original) return undefined;
      const transposed = targetTonicPitchClass === undefined
        ? undefined : transposeProgressionVoicingPracticeSnapshot(original, targetTonicPitchClass);
      const prepared = transposed ? (transposed.ok ? transposed.snapshot : undefined) : original;
      return prepared ? resolveProgressionPracticeVoicings(prepared, { octaveShift }) : undefined;
    };
    return { saved: fromSelection("saved"), source: fromSelection("source-midi"),
      custom: fromSelection("custom"), generated: fromSelection("basic-full") };
  }, [snapshots, targetTonicPitchClass, octaveShift]);
  const [countInBars, setCountInBars] = useState<0 | 1 | 2>(1);
  const [seekAnchorIndex, setSeekAnchorIndex] = useState(0);
  const [rangeSelection, setRangeSelection] = useState<VoicingLoopRangeSelection>(emptyVoicingLoopRangeSelection);
  const rangeSelectionRef = useRef(rangeSelection);
  rangeSelectionRef.current = rangeSelection;
  const previousRangeSourceRef = useRef(sourceIdentity);
  const selectedRangeBounds = rangeBeatBounds(snapshot?.events ?? [], rangeSelection.active);
  const [clockState, setClockState] = useState(
    () => snapshot ? createProgressionPracticeClockState(snapshot, { countInBars }) : undefined,
  );
  const [displayMode, setDisplayMode] = useState<"learn" | "recall">("learn");
  const [timelineScale, setTimelineScale] = useState<8 | 12 | 16>(8);
  const [timelineInnerWidth, setTimelineInnerWidth] = useState(0);
  const [followEnabled, setFollowEnabled] = useState(true);
  const [followResumeRevision, setFollowResumeRevision] = useState(0);
  const [showFingering, setShowFingering] = useState(true);
  const [fingeringPreferences, setFingeringPreferences] = useState(loadFingeringPreferences);
  const [draftFingers, setDraftFingers] = useState<Readonly<Record<FingeringHand, readonly FingerNumber[]>>>({
    left: [],
    right: [],
  });
  const [fingeringEditorOpen, setFingeringEditorOpen] = useState(false);
  const [bulkSourceOpen, setBulkSourceOpen] = useState(false);
  const [referenceSoundEnabled, setReferenceSoundEnabled] = useState(true);
  const [auditionedIndex, setAuditionedIndex] = useState<number>();
  const [runtimeError, setRuntimeError] = useState<string>();
  const [midiReconnectError, setMidiReconnectError] = useState<string>();
  const transportRef = useRef<ProgressionVoicingTransportPort>();
  const transportBarRef = useRef<HTMLElement>(null);
  useReserveBottomSpace(transportBarRef);
  const runtimeRequestRef = useRef(0);
  const auditionRequestRef = useRef(0);
  const boundarySessionUpdateRef = useRef(false);
  const clockStateRef = useRef(clockState);
  clockStateRef.current = clockState;
  const midiLeaseRef = useRef<LiveMidiActivationLease>();
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLSpanElement>(null);
  const currentProgressRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = timelineViewportRef.current;
    if (!viewport) return;
    const measure = () => setTimelineInnerWidth(viewport.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [snapshot]);
  const timelineEventRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const keyboardRangeMenuRef = useRef<{ cardIndex: number; at: number }>();
  const pageTurnFrameRef = useRef<number>();
  const pageTurnHighlightTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [pageTurnHighlightIndex, setPageTurnHighlightIndex] = useState<number>();
  const forceFollowRef = useRef(false);
  const cardHeldSpanRef = useRef<number>();
  const followEnabledRef = useRef(followEnabled);
  followEnabledRef.current = followEnabled;
  useEffect(() => () => {
    if (pageTurnFrameRef.current !== undefined) cancelAnimationFrame(pageTurnFrameRef.current);
    if (pageTurnHighlightTimerRef.current !== undefined) clearTimeout(pageTurnHighlightTimerRef.current);
  }, []);
  if (!transportRef.current) transportRef.current = transportFactory();
  const midiStatus = useStore(defaultLiveMidiStore, (state) => state.status);
  const selectedMidiDevice = useStore(defaultLiveMidiStore, (state) => state.selected);
  const midiStoreError = useStore(defaultLiveMidiStore, (state) => state.error);

  useEffect(() => {
    if (previousPreferenceId.current === progressionPreferenceId) return;
    previousPreferenceId.current = progressionPreferenceId;
    setSelection(restoreVoicingSource(snapshots, initialSelection));
    setSourceInfo(undefined);
  }, [initialSelection, progressionPreferenceId, snapshots]);

  useEffect(() => {
    const transport = transportRef.current;
    runtimeRequestRef.current += 1;
    auditionRequestRef.current += 1;
    transport?.stop();
    setRuntimeError(undefined);
    setAuditionedIndex(undefined);
    cardHeldSpanRef.current = undefined;
    setSeekAnchorIndex(0);
    setClockState(sourceSnapshot
      ? { ...createProgressionPracticeClockState(sourceSnapshot, { countInBars }),
          loopBounds: rangeBeatBounds(sourceSnapshot.events, rangeSelectionRef.current.active),
          anchorBeat: rangeBeatBounds(sourceSnapshot.events, rangeSelectionRef.current.active)?.startBeat ?? 0 }
      : undefined);
    return () => {
      runtimeRequestRef.current += 1;
      auditionRequestRef.current += 1;
      transport?.stop();
    };
  }, [countInBars, previewSound, sourceSnapshot]);

  useEffect(() => {
    if (previousRangeSourceRef.current === sourceIdentity) return;
    previousRangeSourceRef.current = sourceIdentity;
    setRangeSelection(emptyVoicingLoopRangeSelection);
    setClockState(state => state && sourceSnapshot
      ? reduceProgressionPracticeClock(sourceSnapshot, state, { type: "SET_LOOP_BOUNDS" })
      : state);
  }, [sourceIdentity, sourceSnapshot]);

  useEffect(() => {
    if (!plan || !snapshot) return;
    const state = clockStateRef.current;
    const applyAtBeat = boundarySessionUpdateRef.current
      && (state?.status === "running" || state?.status === "count-in")
      ? nextPracticeBarBoundary(state.transportBeat, snapshot.practiceGroupBeats ?? snapshot.meter.numerator)
      : undefined;
    boundarySessionUpdateRef.current = false;
    transportRef.current?.updatePlan(plan, { snapshot, applyAtBeat });
  }, [plan, snapshot]);

  useEffect(() => {
    if (!monitorMidi || !progressionLoaded) return undefined;
    const midiLease = liveMidiActivation.acquire();
    midiLeaseRef.current = midiLease;
    void midiLease.ready.catch(() => undefined);
    return () => {
      midiLease.release();
      if (midiLeaseRef.current === midiLease) midiLeaseRef.current = undefined;
    };
  }, [monitorMidi, progressionLoaded]);

  useEffect(() => {
    if (progressionLoaded) return;
    if (sameReferences(recentReferences, retainedRecentReferences)) return;
    saveRecentVoicingLoopProgressions(retainedRecentReferences);
    setRecentReferences(retainedRecentReferences);
  }, [progressionLoaded, recentReferences, retainedRecentReferences]);

  const projection = useMemo(
    () => snapshot && clockState ? projectProgressionPracticeClock(snapshot, clockState) : undefined,
    [clockState, snapshot],
  );
  const transportCurrentIndex = projection?.currentEventIndex ?? 0;
  const transportCurrentSpanIndex = projection?.currentSpanIndex ?? 0;
  const currentIndex = auditionedIndex ?? transportCurrentIndex;
  const restLabel = "休符";
  const nextIndex = auditionedIndex === undefined
    ? projection?.nextEventIndex ?? (snapshot && snapshot.events.length > 1 ? 1 : 0)
    : snapshot?.events.length ? (auditionedIndex + 1) % snapshot.events.length : 0;
  const currentEvent = snapshot?.events[currentIndex];
  const nextEvent = snapshot?.events[nextIndex];
  const thenNextIndex = snapshot?.events.length ? (nextIndex + 1) % snapshot.events.length : 0;
  const thenNextEvent = snapshot?.events[thenNextIndex];
  const nextWaitBeats = currentEvent
    ? Math.max(0, currentEvent.startBeat + currentEvent.durationBeats - (projection?.progressionBeat ?? currentEvent.startBeat))
    : 0;
  const thenNextDegree = progressionPracticeDegreeLabel(thenNextEvent?.chord, targetKey);
  const currentResolution = plan?.events[currentIndex];
  const nextResolution = plan?.events[nextIndex];
  const currentDegree = progressionPracticeDegreeLabel(currentEvent?.chord, targetKey);
  const nextDegree = progressionPracticeDegreeLabel(nextEvent?.chord, targetKey);
  const currentVoicing = currentResolution?.status === "SUPPORTED" ? currentResolution.voicing : undefined;
  const nextVoicing = nextResolution?.status === "SUPPORTED" ? nextResolution.voicing : undefined;
  const handAssignments = useMemo(
    () => assignPracticeHandsAcrossProgression(selection, plan?.events.map((resolution) =>
      resolution.status === "SUPPORTED" ? resolution.voicing : undefined) ?? [], fingeringPreferences),
    [fingeringPreferences, plan, selection],
  );
  const emptyHandTargets = { left: EMPTY_NOTES, right: EMPTY_NOTES };
  const currentHandTargets = handAssignments[currentIndex] ?? emptyHandTargets;
  const nextHandTargets = handAssignments[nextIndex] ?? emptyHandTargets;
  const thenNextHandTargets = handAssignments[thenNextIndex] ?? emptyHandTargets;
  const leftFingeringById = useMemo(
    () => new Map(rankFingeringsForHand(snapshot, handAssignments, selection, "left").map((entry) => [entry.id, entry])),
    [handAssignments, selection, snapshot],
  );
  const rightFingeringById = useMemo(
    () => new Map(rankFingeringsForHand(snapshot, handAssignments, selection, "right").map((entry) => [entry.id, entry])),
    [handAssignments, selection, snapshot],
  );
  const currentLeftSuggested = currentEvent ? leftFingeringById.get(currentEvent.id) : undefined;
  const currentRightSuggested = currentEvent ? rightFingeringById.get(currentEvent.id) : undefined;
  const nextLeftSuggested = nextEvent ? leftFingeringById.get(nextEvent.id) : undefined;
  const nextRightSuggested = nextEvent ? rightFingeringById.get(nextEvent.id) : undefined;
  const currentLeftFingering = useMemo(
    () => effectiveFingering(currentLeftSuggested, fingeringPreferences),
    [currentLeftSuggested, fingeringPreferences],
  );
  const currentRightFingering = useMemo(
    () => effectiveFingering(currentRightSuggested, fingeringPreferences),
    [currentRightSuggested, fingeringPreferences],
  );
  const nextLeftFingering = useMemo(
    () => effectiveFingering(nextLeftSuggested, fingeringPreferences),
    [nextLeftSuggested, fingeringPreferences],
  );
  const nextRightFingering = useMemo(
    () => effectiveFingering(nextRightSuggested, fingeringPreferences),
    [nextRightSuggested, fingeringPreferences],
  );
  const nextMoves = useMemo(() => currentVoicing && nextVoicing
    ? computeNextMoves(currentHandTargets, nextHandTargets,
      { left: currentLeftFingering, right: currentRightFingering },
      { left: nextLeftFingering, right: nextRightFingering }) : [],
    [currentVoicing, nextVoicing, currentHandTargets, nextHandTargets,
      currentLeftFingering, currentRightFingering, nextLeftFingering, nextRightFingering]);
  const keyboardEventIndex = currentIndex;
  const keyboardEvent = snapshot?.events[keyboardEventIndex];
  const keyboardResolution = plan?.events[keyboardEventIndex];
  const keyboardVoicing = keyboardResolution?.status === "SUPPORTED" ? keyboardResolution.voicing : undefined;
  const keyboardHandTargets = handAssignments[keyboardEventIndex] ?? emptyHandTargets;
  const keyboardLeftFingering = useMemo(
    () => effectiveFingering(
      keyboardEvent ? leftFingeringById.get(keyboardEvent.id) : undefined,
      fingeringPreferences,
    ),
    [fingeringPreferences, keyboardEvent, leftFingeringById],
  );
  const keyboardRightFingering = useMemo(
    () => effectiveFingering(
      keyboardEvent ? rightFingeringById.get(keyboardEvent.id) : undefined,
      fingeringPreferences,
    ),
    [fingeringPreferences, keyboardEvent, rightFingeringById],
  );
  const currentLeftPersonal = findPersonalFingering(fingeringPreferences, currentLeftFingering?.signature);
  const currentRightPersonal = findPersonalFingering(fingeringPreferences, currentRightFingering?.signature);
  const accidentalStyle: NoteAccidentalStyle = accidentalPreferenceForKey(snapshot?.key) ?? "flat";
  const keyboardFingerLabels = useMemo(() => {
    if (!showFingering || displayMode !== "learn") return undefined;
    const labels = new Map<number, string>();
    addKeyboardFingerLabels(labels, keyboardLeftFingering, "L");
    addKeyboardFingerLabels(labels, keyboardRightFingering, "R");
    return labels;
  }, [displayMode, keyboardLeftFingering, keyboardRightFingering, showFingering]);
  const active = clockState?.status === "running" || clockState?.status === "count-in";
  const paused = clockState?.status === "paused";
  const practiceGroupBeats = snapshot?.practiceGroupBeats ?? 4;
  const totalGroups = Math.max(1, Math.ceil((snapshot?.lengthBeats ?? 1) / practiceGroupBeats));
  const effectiveTimelineScale = clampTimelineScale(timelineScale, totalGroups);
  const timelinePixelsPerBeat = pixelsPerBeatForTimeline(
    timelineInnerWidth || 960, snapshot?.lengthBeats ?? 1, practiceGroupBeats, effectiveTimelineScale,
  );
  useEffect(() => {
    if (timelineScale !== effectiveTimelineScale) setTimelineScale(effectiveTimelineScale);
  }, [effectiveTimelineScale, timelineScale]);
  const playheadX = (projection?.progressionBeat ?? 0) * timelinePixelsPerBeat;
  function animateTimelinePageTurn(target: number, spanIndex: number) {
    const viewport = timelineViewportRef.current;
    if (!viewport || Math.abs(viewport.scrollLeft - target) <= 2) return;
    if (pageTurnFrameRef.current !== undefined) cancelAnimationFrame(pageTurnFrameRef.current);
    const start = viewport.scrollLeft;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reducedMotion || typeof requestAnimationFrame !== "function") {
      viewport.scrollLeft = target;
      pageTurnFrameRef.current = undefined;
    } else {
      const startedAt = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / 250);
        viewport.scrollLeft = start + (target - start) * easeOutCubic(progress);
        if (progress < 1) pageTurnFrameRef.current = requestAnimationFrame(tick);
        else pageTurnFrameRef.current = undefined;
      };
      pageTurnFrameRef.current = requestAnimationFrame(tick);
    }
    setPageTurnHighlightIndex(spanIndex);
    if (pageTurnHighlightTimerRef.current !== undefined) clearTimeout(pageTurnHighlightTimerRef.current);
    pageTurnHighlightTimerRef.current = setTimeout(() => setPageTurnHighlightIndex(undefined), 350);
  }
  useLayoutEffect(() => {
    if (!snapshot || !clockState || !playheadRef.current) return;
    const state = clockState;
    const startedAt = performance.now();
    const request = runtimeRequestRef.current;
    const paint = (absoluteBeat: number) => {
      const position = projectProgressionPracticeClock(snapshot, { ...state, transportBeat: absoluteBeat });
      const playheadPx = position.progressionBeat * timelinePixelsPerBeat;
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${playheadPx}px)`;
      if (currentProgressRef.current) currentProgressRef.current.style.width = `${position.chordProgress * 100}%`;
      const viewport = timelineViewportRef.current;
      if (followEnabledRef.current && viewport && state.status === "running" && pageTurnFrameRef.current === undefined) {
        const target = playheadSafetyTarget(playheadPx, viewport.clientWidth, viewport.scrollLeft,
          snapshot.lengthBeats * timelinePixelsPerBeat);
        if (target !== undefined) animateTimelinePageTurn(target, position.currentSpanIndex);
      }
    };
    paint(state.transportBeat);
    if (state.status !== "running" && state.status !== "count-in" || typeof requestAnimationFrame !== "function") return;
    let frame = 0;
    const tick = (now: number) => {
      if (request !== runtimeRequestRef.current) return;
      paint(visualTransportBeat(state.transportBeat, now - startedAt, state.bpm));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clockState, snapshot, timelinePixelsPerBeat]);
  const allEventsPlayable = Boolean(plan && snapshot?.spans.length)
    && plan!.events.every((resolution) => resolution.status === "SUPPORTED");
  const currentGroup = Math.floor((projection?.progressionBeat ?? 0) / practiceGroupBeats) + 1;

  useEffect(() => {
    setFingeringEditorOpen(false);
  }, [currentEvent?.id, selection]);

  useEffect(() => {
    if (active) setAuditionedIndex(undefined);
  }, [active, transportCurrentIndex]);

  useLayoutEffect(() => {
    const viewport = timelineViewportRef.current;
    const span = snapshot?.spans[transportCurrentSpanIndex];
    if (!followEnabled || !viewport || !span) return;
    if (cardHeldSpanRef.current === transportCurrentSpanIndex) {
      if (pageTurnFrameRef.current !== undefined) cancelAnimationFrame(pageTurnFrameRef.current);
      pageTurnFrameRef.current = undefined;
      forceFollowRef.current = false;
      return;
    }
    cardHeldSpanRef.current = undefined;
    const target = pageTurnTarget({
      chordStartBeat: span.startBeat,
      chordDurationBeats: span.durationBeats,
      pixelsPerBeat: timelinePixelsPerBeat,
      viewportWidth: viewport.clientWidth,
      scrollLeft: viewport.scrollLeft,
      contentWidth: snapshot.lengthBeats * timelinePixelsPerBeat,
    }, forceFollowRef.current);
    forceFollowRef.current = false;
    if (pageTurnFrameRef.current !== undefined) cancelAnimationFrame(pageTurnFrameRef.current);
    pageTurnFrameRef.current = undefined;
    if (target !== undefined) animateTimelinePageTurn(target, transportCurrentSpanIndex);
  }, [followEnabled, followResumeRevision, snapshot, timelinePixelsPerBeat, transportCurrentSpanIndex]);

  function resumeTimelineFollow(force = false) {
    forceFollowRef.current = force;
    setFollowEnabled(true);
    setFollowResumeRevision((revision) => revision + 1);
  }

  function setTimelineManual(reason: "wheel" | "pointer" | "keyboard") {
    if (import.meta.env.DEV) console.debug(`[Voicing Loop Follow] manual: ${reason}`);
    if (pageTurnFrameRef.current !== undefined) cancelAnimationFrame(pageTurnFrameRef.current);
    pageTurnFrameRef.current = undefined;
    forceFollowRef.current = false;
    cardHeldSpanRef.current = undefined;
    setFollowEnabled(false);
  }
  function changeSelection(next: ProgressionVoicingSelection) {
    runtimeRequestRef.current += 1;
    auditionRequestRef.current += 1;
    transportRef.current?.stop();
    setSelection(next);
    setSourceInfo(undefined);
    rememberVoicingSource(snapshots, next);
  }

  function changeStudyCategory(next: VoicingBaseStudy) {
    if (!lessonRulesSelected || (next === studyCategory && selection === "basic-full")) return;
    runtimeRequestRef.current += 1;
    auditionRequestRef.current += 1;
    transportRef.current?.stop();
    setAuditionedIndex(undefined);
    setRuntimeError(undefined);
    setSelection("basic-full");
    setStudyCategory(next);
    rememberVoicingSource(snapshots, "basic-full");
  }

  function changeLessonModifier(update: () => void) {
    if (!lessonRulesSelected) return;
    auditionRequestRef.current += 1;
    setRuntimeError(undefined);
    update();
  }

  function changeCurrentCandidate(offset: -1 | 1) {
    const explanation = currentVoicing?.explanation;
    const count = explanation?.candidateCount ?? 0;
    const current = explanation?.candidateIndex ?? 0;
    if (!candidateSessionKey || !currentEvent || count <= 1 || current <= 0) return;
    const nextIndex = (current - 1 + offset + count) % count;
    auditionRequestRef.current += 1;
    setRuntimeError(undefined);
    setManualCandidateSelection((previous) => ({
      key: candidateSessionKey,
      indexes: {
        ...(previous?.key === candidateSessionKey ? previous.indexes : {}),
        [currentEvent.id]: nextIndex,
      },
    }));
  }

  function changeTargetKey(tonicPitchClass: number) {
    if (!sourceKey || !sourceIdentity || tonicPitchClass === targetTonicPitchClass) return;
    auditionRequestRef.current += 1;
    boundarySessionUpdateRef.current = clockState?.status === "running" || clockState?.status === "count-in";
    setAuditionedIndex(undefined);
    setRuntimeError(undefined);
    setTargetKeyChoice({ sourceIdentity, tonicPitchClass });
  }

  function changeOctave(value: -2 | -1 | 0 | 1 | 2) {
    if (!sourceIdentity || value === octaveShift) return;
    auditionRequestRef.current += 1;
    boundarySessionUpdateRef.current = clockState?.status === "running" || clockState?.status === "count-in";
    setRuntimeError(undefined);
    setOctaveChoice({ sourceIdentity, value });
  }

  function chooseProgression(candidate: VoicingLoopVaultCandidate) {
    if (!onSelectProgression(candidate.sourceReference)) return;
    setRecentReferences(loadRecentVoicingLoopProgressions());
  }

  async function start() {
    if (!snapshot || !plan || !clockState || !allEventsPlayable) return;
    const runtimeCountInBars = metronomeEnabled ? countInBars : 0;
    const ready = { ...createProgressionPracticeClockState(snapshot, {
      bpm: clockState.bpm,
      countInBars: runtimeCountInBars,
    }), loopBounds: selectedRangeBounds, anchorBeat: selectedRangeBounds?.startBeat ?? 0 };
    setRuntimeError(undefined);
    const anchorBeat = selectedRangeBounds?.startBeat ?? snapshot.events[seekAnchorIndex]?.startBeat ?? 0;
    const started = reduceProgressionPracticeClock(snapshot, ready, { type: "START" });
    // START resets the clock to zero; apply the selected card anchor afterwards.
    setClockState(anchorBeat > 0 && !selectedRangeBounds
      ? reduceProgressionPracticeClock(snapshot, started, {
        type: "SEEK", status: runtimeCountInBars > 0 ? "count-in" : "running",
        absoluteBeat: runtimeCountInBars > 0 ? 0 : anchorBeat, anchorBeat,
      })
      : started);
    resumeTimelineFollow();
    await launchRuntime(anchorBeat, clockState.bpm, runtimeCountInBars);
  }

  async function launchRuntime(
    startBeat: number,
    bpm: number,
    runtimeCountInBars = clockStateRef.current?.countInBars ?? countInBars,
  ) {
    if (!snapshot || !plan) return;
    const request = ++runtimeRequestRef.current;
    try {
      await transportRef.current?.start({
        snapshot,
        plan,
        bpm,
        countInBars: runtimeCountInBars,
        metronomeEnabled,
        referenceSoundEnabled,
        sound: previewSound,
        startBeat,
        loopBounds: selectedRangeBounds,
        onLoopBoundsActivated(bounds, rangeStartBeat) {
          if (runtimeRequestRef.current !== request) return;
          setClockState((state) => state
            ? reduceProgressionPracticeClock(snapshot, state, { type: "SET_LOOP_BOUNDS", bounds,
              startBeat: rangeStartBeat, status: state.status === "paused" ? "paused" : state.status === "count-in" ? "count-in" : "running" })
            : state);
        },
        onTransportBeat(absoluteBeat) {
          if (runtimeRequestRef.current !== request) return;
          setClockState((state) => state
            ? reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat })
            : state);
        },
      });
    } catch {
      if (runtimeRequestRef.current !== request) return;
      transportRef.current?.stop();
      setClockState((state) => state
        ? reduceProgressionPracticeClock(snapshot, state, { type: "STOP" })
        : state);
      setRuntimeError(text.playbackErrorBody);
    }
  }

  function seekToEvent(eventIndex: number, origin: TimelineSeekOrigin = "keyboard") {
    if (!snapshot || !clockState || !snapshot.events[eventIndex]) return;
    if (!rangeContainsCard(rangeSelection.active, eventIndex)) {
      setAuditionedIndex(eventIndex);
      return;
    }
    cardHeldSpanRef.current = shouldHoldCardPageTurn(origin)
      ? snapshot.spans.findIndex((span) => span.kind === "chord" && span.eventIndex === eventIndex)
      : undefined;
    resumeTimelineFollow(origin === "ruler" || origin === "overview" || origin === "keyboard");
    const anchorBeat = snapshot.events[eventIndex]!.startBeat;
    setSeekAnchorIndex(eventIndex);
    auditionRequestRef.current += 1;
    setAuditionedIndex(undefined);
    const result = transportRef.current?.seek?.(eventIndex);
    if (result) {
      setClockState((state) => state ? reduceProgressionPracticeClock(snapshot, state, {
        type: "SEEK", status: result.status, absoluteBeat: result.absoluteBeat, anchorBeat,
      }) : state);
      return;
    }
    if (clockState.status !== "ready" && clockState.status !== "stopped") return;
    setClockState((state) => state ? reduceProgressionPracticeClock(snapshot, state, {
      type: "SEEK", status: "stopped", absoluteBeat: state.countInBars * practiceGroupBeats + anchorBeat, anchorBeat,
    }) : state);
  }

  function selectTimelineCard(eventIndex: number, origin: TimelineSeekOrigin) {
    if (!rangeContainsCard(rangeSelection.active, eventIndex)) {
      setAuditionedIndex(eventIndex);
      return;
    }
    if (!transportRef.current?.supportsSeek) { void auditionResolved(eventIndex, true); return; }
    const status = clockStateRef.current?.status;
    seekToEvent(eventIndex, origin);
    if (status === "ready" || status === "stopped" || status === "paused") {
      // The clicked event index is passed directly; never resolve from asynchronously updated Current state.
      void auditionResolved(eventIndex, true);
    }
  }

  function markRangeCard(cardIndex: number, immediate = false) {
    if (!snapshot || !transportRef.current?.supportsSeek) return;
    const next = selectVoicingLoopRangeCard(rangeSelection, cardIndex, snapshot.events.length, immediate);
    setRangeSelection(next);
    if (next.active === rangeSelection.active) return;
    const bounds = rangeBeatBounds(snapshot.events, next.active);
    const status = clockStateRef.current?.status;
    if (status === "running" || status === "count-in" || status === "paused") {
      if (transportRef.current?.setLoopBounds?.(bounds)) return;
    }
    setSeekAnchorIndex(next.active?.first ?? 0);
    setClockState(state => state ? reduceProgressionPracticeClock(snapshot, state,
      { type: "SET_LOOP_BOUNDS", bounds }) : state);
  }

  function clearRange() {
    if (!snapshot) return;
    setRangeSelection(emptyVoicingLoopRangeSelection);
    const status = clockStateRef.current?.status;
    if ((status === "running" || status === "count-in" || status === "paused")
      && transportRef.current?.setLoopBounds?.(undefined)) return;
    setSeekAnchorIndex(0);
    setClockState(state => state ? reduceProgressionPracticeClock(snapshot, state,
      { type: "SET_LOOP_BOUNDS" }) : state);
  }

  function seekToBeat(beat: number, origin: TimelineSeekOrigin) {
    if (!snapshot) return;
    const eventIndex = chordIndexAtTimelineBeat(snapshot, beat);
    if (eventIndex !== undefined) seekToEvent(eventIndex, origin);
  }

  function seekFromTimelineClick(event: MouseEvent<HTMLElement>) {
    if (!snapshot || !timelineViewportRef.current) return;
    const viewport = timelineViewportRef.current;
    const beat = (event.clientX - viewport.getBoundingClientRect().left + viewport.scrollLeft) / timelinePixelsPerBeat;
    seekToBeat(beat, "ruler");
  }

  function seekFromOverviewClick(event: MouseEvent<HTMLElement>) {
    if (!snapshot) return;
    const rect = event.currentTarget.getBoundingClientRect();
    seekToBeat(((event.clientX - rect.left) / Math.max(1, rect.width)) * snapshot.lengthBeats, "overview");
  }

  function pause() {
    if (!snapshot) return;
    const pausedRuntime = transportRef.current?.pause() ?? false;
    if (!pausedRuntime) runtimeRequestRef.current += 1;
    setClockState((state) => state
      ? reduceProgressionPracticeClock(snapshot, state, { type: "PAUSE" })
      : state);
  }

  async function resume() {
    if (!snapshot || !clockState) return;
    resumeTimelineFollow();
    const request = runtimeRequestRef.current;
    try {
      const resumed = await transportRef.current?.resume() ?? false;
      if (runtimeRequestRef.current !== request) return;
      setClockState((state) => state
        ? reduceProgressionPracticeClock(snapshot, state, { type: "RESUME" })
        : state);
      if (!resumed) await launchRuntime(clockState.transportBeat, clockState.bpm);
    } catch {
      if (runtimeRequestRef.current !== request) return;
      handleRuntimeFailure();
    }
  }

  async function restart() {
    if (!snapshot || !clockState) return;
    const request = runtimeRequestRef.current;
    try {
      const restarted = await transportRef.current?.restart() ?? false;
      if (runtimeRequestRef.current !== request) return;
      setClockState((state) => state
        ? reduceProgressionPracticeClock(snapshot, state, { type: "RESTART" })
        : state);
      if (!restarted) {
        runtimeRequestRef.current += 1;
        await launchRuntime(selectedRangeBounds?.startBeat ?? 0, clockState.bpm);
      }
    } catch {
      if (runtimeRequestRef.current !== request) return;
      handleRuntimeFailure();
    }
  }

  function handleRuntimeFailure() {
    if (!snapshot) return;
    runtimeRequestRef.current += 1;
    transportRef.current?.stop();
    setClockState((state) => state
      ? reduceProgressionPracticeClock(snapshot, state, { type: "STOP" })
      : state);
    setRuntimeError(text.playbackErrorBody);
  }

  async function reconnectMidi() {
    if (transportRef.current?.supportsSeek && snapshot) {
      runtimeRequestRef.current += 1;
      transportRef.current.stop();
      setSeekAnchorIndex(0);
      setClockState((state) => state ? reduceProgressionPracticeClock(snapshot, state, { type: "STOP_RESET" }) : state);
    }
    setMidiReconnectError(undefined);
    const store = defaultLiveMidiStore.getState();
    try {
      if (!store.active) {
        await midiLeaseRef.current?.ensureActive();
        return;
      }
      await store.refreshDevices();
      const refreshed = defaultLiveMidiStore.getState();
      const preferred = refreshed.preferences.preferredInput;
      const device = refreshed.devices.find((candidate) => (
        candidate.backendId === preferred?.backendId || candidate.name === preferred?.name
      ));
      if (device) await refreshed.selectDevice(device.backendId);
    } catch {
      setMidiReconnectError(text.midiActivationFailed);
    }
  }

  function stop() {
    if (!snapshot) return;
    const v2 = Boolean(transportRef.current?.supportsSeek);
    if (v2) setSeekAnchorIndex(rangeSelection.active?.first ?? 0);
    runtimeRequestRef.current += 1;
    auditionRequestRef.current += 1;
    transportRef.current?.stop();
    setClockState((state) => {
      if (!state) return state;
      const reset = reduceProgressionPracticeClock(snapshot, state, { type: v2 ? "STOP_RESET" : "STOP" });
      return v2 ? reduceProgressionPracticeClock(snapshot, reset,
        { type: "SET_LOOP_BOUNDS", bounds: selectedRangeBounds, status: "stopped" }) : reset;
    });
  }

  function changeBpm(value: number) {
    if (!snapshot || !clockState || !Number.isFinite(value) || value < 30 || value > 240) return;
    transportRef.current?.setBpm(value);
    setClockState((state) => state
      ? reduceProgressionPracticeClock(snapshot, state, { type: "SET_BPM", bpm: value })
      : state);
  }

  async function auditionResolved(index: number, savedCardIntent = false) {
    const resolution = savedCardIntent
      ? cardAuditionResolution(snapshot?.events[index], index, { ...cardAuditionPlans, current: plan })
      : plan?.events[index];
    if (!snapshot || resolution?.status !== "SUPPORTED") return;
    const request = ++auditionRequestRef.current;
    setRuntimeError(undefined);
    setAuditionedIndex(index);
    try {
      await transportRef.current?.audition(progressionPracticePlaybackNotes(resolution.voicing), previewSound);
    } catch {
      if (auditionRequestRef.current !== request) return;
      runtimeRequestRef.current += 1;
      transportRef.current?.stop();
      setClockState((state) => state
        ? reduceProgressionPracticeClock(snapshot, state, { type: "STOP" })
        : state);
      setRuntimeError(text.playbackErrorBody);
    }
  }

  function auditionCurrent() {
    return auditionResolved(currentIndex);
  }

  useEffect(() => {
    transportRef.current?.setMetronomeEnabled(metronomeEnabled);
  }, [metronomeEnabled]);

  function toggleMetronome() {
    toggleGlobalMetronome();
  }

  function changeReferenceSound(enabled: boolean) {
    setReferenceSoundEnabled(enabled);
    transportRef.current?.setReferenceSoundEnabled(enabled);
  }

  function changeDraftFinger(hand: FingeringHand, index: number, value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 5) return;
    setDraftFingers((fingers) => ({
      ...fingers,
      [hand]: fingers[hand].map((finger, fingerIndex) => (
        fingerIndex === index ? value as FingerNumber : finger
      )),
    }));
  }

  function openFingeringEditor() {
    setDraftFingers({
      left: currentLeftFingering?.fingers ?? [],
      right: currentRightFingering?.fingers ?? [],
    });
    setFingeringEditorOpen(true);
  }

  function saveCurrentFingering() {
    const entries = [
      { hand: "left" as const, fingering: currentLeftFingering },
      { hand: "right" as const, fingering: currentRightFingering },
    ].filter((entry): entry is { hand: FingeringHand; fingering: RankedFingering } => Boolean(entry.fingering));
    if (!entries.length || entries.some(({ hand, fingering }) => (
      !isValidFingering(hand, fingering.pitches, draftFingers[hand])
    ))) return;
    setFingeringPreferences((collection) => entries.reduce(
      (next, { hand, fingering }) => savePersonalFingering(next, {
        hand,
        pitches: fingering.pitches,
        fingers: draftFingers[hand],
      }),
      collection,
    ));
    setFingeringEditorOpen(false);
  }

  function resetCurrentFingering() {
    const signatures = [currentLeftFingering?.signature, currentRightFingering?.signature]
      .filter((signature): signature is string => Boolean(signature));
    setFingeringPreferences((collection) => signatures.reduce(
      (next, signature) => resetPersonalFingering(next, signature),
      collection,
    ));
    setDraftFingers({
      left: currentLeftSuggested?.status === "supported" ? currentLeftSuggested.fingers : [],
      right: currentRightSuggested?.status === "supported" ? currentRightSuggested.fingers : [],
    });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || !progressionLoaded || !snapshot || bulkSourceOpen || fingeringEditorOpen) return;
      const target = event.target;
      if (target === timelineViewportRef.current && ["ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].includes(event.key)) return;
      if (target instanceof Element && target.closest("input, select, textarea, [contenteditable], [role='textbox'], [role='dialog']")) return;
      const key = event.key.toLowerCase();
      if (key === " " && target instanceof Element && target.closest("button, [role='button']")) return;
      if (![" ", "arrowleft", "arrowright", "home", "end", "f", "m", "r", "escape"].includes(key)) return;
      event.preventDefault();
      if (key === " ") {
        if (active) pause();
        else if (paused) void resume();
        else void start();
      } else if (key === "escape") {
        if (rangeSelection.pendingStart !== undefined) setRangeSelection(cancelVoicingLoopRangePending(rangeSelection));
        else stop();
      }
      else if (key === "f") resumeTimelineFollow(true);
      else if (key === "m") toggleMetronome();
      else if (key === "r") changeReferenceSound(!referenceSoundEnabled);
      else if (snapshot.events.length) {
        const current = projection?.currentEventIndex ?? seekAnchorIndex;
        if (key === "home") seekToEvent(0);
        else if (key === "end") seekToEvent(snapshot.events.length - 1);
        else seekToEvent(Math.max(0, Math.min(snapshot.events.length - 1, current + (key === "arrowright" ? 1 : -1))));
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  if (!progressionLoaded) {
    return (
      <div className="min-w-0 space-y-4" data-testid="voicing-loop-workspace">
        <SectionHeading
          kicker="PRACTICE"
          title={text.title}
          description={text.description}
        />
        <Surface className="min-w-0 p-4 sm:p-5">
          <SectionHeading
            level={3}
            title={text.chooseProgression}
            description={text.chooseProgressionBody}
          />
          <Field htmlFor="voicing-loop-progression-search" label={text.search} className="mt-4">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lv-text-muted)]" size={16} />
              <input
                id="voicing-loop-progression-search"
                className="lv-input min-h-10 w-full min-w-0 pl-9 pr-3 text-sm"
                type="search"
                autoComplete="off"
                value={query}
                placeholder={text.searchPlaceholder}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </Field>

          <div className="mt-5 flex min-w-0 items-center justify-between gap-3">
            <h3 className="lv-section-title">{progressionListTitle}</h3>
            <span className="shrink-0 text-xs text-[var(--lv-text-muted)]">{visibleProgressions.length}</span>
          </div>

          {visibleProgressions.length ? (
            <div className="mt-3 grid min-w-0 gap-2" data-testid="voicing-loop-progression-list">
              {visibleProgressions.map((candidate) => (
                <ProgressionChoice
                  key={candidate.id}
                  candidate={candidate}
                  practiceLabel={text.practice}
                  onChoose={() => chooseProgression(candidate)}
                />
              ))}
            </div>
          ) : vaultProgressions.length ? (
            <p className="mt-4 text-sm text-[var(--lv-text-secondary)]" role="status">{text.noMatches}</p>
          ) : (
            <EmptyState
              className="mt-4"
              title={text.noSaved}
              description={text.chooseProgressionBody}
            />
          )}

          {!query.trim() && !showAllProgressions && visibleProgressions.length < vaultProgressions.length ? (
            <Button
              className="mt-4"
              size="sm"
              variant="secondary"
              aria-expanded="false"
              onClick={() => setShowAllProgressions(true)}
            >
              {text.showAll}
            </Button>
          ) : null}

          <div className="mt-5 border-t border-[var(--lv-border)] pt-4">
            <Button variant="ghost" onClick={onEnterText}>{text.enterText}</Button>
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-[7px] overflow-x-hidden overflow-y-auto" data-testid="voicing-loop-workspace">
      <Surface className="lv-vl-controls shrink-0 px-3 py-1" data-testid="voicing-loop-controls">
        <div className="lv-vl-controls-row flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 whitespace-nowrap" data-testid="voicing-loop-controls-row">
          <fieldset className="flex min-w-0 flex-wrap items-center gap-2" aria-describedby="voicing-loop-source-help">
            <legend className="lv-section-kicker mr-1 float-left">ソース</legend>
            <p id="voicing-loop-source-help" className="sr-only">{text.sourceHelp}</p>
            {sourceSelections.map((item) => {
              const generated = item.id === "basic-full";
              const pressed = generated ? lessonRulesSelected : selection === item.id;
              const coverage = generated ? undefined : sourceCoverage(snapshots, item.id);
              const unavailable = coverage?.available === 0;
              return (
                <Button key={item.id} size="sm" variant="secondary" className={`lv-choice ${unavailable ? "opacity-50" : ""}`}
                  aria-label={item.ja} aria-pressed={pressed} aria-disabled={unavailable || undefined}
                  aria-description={coverage ? `${coverage.available}/${coverage.total}コードで利用できます` : undefined}
                  title={unavailable ? `この進行には${item.ja}のVoicingがありません。` : undefined}
                  onClick={() => {
                    if (unavailable) {
                      setSourceInfo(`この進行には${item.ja}のVoicingがありません。自動生成または利用可能な音を選んでください。`);
                    } else changeSelection(item.id);
                  }}>
                  {item.ja}
                  {coverage && coverage.available < coverage.total ? <span className="text-[10px]" data-testid={`voicing-loop-${item.id}-availability`}>{coverage.available}/{coverage.total}</span> : null}
                </Button>
              );
            })}
          </fieldset>
          <fieldset className="flex shrink-0 items-center gap-2" aria-describedby="voicing-loop-study-help">
            <legend className="lv-section-kicker mr-1 float-left">生成タイプ</legend>
            <p id="voicing-loop-study-help" className="sr-only">{text.studyHelp}</p>
            <select aria-label="生成タイプ" className="lv-field-control min-h-9 w-20 px-2 text-xs"
              value={selection === "basic-full" || !lessonRulesSelected ? studyCategory : "advanced"}
              disabled={!lessonRulesSelected} onChange={event => changeStudyCategory(event.currentTarget.value as VoicingBaseStudy)}>
              <option value="teacher">基本</option><option value="core">骨組み</option>
              {lessonRulesSelected && selection !== "basic-full" ? <option value="advanced" disabled>詳細の形</option> : null}
            </select>
            <details className="relative" data-testid="voicing-loop-generated-details">
              <summary className="cursor-pointer rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] px-2 py-2 text-xs">詳しい設定</summary>
              <div className="absolute right-0 top-full z-50 mt-1 flex w-60 max-w-[75vw] flex-col gap-3 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] bg-[var(--lv-surface)] p-3 shadow-xl">
                <label className="flex flex-col gap-1 text-xs">既存の形
                  <select aria-label="既存の形" className="lv-field-control min-h-9 w-full px-2 text-xs" disabled={!lessonRulesSelected}
                    value={lessonRulesSelected ? selection : "basic-full"} onChange={event => changeSelection(event.currentTarget.value as ProgressionVoicingSelection)}>
                    {advancedSelections.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">左手の形
                  <select aria-label="左手の形" className="lv-field-control min-h-9 px-2 text-xs" disabled={selection !== "left-hand"}
                    value={leftHandVariant} onChange={event => setLeftHandVariant(event.currentTarget.value as "auto" | "A" | "B")}>
                    <option value="auto">自動 A/B</option><option value="A">A</option><option value="B">B</option>
                  </select>
                </label>
            <label
              className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] px-2 text-xs font-medium text-[var(--lv-text-secondary)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
              title={text.colorHelp}
            >
              <input
                type="checkbox"
                checked={colorEnabled}
                disabled={!lessonRulesSelected || selection !== "basic-full"}
                aria-describedby="voicing-loop-color-help"
                onChange={(event) => {
                  const enabled = event.currentTarget.checked;
                  changeLessonModifier(() => setColorEnabled(enabled));
                }}
              />
              <span >{text.colorModifier}</span>
            </label>
            <span id="voicing-loop-color-help" className="sr-only">{text.colorHelp}</span>
            <label
              className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] px-2 text-xs font-medium text-[var(--lv-text-secondary)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
              title={text.openHelp}
            >
              <input
                type="checkbox"
                checked={openEnabled}
                disabled={!lessonRulesSelected || selection !== "basic-full"}
                aria-describedby="voicing-loop-open-help"
                onChange={(event) => {
                  const enabled = event.currentTarget.checked;
                  changeLessonModifier(() => setOpenEnabled(enabled));
                }}
              />
              <span >{text.openModifier}</span>
            </label>
            <span id="voicing-loop-open-help" className="sr-only">{text.openHelp}</span>
              </div>
            </details>
          </fieldset>
          <fieldset className="flex shrink-0 items-center gap-2">
            <legend className="lv-section-kicker mr-1 float-left">表示</legend>
            <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label={text.displayMode}>
              <Button size="sm" variant="secondary" className="lv-choice" title={text.learn} aria-label={text.learn} aria-pressed={displayMode === "learn"} onClick={() => setDisplayMode("learn")}><CompactLabel text={text.learn} /></Button>
              <Button size="sm" variant="secondary" className="lv-choice" title={text.recall} aria-label={text.recall} aria-pressed={displayMode === "recall"} onClick={() => setDisplayMode("recall")}><CompactLabel text={text.recall} /></Button>
            </div>
            <label
              className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] px-2 text-xs font-medium text-[var(--lv-text-secondary)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
              title={text.optimizeHelp}
            >
              <input
                type="checkbox"
                checked={progressionOptimizationEnabled}
                disabled={!lessonRulesSelected || selection !== "basic-full"}
                aria-describedby="voicing-loop-optimize-help"
                onChange={(event) => {
                  const enabled = event.currentTarget.checked;
                  changeLessonModifier(() => setProgressionOptimizationEnabled(enabled));
                }}
              />
              <span className="lv-vl-control-text">{text.optimizeProgression}</span>
            </label>
            <span id="voicing-loop-optimize-help" className="sr-only">{text.optimizeHelp}</span>
            <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] px-2 text-xs font-medium text-[var(--lv-text-secondary)]" title={text.showFingering}>
              <input
                type="checkbox"
                checked={showFingering}
                onChange={(event) => setShowFingering(event.currentTarget.checked)}
              />
              <span className="lv-vl-control-text">{text.showFingering}</span>
            </label>
          </fieldset>
        </div>
      </Surface>
      {sourceInfo ? <div role="status" className="flex items-center gap-2 text-xs text-[var(--lv-text-secondary)]" data-testid="voicing-loop-source-info">
        <span>{sourceInfo}</span><Button size="sm" aria-label="説明を閉じる" onClick={() => setSourceInfo(undefined)}>×</Button>
      </div> : null}

      {!snapshot ? (
        <StatusMessage
          title={text.unavailable}
          tone="warning"
        >
          {text.unavailableBody}
        </StatusMessage>
      ) : (
        <>
          <div className="h-[clamp(560px,72dvh,760px)] min-w-0 shrink-0 lg:h-[clamp(300px,36dvh,380px)]" data-testid="voicing-loop-current-next">
            <div className="grid h-full min-h-0 min-w-0 grid-rows-2 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,440px)] lg:grid-rows-1">
              <Surface variant="primary" className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-3" data-testid="voicing-loop-current-panel" aria-label={"現在のコード詳細"}>
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" tabIndex={0}
                  aria-label={"現在のコードの詳細をスクロール"}>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="lv-section-kicker">{text.current} · {currentIndex + 1}/{snapshot.events.length}</p>
                    <span className="rounded border border-[var(--lv-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--lv-text-secondary)]" data-testid="voicing-loop-playback-choice" title={currentEvent?.playbackChoice ? undefined : ("保存時に再生方法が指定されていないカードです")}>
                      {currentEvent?.playbackChoice ? playbackChoiceLabels[currentEvent.playbackChoice] : "未設定（自動）"}
                    </span>
                    {currentEvent?.sourceNeedsReview
                      ? <span className="rounded border border-amber-400/40 px-2 py-0.5 text-[11px] text-amber-200" data-testid="voicing-loop-review-badge">{"要確認"}</span>
                      : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {bulkSourcePreview && onBulkSourceApply ? (
                      <Button size="sm" variant="ghost" onClick={() => setBulkSourceOpen(true)}>
                        {"この進行をSOURCEに"}
                      </Button>
                    ) : null}
                    {displayMode === "learn" && showFingering && (currentLeftFingering || currentRightFingering) ? (
                      <Button size="sm" variant="secondary" onClick={openFingeringEditor}>{text.editFingering}</Button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-1 flex min-w-0 items-baseline gap-3">
                  <h2 className="min-w-0 truncate whitespace-nowrap text-4xl font-bold tracking-tight text-[var(--lv-text)] sm:text-[56px] sm:leading-[1.08]" title={currentEvent?.chord.label ?? restLabel}>
                    {currentEvent?.chord.label ?? restLabel}
                  </h2>
                  {currentDegree ? <span className="shrink-0 text-lg font-bold text-[var(--lv-accent)]" data-testid="voicing-loop-current-degree">{currentDegree}</span> : null}
                </div>
                <p className="sr-only" aria-live="polite" aria-atomic="true">{currentEvent?.chord.label ?? restLabel}</p>
                <div className="mt-2 h-1 overflow-hidden rounded bg-[var(--lv-border)]" aria-hidden="true">
                  <div ref={currentProgressRef} data-testid="voicing-loop-current-progress" className="h-full bg-[var(--lv-accent)]" style={{ width: `${Math.round((projection?.chordProgress ?? 0) * 100)}%` }} />
                </div>
                {displayMode === "learn" && currentVoicing ? (
                  <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] gap-2" data-testid="voicing-loop-current-voicing">
                    <HandVoicingSummary accidentalStyle={accidentalStyle} fingering={currentLeftFingering}
                      hand="left" isPersonal={Boolean(currentLeftPersonal)} pitches={currentHandTargets.left}
                      text={text} voicing={currentVoicing} showFingering={showFingering} />
                    <HandVoicingSummary accidentalStyle={accidentalStyle} fingering={currentRightFingering}
                      hand="right" isPersonal={Boolean(currentRightPersonal)} pitches={currentHandTargets.right}
                      text={text} voicing={currentVoicing} showFingering={showFingering} />
                  </div>
                ) : null}
                {currentVoicing && !isPracticeHandAssignmentPlayable(currentVoicing.midiNotes, currentHandTargets) ? (
                  <p role="status" className="mt-2 text-xs text-amber-200" data-testid="voicing-loop-hand-assignment-unavailable">
                    {"左右各5音以内で全音を分けられないため、運指を表示できません。元の音は変更されません。"}
                  </p>
                ) : null}
                {displayMode === "learn" && currentVoicing ? (
                  <CurrentRuleExplanation explanation={currentVoicing.explanation}
                    onNextCandidate={() => changeCurrentCandidate(1)} onPreviousCandidate={() => changeCurrentCandidate(-1)} text={text} />
                ) : null}
                </div>
                <NextMovePreview moves={nextMoves} loopWrap={currentIndex === snapshot.events.length - 1}
                  hasNext={Boolean(currentVoicing && nextVoicing)} accidentalStyle={accidentalStyle} />
              </Surface>
              <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
                <Surface className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3" data-testid="voicing-loop-next-panel" aria-label={"次のコード詳細"}>
                  <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" tabIndex={0}
                    aria-label={"次のコードの詳細をスクロール"}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="lv-section-kicker">{text.next}</p>
                    <span className="text-xs font-semibold text-[var(--lv-text-muted)]" data-testid="voicing-loop-next-wait">
                      {remainingBeatsLabel(nextWaitBeats)}
                    </span>
                  </div>
                  <div className="mt-2 flex min-w-0 items-baseline gap-2">
                    <p className="min-w-0 truncate whitespace-nowrap text-2xl font-bold text-[var(--lv-text)]" title={nextEvent?.chord.label ?? restLabel}>{nextEvent?.chord.label ?? restLabel}</p>
                    {nextDegree ? <span className="shrink-0 text-sm font-bold text-[var(--lv-accent)]" data-testid="voicing-loop-next-degree">{nextDegree}</span> : null}
                  </div>
                  {displayMode === "learn" && nextVoicing ? (
                    <div className={`mt-2 grid gap-2 ${nextHandTargets.left.length > 0 && nextHandTargets.right.length > 0 ? "grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)]" : "grid-cols-1"}`} data-testid="voicing-loop-next-voicing">
                      <CompactHandVoicing accidentalStyle={accidentalStyle} fingering={nextLeftFingering} hand="left"
                        pitches={nextHandTargets.left} showFingering={showFingering} text={text} voicing={nextVoicing} />
                      <CompactHandVoicing accidentalStyle={accidentalStyle} fingering={nextRightFingering} hand="right"
                        pitches={nextHandTargets.right} showFingering={showFingering} text={text} voicing={nextVoicing} />
                    </div>
                  ) : null}
                  </div>
                  <NextShapePreview hands={nextHandTargets} nextVoicing={nextVoicing}
                    leftFingering={nextLeftFingering} rightFingering={nextRightFingering}
                    chordLabel={nextEvent?.chord.label ?? restLabel} accidentalStyle={accidentalStyle} />
                </Surface>
                <Surface className="h-[72px] min-w-0 shrink-0 overflow-hidden p-3" data-testid="voicing-loop-then-next">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="lv-section-kicker">{"その次"}</span>
                    <strong className="min-w-0 truncate whitespace-nowrap text-lg text-[var(--lv-text)]" title={thenNextEvent?.chord.label ?? restLabel}>{thenNextEvent?.chord.label ?? restLabel}</strong>
                    {thenNextDegree ? <span className="text-xs font-bold text-[var(--lv-accent)]">{thenNextDegree}</span> : null}
                  </div>
                  {displayMode === "learn" && showFingering ? (
                    <div className="mt-1 flex min-w-0 gap-x-4 overflow-hidden whitespace-nowrap text-xs text-[var(--lv-text-secondary)]">
                      <span>{text.leftHandDisplay}: <strong className="text-amber-200">{fingerSummary(effectiveFingering(thenNextEvent ? leftFingeringById.get(thenNextEvent.id) : undefined, fingeringPreferences), "L", thenNextHandTargets.left.length, text.fingeringUnavailable)}</strong></span>
                      <span>{text.rightHandDisplay}: <strong className="text-teal-200">{fingerSummary(effectiveFingering(thenNextEvent ? rightFingeringById.get(thenNextEvent.id) : undefined, fingeringPreferences), "R", thenNextHandTargets.right.length, text.fingeringUnavailable)}</strong></span>
                    </div>
                  ) : null}
                </Surface>
              </div>
            </div>
          </div>

          <Surface className="h-[148px] min-w-0 shrink-0 overflow-hidden px-2 py-1.5" aria-label={text.timeline} data-testid="voicing-loop-timeline">
            <div className="flex min-w-0 items-center justify-between gap-3 px-1 text-[10px]">
              <span className="font-bold tracking-[0.1em] text-[var(--lv-text-secondary)]">{text.timeline}</span>
              <div className="flex items-center gap-2" data-testid="voicing-loop-status">
                <Metric compact label={"コード"} testId="voicing-loop-position-metric" value={`${currentIndex + 1} / ${snapshot.events.length}`} />
                <Metric compact label={text.loop} value={text.loopLabel(projection?.loopCount ?? 0)} />
                {rangeSelection.active ? <button type="button" data-testid="voicing-loop-range-chip"
                  className="rounded border border-[var(--lv-accent)] px-1.5 py-0.5 text-[var(--lv-accent)]"
                  aria-label={`区間ループ ${rangeSelection.active.first + 1}〜${rangeSelection.active.last + 1} を解除`}
                  onClick={clearRange}>{`区間 ${rangeSelection.active.first + 1}〜${rangeSelection.active.last + 1} ×`}</button> : null}
                {rangeSelection.pendingStart !== undefined ? <span data-testid="voicing-loop-range-pending"
                  className="text-[var(--lv-accent)]">{`ここから ${rangeSelection.pendingStart + 1}`}</span> : null}
              </div>
              <div className="flex items-center gap-1 text-[var(--lv-text-muted)]">
                <button type="button" className={`rounded px-1.5 py-0.5 ${followEnabled ? "text-[var(--lv-accent)]" : "text-amber-200"}`}
                  aria-pressed={followEnabled} onClick={() => resumeTimelineFollow(true)} data-testid="voicing-loop-follow">{followEnabled ? "追従" : "手動 · F"}</button>
                <span data-testid="voicing-loop-source-meter">{"元の拍子"} {snapshot.meter.numerator}/{snapshot.meter.denominator}</span>
                <span className="ml-2">{"表示"}</span>
                {([8, 12, 16] as const).map((scale) => (
                  <button key={scale} type="button" className={`rounded px-2 py-1 ${timelineScale === scale ? "bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : ""}`}
                    aria-pressed={effectiveTimelineScale === scale} disabled={scale > 8 && totalGroups < scale}
                    onClick={() => setTimelineScale(scale)}>{scale}</button>
                ))}
              </div>
            </div>
            <div
              ref={timelineViewportRef}
              className="h-[112px] min-w-0 overflow-x-auto overflow-y-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)]"
              data-testid="voicing-loop-timeline-viewport"
              tabIndex={0}
              aria-label={text.timeline}
              onWheel={() => setTimelineManual("wheel")}
              onPointerDown={(event) => { if (event.target === event.currentTarget) setTimelineManual("pointer"); }}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && ["ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].includes(event.key)) {
                  setTimelineManual("keyboard");
                }
              }}
            >
              <div className="relative" style={{ width: `${snapshot.lengthBeats * timelinePixelsPerBeat}px` }}>
                <div className="relative mt-1 flex h-3 cursor-pointer overflow-hidden rounded bg-[var(--lv-bg)]" data-testid="voicing-loop-overview"
              role="button" tabIndex={0} aria-label={"進行の全体図から移動"}
              onClick={seekFromOverviewClick} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); seekToBeat((projection?.progressionBeat ?? 0), "overview"); } }}>
              {Array.from({ length: totalGroups }, (_, index) => (
                <span key={index} className={`h-full flex-1 border-r border-[var(--lv-bg)] ${index < currentGroup - 1 ? "bg-teal-700" : index === currentGroup - 1 ? "bg-[var(--lv-accent)]" : "bg-slate-700"}`} />
              ))}
                </div>
                <div className="flex h-5 cursor-pointer border-b border-[var(--lv-border)] text-[10px] text-[var(--lv-text-muted)]" data-testid="voicing-loop-ruler"
                  role="button" tabIndex={0} aria-label={"目盛りから移動"}
                  onClick={seekFromTimelineClick} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); seekToBeat(projection?.progressionBeat ?? 0, "ruler"); } }}>
                  {Array.from({ length: totalGroups }, (_, index) => (
                    <span key={index} className="shrink-0 border-l border-[var(--lv-border)] pl-1" style={{ width: `${Math.min(practiceGroupBeats, snapshot.lengthBeats - index * practiceGroupBeats) * timelinePixelsPerBeat}px` }}>{index + 1}</span>
                  ))}
                </div>
                <div className="relative flex gap-0 py-1">
                <span
                  aria-hidden="true"
                  data-testid="voicing-loop-playhead"
                  ref={playheadRef}
                  className="pointer-events-none absolute inset-y-1 left-0 z-10 w-0.5 bg-[var(--lv-accent)] shadow-[0_0_12px_rgba(59,224,206,0.75)]"
                  style={{ transform: `translateX(${playheadX}px)` }}
                >
                  <span data-testid="voicing-loop-playhead-marker" className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--lv-accent)] shadow-[0_0_10px_rgba(59,224,206,0.85)]" />
                </span>
                {snapshot.spans.map((span, index) => {
                  const eventIndex = span.kind === "chord" ? span.eventIndex : -1;
                  const event = snapshot.events[eventIndex];
                  const playable = cardAuditionResolution(event, eventIndex, { ...cardAuditionPlans, current: plan })?.status === "SUPPORTED";
                  const resolution = plan?.events[eventIndex];
                  const autoFallback = resolution?.status === "SUPPORTED" && Boolean(resolution.fallbackFrom);
                  const selected = index === transportCurrentSpanIndex;
                  const auditioned = eventIndex >= 0 && eventIndex === auditionedIndex;
                  const degree = progressionPracticeDegreeLabel(event?.chord, targetKey);
                  const cardWidth = span.durationBeats * timelinePixelsPerBeat;
                  const compact = compactTimelineCard(cardWidth);
                  const showPreview = playable && cardWidth >= 96;
                  const rangeCard = span.kind === "chord" && rangeContainsCard(rangeSelection.active, eventIndex);
                  const rangeStart = span.kind === "chord" && rangeSelection.active?.first === eventIndex;
                  const rangeEnd = span.kind === "chord" && rangeSelection.active?.last === eventIndex;
                  const pendingStart = span.kind === "chord" && rangeSelection.pendingStart === eventIndex;
                  return (
                    <div key={event?.id ?? `rest-${span.startBeat}`} className="relative flex-none" style={{ width: `${span.durationBeats * timelinePixelsPerBeat}px` }}>
                    <button
                      ref={(element) => { timelineEventRefs.current[index] = element; }}
                      type="button"
                      data-testid="voicing-loop-event"
                      data-duration-beats={span.durationBeats}
                      data-span-kind={span.kind}
                      data-compact={compact}
                      data-auto-fallback={autoFallback ? "true" : "false"}
                      data-range={pendingStart ? "pending-a" : rangeStart && rangeEnd ? "a-b" : rangeStart ? "a" : rangeEnd ? "b" : rangeCard ? "inside" : rangeSelection.active ? "outside" : "none"}
                      title={event?.chord.label ?? restLabel}
                      style={{ width: `${cardWidth}px` }}
                      className={`relative flex h-[54px] w-full min-h-[54px] flex-none flex-col justify-start overflow-hidden rounded-[var(--lv-radius-sm)] border ${compact ? "px-0.5 pb-1 pt-1" : "px-2 pb-3 pt-1.5"} text-left text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)] disabled:cursor-not-allowed disabled:opacity-60 ${rangeSelection.active && !rangeCard ? "opacity-55" : ""} ${rangeCard && rangeSelection.active ? "ring-1 ring-inset ring-[var(--lv-accent)]" : ""} ${selected ? `border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] text-[var(--lv-accent)] shadow-[inset_0_0_0_1px_rgba(59,224,206,0.12)] ${pageTurnHighlightIndex === index ? "ring-2 ring-[var(--lv-accent)]" : ""}` : auditioned ? "border-[var(--lv-accent)] bg-[var(--lv-surface-raised)] text-[var(--lv-text)]" : "border-[var(--lv-border)] bg-transparent text-[var(--lv-text-secondary)]"}`}
                      aria-current={selected ? "step" : undefined}
                      aria-pressed={auditioned}
                      aria-label={`${index + 1}/${snapshot.spans.length}: ${event?.chord.label ?? restLabel}${degree ? `, ${degree}` : ""}, ${practiceTimingLabel(span, snapshot.practiceGroupBeats ?? snapshot.meter.numerator)}.${event ? ` ${transportRef.current?.supportsSeek ? ("ここへ移動して試聴") : text.auditionCard}` : ""}${autoFallback ? " 自動生成で補完" : ""}${pendingStart ? " 範囲開始の候補A" : rangeStart && rangeEnd ? " 区間A/B" : rangeStart ? " 区間A" : rangeEnd ? " 区間B" : ""}`}
                      disabled={!playable && !transportRef.current?.supportsSeek}
                      onMouseDown={(event) => event.preventDefault()}
                      onContextMenu={(event) => {
                        if (span.kind !== "chord") return;
                        event.preventDefault();
                        const keyboardMenu = keyboardRangeMenuRef.current;
                        keyboardRangeMenuRef.current = undefined;
                        if (event.detail === 0 && keyboardMenu?.cardIndex === eventIndex
                          && performance.now() - keyboardMenu.at < 500) return;
                        markRangeCard(eventIndex, event.shiftKey);
                      }}
                      onKeyDown={(event) => {
                        if (span.kind !== "chord") return;
                        if (event.key === "ContextMenu" || event.key === "Menu"
                          || event.shiftKey && event.key === "F10") {
                          event.preventDefault();
                          event.stopPropagation();
                          keyboardRangeMenuRef.current = { cardIndex: eventIndex, at: performance.now() };
                          markRangeCard(eventIndex);
                        }
                      }}
                      onFocus={(event) => {
                        if (pageTurnFrameRef.current !== undefined) cancelAnimationFrame(pageTurnFrameRef.current);
                        pageTurnFrameRef.current = undefined;
                        event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                      }}
                      onClick={(event) => {
                        const origin: TimelineSeekOrigin = event.detail === 0 ? "keyboard" : "card";
                        if (span.kind === "rest") seekToBeat(span.startBeat + 1e-6, origin);
                        else selectTimelineCard(eventIndex, origin);
                      }}
                    >
                      {autoFallback ? <span className="absolute right-1 top-0.5 rounded bg-amber-400/20 px-1 text-[9px] text-amber-200"
                        data-testid="voicing-loop-auto-fallback" title="自動生成で補完" aria-label="自動生成で補完">A</span> : null}
                      {pendingStart || rangeStart || rangeEnd ? <span aria-hidden="true"
                        className="absolute bottom-0.5 right-1 text-[10px] text-[var(--lv-accent)]">
                        {pendingStart ? "A?" : rangeStart && rangeEnd ? "A/B" : rangeStart ? "A" : "B"}
                      </span> : null}
                      <span className="flex min-w-0 items-baseline gap-1">
                        {!compact ? <span className="shrink-0 text-[10px] font-normal text-[var(--lv-text-muted)]">{index + 1}</span> : null}
                        <span className={`min-w-0 leading-tight ${compact ? "block overflow-hidden text-ellipsis whitespace-nowrap text-[9px] tracking-tight" : "break-all text-sm"}`}>{event?.chord.label ?? restLabel}</span>
                      </span>
                      {!compact ? (
                        <>
                          <span data-testid="voicing-loop-event-timing" className={`absolute bottom-1 left-2 text-[10px] font-normal leading-3 ${selected ? "text-teal-200" : "text-[var(--lv-text-muted)]"}`}>
                            {compactDurationLabel(span.durationBeats)}
                          </span>
                          {degree && !pendingStart && !rangeStart && !rangeEnd ? <span className={`absolute bottom-1 text-[10px] font-bold leading-3 text-[var(--lv-accent)] ${showPreview ? "right-8" : "right-2"}`} data-testid="voicing-loop-event-degree">{degree}</span> : null}
                        </>
                      ) : null}
                    </button>
                    {showPreview ? <button type="button" className="absolute bottom-1 right-1 z-20 rounded bg-[var(--lv-surface-raised)] p-1 text-[var(--lv-accent)] disabled:opacity-40"
                      data-testid="voicing-loop-event-preview" aria-label={`${event?.chord.label}: ${text.auditionCard}`}
                      disabled={active} onClick={(click) => { click.stopPropagation(); void auditionResolved(eventIndex, true); }}><Play aria-hidden="true" size={16} /></button> : null}
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          </Surface>

          <Surface className="h-[clamp(190px,24dvh,234px)] min-w-0 shrink-0 overflow-hidden p-2" data-testid="voicing-loop-detail">
            <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 pb-1">
              <h3 className="text-[10px] font-bold tracking-[0.1em] text-[var(--lv-text-secondary)]">{text.keyboardTitle}</h3>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--lv-text-secondary)]" data-testid="voicing-loop-keyboard-legend">
                {[
                  { label: "左手の目安", color: "border-amber-400 bg-amber-400/30" },
                  { label: "右手の目安", color: "border-cyan-300 bg-cyan-300/30" },
                  { label: "押鍵中", color: "border-teal-100 bg-teal-300" },
                  { label: "ペダル保持", color: "border-sky-200 bg-sky-600" },
                ].map(({ label, color }) => <span key={label} className="inline-flex items-center gap-1"><span aria-hidden="true" className={`h-2.5 w-2.5 border ${color}`} />{label}</span>)}
              </div>
              {(
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!currentVoicing || active}
                  onClick={() => void auditionCurrent()}
                >
                  <Volume2 aria-hidden="true" size={16} />
                  {text.reference}
                </Button>
              )}
            </div>
            <div className="min-w-0" data-keyboard-event-index={keyboardEventIndex}>
              <PracticeKeyboard
                range={VOICING_LOOP_KEYBOARD_RANGE}
                guideNotes={keyboardVoicing?.midiNotes ?? EMPTY_NOTES}
                referenceBassNote={keyboardVoicing?.referenceBassNote}
                leftHandGuideNotes={keyboardHandTargets.left}
                rightHandGuideNotes={keyboardHandTargets.right}
                allowedPitchClasses={ALL_PITCH_CLASSES}
                requiredPitchClasses={EMPTY_NOTES}
                level={displayMode === "learn" ? 1 : 4}
                accidentalStyle={accidentalStyle}
                concealNoteNames={displayMode === "recall"}
                interactionMode="neutral-monitor"
                fingerLabels={keyboardFingerLabels}
                keyboardLayout="wide-88"
                hideLegend
                compactSummary
              />
            </div>
          </Surface>

          {bulkSourceOpen && bulkSourcePreview && onBulkSourceApply ? (
            <Modal
              ariaLabel={"SOURCEへの一括切り替え"}
              onClose={() => setBulkSourceOpen(false)}
              panelClassName="w-full max-w-md"
            >
              <div className="space-y-3 p-4">
                <h2 className="text-lg font-bold">{"この進行のカードをまとめてSOURCEにする"}</h2>
                <p className="text-sm text-[var(--lv-text-secondary)]">
                  {`対象 ${bulkSourcePreview.eligible}・変更 ${bulkSourcePreview.changed}・CUSTOM維持 ${bulkSourcePreview.skippedCustom}・元の音なし ${bulkSourcePreview.skippedMissingSource}`}
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setBulkSourceOpen(false)}>{"戻る"}</Button>
                  <Button variant="primary" disabled={bulkSourcePreview.changed === 0} onClick={() => {
                    if (onBulkSourceApply()) setBulkSourceOpen(false);
                  }}>{"切り替える"}</Button>
                </div>
              </div>
            </Modal>
          ) : null}
          {fingeringEditorOpen ? (
            <Modal
              ariaLabel={text.editFingering}
              onClose={() => setFingeringEditorOpen(false)}
              panelClassName="w-full max-w-3xl"
            >
              <FingeringEditor
                accidentalStyle={accidentalStyle}
                draftFingers={draftFingers}
                fingerings={{ left: currentLeftFingering, right: currentRightFingering }}
                onCancel={() => setFingeringEditorOpen(false)}
                onChange={changeDraftFinger}
                onReset={resetCurrentFingering}
                onSave={saveCurrentFingering}
                text={text}
              />
            </Modal>
          ) : null}

          <Surface ref={transportBarRef} className="lv-vl-transport h-[92px] min-w-0 shrink-0 overflow-hidden px-2 py-0.5" data-testid="voicing-loop-transport">
            <div className="grid h-full min-w-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-1">
              <div className="lv-transport-row flex min-h-0 min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap" data-testid="voicing-loop-transport-primary">
              <BpmScrubField
                idPrefix="voicing-loop-bpm"
                label={text.bpm}
                dragLabel={text.bpmDrag}
                value={clockState?.bpm ?? snapshot.bpm}
                onChange={changeBpm}
              />
              {activeTempoOrigin === "SMF_DEFAULT" || activeTempoOrigin === "PRACTICE_INITIAL" ? (
                <span className="shrink-0 text-[10px] text-[var(--lv-text-secondary)]" data-testid="voicing-loop-tempo-origin">
                  {tempoOriginLabel(activeTempoOrigin)}
                </span>
              ) : null}
              {sourceKey && targetTonicPitchClass !== undefined ? (
                <label className="inline-flex min-h-8 items-center gap-2 text-[10px] font-bold tracking-[0.08em] text-[var(--lv-text-muted)]" htmlFor="voicing-loop-key">
                  <span className="lv-vl-label-text">{text.key}</span>
                  <select
                    id="voicing-loop-key"
                    className="lv-vl-key-select lv-field-control min-h-8 w-32 px-2 text-xs"
                    value={targetTonicPitchClass}
                    onChange={(event) => changeTargetKey(Number(event.currentTarget.value))}
                  >
                    {keyOptions.map((key) => (
                      <option key={key.tonicPitchClass} value={key.tonicPitchClass}>
                        {key.labels.ja}{key.tonicPitchClass === sourceKey.tonicPitchClass ? ` (${text.originalKey})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="inline-flex min-h-8 items-center gap-1 text-[10px] font-bold tracking-[0.08em] text-[var(--lv-text-muted)]" role="group" aria-label={text.octave}>
                <span className="lv-vl-label-text mr-1">{text.octave}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={text.octaveDown}
                  disabled={octaveShift <= -2}
                  onClick={() => changeOctave((octaveShift - 1) as -2 | -1 | 0 | 1 | 2)}
                >
                  <Minus aria-hidden="true" size={16} />
                </Button>
                <output className="min-w-9 text-center text-xs font-semibold text-[var(--lv-text-secondary)]" aria-live="polite">
                  {text.octaveShift(octaveShift)}
                </output>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={text.octaveUp}
                  disabled={octaveShift >= 2}
                  onClick={() => changeOctave((octaveShift + 1) as -2 | -1 | 0 | 1 | 2)}
                >
                  <Plus aria-hidden="true" size={16} />
                </Button>
              </div>
              <label className="inline-flex min-h-8 items-center gap-2 text-[10px] font-bold tracking-[0.08em] text-[var(--lv-text-muted)]" htmlFor="voicing-loop-count-in">
                <span className="lv-vl-label-text">{text.countInBars}</span>
                <select
                  id="voicing-loop-count-in"
                  className="lv-field-control min-h-8 w-24 px-2 text-xs"
                  value={countInBars}
                  disabled={active || paused}
                  onChange={(event) => setCountInBars(Number(event.currentTarget.value) as 0 | 1 | 2)}
                >
                  <option value={0}>{text.noCountIn}</option>
                  <option value={1}>{text.oneBar}</option>
                  <option value={2}>{text.twoBars}</option>
                </select>
              </label>
              {!active && !paused ? (
                <TransportButton variant="primary" fixedPrimary disabled={!allEventsPlayable} onClick={() => void start()}><Play aria-hidden="true" size={16} />{text.start}</TransportButton>
              ) : active ? (
                <TransportButton variant="primary" fixedPrimary onClick={pause}><Pause aria-hidden="true" size={16} />{text.pause}</TransportButton>
              ) : (
                <TransportButton variant="primary" fixedPrimary onClick={() => void resume()}><Play aria-hidden="true" size={16} />{text.resume}</TransportButton>
              )}
              <TransportButton variant="neutral" title={text.restart} disabled={!active && !paused} onClick={() => void restart()}><RefreshCw aria-hidden="true" size={16} /><span className="lv-vl-button-text">{text.restart}</span></TransportButton>
              <TransportButton variant="neutral" title={text.stop} disabled={!active && !paused} onClick={stop}><Square aria-hidden="true" size={16} /><span className="lv-vl-button-text">{text.stop}</span></TransportButton>
              <label title={text.referenceSound} className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] px-2 text-xs font-medium text-[var(--lv-text-secondary)] focus-within:text-[var(--lv-text)]">
                <input
                  type="checkbox"
                  checked={referenceSoundEnabled}
                  onChange={(event) => changeReferenceSound(event.currentTarget.checked)}
                />
                <span className="lv-vl-button-text">{text.referenceSound}</span>
              </label>
              </div>
              <div className="lv-transport-row flex min-h-0 min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap border-t border-[var(--lv-border)] pt-0.5" data-testid="voicing-loop-transport-midi-row">
              <span className={`inline-flex min-h-8 items-center gap-1.5 px-1 text-xs ${midiStatus === "connected" ? "text-teal-200" : "text-amber-200"}`} data-testid="voicing-loop-midi-status">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${midiStatus === "connected" ? "bg-teal-300" : "bg-amber-300"}`} />
                <span className="font-semibold">{text.midi}</span>
                <span>{midiStatus === "connected"
                  ? `${text.connected}${selectedMidiDevice ? ` · ${selectedMidiDevice.name}` : ""}`
                  : midiStatus === "connecting" ? text.connecting : text.disconnected}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => void reconnectMidi()}><RefreshCw aria-hidden="true" size={16} />{text.reconnect}</Button>
              <Button variant="ghost" size="sm" onClick={openMidiSettings}><Settings aria-hidden="true" size={16} />{text.settings}</Button>
              <span className="ml-auto text-xs font-medium text-[var(--lv-text-secondary)]">{sessionStatus(clockState?.status, text)}</span>
              {midiReconnectError || midiStoreError ? <p className="max-w-64 truncate whitespace-nowrap text-xs text-amber-200" title={midiReconnectError ?? midiStoreError}>{midiReconnectError ?? midiStoreError}</p> : null}
              </div>
            </div>
          </Surface>
          {runtimeError ? <StatusMessage title={text.playbackError} tone="error">{runtimeError}</StatusMessage> : null}
          {plan ? <UnresolvedSummary plan={plan} snapshot={snapshot} /> : null}
          <ResolutionStatus resolution={currentResolution} />
          <div aria-hidden="true" className="h-4 shrink-0" data-testid="voicing-loop-bottom-safe-area" />
        </>
      )}
    </div>
  );
}

function practiceTimingLabel(
  event: Pick<ProgressionPracticeEvent, "startBeat" | "durationBeats">,
  practiceGroupBeats: number,
): string {
  const group = Math.floor(event.startBeat / practiceGroupBeats) + 1;
  const beat = (event.startBeat % practiceGroupBeats) + 1;
  const beatLabel = formatPracticeBeat(beat);
  const durationLabel = formatPracticeBeat(event.durationBeats);
  return `${group}練習グループ・${beatLabel}拍目・${durationLabel}拍`;
}

function rankFingeringsForHand(
  snapshot: ProgressionVoicingPracticeSnapshot | undefined,
  handAssignments: readonly ProgressionFingeringHandTargets[],
  selection: ProgressionVoicingSelection,
  hand: FingeringHand,
): ReturnType<typeof rankCyclicFingerings> {
  if (!snapshot) return [];
  const events = snapshot.events.flatMap((event, index) => {
    const pitches = handAssignments[index]?.[hand] ?? EMPTY_NOTES;
    if (!pitches.length) return [];
    return [{
      id: event.id,
      hand,
      midiPitches: pitches,
      chord: event.chord,
      family: selection,
    }];
  });
  return rankCyclicFingerings(events);
}

function effectiveFingering(
  suggestion: RankedFingering | { readonly status: "unavailable" } | undefined,
  preferences: FingeringPreferenceCollection,
): RankedFingering | undefined {
  if (!suggestion || suggestion.status !== "supported") return undefined;
  const personal = findPersonalFingering(preferences, suggestion.signature);
  return personal ? { ...suggestion, fingers: personal.fingers } : suggestion;
}

function addKeyboardFingerLabels(
  labels: Map<number, string>,
  fingering: RankedFingering | undefined,
  prefix: "L" | "R",
) {
  fingering?.pitches.forEach((pitch, index) => {
    const next = `${prefix}${fingering.fingers[index]}`;
    const current = labels.get(pitch);
    labels.set(pitch, current ? `${current}/${next}` : next);
  });
}

function fingerSummary(
  fingering: RankedFingering | undefined,
  prefix: "L" | "R",
  noteCount: number,
  unavailable: string,
): string {
  if (!noteCount) return "—";
  return fingering ? fingering.fingers.map((finger) => `${prefix}${finger}`).join(" · ") : unavailable;
}

function moveText(move: FingerMovement, accidentalStyle: NoteAccidentalStyle): string {
  const hand = move.hand === "left" ? "L" : "R";
  const finger = move.finger === undefined ? hand : `${hand}${move.finger}`;
  const note = (pitch: number) => formatMidiNoteForDisplay(pitch, "fl-studio", accidentalStyle);
  if (move.kind === "ADD") return `${finger} ${note(move.to!)} ${"追加"}`;
  if (move.kind === "RELEASE") return `${finger} ${"離す"} ${note(move.from!)}`;
  if (move.kind === "KEEP") return `${finger} ${note(move.from!)}を押さえたまま`;
  return `${finger} ${note(move.from!)} → ${note(move.to!)} ${movementInterval(move.semitones!)}`;
}

export const NextMovePreview = memo(function NextMovePreview({ moves, loopWrap, hasNext, accidentalStyle }: {
  readonly moves: readonly FingerMovement[];
  readonly loopWrap: boolean;
  readonly hasNext: boolean;
  readonly accidentalStyle: NoteAccidentalStyle;
}) {
  const slots = fixedFingerSlots(hasNext ? moves : []);
  const note = (pitch: number) => formatMidiNoteForDisplay(pitch, "fl-studio", accidentalStyle);
  return (
    <section className="relative mt-2 h-[68px] min-h-[68px] min-w-0 shrink-0 overflow-hidden border-t border-[var(--lv-border)] pt-1" data-testid="voicing-loop-next-move" aria-label={"次への動き"}>
      <span className="absolute left-0 top-1 max-w-[24%] truncate text-[9px] font-bold tracking-[0.04em] text-[var(--lv-text-muted)]">{"次への動き"}</span>
      <div className="grid min-w-0 grid-cols-2 gap-1">
        {(["left", "right"] as const).map((hand) => (
          <div key={hand} className="min-w-0" role="group" data-testid="voicing-loop-next-move-hand-group" data-hand={hand}
            aria-label={hand === "left" ? ("左手") : ("右手")}>
            <div className={`flex h-[14px] min-w-0 items-center justify-center gap-1 truncate text-[10px] font-bold tracking-[0.04em] ${hand === "left" ? "text-amber-200" : "text-cyan-200"}`}
              data-testid="voicing-loop-next-move-summary">
              <span>{hand === "left" ? ("左手") : ("右手")}</span>
              <span className="min-w-0 truncate font-extrabold">{handMoveSummary(moves.filter((move) => move.hand === hand))}</span>
              {loopWrap && hand === "right" ? <span className="truncate text-[var(--lv-text-muted)]">{"ループ先"}</span> : null}
              {moves.some((move) => move.hand === hand && move.estimated) ? <span className="sr-only">{"推定"}</span> : null}
            </div>
            <div className="mt-0.5 grid min-w-0 grid-cols-5 gap-0.5" role="list">
              {slots.filter((slot) => slot.hand === hand).map((slot) => {
                const id = `${slot.hand === "left" ? "L" : "R"}${slot.finger}`;
                const strongest = slot.moves.some((move) => move.kind === "LARGE") ? "LARGE"
                  : slot.moves.some((move) => move.kind === "MEDIUM" || move.kind === "ADD" || move.kind === "RELEASE") ? "MEDIUM"
                    : slot.moves.some((move) => move.kind === "SMALL") ? "SMALL" : slot.moves.length ? "KEEP" : "EMPTY";
                const action = slot.moves.map((move) => move.kind === "ADD" ? "+押す" : move.kind === "RELEASE" ? "×離す"
                  : movementInterval(move.semitones!)).join("/");
                const next = slot.moves.reduce<number | undefined>((pitch, move) => move.to ?? pitch, undefined);
                const description = slot.moves.length
                  ? slot.moves.map((move) => moveText(move, accidentalStyle)).join("; ")
                  : `${id} ${"使用しない"}`;
                const strength = strongest === "LARGE" ? "border-current bg-current/15 font-extrabold"
                  : strongest === "MEDIUM" ? "border-current/70 bg-current/10 font-bold"
                    : strongest === "SMALL" ? "border-current/40 font-semibold"
                      : strongest === "KEEP" ? "border-current/50 bg-current/[0.04] font-semibold" : "border-dashed border-current/20";
                return <div key={id} role="listitem" data-testid="voicing-loop-finger-slot" data-finger={id} data-strength={strongest}
                  className={`flex h-[43px] min-w-0 flex-col items-center justify-center overflow-hidden rounded border leading-none ${slot.hand === "left" ? "text-amber-200" : "text-cyan-200"} ${strength}`}
                  aria-label={`${id}: ${description}${slot.moves.some((move) => move.estimated) ? ` (${"推定"})` : ""}`}
                  title={`${id}: ${description}`}>
                  <span className={`text-[10px] font-bold ${strongest === "EMPTY" ? "text-[var(--lv-text-muted)]" : ""}`}>{id}</span>
                  {strongest === "KEEP" ? (
                    <span aria-hidden="true" className="my-1 h-1 w-[70%] rounded-full bg-current/70" data-testid="voicing-loop-keep-band" />
                  ) : strongest !== "EMPTY" ? <span className="mt-0.5 w-full truncate px-0.5 text-center text-[10px]">{action}</span> : null}
                  {strongest !== "EMPTY" && next !== undefined ? <span className="mt-0.5 text-[9px]">{note(next)}</span> : null}
                </div>;
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});

const MiniKeyboard = memo(function MiniKeyboard({ range, hands, labels, accidentalStyle }: {
  readonly range: MiniKeyboardRange;
  readonly hands: ProgressionFingeringHandTargets;
  readonly labels: ReadonlyMap<number, string>;
  readonly accidentalStyle: NoteAccidentalStyle;
}) {
  const notes = Array.from({ length: range.max - range.min + 1 }, (_, index) => range.min + index);
  const whites = notes.filter((note) => !isBlack(note));
  const blacks = notes.filter(isBlack);
  const keyClass = (note: number, black: boolean) => {
    const selected = hands.left.includes(note) ? "left" : hands.right.includes(note) ? "right" : undefined;
    if (selected === "left") return black ? "border-amber-200 bg-amber-500 text-slate-950" : "border-amber-300 bg-amber-200 text-slate-950";
    if (selected === "right") return black ? "border-cyan-200 bg-cyan-500 text-slate-950" : "border-cyan-300 bg-cyan-200 text-slate-950";
    return black ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-400 bg-slate-100 text-slate-950";
  };
  return (
    <div className="relative flex h-[42px] min-w-0 flex-1 overflow-hidden rounded border border-[var(--lv-border)] bg-slate-900" data-testid="voicing-loop-next-shape-keyboard">
      {whites.map((note) => <span key={note} className={`relative flex h-full min-w-0 flex-1 items-end justify-center border-r pb-0.5 text-[9px] font-bold ${keyClass(note, false)}`}
        title={formatMidiNoteForDisplay(note, "fl-studio", accidentalStyle)}>{labels.get(note) ?? ""}</span>)}
      {blacks.map((note) => {
        const before = whites.filter((white) => white < note).length;
        return <span key={note} className={`absolute top-0 z-10 flex h-[26px] items-end justify-center rounded-b border pb-0.5 text-[8px] font-bold ${keyClass(note, true)}`}
          style={{ left: `${(before - 0.35) * 100 / whites.length}%`, width: `${70 / whites.length}%` }}
          title={formatMidiNoteForDisplay(note, "fl-studio", accidentalStyle)}>{labels.get(note) ?? ""}</span>;
      })}
    </div>
  );
});

const NextShapePreview = memo(function NextShapePreview({ hands, nextVoicing, leftFingering, rightFingering, chordLabel, accidentalStyle }: {
  readonly hands: ProgressionFingeringHandTargets;
  readonly nextVoicing?: ResolvedProgressionPracticeVoicing;
  readonly leftFingering?: RankedFingering;
  readonly rightFingering?: RankedFingering;
  readonly chordLabel: string;
  readonly accidentalStyle: NoteAccidentalStyle;
}) {
  const displayHands = useMemo(() => hands.left.length || hands.right.length || !nextVoicing
    ? hands : { left: EMPTY_NOTES, right: nextVoicing.midiNotes }, [hands, nextVoicing]);
  const shape = useMemo(() => nextShapeRanges(displayHands), [displayHands]);
  const labels = useMemo(() => {
    const result = new Map<number, string>();
    addKeyboardFingerLabels(result, leftFingering, "L");
    addKeyboardFingerLabels(result, rightFingering, "R");
    return result;
  }, [leftFingering, rightFingering]);
  const noteList = (notes: readonly number[]) => notes.map((note) => `${formatMidiNoteForDisplay(note, "fl-studio", accidentalStyle)} ${labels.get(note) ?? ""}`).join(", ");
  const ariaLabel = `${"次の手の形"}: ${chordLabel}. ${"左手"}: ${noteList(displayHands.left)}. ${"右手"}: ${noteList(displayHands.right)}.`;
  return (
    <section className="mt-2 h-[72px] min-h-[72px] min-w-0 shrink-0 overflow-hidden border-t border-[var(--lv-border)] pt-1" data-testid="voicing-loop-next-shape" role="img" aria-label={ariaLabel}>
      <p className="text-[10px] font-bold tracking-[0.1em] text-[var(--lv-text-secondary)]">{"次の手の形"}</p>
      {nextVoicing && shape.ranges.length ? <div className="mt-1 flex min-w-0 items-center gap-1">
        {shape.ranges.map((range, index) => <MiniKeyboard key={`${range.min}-${range.max}-${index}`} range={range} hands={displayHands} labels={labels} accidentalStyle={accidentalStyle} />)
          .reduce<ReactNode[]>((items, keyboard, index) => index ? [...items, <span key={`gap-${index}`} aria-hidden="true" className="text-xs text-[var(--lv-text-muted)]">…</span>, keyboard] : [keyboard], [])}
      </div> : <p className="mt-2 text-xs text-[var(--lv-text-muted)]">—</p>}
    </section>
  );
});

function HandVoicingSummary({
  accidentalStyle, fingering, hand, isPersonal, pitches, showFingering, text, voicing,
}: {
  readonly accidentalStyle: NoteAccidentalStyle;
  readonly fingering?: RankedFingering;
  readonly hand: FingeringHand;
  readonly isPersonal: boolean;
  readonly pitches: readonly number[];
  readonly showFingering: boolean;
  readonly text: typeof copy.ja;
  readonly voicing: ResolvedProgressionPracticeVoicing;
}) {
  if (!pitches.length) return null;
  const prefix = hand === "left" ? "L" : "R";
  const handBorder = hand === "left" ? "border-amber-300/75 bg-amber-400/[0.17]" : "border-teal-300/50 bg-teal-300/[0.08]";
  const handText = hand === "left" ? "text-amber-200" : "text-teal-200";
  return (
    <section className={`min-w-0 rounded-[var(--lv-radius-sm)] border p-2.5 ${handBorder}`} data-testid={`voicing-loop-${hand}-hand`}>
      <p className={`text-xs font-bold tracking-[0.12em] ${handText}`}>{hand === "left" ? text.leftHandDisplay : text.rightHandDisplay}</p>
      <dl className="mt-2 space-y-1.5">
        {showFingering ? (
          <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
            <dt className="text-[11px] font-bold tracking-[0.12em] text-[var(--lv-text-secondary)]">{text.finger}</dt>
            <dd className="flex min-w-0 items-baseline gap-1 overflow-hidden whitespace-nowrap">
              <strong className={`min-w-0 truncate whitespace-nowrap text-2xl leading-tight ${handText}`} title={fingerSummary(fingering, prefix, pitches.length, text.fingeringUnavailable)}>
                {fingerSummary(fingering, prefix, pitches.length, text.fingeringUnavailable)}
              </strong>
              {fingering ? <span className="rounded border border-[var(--lv-border)] px-1.5 py-0.5 text-[11px] text-[var(--lv-text-secondary)]">{isPersonal ? text.personal : text.automatic}</span> : null}
            </dd>
          </div>
        ) : null}
        <HandFact label={text.pitches} value={formatPitchList(pitches, accidentalStyle)} inline />
        <HandFact label={text.chordTone} value={formatChordToneList(voicing, pitches)} inline />
      </dl>
    </section>
  );
}

function CompactHandVoicing({ voicing, accidentalStyle, fingering, hand, pitches, showFingering, text }: {
  readonly voicing: ResolvedProgressionPracticeVoicing;
  readonly accidentalStyle: NoteAccidentalStyle;
  readonly fingering?: RankedFingering;
  readonly hand: FingeringHand;
  readonly pitches: readonly number[];
  readonly showFingering: boolean;
  readonly text: typeof copy.ja;
}) {
  if (!pitches.length) return null;
  const prefix = hand === "left" ? "L" : "R";
  const handBorder = hand === "left" ? "border-amber-300/55 bg-amber-400/[0.12]" : "border-[var(--lv-accent)] bg-teal-300/[0.08]";
  const handText = hand === "left" ? "text-amber-200" : "text-[var(--lv-accent)]";
  return (
    <div className={`min-w-0 rounded-[var(--lv-radius-sm)] border px-3 py-2 ${handBorder}`} data-testid={`voicing-loop-next-${hand}-hand`}>
      <p className={`text-xs font-bold tracking-[0.1em] ${handText}`}>{hand === "left" ? text.leftHandDisplay : text.rightHandDisplay}</p>
      <dl className="mt-1 space-y-1">
        {showFingering ? (
          <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-1">
            <dt className="text-[10px] font-bold tracking-[0.1em] text-[var(--lv-text-secondary)]">{text.finger}</dt>
            <dd className={`min-w-0 truncate whitespace-nowrap text-lg font-bold ${handText}`} title={fingerSummary(fingering, prefix, pitches.length, text.fingeringUnavailable)}>{fingerSummary(fingering, prefix, pitches.length, text.fingeringUnavailable)}</dd>
          </div>
        ) : null}
        <HandFact label={text.pitches} value={formatPitchList(pitches, accidentalStyle)} compact inline />
        <HandFact label={text.chordTone} value={formatChordToneList(voicing, pitches)} compact inline />
      </dl>
    </div>
  );
}

function HandFact({ label, value, compact = false, inline = false }: {
  readonly label: string;
  readonly value: string;
  readonly compact?: boolean;
  readonly inline?: boolean;
}) {
  return (
    <div className={inline ? "grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2" : "min-w-0"}>
      <dt className="text-[11px] font-bold tracking-[0.12em] text-[var(--lv-text-secondary)]">{label}</dt>
      <dd className={`${inline ? "" : "mt-0.5"} min-w-0 truncate whitespace-nowrap text-[var(--lv-text-secondary)] ${compact ? "text-xs leading-4" : "text-sm leading-5"}`} title={value}>{value}</dd>
    </div>
  );
}

function formatPitchList(pitches: readonly number[], accidentalStyle: NoteAccidentalStyle): string {
  return pitches
    .map((pitch) => formatMidiNoteForDisplay(pitch, "fl-studio", accidentalStyle))
    .join(" · ");
}

function formatChordToneList(
  voicing: ResolvedProgressionPracticeVoicing,
  pitches: readonly number[],
): string {
  const degrees = new Map(voicing.notes.map((note) => [note.midiNote, note.degree ?? "—"]));
  return pitches.map((pitch) => degrees.get(pitch) ?? "—").join(" · ");
}

function FingeringEditor({
  accidentalStyle,
  draftFingers,
  fingerings,
  onCancel,
  onChange,
  onReset,
  onSave,
  text,
}: {
  readonly accidentalStyle: NoteAccidentalStyle;
  readonly draftFingers: Readonly<Record<FingeringHand, readonly FingerNumber[]>>;
  readonly fingerings: Readonly<Record<FingeringHand, RankedFingering | undefined>>;
  readonly onCancel: () => void;
  readonly onChange: (hand: FingeringHand, index: number, value: number) => void;
  readonly onReset: () => void;
  readonly onSave: () => void;
  readonly text: typeof copy.ja;
}) {
  const entries = (["left", "right"] as const)
    .flatMap((hand) => fingerings[hand] ? [{ hand, fingering: fingerings[hand] }] : []);
  const valid = entries.length > 0 && entries.every(({ hand, fingering }) => (
    Boolean(fingering) && isValidFingering(hand, fingering!.pitches, draftFingers[hand])
  ));
  return (
    <div className="min-w-0 p-4 sm:p-6" data-testid="voicing-loop-fingering-editor">
      <h2 className="text-xl font-bold text-[var(--lv-text)]">{text.editFingering}</h2>
      <p className="mt-2 text-xs leading-5 text-[var(--lv-text-secondary)]">
        {"音の低い順。Voicingの音程・オクターブは変わりません。"}
      </p>
      <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
        {entries.map(({ hand, fingering }) => (
          <FingeringEditorHand
            accidentalStyle={accidentalStyle}
            draftFingers={draftFingers[hand]}
            fingering={fingering!}
            hand={hand}
            key={hand}
            onChange={onChange}
            text={text}
          />
        ))}
      </div>
      <div className="mt-6 flex min-w-0 flex-wrap justify-end gap-2 border-t border-[var(--lv-border)] pt-4">
        <Button size="sm" variant="ghost" onClick={onReset}>{text.resetFingering}</Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>{text.cancel}</Button>
        <Button size="sm" variant="primary" disabled={!valid} onClick={onSave}>{text.saveFingering}</Button>
      </div>
    </div>
  );
}

function FingeringEditorHand({
  accidentalStyle,
  draftFingers,
  fingering,
  hand,
  onChange,
  text,
}: {
  readonly accidentalStyle: NoteAccidentalStyle;
  readonly draftFingers: readonly FingerNumber[];
  readonly fingering: RankedFingering;
  readonly hand: FingeringHand;
  readonly onChange: (hand: FingeringHand, index: number, value: number) => void;
  readonly text: typeof copy.ja;
}) {
  const prefix = hand === "left" ? "L" : "R";
  const handLabel = hand === "left" ? text.leftHand : text.rightHand;
  return (
    <fieldset className="min-w-0 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] p-3">
      <legend className="px-1 text-xs font-bold tracking-[0.1em] text-[var(--lv-accent)]">{handLabel}</legend>
      <div className="flex min-w-0 flex-wrap gap-2">
        {fingering.pitches.map((pitch, index) => {
          const note = formatMidiNoteForDisplay(pitch, "fl-studio", accidentalStyle);
          return (
            <label key={pitch} className="min-w-[4.5rem] flex-1 text-xs text-[var(--lv-text-secondary)]">
              <span className="block truncate">{note}</span>
              <select
                className="lv-field-control mt-1 min-h-9 w-full px-2"
                aria-label={`${handLabel}: ${text.fingerForNote(note)}`}
                value={draftFingers[index] ?? ""}
                onChange={(event) => onChange(hand, index, Number(event.currentTarget.value))}
              >
                {[1, 2, 3, 4, 5].map((finger) => <option key={finger} value={finger}>{prefix}{finger}</option>)}
              </select>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function formatPracticeBeat(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function compactDurationLabel(value: number): string {
  const formatted = formatPracticeBeat(value);
  return `${formatted}拍`;
}

function ProgressionChoice({
  candidate,
  onChoose,
  practiceLabel,
}: {
  readonly candidate: VoicingLoopVaultCandidate;
  readonly onChoose: () => void;
  readonly practiceLabel: string;
}) {
  const facts = [candidate.key, candidate.bpm === undefined ? undefined
    : `${candidate.bpm} BPM${candidate.tempoOrigin === "SMF_DEFAULT" || candidate.tempoOrigin === "PRACTICE_INITIAL"
      ? `（${tempoOriginLabel(candidate.tempoOrigin)}）` : ""}`].filter(Boolean).join(" · ");
  const unavailable = candidate.unavailableReason ? unavailableReasonLabel(candidate.unavailableReason) : undefined;
  const chords = candidate.chordLabels.join(" → ") || ("休符のみ");
  return (
    <button
      type="button"
      data-testid="voicing-loop-progression-choice"
      className="w-full min-w-0 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] bg-[var(--lv-bg-subtle)] p-3 text-left hover:border-[var(--lv-accent)] hover:bg-[var(--lv-surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)] disabled:cursor-not-allowed disabled:opacity-75"
      aria-label={`${candidate.title}. ${facts}. ${chords}. ${unavailable ?? practiceLabel}`}
      disabled={Boolean(candidate.unavailableReason)}
      onClick={onChoose}
    >
      <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 break-words text-sm font-semibold text-[var(--lv-text)]">{candidate.title}</span>
        <span className="shrink-0 text-xs text-[var(--lv-text-secondary)]">{facts}</span>
      </span>
      <span className="mt-1 line-clamp-2 break-words text-xs leading-5 text-[var(--lv-text-secondary)]">{chords}</span>
      <span className={`mt-2 block text-xs font-semibold ${unavailable ? "text-amber-200" : "text-[var(--lv-accent)]"}`}>{unavailable ?? practiceLabel}</span>
    </button>
  );
}

function tempoOriginLabel(origin: "SMF_DEFAULT" | "PRACTICE_INITIAL"): string {
  if (origin === "SMF_DEFAULT") return "SMF既定";
  return "練習初期値";
}

function unavailableReasonLabel(reason: NonNullable<VoicingLoopVaultCandidate["unavailableReason"]>): string {
  const ja: Record<NonNullable<VoicingLoopVaultCandidate["unavailableReason"]>, string> = {
    "practice-capacity": "練習グループ数が256を超えています。Vaultの保存データは保持されます。",
    "resource-budget": "再生時間・拍数・イベント数の安全上限を超えています。Vaultの保存データは保持されます。",
    "unsupported-meter": "この拍子はVoicing Loopで練習できません。",
    "invalid-bpm": "BPMが対応範囲外です。",
    "invalid-key": "キー情報を練習用に解釈できません。",
    "empty-progression": "練習できるコードがありません。",
    "invalid-chord": "対応していないコード構造が含まれます。",
    "invalid-timing": "進行の時間配置を練習用に解釈できません。",
    "invalid-reference": "Vaultの参照情報を確認できません。",
    "invalid-selection": "練習方法を選択できません。",
    "source-unavailable": "保存済み進行を読み込めません。",
  };
  return ja[reason];
}

function sameReferences(
  left: readonly ProgressionPracticeSourceReference[],
  right: readonly ProgressionPracticeSourceReference[],
): boolean {
  return left.length === right.length
    && left.every((reference, index) => voicingLoopSourceId(reference) === voicingLoopSourceId(right[index]!));
}

function CurrentRuleExplanation({
  explanation,
  onNextCandidate,
  onPreviousCandidate,
  text,
}: {
  readonly explanation?: VoicingRuleExplanation;
  readonly onNextCandidate: () => void;
  readonly onPreviousCandidate: () => void;
  readonly text: typeof copy.ja;
}) {
  if (!explanation || (!explanation.identity && !explanation.coverage && !explanation.candidateCount)) return null;
  const family = explanation.identity
    ? ruleFamilyLabel(explanation.identity.family)
    : sourceLabel(explanation.source);
  const coverage = explanation.coverage
    ? coverageLabel(explanation.coverage)
    : undefined;
  const candidate = explanation.candidateIndex && explanation.candidateCount
    ? `${explanation.candidateIndex}/${explanation.candidateCount}`
    : undefined;

  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--lv-border)] pt-2 text-[10px] text-[var(--lv-text-secondary)]" data-testid="voicing-loop-current-explanation">
      <span className="rounded-full border border-[var(--lv-border)] bg-[var(--lv-bg-subtle)] px-2 py-0.5 font-semibold text-[var(--lv-text)]">{family}</span>
      {coverage ? <span className="rounded-full border border-[var(--lv-border)] px-2 py-0.5">{coverage}</span> : null}
      {candidate ? (
        <span
          className="inline-flex items-center rounded-full border border-[var(--lv-border)]"
          data-testid="voicing-loop-candidate-navigation"
          title={text.candidateHelp}
        >
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-l-full text-[var(--lv-text-secondary)] hover:bg-[var(--lv-surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lv-accent)] disabled:cursor-not-allowed disabled:opacity-35"
            aria-label={text.previousCandidate}
            disabled={(explanation.candidateCount ?? 0) <= 1}
            onClick={onPreviousCandidate}
          >
            <ChevronLeft aria-hidden="true" size={16} />
          </button>
          <span className="px-1 font-semibold" aria-label={`${text.candidateHelp}: ${candidate}`}>候補 {candidate}</span>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-r-full text-[var(--lv-text-secondary)] hover:bg-[var(--lv-surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lv-accent)] disabled:cursor-not-allowed disabled:opacity-35"
            aria-label={text.nextCandidate}
            disabled={(explanation.candidateCount ?? 0) <= 1}
            onClick={onNextCandidate}
          >
            <ChevronRight aria-hidden="true" size={16} />
          </button>
        </span>
      ) : null}
      {explanation.identity ? (
        <>
          <span><strong className="mr-1 text-[var(--lv-text-muted)]">{text.rule}</strong>{explanation.identity.ruleId} · {explanation.identity.variantId}</span>
          <span><strong className="mr-1 text-[var(--lv-text-muted)]">{text.omit}</strong>{explanation.omittedDegrees.length ? explanation.omittedDegrees.join(" · ") : text.none}</span>
          <span><strong className="mr-1 text-[var(--lv-text-muted)]">{text.top}</strong>{topRoleLabel(explanation.topRole)}</span>
        </>
      ) : null}
    </div>
  );
}

function sourceLabel(source: VoicingRuleExplanation["source"]): string {
  switch (source) {
    case "source-midi": return "Source MIDI";
    case "custom": return "Custom";
    case "lesson-rules": return "Lesson Rules";
  }
}

function ruleFamilyLabel(family: VoicingRuleFamily): string {
  const labels: Record<VoicingRuleFamily, string> = {
    "teacher-style": "Teacher Style",
    "family-core": "Family Core",
    "family-color": "Family Color",
    "open-spread": "Open / Spread",
    "teacher-open": "Teacher Open",
    "bass-guide-tones": "Bass + Guide Tones",
    "slash-bass-upper-structure": "Slash Bass + Upper Structure",
    "characteristic-core": "Characteristic Core",
    "dominant-upper-structure": "Dominant + Upper Structure",
    "two-hand-open": "Two-hand Open",
    "drop-2": "Drop 2",
  };
  return labels[family];
}

function coverageLabel(coverage: VoicingCoverage): string {
  const labels: Record<VoicingCoverage, string> = {
    literal: "Literal",
    "performance-reduction": "演奏用省略",
    "creative-enrichment": "創造的追加",
  };
  return labels[coverage];
}

const playbackChoiceLabels = { SOURCE: "元MIDI", GENERATED: "自動生成", CUSTOM: "カスタム" } as const;

function topRoleLabel(role: VoicingTopContext | undefined): string {
  switch (role) {
    case "fixed-melody": return "固定Melody";
    case "top-candidate": return "トップ候補";
    case "normal-voicing-top":
    case undefined: return "Voicingのトップ";
  }
}
function Metric({
  children,
  compact = false,
  label,
  testId,
  value,
}: {
  readonly children?: ReactNode;
  readonly compact?: boolean;
  readonly label: string;
  readonly testId?: string;
  readonly value: string;
}) {
  return (
    <div
      className={compact
        ? "grid min-w-0 grid-cols-[auto_minmax(2rem,1fr)_auto] items-center gap-1 px-1"
        : "grid min-w-0 grid-cols-[auto_minmax(2rem,1fr)_auto] items-center gap-2 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] bg-[var(--lv-bg-subtle)] px-3 py-1.5"}
      data-testid={testId}
    >
      <p className="text-[10px] font-semibold tracking-[0.08em] text-[var(--lv-text-muted)]">{label}</p>
      <div className="min-w-0">{children}</div>
      <p className="whitespace-nowrap text-sm font-semibold text-[var(--lv-text)]">{value}</p>
    </div>
  );
}

function ResolutionStatus({ resolution }: { readonly resolution?: ProgressionPracticeVoicingResolution;}) {
  if (!resolution || resolution.status === "SUPPORTED") return null;
  const text = copy.ja;
  switch (resolution.status) {
    case "UNAVAILABLE":
      return <StatusMessage title={text.unavailable} tone="warning">{text.unavailableBody}</StatusMessage>;
    case "UNSUPPORTED_RULE":
      return <StatusMessage title={text.unsupported} tone="warning">{text.unsupportedBody}</StatusMessage>;
    case "GENERATION_ERROR":
      return <StatusMessage title={text.generationError} tone="error">{text.generationErrorBody}</StatusMessage>;
  }
}


function sessionStatus(status: ProgressionPracticeClockStatus | undefined, text: typeof copy.ja): string {
  switch (status) {
    case "running":
    case "count-in": return text.running;
    case "paused": return text.paused;
    case "stopped": return text.stopped;
    case "ready":
    case undefined: return text.ready;
  }
}

function nextPracticeBarBoundary(absoluteBeat: number, beatsPerBar: number): number {
  const safeBeat = Number.isFinite(absoluteBeat) ? Math.max(0, absoluteBeat) : 0;
  const safeBeatsPerBar = Number.isFinite(beatsPerBar) && beatsPerBar > 0 ? beatsPerBar : 4;
  return (Math.floor(safeBeat / safeBeatsPerBar) + 1) * safeBeatsPerBar;
}

function UnresolvedSummary({ plan, snapshot }: {
  readonly plan: ProgressionPracticeVoicingPlan;
  readonly snapshot: ProgressionVoicingPracticeSnapshot;
}) {
  const unresolved = plan.events.flatMap((resolution, index) => resolution.status === "SUPPORTED"
    ? []
    : [{
        eventIndex: index,
        label: snapshot.events[index]?.chord.label ?? `${index + 1}`,
        status: resolution.status,
        reason: resolution.reason,
        detail: resolutionStatusLabel(resolution.status, snapshot, index),
      }]);
  if (unresolved.length === 0) return null;
  const grouped = new Map<string, { label: string; detail: string; count: number }>();
  for (const item of unresolved) {
    const chord = snapshot.events[item.eventIndex]?.chord;
    const key = JSON.stringify([chord?.root, chord?.quality, chord ? [...chord.tensions].sort() : [],
      chord?.bass, item.status, item.reason, item.detail]);
    const existing = grouped.get(key);
    grouped.set(key, existing
      ? { ...existing, count: existing.count + 1 }
      : { label: item.label, detail: item.detail, count: 1 });
  }
  return (
    <StatusMessage title={copy.ja.unresolvedSummary(unresolved.length)} tone="warning">
      <ul className="list-disc space-y-1 pl-5">
        {[...grouped.entries()].map(([key, item]) => (
          <li key={key}>
            {item.label}{item.count > 1 ? ` ×${item.count}` : ""}: {item.detail}
          </li>
        ))}
      </ul>
    </StatusMessage>
  );
}

function resolutionStatusLabel(
  status: Exclude<ProgressionPracticeVoicingResolution["status"], "SUPPORTED">,
  snapshot: ProgressionVoicingPracticeSnapshot,
  eventIndex: number,
): string {
  const text = copy.ja;
  switch (status) {
    case "UNAVAILABLE": return text.unavailableStatus;
    case "UNSUPPORTED_RULE": {
      const chord = snapshot.events[eventIndex]?.chord;
      return snapshot.selection === "left-hand"
        && chord?.bass !== undefined
        && chord.bass !== chord.root
        ? text.leftHandUpperUnsupported
        : text.unsupportedStatus;
    }
    case "GENERATION_ERROR": return text.generationErrorStatus;
  }
}

function createDefaultTransport(): ProgressionVoicingTransportPort {
  try {
    if (window.localStorage.getItem("lv-voicing-loop-v2") === "off") return new ProgressionVoicingTransport();
  } catch { /* non-persistent mode still uses the candidate */ }
  return new ProgressionVoicingTransportV2();
}

/** 「覚える（Voicing表示）」: the part in （） is visually hidden on a narrow bar and stays in the name. */
function CompactLabel({ text }: { text: string }) {
  const cut = text.indexOf("（");
  if (cut < 0) return <>{text}</>;
  return <>{text.slice(0, cut)}<span className="lv-vl-control-text">{text.slice(cut)}</span></>;
}
