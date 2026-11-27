import { displayChordLabel, displayDegreeLabel } from "../ui/chordText";
import { Select } from "../components/ui";
import { displayKey } from "../domain/displayLabels";
import { readLastVoicingPractice } from "../voicingPractice/lastPractice";
import { VoicingLoopPicker } from "./voicing-loop/VoicingLoopPicker";
import { progressionFunctions, type FunctionKind } from "../domain/harmony/chordFunction";
import { degreeOf } from "../domain/harmony/degrees";
import { useFingeringRankerMode } from "../voicingPractice/fingeringRankerMode";
import { p21ERankerCostModel } from "../domain/p21SingleNoteFingering";
import { rankPracticeHandFingerings } from "../voicingPractice/rankPracticeFingerings";
import { ShapeMenu } from "./voicing-loop/ShapeMenu";
import { readPlayAlongPreference, usePlayAlong, writePlayAlongPreference, type AudiblePosition } from "./voicing-loop/usePlayAlong";
import { useMidiConnection } from "../liveMidi/useMidiConnection";
import type { GeneratedShapeOptions } from "../domain/voicingShapes";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { prefersReducedMotion, Presence } from "../components/motion/Presence";
import { useSlidingPick } from "../components/motion/useSlidingPick";
import { useReserveBottomSpace } from "../components/notifications";
import * as Tone from "tone";
import { ChevronLeft, ChevronRight, Minus, Pause, Play, Plus, RefreshCw, Square, Volume2 } from "lucide-react";
import {
  formatMidiNoteForDisplay,
  type NoteAccidentalStyle,
} from "../components/music-keyboard";
import { Modal } from "../components/Modal";
import { PracticeKeyboard } from "../components/practice/PracticeKeyboard";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { useMetronome } from "../components/MetronomeProvider";
import { useAnnounceSongBpm, useGlobalBpm } from "../components/GlobalBpmProvider";
import { TransportButton } from "../components/TransportButton";
import { Button, StatusMessage, Surface, Switch } from "../components/ui";
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
  arrangeVoicingLoopSearchResults,
  groupVoicingLoopVaultCandidates,
  voicingLoopSourceId,
  type ProgressionPracticeSourceReference,
  type VoicingLoopVaultCandidate,
} from "../domain/progressionVoicingPractice";
import { cancelVoicingLoopRangePending, emptyVoicingLoopRangeSelection, rangeBeatBounds,
  rangeContainsCard, selectVoicingLoopRangeCard, type VoicingLoopRangeSelection } from "../domain/progressionVoicingPractice/rangeLoop";
import { chordIndexAtTimelineBeat, timelineBeatAtPointer } from "../domain/progressionVoicingPractice/timelineNavigation";
import { clampTimelineScale, compactTimelineCard, remainingBeatsLabel, timelinePixelsPerBeat as pixelsPerBeatForTimeline } from "../domain/progressionVoicingPractice/timelineLayout";
import type {
  VoicingCoverage,
  VoicingBaseStudy,
  VoicingRuleExplanation,
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
import { useDojoMidi } from "./chord-dojo/useDojoMidi";
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
import { availableVoicingSource, preferenceId, readGeneratedShape, rememberGeneratedShape, rememberVoicingSource, restoreVoicingSource, savedDuplicatesSource, sourceCoverage } from "../voicingPractice/sourcePreference";
import { cardAuditionResolution } from "../voicingPractice/cardAudition";
import { HandSlotPanel, type HandSlotLabels } from "../components/voicing/HandSlotPanel";
import { TimelineNavigator } from "../components/timeline/TimelineNavigator";
import { buildHandSlots, slotDegree } from "../voicingPractice/handSlots";
import { computeNextMoves, fixedFingerSlots, handMoveSummary, movementInterval, type FingerMovement } from "../voicingPractice/nextMove";
import { isBlack, nextShapeRanges, type MiniKeyboardRange } from "../voicingPractice/nextShape";
import { ChordName } from "../components/ChordName";

const ALL_PITCH_CLASSES = Object.freeze(Array.from({ length: 12 }, (_, index) => index));
const EMPTY_NOTES: readonly number[] = Object.freeze([]);
const EMPTY_VAULT_PROGRESSIONS: readonly VoicingLoopVaultCandidate[] = Object.freeze([]);
const VOICING_LOOP_KEYBOARD_RANGE = Object.freeze({ minMidiNote: 9, maxMidiNote: 96 });
/** VL-14: safety for a dropped sync — extrapolate at most ¼ beat past the last (beat, audio time). */
const PROGRESSION_PAINT_MAX_EXTRAPOLATION_BEATS = 0.25;

interface Vl14Probe {
  frames: Array<{ at: number; absoluteBeat: number; transportBeat: number; progressionBeat: number; status: string; audioNow: number }>;
  syncs: Array<{ at: number; beat: number; time: number; before: number; after: number; statusBefore: string; statusAfter: string; lookAhead: number; contextTime: number; outputLatency: number; dropped?: string }>;
  marks: Array<{ type: string; at: number; contextTime: number }>;
  effectStarts: Array<{ at: number; transportBeat: number; status: string; bpm: number }>;
  reset(): void;
}

export interface ProgressionVoicingPracticeViewProps {
  readonly snapshots?: ProgressionVoicingPracticeSnapshots;
  readonly initialSelection?: ProgressionVoicingSelection;
  readonly vaultProgressions?: readonly VoicingLoopVaultCandidate[];
  readonly bulkSourcePreview?: {
    readonly changed: number;
    readonly keptCustom: number;
  };
  readonly onBulkSourceApply?: () => boolean;
  readonly onSelectProgression: (reference: ProgressionPracticeSourceReference) => boolean;
  /** VL-15: the same Vault favourite flag the Vault list writes (`block.pinned`). */
  readonly onToggleFavorite?: (reference: ProgressionPracticeSourceReference, pinned: boolean) => boolean | "pending";
  readonly onEnterText: () => void;
  /** P23-29: 「Vault で開く」 in the picker's right column. */
  readonly onOpenInVault?: (reference: ProgressionPracticeSourceReference) => void;
  /** P22-02 §1-7: the empty picker sends the player to the MIDI capture screen. */
  readonly onImportMidi?: () => void;
  readonly transportFactory?: () => ProgressionVoicingTransportPort;
  readonly resolutionOptions?: ResolveProgressionPracticeVoicingsOptions;
  /** P23-20 L3: the setting 「度数を表示」. False hides the degree text only — the role colour stays. Default true. */
  readonly showDegrees?: boolean;
  /** P23-32 T1: the head's 「練習する進行」 back button returns to the picker. */
  readonly onBackToPicker?: () => void;
}

const sourceSelections = [
  { id: "saved", ja: "保存した音" },
  { id: "source-midi", ja: "元MIDI" },
  { id: "custom", ja: "カスタム" },
  { id: "basic-full", ja: "自動生成" },
] as const;
const copy = {
  ja: {    title: "Voicing Loop",
    description: "コードを見た瞬間に、左手・右手それぞれ何指か分かる。",
    source: "Voicingを選択",
    // P23-20 L2: the top band is two groups, and every checkbox has a name that is always shown.
    sourceGroup: "音の出どころ",
    displayGroup: "表示",
    // P23-29: the picker's own words.
    resumeTitle: "続きから",
    resumeGo: "続ける",
    filterAll: "すべて",
    filterFavorites: "お気に入り",
    filterRecent: "最近使った",
    filterLabel: "一覧の切り替え",
    pickHint: "進行を選んでください",
    pickHintBody: "左の一覧で行を押すと、ここに中身が出ます。",
    practiceThis: "この進行で練習する",
    openInVault: "Vault で開く",
    lastPracticed: "最後に練習",
    never: "まだ",
    usableVoices: "使える音",
    sourceMidiLabel: "元の MIDI",
    savedVoicesLabel: "保存した音",
    generatedLabel: "自動生成",
    savedOn: "保存した日",
    codeCount: (count: number) => `${count} コード`,
    barsCount: (count: number) => `${count} 小節`,
    chordCards: "コード",
    auditionAll: "試聴",
    auditionHint: "カードを押すと、そのコードが鳴ります",
    noKeyLabel: "キーなし",
    noBpmLabel: "BPM なし",
    // P23-20 L3: the role letters of a chord in its key (read aloud; the letter itself is the badge).
    roleTonic: "トニック",
    roleSubdominant: "サブドミナント",
    roleSubdominantMinor: "サブドミナントマイナー",
    roleDominant: "ドミナント",
    sourceHelp: "保存した音・元MIDI・カスタムは保存済みの実音を使います。一部に音がない場合だけ自動生成で補完し、カードに印を表示します。",
    studyHelp: "自動生成の形(基本・シェル・ルートレス・シェル+上の三和音・4 度積み)と部品を、形のメニューで選びます。固定音では変更できません。",
    teacherHelp: "先生由来の考え方を一般化した実用Voicing",
    coreHelp: "コードの骨格・特徴音を中心に練習",
    optimizeProgression: "進行に合わせてなめらかにつなぐ",
    /** P23-20 L2: the always-visible short name; the full sentence stays the accessible name (`aria-label`). */
    optimizeProgressionShort: "なめらかにつなぐ",
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
    timeline: "進行",
    progressionSection: "進行",
    cardAuditionOnly: "カードクリック = 試聴のみ",
    keyboardTitle: "鍵盤 — 88鍵 / A0–C8",
    loop: "ループ",
    pitches: "音名",
    chordTone: "構成音",
    suggestedFingering: "おすすめ運指",
    finger: "指",
    showFingering: "おすすめ運指を表示",
    /** P23-20 L2: the always-visible short name (contained in the accessible name). */
    showFingeringShort: "運指",
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
    // P25-08 L2: the buttons show the verb only; the old explanation moves to the title.
    learnShort: "覚える",
    recallShort: "思い出す",
    learnTitle: "カードに押さえ方(Voicing)を出して覚える",
    recallTitle: "カードにはコード名だけを出して、押さえ方を思い出す",
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
    referenceSound: "お手本の音",
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
    search: "進行を検索",
    searchPlaceholder: "タイトル、コード、Keyで検索",
    favorites: "お気に入り",
    recent: "最近使った",
    others: "そのほか(新しく保存した順)",
    favoriteHint: "を押すと、お気に入りが一番上に並びます",
    favoriteAdd: "お気に入りに追加",
    favoriteRemove: "お気に入りから外す",
    favoriteFailed: "お気に入りを保存できませんでした。",
    results: "検索結果",
    noSaved: "まだ進行がありません",
    noSavedBody: "「MIDI から取り込む」でMIDIを読み込むか、テキストで進行を作ってください。",
    importMidi: "MIDI から取り込む",
    enterTextShort: "テキストで入力",
    unavailableCapacity: "長すぎるため、ここでは練習できません(範囲を分けて保存してください)",
    noMatches: "検索に一致する進行はありません。",
    practice: "練習する",
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
    midi: "MIDI 入力",
    midiSettings: "MIDI 設定",
    positionLabel: (group: number, total: number) => `${group} / ${total} 練習グループ`,
    beatLabel: (beat: number, total: number) => `${beat} / ${total} 拍`,
    loopLabel: (count: number) => `${count} 周完了`,
  },
} as const;

/** P23-29: the picker's words (its own component lives in `views/voicing-loop/`). */
export type VoicingLoopText = typeof copy.ja;

export function ProgressionVoicingPracticeView({
  initialSelection = "source-midi",
  onSelectProgression,
  onEnterText,
  onOpenInVault,
  onImportMidi,
  bulkSourcePreview,
  onBulkSourceApply,
  onToggleFavorite,
  resolutionOptions,
  snapshots,
  transportFactory = createDefaultTransport,
  vaultProgressions = EMPTY_VAULT_PROGRESSIONS,
  showDegrees = true,
  onBackToPicker,
}: ProgressionVoicingPracticeViewProps) {
  const text = copy.ja;
  const { sound: previewSound } = usePreviewSound();
  const { enabled: metronomeEnabled, toggle: toggleGlobalMetronome } = useMetronome();
  const { bpm: globalBpm } = useGlobalBpm();
  const globalBpmRef = useRef(globalBpm);
  globalBpmRef.current = globalBpm;
  const [selection, setSelection] = useState<ProgressionVoicingSelection>(() => restoreVoicingSource(snapshots, initialSelection));
  const duplicateSavedSource = useMemo(() => savedDuplicatesSource(snapshots), [snapshots]);
  const lastGeneratedSelection = useRef<ProgressionVoicingSelection>(selection === "saved" || selection === "source-midi" || selection === "custom" ? "basic-full" : selection);
  const generatedDetailsRef = useRef<HTMLDetailsElement>(null);
  // The native details.open property is the only open state; no stale React mirror.
  useEffect(() => {
    const onOutsidePointer = (event: PointerEvent) => {
      const details = generatedDetailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    };
    const onEscape = (event: KeyboardEvent) => {
      const details = generatedDetailsRef.current;
      if (event.key !== "Escape" || !details?.open || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onOutsidePointer, true);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("pointerdown", onOutsidePointer, true);
      document.removeEventListener("keydown", onEscape, true);
    };
  }, []);
  const progressionPreferenceId = preferenceId(snapshots);
  const previousPreferenceId = useRef(progressionPreferenceId);
  // P25-08 L1 / K8: 自動生成 is 基本 (today's 「teacher」 rules) or a K shape, chosen in 「形 ▼」 (K7 key).
  const studyCategory: VoicingBaseStudy = "teacher";
  const [generatedShape, setGeneratedShape] = useState<GeneratedShapeOptions>(() => readGeneratedShape());
  const leftHandVariant = resolutionOptions?.leftHandVariant ?? "auto";
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
    ? [snapshot.fingerprint, selection, studyCategory, JSON.stringify(generatedShape), progressionOptimizationEnabled].join(":")
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
  // P23-06: only a BPM the user saved with the progression is the song's BPM; a stand-in (120) is not announced.
  useAnnounceSongBpm(sourceSnapshot && activeTempoOrigin === "SAVED_BPM" ? sourceSnapshot.bpm : undefined);
  const [query, setQuery] = useState("");
  const [pickFavorite, setPickFavorite] = useState<Readonly<Record<string, boolean>>>({});
  const [favoriteNotice, setFavoriteNotice] = useState<string>();
  const [recentReferences, setRecentReferences] = useState(loadRecentVoicingLoopProgressions);
  const retainedRecentReferences = useMemo(
    () => retainAvailableRecentVoicingLoopProgressions(
      recentReferences,
      vaultProgressions.map(({ sourceReference }) => sourceReference),
    ),
    [recentReferences, vaultProgressions],
  );
  // VL-15: the sections are frozen when the picker opens and when the search text changes, so pressing a star
  // never moves the row under the pointer. The star itself still reads the live value below.
  const trimmedQuery = query.trim();
  const pickerLayout = useRef<{
    readonly query: string;
    readonly candidates: readonly VoicingLoopVaultCandidate[];
    readonly recent: readonly ProgressionPracticeSourceReference[];
  } | null>(null);
  if (!progressionLoaded && (
    pickerLayout.current === null
    || pickerLayout.current.query !== trimmedQuery
    || (pickerLayout.current.candidates.length === 0 && vaultProgressions.length > 0)
  )) {
    pickerLayout.current = {
      query: trimmedQuery,
      candidates: vaultProgressions,
      recent: retainedRecentReferences,
    };
  }
  const pickerSnapshot = pickerLayout.current;
  const pickerSections = pickerSnapshot
    ? groupVoicingLoopVaultCandidates(pickerSnapshot.candidates, pickerSnapshot.recent)
    : [];
  const pickerSearchResults = pickerSnapshot && pickerSnapshot.query
    ? arrangeVoicingLoopSearchResults(
      filterVoicingLoopVaultCandidates(pickerSnapshot.candidates, pickerSnapshot.query),
      pickerSnapshot.recent,
    )
    : [];
  const pickerFavorite = (candidate: VoicingLoopVaultCandidate) =>
    pickFavorite[candidate.id] ?? candidate.favorite;
  const pickerFavoriteCount = pickerSnapshot
    ? pickerSnapshot.candidates.filter((candidate) => pickerFavorite(candidate)).length
    : 0;
  function togglePickerFavorite(candidate: VoicingLoopVaultCandidate) {
    const next = !pickerFavorite(candidate);
    const previous = pickFavorite[candidate.id];
    setPickFavorite((current) => ({ ...current, [candidate.id]: next }));
    const saved = onToggleFavorite?.(candidate.sourceReference, next);
    if (saved === false) {
      setPickFavorite((current) => {
        const restored = { ...current };
        if (previous === undefined) delete restored[candidate.id];
        else restored[candidate.id] = previous;
        return restored;
      });
      setFavoriteNotice(text.favoriteFailed);
      return;
    }
    setFavoriteNotice(undefined);
  }
  const effectiveResolutionOptions = useMemo<ResolveProgressionPracticeVoicingsOptions>(
    () => lessonRulesSelected && selection === "basic-full" ? {
      ...resolutionOptions,
      lessonStudyCategory: studyCategory,
      generatedShape,
      lessonProgressionOptimization: progressionOptimizationEnabled,
      lessonCandidateIndexes,
      octaveShift,
      lessonContext: resolutionOptions?.lessonContext ?? {
        bass: "self-played",
        top: "normal-voicing-top",
      },
    } : { ...resolutionOptions, detailedFallbackStudy: lessonRulesSelected ? studyCategory : undefined, leftHandVariant, octaveShift },
    [generatedShape, leftHandVariant, lessonCandidateIndexes, lessonRulesSelected, octaveShift, progressionOptimizationEnabled, resolutionOptions, selection, studyCategory],
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
    () => snapshot ? createProgressionPracticeClockState(snapshot, { bpm: globalBpm, countInBars }) : undefined,
  );
  const [displayMode, setDisplayMode] = useState<"learn" | "recall">("learn");
  // P25-16 N3 (4): the chosen frame of 覚える / 思い出す slides.
  const displayPickRef = useSlidingPick(displayMode);
  // P25-11 I2: 弾き合わせ (off by default) and its judgement, kept on this PC.
  const [playAlongPreference, setPlayAlongPreference] = useState(readPlayAlongPreference);
  const judgePickRef = useSlidingPick(playAlongPreference.mode);
  const midiConnection = useMidiConnection();
  const playAlongActive = playAlongPreference.on && midiConnection.connected && Boolean(snapshot);
  /** I3-1: where the ear is — set by the playhead's drawing (the audio-clock position). */
  const audiblePositionRef = useRef<() => AudiblePosition | undefined>(() => undefined);
  const playAlong = usePlayAlong({
    active: playAlongActive, mode: playAlongPreference.mode, snapshot, plan, status: clockState?.status,
    bpm: clockState?.bpm ?? globalBpm, position: () => audiblePositionRef.current(), range: rangeSelection.active,
  });
  const playAlongFrameRef = useRef(playAlong.onFrame);
  playAlongFrameRef.current = playAlong.onFrame;
  function changePlayAlong(next: { readonly on?: boolean; readonly mode?: "exact" | "chord" }) {
    setPlayAlongPreference((current) => {
      const value = { on: next.on ?? current.on, mode: next.mode ?? current.mode };
      writePlayAlongPreference(value.on, value.mode);
      return value;
    });
  }
  const [timelineScale, setTimelineScale] = useState<8 | 12 | 16>(8);
  const [timelineInnerWidth, setTimelineInnerWidth] = useState(0);
  // P5.26.2-04: the whole-song navigator is moved by style (scroll and playback never re-render the view for it).
  const navigatorRef = useRef<HTMLDivElement>(null);
  const navigatorFrameRef = useRef<HTMLDivElement>(null);
  const navigatorHeadRef = useRef<HTMLDivElement>(null);
  const navigatorFillRef = useRef<HTMLSpanElement>(null);
  /** VL-14: the latest (beat, audio time) pair the transport reported. */
  const latestTransportRef = useRef<{ beat: number; time: number }>();
  // VL-14 measurement only: e2e test builds with `?vl14probe=1`; production never creates it.
  const vl14ProbeRef = useRef<Vl14Probe>();
  if (!vl14ProbeRef.current && import.meta.env.VITE_P527_E2E_FIXTURE === "1"
    && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("vl14probe")) {
    const probe: Vl14Probe = {
      frames: [], syncs: [], marks: [], effectStarts: [],
      reset() { this.frames = []; this.syncs = []; this.marks = []; this.effectStarts = []; },
    };
    vl14ProbeRef.current = probe;
    (window as unknown as { __vl14Probe?: Vl14Probe }).__vl14Probe = probe;
  }
  function vl14Mark(type: string) {
    const probe = vl14ProbeRef.current;
    if (probe) probe.marks.push({ type, at: performance.now(), contextTime: Tone.getContext().currentTime });
  }
  const [followEnabled, setFollowEnabled] = useState(true);
  const [followResumeRevision, setFollowResumeRevision] = useState(0);
  const [fingeringSwitch, setFingeringSwitch] = useState(true);
  // P25-16 N3 (3) / P25 V14: turning 運指 on fades the finger words in; turning it off fades them out first (120ms), so
  // they are still drawn while 「out」 runs. Only the switch starts this — a new chord, source or shape changes them at once.
  const [fingeringMotion, setFingeringMotion] = useState<"in" | "out">();
  const fingeringMotionTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(fingeringMotionTimer.current), []);
  const showFingering = fingeringSwitch || fingeringMotion === "out";
  const setShowFingering = (checked: boolean) => {
    clearTimeout(fingeringMotionTimer.current);
    setFingeringSwitch(checked);
    if (prefersReducedMotion()) { setFingeringMotion(undefined); return; }
    setFingeringMotion(checked ? "in" : "out");
    fingeringMotionTimer.current = setTimeout(() => setFingeringMotion(undefined), 120 + 40);
  };
  const [fingeringPreferences, setFingeringPreferences] = useState(loadFingeringPreferences);
  const fingeringRankerMode = useFingeringRankerMode();
  const fingeringOptions = useMemo(() => fingeringRankerMode === "E1-T"
    ? { costModel: p21ERankerCostModel() } : {}, [fingeringRankerMode]);
  const [fingeringChangeBaseline, setFingeringChangeBaseline] = useState<{ key: string; plan: ProgressionPracticeVoicingPlan | undefined; values: Map<string, string> }>();
  const [draftFingers, setDraftFingers] = useState<Readonly<Record<FingeringHand, readonly FingerNumber[]>>>({
    left: [],
    right: [],
  });
  const [fingeringEditorOpen, setFingeringEditorOpen] = useState(false);
  const [bulkSourceOpen, setBulkSourceOpen] = useState(false);
  const [referenceSoundEnabled, setReferenceSoundEnabled] = useState(true);
  const [auditionedIndex, setAuditionedIndex] = useState<number>();
  const [runtimeError, setRuntimeError] = useState<string>();
  const transportRef = useRef<ProgressionVoicingTransportPort>();
  const transportBarRef = useRef<HTMLElement>(null);
  useReserveBottomSpace(transportBarRef);
  const runtimeRequestRef = useRef(0);
  const auditionRequestRef = useRef(0);
  const boundarySessionUpdateRef = useRef(false);
  const clockStateRef = useRef(clockState);
  clockStateRef.current = clockState;
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
  const { audioState, prepareAudio, retryAudio } = useDojoMidi(progressionLoaded);

  useEffect(() => {
    const changedProgression = previousPreferenceId.current !== progressionPreferenceId;
    previousPreferenceId.current = progressionPreferenceId;
    let next = selection;
    if (changedProgression) {
      next = restoreVoicingSource(snapshots, initialSelection);
      // K7: restoring an old generated id may have written a shape.
      setGeneratedShape(readGeneratedShape());
    }
    else if (!lessonRulesSelected) next = availableVoicingSource(snapshots, selection);
    if (changedProgression) lastGeneratedSelection.current = next === "saved" || next === "source-midi" || next === "custom" ? "basic-full" : next;
    if (next !== selection) {
      closeGeneratedDetails();
      setSelection(next);
    }
  }, [initialSelection, lessonRulesSelected, progressionPreferenceId, selection, snapshots]);

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
      ? { ...createProgressionPracticeClockState(sourceSnapshot, { bpm: globalBpmRef.current, countInBars }),
          loopBounds: rangeBeatBounds(sourceSnapshot.events, rangeSelectionRef.current.active),
          anchorBeat: rangeBeatBounds(sourceSnapshot.events, rangeSelectionRef.current.active)?.startBeat ?? 0 }
      : undefined);
    return () => {
      runtimeRequestRef.current += 1;
      auditionRequestRef.current += 1;
      transport?.stop();
    };
  }, [countInBars, previewSound, sourceSnapshot]);

  // P23-06: the practice plays at the app-wide BPM. When it changes (here or in the header), the clock and the transport follow.
  useEffect(() => {
    if (!snapshot || !clockState || clockState.bpm === globalBpm) return;
    transportRef.current?.setBpm(globalBpm);
    setClockState((state) => state && state.bpm !== globalBpm
      ? reduceProgressionPracticeClock(snapshot, state, { type: "SET_BPM", bpm: globalBpm })
      : state);
  }, [globalBpm, snapshot, clockState]);

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
  const thenNextDegree = chordDegreeLabel(thenNextEvent?.chord, snapshot?.key);
  const currentResolution = plan?.events[currentIndex];
  const nextResolution = plan?.events[nextIndex];
  const currentDegree = chordDegreeLabel(currentEvent?.chord, snapshot?.key);
  const nextDegree = chordDegreeLabel(nextEvent?.chord, snapshot?.key);
  // P23-20 L3: the role of a chord in the key (T / SD / SDm / D); empty without a key.
  const roleByEventId = useMemo(() => {
    const roles = new Map<string, FunctionKind>();
    if (!snapshot?.events.length || !targetKey) return roles;
    const byKey = progressionFunctions(snapshot.events.map((event) => ({
      rootPc: event.chord.root,
      quality: event.chord.quality,
      tensions: event.chord.tensions,
      ...(event.chord.bass === undefined ? {} : { bassPc: event.chord.bass }),
    })), { tonicPc: targetKey.tonicPitchClass, mode: targetKey.mode });
    snapshot.events.forEach((event, index) => roles.set(event.id, byKey[index]?.kind ?? ""));
    return roles;
  }, [snapshot, targetKey]);
  const currentRole = currentEvent ? roleByEventId.get(currentEvent.id) ?? "" : "";
  const nextRole = nextEvent ? roleByEventId.get(nextEvent.id) ?? "" : "";
  const thenNextRole = thenNextEvent ? roleByEventId.get(thenNextEvent.id) ?? "" : "";
  const currentVoicing = currentResolution?.status === "SUPPORTED" ? currentResolution.voicing : undefined;
  const nextVoicing = nextResolution?.status === "SUPPORTED" ? nextResolution.voicing : undefined;
  const handAssignments = useMemo(
    () => assignPracticeHandsAcrossProgression(selection, plan?.events.map((resolution) =>
      resolution.status === "SUPPORTED" ? resolution.voicing : undefined) ?? []),
    [plan, selection],
  );
  const emptyHandTargets = { left: EMPTY_NOTES, right: EMPTY_NOTES };
  const currentHandTargets = handAssignments[currentIndex] ?? emptyHandTargets;
  const nextHandTargets = handAssignments[nextIndex] ?? emptyHandTargets;
  const thenNextHandTargets = handAssignments[thenNextIndex] ?? emptyHandTargets;
  const fingeringBpm = clockState?.bpm ?? snapshot?.bpm;
  const leftFingeringById = useMemo(
    () => new Map(rankFingeringsForHand(snapshot, handAssignments, selection, "left", fingeringPreferences, fingeringOptions, plan?.events.map(event => event.status !== "SUPPORTED"), fingeringBpm).map((entry) => [entry.id, entry])),
    [fingeringBpm, fingeringOptions, fingeringPreferences, handAssignments, plan, selection, snapshot],
  );
  const rightFingeringById = useMemo(
    () => new Map(rankFingeringsForHand(snapshot, handAssignments, selection, "right", fingeringPreferences, fingeringOptions, plan?.events.map(event => event.status !== "SUPPORTED"), fingeringBpm).map((entry) => [entry.id, entry])),
    [fingeringBpm, fingeringOptions, fingeringPreferences, handAssignments, plan, selection, snapshot],
  );
  const adjustedFingeringIds = new Set<string>();
  if (fingeringChangeBaseline?.key === `${candidateSessionKey}:${fingeringRankerMode}:${fingeringBpm}` && fingeringChangeBaseline.plan === plan) {
    for (const [hand, entries] of [["left", leftFingeringById], ["right", rightFingeringById]] as const) {
      for (const [id, entry] of entries) {
        if (entry.status !== "supported" || findPersonalFingering(fingeringPreferences, entry.signature)) continue;
        const prior = fingeringChangeBaseline?.values.get(`${hand}:${id}`);
        if (prior !== undefined && prior !== entry.fingers.join()) adjustedFingeringIds.add(id);
      }
    }
  }
  function captureFingeringBaseline() {
    setFingeringChangeBaseline({ key: `${candidateSessionKey}:${fingeringRankerMode}:${fingeringBpm}`, plan, values: new Map(
      [...[...leftFingeringById.values()].map(entry => ["left", entry] as const),
        ...[...rightFingeringById.values()].map(entry => ["right", entry] as const)]
        .flatMap(([hand, entry]) => entry.status === "supported" ? [[`${hand}:${entry.id}`, entry.fingers.join()] as const] : []),
    ) });
  }
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
  // P23-20 L5: the repeated stretch of the strip, in pixels (the cards are laid out by beat from the left).
  const rangeBand = selectedRangeBounds ? {
    left: selectedRangeBounds.startBeat * timelinePixelsPerBeat,
    width: Math.max(0, (selectedRangeBounds.endBeat - selectedRangeBounds.startBeat) * timelinePixelsPerBeat),
  } : undefined;
  /** Moves the navigator's frame to the viewport's place (style only). Hidden while the whole song already fits. */
  function syncNavigator() {
    const viewport = timelineViewportRef.current;
    const frame = navigatorFrameRef.current;
    const box = navigatorRef.current;
    if (!viewport || !frame || !box) return;
    const total = viewport.scrollWidth;
    box.style.visibility = total > viewport.clientWidth + 1 ? "visible" : "hidden";
    frame.style.left = `${total > 0 ? viewport.scrollLeft / total * 100 : 0}%`;
    frame.style.width = `${total > 0 ? Math.min(100, viewport.clientWidth / total * 100) : 100}%`;
  }
  useLayoutEffect(() => { syncNavigator(); }, [timelinePixelsPerBeat, snapshot?.lengthBeats, timelineInnerWidth, effectiveTimelineScale, snapshot]);
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
    const request = runtimeRequestRef.current;
    vl14ProbeRef.current?.effectStarts.push({ at: performance.now(), transportBeat: state.transportBeat, status: state.status, bpm: state.bpm });
    /** VL-14: the sound's position — the last (beat, audio time) pair advanced by the audio clock. */
    const soundBeat = () => {
      const pair = latestTransportRef.current;
      if (!pair) return { beat: state.transportBeat, audioNow: Number.NaN };
      const context = Tone.getContext();
      const raw = context.rawContext as AudioContext;
      const stamp = typeof raw.getOutputTimestamp === "function" ? raw.getOutputTimestamp() : undefined;
      const nowAudio = stamp?.contextTime ?? context.currentTime;
      const outputLatency = stamp ? raw.outputLatency ?? 0 : 0;
      const spb = 60 / (state.bpm || 120);
      const ahead = (nowAudio - (pair.time - outputLatency)) / spb;
      return { beat: pair.beat + Math.min(PROGRESSION_PAINT_MAX_EXTRAPOLATION_BEATS, Math.max(0, ahead)), audioNow: nowAudio };
    };
    audiblePositionRef.current = () => {
      const heard = projectProgressionPracticeClock(snapshot, { ...state, transportBeat: soundBeat().beat });
      return { spanIndex: heard.currentSpanIndex, loop: heard.loopCount, inCountIn: heard.inCountIn };
    };
    const paint = (absoluteBeat: number, audioNow: number) => {
      const position = projectProgressionPracticeClock(snapshot, { ...state, transportBeat: absoluteBeat });
      // P25-11 I3-1: a reference comparison only; a card change is applied outside the frame.
      playAlongFrameRef.current({ spanIndex: position.currentSpanIndex, loop: position.loopCount, inCountIn: position.inCountIn });
      vl14ProbeRef.current?.frames.push({ at: performance.now(), absoluteBeat, transportBeat: state.transportBeat, progressionBeat: position.progressionBeat, status: state.status, audioNow });
      const playheadPx = position.progressionBeat * timelinePixelsPerBeat;
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${playheadPx}px)`;
      // VL-13 B: the fill and the head are the same value, so the fill moves every frame too.
      const playedFraction = Math.min(1, Math.max(0, position.progressionBeat / Math.max(1, snapshot.lengthBeats)));
      if (navigatorHeadRef.current) navigatorHeadRef.current.style.left = `${playedFraction * 100}%`;
      if (navigatorFillRef.current) navigatorFillRef.current.style.width = `${playedFraction * 100}%`;
      if (currentProgressRef.current) currentProgressRef.current.style.width = `${position.chordProgress * 100}%`;
      const viewport = timelineViewportRef.current;
      if (followEnabledRef.current && viewport && state.status === "running" && pageTurnFrameRef.current === undefined) {
        const target = playheadSafetyTarget(playheadPx, viewport.clientWidth, viewport.scrollLeft,
          snapshot.lengthBeats * timelinePixelsPerBeat);
        if (target !== undefined) animateTimelinePageTurn(target, position.currentSpanIndex);
      }
    };
    paint(soundBeat().beat, soundBeat().audioNow);
    if (state.status !== "running" && state.status !== "count-in" || typeof requestAnimationFrame !== "function") return;
    let frame = 0;
    const tick = () => {
      if (request !== runtimeRequestRef.current) return;
      const sound = soundBeat();
      paint(sound.beat, sound.audioNow);
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
  function closeGeneratedDetails() {
    if (generatedDetailsRef.current) generatedDetailsRef.current.open = false;
  }

  function changeSelection(next: ProgressionVoicingSelection) {
    closeGeneratedDetails();
    runtimeRequestRef.current += 1;
    auditionRequestRef.current += 1;
    transportRef.current?.stop();
    setSelection(next);
    if (next !== "saved" && next !== "source-midi" && next !== "custom") lastGeneratedSelection.current = next;
    rememberVoicingSource(snapshots, next);
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
    vl14Mark("start");
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
        onTransportBeat(absoluteBeat, audioTime) {
          const at = performance.now();
          const context = Tone.getContext();
          const raw = context.rawContext as AudioContext;
          if (runtimeRequestRef.current !== request) {
            vl14ProbeRef.current?.syncs.push({ at, beat: absoluteBeat, time: audioTime, before: Number.NaN, after: Number.NaN, statusBefore: "?", statusAfter: "?", lookAhead: context.lookAhead, contextTime: context.currentTime, outputLatency: raw.outputLatency ?? 0, dropped: "request" });
            return;
          }
          // Keep the pair even while the clock is paused: the paint reads it.
          // Syncs from a stopped runtime epoch must not feed it (VL-07: the
          // playhead returns to 0 on stop).
          latestTransportRef.current = { beat: absoluteBeat, time: audioTime };
          setClockState((state) => {
            if (!state) return state;
            const next = reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat });
            vl14ProbeRef.current?.syncs.push({ at, beat: absoluteBeat, time: audioTime, before: state.transportBeat, after: next.transportBeat, statusBefore: state.status, statusAfter: next.status, lookAhead: context.lookAhead, contextTime: context.currentTime, outputLatency: raw.outputLatency ?? 0 });
            return next;
          });
        },
      });
    } catch {
      if (runtimeRequestRef.current !== request) return;
      latestTransportRef.current = undefined;
      transportRef.current?.stop();
      setClockState((state) => state
        ? reduceProgressionPracticeClock(snapshot, state, { type: "STOP" })
        : state);
      setRuntimeError(text.playbackErrorBody);
    }
  }

  function seekToEvent(eventIndex: number, origin: TimelineSeekOrigin = "keyboard") {
    if (!snapshot || !clockState || !snapshot.events[eventIndex]) return;
    vl14Mark("seek");
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
    // Range editing hands focus to the timeline, where Space is a transport command.
    // Ordinary focused buttons retain their native Space activation contract.
    timelineViewportRef.current?.focus({ preventScroll: true });
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

  function markRangeFromTimeline(event: MouseEvent<HTMLElement>, surface: "overview" | "ruler") {
    event.preventDefault();
    event.stopPropagation();
    if (!snapshot || !timelineViewportRef.current) return;
    const viewport = timelineViewportRef.current;
    const rect = surface === "overview" ? event.currentTarget.getBoundingClientRect() : viewport.getBoundingClientRect();
    const beat = timelineBeatAtPointer(event.clientX,
      rect.left - (surface === "ruler" ? viewport.scrollLeft : 0),
      surface === "overview" ? rect.width / snapshot.lengthBeats : timelinePixelsPerBeat,
      snapshot.lengthBeats);
    if (beat === undefined) return;
    const cardIndex = chordIndexAtTimelineBeat(snapshot, beat);
    if (cardIndex !== undefined) markRangeCard(cardIndex, event.shiftKey);
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
    vl14Mark("pause");
    const pausedRuntime = transportRef.current?.pause() ?? false;
    if (!pausedRuntime) runtimeRequestRef.current += 1;
    // P24-01 H-3: a pause in the middle of a card puts the playhead, the whole band and the
    // resume point on the head of the card that was sounding. A rest card has a head too (the instruction
    // says so), so the target is the card span at the playhead, not the nearest chord event.
    const beforePause = clockStateRef.current;
    const pauseBeat = pausedRuntime && beforePause?.status === "running"
      ? projectProgressionPracticeClock(snapshot, beforePause).progressionBeat
      : undefined;
    const soundingSpan = pauseBeat === undefined ? undefined
      : snapshot.spans.find((span) => pauseBeat >= span.startBeat
          && pauseBeat < span.startBeat + span.durationBeats)
        ?? [...snapshot.spans].reverse().find((span) => span.startBeat <= pauseBeat);
    // `transport.seekBeat` only moves the position while paused: it does not attack the card.
    const moved = soundingSpan === undefined ? undefined : transportRef.current?.seekBeat?.(soundingSpan.startBeat);
    setClockState((state) => {
      if (!state) return state;
      if (moved && soundingSpan !== undefined) {
        return reduceProgressionPracticeClock(snapshot, state, {
          type: "SEEK", status: moved.status, absoluteBeat: moved.absoluteBeat,
          anchorBeat: soundingSpan.startBeat,
        });
      }
      return reduceProgressionPracticeClock(snapshot, state, { type: "PAUSE" });
    });
  }

  async function resume() {
    if (!snapshot || !clockState) return;
    vl14Mark("resume");
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

  function togglePlayback() {
    prepareAudio();
    if (active) pause();
    else if (paused) void resume();
    else void start();
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
    latestTransportRef.current = undefined;
    transportRef.current?.stop();
    setClockState((state) => state
      ? reduceProgressionPracticeClock(snapshot, state, { type: "STOP" })
      : state);
    setRuntimeError(text.playbackErrorBody);
  }

  function stop() {
    if (!snapshot) return;
    // VL-14: drop the last (beat, audio time) pair so the paint falls back to the
    // clock state and the playhead returns to 0 with the transport.
    latestTransportRef.current = undefined;
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
      latestTransportRef.current = undefined;
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
    captureFingeringBaseline();
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
    captureFingeringBaseline();
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
      if (event.defaultPrevented || event.isComposing || !progressionLoaded || !snapshot || bulkSourceOpen || fingeringEditorOpen) return;      const target = event.target;
      if (target === timelineViewportRef.current && ["ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].includes(event.key)) return;
      if (target instanceof Element && target.closest("input, select, textarea, [contenteditable], [role='textbox'], [role='dialog'], [role='combobox'], [role='listbox']")) return;
      const key = event.key.toLowerCase();
      if (!["arrowleft", "arrowright", "home", "end", "f", "m", "r", "escape"].includes(key)) return;
      event.preventDefault();
      if (key === "escape") {
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

  // P25 V25-8: Space starts / pauses wherever the focus is (a button, a card, a switch, the keys, the 「形 ▼」 menu),
  // except inside a text field and while the fingering editor or the bulk-source window is open. It is taken in the
  // capture phase, so the focused button is not pressed by it (a button is pressed by the Space key-up, which is
  // swallowed too); Enter still presses the button. The listeners are registered once; the latest `togglePlayback`
  // lives in a ref, so a re-render (many while playing) never drops a press.
  const spaceLatest = useRef({ togglePlayback, active: false });
  spaceLatest.current = { togglePlayback, active: progressionLoaded && Boolean(snapshot) && !bulkSourceOpen && !fingeringEditorOpen };
  useEffect(() => {
    let swallowed = false;
    const inText = (node: EventTarget | null) => node instanceof Element
      && node.closest("input, textarea, select, [contenteditable], [role='textbox'], [role='combobox']") !== null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!spaceLatest.current.active || event.isComposing || inText(event.target) || inText(document.activeElement)) return;
      event.preventDefault();
      event.stopPropagation();
      swallowed = true;
      if (!event.repeat) spaceLatest.current.togglePlayback();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== " " || !swallowed) return;
      swallowed = false;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
    };
  }, []);

  if (!progressionLoaded) {
    return (
      <VoicingLoopPicker
        text={text}
        candidates={vaultProgressions}
        sections={pickerSections}
        results={pickerSearchResults}
        query={query}
        trimmedQuery={trimmedQuery}
        onQueryChange={(value) => { setQuery(value); setFavoriteNotice(undefined); }}
        favoriteOf={pickerFavorite}
        onToggleFavorite={togglePickerFavorite}
        favoriteCount={pickerFavoriteCount}
        favoriteNotice={favoriteNotice}
        lastPractice={readLastVoicingPractice()}
        onPractice={chooseProgression}
        onOpenInVault={(reference) => onOpenInVault?.(reference)}
        onEnterText={onEnterText}
        onImportMidi={onImportMidi}
        sound={previewSound}
        onPreviewError={(error) => setRuntimeError(error instanceof Error ? error.message : "試聴できませんでした")}
        showDegrees={showDegrees}
        onPrepareAudio={prepareAudio}
      />
    );
  }

  // P23-32 T2: the practice's head — the picker row's title, and the key/bars of the progression.
  const practiceCandidate = snapshot?.source?.kind === "vault"
    ? vaultProgressions.find((candidate) => candidate.sourceReference.ideaId === snapshot.source.reference.ideaId
      && candidate.sourceReference.blockId === snapshot.source.reference.blockId)
    : undefined;
  const practiceFacts = snapshot
    ? `${snapshot.key ? (displayChordLabel(displayKey(snapshot.key) ?? "")) : "キー未設定"} ・ ${Math.ceil(snapshot.lengthBeats / snapshot.meter.numerator)} 小節`
    : undefined;
  // P25-16 N4: 「MIDI 未接続」 sits after the key and bars (it used to be in the band at the bottom). The low window's
  // inline copy keeps the words too (its key and bars are hidden there); only the head's copy carries the test id.
  const practiceHead = (inline: boolean) => (
    <>
      {onBackToPicker ? <button type="button" className="lv-vl-back" data-testid="voicing-loop-back" aria-label="練習する進行へ戻る" onClick={onBackToPicker}>‹ <span className="lv-vl-back-label">練習する進行</span></button> : null}
      {practiceCandidate?.title ? <b className="lv-vl-head-title">{practiceCandidate.title}</b> : null}
      {practiceFacts ? <span className="lv-vl-head-facts">{practiceFacts}</span> : null}
      {!midiConnection.connected ? <span className="lv-vl-head-no-midi text-amber-200" data-testid={inline ? undefined : "voicing-loop-play-along-no-midi"}
        title={"MIDI 鍵盤がつながっていません。弾き合わせは、つなぐと使えます"}>{practiceFacts && !inline ? "・ MIDI 未接続" : "MIDI 未接続"}</span> : null}
    </>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-[7px] overflow-x-hidden overflow-y-auto" data-testid="voicing-loop-workspace"
      data-fingering-motion={fingeringMotion}
      data-midi-audio={audioState} onPointerDownCapture={prepareAudio}>
      {/* P23-32 T2: the head row (the low-window form is inside the controls row below). */}
      <div className="lv-vl-head" data-testid="voicing-loop-head">{practiceHead(false)}</div>
      {audioState === "error" ? (
        <div data-testid="voicing-loop-midi-audio-error">
          <StatusMessage
            tone="warning"
            title="入力のピアノ音を開始できませんでした"
            action={<Button size="sm" variant="secondary" onClick={retryAudio}>入力音をもう一度</Button>}
          >
            入力の判定は続けられます。
          </StatusMessage>
        </div>
      ) : null}
      <Surface className="lv-vl-controls shrink-0" data-testid="voicing-loop-controls">
        <div className="lv-vl-controls-row flex min-w-0 items-center gap-x-3 whitespace-nowrap" data-testid="voicing-loop-controls-row">
          {/* P23-32 T3: in a low window the head moves to the start of this row. */}
          <span className="lv-vl-head-inline">{practiceHead(true)}</span>
          <fieldset className="flex items-center gap-2" aria-describedby="voicing-loop-source-help" data-testid="voicing-loop-source-group">
            <legend className="lv-section-kicker mr-1 float-left">{text.sourceGroup}</legend>
            <p id="voicing-loop-source-help" className="sr-only">{text.sourceHelp}</p>
            <span className="lv-vl-seg">
            {sourceSelections.filter(item => item.id !== "saved" || !duplicateSavedSource).map((item) => {
              const generated = item.id === "basic-full";
              const coverage = generated ? undefined : sourceCoverage(snapshots, item.id);
              const unavailable = coverage?.available === 0;
              const pressed = generated ? lessonRulesSelected : selection === item.id && !unavailable;
              return (
                <Button key={item.id} size="sm" variant="secondary" className={`lv-choice ${unavailable ? "opacity-50" : ""}`}
                  aria-label={item.ja} aria-pressed={pressed} disabled={unavailable} aria-disabled={unavailable || undefined}
                  aria-description={unavailable ? `この進行には${item.ja}のVoicingがありません。自動生成または利用可能な音を選んでください。` : coverage ? `${coverage.available}/${coverage.total}コードで利用できます` : undefined}
                  title={unavailable ? `この進行には${item.ja}のVoicingがありません。` : undefined}
                  onClick={() => {
                    const generatedSelection = snapshots?.[lastGeneratedSelection.current] ? lastGeneratedSelection.current : "basic-full";
                    changeSelection(generated ? generatedSelection : item.id);
                  }}>
                  {item.ja}
                  {coverage && coverage.available < coverage.total ? <span className="text-[10px]" data-testid={`voicing-loop-${item.id}-availability`}>{coverage.available}/{coverage.total}</span> : null}
                </Button>
              );
            })}
            </span>
          </fieldset>
          {/* P23-32 T3: the study axis sits next to the source group (the same order on one line), outside the
              「音の出どころ」 fieldset so a narrow pane can wrap it onto its own line. */}
          <div className="flex shrink-0 items-center gap-2" aria-describedby="voicing-loop-study-help" data-testid="voicing-loop-study-group">
            <p id="voicing-loop-study-help" className="sr-only">{text.studyHelp}</p>
            <ShapeMenu value={generatedShape} enabled={lessonRulesSelected}
              onChange={(next) => changeLessonModifier(() => { setGeneratedShape(next); rememberGeneratedShape(next); })}
              smooth={progressionOptimizationEnabled}
              onSmooth={(checked) => changeLessonModifier(() => setProgressionOptimizationEnabled(checked))} />
          </div>
          <span className="lv-vl-divider" aria-hidden="true" />
          <fieldset className="flex shrink-0 items-center gap-2" data-testid="voicing-loop-display-group">
            <legend className="lv-section-kicker mr-1 float-left">{text.displayGroup}</legend>
            <div ref={displayPickRef} className="lv-motion-pick flex min-w-0 flex-wrap gap-2" role="group" aria-label={text.displayMode}
              style={{ "--lv-pick-ring": "var(--lv-accent)", "--lv-pick-radius": "var(--lv-radius-control)" } as CSSProperties}>
              <Button size="sm" variant="secondary" className="lv-choice" title={text.learnTitle} aria-label={text.learn} aria-pressed={displayMode === "learn"} onClick={() => setDisplayMode("learn")}><CompactLabel text={text.learnShort} /></Button>
              <Button size="sm" variant="secondary" className="lv-choice" title={text.recallTitle} aria-label={text.recall} aria-pressed={displayMode === "recall"} onClick={() => setDisplayMode("recall")}><CompactLabel text={text.recallShort} /></Button>
            </div>
            <label className="lv-vl-switch" title={text.showFingering}>
              <Switch
                checked={fingeringSwitch}
                label={text.showFingering}
                onChange={(checked) => setShowFingering(checked)}
              />
              <span>{text.showFingeringShort}</span>
            </label>
          </fieldset>
        </div>
        {plan?.events.some(event => event.status === "SUPPORTED" && event.shapeFallback) ? (
          <p className="text-xs text-[var(--lv-text-secondary)]" role="status" data-testid="voicing-loop-shape-fallback-summary">
            {plan.events.filter(event => event.status === "SUPPORTED" && event.shapeFallback).length}コードは{studyCategory === "teacher" ? "基本" : "骨組み"}で代替
          </p>
        ) : null}
      </Surface>

      {!snapshot ? (
        <StatusMessage
          title={text.unavailable}
          tone="warning"
        >
          {text.unavailableBody}
        </StatusMessage>
      ) : (
        <>
          <div className="lv-vl-current-next min-w-0 shrink-0" data-testid="voicing-loop-current-next">
            <div className="lv-vl-current-next-grid grid min-h-0 min-w-0 gap-2">
              <Surface variant="primary" className="lv-vl-current-panel flex min-w-0 flex-col p-3" data-testid="voicing-loop-current-panel" aria-label={"現在のコード詳細"}>
                <div className="flex min-w-0 flex-1 flex-col overflow-y-clip" data-testid="voicing-loop-current-content" tabIndex={0} aria-label={"現在のコードの詳細"}>
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
                      <Button size="sm" variant="secondary" disabled={bulkSourcePreview.changed === 0} onClick={() => setBulkSourceOpen(true)}>
                        {"この進行を元の音に"}
                      </Button>
                    ) : null}
                    {/* P25 V6・V7: the button keeps its place (and the row its height) while it cannot be used. */}
                    {displayMode === "learn" && showFingering && (currentLeftFingering || currentRightFingering) ? (
                      <Button size="sm" variant="secondary" onClick={openFingeringEditor}>{text.editFingering}</Button>
                    ) : <Button size="sm" variant="secondary" className="invisible" aria-hidden="true" tabIndex={-1} disabled>{text.editFingering}</Button>}
                  </div>
                </div>
                <div className="mt-1 flex min-w-0 items-baseline gap-3">
                  <h2 className="lv-vl-current-chord min-w-0 truncate whitespace-nowrap font-bold tracking-tight text-[var(--lv-text)]" title={currentEvent ? displayChordLabel(currentEvent.chord.label) : restLabel}>
                    {currentEvent ? <ChordName label={currentEvent.chord.label} /> : restLabel}
                  </h2>
                  {currentDegree || currentRole ? <DegreeTag degree={currentDegree} role={currentRole} showDegree={showDegrees}
                    size="lg" testId="voicing-loop-current-degree" roleTestId="voicing-loop-current-role" /> : null}
                </div>
                <p className="sr-only" aria-live="polite" aria-atomic="true">{currentEvent ? displayChordLabel(currentEvent.chord.label) : restLabel}</p>
                <div className="mt-1 h-1 overflow-hidden rounded bg-[var(--lv-border)]" aria-hidden="true">
                  <div ref={currentProgressRef} data-testid="voicing-loop-current-progress" className="h-full bg-[var(--lv-accent)]" style={{ width: `${Math.round((projection?.chordProgress ?? 0) * 100)}%` }} />
                </div>
                {/* P25 V7: 覚える / 思い出す share one place. 思い出す keeps the hands' height (an empty copy, no notes) and
                    shows the dashed 「思い出して弾く」 frame over it (見本 Motion.dc.html の 4). */}
                <div className="lv-vl-hands-stack mt-1 grid min-w-0 flex-1" data-testid="voicing-loop-current-hands">
                  <Presence show={displayMode === "learn" && Boolean(currentVoicing)} exitMs={180}
                    after={currentVoicing ? <div aria-hidden="true" className="invisible grid min-w-0 grid-cols-2 gap-2">
                      {(["left", "right"] as const).map((hand) => <HandVoicingSummary key={hand} accidentalStyle={accidentalStyle} hand={hand} isPersonal={false}
                        pitches={EMPTY_NOTES} text={text} voicing={currentVoicing} showFingering={showFingering} reserveBadge />)}
                    </div> : null}>{(presence) => currentVoicing ? (
                    <div className="lv-motion-swap grid min-w-0 grid-cols-2 gap-2" data-testid="voicing-loop-current-voicing"
                      data-presence={presence.state} onTransitionEnd={presence.onTransitionEnd}>
                      <HandVoicingSummary accidentalStyle={accidentalStyle} fingering={currentLeftFingering}
                        hand="left" isPersonal={Boolean(currentLeftPersonal)} pitches={currentHandTargets.left}
                        root={currentEvent?.chord.root} text={text} voicing={currentVoicing} showFingering={showFingering} reserveBadge />
                      <HandVoicingSummary accidentalStyle={accidentalStyle} fingering={currentRightFingering}
                        hand="right" isPersonal={Boolean(currentRightPersonal)} pitches={currentHandTargets.right}
                        root={currentEvent?.chord.root} text={text} voicing={currentVoicing} showFingering={showFingering} reserveBadge />
                    </div>
                  ) : null}</Presence>
                  <Presence show={displayMode === "recall" && Boolean(currentVoicing)} exitMs={180}>{(presence) => (
                    <div className="lv-motion-swap lv-vl-recall-box" data-testid="voicing-loop-current-recall"
                      data-presence={presence.state} onTransitionEnd={presence.onTransitionEnd}>
                      {playAlongActive ? "思い出して弾く(押した音だけ、合っているか違うかが出ます)" : "思い出して弾く"}
                    </div>
                  )}</Presence>
                </div>
                {currentVoicing && !isPracticeHandAssignmentPlayable(currentVoicing.midiNotes, currentHandTargets) ? (
                  <p role="status" className="mt-2 text-xs text-amber-200" data-testid="voicing-loop-hand-assignment-unavailable">
                    {"左右各5音以内で全音を分けられないため、運指を表示できません。元の音は変更されません。"}
                  </p>
                ) : null}
                {/* P25 V6・V7: the explanation row is always one line (empty when there is nothing to say) and 「次への動き」
                    keeps its place while 運指 is off or 思い出す hides it. */}
                <Presence show={displayMode === "learn"} exitMs={180} after={<div aria-hidden="true" className="flex min-w-0 flex-col">
                  {currentVoicing ? <div className="lv-vl-explanation" /> : null}<div className="lv-vl-move relative mt-1 min-w-0 shrink-0" />
                </div>}>{(presence) => (
                  <div className="lv-motion-swap flex min-w-0 flex-col" data-presence={presence.state} data-testid="voicing-loop-current-learn" onTransitionEnd={presence.onTransitionEnd}>
                    {currentVoicing ? (
                      <CurrentRuleExplanation explanation={currentVoicing.explanation}
                        onNextCandidate={() => changeCurrentCandidate(1)} onPreviousCandidate={() => changeCurrentCandidate(-1)} text={text} />
                    ) : null}
                    {showFingering ? (
                      <NextMovePreview moves={nextMoves} hasNext={Boolean(currentVoicing && nextVoicing)}
                        loopWrap={nextIndex <= currentIndex} accidentalStyle={accidentalStyle} />
                    ) : <div aria-hidden="true" className="lv-vl-move relative mt-1 min-w-0 shrink-0" />}
                  </div>
                )}</Presence>
                </div>
              </Surface>
              <div className="lv-vl-next-column flex min-h-0 min-w-0 flex-col gap-2">
                <Surface className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3" data-testid="voicing-loop-next-panel" aria-label={"次のコード詳細"}>
                  <div className="min-h-0 min-w-0 flex-1" tabIndex={0}
                    aria-label={"次のコードの詳細"}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="lv-section-kicker">{text.next}</p>
                    <span className="text-xs font-semibold text-[var(--lv-text-muted)]" data-testid="voicing-loop-next-wait">
                      {remainingBeatsLabel(nextWaitBeats)}
                    </span>
                  </div>
                  <div className="mt-2 flex min-w-0 items-baseline gap-2">
                    <p className="lv-vl-next-chord min-w-0 truncate whitespace-nowrap font-bold text-[var(--lv-text)]" title={nextEvent ? displayChordLabel(nextEvent.chord.label) : restLabel}>{nextEvent ? displayChordLabel(nextEvent.chord.label) : restLabel}</p>
                    {nextDegree || nextRole ? <DegreeTag degree={nextDegree} role={nextRole} showDegree={showDegrees}
                      size="sm" testId="voicing-loop-next-degree" roleTestId="voicing-loop-next-role" /> : null}
                  </div>
                  {displayMode === "learn" && nextVoicing ? (
                    <div className="mt-2 grid grid-cols-2 gap-2" data-testid="voicing-loop-next-voicing">
                      <CompactHandVoicing accidentalStyle={accidentalStyle} fingering={nextLeftFingering} hand="left"
                        pitches={nextHandTargets.left} root={nextEvent?.chord.root} showFingering={showFingering} text={text} voicing={nextVoicing} />
                      <CompactHandVoicing accidentalStyle={accidentalStyle} fingering={nextRightFingering} hand="right"
                        pitches={nextHandTargets.right} root={nextEvent?.chord.root} showFingering={showFingering} text={text} voicing={nextVoicing} />
                    </div>
                  ) : nextVoicing ? (
                    // P25 V7: 思い出す keeps the place of the next hands (an empty copy, no notes).
                    <div aria-hidden="true" className="invisible mt-2 grid grid-cols-2 gap-2">
                      {(["left", "right"] as const).map((hand) => <CompactHandVoicing key={hand} accidentalStyle={accidentalStyle} hand={hand}
                        pitches={EMPTY_NOTES} showFingering={showFingering} text={text} voicing={nextVoicing} />)}
                    </div>
                  ) : null}
                  </div>
                  {/* P24-01 H-1: the next shape is an answer, so Recall keeps only the name, the
                      degree/role badges and the "then next" line. */}
                  {displayMode === "learn" ? (
                    <NextShapePreview hands={nextHandTargets} nextVoicing={nextVoicing}
                      leftFingering={nextLeftFingering} rightFingering={nextRightFingering}
                      chordLabel={nextEvent ? displayChordLabel(nextEvent.chord.label) : restLabel} accidentalStyle={accidentalStyle} />
                  ) : <div aria-hidden="true" className="mt-2 h-[72px] min-h-[72px] shrink-0" />}
                  {/* P23-32 P6: 「その次」 is the last thing in the next panel. */}
                  <div data-testid="voicing-loop-then-next" className="lv-vl-then">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="lv-section-kicker">{"その次"}</span>
                      <strong className="min-w-0 truncate whitespace-nowrap text-lg text-[var(--lv-text)]" title={thenNextEvent ? displayChordLabel(thenNextEvent.chord.label) : restLabel}>{thenNextEvent ? displayChordLabel(thenNextEvent.chord.label) : restLabel}</strong>
                      {thenNextDegree || thenNextRole ? <DegreeTag degree={thenNextDegree} role={thenNextRole} showDegree={showDegrees}
                        size="xs" testId="voicing-loop-then-next-degree" roleTestId="voicing-loop-then-next-role" /> : null}
                    </div>
                    {/* P25 V6・V7: the line keeps its place while 運指 is off or 思い出す hides it. */}
                    {!(displayMode === "learn" && showFingering) ? <div aria-hidden="true" className="lv-vl-then-fingering mt-1 text-xs">{"\u00a0"}</div> : null}
                    {displayMode === "learn" && showFingering ? (
                      <div className="lv-vl-then-fingering mt-1 flex min-w-0 gap-x-4 overflow-hidden whitespace-nowrap text-xs text-[var(--lv-text-secondary)]">
                        <span>{text.leftHandDisplay}: <strong className="text-amber-200">{fingerSummary(effectiveFingering(thenNextEvent ? leftFingeringById.get(thenNextEvent.id) : undefined, fingeringPreferences), "L", thenNextHandTargets.left.length, text.fingeringUnavailable)}</strong></span>
                        <span>{text.rightHandDisplay}: <strong className="text-cyan-200">{fingerSummary(effectiveFingering(thenNextEvent ? rightFingeringById.get(thenNextEvent.id) : undefined, fingeringPreferences), "R", thenNextHandTargets.right.length, text.fingeringUnavailable)}</strong></span>
                      </div>
                    ) : null}
                  </div>
                </Surface>
              </div>
            </div>
          </div>

          <Surface className="lv-vl-timeline lv-vl-timeline-frame min-w-0 shrink-0 overflow-hidden px-2 py-1.5" aria-label={text.timeline} data-testid="voicing-loop-timeline">
            <div className="lv-vl-timeline-head flex min-w-0 items-center justify-between gap-3 px-1 text-[10px]" data-play-along={playAlongActive ? "on" : undefined}>
              <span className="font-bold tracking-[0.1em] text-[var(--lv-text-secondary)]">{text.timeline}</span>
              <div className="flex items-center gap-2" data-testid="voicing-loop-status">
                <Metric compact hideLabel label={"コード"} testId="voicing-loop-position-metric" value={`${currentIndex + 1} / ${snapshot.events.length}`} />
                <Metric compact label={text.loop} value={text.loopLabel(projection?.loopCount ?? 0)} />
                {/* P25 V10: 「達成 n/8」 always keeps its place (empty while 弾き合わせ is off) and only fades. */}
                <span className="lv-motion-fade inline-flex" data-shown={playAlongActive} aria-hidden={!playAlongActive || undefined}>
                  <Metric compact label={"達成"} title={"この周で、そろったカードの数"} testId="voicing-loop-play-along-count" value={`${playAlong.count.hit}/${playAlong.count.total}`} />
                </span>
                {rangeSelection.active ? <button type="button" data-testid="voicing-loop-range-chip"
                  className="rounded border border-[var(--lv-vl-range)] px-1.5 py-0.5 text-[var(--lv-vl-range)]"
                  title={"区間を解除(区間の中を右クリックでも外せます)"}
                  aria-label={`区間ループ ${rangeSelection.active.first + 1}〜${rangeSelection.active.last + 1} を解除`}
                  onClick={clearRange}>{`区間 ${rangeSelection.active.first + 1}〜${rangeSelection.active.last + 1} `}<span aria-hidden="true">×</span></button> : null}
                {rangeSelection.pendingStart !== undefined ? <span data-testid="voicing-loop-range-pending"
                  className="inline-flex items-center gap-1 text-[var(--lv-vl-range)]">{`ここから ${rangeSelection.pendingStart + 1}`}
                  <button type="button" data-testid="voicing-loop-range-clear" aria-label="区間の始まりを取り消す" title="区間の始まりを取り消す"
                    className="rounded px-1 leading-none text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)]" onClick={clearRange}>×</button>
                </span> : null}
              </div>
              <TimelineNavigator containerRef={navigatorRef} frameRef={navigatorFrameRef} headRef={navigatorHeadRef}
                testId="voicing-loop-navigator" label={"進行の全体図：表示範囲と再生位置"}
                onSeek={(fraction) => seekToBeat(fraction * snapshot.lengthBeats, "overview")}
                onMoveWindow={(left) => {
                  const viewport = timelineViewportRef.current;
                  if (!viewport) return;
                  setTimelineManual("pointer");
                  viewport.scrollLeft = left * viewport.scrollWidth;
                }}>
                <span ref={navigatorFillRef} aria-hidden="true" data-testid="voicing-loop-navigator-fill"
                  className="lv-vl-progress-done absolute inset-y-0 left-0 opacity-70" style={{ width: "0%" }} />
              </TimelineNavigator>
              <div className="flex items-center gap-1 text-[var(--lv-text-muted)]">
                <button type="button" className={`rounded px-1.5 py-0.5 ${followEnabled ? "text-[var(--lv-accent)]" : "text-amber-200"}`}
                  aria-pressed={followEnabled} onClick={() => resumeTimelineFollow(true)} data-testid="voicing-loop-follow">{followEnabled ? "追従" : "手動 · F"}</button>
                <span className="lv-vl-source-meter" data-testid="voicing-loop-source-meter" title={`元の拍子 ${snapshot.meter.numerator}/${snapshot.meter.denominator}`}>{"元の拍子"} {snapshot.meter.numerator}/{snapshot.meter.denominator}</span>
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
              className="lv-vl-timeline-viewport min-w-0 overflow-x-auto overflow-y-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)]"
              data-testid="voicing-loop-timeline-viewport"
              onScroll={syncNavigator}
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
              onClick={seekFromOverviewClick} onContextMenu={(event) => markRangeFromTimeline(event, "overview")} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); seekToBeat((projection?.progressionBeat ?? 0), "overview"); } }}>
              {Array.from({ length: totalGroups }, (_, index) => (
                <span key={index} className={`h-full flex-1 border-r border-[var(--lv-bg)] ${index < currentGroup - 1 ? "lv-vl-progress-done" : index === currentGroup - 1 ? "bg-[var(--lv-accent)]" : "bg-slate-700"}`} />
              ))}
                </div>
                <div className="flex h-5 cursor-pointer border-b border-[var(--lv-border)] text-[10px] text-[var(--lv-text-muted)]" data-testid="voicing-loop-ruler"
                  role="button" tabIndex={0} aria-label={"目盛りから移動"}
                  onClick={seekFromTimelineClick} onContextMenu={(event) => markRangeFromTimeline(event, "ruler")} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); seekToBeat(projection?.progressionBeat ?? 0, "ruler"); } }}>
                  {Array.from({ length: totalGroups }, (_, index) => (
                    <span key={index} className="shrink-0 border-l border-[var(--lv-border)] pl-1" style={{ width: `${Math.min(practiceGroupBeats, snapshot.lengthBeats - index * practiceGroupBeats) * timelinePixelsPerBeat}px` }}>{index + 1}</span>
                  ))}
                </div>
                <div className="relative flex gap-0 py-1">
                {rangeBand ? (
                  <span aria-hidden="true" data-testid="voicing-loop-range-band"
                    className="pointer-events-none absolute top-0 z-20 h-1 rounded-full bg-[var(--lv-vl-range)]"
                    style={{ left: `${rangeBand.left}px`, width: `${rangeBand.width}px` }} />
                ) : null}
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
                  const autoFallback = resolution?.status === "SUPPORTED" && Boolean(resolution.fallbackFrom || resolution.shapeFallback || resolution.autoFallbackTitle);
                  const autoFallbackDescription = resolution?.status === "SUPPORTED" && resolution.autoFallbackTitle
                    ? resolution.autoFallbackTitle
                    : resolution?.status === "SUPPORTED" && resolution.shapeFallback
                    ? `この形では作れないため「${resolution.shapeFallback.study === "teacher" ? "基本" : "骨組み"}」で鳴らしています`
                    : "代わりの形で鳴らしています";
                  const cardNote = resolution?.status === "SUPPORTED" ? resolution.cardNote : undefined;
                  // P25-11 I5: this loop's ✓ / ✖, or the previous loop's, faded, until the card is entered again.
                  const thisLoop = playAlongActive ? playAlong.state.results.get(index) : undefined;
                  const lastLoop = playAlongActive && thisLoop === undefined ? playAlong.state.previous.get(index) : undefined;
                  const playMark = thisLoop ? { result: thisLoop, previous: false } : lastLoop ? { result: lastLoop, previous: true } : undefined;
                  const selected = index === transportCurrentSpanIndex;
                  const auditioned = eventIndex >= 0 && eventIndex === auditionedIndex;
                  const degree = progressionPracticeDegreeLabel(event?.chord, targetKey);
                  const role = event ? roleByEventId.get(event.id) ?? "" : "";
                  const cardWidth = span.durationBeats * timelinePixelsPerBeat;
                  const compact = compactTimelineCard(cardWidth);
                  const showPreview = playable && cardWidth >= 96;
                  const rangeCard = span.kind === "chord" && rangeContainsCard(rangeSelection.active, eventIndex);
                  const rangeStart = span.kind === "chord" && rangeSelection.active?.first === eventIndex;
                  const rangeEnd = span.kind === "chord" && rangeSelection.active?.last === eventIndex;
                  const pendingStart = span.kind === "chord" && rangeSelection.pendingStart === eventIndex;
                  return (
                    <div key={event?.id ?? `rest-${span.startBeat}`} className="lv-vl-event-wrap relative flex-none" style={{ width: `${span.durationBeats * timelinePixelsPerBeat}px` }}>
                    <button
                      ref={(element) => { timelineEventRefs.current[index] = element; }}
                      type="button"
                      data-testid="voicing-loop-event"
                      data-fn={role || undefined}
                      data-duration-beats={span.durationBeats}
                      data-span-kind={span.kind}
                      data-compact={compact}
                      data-auto-fallback={autoFallback ? "true" : "false"}
                      data-range={pendingStart ? "pending-a" : rangeStart && rangeEnd ? "a-b" : rangeStart ? "a" : rangeEnd ? "b" : rangeCard && rangeSelection.active ? "inside" : rangeSelection.active ? "outside" : "none"}
                      data-fingering-adjusted={event && adjustedFingeringIds.has(event.id) ? "true" : "false"}
                      title={`${event ? displayChordLabel(event.chord.label) : restLabel}${event && adjustedFingeringIds.has(event.id) ? " — 前後に合わせて変化" : ""}${cardNote ? ` — ${cardNote}` : ""}`}
                      style={{ width: `${cardWidth}px` }}
                      className={`lv-vl-event relative flex w-full flex-none flex-col justify-start overflow-hidden rounded-[var(--lv-radius-sm)] border ${compact ? "px-0.5 pb-1 pt-1" : "px-2 pb-3 pt-1.5"} text-left text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)] disabled:cursor-not-allowed disabled:opacity-60 ${rangeSelection.active && !rangeCard ? "opacity-55" : ""} ${selected ? `border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] text-[var(--lv-accent)] shadow-[inset_0_0_0_1px_rgba(59,224,206,0.12)] ${pageTurnHighlightIndex === index ? "ring-2 ring-[var(--lv-accent)]" : ""}` : auditioned ? "border-[var(--lv-accent)] bg-[var(--lv-surface-raised)] text-[var(--lv-text)]" : "border-[var(--lv-border)] bg-transparent text-[var(--lv-text-secondary)]"}`}
                      aria-current={selected ? "step" : undefined}
                      aria-pressed={auditioned}
                      aria-label={`${index + 1}/${snapshot.spans.length}: ${event ? displayChordLabel(event.chord.label) : restLabel}${showDegrees && degree ? `, ${degree}` : ""}, ${practiceTimingLabel(span, snapshot.practiceGroupBeats ?? snapshot.meter.numerator)}.${event ? ` ${transportRef.current?.supportsSeek ? ("ここへ移動して試聴") : text.auditionCard}` : ""}${autoFallback ? " 代わりの形で鳴らしています" : ""}${pendingStart ? " 範囲開始の候補A" : rangeStart && rangeEnd ? " 区間A/B" : rangeStart ? " 区間A" : rangeEnd ? " 区間B" : ""}`}
                      disabled={!playable && !transportRef.current?.supportsSeek}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        if (event.button === 2) keyboardRangeMenuRef.current = undefined;
                      }}
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
                      {playMark ? <PlayAlongCardMark result={playMark.result} previous={playMark.previous} compact={compact} /> : null}
                      {autoFallback ? <span className="absolute top-0.5 rounded bg-amber-400/20 px-1 text-[9px] text-amber-200"
                        style={{ right: playMark ? 26 : 4 }}
                        data-testid="voicing-loop-auto-fallback" title={autoFallbackDescription} aria-label={autoFallbackDescription}>{cardWidth < 132 ? "代" : "代わり"}</span> : null}
                      {pendingStart || rangeStart || rangeEnd ? <span aria-hidden="true"
                        className="absolute bottom-0.5 right-1 text-[10px] text-[var(--lv-vl-range)]">
                        {pendingStart ? "A?" : rangeStart && rangeEnd ? "A/B" : rangeStart ? "A" : "B"}
                      </span> : null}
                      <span className="flex min-w-0 items-baseline gap-1">
                        {!compact ? <span className="shrink-0 text-[10px] font-normal text-[var(--lv-text-muted)]">{index + 1}</span> : null}
                        <span className={`min-w-0 leading-tight ${compact ? "block overflow-hidden text-ellipsis whitespace-nowrap text-[9px] tracking-tight" : "text-sm"}`}>{event
                          ? compact ? displayChordLabel(event.chord.label)
                            // P25 V21: a narrow card breaks the name only before its slash bass (Eadd9 / /F♯), never inside a word.
                            : displayChordLabel(event.chord.label).split(/(?=\/)/).map((part, partIndex) => <span key={partIndex} className="inline-block whitespace-nowrap">{part}</span>)
                          : restLabel}</span>
                      </span>
                      {!compact ? (
                        <>
                          {event && adjustedFingeringIds.has(event.id) ? <span className="absolute top-1 text-[9px] text-[var(--lv-accent)]" style={{ right: playMark ? 26 : 4 }} title="前後に合わせて変化" aria-label="前後に合わせて変化">●</span> : null}
                          <span data-testid="voicing-loop-event-timing" className={`absolute bottom-1 left-2 text-[10px] font-normal leading-3 ${selected ? "text-[var(--lv-accent)]" : "text-[var(--lv-text-muted)]"}`}>
                            {compactDurationLabel(span.durationBeats)}
                          </span>
                          {(role || showDegrees && degree) && !pendingStart && !rangeStart && !rangeEnd ? (
                            <span className={`lv-vl-event-degree absolute bottom-1 ${showPreview ? "right-8" : "right-2"}`}
                              data-badge={cardWidth >= 132 ? undefined : "off"}>
                              <DegreeTag degree={degree} role={role} showDegree={showDegrees} size="xs"
                                testId="voicing-loop-event-degree" roleTestId="voicing-loop-event-role" />
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </button>
                    {showPreview ? <button type="button" className="absolute bottom-1 right-1 z-20 rounded bg-[var(--lv-surface-raised)] p-1 text-[var(--lv-accent)] disabled:opacity-40"
                      data-testid="voicing-loop-event-preview" aria-label={`${event ? displayChordLabel(event.chord.label) : restLabel}: ${text.auditionCard}`}
                      disabled={active} onClick={(click) => { click.stopPropagation(); void auditionResolved(eventIndex, true); }}><Play aria-hidden="true" size={16} /></button> : null}
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          </Surface>

          <Surface className="min-w-0 overflow-hidden px-2 py-1" data-testid="voicing-loop-detail">
            <div className="lv-vl-legend-row flex min-w-0 shrink-0 flex-wrap items-center gap-x-4 gap-y-1" data-play-along={playAlongActive ? "on" : undefined}>
              <h3 className="lv-vl-legend-title text-[10px] font-bold tracking-[0.1em] text-[var(--lv-text-secondary)]" title={text.keyboardTitle}>{text.keyboardTitle}</h3>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--lv-text-secondary)]" data-testid="voicing-loop-keyboard-legend">
                {([
                  { label: "左手の目安", color: "border-amber-400 bg-amber-400/30" },
                  { label: "右手の目安", color: "border-cyan-300 bg-cyan-300/30" },
                  // P25-11 I4: while 弾き合わせ is on, the pressed keys are painted ● / ×, so 「押鍵中」 is not shown
                  // (P25 V10: it keeps its place, so the legend after it does not move).
                  { label: "押鍵中", color: "border-teal-100 bg-teal-300", shown: !playAlongActive },
                  { label: "ペダル保持", color: "border-sky-200 bg-sky-600" },
                ] as { label: string; color: string; shown?: boolean }[]).map(({ label, color, shown }) => <span key={label}
                  className={`inline-flex items-center gap-1${shown === undefined ? "" : " lv-motion-fade"}`}
                  data-shown={shown} aria-hidden={shown === false || undefined}><span aria-hidden="true" className={`h-2.5 w-2.5 border ${color}`} />{label}</span>)}
                {/* P25 V10: the two marks and the judge stay in their place all the time and only fade in and out (no unfolding). */}
                <span className="lv-motion-fade inline-flex items-center gap-x-3 whitespace-nowrap" data-shown={playAlongActive} aria-hidden={!playAlongActive || undefined}
                  data-testid="voicing-loop-play-along-legend">
                  <span className="inline-flex items-center gap-1" data-testid="voicing-loop-legend-ok"><span aria-hidden="true" className="lv-vl-play-legend" style={{ background: "#36c990", color: "#05271a", fontSize: 8 }}>{"●"}</span>{"合っている音"}</span>
                  <span className="inline-flex items-center gap-1" data-testid="voicing-loop-legend-wrong"><span aria-hidden="true" className="lv-vl-play-legend" style={{ background: "#ee6b73", color: "#2a0508", fontSize: 10, fontWeight: 700 }}>{"×"}</span>{"違う音"}</span>
                  {/* P25-11 I1 / I2 (案 D): the judgement sits here, right of the two marks, only while on. */}
                  <span ref={judgePickRef} className="lv-vl-seg lv-motion-pick" role="group" aria-label={"判定"} title={"判定"} data-testid="voicing-loop-play-along-judge">
                    <Button size="sm" variant="secondary" className="lv-choice" aria-pressed={playAlongPreference.mode === "chord"}
                      title={"コードの音がそろえば押さえ方は自由。3 度・7 度は必須、ルートと 5 度は省いてよい。カードに出ている音そのものを練習するなら『押さえ方どおり』"}
                      onClick={() => changePlayAlong({ mode: "chord" })}>{"コード一致"}</Button>
                    <Button size="sm" variant="secondary" className="lv-choice" aria-pressed={playAlongPreference.mode === "exact"}
                      title={"カードに出ている押さえ方と同じ音で弾けたら正解。全体が 1〜2 オクターブずれていても正解"}
                      onClick={() => changePlayAlong({ mode: "exact" })}>{"押さえ方どおり"}</Button>
                  </span>
                </span>
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
                {...(playAlongActive ? { playAlongMarks: playAlong.marks } : {})}
                fingerLabels={keyboardFingerLabels}
                keyboardLayout="wide-88"
                hideLegend
                fillHeight
                compactSummary
              />
            </div>
          </Surface>

          {bulkSourceOpen && bulkSourcePreview && onBulkSourceApply ? (
            <Modal
              ariaLabel={"この進行を元の音に"}
              onClose={() => setBulkSourceOpen(false)}
              panelClassName="w-full max-w-md"
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 14px 14px", background: "#0f1826", borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#f2f6fc", whiteSpace: "nowrap" }}>{"この進行を元の音にしますか？"}</h2>
                  <span style={{ flex: 1 }} />
                  <button type="button" aria-label="閉じる(Esc)" onClick={() => setBulkSourceOpen(false)} style={{ width: 26, height: 26, border: 0, borderRadius: 6, background: "transparent", color: "#9fb0c6", fontSize: 15, cursor: "pointer" }}>{"×"}</button>
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#c9d3e2" }}>
                  {bulkSourcePreview.changed > 0 ? `${bulkSourcePreview.changed} 枚のカードを、取り込んだ時の音にします。` : "もう全部のカードが、取り込んだ時の音です。"}
                  {bulkSourcePreview.keptCustom > 0 ? <><br />{`自分で直した ${bulkSourcePreview.keptCustom} 枚はそのままです。`}</> : null}
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <Button variant="secondary" onClick={() => setBulkSourceOpen(false)}>{"やめる"}</Button>
                  <Button variant="primary" disabled={bulkSourcePreview.changed === 0} onClick={() => { if (onBulkSourceApply()) setBulkSourceOpen(false); }}>{"元の音にする"}</Button>
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

          <Surface ref={transportBarRef} className="lv-vl-transport lv-vl-transport-frame min-w-0 shrink-0 px-2 py-0.5" data-testid="voicing-loop-transport">
            <div className="lv-vl-transport-primary flex min-w-0 items-center gap-2 whitespace-nowrap" data-testid="voicing-loop-transport-primary">
              {!active && !paused ? (
                <TransportButton variant="primary" fixedPrimary disabled={!allEventsPlayable} title="開始・一時停止(Space)" onClick={togglePlayback}><Play aria-hidden="true" size={16} />{text.start}</TransportButton>
              ) : active ? (
                <TransportButton variant="primary" fixedPrimary title="開始・一時停止(Space)" onClick={togglePlayback}><Pause aria-hidden="true" size={16} />{text.pause}</TransportButton>
              ) : (
                <TransportButton variant="primary" fixedPrimary title="開始・一時停止(Space)" onClick={togglePlayback}><Play aria-hidden="true" size={16} />{text.resume}</TransportButton>
              )}
              <TransportButton variant="neutral" title={text.restart} disabled={!active && !paused} onClick={() => void restart()}><RefreshCw aria-hidden="true" size={16} /><span className="lv-vl-button-text">{text.restart}</span></TransportButton>
              <TransportButton variant="neutral" title={text.stop} disabled={!active && !paused} onClick={stop}><Square aria-hidden="true" size={16} /><span className="lv-vl-button-text">{text.stop}</span></TransportButton>
              <span className="lv-vl-divider" aria-hidden="true" />
              {sourceKey && targetTonicPitchClass !== undefined ? (
                <label className="inline-flex min-h-8 items-center gap-2 text-[10px] font-bold tracking-[0.08em] text-[var(--lv-text-muted)]" htmlFor="voicing-loop-key">
                  <span className="lv-vl-label-text">{text.key}</span>
                  <Select
                    id="voicing-loop-key"
                    wrapperClassName="w-36"
                    className="lv-vl-key-select w-full text-xs"
                    value={targetTonicPitchClass}
                    onChange={(event) => changeTargetKey(Number(event.currentTarget.value))}
                  >
                    {keyOptions.map((key) => (
                      <option key={key.tonicPitchClass} value={key.tonicPitchClass}>
                        {/* P23-20 L7: the same ♭/♯ spelling as the chord names (`Db` → `D♭`). */}
                        {displayChordLabel(key.labels.ja)}{key.tonicPitchClass === sourceKey.tonicPitchClass ? ` (${text.originalKey})` : ""}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
              <label className="inline-flex min-h-8 items-center gap-2 text-[10px] font-bold tracking-[0.08em] text-[var(--lv-text-muted)]" htmlFor="voicing-loop-count-in">
                <span className="lv-vl-label-text">{text.countInBars}</span>
                <Select
                  id="voicing-loop-count-in"
                  wrapperClassName="w-24"
                  className="w-full text-xs"
                  value={countInBars}
                  disabled={active || paused}
                  onChange={(event) => setCountInBars(Number(event.currentTarget.value) as 0 | 1 | 2)}
                >
                  <option value={0}>{text.noCountIn}</option>
                  <option value={1}>{text.oneBar}</option>
                  <option value={2}>{text.twoBars}</option>
                </Select>
              </label>
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
              <label className="lv-vl-switch" title={text.referenceSound}>
                <Switch checked={referenceSoundEnabled} label={text.referenceSound} onChange={changeReferenceSound} />
                <span className="lv-vl-label-text">{text.referenceSound}</span>
              </label>
              <label className="lv-vl-switch" title={`MIDI 鍵盤で一緒に弾くと、合っている音・違う音と、カードごとにそろったかを出します${midiConnection.connected ? "" : "(MIDI 未接続)"}`}>
                <Switch checked={playAlongPreference.on} disabled={!midiConnection.connected} label={"弾き合わせ"} onChange={(checked) => changePlayAlong({ on: checked })} />
                <span className="lv-vl-label-text">{"弾き合わせ"}</span>
              </label>
              <span className="ml-auto text-xs font-medium text-[var(--lv-text-secondary)]">{sessionStatus(clockState?.status)}</span>
            </div>
          </Surface>
          {runtimeError ? <StatusMessage title={text.playbackError} tone="error">{runtimeError}</StatusMessage> : null}
          {plan ? <UnresolvedSummary plan={plan} snapshot={snapshot} /> : null}
          <ResolutionStatus resolution={currentResolution} />
        </>
      )}
    </div>
  );
}

/**
 * P23-20 L3: a chord's degree in the key as it is shown (Ⅱm7), with the role colour of the key.
 * The degree text follows 「度数を表示」; the role badge always stays, so the colour remains.
 */
function DegreeTag({ degree, role, showDegree, size, testId, roleTestId }: {
  readonly degree?: string;
  readonly role: FunctionKind | "";
  readonly showDegree: boolean;
  readonly size: "lg" | "sm" | "xs";
  readonly testId: string;
  readonly roleTestId: string;
}) {
  if (!role && !(showDegree && degree)) return null;
  const name = roleName(role);
  return (
    <span className="lv-vl-degree shrink-0" data-fn={role || undefined} data-size={size} data-testid={`${testId}-wrap`}>
      {showDegree && degree ? <span className="lv-vl-degree-text" data-testid={testId}>{displayDegreeLabel(degree)}</span> : null}
      {role ? <span className="lv-vl-degree-role" data-testid={roleTestId} title={name}>
        <span aria-hidden="true">{role}</span>
        <span className="sr-only">{name}</span>
      </span> : null}
    </span>
  );
}

function roleName(role: FunctionKind | ""): string {
  const text = copy.ja;
  return role === "T" ? text.roleTonic : role === "SD" ? text.roleSubdominant
    : role === "SDm" ? text.roleSubdominantMinor : role === "D" ? text.roleDominant : "";
}

/** P23-20 L3: the degree of a practice chord in the key (Ⅱm7), or undefined without a readable key. */
function chordDegreeLabel(chord: ProgressionPracticeEvent["chord"] | undefined, key: string | undefined): string | undefined {
  if (!chord || !key) return undefined;
  return degreeOf({
    root: chord.root,
    quality: chord.quality,
    tensions: [...chord.tensions],
    label: chord.label,
    ...(chord.bass === undefined ? {} : { bass: chord.bass }),
  }, key)?.label;
}

function practiceTimingLabel(event: Pick<ProgressionPracticeEvent, "startBeat" | "durationBeats">,
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
  preferences?: FingeringPreferenceCollection,
  options: Parameters<typeof rankPracticeHandFingerings>[5] = {},
  unresolved: readonly boolean[] = [],
  practiceBpm?: number,
): ReturnType<typeof rankCyclicFingerings> {
  return rankPracticeHandFingerings(snapshot, handAssignments, selection, hand, preferences, options, unresolved, practiceBpm);
}

function effectiveFingering(
  suggestion: RankedFingering | { readonly status: "unavailable" } | undefined,
  preferences: FingeringPreferenceCollection,
): RankedFingering | undefined {
  if (!suggestion || suggestion.status !== "supported") return undefined;
  // Saved notes are fixed inside the solver, rather than projected over an Auto result.
  void preferences;
  return suggestion;
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
    <section className="lv-vl-move relative mt-1 min-w-0 shrink-0" data-testid="voicing-loop-next-move" aria-label={"次への動き"}>
      <div className="grid h-full min-w-0 grid-cols-2 gap-1">
        {(["left", "right"] as const).map((hand) => (
          <div key={hand} className="flex h-full min-w-0 flex-col rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] px-1 pb-0.5 pt-0.5" role="group" data-testid="voicing-loop-next-move-hand-group" data-hand={hand}
            aria-label={hand === "left" ? ("次への動き 左手") : ("次への動き 右手")}>
            <div className={`flex h-[11px] min-w-0 items-center justify-center gap-1 truncate text-[10px] font-bold tracking-[0.04em] ${hand === "left" ? "text-amber-200" : "text-cyan-200"}`}
              data-testid="voicing-loop-next-move-summary">
              <span className="shrink-0 text-[9px] font-bold text-[var(--lv-text-muted)]">{"次への動き"}</span>
              <span aria-hidden="true" className="shrink-0 text-[var(--lv-text-muted)]">{"·"}</span>
              <span className="shrink-0">{hand === "left" ? ("左手") : ("右手")}</span>
              <span className="min-w-0 truncate font-extrabold">{handMoveSummary(moves.filter((move) => move.hand === hand))}</span>
              {loopWrap && hand === "right" ? <span className="truncate text-[var(--lv-text-muted)]">{"ループ先"}</span> : null}
              <span data-testid="voicing-loop-movement-certainty" className="shrink-0 text-[9px] text-[var(--lv-text-muted)]">{moves.some(move => move.hand === hand && move.certainty === "partial") ? "一部推定" : moves.some(move => move.hand === hand && move.estimated) ? "推定" : "確定"}</span>
            </div>
            <div className="mt-px grid min-w-0 grid-cols-5 gap-0.5" role="list">
              {slots.filter((slot) => slot.hand === hand).map((slot) => {
                const id = `${slot.hand === "left" ? "L" : "R"}${slot.finger}`;
                const strongest = slot.moves.some((move) => move.kind === "LARGE") ? "LARGE"
                  : slot.moves.some((move) => move.kind === "MEDIUM" || move.kind === "ADD" || move.kind === "RELEASE") ? "MEDIUM"
                    : slot.moves.some((move) => move.kind === "SMALL") ? "SMALL" : slot.moves.length ? "KEEP" : "EMPTY";
                const action = slot.moves.map((move) => move.kind === "ADD" ? "+押す" : move.kind === "RELEASE" ? "×離す"
                  : movementInterval(move.semitones!)).join("/");
                // P23-31b O3: the narrow slot keeps the arrow and the semitones (the long interval name is cut).
                const shortAction = slot.moves.map((move) => move.kind === "ADD" ? "+押す" : move.kind === "RELEASE" ? "×離す"
                  : `${move.semitones! > 0 ? "↑" : "↓"}${Math.abs(move.semitones!)}`).join("/");
                const next = slot.moves.reduce<number | undefined>((pitch, move) => move.to ?? pitch, undefined);
                const description = slot.moves.length
                  ? slot.moves.map((move) => moveText(move, accidentalStyle)).join("; ")
                  : `${id} ${"使用しない"}`;
                const strength = strongest === "LARGE" ? "border-current bg-current/15 font-extrabold"
                  : strongest === "MEDIUM" ? "border-current/70 bg-current/10 font-bold"
                    : strongest === "SMALL" ? "border-current/40 font-semibold"
                      : strongest === "KEEP" ? "border-current/50 bg-current/[0.04] font-semibold" : "border-dashed border-current/20";
                return <div key={id} role="listitem" data-testid="voicing-loop-finger-slot" data-finger={id} data-strength={strongest}
                  className={`lv-vl-move-slot flex min-w-0 flex-col items-center justify-center rounded border leading-none ${slot.hand === "left" ? "text-amber-200" : "text-cyan-200"} ${strength}`}
                  aria-label={`${id}: ${description}${slot.moves.some((move) => move.estimated) ? ` (${"推定"})` : ""}`}
                  title={`${id}: ${description}`}>
                  <span className={`text-xs font-bold ${strongest === "EMPTY" ? "text-[var(--lv-text-muted)]" : ""}`}>{id}</span>
                  {strongest === "KEEP" ? (
                    <span aria-hidden="true" className="my-0.5 h-1 w-[70%] rounded-full bg-current/70" data-testid="voicing-loop-keep-band" />
                  ) : strongest !== "EMPTY" ? <span className="mt-0.5 w-full whitespace-nowrap px-0.5 text-center text-[11px]"><span className="lv-vl-move-long">{action}</span><span className="lv-vl-move-short" aria-hidden="true">{shortAction}</span></span> : null}
                  {strongest !== "EMPTY" && next !== undefined ? <span className={`mt-0.5 text-[11px] ${slot.moves.some(move => move.toEstimated) ? "rounded border border-dashed opacity-60" : ""}`}>{note(next)}{slot.moves.some(move => move.toEstimated) ? " 推定" : ""}</span> : null}
                  {slot.moves.some(move => move.fromEstimated) ? <span className="rounded border border-dashed text-[8px] opacity-60">元音 推定</span> : null}
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

function handDegreeOf(voicing: ResolvedProgressionPracticeVoicing, root: number | undefined) {
  const named = new Map(voicing.notes.map((note) => [note.midiNote, note.degree]));
  return (pitch: number) => slotDegree(named, root, pitch);
}

function handSlotLabels(hand: FingeringHand, text: typeof copy.ja): HandSlotLabels {
  return {
    hand: hand === "left" ? text.leftHandDisplay : text.rightHandDisplay,
    finger: text.finger, pitches: text.pitches, chordTone: text.chordTone,
    unused: "使用しない", extra: "あふれた音",
  };
}

function HandVoicingSummary({
  accidentalStyle, fingering, hand, isPersonal, pitches, root, showFingering, text, voicing, reserveBadge = false,
}: {
  readonly accidentalStyle: NoteAccidentalStyle;
  readonly fingering?: RankedFingering;
  readonly hand: FingeringHand;
  readonly isPersonal: boolean;
  readonly pitches: readonly number[];
  readonly root?: number;
  readonly showFingering: boolean;
  readonly text: typeof copy.ja;
  readonly voicing: ResolvedProgressionPracticeVoicing;
  /** P25 V6: the 「おすすめ」 badge keeps its place (an empty one) while it is not shown. */
  readonly reserveBadge?: boolean;
}) {
  const slots = useMemo(() => buildHandSlots(hand, pitches, fingering), [fingering, hand, pitches]);
  const degreeOf = useMemo(() => handDegreeOf(voicing, root), [root, voicing]);
  const badgeClass = "shrink-0 rounded border border-[var(--lv-border)] px-1.5 py-0.5 text-[11px] text-[var(--lv-text-secondary)]";
  return (
    <HandSlotPanel hand={hand} slots={slots} labels={handSlotLabels(hand, text)} showFingering={showFingering}
      testId={`voicing-loop-${hand}-hand`}
      pitchLabel={(pitch) => formatMidiNoteForDisplay(pitch, "fl-studio", accidentalStyle)} degreeOf={degreeOf}
      badge={showFingering && fingering ? <span className={badgeClass}>{isPersonal ? text.personal : text.automatic}</span>
        : reserveBadge ? <span aria-hidden="true" className={`${badgeClass} invisible`}>{"\u00a0"}</span> : null}
      notice={showFingering && pitches.length && !fingering ? text.fingeringUnavailable : undefined} />
  );
}

function CompactHandVoicing({ voicing, accidentalStyle, fingering, hand, pitches, root, showFingering, text }: {
  readonly voicing: ResolvedProgressionPracticeVoicing;
  readonly accidentalStyle: NoteAccidentalStyle;
  readonly fingering?: RankedFingering;
  readonly hand: FingeringHand;
  readonly pitches: readonly number[];
  readonly root?: number;
  readonly showFingering: boolean;
  readonly text: typeof copy.ja;
}) {
  const slots = useMemo(() => buildHandSlots(hand, pitches, fingering), [fingering, hand, pitches]);
  const degreeOf = useMemo(() => handDegreeOf(voicing, root), [root, voicing]);
  return (
    <HandSlotPanel hand={hand} slots={slots} labels={handSlotLabels(hand, text)} showFingering={showFingering} compact
      testId={`voicing-loop-next-${hand}-hand`}
      pitchLabel={(pitch) => formatMidiNoteForDisplay(pitch, "fl-studio", accidentalStyle)} degreeOf={degreeOf}
      notice={showFingering && pitches.length && !fingering ? text.fingeringUnavailable : undefined} />
  );
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
              <Select
                wrapperClassName="mt-1 w-full"
                className="w-full"
                aria-label={`${handLabel}: ${text.fingerForNote(note)}`}
                value={draftFingers[index] ?? ""}
                onChange={(event) => onChange(hand, index, Number(event.currentTarget.value))}
              >
                {[1, 2, 3, 4, 5].map((finger) => <option key={finger} value={finger}>{prefix}{finger}</option>)}
              </Select>
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
  // P25-16 N5: no internal names on the row (the shape is in 「形 ▼」, the source in the top row). Only what helps:
  // a coverage that is not literal, 「ほかの押さえ方」 when there is more than one, and the omitted notes.
  // P25 V6: the row is always there, one line high; with nothing to say it is empty (no test id, nothing to read).
  if (!explanation) return <div aria-hidden="true" className="lv-vl-explanation" />;
  const coverage = explanation.coverage ? coverageLabel(explanation.coverage) : undefined;
  const candidate = explanation.candidateIndex && explanation.candidateCount && explanation.candidateCount >= 2
    ? `${explanation.candidateIndex}/${explanation.candidateCount}`
    : undefined;
  const omitted = explanation.identity && explanation.omittedDegrees.length ? explanation.omittedDegrees.join(" · ") : undefined;
  if (!coverage && !candidate && !omitted) return <div aria-hidden="true" className="lv-vl-explanation" />;

  return (
    <div className="lv-vl-explanation flex min-w-0 items-center gap-x-1.5 text-[10px] text-[var(--lv-text-secondary)]" data-testid="voicing-loop-current-explanation">
      {coverage ? <span className="rounded-full border border-[var(--lv-border)] px-2 py-0.5">{coverage}</span> : null}
      {candidate ? (
        <span className="inline-flex items-center gap-1" title={text.candidateHelp}>
          <span>{"ほかの押さえ方"}</span>
          <span className="inline-flex items-center gap-0.5" data-testid="voicing-loop-candidate-navigation">
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded text-[var(--lv-text-secondary)] hover:bg-[var(--lv-surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lv-accent)] disabled:cursor-not-allowed disabled:opacity-35"
              aria-label={text.previousCandidate}
              onClick={onPreviousCandidate}
            >
              <ChevronLeft aria-hidden="true" size={16} />
            </button>
            <span className="px-0.5 font-semibold" aria-label={`${text.candidateHelp}: ${candidate}`}>{candidate}</span>
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded text-[var(--lv-text-secondary)] hover:bg-[var(--lv-surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lv-accent)] disabled:cursor-not-allowed disabled:opacity-35"
              aria-label={text.nextCandidate}
              onClick={onNextCandidate}
            >
              <ChevronRight aria-hidden="true" size={16} />
            </button>
          </span>
        </span>
      ) : null}
      {omitted ? <span data-testid="voicing-loop-omitted"><strong className="mr-1 text-[var(--lv-text-muted)]">{"省いた音"}</strong>{omitted}</span> : null}
      {explanation.identity ? (
        // P23-32 P4: the rule's internal names are read from the i, not shown as words. P25-16 N5: the top note too.
        <span className="lv-vl-rule-info" role="img" style={{ marginLeft: "auto" }}
          aria-label={`${topRoleLabel(explanation.topRole)} ${text.rule} ${explanation.identity.ruleId} · ${explanation.identity.variantId}`}
          title={`${topRoleLabel(explanation.topRole)}
${text.rule} ${explanation.identity.ruleId} · ${explanation.identity.variantId}`}>i</span>
      ) : null}
    </div>
  );
}

function coverageLabel(coverage: VoicingCoverage): string | undefined {
  const labels: Record<VoicingCoverage, string> = {
    literal: "",
    "performance-reduction": "弾きやすく省いた",
    "creative-enrichment": "音を足した",
  };
  return labels[coverage] || undefined;
}

const playbackChoiceLabels = { SOURCE: "元MIDI", GENERATED: "自動生成", CUSTOM: "カスタム" } as const;

function topRoleLabel(role: VoicingTopContext | undefined): string {
  switch (role) {
    case "fixed-melody": return "いちばん上の音:メロディ";
    case "top-candidate": return "いちばん上の音:上の音の候補";
    case "normal-voicing-top":
    case undefined: return "いちばん上の音:押さえ方のいちばん上";
  }
}
function Metric({
  children,
  compact = false,
  label,
  hideLabel = false,
  testId,
  title,
  value,
}: {
  readonly children?: ReactNode;
  readonly compact?: boolean;
  readonly label: string;
  /** P23-32 L1: the label stays for screen readers only (the number speaks for itself). */
  readonly hideLabel?: boolean;
  readonly testId?: string;
  readonly title?: string;
  readonly value: string;
}) {
  return (
    <div
      className={compact
        ? "grid min-w-0 grid-cols-[auto_minmax(2rem,1fr)_auto] items-center gap-1 px-1"
        : "grid min-w-0 grid-cols-[auto_minmax(2rem,1fr)_auto] items-center gap-2 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] bg-[var(--lv-bg-subtle)] px-3 py-1.5"}
      data-testid={testId}
      title={title}
    >
      <p className={hideLabel ? "sr-only" : "text-[10px] font-semibold tracking-[0.08em] text-[var(--lv-text-muted)]"}>{label}</p>
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


function sessionStatus(status: ProgressionPracticeClockStatus | undefined): string {
  // P23-32 K5: the three words of the practice.
  switch (status) {
    case "running":
    case "count-in": return "再生中";
    case "paused": return "一時停止中";
    default: return "停止中";
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
        label: snapshot.events[index] ? displayChordLabel(snapshot.events[index].chord.label) : `${index + 1}`,
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

/** P25-11 I5: the card's play-along mark (✓ on green, ✖ in red); the previous loop's is faded. */
function PlayAlongCardMark({ result, previous, compact }: { readonly result: "hit" | "miss"; readonly previous: boolean; readonly compact: boolean }) {
  const size = compact ? 14 : 18;
  const title = `${result === "hit" ? "そろった" : "そろわなかった"}${previous ? "(前の周)" : ""}`;
  return (
    <span data-testid="voicing-loop-play-along-mark" data-result={result} data-previous={previous || undefined} title={title} aria-label={title}
      style={{ position: "absolute", top: compact ? 4 : 5, right: compact ? 4 : 6, width: size, height: size, display: "inline-flex",
        alignItems: "center", justifyContent: "center", borderRadius: 4, opacity: previous ? 0.45 : 1, fontWeight: 700, lineHeight: 1,
        ...(result === "hit"
          ? { background: "#16a34a", color: "#ffffff", fontSize: compact ? 10 : 12 }
          : { color: "#ef4444", fontSize: compact ? 14 : 17 }) }}>
      {result === "hit" ? "✓" : "✖"}
    </span>
  );
}
