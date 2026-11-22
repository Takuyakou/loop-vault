import { Select } from "../../../components/ui/controls";
import { useEchoActive } from "./EchoPracticeFrame";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Popover, StatusMessage } from "../../../components/ui";
import { Chip } from "../../../components/ui/controls";
import {
  degreeContour,
  degreeDifficultyPreset,
  createCompletedAttempt,
  deriveTransferExercise,
  formatDegree,
  generateDegreeExercise,
  midiNoteName,
  STANDARD_BASS_TUNINGS,
  type GeneratorSnapshot,
  type Handedness,
  type PracticeExercise,
  type PracticeAttempt,
  type PracticeRating,
  type PracticeSettings,
  type SingingReferenceMode,
  type StringCount,
} from "../domain";
import {
  type ClaimedPracticeExercise,
  DegreePracticeSession,
} from "../application";
import {
  displayNoteName,
  sharpNoteName,
  keyLabel,
  StageButton,
  StageCount,
  StageFrame,
  StageFretboard,
  StageHints,
  StageLane,
  StageMeter,
  StagePlayButton,
  StageRatingChoice,
  StageResultHead,
  StageTools,
  STAGE_RATINGS,
  type LaneNote,
  type ResultFact,
  type StageStep,
} from "../stage/Stage";
import { suggestedRating, takeNotes, useJudgedTake } from "../stage/useJudgedTake";
import { noteName } from "../midi/noteName";
import type { BassAnalysis } from "../midi/analysis";

export interface DegreeUiSettings {
  readonly stringCount: StringCount;
  readonly handedness: Handedness;
  readonly fretRange: { readonly min: number; readonly max: number };
  readonly singEnabled: boolean;
  readonly singingReferenceMode: SingingReferenceMode;
}

const DEFAULT_SETTINGS: DegreeUiSettings = {
  stringCount: 4,
  handedness: "right",
  fretRange: { min: 0, max: 12 },
  singEnabled: true,
  singingReferenceMode: "auto",
};

export function BassPracticeView({ initialClaim, initialRound = 1, initialSettings, notice, onAttemptCompleted, onNextExercise, onSessionAbandoned, onSessionRestart, onSettingsChange, sessionId, sessionTargetCount = 8 }: {
  initialClaim?: ClaimedPracticeExercise;
  initialRound?: number;
  initialSettings?: PracticeSettings;
  notice?: string;
  onAttemptCompleted?: (attempt: PracticeAttempt) => Promise<void>;
  onNextExercise?: () => Promise<ClaimedPracticeExercise | undefined>;
  onSessionAbandoned?: (sessionId: string) => Promise<void>;
  onSessionRestart?: () => Promise<void>;
  onSettingsChange?: (settings: DegreeUiSettings) => Promise<void>;
  sessionId?: string;
  sessionTargetCount?: number;
}) {
  const [settings, setSettings] = useState<DegreeUiSettings>(() => initialSettings ? {
    stringCount: initialSettings.stringCount, handedness: initialSettings.handedness,
    fretRange: initialSettings.fretRange, singEnabled: initialSettings.singEnabled,
    singingReferenceMode: initialSettings.singingReferenceMode,
  } : DEFAULT_SETTINGS);
  useEffect(() => { if (initialSettings) setSettings({ stringCount: initialSettings.stringCount, handedness: initialSettings.handedness, fretRange: initialSettings.fretRange, singEnabled: initialSettings.singEnabled, singingReferenceMode: initialSettings.singingReferenceMode }); }, [initialSettings?.stringCount, initialSettings?.handedness, initialSettings?.fretRange.min, initialSettings?.fretRange.max, initialSettings?.singEnabled, initialSettings?.singingReferenceMode]);
  const [settingsError, setSettingsError] = useState<string>();
  const [round, setRound] = useState(initialRound);
  const [queuedClaim, setQueuedClaim] = useState<ClaimedPracticeExercise | undefined>(initialClaim);
  const [sessionCompletedCount, setSessionCompletedCount] = useState(Math.max(0, initialRound - 1));
  const activeSessionId = useMemo(() => sessionId ?? uniqueId("session"), [sessionId]);
  const abandonHandlerRef = useRef(onSessionAbandoned);
  /** P23-28 F8-2: a session nobody practised in leaves no 「途中でやめた」 behind. */
  const sessionTouchedRef = useRef(false);
  const advancingRef = useRef(false);
  useEffect(() => { if (initialClaim) setQueuedClaim(initialClaim); }, [initialClaim]);
  useEffect(() => { abandonHandlerRef.current = onSessionAbandoned; }, [onSessionAbandoned]);
  useEffect(() => {
    sessionTouchedRef.current = false;
    return () => { if (sessionTouchedRef.current) void abandonHandlerRef.current?.(activeSessionId); };
  }, [activeSessionId]);
  const generation = useMemo(
    () => queuedClaim ? { ok: true as const, exercise: queuedClaim.exercise } : generateDegreeExercise(createGeneratorSnapshot(settings, round)),
    [queuedClaim, round, settings],
  );

  if (!generation.ok) {
    return (
      <StatusMessage title="度数の練習を準備できませんでした" tone="error">
        {generation.error.message}
      </StatusMessage>
    );
  }

  return (
    <DegreeSessionWorkspace
      key={generation.exercise.id}
      exercise={generation.exercise}
      claimedTransferOfAttemptId={queuedClaim?.transferOfAttemptId}
      reviewQueueClaimId={queuedClaim?.claimId}
      onAttemptCompleted={async (attempt) => { await onAttemptCompleted?.(attempt); setSessionCompletedCount((count) => count + 1); }}
      onNext={() => { void (async () => {
        if (advancingRef.current) return; advancingRef.current = true;
        try {
          if (sessionCompletedCount >= sessionTargetCount && onSessionRestart) {
            await onSessionRestart();
            return;
          }
          if (sessionCompletedCount >= sessionTargetCount) setSessionCompletedCount(0);
          setQueuedClaim(await onNextExercise?.()); setRound((current) => current + 1);
        } catch (caught) {
          setSettingsError(caught instanceof Error ? caught.message : "次の練習問題を用意できませんでした。");
        } finally { advancingRef.current = false; }
      })(); }}
      externalError={settingsError ?? notice}
      onSettingsChange={(next) => {
        const previous = settings;
        setSettings(next);
        setSettingsError(undefined);
        void onSettingsChange?.(next).catch((caught) => {
          setSettings(previous);
          setSettingsError(caught instanceof Error ? caught.message : "練習の設定を保存できませんでした。");
        });
      }}
      settings={settings}
      sessionId={activeSessionId}
      sessionCompletedCount={sessionCompletedCount}
      sessionTargetCount={sessionTargetCount}
      onSessionStarted={() => { sessionTouchedRef.current = true; }}
    />
  );
}

/**
 * P23-62: 度数 on the shared stage. 1 聴く (listen up to the limit, open hints in order, an optional singing
 * reference) → 2 弾く (a bar of count-in, record with the click, judged on this PC) → 3 結果 (お手本 and 自分
 * note by note, the rating it suggests, 別のキーで / 録り直す / 次のフレーズ). Without a microphone the same flow
 * runs with 「録らずに弾く」 and the player rates it. The Degree state machine is unchanged: the moves the stage
 * no longer shows as steps (singing, thinking, playing) are passed through when the take ends.
 */
function DegreeSessionWorkspace({
  claimedTransferOfAttemptId,
  exercise,
  externalError,
  onAttemptCompleted,
  onNext,
  onSessionStarted,
  onSettingsChange,
  reviewQueueClaimId,
  settings,
  sessionId,
  sessionCompletedCount,
  sessionTargetCount,
}: {
  claimedTransferOfAttemptId?: string;
  exercise: PracticeExercise;
  externalError?: string;
  onAttemptCompleted?: (attempt: PracticeAttempt) => Promise<void>;
  onNext: () => void;
  /** P23-28 F8-2: told once the session leaves its first state, so an untouched session is not 「途中でやめた」. */
  onSessionStarted?: () => void;
  onSettingsChange: (settings: DegreeUiSettings) => void;
  reviewQueueClaimId?: string;
  settings: DegreeUiSettings;
  sessionId: string;
  sessionCompletedCount: number;
  sessionTargetCount: number;
}) {
  const session = useMemo(
    () => new DegreePracticeSession({ exercise, singEnabled: settings.singEnabled }),
    [exercise, settings.singEnabled],
  );
  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const getSnapshot = useCallback(() => session.getSnapshot(), [session]);
  const sessionSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const state = sessionSnapshot.state;
  const activeExercise = sessionSnapshot.exercise;
  const [draftRating, setDraftRating] = useState<PracticeRating>();
  const [savingReview, setSavingReview] = useState(false);
  const savingReviewRef = useRef(false);
  const attemptStartedAt = useMemo(() => new Date().toISOString(), [activeExercise.id]);
  const [error, setError] = useState<string>();
  const [selfPlaying, setSelfPlaying] = useState(false);
  /** The result came from the player, not from a take (no microphone, or 「録らずに弾く」). */
  const [selfRated, setSelfRated] = useState(false);
  const [transferRelation, setTransferRelation] = useState<{
    readonly sourceAttemptId: string;
    readonly sourceKey: string;
    readonly targetKey: string;
  }>();

  useEffect(() => () => session.dispose(), [session]);
  // The stage has no 「練習を準備」 screen: the session is ready as soon as it is on screen.
  useEffect(() => { if (session.getState().status === "setup") session.configure(); }, [session]);
  // P23-28 F8-2: listening for the first time is what makes this session a practice worth recording.
  useEffect(() => {
    if (state.status !== "setup" && state.status !== "ready") onSessionStarted?.();
  }, [onSessionStarted, state.status]);

  const target = useMemo(() => activeExercise.targetEvents.map((event) => ({
    pitch: event.midiNote, startBeat: event.startBeat, durationBeats: event.durationBeats, velocity: event.velocity,
  })), [activeExercise]);
  const phraseBeats = Math.max(activeExercise.difficulty.phraseLengthBeats, ...target.map((note) => note.startBeat + note.durationBeats));
  const take = useJudgedTake({
    mode: "degree",
    resetKey: `degree:${activeExercise.id}`,
    practiceSessionId: sessionId,
    target,
    bpm: activeExercise.tempo,
    lengthBeats: phraseBeats + 1,
    beatsPerBar: 4,
    pitchRule: "octave",
  });

  const applyResult = useCallback((result: ReturnType<typeof session.configure>) => {
    if (result.ok) { setError(undefined); return true; }
    setError(result.error.message);
    return false;
  }, []);

  const runPlayback = useCallback(async (operation: () => Promise<ReturnType<typeof session.configure>>) => {
    try { applyResult(await operation()); } catch (caught) {
      setError(caught instanceof Error ? caught.message : "再生を開始できませんでした。");
    }
  }, [applyResult]);

  /** The moves the stage passes through when the playing ends: (歌う) → 考える → 弾く → 答え. */
  const finishPlaying = useCallback(() => {
    const status = session.getState().status;
    if (status === "transfer") { applyResult(session.completeTransferUserAttempt()); return; }
    if (status === "review") return;
    if (status === "recall") applyResult(session.beginSinging());
    if (session.getState().status === "singing") {
      applyResult(session.isSingingCompletionAvailable() ? session.completeSinging() : session.skipSinging());
    }
    if (session.getState().status === "thinking") applyResult(session.transitionAction({ type: "START_PLAY" }));
    if (session.getState().status === "playing") applyResult(session.transitionAction({ type: "COMPLETE_PLAY" }));
  }, [applyResult, session]);

  // A judged take is in: show the answer and the rating it suggests.
  useEffect(() => {
    if (take.phase !== "done" || !take.result) return;
    setSelfRated(false);
    finishPlaying();
    setDraftRating(suggestedRating(take.result.counts.correct, take.result.counts.total, hintsOpened(state.hintLevel)));
    // state.hintLevel is read at the moment the take ends, on purpose.
  }, [take.phase, take.result]);

  const rate = useCallback(async (rating: PracticeRating): Promise<boolean> => {
    if (savingReviewRef.current) return false;
    const completedAt = new Date().toISOString();
    const attempt = createCompletedAttempt({
      id: uniqueId("attempt"), sessionId, startedAt: attemptStartedAt, completedAt,
      listenCount: state.listenCount, hintLevel: state.hintLevel, singSkipped: state.singSkipped,
      singGateCompleted: state.singGateCompleted, rating, mainIssue: undefined,
      transferOfAttemptId: transferRelation?.sourceAttemptId ?? claimedTransferOfAttemptId,
      reviewQueueClaimId: transferRelation ? undefined : reviewQueueClaimId,
      exercise: activeExercise,
    });
    setSavingReview(true);
    savingReviewRef.current = true;
    try {
      await onAttemptCompleted?.(attempt);
      lastSavedAttempt.current = attempt;
      return applyResult(session.transitionAction({ type: "RATE", rating }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "練習の記録を保存できませんでした。評価はそのまま残っています。");
      return false;
    } finally {
      setSavingReview(false);
      savingReviewRef.current = false;
    }
  }, [activeExercise, applyResult, attemptStartedAt, claimedTransferOfAttemptId, onAttemptCompleted, reviewQueueClaimId, session, sessionId, state, transferRelation]);
  const lastSavedAttempt = useRef<PracticeAttempt>();

  const sessionFull = sessionCompletedCount + 1 >= sessionTargetCount;
  const canTransfer = state.status === "review" && !state.transferAttempted && !sessionFull
    && (draftRating === "good" || draftRating === "easy");

  /** 次のフレーズ: keep the rating, then the next phrase (or the next session after the last one). */
  const commitAndNext = useCallback(async () => {
    if (state.status !== "review" || !draftRating || savingReviewRef.current) return;
    take.stopPlayback();
    if (!(await rate(draftRating))) return;
    if (session.getState().status === "transfer-offer") applyResult(session.transitionAction({ type: "DECLINE_TRANSFER" }));
    onNext();
  }, [applyResult, draftRating, onNext, rate, session, state.status, take]);

  /** 別のキーで: keep the rating, then the same degrees in another key that fits the frets. */
  const commitAndTransfer = useCallback(async () => {
    if (!canTransfer || !draftRating) return;
    take.stopPlayback();
    if (!(await rate(draftRating))) return;
    const sourceAttempt = lastSavedAttempt.current;
    if (!sourceAttempt || session.getState().status !== "transfer-offer") return;
    const transfer = ["G", "D", "A", "F", "Bb"]
      .filter((key) => key !== exercise.tonalContext.key)
      .map((targetKey) => deriveTransferExercise(sourceAttempt, { targetKey }))
      .find((candidate) => candidate.ok);
    if (!transfer?.ok) {
      applyResult(session.transitionAction({ type: "DECLINE_TRANSFER" }));
      setError("この指板の範囲では、別のキーの問題を作れませんでした。");
      onNext();
      return;
    }
    setDraftRating(undefined);
    setSelfRated(false);
    setTransferRelation({ sourceAttemptId: transfer.sourceAttemptId, sourceKey: exercise.tonalContext.key, targetKey: transfer.exercise.tonalContext.key });
    applyResult(session.beginTransfer(transfer.exercise));
  }, [applyResult, canTransfer, draftRating, exercise.tonalContext.key, onNext, rate, session, take]);

  const listening = state.status === "listening" || sessionSnapshot.transferPlaybackActive;
  const inListen = state.status === "ready" || state.status === "listening" || state.status === "recall"
    || state.status === "singing" || state.status === "thinking" || state.status === "transfer";
  const takeRunning = take.phase === "preparing" || take.phase === "counting" || take.phase === "recording" || take.phase === "analyzing";
  const reviewed = state.status === "review" || state.status === "transfer-offer" || state.status === "completed";
  const step: StageStep = takeRunning || selfPlaying || take.phase === "failed" ? 1 : reviewed ? 2 : 0;
  const heard = state.listenCount > 0 || state.status === "transfer";
  const listensLeft = Math.max(0, state.listenLimit - state.listenCount);
  const canListen = state.status === "transfer"
    ? !sessionSnapshot.transferPlaybackActive
    : state.status === "ready" || ((state.status === "recall" || state.status === "thinking") && listensLeft > 0);
  const maxChips = Math.max(0, Math.min(3, state.maximumHintLevel - 1));
  const chipsOpen = hintsOpened(state.hintLevel);
  const canHint = ["recall", "singing", "thinking", "playing"].includes(state.status) && chipsOpen < maxChips;

  const listen = useCallback(() => {
    if (listening) { session.stopPlayback(); return; }
    if (state.status === "transfer") { void runPlayback(() => session.playTransferReference()); return; }
    if (state.status === "ready") { void runPlayback(() => session.startListen()); return; }
    if (canListen) void runPlayback(() => session.replay());
  }, [canListen, listening, runPlayback, session, state.status]);

  const openHint = useCallback(() => {
    if (!canHint) return;
    const targetLevel = chipsOpen + 2;
    while (session.getState().hintLevel < targetLevel && session.getState().hintLevel < session.getState().maximumHintLevel) {
      if (!applyResult(session.nextHint())) break;
    }
  }, [applyResult, canHint, chipsOpen, session]);

  const record = useCallback(() => {
    if (!heard || takeRunning || listening) return;
    if (inListen || reviewed && state.status === "review") { setSelfPlaying(false); take.start(); }
  }, [heard, inListen, listening, reviewed, state.status, take, takeRunning]);

  const playWithoutTake = useCallback(() => {
    if (!heard || takeRunning || listening) return;
    take.reset();
    setSelfPlaying(true);
  }, [heard, listening, take, takeRunning]);

  const showAnswer = useCallback(() => {
    setSelfPlaying(false);
    setSelfRated(true);
    setDraftRating(undefined);
    take.reset();
    finishPlaying();
  }, [finishPlaying, take]);

  const active = useEchoActive();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!active || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      let handled = true;
      if (key === "escape") { if (takeRunning) take.stop(); else { take.stopPlayback(); session.stopPlayback(); } }
      else if (takeRunning) handled = false;
      else if (key === " ") { if (selfPlaying) showAnswer(); else if (step === 0) listen(); else if (step === 2) take.playTarget(); else handled = false; }
      else if (key === "h" && step === 0) openHint();
      else if (key === "r" && (step === 0 || state.status === "review" && !selfRated)) record();
      else if (key === "n" && step === 2) void commitAndNext();
      else if (key === "t" && step === 2) void commitAndTransfer();
      else if (["1", "2", "3", "4"].includes(key) && state.status === "review") setDraftRating(STAGE_RATINGS[Number(key) - 1]);
      else handled = false;
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, commitAndNext, commitAndTransfer, listen, openHint, record, selfPlaying, selfRated, session, showAnswer, state.status, step, take, takeRunning]);

  const key = keyLabel(activeExercise.tonalContext.key, activeExercise.tonalContext.scale);
  const meta = `${key} · ${activeExercise.tempo} BPM · ${activeExercise.difficulty.phraseLengthBeats} 拍`;
  const degrees = activeExercise.targetEvents.map((event) => formatDegree(event.degree));
  // A lowered degree is spelled with ♭ and a raised one with ♯, whatever the key prefers (♭3 in G is B♭, not A♯).
  const names = activeExercise.targetEvents.map((event) => event.degree.accidental === -1 ? noteName(event.midiNote)
    : event.degree.accidental === 1 ? sharpNoteName(event.midiNote)
      : displayNoteName(midiNoteName(event.midiNote, activeExercise.tonalContext.key, activeExercise.tonalContext.scale)));
  const hiddenNotes: LaneNote[] = activeExercise.targetEvents.map((event, index) => ({
    startBeat: event.startBeat, durationBeats: event.durationBeats, kind: "hide",
    text: chipsOpen >= 2 ? degrees[index] : "?",
    ...(chipsOpen >= 3 ? { sub: names[index] } : {}),
    label: chipsOpen >= 2 ? `${index + 1} 音目 ${degrees[index]}${chipsOpen >= 3 ? ` ${names[index]}` : ""}` : `${index + 1} 音目`,
  }));
  const answerNotes: LaneNote[] = activeExercise.targetEvents.map((event, index) => ({
    startBeat: event.startBeat, durationBeats: event.durationBeats, kind: "ref",
    text: degrees[index], sub: names[index], label: `お手本 ${index + 1} 音目 ${degrees[index]} ${names[index]}`,
  }));
  const contourLabel = { same: "同じ高さ", up: "上がる", down: "下がる", mixed: "上下する" }[degreeContour(activeExercise)];
  const chips = [
    { id: "contour", label: "輪郭", openLabel: `輪郭 ${activeExercise.targetEvents.length} 音・${contourLabel}` },
    { id: "degree", label: "度数" },
    { id: "names", label: "音名と指板" },
  ].slice(0, maxChips);
  const fretDots = (marks?: BassAnalysis["marks"]) => activeExercise.targetEvents.map((event, index) => ({
    midiNote: event.midiNote, label: degrees[index],
    ...(marks && marks[index]?.kind !== "ok" ? { tone: "warn" as const } : {}),
  }));
  const fretboard = (marks?: BassAnalysis["marks"]) => (
    <StageFretboard dots={fretDots(marks)} stringCount={settings.stringCount} fretRange={settings.fretRange} handedness={settings.handedness} />
  );
  const transferBanner = transferRelation && (state.status === "transfer" || reviewed)
    ? <p className="bp-banner" data-testid="degree-transfer-relation" data-source-attempt-id={transferRelation.sourceAttemptId}>別のキーで：{keyLabel(transferRelation.sourceKey, activeExercise.tonalContext.scale)} → {keyLabel(transferRelation.targetKey, activeExercise.tonalContext.scale)}</p>
    : null;
  const errorLine = error ?? externalError;

  const tools = (
    <StageTools>
      <Popover label="度数の条件" trigger={(props) => <Chip {...props} data-testid="degree-conditions">歌う参考音 {SINGING_LABELS[settings.singingReferenceMode]}</Chip>}>
        <div className="bp-tools-panel">
          <label>歌う参考音の高さ
            <Select aria-label="歌う参考音の高さ" value={settings.singingReferenceMode} onChange={(event) => onSettingsChange({ ...settings, singingReferenceMode: event.target.value as SingingReferenceMode })}>
              {(Object.keys(SINGING_LABELS) as SingingReferenceMode[]).map((mode) => <option key={mode} value={mode}>{SINGING_LABELS[mode]}</option>)}
            </Select>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.singEnabled} onChange={(event) => onSettingsChange({ ...settings, singEnabled: event.target.checked })} />聴いたあとに「歌う参考音」を出す</label>
          <p>歌うのは任意です。弾く前に声でなぞると、度数が頭に残りやすくなります。</p>
        </div>
      </Popover>
    </StageTools>
  );

  // ── 2 弾く: the take is running (or failed), or the player plays without a take ──
  if (step === 1) {
    const recordingNow = take.phase === "recording";
    return (
      <StageFrame step={1} keys={takeRunning ? "Esc 止める" : selfPlaying ? "Space 答えを見る" : "R もう一度録る"} testId="degree-echo-view" state={state.status}>
        {tools}{take.recorder}
        <p className="bp-meta">{meta}</p>
        {transferBanner}
        {take.phase === "counting" ? <StageCount beats={4} current={take.count} /> : null}
        <p className="bp-say">{
          take.phase === "analyzing" ? "判定しています…"
            : take.phase === "failed" ? "うまく録れませんでした"
              : selfPlaying ? "ベースで弾いてください"
                : take.phase === "counting" || take.phase === "preparing" ? "カウントのあとに弾き始めます"
                  : "クリックに合わせて弾いてください"
        }</p>
        {selfPlaying ? <p className="bp-sub">録音はしません。弾き終えたら答えを見て、自分で評価します。</p> : null}
        <StageLane
          lengthBeats={phraseBeats}
          beatsPerBar={4}
          rows={selfPlaying ? [{ label: "お手本", notes: hiddenNotes }] : [{ label: "お手本", notes: hiddenNotes }, { label: "自分", notes: [] }]}
          {...(recordingNow && take.beat !== undefined ? { playhead: take.beat } : {})}
        />
        {take.phase === "failed" ? <p className="bp-note-line" role="alert">{take.error}</p> : null}
        {recordingNow ? (
          <p className="bp-note-line" data-testid="degree-input-line"><StageMeter level={take.inputLevel} />{take.inputLevel > 0.004 ? "入力に音が届いています" : "入力に音が来ていません。機器とチャンネルを確かめてください"} · 録音は判定にだけ使い、保存しません</p>
        ) : null}
        <div className="bp-actions">
          {takeRunning ? <StageButton tone="record" keyHint="Esc" onClick={take.stop} data-testid="degree-stop">■ 止める</StageButton> : null}
          {selfPlaying ? <StageButton tone="primary" keyHint="Space" onClick={showAnswer} data-testid="degree-show-answer">弾けた・答えを見る</StageButton> : null}
          {take.phase === "failed" ? <>
            <StageButton onClick={showAnswer} data-testid="degree-self-rate">録らずに評価する</StageButton>
            {!take.unavailable ? <StageButton tone="primary" keyHint="R" onClick={record} data-testid="degree-record-again">● もう一度録る</StageButton> : null}
          </> : null}
        </div>
      </StageFrame>
    );
  }

  // ── 3 結果 ──
  if (step === 2) {
    const result = !selfRated ? take.result : undefined;
    const counts = result?.counts;
    const facts: ResultFact[] = counts ? [
      { text: `合った ${counts.correct}`, tone: "ok" },
      { text: `音が違う ${counts.wrongPitch}`, tone: "ng" },
      { text: `早い・遅い ${counts.timing}`, tone: "warn" },
      ...(counts.missed ? [{ text: `抜け ${counts.missed}`, tone: "mute" as const }] : []),
      ...(counts.extra ? [{ text: `余分な音 ${counts.extra}`, tone: "ng" as const }] : []),
      { text: `タイミング 平均 ${result.meanOffsetMs >= 0 ? "+" : ""}${Math.round(result.meanOffsetMs)}ms` },
      { text: chipsOpen ? `ヒント ${chipsOpen} 段` : "ヒントなし" },
    ] : [
      { text: "録音なし・自分で評価" },
      { text: chipsOpen ? `ヒント ${chipsOpen} 段` : "ヒントなし" },
    ];
    const good = Boolean(counts && counts.total && counts.correct / counts.total >= 0.75);
    const kept = take.recorderStatus === "saved";
    return (
      <StageFrame step={2} keys="Space お手本 · R 録り直す · 1–4 評価 · N 次のフレーズ" tone={good ? "good" : undefined} testId="degree-echo-view" state={state.status}>
        {tools}{take.recorder}
        {transferBanner}
        {counts
          ? <StageResultHead big={`${counts.correct} / ${counts.total}`} label="音が合いました" facts={facts} />
          : <StageResultHead big="答え" label="お手本と比べて、自分で評価してください" facts={facts} />}
        <StageLane
          lengthBeats={phraseBeats}
          beatsPerBar={4}
          rows={result ? [{ label: "お手本", notes: answerNotes }, { label: "自分", notes: takeNotes(result, activeExercise.tempo, phraseBeats + 1, activeExercise.targetEvents) }] : [{ label: "お手本", notes: answerNotes }]}
          {...(take.beat !== undefined && take.playing ? { playhead: take.beat } : {})}
        />
        {fretboard(result?.marks)}
        <StageRatingChoice value={draftRating} onChange={setDraftRating} prompt={result ? "評価（判定は目安。変えられます）" : "評価"} />
        <div className="bp-actions" data-testid="degree-result-actions">
          <StageButton onClick={take.playTarget} aria-pressed={take.playing === "target"}>▶ お手本</StageButton>
          {result ? <>
            <StageButton onClick={take.playTake} aria-pressed={take.playing === "take"}>▶ 自分</StageButton>
            <StageButton onClick={take.playOverlay} aria-pressed={take.playing === "overlay"}>▶ 重ねて</StageButton>
            <StageButton onClick={take.keep} disabled={kept} data-testid="degree-keep-take">{kept ? "残しました" : "録音を残す"}</StageButton>
          </> : null}
          <span className="bp-actions-gap" aria-hidden="true" />
          {!state.transferAttempted && !sessionFull ? <StageButton keyHint="T" disabled={!canTransfer || savingReview} onClick={() => void commitAndTransfer()} data-testid="degree-transfer">別のキーで</StageButton> : null}
          {!selfRated ? <StageButton keyHint="R" onClick={record} data-testid="degree-retake">● 録り直す</StageButton> : null}
          <StageButton tone="primary" keyHint="N" disabled={!draftRating || savingReview} onClick={() => void commitAndNext()} data-testid="degree-next">
            {sessionFull ? `次の ${sessionTargetCount} 問へ` : "次のフレーズ"}
          </StageButton>
        </div>
        <p className="bp-note-line">このセッション {Math.min(sessionTargetCount, sessionCompletedCount + 1)} / {sessionTargetCount} 問</p>
        {errorLine ? <p className="bp-note-line" role="alert">{errorLine}</p> : null}
      </StageFrame>
    );
  }

  // ── 1 聴く ──
  return (
    <StageFrame step={0} keys="Space 聴く · H ヒント · R 録って弾く" testId="degree-echo-view" state={state.status}>
      {tools}{take.recorder}
      <p className="bp-meta">{meta}</p>
      {transferBanner}
      <p className="bp-say">{state.status === "transfer" ? "同じ度数を、このキーで弾きます" : "聴いて、同じフレーズを弾きます"}</p>
      <StageLane lengthBeats={phraseBeats} beatsPerBar={4} rows={[{ label: "お手本", notes: hiddenNotes }]} />
      <div className="bp-playrow">
        {settings.singEnabled && state.status === "recall" ? (
          <StageButton onClick={() => void runPlayback(() => session.playSingingReference(settings.singingReferenceMode))} data-testid="degree-singing-reference">歌う参考音</StageButton>
        ) : <span style={{ width: 96 }} aria-hidden="true" />}
        <StagePlayButton playing={listening} label={listening ? "止める" : "お手本を聴く"} disabled={!listening && !canListen} onClick={listen} data-testid="degree-listen" />
        <span className="bp-note-line" style={{ width: 120 }} data-testid="degree-listens-left">{state.status === "transfer" ? "何度でも聴けます" : listensLeft > 0 ? `あと ${listensLeft} 回聴ける` : "もう聴けません"}</span>
      </div>
      {chips.length && state.status !== "transfer" ? <StageHints chips={chips} open={chipsOpen} disabled={!canHint} onOpen={openHint} /> : null}
      {chipsOpen >= 3 ? fretboard() : null}
      <div className="bp-actions">
        <StageButton disabled={!heard || listening} onClick={playWithoutTake} data-testid="degree-play-without-take">録らずに弾く</StageButton>
        <StageButton tone="primary" keyHint="R" disabled={!heard || listening} onClick={record} data-testid="degree-record">● 録って弾く</StageButton>
      </div>
      {!heard ? <p className="bp-note-line">まず ▶ でお手本を聴きます（{state.listenLimit} 回まで）</p> : null}
      {errorLine ? <p className="bp-note-line" role="alert">{errorLine}</p> : null}
    </StageFrame>
  );
}

const SINGING_LABELS: Readonly<Record<SingingReferenceMode, string>> = {
  auto: "自動", original: "元の高さ", "octave-1": "+1 オクターブ", "octave-2": "+2 オクターブ",
};

/** How many hint chips are open for a Degree hint level (level 1, the key, is always on screen now). */
function hintsOpened(level: number): number {
  return level >= 4 ? 3 : level >= 3 ? 2 : level >= 2 ? 1 : 0;
}

function createGeneratorSnapshot(settings: DegreeUiSettings, round: number): GeneratorSnapshot {
  const preset = degreeDifficultyPreset(2, "major");
  const tuning = STANDARD_BASS_TUNINGS[settings.stringCount];
  return {
    generatorVersion: "degree-v1",
    seed: `degree-ui-session-${round}`,
    key: "C",
    scale: "major",
    allowedDegrees: preset.allowedDegrees,
    vocabularyId: preset.vocabularyId,
    degreeSequence: preset.degreeSequence,
    noteCount: preset.degreeSequence.length,
    phraseLengthBeats: preset.difficulty.phraseLengthBeats,
    tempo: preset.difficulty.tempo,
    pitchSpan: { minMidi: tuning[0], maxMidi: Math.min(60, tuning[tuning.length - 1] + settings.fretRange.max) },
    instrument: "bass",
    tuning,
    fretRange: settings.fretRange,
    handedness: settings.handedness,
    rhythmPreset: "even",
    singingReferenceMode: settings.singingReferenceMode,
    maxAttempts: 64,
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function uniqueId(prefix: string): string {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${value}`;
}
