import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RefreshCw, Search, Square, Volume2 } from "lucide-react";
import { useStore } from "zustand";
import {
  computePracticeKeyboardRange,
  formatMidiNoteForDisplay,
} from "../components/music-keyboard";
import { PracticeKeyboard } from "../components/practice/PracticeKeyboard";
import { Badge, Button, EmptyState, Field, SectionHeading, StatusMessage, Surface } from "../components/ui";
import {
  createProgressionPracticeClockState,
  projectProgressionPracticeClock,
  reduceProgressionPracticeClock,
  resolveProgressionPracticeVoicings,
  type ResolveProgressionPracticeVoicingsOptions,
  type ProgressionPracticeVoicingResolution,
  type ProgressionPracticeVoicingPlan,
  type ProgressionPracticeClockStatus,
  type ProgressionPracticeEvent,
  type ProgressionVoicingPracticeSnapshot,
  type ProgressionVoicingPracticeSnapshots,
  type ProgressionVoicingSelection,
  filterVoicingLoopVaultCandidates,
  voicingLoopSourceId,
  type ProgressionPracticeSourceReference,
  type VoicingLoopVaultCandidate,
} from "../domain/progressionVoicingPractice";
import type { AppLanguage } from "../domain/types";
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

const ALL_PITCH_CLASSES = Object.freeze(Array.from({ length: 12 }, (_, index) => index));
const EMPTY_NOTES: readonly number[] = Object.freeze([]);
const EMPTY_VAULT_PROGRESSIONS: readonly VoicingLoopVaultCandidate[] = Object.freeze([]);

export interface ProgressionVoicingPracticeViewProps {
  readonly language: AppLanguage;
  readonly snapshots?: ProgressionVoicingPracticeSnapshots;
  readonly initialSelection?: ProgressionVoicingSelection;
  readonly monitorMidi?: boolean;
  readonly vaultProgressions?: readonly VoicingLoopVaultCandidate[];
  readonly onSelectProgression: (reference: ProgressionPracticeSourceReference) => boolean;
  readonly onEnterText: () => void;
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
  { id: "left-hand", group: "LESSON", ja: "Left-hand", en: "Left-hand" },
] as const;

const copy = {
  ja: {
    title: "Voicing Loop",
    description: "保存した進行とVoicingを、採点なしで何周でも練習します。",
    source: "Voicingを選択",
    sourceHelp: "MYは保存済みの音をそのまま使い、LESSONは承認済みの規則だけを使います。",
    current: "現在",
    next: "次",
    beat: "拍",
    countIn: "カウントイン",
    chordProgress: "コード",
    progressionProgress: "進行",
    loop: "Loop",
    pitches: "構成音",
    degrees: "度数",
    learn: "Learn（Voicing表示）",
    recall: "Recall（コード名のみ）",
    displayMode: "Voicing表示モード",
    bpm: "BPM",
    metronome: "メトロノーム",
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
    generationErrorStatus: "生成エラー",
    unresolvedSummary: (count: number) => `${count}個のコードを再生できません`,
    midiOn: "MIDI monitor 接続中",
    midiOff: "MIDI monitor は任意です",
    beatLabel: (beat: number, total: number) => `${beat} / ${total} 拍`,
    loopLabel: (count: number) => `${count} 周完了`,
  },
  en: {
    title: "Voicing Loop",
    description: "Loop through a saved progression and voicing without scoring.",
    source: "Choose voicing",
    sourceHelp: "MY preserves saved notes; LESSON uses approved rules only.",
    current: "Current",
    next: "Next",
    beat: "Beat",
    countIn: "Count-in",
    chordProgress: "Chord",
    progressionProgress: "Progression",
    loop: "Loop",
    pitches: "Pitches",
    degrees: "Degrees",
    learn: "Learn (show voicing)",
    recall: "Recall (chord only)",
    displayMode: "Voicing display mode",
    bpm: "BPM",
    metronome: "Metronome",
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
    generationErrorStatus: "Generation error",
    unresolvedSummary: (count: number) => `${count} chords cannot be played`,
    midiOn: "MIDI monitor connected",
    midiOff: "MIDI monitor is optional",
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
  resolutionOptions,
  snapshots,
  transportFactory = createDefaultTransport,
  vaultProgressions = EMPTY_VAULT_PROGRESSIONS,
}: ProgressionVoicingPracticeViewProps) {
  const text = copy[language];
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
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [runtimeError, setRuntimeError] = useState<string>();
  const transportRef = useRef<ProgressionVoicingTransportPort>();
  const runtimeRequestRef = useRef(0);
  const midiLeaseRef = useRef<LiveMidiActivationLease>();
  if (!transportRef.current) transportRef.current = transportFactory();
  const midiStatus = useStore(defaultLiveMidiStore, (state) => state.status);

  useEffect(() => {
    const transport = transportRef.current;
    runtimeRequestRef.current += 1;
    transport?.stop();
    setRuntimeError(undefined);
    setClockState(snapshot
      ? createProgressionPracticeClockState(snapshot, { countInBars })
      : undefined);
    return () => {
      runtimeRequestRef.current += 1;
      transport?.stop();
    };
  }, [countInBars, snapshot]);

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
  const nextIndex = projection?.nextEventIndex ?? (snapshot && snapshot.events.length > 1 ? 1 : 0);
  const currentEvent = snapshot?.events[currentIndex];
  const nextEvent = snapshot?.events[nextIndex];
  const currentResolution = plan?.events[currentIndex];
  const currentVoicing = currentResolution?.status === "SUPPORTED" ? currentResolution.voicing : undefined;
  const guideVoicings = useMemo(
    () => plan?.events.flatMap((resolution) => resolution.status === "SUPPORTED" ? [resolution.voicing.midiNotes] : []) ?? [],
    [plan],
  );
  const keyboardRange = useMemo(() => computePracticeKeyboardRange(guideVoicings), [guideVoicings]);
  const active = clockState?.status === "running" || clockState?.status === "count-in";
  const paused = clockState?.status === "paused";
  const allEventsPlayable = Boolean(plan?.events.length)
    && plan!.events.every((resolution) => resolution.status === "SUPPORTED");
  function changeSelection(next: ProgressionVoicingSelection) {
    runtimeRequestRef.current += 1;
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

  function resume() {
    if (!snapshot || !clockState) return;
    const resumed = transportRef.current?.resume() ?? false;
    setClockState((state) => state
      ? reduceProgressionPracticeClock(snapshot, state, { type: "RESUME" })
      : state);
    if (!resumed) void launchRuntime(clockState.transportBeat, clockState.bpm);
  }

  function restart() {
    if (!snapshot || !clockState) return;
    const restarted = transportRef.current?.restart() ?? false;
    setClockState((state) => state
      ? reduceProgressionPracticeClock(snapshot, state, { type: "RESTART" })
      : state);
    if (!restarted) {
      runtimeRequestRef.current += 1;
      void launchRuntime(0, clockState.bpm);
    }
  }

  function stop() {
    if (!snapshot) return;
    runtimeRequestRef.current += 1;
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

  async function auditionCurrent() {
    if (!snapshot || !currentVoicing || active || paused) return;
    const request = ++runtimeRequestRef.current;
    setRuntimeError(undefined);
    try {
      await transportRef.current?.audition(currentVoicing.midiNotes);
    } catch {
      if (runtimeRequestRef.current !== request) return;
      transportRef.current?.stop();
      setClockState((state) => state
        ? reduceProgressionPracticeClock(snapshot, state, { type: "STOP" })
        : state);
      setRuntimeError(text.playbackErrorBody);
    }
  }

  function toggleMetronome() {
    setMetronomeEnabled((enabled) => {
      transportRef.current?.setMetronomeEnabled(!enabled);
      return !enabled;
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

      <Surface className="p-4 sm:p-5">
        <fieldset>
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
        </fieldset>
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
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(15rem,0.8fr)]">
            <Surface variant="primary" className="min-w-0 p-5 sm:p-6">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="lv-section-kicker">{text.current} · {currentIndex + 1}/{snapshot.events.length}</p>
                  <h2 className="mt-2 break-words text-4xl font-bold tracking-tight text-[var(--lv-text)] sm:text-5xl">
                    {currentEvent?.chord.label}
                  </h2>
                  <p className="sr-only" aria-live="polite" aria-atomic="true">{currentEvent?.chord.label}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Metric
                  label={projection?.inCountIn ? text.countIn : text.beat}
                  value={projection?.inCountIn
                    ? text.beatLabel(projection.countInBeat ?? 1, snapshot.meter.numerator)
                    : text.beatLabel(projection?.beatInChord ?? 1, projection?.beatsInChord ?? Math.ceil(currentEvent?.durationBeats ?? 1))}
                />
                <Metric label={text.progressionProgress} value={`${Math.round((projection?.progressionProgress ?? 0) * 100)}%`} />
                <Metric label={text.loop} value={text.loopLabel(projection?.loopCount ?? 0)} />
              </div>

              <div className="mt-5 space-y-3">
                <ProgressMeter label={text.chordProgress} value={projection?.chordProgress ?? 0} />
                <ProgressMeter label={text.progressionProgress} value={projection?.progressionProgress ?? 0} />
              </div>
            </Surface>

            <Surface className="min-w-0 p-5">
              <p className="lv-section-kicker">{text.next}</p>
              <p className="mt-3 break-words text-2xl font-bold text-[var(--lv-text)]">{nextEvent?.chord.label}</p>
              <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label={text.displayMode}>
                <Button size="sm" variant={displayMode === "learn" ? "primary" : "secondary"} aria-pressed={displayMode === "learn"} onClick={() => setDisplayMode("learn")}>{text.learn}</Button>
                <Button size="sm" variant={displayMode === "recall" ? "primary" : "secondary"} aria-pressed={displayMode === "recall"} onClick={() => setDisplayMode("recall")}>{text.recall}</Button>
              </div>
              <p className="mt-5 text-xs text-[var(--lv-text-muted)]">
                {midiStatus === "connected" ? text.midiOn : text.midiOff}
              </p>
            </Surface>
          </div>

          {runtimeError ? <StatusMessage title={text.playbackError} tone="error">{runtimeError}</StatusMessage> : null}
          {plan ? <UnresolvedSummary plan={plan} snapshot={snapshot} language={language} /> : null}
          <ResolutionStatus resolution={currentResolution} language={language} />

          <Surface className="min-w-0 p-4 sm:p-5">
            <SectionHeading
              level={3}
              title={currentEvent?.chord.label ?? "—"}
              description={displayMode === "learn" && currentVoicing
                ? `${text.pitches}: ${currentVoicing.notes.map((note) => formatMidiNoteForDisplay(note.midiNote, "fl-studio", "flat")).join(" · ")} · ${text.degrees}: ${currentVoicing.notes.map((note) => note.degree ?? "—").join(" · ")}`
                : undefined}
              action={(
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!currentVoicing || active || paused}
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
                leftHandGuideNotes={currentVoicing?.leftHandNotes ?? EMPTY_NOTES}
                rightHandGuideNotes={currentVoicing?.rightHandNotes ?? EMPTY_NOTES}
                allowedPitchClasses={ALL_PITCH_CLASSES}
                requiredPitchClasses={EMPTY_NOTES}
                level={displayMode === "learn" ? 1 : 4}
                accidentalStyle="flat"
                language={language}
                concealNoteNames={displayMode === "recall"}
                interactionMode="neutral-monitor"
              />
            </div>
          </Surface>

          <Surface className="p-4 sm:p-5">
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
                <p className="text-sm font-medium text-[var(--lv-text-secondary)]">{sessionStatus(clockState?.status, text)}</p>
                <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                  {!active && !paused ? (
                    <Button variant="primary" disabled={!allEventsPlayable} onClick={() => void start()}><Play aria-hidden="true" size={16} />{text.start}</Button>
                  ) : active ? (
                    <Button variant="primary" onClick={pause}><Pause aria-hidden="true" size={16} />{text.pause}</Button>
                  ) : (
                    <Button variant="primary" onClick={resume}><Play aria-hidden="true" size={16} />{text.resume}</Button>
                  )}
                  <Button variant="secondary" disabled={!active && !paused} onClick={restart}><RefreshCw aria-hidden="true" size={16} />{text.restart}</Button>
                  <Button variant="secondary" disabled={!active && !paused} onClick={stop}><Square aria-hidden="true" size={16} />{text.stop}</Button>
                  <Button variant={metronomeEnabled ? "secondary" : "ghost"} aria-pressed={metronomeEnabled} onClick={toggleMetronome}>{text.metronome}: {metronomeEnabled ? "ON" : "OFF"}</Button>
                </div>
              </div>
            </div>
          </Surface>

          <Surface className="p-4 sm:p-5" aria-label={text.progressionProgress}>
            <div className="flex min-w-0 flex-wrap gap-2">
              {snapshot.events.map((event, index) => (
                <span
                  key={event.id}
                  data-testid="voicing-loop-event"
                  className={`min-w-0 rounded-[var(--lv-radius-sm)] border px-3 py-2 text-sm font-semibold ${index === currentIndex ? "border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : "border-[var(--lv-border)] text-[var(--lv-text-secondary)]"}`}
                  aria-current={index === currentIndex ? "step" : undefined}
                >
                  <span className="mr-2 text-xs font-normal text-[var(--lv-text-muted)]">{index + 1}</span>
                  {event.chord.label}
                  <span
                    data-testid="voicing-loop-event-timing"
                    className="mt-1 block whitespace-nowrap text-[11px] font-normal leading-4 text-[var(--lv-text-muted)]"
                  >
                    {practiceTimingLabel(event, snapshot.meter.numerator, language)}
                  </span>
                </span>
              ))}
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

function formatPracticeBeat(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
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
  const facts = [candidate.key, `${candidate.bpm} BPM`].filter(Boolean).join(" · ");
  const chords = candidate.chordLabels.join(" → ");
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

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 border-l-2 border-[var(--lv-accent)] pl-3">
      <p className="text-xs text-[var(--lv-text-muted)]">{label}</p>
      <p className="mt-1 break-words text-base font-semibold text-[var(--lv-text)]">{value}</p>
    </div>
  );
}

function ProgressMeter({ label, value }: { readonly label: string; readonly value: number }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-xs text-[var(--lv-text-muted)]"><span>{label}</span><span>{percent}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--lv-bg-subtle)]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="h-full origin-left bg-[var(--lv-accent)]" style={{ transform: `scaleX(${percent / 100})` }} />
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
    : [{ eventIndex: index, label: snapshot.events[index]?.chord.label ?? `${index + 1}`, status: resolution.status }]);
  if (unresolved.length === 0) return null;
  return (
    <StatusMessage title={copy[language].unresolvedSummary(unresolved.length)} tone="warning">
      <ul className="list-disc space-y-1 pl-5">
        {unresolved.map((item) => (
          <li key={`${item.eventIndex}:${item.status}`}>
            {item.label}: {resolutionStatusLabel(item.status, language)}
          </li>
        ))}
      </ul>
    </StatusMessage>
  );
}

function resolutionStatusLabel(
  status: Exclude<ProgressionPracticeVoicingResolution["status"], "SUPPORTED">,
  language: AppLanguage,
): string {
  const text = copy[language];
  switch (status) {
    case "UNAVAILABLE": return text.unavailableStatus;
    case "UNSUPPORTED_RULE": return text.unsupportedStatus;
    case "GENERATION_ERROR": return text.generationErrorStatus;
  }
}

function createDefaultTransport(): ProgressionVoicingTransportPort {
  return new ProgressionVoicingTransport();
}
