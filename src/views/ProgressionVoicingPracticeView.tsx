import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pause, Play, RefreshCw, Search, Settings, Square, Volume2 } from "lucide-react";
import { useStore } from "zustand";
import {
  formatMidiNoteForDisplay,
  type NoteAccidentalStyle,
} from "../components/music-keyboard";
import { Modal } from "../components/Modal";
import { PracticeKeyboard } from "../components/practice/PracticeKeyboard";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { Badge, Button, EmptyState, Field, SectionHeading, StatusMessage, Surface } from "../components/ui";
import {
  createProgressionPracticeClockState,
  projectProgressionPracticeClock,
  reduceProgressionPracticeClock,
  resolveProgressionPracticeVoicings,
  progressionPracticePlaybackNotes,
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
import type { AppLanguage } from "../domain/types";
import { accidentalPreferenceForKey } from "../domain/chords";
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
import { progressionFingeringHandTargets } from "../voicingPractice/fingeringDisplay";

const ALL_PITCH_CLASSES = Object.freeze(Array.from({ length: 12 }, (_, index) => index));
const EMPTY_NOTES: readonly number[] = Object.freeze([]);
const EMPTY_VAULT_PROGRESSIONS: readonly VoicingLoopVaultCandidate[] = Object.freeze([]);
const VOICING_LOOP_KEYBOARD_RANGE = Object.freeze({ minMidiNote: 36, maxMidiNote: 96 });
const TIMELINE_CARD_WIDTH_PX = 92;
const TIMELINE_CARD_GAP_PX = 6;

export interface ProgressionVoicingPracticeViewProps {
  readonly language: AppLanguage;
  readonly snapshots?: ProgressionVoicingPracticeSnapshots;
  readonly initialSelection?: ProgressionVoicingSelection;
  readonly monitorMidi?: boolean;
  readonly vaultProgressions?: readonly VoicingLoopVaultCandidate[];
  readonly onSelectProgression: (reference: ProgressionPracticeSourceReference) => boolean;
  readonly onEnterText: () => void;
  readonly openMidiSettings?: () => void;
  readonly transportFactory?: () => ProgressionVoicingTransportPort;
  readonly resolutionOptions?: ResolveProgressionPracticeVoicingsOptions;
}

const selections: readonly {
  readonly id: ProgressionVoicingSelection;
  readonly group: "MY" | "LESSON";
  readonly ja: string;
  readonly en: string;
}[] = [
  { id: "source-midi", group: "MY", ja: "Source MIDI", en: "Source MIDI" },
  { id: "custom", group: "MY", ja: "Custom", en: "Custom" },
  { id: "basic-shell", group: "LESSON", ja: "Basic Shell 1–7", en: "Basic Shell 1–7" },
  { id: "basic-full", group: "LESSON", ja: "Basic Full 1–7–3", en: "Basic Full 1–7–3" },
  { id: "full-shell", group: "LESSON", ja: "Full Shell Voicing", en: "Full Shell Voicing" },
  { id: "left-hand", group: "LESSON", ja: "Left-hand", en: "Left-hand" },
] as const;

const copy = {
  ja: {
    title: "Voicing Loop",
    description: "保存した進行とVoicingを、採点なしで何周でも練習します。",
    source: "Voicingを選択",
    sourceHelp: "MYは保存済みの音をそのまま使い、LESSONは承認済みの規則だけを使います。",
    basicShellHelp: "ルートと7度を左手だけで練習します。3度と右手ガイドはBasic Full 1–7–3で表示します。",
    fullShellHelp: "左手に1度と7度、右手に3度・5度・コード記号のテンションを配置します。複数のaltered tensionで手幅を超える場合のみ5度を省略し、スラッシュコードでは指定ベースを左手で保持します。",
    leftHandHelp: "上部コードのRootless A/Bを左手で練習します。スラッシュベースは独立した参照音として鳴り、練習対象には含みません。",
    current: "現在",
    next: "次",
    beat: "拍",
    countIn: "カウントイン",
    chordProgress: "コード",
    progressionProgress: "進行",
    position: "位置",
    timeline: "進行タイムライン",
    loop: "Loop",
    pitches: "PITCH",
    chordTone: "CHORD TONE",
    suggestedFingering: "おすすめ運指",
    finger: "FINGER",
    showFingering: "おすすめ運指を表示",
    rightHand: "RIGHT HAND",
    leftHand: "LEFT HAND",
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
    bpm: "BPM",
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
    unsupportedBody: "Source MIDI、Custom、または対応しているBasicへ切り替えてください。",
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
    positionLabel: (bar: number, total: number) => `${bar} / ${total} 小節`,
    nextSwitch: (beats: string) => `${beats}拍後に切り替わります`,
    beatLabel: (beat: number, total: number) => `${beat} / ${total} 拍`,
    loopLabel: (count: number) => `${count} 周完了`,
  },
  en: {
    title: "Voicing Loop",
    description: "Loop through a saved progression and voicing without scoring.",
    source: "Choose voicing",
    sourceHelp: "MY preserves saved notes; LESSON uses approved rules only.",
    basicShellHelp: "Practice root and seventh with the left hand only. Basic Full 1–7–3 adds the third and right-hand guide.",
    fullShellHelp: "Play root and seventh with the left hand, then place the third, fifth, and written tensions in the right hand. Only the fifth may be omitted for dense altered tensions; slash bass is preserved in the left hand.",
    leftHandHelp: "Practice the upper chord's Rootless A/B in the left hand. Slash bass plays as a separate reference, not a practice target.",
    current: "Current",
    next: "Next",
    beat: "Beat",
    countIn: "Count-in",
    chordProgress: "Chord",
    progressionProgress: "Progression",
    position: "Position",
    timeline: "Progression timeline",
    loop: "Loop",
    pitches: "PITCH",
    chordTone: "CHORD TONE",
    suggestedFingering: "Suggested Fingering",
    finger: "FINGER",
    showFingering: "Show Suggested Fingering",
    rightHand: "RIGHT HAND",
    leftHand: "LEFT HAND",
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
    bpm: "BPM",
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
    unsupportedBody: "Choose Source MIDI, Custom, or a supported Basic voicing.",
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
    positionLabel: (bar: number, total: number) => `Bar ${bar} / ${total}`,
    nextSwitch: (beats: string) => `Changes after ${beats} ${beats === "1" ? "beat" : "beats"}`,
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
  openMidiSettings,
  resolutionOptions,
  snapshots,
  transportFactory = createDefaultTransport,
  vaultProgressions = EMPTY_VAULT_PROGRESSIONS,
}: ProgressionVoicingPracticeViewProps) {
  const text = copy[language];
  const { sound: previewSound } = usePreviewSound();
  const [selection, setSelection] = useState<ProgressionVoicingSelection>(initialSelection);
  const snapshot = snapshots?.[selection];
  const progressionLoaded = Boolean(snapshots && Object.values(snapshots).some(Boolean));
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
  const defaultProgressions = recentProgressions.length
    ? recentProgressions
    : vaultProgressions.slice(0, 5);
  const visibleProgressions = query.trim()
    ? filteredProgressions
    : showAllProgressions ? vaultProgressions : defaultProgressions;
  const progressionListTitle = query.trim()
    ? text.results
    : showAllProgressions ? text.all : recentProgressions.length ? text.recent : text.saved;
  const plan = useMemo(
    () => snapshot ? resolveProgressionPracticeVoicings(snapshot, resolutionOptions) : undefined,
    [resolutionOptions, snapshot],
  );
  const [countInBars, setCountInBars] = useState<0 | 1 | 2>(1);
  const [clockState, setClockState] = useState(
    () => snapshot ? createProgressionPracticeClockState(snapshot, { countInBars }) : undefined,
  );
  const [displayMode, setDisplayMode] = useState<"learn" | "recall">("learn");
  const [showFingering, setShowFingering] = useState(true);
  const [fingeringPreferences, setFingeringPreferences] = useState(loadFingeringPreferences);
  const [draftFingers, setDraftFingers] = useState<Readonly<Record<FingeringHand, readonly FingerNumber[]>>>({
    left: [],
    right: [],
  });
  const [fingeringEditorOpen, setFingeringEditorOpen] = useState(false);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [referenceSoundEnabled, setReferenceSoundEnabled] = useState(true);
  const [auditionedIndex, setAuditionedIndex] = useState<number>();
  const [runtimeError, setRuntimeError] = useState<string>();
  const [midiReconnectError, setMidiReconnectError] = useState<string>();
  const transportRef = useRef<ProgressionVoicingTransportPort>();
  const runtimeRequestRef = useRef(0);
  const auditionRequestRef = useRef(0);
  const midiLeaseRef = useRef<LiveMidiActivationLease>();
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const timelineEventRefs = useRef<Array<HTMLButtonElement | null>>([]);
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
    setClockState(snapshot
      ? createProgressionPracticeClockState(snapshot, { countInBars })
      : undefined);
    return () => {
      runtimeRequestRef.current += 1;
      auditionRequestRef.current += 1;
      transport?.stop();
    };
  }, [countInBars, previewSound, snapshot]);

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
  const currentIndex = projection?.currentEventIndex ?? 0;
  const currentSpanIndex = projection?.currentSpanIndex ?? 0;
  const currentSpan = snapshot?.spans[currentSpanIndex];
  const restLabel = language === "ja" ? "休符" : "Rest";
  const nextIndex = projection?.nextEventIndex ?? (snapshot && snapshot.events.length > 1 ? 1 : 0);
  const currentEvent = snapshot?.events[currentIndex];
  const nextEvent = snapshot?.events[nextIndex];
  const currentResolution = plan?.events[currentIndex];
  const nextResolution = plan?.events[nextIndex];
  const currentVoicing = currentResolution?.status === "SUPPORTED" ? currentResolution.voicing : undefined;
  const nextVoicing = nextResolution?.status === "SUPPORTED" ? nextResolution.voicing : undefined;
  const currentHandTargets = currentVoicing
    ? progressionFingeringHandTargets(selection, currentVoicing)
    : { left: EMPTY_NOTES, right: EMPTY_NOTES };
  const nextHandTargets = nextVoicing
    ? progressionFingeringHandTargets(selection, nextVoicing)
    : { left: EMPTY_NOTES, right: EMPTY_NOTES };
  const leftFingeringById = useMemo(
    () => new Map(rankFingeringsForHand(snapshot, plan, selection, "left").map((entry) => [entry.id, entry])),
    [plan, selection, snapshot],
  );
  const rightFingeringById = useMemo(
    () => new Map(rankFingeringsForHand(snapshot, plan, selection, "right").map((entry) => [entry.id, entry])),
    [plan, selection, snapshot],
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
  const currentLeftPersonal = findPersonalFingering(fingeringPreferences, currentLeftFingering?.signature);
  const currentRightPersonal = findPersonalFingering(fingeringPreferences, currentRightFingering?.signature);
  const accidentalStyle: NoteAccidentalStyle = accidentalPreferenceForKey(snapshot?.key) ?? "flat";
  const keyboardRange = currentVoicing?.referenceBassNote === undefined
    ? VOICING_LOOP_KEYBOARD_RANGE
    : {
        minMidiNote: Math.min(VOICING_LOOP_KEYBOARD_RANGE.minMidiNote, currentVoicing.referenceBassNote),
        maxMidiNote: Math.max(VOICING_LOOP_KEYBOARD_RANGE.maxMidiNote, currentVoicing.referenceBassNote),
      };
  const keyboardFingerLabels = useMemo(() => {
    if (!showFingering || displayMode !== "learn") return undefined;
    const labels = new Map<number, string>();
    addKeyboardFingerLabels(labels, currentLeftFingering, "L");
    addKeyboardFingerLabels(labels, currentRightFingering, "R");
    return labels;
  }, [currentLeftFingering, currentRightFingering, displayMode, showFingering]);
  const active = clockState?.status === "running" || clockState?.status === "count-in";
  const paused = clockState?.status === "paused";
  const playheadX = currentSpanIndex * (TIMELINE_CARD_WIDTH_PX + TIMELINE_CARD_GAP_PX)
    + (projection?.chordProgress ?? 0) * TIMELINE_CARD_WIDTH_PX;
  const visualStepMilliseconds = Math.max(
    16,
    Math.min(140, 60_000 / (clockState?.bpm ?? snapshot?.bpm ?? 120) / 16),
  );
  const allEventsPlayable = Boolean(plan && snapshot?.spans.length)
    && plan!.events.every((resolution) => resolution.status === "SUPPORTED");
  const beatsPerBar = snapshot?.meter.numerator ?? 4;
  const currentBar = Math.floor((projection?.progressionBeat ?? 0) / beatsPerBar) + 1;
  const totalBars = Math.max(1, Math.ceil((snapshot?.lengthBeats ?? 1) / beatsPerBar));

  useEffect(() => {
    setFingeringEditorOpen(false);
  }, [currentEvent?.id, selection]);

  useEffect(() => {
    const viewport = timelineViewportRef.current;
    const eventElement = timelineEventRefs.current[currentSpanIndex];
    if (!viewport || !eventElement || viewport.clientWidth <= 0) return;
    const eventLeft = eventElement.offsetLeft;
    const eventRight = eventLeft + eventElement.offsetWidth;
    if (eventLeft < viewport.scrollLeft) viewport.scrollLeft = eventLeft;
    else if (eventRight > viewport.scrollLeft + viewport.clientWidth) {
      viewport.scrollLeft = eventRight - viewport.clientWidth;
    }
  }, [currentSpanIndex, snapshot]);
  function changeSelection(next: ProgressionVoicingSelection) {
    runtimeRequestRef.current += 1;
    auditionRequestRef.current += 1;
    transportRef.current?.stop();
    setSelection(next);
  }

  function chooseProgression(candidate: VoicingLoopVaultCandidate) {
    if (!onSelectProgression(candidate.sourceReference)) return;
    setRecentReferences(loadRecentVoicingLoopProgressions());
  }

  async function start() {
    if (!snapshot || !plan || !clockState || !allEventsPlayable) return;
    setRuntimeError(undefined);
    setClockState((state) => state
      ? reduceProgressionPracticeClock(snapshot, state, { type: "START" })
      : state);
    await launchRuntime(0, clockState.bpm);
  }

  async function launchRuntime(startBeat: number, bpm: number) {
    if (!snapshot || !plan) return;
    const request = ++runtimeRequestRef.current;
    try {
      await transportRef.current?.start({
        snapshot,
        plan,
        bpm,
        countInBars,
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
    runtimeRequestRef.current += 1;
    auditionRequestRef.current += 1;
    transportRef.current?.stop();
    setClockState((state) => state
      ? reduceProgressionPracticeClock(snapshot, state, { type: "STOP" })
      : state);
  }

  function changeBpm(value: number) {
    if (!snapshot || !clockState || !Number.isFinite(value) || value < 30 || value > 240) return;
    transportRef.current?.setBpm(value);
    setClockState((state) => state
      ? reduceProgressionPracticeClock(snapshot, state, { type: "SET_BPM", bpm: value })
      : state);
  }

  async function auditionResolved(index: number) {
    const resolution = plan?.events[index];
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
    <div className="min-w-0 space-y-4" data-testid="voicing-loop-workspace">
      <SectionHeading
        kicker="PRACTICE"
        title={text.title}
        description={text.description}
        action={<Badge tone="teal">{selectionLabel(selection)}</Badge>}
      />

      <Surface className="p-4 sm:p-5" data-testid="voicing-loop-controls">
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <fieldset className="min-w-0">
            <legend className="text-sm font-semibold text-[var(--lv-text)]">{text.source}</legend>
            <p className="mt-1 text-xs leading-5 text-[var(--lv-text-muted)]">{text.sourceHelp}</p>
            {(["MY", "LESSON"] as const).map((group) => (
              <div className="mt-4" key={group}>
                <p className="lv-section-kicker">{group}</p>
                <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                  {selections.filter((item) => item.group === group).map((item) => (
                    <Button
                      key={item.id}
                      size="sm"
                      variant={selection === item.id ? "primary" : "secondary"}
                      aria-pressed={selection === item.id}
                      onClick={() => changeSelection(item.id)}
                    >
                      {language === "ja" ? item.ja : item.en}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {selection === "basic-shell" || selection === "full-shell" || selection === "left-hand" ? (
              <p className="mt-3 max-w-3xl text-xs leading-5 text-[var(--lv-text-muted)]" data-testid="voicing-loop-selection-help">
                {selection === "basic-shell"
                  ? text.basicShellHelp
                  : selection === "full-shell"
                    ? text.fullShellHelp
                    : text.leftHandHelp}
              </p>
            ) : null}
          </fieldset>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--lv-text)]">{text.displayMode}</p>
            <div className="mt-2 flex min-w-0 flex-wrap gap-2" role="group" aria-label={text.displayMode}>
              <Button size="sm" variant={displayMode === "learn" ? "primary" : "secondary"} aria-pressed={displayMode === "learn"} onClick={() => setDisplayMode("learn")}>{text.learn}</Button>
              <Button size="sm" variant={displayMode === "recall" ? "primary" : "secondary"} aria-pressed={displayMode === "recall"} onClick={() => setDisplayMode("recall")}>{text.recall}</Button>
            </div>
            <label className="mt-4 inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--lv-text-secondary)]">
              <input
                type="checkbox"
                checked={showFingering}
                onChange={(event) => setShowFingering(event.currentTarget.checked)}
              />
              {text.showFingering}
            </label>
          </div>
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
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(15rem,0.8fr)]" data-testid="voicing-loop-current-next">
            <Surface variant="primary" className="min-w-0 p-5 sm:p-6">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="lv-section-kicker">{text.current} · {currentSpanIndex + 1}/{snapshot.spans.length}</p>
                  <h2 className="mt-2 break-words text-4xl font-bold tracking-tight text-[var(--lv-text)] sm:text-5xl">
                    {currentEvent?.chord.label ?? restLabel}
                  </h2>
                  <p className="sr-only" aria-live="polite" aria-atomic="true">{currentEvent?.chord.label ?? restLabel}</p>
                </div>
                {displayMode === "learn" && showFingering
                  && (currentLeftFingering || currentRightFingering) ? (
                    <Button size="sm" variant="secondary" onClick={openFingeringEditor}>
                      {text.editFingering}
                    </Button>
                  ) : null}
              </div>

              {displayMode === "learn" && currentVoicing ? (
                <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2" data-testid="voicing-loop-current-voicing">
                  <HandVoicingSummary
                    accidentalStyle={accidentalStyle}
                    fingering={currentLeftFingering}
                    hand="left"
                    isPersonal={Boolean(currentLeftPersonal)}
                    pitches={currentHandTargets.left}
                    text={text}
                    voicing={currentVoicing}
                    showFingering={showFingering}
                  />
                  <HandVoicingSummary
                    accidentalStyle={accidentalStyle}
                    fingering={currentRightFingering}
                    hand="right"
                    isPersonal={Boolean(currentRightPersonal)}
                    pitches={currentHandTargets.right}
                    text={text}
                    voicing={currentVoicing}
                    showFingering={showFingering}
                  />
                </div>
              ) : null}

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Metric
                  label={projection?.inCountIn ? text.countIn : text.beat}
                  value={projection?.inCountIn
                    ? text.beatLabel(projection.countInBeat ?? 1, snapshot.meter.numerator)
                    : text.beatLabel(projection?.beatInChord ?? 1, projection?.beatsInChord ?? Math.ceil(currentEvent?.durationBeats ?? 1))}
                >
                  <BeatIndicator
                    current={projection?.inCountIn ? projection.countInBeat ?? 1 : projection?.beatInChord ?? 1}
                    total={projection?.inCountIn ? snapshot.meter.numerator : projection?.beatsInChord ?? 1}
                    label={text.beat}
                  />
                </Metric>
                <Metric label={text.loop} value={text.loopLabel(projection?.loopCount ?? 0)} />
                <Metric label={text.position} value={text.positionLabel(currentBar, totalBars)} />
              </div>

              <div className="mt-5 space-y-3">
                <ProgressMeter
                  active={active}
                  label={text.chordProgress}
                  transitionMilliseconds={visualStepMilliseconds}
                  value={projection?.chordProgress ?? 0}
                />
                <ProgressMeter
                  active={active}
                  label={text.progressionProgress}
                  transitionMilliseconds={visualStepMilliseconds}
                  value={projection?.progressionProgress ?? 0}
                />
              </div>
            </Surface>

            <Surface className="min-w-0 p-5">
              <p className="lv-section-kicker">{text.next}</p>
              <p className="mt-3 break-words text-2xl font-bold text-[var(--lv-text)]">{nextEvent?.chord.label ?? restLabel}</p>
              {displayMode === "learn" && nextVoicing ? (
                <div className="mt-4 space-y-3 text-sm leading-5 text-[var(--lv-text-secondary)]" data-testid="voicing-loop-next-voicing">
                  <CompactHandVoicing
                    accidentalStyle={accidentalStyle}
                    fingering={nextLeftFingering}
                    hand="left"
                    pitches={nextHandTargets.left}
                    showFingering={showFingering}
                    text={text}
                  />
                  <CompactHandVoicing
                    accidentalStyle={accidentalStyle}
                    fingering={nextRightFingering}
                    hand="right"
                    pitches={nextHandTargets.right}
                    showFingering={showFingering}
                    text={text}
                  />
                </div>
              ) : null}
              <p className="mt-5 border-t border-[var(--lv-border)] pt-4 text-xs text-[var(--lv-text-muted)]">
                {text.nextSwitch(formatPracticeBeat(currentSpan?.durationBeats ?? 1))}
              </p>
            </Surface>
          </div>

          <Surface className="min-w-0 overflow-hidden p-4 sm:p-5" aria-label={text.progressionProgress} data-testid="voicing-loop-timeline">
            <div
              ref={timelineViewportRef}
              className="min-w-0 overflow-x-auto overflow-y-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)]"
              data-testid="voicing-loop-timeline-viewport"
              tabIndex={0}
              aria-label={text.timeline}
            >
              <div className="relative flex w-max min-w-full gap-1.5 py-2">
                <span
                  aria-hidden="true"
                  data-testid="voicing-loop-playhead"
                  className="pointer-events-none absolute inset-y-2 left-0 z-10 w-0.5 bg-[var(--lv-accent)] shadow-[0_0_12px_rgba(59,224,206,0.75)] motion-reduce:transition-none"
                  style={{
                    transform: `translateX(${playheadX}px)`,
                    transitionDuration: active ? `${visualStepMilliseconds}ms` : "0ms",
                    transitionProperty: "transform",
                    transitionTimingFunction: "linear",
                  }}
                >
                  <span data-testid="voicing-loop-playhead-marker" className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--lv-accent)] shadow-[0_0_10px_rgba(59,224,206,0.85)]" />
                </span>
                {snapshot.spans.map((span, index) => {
                  const eventIndex = span.kind === "chord" ? span.eventIndex : -1;
                  const event = snapshot.events[eventIndex];
                  const resolution = plan?.events[eventIndex];
                  const playable = resolution?.status === "SUPPORTED";
                  const selected = index === currentSpanIndex;
                  const auditioned = eventIndex >= 0 && eventIndex === auditionedIndex;
                  return (
                    <button
                      key={event?.id ?? `rest-${span.startBeat}`}
                      ref={(element) => { timelineEventRefs.current[index] = element; }}
                      type="button"
                      data-testid="voicing-loop-event"
                      data-duration-beats={span.durationBeats}
                      data-span-kind={span.kind}
                      className={`relative flex h-[46px] max-h-[46px] min-h-[46px] w-[92px] min-w-[92px] max-w-[92px] flex-none flex-col justify-start overflow-hidden rounded-[var(--lv-radius-sm)] border px-2 pb-3 pt-1.5 text-left text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)] disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] text-[var(--lv-accent)] shadow-[inset_0_0_0_1px_rgba(59,224,206,0.12)]" : auditioned ? "border-[var(--lv-accent)] bg-[var(--lv-surface-raised)] text-[var(--lv-text)]" : "border-[var(--lv-border)] bg-transparent text-[var(--lv-text-secondary)]"}`}
                      aria-current={selected ? "step" : undefined}
                      aria-pressed={auditioned}
                      aria-label={`${index + 1}/${snapshot.spans.length}: ${event?.chord.label ?? restLabel}, ${practiceTimingLabel(span, snapshot.meter.numerator, language)}.${event ? ` ${text.auditionCard}` : ""}`}
                      disabled={!playable}
                      onClick={() => void auditionResolved(eventIndex)}
                    >
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="shrink-0 text-[10px] font-normal text-[var(--lv-text-muted)]">{index + 1}</span>
                        <span className="min-w-0 truncate">{event?.chord.label ?? restLabel}</span>
                      </span>
                      <span
                        data-testid="voicing-loop-event-timing"
                        className={`mt-0.5 block truncate whitespace-nowrap text-[10px] font-normal leading-3 ${selected ? "text-teal-200" : "text-[var(--lv-text-muted)]"}`}
                      >
                        {compactDurationLabel(span.durationBeats, language)}
                      </span>
                      <span aria-hidden="true" data-testid="voicing-loop-event-beat-rail" className="absolute inset-x-2 bottom-1 flex h-0.5 gap-0.5 opacity-60">
                        {Array.from({ length: Math.max(1, Math.min(16, Math.ceil(span.durationBeats))) }, (_, beatIndex) => (
                          <span
                            key={beatIndex}
                            className={`h-0.5 min-w-0 flex-1 rounded-full ${selected ? "bg-[var(--lv-accent)]" : "bg-slate-600"}`}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Surface>

          {runtimeError ? <StatusMessage title={text.playbackError} tone="error">{runtimeError}</StatusMessage> : null}
          {plan ? <UnresolvedSummary plan={plan} snapshot={snapshot} language={language} /> : null}
          <ResolutionStatus resolution={currentResolution} language={language} />

          <Surface className="min-w-0 p-4 sm:p-5" data-testid="voicing-loop-detail">
            <SectionHeading
              level={3}
              title={currentEvent?.chord.label ?? restLabel}
              description={displayMode === "learn" && currentVoicing
                ? `${text.pitches}: ${currentVoicing.notes.map((note) => formatMidiNoteForDisplay(note.midiNote, "fl-studio", accidentalStyle)).join(" · ")} · ${text.chordTone}: ${currentVoicing.notes.map((note) => note.degree ?? "—").join(" · ")}`
                : undefined}
              action={(
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
            />
            <div className="mt-5 min-w-0">
              <PracticeKeyboard
                range={keyboardRange}
                guideNotes={currentVoicing?.midiNotes ?? EMPTY_NOTES}
                referenceBassNote={currentVoicing?.referenceBassNote}
                leftHandGuideNotes={currentHandTargets.left}
                rightHandGuideNotes={currentHandTargets.right}
                allowedPitchClasses={ALL_PITCH_CLASSES}
                requiredPitchClasses={EMPTY_NOTES}
                level={displayMode === "learn" ? 1 : 4}
                accidentalStyle={accidentalStyle}
                language={language}
                concealNoteNames={displayMode === "recall"}
                interactionMode="neutral-monitor"
                fingerLabels={keyboardFingerLabels}
                keyboardLayout="wide-61"
              />
            </div>
          </Surface>

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

          <Surface className="p-4 sm:p-5" data-testid="voicing-loop-transport">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field htmlFor="voicing-loop-bpm" label={text.bpm}>
                <input
                  id="voicing-loop-bpm"
                  className="lv-field-control px-3"
                  type="number"
                  min={30}
                  max={240}
                  value={clockState?.bpm ?? snapshot.bpm}
                  onChange={(event) => changeBpm(event.currentTarget.valueAsNumber)}
                />
              </Field>
              <Field htmlFor="voicing-loop-count-in" label={text.countInBars}>
                <select
                  id="voicing-loop-count-in"
                  className="lv-field-control px-3"
                  value={countInBars}
                  disabled={active || paused}
                  onChange={(event) => setCountInBars(Number(event.currentTarget.value) as 0 | 1 | 2)}
                >
                  <option value={0}>{text.noCountIn}</option>
                  <option value={1}>{text.oneBar}</option>
                  <option value={2}>{text.twoBars}</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-[var(--lv-text-secondary)]">{sessionStatus(clockState?.status, text)}</p>
                  <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--lv-text-secondary)] focus-within:text-[var(--lv-text)]">
                    <input
                      type="checkbox"
                      checked={referenceSoundEnabled}
                      onChange={(event) => changeReferenceSound(event.currentTarget.checked)}
                    />
                    {text.referenceSound}
                  </label>
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                  {!active && !paused ? (
                    <Button variant="primary" disabled={!allEventsPlayable} onClick={() => void start()}><Play aria-hidden="true" size={16} />{text.start}</Button>
                  ) : active ? (
                    <Button variant="primary" onClick={pause}><Pause aria-hidden="true" size={16} />{text.pause}</Button>
                  ) : (
                    <Button variant="primary" onClick={() => void resume()}><Play aria-hidden="true" size={16} />{text.resume}</Button>
                  )}
                  <Button variant="secondary" disabled={!active && !paused} onClick={() => void restart()}><RefreshCw aria-hidden="true" size={16} />{text.restart}</Button>
                  <Button variant="secondary" disabled={!active && !paused} onClick={stop}><Square aria-hidden="true" size={16} />{text.stop}</Button>
                  <Button variant={metronomeEnabled ? "secondary" : "ghost"} aria-pressed={metronomeEnabled} onClick={toggleMetronome}>{text.metronome}: {metronomeEnabled ? "ON" : "OFF"}</Button>
                  <span className={`inline-flex min-h-10 items-center gap-1.5 px-1 text-sm ${midiStatus === "connected" ? "text-teal-200" : "text-amber-200"}`} data-testid="voicing-loop-midi-status">
                    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${midiStatus === "connected" ? "bg-teal-300" : "bg-amber-300"}`} />
                    <span className="font-semibold">{text.midi}</span>
                    <span>{midiStatus === "connected"
                      ? `${text.connected}${selectedMidiDevice ? ` · ${selectedMidiDevice.name}` : ""}`
                      : midiStatus === "connecting" ? text.connecting : text.disconnected}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => void reconnectMidi()}><RefreshCw aria-hidden="true" size={16} />{text.reconnect}</Button>
                  <Button variant="ghost" size="sm" onClick={openMidiSettings}><Settings aria-hidden="true" size={16} />{text.settings}</Button>
                </div>
                {midiReconnectError || midiStoreError ? <p className="mt-2 text-xs text-amber-200">{midiReconnectError ?? midiStoreError}</p> : null}
              </div>
            </div>
          </Surface>

        </>
      )}
    </div>
  );
}

function practiceTimingLabel(
  event: Pick<ProgressionPracticeEvent, "startBeat" | "durationBeats">,
  beatsPerBar: number,
  language: AppLanguage,
): string {
  const bar = Math.floor(event.startBeat / beatsPerBar) + 1;
  const beat = (event.startBeat % beatsPerBar) + 1;
  const beatLabel = formatPracticeBeat(beat);
  const durationLabel = formatPracticeBeat(event.durationBeats);
  return language === "ja"
    ? `${bar}小節・${beatLabel}拍目・${durationLabel}拍`
    : `Bar ${bar} · beat ${beatLabel} · ${durationLabel} ${event.durationBeats === 1 ? "beat" : "beats"}`;
}

function rankFingeringsForHand(
  snapshot: ProgressionVoicingPracticeSnapshot | undefined,
  plan: ProgressionPracticeVoicingPlan | undefined,
  selection: ProgressionVoicingSelection,
  hand: FingeringHand,
): ReturnType<typeof rankCyclicFingerings> {
  if (!snapshot || !plan) return [];
  const events = snapshot.events.flatMap((event, index) => {
    const resolution = plan.events[index];
    if (resolution?.status !== "SUPPORTED") return [];
    const pitches = progressionFingeringHandTargets(selection, resolution.voicing)[hand];
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

function HandVoicingSummary({
  accidentalStyle,
  fingering,
  hand,
  isPersonal,
  pitches,
  showFingering,
  text,
  voicing,
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
  const handBorder = hand === "left" ? "border-amber-400/40" : "border-teal-300/40";
  const handText = hand === "left" ? "text-amber-200" : "text-teal-200";
  return (
    <section
      className={`min-w-0 rounded-[var(--lv-radius-sm)] border bg-[var(--lv-bg-subtle)] p-3 ${handBorder}`}
      data-testid={`voicing-loop-${hand}-hand`}
    >
      <p className={`text-xs font-bold tracking-[0.12em] ${handText}`}>
        {hand === "left" ? text.leftHand : text.rightHand}
      </p>
      <dl className="mt-2 grid min-w-0 gap-1 text-sm leading-5">
        <HandFact label={text.pitches} value={formatPitchList(pitches, accidentalStyle)} />
        <HandFact label={text.chordTone} value={formatChordToneList(voicing, pitches)} />
        {showFingering ? (
          <HandFact
            label={text.finger}
            value={fingering
              ? `${fingering.fingers.map((finger) => `${prefix}${finger}`).join(" · ")} (${isPersonal ? text.personal : text.automatic})`
              : text.fingeringUnavailable}
            emphasize={Boolean(fingering)}
          />
        ) : null}
      </dl>
    </section>
  );
}

function CompactHandVoicing({
  accidentalStyle,
  fingering,
  hand,
  pitches,
  showFingering,
  text,
}: {
  readonly accidentalStyle: NoteAccidentalStyle;
  readonly fingering?: RankedFingering;
  readonly hand: FingeringHand;
  readonly pitches: readonly number[];
  readonly showFingering: boolean;
  readonly text: typeof copy.ja | typeof copy.en;
}) {
  if (!pitches.length) return null;
  const prefix = hand === "left" ? "L" : "R";
  const handBorder = hand === "left" ? "border-amber-400/60" : "border-[var(--lv-accent)]";
  const handText = hand === "left" ? "text-amber-200" : "text-[var(--lv-accent)]";
  return (
    <div className={`min-w-0 border-l-2 pl-3 ${handBorder}`} data-testid={`voicing-loop-next-${hand}-hand`}>
      <p className={`text-xs font-bold tracking-[0.1em] ${handText}`}>
        {hand === "left" ? text.leftHand : text.rightHand}
      </p>
      <p className="mt-1 break-words">{text.pitches}: {formatPitchList(pitches, accidentalStyle)}</p>
      {showFingering ? (
        <p className="break-words font-semibold text-teal-200">
          {text.finger}: {fingering
            ? fingering.fingers.map((finger) => `${prefix}${finger}`).join(" · ")
            : text.fingeringUnavailable}
        </p>
      ) : null}
    </div>
  );
}

function HandFact({
  emphasize = false,
  label,
  value,
}: {
  readonly emphasize?: boolean;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="grid min-w-0 gap-1 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
      <dt className="text-xs font-semibold text-[var(--lv-text-muted)]">{label}</dt>
      <dd className={`min-w-0 break-words ${emphasize ? "font-semibold text-teal-200" : "text-[var(--lv-text-secondary)]"}`}>{value}</dd>
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
      <p className="mt-2 text-xs leading-5 text-[var(--lv-text-muted)]">
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
            <label key={pitch} className="min-w-[4.5rem] flex-1 text-xs text-[var(--lv-text-muted)]">
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

function BeatIndicator({ current, label, total }: { current: number; label: string; total: number }) {
  const safeTotal = Math.max(1, Math.ceil(total));
  const activeIndex = Math.min(safeTotal - 1, Math.max(0, Math.floor(current) - 1));
  const windowStart = Math.floor(activeIndex / 16) * 16;
  return (
    <span
      className="mt-2 flex min-w-0 flex-wrap gap-2"
      data-testid="voicing-loop-beat-indicator"
      role="img"
      aria-label={`${label} ${activeIndex + 1} / ${safeTotal}`}
    >
      <span className="flex flex-wrap gap-2" aria-hidden="true">
        {Array.from({ length: Math.min(16, safeTotal - windowStart) }, (_, offset) => windowStart + offset).map((index) => (
          <span
            key={index}
            data-active={index === activeIndex ? "true" : "false"}
            className={`h-2.5 w-2.5 rounded-full border ${index === activeIndex ? "border-[var(--lv-accent)] bg-[var(--lv-accent)]" : "border-[var(--lv-border-strong)] bg-transparent"}`}
          />
        ))}
      </span>
    </span>
  );
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
  const facts = [candidate.key, `${candidate.bpm} BPM`].filter(Boolean).join(" · ");
  const chords = candidate.chordLabels.join(" → ") || (language === "ja" ? "休符のみ" : "Rests only");
  return (
    <button
      type="button"
      data-testid="voicing-loop-progression-choice"
      className="w-full min-w-0 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] bg-[var(--lv-bg-subtle)] p-3 text-left hover:border-[var(--lv-accent)] hover:bg-[var(--lv-surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)]"
      aria-label={`${candidate.title}. ${facts}. ${chords}. ${practiceLabel}`}
      onClick={onChoose}
    >
      <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 break-words text-sm font-semibold text-[var(--lv-text)]">{candidate.title}</span>
        <span className="shrink-0 text-xs text-[var(--lv-text-muted)]">{facts}</span>
      </span>
      <span className="mt-1 line-clamp-2 break-words text-xs leading-5 text-[var(--lv-text-secondary)]">{chords}</span>
      <span className="mt-2 block text-xs font-semibold text-[var(--lv-accent)]">{practiceLabel}</span>
    </button>
  );
}

function sameReferences(
  left: readonly ProgressionPracticeSourceReference[],
  right: readonly ProgressionPracticeSourceReference[],
): boolean {
  return left.length === right.length
    && left.every((reference, index) => voicingLoopSourceId(reference) === voicingLoopSourceId(right[index]!));
}

function Metric({ children, label, value }: { readonly children?: ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 border-l-2 border-[var(--lv-accent)] pl-3">
      <p className="text-xs text-[var(--lv-text-muted)]">{label}</p>
      <p className="mt-1 break-words text-base font-semibold text-[var(--lv-text)]">{value}</p>
      {children}
    </div>
  );
}

function ProgressMeter({
  active,
  label,
  transitionMilliseconds,
  value,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly transitionMilliseconds: number;
  readonly value: number;
}) {
  const normalized = Math.max(0, Math.min(1, value));
  const percent = Math.round(normalized * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-xs text-[var(--lv-text-muted)]"><span>{label}</span><span>{percent}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--lv-bg-subtle)]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div
          className="h-full origin-left bg-[var(--lv-accent)] motion-reduce:transition-none"
          data-testid="voicing-loop-progress-fill"
          style={{
            transform: `scaleX(${normalized})`,
            transitionDuration: active ? `${transitionMilliseconds}ms` : "0ms",
            transitionProperty: "transform",
            transitionTimingFunction: "linear",
          }}
        />
      </div>
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

function selectionLabel(selection: ProgressionVoicingSelection): string {
  switch (selection) {
    case "source-midi": return "Source MIDI";
    case "custom": return "Custom";
    case "basic-shell": return "Basic Shell 1–7";
    case "basic-full": return "Basic Full 1–7–3";
    case "full-shell": return "Full Shell Voicing";
    case "left-hand": return "Left-hand";
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
  return new ProgressionVoicingTransport();
}
