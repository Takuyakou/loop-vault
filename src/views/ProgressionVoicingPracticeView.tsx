import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, GripVertical, Minus, Pause, Play, Plus, RefreshCw, Search, Settings, Square, Volume2 } from "lucide-react";
import { useStore } from "zustand";
import {
  formatMidiNoteForDisplay,
  type NoteAccidentalStyle,
} from "../components/music-keyboard";
import { Modal } from "../components/Modal";
import { PracticeKeyboard } from "../components/practice/PracticeKeyboard";
import { usePreviewSound } from "../components/PreviewSoundProvider";
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
import { chordIndexAtTimelineBeat } from "../domain/progressionVoicingPractice/timelineNavigation";
import { clampTimelineScale, compactTimelineCard, remainingBeatsLabel, visualTransportBeat, timelinePixelsPerBeat as pixelsPerBeatForTimeline } from "../domain/progressionVoicingPractice/timelineLayout";
import type { AppLanguage } from "../domain/types";
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
import { isFollowScrollPosition, pageTurnTarget } from "../voicingPractice/timelineFollow";
import { cardAuditionResolution } from "../voicingPractice/cardAudition";

const ALL_PITCH_CLASSES = Object.freeze(Array.from({ length: 12 }, (_, index) => index));
const EMPTY_NOTES: readonly number[] = Object.freeze([]);
const EMPTY_VAULT_PROGRESSIONS: readonly VoicingLoopVaultCandidate[] = Object.freeze([]);
const VOICING_LOOP_KEYBOARD_RANGE = Object.freeze({ minMidiNote: 9, maxMidiNote: 96 });

export interface ProgressionVoicingPracticeViewProps {
  readonly language: AppLanguage;
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

const sourceSelections: readonly {
  readonly id: "lesson-rules" | "source-midi" | "custom";
  readonly ja: string;
  readonly en: string;
}[] = [
  { id: "lesson-rules", ja: "Lesson Rules", en: "Lesson Rules" },
  { id: "source-midi", ja: "Source MIDI", en: "Source MIDI" },
  { id: "custom", ja: "Custom", en: "Custom" },
] as const;

const studySelections: readonly {
  readonly id: VoicingBaseStudy;
  readonly ja: string;
  readonly en: string;
}[] = [
  { id: "teacher", ja: "Teacher", en: "Teacher" },
  { id: "core", ja: "Core", en: "Core" },
] as const;

const copy = {
  ja: {
    title: "Voicing Loop",
    description: "コードを見た瞬間に、左手・右手それぞれ何指か分かる。",
    source: "Voicingを選択",
    sourceHelp: "Source MIDIとCustomは保存済みの音をそのまま使い、Lesson Rulesは承認済みの規則だけを使います。",
    studyHelp: "TeacherまたはCoreを土台にし、ColorとOpenを必要に応じて加えます。Source MIDIとCustomでは変更できません。",
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
    rootShell: "Root Shell 1·3·7",
    rootShellShort: "Root 1·3·7",
    rootlessShell: "Rootless Shell 3·7",
    rootlessShellShort: "Rootless 3·7",
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
    progressionSection: "PROGRESSION",
    cardAuditionOnly: "カードクリック = 試聴のみ",
    keyboardTitle: "KEYBOARD — 88 KEYS / A0–C8",
    loop: "Loop",
    pitches: "PITCH",
    chordTone: "TONE",
    suggestedFingering: "おすすめ運指",
    finger: "FINGER",
    showFingering: "おすすめ運指を表示",
    rightHand: "RIGHT HAND",
    leftHand: "LEFT HAND",
    rightHandDisplay: "RIGHT HAND｜右手",
    leftHandDisplay: "LEFT HAND｜左手",
    personal: "自分の運指",
    automatic: "おすすめ",
    editFingering: "運指を編集",
    saveFingering: "保存",
    resetFingering: "おすすめに戻す",
    cancel: "キャンセル",
    fingeringUnavailable: "この手では運指を表示できません",
    fingeringUnavailableBody: "選択中のVoicingに1〜5音の練習対象がある場合に表示します。音やVoicingは変更されません。",
    fingerForNote: (note: string) => `${note}の指`,
    learn: "Learn（Voicing表示）",
    recall: "Recall（コード名のみ）",
    displayMode: "Voicing表示モード",
    rule: "RULE",
    omit: "OMIT",
    top: "TOP",
    none: "なし",
    bpm: "BPM",
    key: "KEY",
    octave: "OCT",
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
    unsupported: "このコードには選択中Lesson Voicingの規則がありません",
    unsupportedBody: "Source MIDI、Custom、または対応しているLesson Voicingへ切り替えてください。",
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
  en: {
    title: "Voicing Loop",
    description: "See the chord and know where each hand and finger goes.",
    source: "Choose voicing",
    sourceHelp: "Source MIDI and Custom preserve saved notes; Lesson Rules use approved rules only.",
    studyHelp: "Choose Teacher or Core as the base, then add Color or Open as needed. It is inactive for Source MIDI and Custom.",
    teacherHelp: "A practical voicing generalized from teacher-derived principles.",
    coreHelp: "Practice the chord skeleton and characteristic tones.",
    colorModifier: "Add Color",
    colorHelp: "Adds safe color such as 9ths, 11ths, or 13ths as Creative Enrichment without changing the original chord tones.",
    openModifier: "Open placement",
    openHelp: "Places the same harmony across a wider register while keeping slash bass fixed.",
    optimizeProgression: "Optimize for progression",
    optimizeHelp: "Chooses top and inner voice flow across the entire loop, including last to first. Off uses each chord's local default.",
    candidateHelp: "Another usable voicing candidate for the same chord.",
    previousCandidate: "Previous voicing candidate",
    nextCandidate: "Next voicing candidate",
    rootShell: "Root Shell 1·3·7",
    rootShellShort: "Root 1·3·7",
    rootlessShell: "Rootless Shell 3·7",
    rootlessShellShort: "Rootless 3·7",
    rootShellHelp: "Practice root, third, seventh, and any approved characteristic tone needed for chord identity. The label does not prescribe pitch order.",
    rootlessShellHelp: "Omit the root and practice third/seventh voice leading plus any approved characteristic tone needed for chord identity.",
    leftHandHelp: "Practice the upper chord's Rootless A/B in the left hand. Slash bass plays as a separate reference, not a practice target.",
    current: "Current",
    next: "Next",
    beat: "Beat",
    countIn: "Count-in",
    chordProgress: "Chord",
    progressionProgress: "Progression",
    position: "Position",
    timeline: "Progression timeline",
    progressionSection: "PROGRESSION",
    cardAuditionOnly: "Card click = audition only",
    keyboardTitle: "KEYBOARD — 88 KEYS / A0–C8",
    loop: "Loop",
    pitches: "PITCH",
    chordTone: "TONE",
    suggestedFingering: "Suggested Fingering",
    finger: "FINGER",
    showFingering: "Show Suggested Fingering",
    rightHand: "RIGHT HAND",
    leftHand: "LEFT HAND",
    rightHandDisplay: "RIGHT HAND｜右手",
    leftHandDisplay: "LEFT HAND｜左手",
    personal: "Personal fingering",
    automatic: "Suggested",
    editFingering: "Edit fingering",
    saveFingering: "Save",
    resetFingering: "Reset to suggestion",
    cancel: "Cancel",
    fingeringUnavailable: "Fingering is unavailable for this hand",
    fingeringUnavailableBody: "It appears when this voicing has a one-to-five-note practice target. Notes and voicing are never changed.",
    fingerForNote: (note: string) => `Finger for ${note}`,
    learn: "Learn (show voicing)",
    recall: "Recall (chord only)",
    displayMode: "Voicing display mode",
    rule: "RULE",
    omit: "OMIT",
    top: "TOP",
    none: "None",
    bpm: "BPM",
    key: "KEY",
    octave: "OCT",
    octaveShift: (value: number) => value === 0 ? "Original" : `${value > 0 ? "+" : ""}${value}`,
    octaveDown: "Shift down one octave",
    octaveUp: "Shift up one octave",
    originalKey: "Original",
    bpmDrag: "Drag up or down to change BPM",
    metronome: "Metronome",
    referenceSound: "Reference sound",
    countInBars: "Count-in",
    noCountIn: "Off",
    oneBar: "1 bar",
    twoBars: "2 bars",
    start: "Start",
    pause: "Pause",
    resume: "Resume",
    restart: "Restart",
    stop: "Stop",
    reference: "Play current chord",
    auditionCard: "Audition this chord",
    ready: "Ready to start",
    running: "Auto-advancing",
    paused: "Paused",
    stopped: "Stopped",
    chooseProgression: "Progression to practice",
    chooseProgressionBody: "Choose a saved progression from My Vault to start practicing immediately.",
    search: "Search progressions",
    searchPlaceholder: "Search title, chords, or key",
    recent: "Recently practiced",
    saved: "Saved progressions",
    all: "All progressions",
    results: "Search results",
    noSaved: "There are no saved progressions available for practice yet.",
    noMatches: "No progressions match your search.",
    showAll: "View all progressions",
    practice: "Practice",
    enterText: "+ Enter a new progression as text",
    unavailable: "The selected voicing is unavailable",
    unavailableBody: "This chord has no saved Source/Custom voicing. Choose another explicit voicing.",
    unsupported: "This chord has no rule for the selected Lesson voicing",
    unsupportedBody: "Choose Source MIDI, Custom, or a supported Lesson voicing.",
    generationError: "The voicing could not be generated",
    generationErrorBody: "The Lesson rule is supported, but no safe register placement could be built.",
    playbackError: "Playback could not start",
    playbackErrorBody: "Audio was stopped safely. Please try again.",
    unavailableStatus: "Unavailable",
    unsupportedStatus: "Unsupported rule",
    leftHandUpperUnsupported: "No approved Left-hand rule for this upper chord",
    generationErrorStatus: "Generation error",
    unresolvedSummary: (count: number) => `${count} chords cannot be played`,
    midi: "MIDI input",
    connected: "Connected",
    connecting: "Connecting",
    disconnected: "Disconnected",
    reconnect: "Reconnect",
    settings: "Settings",
    midiActivationFailed: "MIDI input could not be activated.",
    positionLabel: (group: number, total: number) => `Practice group ${group} / ${total}`,
    beatLabel: (beat: number, total: number) => `Beat ${beat} of ${total}`,
    loopLabel: (count: number) => `${count} completed`,
  },
} as const;

export function ProgressionVoicingPracticeView({
  initialSelection = "source-midi",
  language,
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
  const text = copy[language];
  const { sound: previewSound } = usePreviewSound();
  const [selection, setSelection] = useState<ProgressionVoicingSelection>(initialSelection);
  const [studyCategory, setStudyCategory] = useState<VoicingBaseStudy>("teacher");
  const [colorEnabled, setColorEnabled] = useState(false);
  const [openEnabled, setOpenEnabled] = useState(false);
  const [progressionOptimizationEnabled, setProgressionOptimizationEnabled] = useState(true);
  const lessonRulesSelected = selection !== "source-midi" && selection !== "custom";
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
    () => lessonRulesSelected ? {
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
    } : { ...resolutionOptions, octaveShift },
    [colorEnabled, lessonCandidateIndexes, lessonRulesSelected, octaveShift, openEnabled, progressionOptimizationEnabled, resolutionOptions, studyCategory],
  );
  const plan = useMemo(
    () => snapshot ? resolveProgressionPracticeVoicings(snapshot, effectiveResolutionOptions) : undefined,
    [effectiveResolutionOptions, snapshot],
  );
  const cardAuditionPlans = useMemo(() => {
    const fromSelection = (family: "source-midi" | "custom" | "basic-full") => {
      const original = snapshots?.[family];
      if (!original) return undefined;
      const transposed = targetTonicPitchClass === undefined
        ? undefined : transposeProgressionVoicingPracticeSnapshot(original, targetTonicPitchClass);
      const prepared = transposed ? (transposed.ok ? transposed.snapshot : undefined) : original;
      return prepared ? resolveProgressionPracticeVoicings(prepared, { octaveShift }) : undefined;
    };
    return { source: fromSelection("source-midi"), custom: fromSelection("custom"), generated: fromSelection("basic-full") };
  }, [snapshots, targetTonicPitchClass, octaveShift]);
  const [countInBars, setCountInBars] = useState<0 | 1 | 2>(1);
  const [seekAnchorIndex, setSeekAnchorIndex] = useState(0);
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
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [referenceSoundEnabled, setReferenceSoundEnabled] = useState(true);
  const [auditionedIndex, setAuditionedIndex] = useState<number>();
  const [runtimeError, setRuntimeError] = useState<string>();
  const [midiReconnectError, setMidiReconnectError] = useState<string>();
  const transportRef = useRef<ProgressionVoicingTransportPort>();
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
  const programmaticScrollRef = useRef<number | undefined>(undefined);
  const forceFollowRef = useRef(false);
  if (!transportRef.current) transportRef.current = transportFactory();
  const midiStatus = useStore(defaultLiveMidiStore, (state) => state.status);
  const selectedMidiDevice = useStore(defaultLiveMidiStore, (state) => state.selected);
  const midiStoreError = useStore(defaultLiveMidiStore, (state) => state.error);

  useEffect(() => {
    const transport = transportRef.current;
    runtimeRequestRef.current += 1;
    auditionRequestRef.current += 1;
    transport?.stop();
    setRuntimeError(undefined);
    setAuditionedIndex(undefined);
    setSeekAnchorIndex(0);
    setClockState(sourceSnapshot
      ? createProgressionPracticeClockState(sourceSnapshot, { countInBars })
      : undefined);
    return () => {
      runtimeRequestRef.current += 1;
      auditionRequestRef.current += 1;
      transport?.stop();
    };
  }, [countInBars, previewSound, sourceSnapshot]);

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
  const restLabel = language === "ja" ? "休符" : "Rest";
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
  useLayoutEffect(() => {
    if (!snapshot || !clockState || !playheadRef.current) return;
    const state = clockState;
    const startedAt = performance.now();
    const request = runtimeRequestRef.current;
    const paint = (absoluteBeat: number) => {
      const position = projectProgressionPracticeClock(snapshot, { ...state, transportBeat: absoluteBeat });
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${position.progressionBeat * timelinePixelsPerBeat}px)`;
      if (currentProgressRef.current) currentProgressRef.current.style.width = `${position.chordProgress * 100}%`;
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
    const target = pageTurnTarget({
      chordStartBeat: span.startBeat,
      chordDurationBeats: span.durationBeats,
      pixelsPerBeat: timelinePixelsPerBeat,
      viewportWidth: viewport.clientWidth,
      scrollLeft: viewport.scrollLeft,
      contentWidth: snapshot.lengthBeats * timelinePixelsPerBeat,
    }, forceFollowRef.current);
    forceFollowRef.current = false;
    if (target !== undefined && Math.abs(viewport.scrollLeft - target) > 2) {
      programmaticScrollRef.current = target;
      viewport.scrollLeft = target;
    }
  }, [followEnabled, followResumeRevision, snapshot, timelinePixelsPerBeat, transportCurrentSpanIndex]);

  function resumeTimelineFollow() {
    forceFollowRef.current = true;
    setFollowEnabled(true);
    setFollowResumeRevision((revision) => revision + 1);
  }

  function onTimelineScroll() {
    const position = timelineViewportRef.current?.scrollLeft;
    if (position === undefined) return;
    if (isFollowScrollPosition(position, programmaticScrollRef.current)) {
      programmaticScrollRef.current = undefined;
      return;
    }
    programmaticScrollRef.current = undefined;
    setFollowEnabled(false);
  }
  function changeSelection(next: ProgressionVoicingSelection) {
    runtimeRequestRef.current += 1;
    auditionRequestRef.current += 1;
    transportRef.current?.stop();
    setSelection(next);
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
    const ready = createProgressionPracticeClockState(snapshot, {
      bpm: clockState.bpm,
      countInBars: runtimeCountInBars,
    });
    setRuntimeError(undefined);
    const anchorBeat = snapshot.events[seekAnchorIndex]?.startBeat ?? 0;
    const anchored = anchorBeat > 0
      ? reduceProgressionPracticeClock(snapshot, ready, {
        type: "SEEK", status: "stopped", absoluteBeat: runtimeCountInBars * practiceGroupBeats + anchorBeat, anchorBeat,
      })
      : ready;
    setClockState(reduceProgressionPracticeClock(snapshot, anchored, { type: "START" }));
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

  function seekToEvent(eventIndex: number) {
    if (!snapshot || !clockState || !snapshot.events[eventIndex]) return;
    const anchorBeat = snapshot.events[eventIndex]!.startBeat;
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
    setSeekAnchorIndex(eventIndex);
    setClockState((state) => state ? reduceProgressionPracticeClock(snapshot, state, {
      type: "SEEK", status: "stopped", absoluteBeat: state.countInBars * practiceGroupBeats + anchorBeat, anchorBeat,
    }) : state);
  }

  function selectTimelineCard(eventIndex: number) {
    if (!transportRef.current?.supportsSeek) { void auditionResolved(eventIndex, true); return; }
    const status = clockStateRef.current?.status;
    seekToEvent(eventIndex);
    if (status === "ready" || status === "stopped" || status === "paused") {
      // The clicked event index is passed directly; never resolve from asynchronously updated Current state.
      void auditionResolved(eventIndex, true);
    }
  }

  function seekToBeat(beat: number) {
    if (!snapshot) return;
    const eventIndex = chordIndexAtTimelineBeat(snapshot, beat);
    if (eventIndex !== undefined) seekToEvent(eventIndex);
  }

  function seekFromTimelineClick(event: MouseEvent<HTMLElement>) {
    if (!snapshot || !timelineViewportRef.current) return;
    const viewport = timelineViewportRef.current;
    const beat = (event.clientX - viewport.getBoundingClientRect().left + viewport.scrollLeft) / timelinePixelsPerBeat;
    seekToBeat(beat);
  }

  function seekFromOverviewClick(event: MouseEvent<HTMLElement>) {
    if (!snapshot) return;
    const rect = event.currentTarget.getBoundingClientRect();
    seekToBeat(((event.clientX - rect.left) / Math.max(1, rect.width)) * snapshot.lengthBeats);
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
        await launchRuntime(0, clockState.bpm);
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
    if (v2) setSeekAnchorIndex(0);
    runtimeRequestRef.current += 1;
    auditionRequestRef.current += 1;
    transportRef.current?.stop();
    setClockState((state) => state
      ? reduceProgressionPracticeClock(snapshot, state, { type: v2 ? "STOP_RESET" : "STOP" })
      : state);
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

  function toggleMetronome() {
    setMetronomeEnabled((enabled) => {
      transportRef.current?.setMetronomeEnabled(!enabled);
      return !enabled;
    });
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
      if (target instanceof Element && target.closest("input, select, textarea, [contenteditable='true'], [role='dialog']")) return;
      const key = event.key.toLowerCase();
      if (![" ", "arrowleft", "arrowright", "home", "end", "f", "m", "r", "escape"].includes(key)) return;
      event.preventDefault();
      if (key === " ") {
        if (active) pause();
        else if (paused) void resume();
        else void start();
      } else if (key === "escape") stop();
      else if (key === "f") resumeTimelineFollow();
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
                  language={language}
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
      <Surface className="shrink-0 px-3 py-1" data-testid="voicing-loop-controls">
        <div className="flex min-w-0 items-center gap-x-4 gap-y-2 overflow-x-auto whitespace-nowrap">
          <fieldset className="flex shrink-0 items-center gap-2" aria-describedby="voicing-loop-source-help">
            <legend className="lv-section-kicker mr-1 float-left">SOURCE</legend>
            <p id="voicing-loop-source-help" className="sr-only">{text.sourceHelp}</p>
            {sourceSelections.map((item) => {
              const pressed = item.id === "lesson-rules" ? lessonRulesSelected : selection === item.id;
              return (
                <Button
                  key={item.id}
                  size="sm"
                  variant={pressed ? "primary" : "secondary"}
                  aria-pressed={pressed}
                  onClick={() => changeSelection(item.id === "lesson-rules" ? "basic-full" : item.id)}
                >
                  {language === "ja" ? item.ja : item.en}
                </Button>
              );
            })}
          </fieldset>
          <fieldset className="flex shrink-0 items-center gap-2" aria-describedby="voicing-loop-study-help">
            <legend className="lv-section-kicker mr-1 float-left">STUDY</legend>
            <p id="voicing-loop-study-help" className="sr-only">{text.studyHelp}</p>
            {studySelections.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={lessonRulesSelected && studyCategory === item.id ? "primary" : "secondary"}
                aria-pressed={lessonRulesSelected ? studyCategory === item.id : false}
                aria-description={item.id === "teacher" ? text.teacherHelp : text.coreHelp}
                title={item.id === "teacher" ? text.teacherHelp : text.coreHelp}
                disabled={!lessonRulesSelected}
                onClick={() => changeStudyCategory(item.id)}
              >
                {language === "ja" ? item.ja : item.en}
              </Button>
            ))}
            <label
              className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] px-2 text-xs font-medium text-[var(--lv-text-secondary)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
              title={text.colorHelp}
            >
              <input
                type="checkbox"
                checked={colorEnabled}
                disabled={!lessonRulesSelected}
                aria-describedby="voicing-loop-color-help"
                onChange={(event) => {
                  const enabled = event.currentTarget.checked;
                  changeLessonModifier(() => setColorEnabled(enabled));
                }}
              />
              {text.colorModifier}
            </label>
            <span id="voicing-loop-color-help" className="sr-only">{text.colorHelp}</span>
            <label
              className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] px-2 text-xs font-medium text-[var(--lv-text-secondary)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
              title={text.openHelp}
            >
              <input
                type="checkbox"
                checked={openEnabled}
                disabled={!lessonRulesSelected}
                aria-describedby="voicing-loop-open-help"
                onChange={(event) => {
                  const enabled = event.currentTarget.checked;
                  changeLessonModifier(() => setOpenEnabled(enabled));
                }}
              />
              {text.openModifier}
            </label>
            <span id="voicing-loop-open-help" className="sr-only">{text.openHelp}</span>
          </fieldset>
          <fieldset className="flex shrink-0 items-center gap-2">
            <legend className="lv-section-kicker mr-1 float-left">DISPLAY</legend>
            <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label={text.displayMode}>
              <Button size="sm" variant={displayMode === "learn" ? "primary" : "secondary"} aria-pressed={displayMode === "learn"} onClick={() => setDisplayMode("learn")}>{text.learn}</Button>
              <Button size="sm" variant={displayMode === "recall" ? "primary" : "secondary"} aria-pressed={displayMode === "recall"} onClick={() => setDisplayMode("recall")}>{text.recall}</Button>
            </div>
            <label
              className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] px-2 text-xs font-medium text-[var(--lv-text-secondary)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
              title={text.optimizeHelp}
            >
              <input
                type="checkbox"
                checked={progressionOptimizationEnabled}
                disabled={!lessonRulesSelected}
                aria-describedby="voicing-loop-optimize-help"
                onChange={(event) => {
                  const enabled = event.currentTarget.checked;
                  changeLessonModifier(() => setProgressionOptimizationEnabled(enabled));
                }}
              />
              {text.optimizeProgression}
            </label>
            <span id="voicing-loop-optimize-help" className="sr-only">{text.optimizeHelp}</span>
            <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] px-2 text-xs font-medium text-[var(--lv-text-secondary)]">
              <input
                type="checkbox"
                checked={showFingering}
                onChange={(event) => setShowFingering(event.currentTarget.checked)}
              />
              {text.showFingering}
            </label>
          </fieldset>
        </div>
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
          <div className="h-[clamp(560px,72dvh,760px)] min-w-0 shrink-0 lg:h-[clamp(300px,36dvh,380px)]" data-testid="voicing-loop-current-next">
            <div className="grid h-full min-h-0 min-w-0 grid-rows-2 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,440px)] lg:grid-rows-1">
              <Surface variant="primary" className="h-full min-h-0 min-w-0 overflow-y-auto p-3" data-testid="voicing-loop-current-panel" tabIndex={0} aria-label={language === "ja" ? "現在のコード詳細" : "Current chord details"}>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="lv-section-kicker">{text.current} · {currentIndex + 1}/{snapshot.events.length}</p>
                    <span className="rounded border border-[var(--lv-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--lv-text-secondary)]" data-testid="voicing-loop-playback-choice" title={currentEvent?.playbackChoice ? undefined : (language === "ja" ? "保存時に再生方法が指定されていないカードです" : "Playback choice was not set when this card was saved")}>
                      {currentEvent?.playbackChoice ?? (language === "ja" ? "未設定（自動）" : "Auto (unspecified)")}
                    </span>
                    {currentEvent?.sourceNeedsReview
                      ? <span className="rounded border border-amber-400/40 px-2 py-0.5 text-[11px] text-amber-200" data-testid="voicing-loop-review-badge">{language === "ja" ? "要確認" : "Review"}</span>
                      : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {bulkSourcePreview && onBulkSourceApply ? (
                      <Button size="sm" variant="ghost" onClick={() => setBulkSourceOpen(true)}>
                        {language === "ja" ? "この進行をSOURCEに" : "Use SOURCE for progression"}
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
                    {language === "ja"
                      ? "左右各5音以内で全音を分けられないため、運指を表示できません。元の音は変更されません。"
                      : "The notes cannot be assigned within five per hand. Fingering is unavailable; source notes are unchanged."}
                  </p>
                ) : null}
                {displayMode === "learn" && currentVoicing ? (
                  <CurrentRuleExplanation explanation={currentVoicing.explanation} language={language}
                    onNextCandidate={() => changeCurrentCandidate(1)} onPreviousCandidate={() => changeCurrentCandidate(-1)} text={text} />
                ) : null}
              </Surface>
              <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
                <Surface className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3" data-testid="voicing-loop-next-panel" tabIndex={0} aria-label={language === "ja" ? "次のコード詳細" : "Next chord details"}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="lv-section-kicker">{text.next}</p>
                    <span className="text-xs font-semibold text-[var(--lv-text-muted)]" data-testid="voicing-loop-next-wait">
                      {remainingBeatsLabel(nextWaitBeats, language)}
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
                </Surface>
                <Surface className="h-[72px] min-w-0 shrink-0 overflow-hidden p-3" data-testid="voicing-loop-then-next">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="lv-section-kicker">{language === "ja" ? "その次" : "Then next"}</span>
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
                <Metric compact label={language === "ja" ? "コード" : "Chord"} testId="voicing-loop-position-metric" value={`${currentIndex + 1} / ${snapshot.events.length}`} />
                <Metric compact label={text.loop} value={text.loopLabel(projection?.loopCount ?? 0)} />
              </div>
              <div className="flex items-center gap-1 text-[var(--lv-text-muted)]">
                <button type="button" className={`rounded px-1.5 py-0.5 ${followEnabled ? "text-[var(--lv-accent)]" : "text-amber-200"}`}
                  aria-pressed={followEnabled} onClick={resumeTimelineFollow} data-testid="voicing-loop-follow">{followEnabled ? "FOLLOW" : "MANUAL · F"}</button>
                <span data-testid="voicing-loop-source-meter">{language === "ja" ? "元の拍子" : "Source meter"} {snapshot.meter.numerator}/{snapshot.meter.denominator}</span>
                <span className="ml-2">{language === "ja" ? "表示" : "View"}</span>
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
              onScroll={onTimelineScroll}
            >
              <div className="relative" style={{ width: `${snapshot.lengthBeats * timelinePixelsPerBeat}px` }}>
                <div className="relative mt-1 flex h-3 cursor-pointer overflow-hidden rounded bg-[var(--lv-bg)]" data-testid="voicing-loop-overview"
              role="button" tabIndex={0} aria-label={language === "ja" ? "進行の全体図から移動" : "Seek from progression overview"}
              onClick={seekFromOverviewClick} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); seekToBeat((projection?.progressionBeat ?? 0)); } }}>
              {Array.from({ length: totalGroups }, (_, index) => (
                <span key={index} className={`h-full flex-1 border-r border-[var(--lv-bg)] ${index < currentGroup - 1 ? "bg-teal-700" : index === currentGroup - 1 ? "bg-[var(--lv-accent)]" : "bg-slate-700"}`} />
              ))}
                </div>
                <div className="flex h-5 cursor-pointer border-b border-[var(--lv-border)] text-[10px] text-[var(--lv-text-muted)]" data-testid="voicing-loop-ruler"
                  role="button" tabIndex={0} aria-label={language === "ja" ? "目盛りから移動" : "Seek from ruler"}
                  onClick={seekFromTimelineClick} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); seekToBeat(projection?.progressionBeat ?? 0); } }}>
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
                  const selected = index === transportCurrentSpanIndex;
                  const auditioned = eventIndex >= 0 && eventIndex === auditionedIndex;
                  const degree = progressionPracticeDegreeLabel(event?.chord, targetKey);
                  const cardWidth = span.durationBeats * timelinePixelsPerBeat;
                  const compact = compactTimelineCard(cardWidth);
                  const showPreview = playable && cardWidth >= 96;
                  return (
                    <div key={event?.id ?? `rest-${span.startBeat}`} className="relative flex-none" style={{ width: `${span.durationBeats * timelinePixelsPerBeat}px` }}>
                    <button
                      ref={(element) => { timelineEventRefs.current[index] = element; }}
                      type="button"
                      data-testid="voicing-loop-event"
                      data-duration-beats={span.durationBeats}
                      data-span-kind={span.kind}
                      data-compact={compact}
                      title={event?.chord.label ?? restLabel}
                      style={{ width: `${cardWidth}px` }}
                      className={`relative flex h-[54px] w-full min-h-[54px] flex-none flex-col justify-start overflow-hidden rounded-[var(--lv-radius-sm)] border ${compact ? "px-0.5 pb-1 pt-1" : "px-2 pb-3 pt-1.5"} text-left text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)] disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] text-[var(--lv-accent)] shadow-[inset_0_0_0_1px_rgba(59,224,206,0.12)]" : auditioned ? "border-[var(--lv-accent)] bg-[var(--lv-surface-raised)] text-[var(--lv-text)]" : "border-[var(--lv-border)] bg-transparent text-[var(--lv-text-secondary)]"}`}
                      aria-current={selected ? "step" : undefined}
                      aria-pressed={auditioned}
                      aria-label={`${index + 1}/${snapshot.spans.length}: ${event?.chord.label ?? restLabel}${degree ? `, ${degree}` : ""}, ${practiceTimingLabel(span, snapshot.practiceGroupBeats ?? snapshot.meter.numerator, language)}.${event ? ` ${transportRef.current?.supportsSeek ? (language === "ja" ? "ここへ移動して試聴" : "Seek and audition") : text.auditionCard}` : ""}`}
                      disabled={!playable && !transportRef.current?.supportsSeek}
                      onClick={() => {
                        if (span.kind === "rest") seekToBeat(span.startBeat + 1e-6);
                        else selectTimelineCard(eventIndex);
                      }}
                    >
                      <span className="flex min-w-0 items-baseline gap-1">
                        {!compact ? <span className="shrink-0 text-[10px] font-normal text-[var(--lv-text-muted)]">{index + 1}</span> : null}
                        <span className={`min-w-0 leading-tight ${compact ? "block overflow-hidden text-ellipsis whitespace-nowrap text-[9px] tracking-tight" : "break-all text-sm"}`}>{event?.chord.label ?? restLabel}</span>
                      </span>
                      {!compact ? (
                        <>
                          <span data-testid="voicing-loop-event-timing" className={`absolute bottom-1 left-2 text-[10px] font-normal leading-3 ${selected ? "text-teal-200" : "text-[var(--lv-text-muted)]"}`}>
                            {compactDurationLabel(span.durationBeats, language)}
                          </span>
                          {degree ? <span className={`absolute bottom-1 text-[10px] font-bold leading-3 text-[var(--lv-accent)] ${showPreview ? "right-8" : "right-2"}`} data-testid="voicing-loop-event-degree">{degree}</span> : null}
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
                  { label: language === "ja" ? "左手の目安" : "Left-hand guide", color: "border-amber-400 bg-amber-400/30" },
                  { label: language === "ja" ? "右手の目安" : "Right-hand guide", color: "border-cyan-300 bg-cyan-300/30" },
                  { label: language === "ja" ? "押鍵中" : "Held", color: "border-teal-100 bg-teal-300" },
                  { label: language === "ja" ? "ペダル保持" : "Sustain", color: "border-sky-200 bg-sky-600" },
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
                language={language}
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
              ariaLabel={language === "ja" ? "SOURCEへの一括切り替え" : "Switch cards to SOURCE"}
              onClose={() => setBulkSourceOpen(false)}
              panelClassName="w-full max-w-md"
            >
              <div className="space-y-3 p-4">
                <h2 className="text-lg font-bold">{language === "ja" ? "この進行のカードをまとめてSOURCEにする" : "Switch eligible cards to SOURCE"}</h2>
                <p className="text-sm text-[var(--lv-text-secondary)]">
                  {language === "ja"
                    ? `対象 ${bulkSourcePreview.eligible}・変更 ${bulkSourcePreview.changed}・CUSTOM維持 ${bulkSourcePreview.skippedCustom}・元の音なし ${bulkSourcePreview.skippedMissingSource}`
                    : `Eligible ${bulkSourcePreview.eligible} · Changed ${bulkSourcePreview.changed} · CUSTOM preserved ${bulkSourcePreview.skippedCustom} · No source ${bulkSourcePreview.skippedMissingSource}`}
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setBulkSourceOpen(false)}>{language === "ja" ? "戻る" : "Cancel"}</Button>
                  <Button variant="primary" disabled={bulkSourcePreview.changed === 0} onClick={() => {
                    if (onBulkSourceApply()) setBulkSourceOpen(false);
                  }}>{language === "ja" ? "切り替える" : "Apply"}</Button>
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
                language={language}
                onCancel={() => setFingeringEditorOpen(false)}
                onChange={changeDraftFinger}
                onReset={resetCurrentFingering}
                onSave={saveCurrentFingering}
                text={text}
              />
            </Modal>
          ) : null}

          <Surface className="h-[92px] min-w-0 shrink-0 overflow-hidden px-2 py-1" data-testid="voicing-loop-transport">
            <div className="grid h-full min-w-0 grid-rows-2 gap-1">
              <div className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap" data-testid="voicing-loop-transport-primary">
              <BpmDragControl
                label={text.bpm}
                dragLabel={text.bpmDrag}
                value={clockState?.bpm ?? snapshot.bpm}
                onChange={changeBpm}
              />
              {activeTempoOrigin === "SMF_DEFAULT" || activeTempoOrigin === "PRACTICE_INITIAL" ? (
                <span className="shrink-0 text-[10px] text-[var(--lv-text-secondary)]" data-testid="voicing-loop-tempo-origin">
                  {tempoOriginLabel(activeTempoOrigin, language)}
                </span>
              ) : null}
              {sourceKey && targetTonicPitchClass !== undefined ? (
                <label className="inline-flex min-h-8 items-center gap-2 text-[10px] font-bold tracking-[0.08em] text-[var(--lv-text-muted)]" htmlFor="voicing-loop-key">
                  {text.key}
                  <select
                    id="voicing-loop-key"
                    className="lv-field-control min-h-8 w-32 px-2 text-xs"
                    value={targetTonicPitchClass}
                    onChange={(event) => changeTargetKey(Number(event.currentTarget.value))}
                  >
                    {keyOptions.map((key) => (
                      <option key={key.tonicPitchClass} value={key.tonicPitchClass}>
                        {key.labels[language]}{key.tonicPitchClass === sourceKey.tonicPitchClass ? ` (${text.originalKey})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="inline-flex min-h-8 items-center gap-1 text-[10px] font-bold tracking-[0.08em] text-[var(--lv-text-muted)]" role="group" aria-label={text.octave}>
                <span className="mr-1">{text.octave}</span>
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
                {text.countInBars}
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
                <Button size="md" variant="primary" disabled={!allEventsPlayable} onClick={() => void start()}><Play aria-hidden="true" size={16} />{text.start}</Button>
              ) : active ? (
                <Button size="md" variant="primary" onClick={pause}><Pause aria-hidden="true" size={16} />{text.pause}</Button>
              ) : (
                <Button size="md" variant="primary" onClick={() => void resume()}><Play aria-hidden="true" size={16} />{text.resume}</Button>
              )}
              <Button size="sm" className="min-h-9" variant="secondary" disabled={!active && !paused} onClick={() => void restart()}><RefreshCw aria-hidden="true" size={16} />{text.restart}</Button>
              <Button size="sm" className="min-h-9" variant="secondary" disabled={!active && !paused} onClick={stop}><Square aria-hidden="true" size={16} />{text.stop}</Button>
              <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] px-2 text-xs font-medium text-[var(--lv-text-secondary)] focus-within:text-[var(--lv-text)]">
                <input
                  type="checkbox"
                  checked={referenceSoundEnabled}
                  onChange={(event) => changeReferenceSound(event.currentTarget.checked)}
                />
                {text.referenceSound}
              </label>
              <Button size="sm" variant={metronomeEnabled ? "secondary" : "ghost"} aria-pressed={metronomeEnabled} onClick={toggleMetronome}>{text.metronome}: {metronomeEnabled ? "ON" : "OFF"}</Button>
              </div>
              <div className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-t border-[var(--lv-border)] pt-1" data-testid="voicing-loop-transport-midi-row">
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
          {plan ? <UnresolvedSummary plan={plan} snapshot={snapshot} language={language} /> : null}
          <ResolutionStatus resolution={currentResolution} language={language} />
          <div aria-hidden="true" className="h-4 shrink-0" data-testid="voicing-loop-bottom-safe-area" />
        </>
      )}
    </div>
  );
}

function BpmDragControl({
  dragLabel,
  label,
  onChange,
  value,
}: {
  readonly dragLabel: string;
  readonly label: string;
  readonly onChange: (value: number) => void;
  readonly value: number;
}) {
  const dragCleanup = useRef<() => void>();

  useEffect(() => () => dragCleanup.current?.(), []);

  function startDrag(event: React.PointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    dragCleanup.current?.();
    const pointerId = event.pointerId;
    const startValue = value;
    const startY = event.clientY;
    let lastValue = value;
    const cleanup = () => {
      window.removeEventListener("pointermove", moveDrag);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      if (dragCleanup.current === cleanup) dragCleanup.current = undefined;
    };
    const moveDrag = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const next = Math.max(30, Math.min(240, startValue + Math.round((startY - moveEvent.clientY) / 3)));
      if (next === lastValue) return;
      lastValue = next;
      moveEvent.preventDefault();
      onChange(next);
    };
    const endDrag = (endEvent: PointerEvent) => {
      if (endEvent.pointerId === pointerId) cleanup();
    };
    dragCleanup.current = cleanup;
    window.addEventListener("pointermove", moveDrag, { passive: false });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }

  return (
    <div className="inline-flex min-h-8 items-center gap-2 text-[10px] font-bold tracking-[0.08em] text-[var(--lv-text-muted)]">
      <label htmlFor="voicing-loop-bpm">{label}</label>
      <div
        className="relative"
      >
        <input
          id="voicing-loop-bpm"
          aria-describedby="voicing-loop-bpm-drag-help"
          className="lv-field-control min-h-8 w-20 px-2 pr-6 text-sm"
          type="number"
          min={30}
          max={240}
          value={value}
          onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 right-0 flex w-6 touch-none select-none items-center justify-center text-[var(--lv-text-muted)] cursor-ns-resize"
          data-testid="voicing-loop-bpm-drag"
          title={dragLabel}
          onPointerDown={startDrag}
        >
          <GripVertical size={16} />
        </span>
        <span className="sr-only" id="voicing-loop-bpm-drag-help">{dragLabel}</span>
      </div>
    </div>
  );
}

function practiceTimingLabel(
  event: Pick<ProgressionPracticeEvent, "startBeat" | "durationBeats">,
  practiceGroupBeats: number,
  language: AppLanguage,
): string {
  const group = Math.floor(event.startBeat / practiceGroupBeats) + 1;
  const beat = (event.startBeat % practiceGroupBeats) + 1;
  const beatLabel = formatPracticeBeat(beat);
  const durationLabel = formatPracticeBeat(event.durationBeats);
  return language === "ja"
    ? `${group}練習グループ・${beatLabel}拍目・${durationLabel}拍`
    : `Practice group ${group} · beat ${beatLabel} · ${durationLabel} ${event.durationBeats === 1 ? "beat" : "beats"}`;
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

function HandVoicingSummary({
  accidentalStyle, fingering, hand, isPersonal, pitches, showFingering, text, voicing,
}: {
  readonly accidentalStyle: NoteAccidentalStyle;
  readonly fingering?: RankedFingering;
  readonly hand: FingeringHand;
  readonly isPersonal: boolean;
  readonly pitches: readonly number[];
  readonly showFingering: boolean;
  readonly text: typeof copy.ja | typeof copy.en;
  readonly voicing: ResolvedProgressionPracticeVoicing;
}) {
  if (!pitches.length) return null;
  const prefix = hand === "left" ? "L" : "R";
  const handBorder = hand === "left" ? "border-amber-400/50 bg-amber-400/[0.08]" : "border-teal-300/50 bg-teal-300/[0.08]";
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
  readonly text: typeof copy.ja | typeof copy.en;
}) {
  if (!pitches.length) return null;
  const prefix = hand === "left" ? "L" : "R";
  const handBorder = hand === "left" ? "border-amber-400/60 bg-amber-400/[0.08]" : "border-[var(--lv-accent)] bg-teal-300/[0.08]";
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
  language,
  onCancel,
  onChange,
  onReset,
  onSave,
  text,
}: {
  readonly accidentalStyle: NoteAccidentalStyle;
  readonly draftFingers: Readonly<Record<FingeringHand, readonly FingerNumber[]>>;
  readonly fingerings: Readonly<Record<FingeringHand, RankedFingering | undefined>>;
  readonly language: AppLanguage;
  readonly onCancel: () => void;
  readonly onChange: (hand: FingeringHand, index: number, value: number) => void;
  readonly onReset: () => void;
  readonly onSave: () => void;
  readonly text: typeof copy.ja | typeof copy.en;
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
        {language === "ja" ? "音の低い順。Voicingの音程・オクターブは変わりません。" : "Low to high. Pitch and octave never change."}
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
  readonly text: typeof copy.ja | typeof copy.en;
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

function compactDurationLabel(value: number, language: AppLanguage): string {
  const formatted = formatPracticeBeat(value);
  if (language === "ja") return `${formatted}拍`;
  return `${formatted} ${value === 1 ? "beat" : "beats"}`;
}

function ProgressionChoice({
  candidate,
  language,
  onChoose,
  practiceLabel,
}: {
  readonly candidate: VoicingLoopVaultCandidate;
  readonly language: AppLanguage;
  readonly onChoose: () => void;
  readonly practiceLabel: string;
}) {
  const facts = [candidate.key, candidate.bpm === undefined ? undefined
    : `${candidate.bpm} BPM${candidate.tempoOrigin === "SMF_DEFAULT" || candidate.tempoOrigin === "PRACTICE_INITIAL"
      ? `（${tempoOriginLabel(candidate.tempoOrigin, language)}）` : ""}`].filter(Boolean).join(" · ");
  const unavailable = candidate.unavailableReason ? unavailableReasonLabel(candidate.unavailableReason, language) : undefined;
  const chords = candidate.chordLabels.join(" → ") || (language === "ja" ? "休符のみ" : "Rests only");
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

function tempoOriginLabel(origin: "SMF_DEFAULT" | "PRACTICE_INITIAL", language: AppLanguage): string {
  if (origin === "SMF_DEFAULT") return language === "ja" ? "SMF既定" : "SMF default";
  return language === "ja" ? "練習初期値" : "Practice initial value";
}

function unavailableReasonLabel(reason: NonNullable<VoicingLoopVaultCandidate["unavailableReason"]>, language: AppLanguage): string {
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
  const en: typeof ja = {
    "practice-capacity": "More than 256 practice groups. The saved Vault progression is retained.",
    "resource-budget": "Playback duration, beats, or events exceed the safety budget. The saved Vault progression is retained.",
    "unsupported-meter": "This meter is not supported in Voicing Loop.",
    "invalid-bpm": "BPM is outside the supported range.",
    "invalid-key": "The key metadata cannot be used for practice.",
    "empty-progression": "No playable chords are available.",
    "invalid-chord": "An unsupported chord structure is present.",
    "invalid-timing": "The progression timing cannot be used for practice.",
    "invalid-reference": "The Vault reference is unavailable.",
    "invalid-selection": "A practice mode cannot be selected.",
    "source-unavailable": "The saved progression could not be read.",
  };
  return (language === "ja" ? ja : en)[reason];
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
  language,
  onNextCandidate,
  onPreviousCandidate,
  text,
}: {
  readonly explanation?: VoicingRuleExplanation;
  readonly language: AppLanguage;
  readonly onNextCandidate: () => void;
  readonly onPreviousCandidate: () => void;
  readonly text: typeof copy.ja | typeof copy.en;
}) {
  if (!explanation || (!explanation.identity && !explanation.coverage && !explanation.candidateCount)) return null;
  const family = explanation.identity
    ? ruleFamilyLabel(explanation.identity.family, language)
    : sourceLabel(explanation.source);
  const coverage = explanation.coverage
    ? coverageLabel(explanation.coverage, language)
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
          <span className="px-1 font-semibold" aria-label={`${text.candidateHelp}: ${candidate}`}>Candidate {candidate}</span>
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
          <span><strong className="mr-1 text-[var(--lv-text-muted)]">{text.top}</strong>{topRoleLabel(explanation.topRole, language)}</span>
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

function ruleFamilyLabel(family: VoicingRuleFamily, language: AppLanguage): string {
  const labels: Record<VoicingRuleFamily, readonly [string, string]> = {
    "teacher-style": ["Teacher Style", "Teacher Style"],
    "family-core": ["Family Core", "Family Core"],
    "family-color": ["Family Color", "Family Color"],
    "open-spread": ["Open / Spread", "Open / Spread"],
    "teacher-open": ["Teacher Open", "Teacher Open"],
    "bass-guide-tones": ["Bass + Guide Tones", "Bass + Guide Tones"],
    "slash-bass-upper-structure": ["Slash Bass + Upper Structure", "Slash Bass + Upper Structure"],
    "characteristic-core": ["Characteristic Core", "Characteristic Core"],
    "dominant-upper-structure": ["Dominant + Upper Structure", "Dominant + Upper Structure"],
    "two-hand-open": ["Two-hand Open", "Two-hand Open"],
    "drop-2": ["Drop 2", "Drop 2"],
  };
  return labels[family][language === "ja" ? 0 : 1];
}

function coverageLabel(coverage: VoicingCoverage, language: AppLanguage): string {
  const labels: Record<VoicingCoverage, readonly [string, string]> = {
    literal: ["Literal", "Literal"],
    "performance-reduction": ["演奏用省略", "Performance Reduction"],
    "creative-enrichment": ["創造的追加", "Creative Enrichment"],
  };
  return labels[coverage][language === "ja" ? 0 : 1];
}

function topRoleLabel(role: VoicingTopContext | undefined, language: AppLanguage): string {
  switch (role) {
    case "fixed-melody": return language === "ja" ? "固定Melody" : "Fixed Melody";
    case "top-candidate": return "Top Candidate";
    case "normal-voicing-top":
    case undefined: return "Voicing Top";
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

function ResolutionStatus({ resolution, language }: { readonly resolution?: ProgressionPracticeVoicingResolution; readonly language: AppLanguage }) {
  if (!resolution || resolution.status === "SUPPORTED") return null;
  const text = copy[language];
  switch (resolution.status) {
    case "UNAVAILABLE":
      return <StatusMessage title={text.unavailable} tone="warning">{text.unavailableBody}</StatusMessage>;
    case "UNSUPPORTED_RULE":
      return <StatusMessage title={text.unsupported} tone="warning">{text.unsupportedBody}</StatusMessage>;
    case "GENERATION_ERROR":
      return <StatusMessage title={text.generationError} tone="error">{text.generationErrorBody}</StatusMessage>;
  }
}


function sessionStatus(status: ProgressionPracticeClockStatus | undefined, text: typeof copy.ja | typeof copy.en): string {
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

function UnresolvedSummary({ plan, snapshot, language }: {
  readonly plan: ProgressionPracticeVoicingPlan;
  readonly snapshot: ProgressionVoicingPracticeSnapshot;
  readonly language: AppLanguage;
}) {
  const unresolved = plan.events.flatMap((resolution, index) => resolution.status === "SUPPORTED"
    ? []
    : [{
        eventIndex: index,
        label: snapshot.events[index]?.chord.label ?? `${index + 1}`,
        status: resolution.status,
        reason: resolution.reason,
        detail: resolutionStatusLabel(resolution.status, snapshot, index, language),
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
    <StatusMessage title={copy[language].unresolvedSummary(unresolved.length)} tone="warning">
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
  language: AppLanguage,
): string {
  const text = copy[language];
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
