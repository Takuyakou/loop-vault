import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowRight,
  Ear,
  Lightbulb,
  Music2,
  RotateCcw,
  Square,
} from "lucide-react";
import { Badge, Button, Field, StatusMessage, Surface } from "../../../components/ui";
import {
  degreeDifficultyPreset,
  createCompletedAttempt,
  deriveTransferExercise,
  formatDegree,
  generateDegreeExercise,
  STANDARD_BASS_TUNINGS,
  type GeneratorSnapshot,
  type Handedness,
  type PracticeExercise,
  type PracticeAttempt,
  type PracticeIssue,
  type PracticeRating,
  type PracticeSettings,
  type SingingReferenceMode,
  type StringCount,
} from "../domain";
import {
  type ClaimedPracticeExercise,
  degreeHintDisclosure,
  DegreePracticeSession,
} from "../application";
import { DegreeFretboard } from "./DegreeFretboard";

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

const RATINGS: readonly { value: PracticeRating; label: string; key: string }[] = [
  { value: "again", label: "Again", key: "1" },
  { value: "hard", label: "Hard", key: "2" },
  { value: "good", label: "Good", key: "3" },
  { value: "easy", label: "Easy", key: "4" },
];

const ISSUES: readonly { value: PracticeIssue; label: string }[] = [
  { value: "pitch", label: "Pitch（自己申告）" },
  { value: "rhythm", label: "Rhythm" },
  { value: "duration", label: "Duration" },
  { value: "recall", label: "Recall" },
  { value: "fretboard", label: "Fretboard" },
];

const FLOW_STEPS = ["Listen", "Sing", "Think", "Play", "Review", "Transfer"] as const;

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
  const [settingsError, setSettingsError] = useState<string>();
  const [round, setRound] = useState(initialRound);
  const [queuedClaim, setQueuedClaim] = useState<ClaimedPracticeExercise | undefined>(initialClaim);
  const [sessionCompletedCount, setSessionCompletedCount] = useState(Math.max(0, initialRound - 1));
  const activeSessionId = useMemo(() => sessionId ?? uniqueId("session"), [sessionId]);
  const abandonHandlerRef = useRef(onSessionAbandoned);
  const advancingRef = useRef(false);
  useEffect(() => { if (initialClaim) setQueuedClaim(initialClaim); }, [initialClaim]);
  useEffect(() => { abandonHandlerRef.current = onSessionAbandoned; }, [onSessionAbandoned]);
  useEffect(() => () => { void abandonHandlerRef.current?.(activeSessionId); }, [activeSessionId]);
  const generation = useMemo(
    () => queuedClaim ? { ok: true as const, exercise: queuedClaim.exercise } : generateDegreeExercise(createGeneratorSnapshot(settings, round)),
    [queuedClaim, round, settings],
  );

  if (!generation.ok) {
    return (
      <StatusMessage title="Degree Echoを準備できませんでした" tone="error">
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
          setSettingsError(caught instanceof Error ? caught.message : "The next Practice exercise could not be prepared.");
        } finally { advancingRef.current = false; }
      })(); }}
      externalError={settingsError ?? notice}
      onSettingsChange={(next) => {
        const previous = settings;
        setSettings(next);
        setSettingsError(undefined);
        void onSettingsChange?.(next).catch((caught) => {
          setSettings(previous);
          setSettingsError(caught instanceof Error ? caught.message : "Practice settings could not be saved.");
        });
      }}
      settings={settings}
      sessionId={activeSessionId}
      sessionCompletedCount={sessionCompletedCount}
      sessionTargetCount={sessionTargetCount}
    />
  );
}

function DegreeSessionWorkspace({
  claimedTransferOfAttemptId,
  exercise,
  externalError,
  onAttemptCompleted,
  onNext,
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
  const [draftIssue, setDraftIssue] = useState<PracticeIssue>();
  const [savedAttempt, setSavedAttempt] = useState<PracticeAttempt>();
  const [savingReview, setSavingReview] = useState(false);
  const savingReviewRef = useRef(false);
  const attemptStartedAt = useMemo(() => new Date().toISOString(), [activeExercise.id]);
  const [error, setError] = useState<string>();
  const [transferRelation, setTransferRelation] = useState<{
    readonly sourceAttemptId: string;
    readonly sourceKey: string;
    readonly targetKey: string;
  }>();
  const disclosure = useMemo(
    () => degreeHintDisclosure(activeExercise, state.hintLevel),
    [activeExercise, state.hintLevel],
  );

  useEffect(() => () => session.dispose(), [session]);

  const applyResult = useCallback((result: ReturnType<typeof session.configure>) => {
    if (result.ok) {
      setError(undefined);
      return true;
    }
    setError(result.error.message);
    return false;
  }, []);

  const runPlayback = useCallback(async (operation: () => Promise<ReturnType<typeof session.configure>>) => {
    try {
      applyResult(await operation());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "再生を開始できませんでした。");
    }
  }, [applyResult]);

  const rate = useCallback(async (rating: PracticeRating) => {
    if (savingReviewRef.current) return;
    setDraftRating(rating);
    const completedAt = new Date().toISOString();
    const attempt = createCompletedAttempt({
      id: uniqueId("attempt"), sessionId, startedAt: attemptStartedAt, completedAt,
      listenCount: state.listenCount, hintLevel: state.hintLevel, singSkipped: state.singSkipped,
      singGateCompleted: state.singGateCompleted, rating, mainIssue: draftIssue,
      transferOfAttemptId: transferRelation?.sourceAttemptId ?? claimedTransferOfAttemptId,
      reviewQueueClaimId: transferRelation ? undefined : reviewQueueClaimId,
      exercise: activeExercise,
    });
    setSavingReview(true);
    savingReviewRef.current = true;
    try {
      await onAttemptCompleted?.(attempt);
      setSavedAttempt(attempt);
      applyResult(session.transitionAction({ type: "RATE", rating, mainIssue: draftIssue }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Practice progress could not be saved. Your review is still available.");
    } finally {
      setSavingReview(false);
      savingReviewRef.current = false;
    }
  }, [activeExercise, applyResult, attemptStartedAt, claimedTransferOfAttemptId, draftIssue, onAttemptCompleted, reviewQueueClaimId, savingReview, session, sessionId, state, transferRelation]);

  const nextHint = useCallback(() => {
    applyResult(session.nextHint());
  }, [applyResult, session]);

  const replay = useCallback(() => {
    void runPlayback(() => session.replay());
  }, [runPlayback, session]);

  const beginTransfer = useCallback(() => {
    if (sessionCompletedCount >= sessionTargetCount) return;
    if (state.rating !== "good" && state.rating !== "easy") return;
    const sourceAttempt = savedAttempt;
    if (!sourceAttempt) return;
    const transfer = ["G", "D", "A", "F", "Bb"]
      .filter((key) => key !== exercise.tonalContext.key)
      .map((targetKey) => deriveTransferExercise(sourceAttempt, { targetKey }))
      .find((candidate) => candidate.ok);
    if (!transfer?.ok) {
      setError("設定中のフレット範囲で別KeyのTransferを生成できませんでした。");
      return;
    }
    setDraftRating(undefined);
    setDraftIssue(undefined);
    setTransferRelation({
      sourceAttemptId: transfer.sourceAttemptId,
      sourceKey: exercise.tonalContext.key,
      targetKey: transfer.exercise.tonalContext.key,
    });
    applyResult(session.beginTransfer(transfer.exercise));
  }, [applyResult, exercise, savedAttempt, session, sessionCompletedCount, sessionTargetCount, state]);

  const primaryAction = (() => {
    switch (state.status) {
      case "setup":
        return { label: "練習を準備", disabled: false, action: () => applyResult(session.configure()) };
      case "ready":
        return { label: "フレーズを再生", disabled: false, action: () => void runPlayback(() => session.startListen()) };
      case "listening":
        return { label: "再生中…", disabled: true, action: () => undefined };
      case "recall":
        return { label: settings.singEnabled ? "歌唱へ" : "度数で考える", disabled: false, action: () => applyResult(session.beginSinging()) };
      case "singing":
        return { label: "歌えた", disabled: !session.isSingingCompletionAvailable(), action: () => applyResult(session.completeSinging()) };
      case "thinking":
        return { label: "ベースで演奏開始", disabled: false, action: () => applyResult(session.transitionAction({ type: "START_PLAY" })) };
      case "playing":
        return { label: "演奏終了・答えを見る", disabled: false, action: () => applyResult(session.transitionAction({ type: "COMPLETE_PLAY" })) };
      case "review":
        return {
          label: "自己評価を確定",
          disabled: draftRating === undefined || savingReview,
          action: () => draftRating ? void rate(draftRating) : undefined,
        };
      case "transfer-offer":
        return sessionCompletedCount >= sessionTargetCount
          ? { label: "セッション結果を見る", disabled: false, action: () => applyResult(session.transitionAction({ type: "DECLINE_TRANSFER" })) }
          : { label: "別KeyへTransfer", disabled: false, action: beginTransfer };
      case "transfer":
        return {
          label: "Transfer演奏を完了",
          disabled: sessionSnapshot.transferPlaybackActive,
          action: () => applyResult(session.completeTransferUserAttempt()),
        };
      case "completed":
        return { label: sessionCompletedCount >= sessionTargetCount ? "次のセッションを始める" : "次の問題", disabled: false, action: onNext };
      case "abandoned":
        return undefined;
    }
  })();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat
        || event.isComposing
        || event.altKey
        || event.ctrlKey
        || event.metaKey
        || event.shiftKey
        || isEditableTarget(event.target)
      ) return;

      const key = event.key.toLowerCase();
      let handled = true;
      if (key === " " && primaryAction && !primaryAction.disabled) primaryAction.action();
      else if (key === "r" && (state.status === "recall" || state.status === "thinking")) replay();
      else if (key === "h" && ["recall", "singing", "thinking", "playing"].includes(state.status)) nextHint();
      else if (key === "s" && state.status === "singing" && session.isSingingCompletionAvailable()) applyResult(session.completeSinging());
      else if (["1", "2", "3", "4"].includes(key) && state.status === "review") void rate(RATINGS[Number(key) - 1].value);
      else if (key === "n" && state.status === "completed") onNext();
      else if (key === "t" && state.status === "transfer-offer") beginTransfer();
      else if (key === "escape") session.stopPlayback();
      else handled = false;

      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [applyResult, beginTransfer, nextHint, onNext, primaryAction, rate, replay, session, state.status]);

  const stepIndex = currentStepIndex(state.status);
  const showAnswer = state.status === "review"
    || state.status === "transfer-offer"
    || state.status === "transfer"
    || state.status === "completed";
  const canHint = ["recall", "singing", "thinking", "playing"].includes(state.status)
    && state.hintLevel < state.maximumHintLevel;
  const canReplay = (state.status === "recall" || state.status === "thinking")
    && state.listenCount < state.listenLimit;

  return (
    <div
      className="min-w-0 space-y-4"
      data-testid="degree-echo-view"
      data-practice-state={state.status}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="lv-section-kicker">Bass Practice</p>
          <h2 className="mt-1 text-2xl font-bold text-[var(--lv-text)]">Degree Echo</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--lv-text-secondary)]">
            短いフレーズを聴き、歌い、度数で捉えてからベースで再現します。
          </p>
        </div>
        <Badge tone="indigo" className="w-fit">自己評価 · 自動採点ではありません</Badge>
      </div>

      <ol className="grid grid-cols-3 gap-1 sm:grid-cols-6" aria-label="Degree Echo progress">
        {FLOW_STEPS.map((step, index) => (
          <li
            key={step}
            className={`rounded-[var(--lv-radius-sm)] border px-2 py-2 text-center text-[11px] font-semibold ${index === stepIndex ? "border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : index < stepIndex ? "border-[var(--lv-success)] text-[var(--lv-success)]" : "border-[var(--lv-border)] text-[var(--lv-text-muted)]"}`}
            aria-current={index === stepIndex ? "step" : undefined}
          >
            {step}
          </li>
        ))}
      </ol>

      {state.status === "completed" && sessionCompletedCount >= sessionTargetCount ? (
        <Surface className="p-4" data-testid="degree-session-summary">
          <p className="lv-section-kicker">Session summary · Self-rated</p>
          <h3 className="mt-1 font-semibold">{sessionCompletedCount} / {sessionTargetCount} exercises completed</h3>
          <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">Saved locally. This is your manual review history, not an automatic score.</p>
        </Surface>
      ) : null}

      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="degree-status-announcement"
      >
        {transferRelation && state.status === "transfer"
          ? `Degree Echo: Transfer ${transferRelation.sourceKey} → ${transferRelation.targetKey}。移調先は${transferRelation.targetKey}です。`
          : statusAnnouncement(state.status)}
      </p>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Surface variant="primary" className="min-w-0 overflow-hidden p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--lv-border)] pb-4">
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">Current challenge</p>
              <h3 className="mt-1 text-lg font-semibold text-[var(--lv-text)]">未知のフレーズを耳から再現</h3>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-[var(--lv-text-secondary)]">
              {state.hintLevel >= 1 ? (
                <span data-testid="degree-tonal-context">{activeExercise.tonalContext.key} {activeExercise.tonalContext.scale}</span>
              ) : null}
              <span>{activeExercise.tempo} BPM</span>
              {state.hintLevel >= 2 ? (
                <span data-testid="degree-note-count">· {activeExercise.targetEvents.length} notes</span>
              ) : null}
              <span>· {activeExercise.difficulty.phraseLengthBeats} beats</span>
            </div>
          </div>

          {transferRelation ? (
            <div
              className="mt-4 rounded-[var(--lv-radius-md)] border border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] p-3 text-sm text-[var(--lv-text-secondary)]"
              data-testid="degree-transfer-relation"
              data-source-attempt-id={transferRelation.sourceAttemptId}
            >
              Transfer: <strong className="text-[var(--lv-text)]">{transferRelation.sourceKey}</strong>
              {" → "}
              <strong className="text-[var(--lv-accent)]">{transferRelation.targetKey}</strong>
              <span className="ml-2 text-xs">同じ度数・同じリズム</span>
            </div>
          ) : null}

          <div className="py-7 text-center sm:py-9">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]">
              {state.status === "listening" ? <Ear aria-hidden="true" size={28} /> : <Music2 aria-hidden="true" size={28} />}
            </span>
            <p className="mt-4 text-lg font-semibold text-[var(--lv-text)]">{promptForStatus(state.status)}</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--lv-text-secondary)]">
              {descriptionForStatus(state.status, state.listenCount, state.listenLimit)}
            </p>

            {showAnswer || state.hintLevel >= 3 ? (
              <div className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-2" data-testid="degree-answer">
                {activeExercise.targetEvents.map((event) => (
                  <span key={event.index} className="grid h-11 min-w-11 place-items-center rounded-full border border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] px-3 text-sm font-bold text-[var(--lv-accent)]">
                    {showAnswer
                      ? formatDegree(event.degree)
                      : disclosure.degrees?.[event.index] ?? "?"}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {state.status === "setup" ? (
            <SetupControls settings={settings} onChange={onSettingsChange} />
          ) : null}

          {state.hintLevel > 0 ? (
            <HintDisclosure
              exercise={activeExercise}
              level={state.hintLevel as 1 | 2 | 3 | 4}
            />
          ) : null}

          {state.status === "review" ? (
            <ReviewControls
              draftIssue={draftIssue}
              draftRating={draftRating}
              onIssueChange={setDraftIssue}
              onRatingChange={setDraftRating}
            />
          ) : null}

          {error || externalError ? <StatusMessage className="mt-4" title="操作を完了できませんでした" tone="error">{error ?? externalError}</StatusMessage> : null}

          <div className="mt-5 flex flex-col-reverse gap-3 border-t border-[var(--lv-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" disabled={!canReplay} onClick={replay}>
                <RotateCcw aria-hidden="true" size={15} /> Replay <kbd>R</kbd>
              </Button>
              <Button variant="ghost" size="sm" disabled={!canHint} onClick={nextHint}>
                <Lightbulb aria-hidden="true" size={15} /> Hint {state.hintLevel}/{state.maximumHintLevel} <kbd>H</kbd>
              </Button>
              {state.status === "singing" ? (
                <Button variant="ghost" size="sm" onClick={() => applyResult(session.skipSinging())}>
                  歌唱をスキップ
                </Button>
              ) : null}
              {state.status === "recall" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void runPlayback(() => (
                    session.playSingingReference(settings.singingReferenceMode)
                  ))}
                >
                  歌唱Referenceを聴く
                </Button>
              ) : null}
              {state.status === "transfer-offer" ? (
                <Button variant="ghost" size="sm" onClick={() => applyResult(session.transitionAction({ type: "DECLINE_TRANSFER" }))}>
                  今回は完了
                </Button>
              ) : null}
              {state.status === "transfer" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={sessionSnapshot.transferPlaybackActive}
                  data-transfer-reference-action
                  onClick={() => void runPlayback(() => session.playTransferReference())}
                >
                  {sessionSnapshot.transferPlaybackActive
                    ? "移調後の音を再生中…"
                    : "移調後の音を聴く"}
                </Button>
              ) : null}
            </div>
            {primaryAction ? (
              <Button
                variant="primary"
                className="min-w-48"
                disabled={primaryAction.disabled}
                onClick={primaryAction.action}
                data-primary-action
              >
                {state.status === "listening" ? <Square aria-hidden="true" size={15} /> : null}
                {primaryAction.label}
                <ArrowRight aria-hidden="true" size={15} />
              </Button>
            ) : null}
          </div>
        </Surface>

        <aside className="space-y-4" aria-label="Session details">
          <Surface className="p-4">
            <h3 className="text-sm font-semibold text-[var(--lv-text)]">Session</h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div><dt className="text-[var(--lv-text-muted)]">State</dt><dd className="mt-1 font-semibold">{state.status}</dd></div>
              <div><dt className="text-[var(--lv-text-muted)]">Listen</dt><dd className="mt-1 font-semibold">{state.listenCount} / {state.listenLimit}</dd></div>
              <div><dt className="text-[var(--lv-text-muted)]">Hint</dt><dd className="mt-1 font-semibold">Level {state.hintLevel}</dd></div>
              <div><dt className="text-[var(--lv-text-muted)]">Mode</dt><dd className="mt-1 font-semibold">Degree</dd></div>
            </dl>
          </Surface>
          <Surface className="p-4">
            <h3 className="text-sm font-semibold text-[var(--lv-text)]">Keyboard</h3>
            <p className="mt-2 text-xs leading-5 text-[var(--lv-text-muted)]">
              Space primary · R replay · H hint · S sing · 1–4 review · N next · T transfer · Esc stop
            </p>
          </Surface>
        </aside>
      </div>

      <Surface className="min-w-0 p-4 sm:p-5">
        <DegreeFretboard
          exercise={activeExercise}
          handedness={settings.handedness}
          hintLevel={state.hintLevel}
        />
      </Surface>
    </div>
  );
}

function SetupControls({
  onChange,
  settings,
}: {
  onChange: (settings: DegreeUiSettings) => void;
  settings: DegreeUiSettings;
}) {
  return (
    <fieldset className="grid gap-4 border-t border-[var(--lv-border)] pt-4 sm:grid-cols-2 lg:grid-cols-4">
      <legend className="sr-only">Degree Echo setup</legend>
      <Field htmlFor="degree-string-count" label="弦数">
        <select id="degree-string-count" className="lv-input min-h-10 w-full" value={settings.stringCount} onChange={(event) => onChange({ ...settings, stringCount: Number(event.target.value) as StringCount })}>
          <option value={4}>4-string</option>
          <option value={5}>5-string</option>
        </select>
      </Field>
      <Field htmlFor="degree-handedness" label="表示">
        <select id="degree-handedness" className="lv-input min-h-10 w-full" value={settings.handedness} onChange={(event) => onChange({ ...settings, handedness: event.target.value as Handedness })}>
          <option value="right">Right-handed</option>
          <option value="left">Left-handed</option>
        </select>
      </Field>
      <Field htmlFor="degree-fret-range" label="Fret range">
        <select id="degree-fret-range" className="lv-input min-h-10 w-full" value={`${settings.fretRange.min}-${settings.fretRange.max}`} onChange={(event) => {
          const [min, max] = event.target.value.split("-").map(Number);
          onChange({ ...settings, fretRange: { min, max } });
        }}>
          <option value="0-7">0–7</option>
          <option value="0-12">0–12</option>
          <option value="5-17">5–17</option>
        </select>
      </Field>
      <Field htmlFor="degree-singing-reference" label="歌唱Reference">
        <select id="degree-singing-reference" className="lv-input min-h-10 w-full" value={settings.singingReferenceMode} onChange={(event) => onChange({ ...settings, singingReferenceMode: event.target.value as SingingReferenceMode })}>
          <option value="auto">Auto</option>
          <option value="original">Original</option>
          <option value="octave-1">+1 Octave</option>
          <option value="octave-2">+2 Octaves</option>
        </select>
      </Field>
    </fieldset>
  );
}

function HintDisclosure({ exercise, level }: { exercise: PracticeExercise; level: 1 | 2 | 3 | 4 }) {
  const disclosure = degreeHintDisclosure(exercise, level);
  return (
    <div className="mt-4 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] bg-[var(--lv-bg-subtle)] p-4" role="status">
      <p className="text-xs font-semibold text-[var(--lv-accent)]">Hint {level}</p>
      <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">
        {level === 1 ? `Key: ${disclosure.tonalContext?.key} ${disclosure.tonalContext?.scale}` : null}
        {level === 2 ? `${disclosure.noteCount} notes · contour: ${disclosure.contour}` : null}
        {level === 3 ? `Degrees: ${disclosure.degrees?.join(" → ")}` : null}
        {level === 4 ? `Notes: ${disclosure.noteNames?.join(" → ")} · fretboard markers revealed` : null}
      </p>
    </div>
  );
}

function ReviewControls({
  draftIssue,
  draftRating,
  onIssueChange,
  onRatingChange,
}: {
  draftIssue?: PracticeIssue;
  draftRating?: PracticeRating;
  onIssueChange: (issue: PracticeIssue | undefined) => void;
  onRatingChange: (rating: PracticeRating) => void;
}) {
  return (
    <fieldset className="border-t border-[var(--lv-border)] pt-4">
      <legend className="text-sm font-semibold text-[var(--lv-text)]">自己評価</legend>
      <p className="mt-1 text-xs text-[var(--lv-text-muted)]">演奏の測定結果ではありません。自分の感触を選んでください。</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RATINGS.map((rating) => (
          <button
            key={rating.value}
            type="button"
            data-review-rating={rating.value}
            className={`min-h-11 rounded-[var(--lv-radius-sm)] border px-3 text-sm font-semibold ${draftRating === rating.value ? "border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : "border-[var(--lv-border)] bg-[var(--lv-surface)] text-[var(--lv-text-secondary)]"}`}
            aria-pressed={draftRating === rating.value}
            onClick={() => onRatingChange(rating.value)}
          >
            {rating.label} <kbd>{rating.key}</kbd>
          </button>
        ))}
      </div>
      <label className="mt-4 block text-xs font-medium text-[var(--lv-text-secondary)]" htmlFor="degree-main-issue">気になった点（任意・自己申告）</label>
      <select id="degree-main-issue" className="lv-input mt-2 min-h-10 w-full max-w-sm" value={draftIssue ?? ""} onChange={(event) => onIssueChange(event.target.value ? event.target.value as PracticeIssue : undefined)}>
        <option value="">選択なし</option>
        {ISSUES.map((issue) => <option key={issue.value} value={issue.value}>{issue.label}</option>)}
      </select>
    </fieldset>
  );
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

function currentStepIndex(status: ReturnType<DegreePracticeSession["getState"]>["status"]): number {
  if (status === "setup" || status === "ready" || status === "listening" || status === "recall") return 0;
  if (status === "singing") return 1;
  if (status === "thinking") return 2;
  if (status === "playing") return 3;
  if (status === "review") return 4;
  return 5;
}

function promptForStatus(status: ReturnType<DegreePracticeSession["getState"]>["status"]): string {
  const prompts = {
    setup: "演奏条件を選びましょう",
    ready: "答えを見ずに、まず耳で聴きます",
    listening: "フレーズを再生しています",
    recall: "頭の中でフレーズを再現してください",
    singing: "楽器を持たずに歌ってください",
    thinking: "度数として並びを考えてください",
    playing: "ベースでフレーズを弾いてください",
    review: "答えと比べて自己評価してください",
    "transfer-offer": "同じ度数を別Keyでも試しますか？",
    transfer: "別Keyへ移したつもりで演奏してください",
    completed: "この問題は完了です",
    abandoned: "セッションを終了しました",
  } as const;
  return prompts[status];
}

function descriptionForStatus(
  status: ReturnType<DegreePracticeSession["getState"]>["status"],
  listenCount: number,
  listenLimit: number,
): string {
  if (status === "listening") return `Listen ${listenCount} / ${listenLimit}。再生終了まで次へ進みません。`;
  if (status === "singing") return "マイクや録音は使いません。最低時間を歌った後に「歌えた」が有効になります。";
  if (status === "review") return "Good / Easyは自己評価です。Pitchなどの項目も自動測定ではありません。";
  if (status === "setup") return "4/5弦、利き手表示、フレット範囲、歌唱Referenceを設定できます。";
  return "ヒントは必要なときだけ1段ずつ開けます。";
}

function statusAnnouncement(status: ReturnType<DegreePracticeSession["getState"]>["status"]): string {
  return `Degree Echo: ${promptForStatus(status)}`;
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
