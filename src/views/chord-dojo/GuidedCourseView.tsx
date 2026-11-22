import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RotateCcw } from "lucide-react";
import { PlayingMark } from "../../components/ui";
import { usePreviewSound } from "../../components/PreviewSoundProvider";
import { DojoBackButton } from "./DojoBackButton";
import "./guidedCourse.css";
import "./guidedStage.css";
import "./guidedRound.css";
import { useDojoMidi } from "./useDojoMidi";
import { CourseKeyboard } from "./CourseKeyboard";
import { AdvancedCourseView } from "./AdvancedCourseView";
import { LevelRestartDialog } from "./LevelRestartDialog";
import { GuidedBasicPractice } from "./GuidedBasicPractice";
import { GuidedCourseMap, buildStationProgress, stationLabel } from "./GuidedCourseMap";
import { GuidedResultSheet, type ResultAction, type ResultBar, type ResultBox } from "./GuidedResultSheet";
import { useGuidedAutoAdvance } from "./useGuidedAutoAdvance";
import { GuideChordCard } from "./GuideChordCard";
import type { AdvancedCourseLevel } from "../../domain/chordDojo/guidedCourse/advanced/levels";
import { AdvancedRepository, createAdvancedStorage } from "../../domain/chordDojo/guidedCourse/advanced/store";
import { ADVANCED_BANK_VERSION, ADVANCED_STORE_SCHEMA, ADVANCED_STORE_VERSION, type AdvancedStore } from "../../domain/chordDojo/guidedCourse/advanced/types";
import { courseFrontier, type CourseFrontier, type StationId } from "../../domain/chordDojo/guidedCourse/frontier";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import { liveMidiService } from "../../liveMidi/liveMidiService";
import { createLiveNoteState, reduceLiveNoteState, soundingNotes } from "../../domain/liveMidi";
import { playbackController } from "../../audio/playbackController";
import { symbol, type Quality } from "../../domain/chordDojo/recipes";
import {
  COURSE_BANK,
  courseItemById,
  coursePolicy,
  itemLabel,
  itemRootLabel,
  delayIds,
  sameDayEarIds,
  sameDayNameIds,
  type CourseItem,
  type CourseLevel,
} from "../../domain/chordDojo/guidedCourse/bank";
import { courseNoteNames } from "./courseNoteNames";
import { resultMarks, wrongLines, type WrongLines } from "./guidedMarks";
import { breakAfter, roundScore, roundState, ROUND_SIZE } from "./guidedRounds";
import { tipFor } from "./guidedTips";
import { EarDisc, MarksLegend, MiniKeys, RoundBreak, RoundProgress, type RoundCompare } from "./GuidedRound";
import { judgeCourseAnswer } from "../../domain/chordDojo/guidedCourse/answer";
import { CourseCapture, hiddenInvalid, courseAttemptOutcome, pollGapInvalid, type CourseSealed } from "../../domain/chordDojo/guidedCourse/capture";
import {
  attemptQualityBreakdown,
  clearActiveAttempt,
  coursePlan,
  delayEligibility,
  evaluateStoreLevel,
  nextDelayAvailableAt,
  restartCourseLevel,
  startCourseAttempt,
  trialsInCurrentRound,
  weakItemIdsFor,
  type CoursePlan,
} from "../../domain/chordDojo/guidedCourse/review";
import { CourseRepository, createCourseStorage, createCourseTrial } from "../../domain/chordDojo/guidedCourse/store";
import type { ActiveAttempt, CourseStore, CourseTrial, CourseTrialResult } from "../../domain/chordDojo/guidedCourse/types";

/**
 * P23-40: the Lv1–3 guided course screen. It replaces the P23-38 single-session guide behind the same
 * home card; the ordinary Dojo records are never read or written. All questions, thresholds, sets and
 * the delayed-date rule come from the frozen v3 bank/policy copies.
 */
export interface GuidedCourseViewProps {
  readonly onExit: () => void;
  readonly settleMs: number;
}

interface Feedback {
  readonly ok: boolean;
  readonly result: CourseTrialResult | "hint";
  readonly message: string;
  readonly detail?: string;
  /** P23-47-fix-2: MIDI-judged answers can auto-advance; self-confirm and give-up cannot. */
  readonly midi?: boolean;
  /** P23-51: the notes of a MIDI answer, for the marks on the keyboard and the pause screen's comparison. */
  readonly played?: readonly number[];
  /** P23-51: the chord's tones and the meaning of the dashed ring (mock ⑤, second line). */
  readonly why?: string;
}

const AUTO_ADVANCE_MS = 1200;

type QuestionPlan = Extract<CoursePlan, { kind: "question" }>;

const LEVEL_ABILITY: Record<CourseLevel, string> = {
  1: "メジャーとマイナー",
  2: "4種類のセブンス",
  3: "12キーで引き出す",
};

const BLOCK_TITLE: Record<"sameDay" | "delay", string> = {
  sameDay: "今日の確認",
  delay: "日をあけた復習",
};

/**
 * P23-51 (mock ②) / P23-54: the listening comparison before a level's first confirmation. One line per
 * card, in id order; the note that changed from the card before is marked. Lv2 lowers one note at a
 * time from Cmaj7 (7th → 3rd → 5th), so the four sevenths are heard as one family. The lead's text.
 */
interface CourseDemo {
  readonly ids: readonly string[];
  readonly notes: readonly string[];
  readonly subtitle: string;
  readonly instruction: string;
}
const DEMOS: Readonly<Partial<Record<CourseLevel, CourseDemo>>> = {
  1: {
    ids: ["lv1-n-001", "lv1-n-004", "lv1-n-013", "lv1-n-016"],
    notes: ["メジャー。根音・3度・5度", "3度が半音下がる", "根音を F に移したメジャー", "3度が半音下がる"],
    subtitle: "メジャーとマイナー",
    instruction: "メジャーとマイナーの違いは 3度だけです。押して聴き比べてください",
  },
  2: {
    ids: ["lv2-n-037", "lv2-n-053", "lv2-n-048", "lv2-n-058"],
    notes: ["根音・3度・5度・長7度", "7度が半音下がる", "3度も半音下がる", "5度も半音下がる"],
    subtitle: "4種類のセブンス",
    instruction: "Cmaj7 から 1音ずつ半音下げると、響きが4種類に変わります。押して聴き比べてください",
  },
};

const noteNames = courseNoteNames;

function questionProgressParts(question: QuestionPlan): { index: number; total: number } {
  if (question.block === "delay") return { index: question.index, total: question.total };
  const sets = COURSE_BANK.sets[question.level];
  const nameTotal = sets.name.sameDay.length;
  if (question.item.prompt === "name") return { index: question.index, total: nameTotal };
  return { index: question.index - nameTotal, total: sets.ear?.items.length ?? 0 };
}

function questionProgress(question: QuestionPlan): string {
  const parts = questionProgressParts(question);
  if (question.block === "delay") return `復習 ${parts.index} / ${parts.total}`;
  return `${question.item.prompt === "name" ? "コード名" : "耳"} ${parts.index} / ${parts.total}`;
}

function CourseHeader(props: {
  readonly onExit: () => void;
  readonly level?: CourseLevel;
  readonly onRestart?: (() => void) | undefined;
  readonly dialog?: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly progress?: string;
  readonly round?: ReactNode;
  readonly connected: boolean;
}) {
  return <header className="gc-head">
    <div className="gc-head-row">
      <DojoBackButton label="コース" onBack={props.onExit} />
      <div className="gc-head-main">
        <p className="gc-kicker">ガイド練習 · <span data-testid="course-level">{props.level === undefined ? "基礎コース" : `Lv${props.level}`}</span></p>
        <h1>{props.title}</h1>
        {props.subtitle ? <p className="gc-sub">{props.subtitle}</p> : null}
      </div>
    </div>
    <div className="gc-meta">
      {props.round}
      {props.progress ? <span data-testid="course-progress">{props.progress}</span> : null}
      {props.onRestart === undefined ? null : <button type="button" className="gc-restart" data-testid="course-restart" onClick={props.onRestart}><RotateCcw aria-hidden="true" size={16} />このレベルを最初から</button>}
    </div>
    {props.dialog}
  </header>;
}

function localTimeText(iso: string | undefined): string {
  if (iso === undefined) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface BasicCourseViewProps {
  readonly onExit: () => void;
  readonly settleMs: number;
  readonly targetLevel?: CourseLevel | undefined;
  readonly targetBlock?: "sameDay" | "delay" | undefined;
  readonly demoOnly?: boolean | undefined;
  readonly initialPractice?: CourseLevel | undefined;
  readonly initialPracticeQuality?: string | undefined;
  readonly initialWrongIds?: readonly string[] | undefined;
  readonly frontier?: CourseFrontier | undefined;
  readonly onOpenStation?: (station: StationId, mode: "official" | "practice" | "demo", block?: "sameDay" | "delay") => void;
}

function BasicCourseView({ onExit, settleMs, targetLevel, targetBlock, demoOnly, initialPractice, initialPracticeQuality, initialWrongIds, frontier, onOpenStation }: BasicCourseViewProps) {
  const { sound } = usePreviewSound();
  // P23-44-fix-1: keep the home's piano monitor alive across the guide transition instead of
  // disposing and re-preloading samples on the first note. ChordDojoView owns the audible monitor.
  const { connected, connectionKey, prepareAudio } = useDojoMidi(false);
  const repository = useMemo(() => new CourseRepository(createCourseStorage()), []);
  const [store, setStore] = useState<CourseStore | undefined>();
  const [loadProblem, setLoadProblem] = useState<string | undefined>();
  const [fatal, setFatal] = useState<string | undefined>();
  const [now, setNow] = useState(() => new Date());
  const [feedback, setFeedback] = useState<Feedback | undefined>();
  const [frozenQuestion, setFrozenQuestion] = useState<QuestionPlan | undefined>();
  const [pending, setPending] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [earReady, setEarReady] = useState(false);
  const [earPlaying, setEarPlaying] = useState(false);
  // The answer window is closed while a prompt sounds; the subscription reads this ref, not the delayed state.
  const earPlayingRef = useRef(false);
  const [captureEpoch, setCaptureEpoch] = useState(0);
  const [demoIndex, setDemoIndex] = useState<number | undefined>();
  const [demoDone, setDemoDone] = useState<readonly CourseLevel[]>([]);
  const [demoViewing, setDemoViewing] = useState(demoOnly === true);
  const [practiceLevel, setPracticeLevel] = useState<CourseLevel | undefined>(initialPractice);
  const [practiceQuality, setPracticeQuality] = useState<string | undefined>(initialPracticeQuality);
  const [wrongPractice, setWrongPractice] = useState<{ readonly level: CourseLevel; readonly items: readonly CourseItem[] } | undefined>(() => {
    if (initialWrongIds === undefined || initialWrongIds.length === 0 || targetLevel === undefined) return undefined;
    const items = initialWrongIds.map((id) => courseItemById(id)).filter((entry): entry is CourseItem => entry !== undefined);
    return items.length > 0 ? { level: targetLevel, items } : undefined;
  });
  const [restartOpen, setRestartOpen] = useState(false);
  const [restartBusy, setRestartBusy] = useState(false);
  const [restartError, setRestartError] = useState<string | undefined>();
  const [practiceResetKey, setPracticeResetKey] = useState(0);
  const restartOpener = useRef<HTMLElement | null>(null);
  const [autoAdvance, setAutoAdvance] = useGuidedAutoAdvance();
  const [autoEligible, setAutoEligible] = useState(false);
  const [autoDue, setAutoDue] = useState(false);
  const [autoCancelled, setAutoCancelled] = useState(false);
  const [heldCount, setHeldCount] = useState(0);
  const autoAdvanceRef = useRef(autoAdvance);
  autoAdvanceRef.current = autoAdvance;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const advancing = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const exampleToken = useRef(0);
  const playedFor = useRef("");
  const instructionRef = useRef<HTMLParagraphElement>(null);
  const capture = useRef<CourseCapture>();
  const releaseGate = useRef(true);
  const rawNotes = useRef(createLiveNoteState());
  const promptAt = useRef<number>(0);
  const questionStartIso = useRef(new Date().toISOString());
  const questionKey = useRef("");
  const lastPoll = useRef(0);
  const lastMonotonic = useRef(0);
  const lastWall = useRef(0);
  const answeredFor = useRef("");
  const starting = useRef(false);
  const feedbackRef = useRef<Feedback>();
  feedbackRef.current = feedback;

  useEffect(() => {
    prepareAudio();
    // The home card can be below the fold, so the browser scrolls the main area before this screen mounts.
    // A course question must start with its header (back, level, progress) in view.
    const main = document.getElementById("main-content");
    if (main !== null) main.scrollTop = 0;
  }, [prepareAudio]);

  useEffect(() => {
    let active = true;
    void repository.load().then((loaded) => {
      if (!active) return;
      if (loaded.kind === "unreadable") {
        setLoadProblem(loaded.reason);
        return;
      }
      setStore(loaded.store);
    }).catch((error: unknown) => {
      if (active) setLoadProblem(error instanceof Error ? error.message : "保存データを読めません");
    });
    return () => { active = false; };
  }, [repository]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const effectiveStore = useMemo(() => {
    if (store === undefined) return undefined;
    if (targetLevel !== undefined && store.active !== undefined && (store.active.level !== targetLevel || (targetBlock !== undefined && store.active.block !== targetBlock))) {
      return clearActiveAttempt(store);
    }
    return store;
  }, [store, targetBlock, targetLevel]);
  const plan = useMemo(() => (effectiveStore === undefined ? undefined : coursePlan(effectiveStore, now, targetLevel === undefined ? {} : { level: targetLevel })), [effectiveStore, now, targetLevel]);
  const demoLevel = demoViewing && targetLevel !== undefined ? targetLevel : plan?.kind === "start-attempt" ? plan.level : undefined;
  const demo = demoLevel === undefined ? undefined : DEMOS[demoLevel];
  const initialDemo = effectiveStore !== undefined && demoLevel !== undefined && demo !== undefined && effectiveStore.active === undefined && trialsInCurrentRound(effectiveStore, demoLevel).length === 0;
  const demoActive = demo !== undefined && (demoViewing || (initialDemo && demoLevel !== undefined && !demoDone.includes(demoLevel)));
  const finishDemo = () => { setDemoViewing(false); if (demoLevel !== undefined) setDemoDone((done) => [...done, demoLevel]); };

  useEffect(() => {
    if (demoActive && demoIndex === undefined) setDemoIndex(0);
  }, [demoActive, demoIndex]);

  useEffect(() => {
    if (store === undefined || plan?.kind !== "start-attempt" || demoActive || starting.current) return;
    starting.current = true;
    const next = startCourseAttempt(clearActiveAttempt(store), plan.level, plan.block, new Date(), { mode: connected ? "midi" : "self" });
    void repository.save(next).then(() => setStore(next)).catch((error: unknown) => {
      setFatal(error instanceof Error ? error.message : "開始を保存できません");
    }).finally(() => { starting.current = false; });
  }, [connected, demoActive, plan, repository, store]);

  const liveQuestion = plan?.kind === "question" ? plan : undefined;
  const question = frozenQuestion ?? liveQuestion;
  const item = question?.item;
  const attempt = question?.attempt;

  // P23-51 (rule 2): the part of the block this question belongs to, shown in rounds of five.
  const roundPart = useMemo(() => {
    if (question === undefined || store === undefined) return undefined;
    const ids = question.block === "delay" ? delayIds(question.level)
      : question.item.prompt === "name" ? sameDayNameIds(question.level) : sameDayEarIds(question.level);
    const parts = questionProgressParts(question);
    const trials = new Map(store.trials.filter((trial) => trial.attemptId === question.attempt.attemptId).map((trial) => [trial.itemId, trial]));
    const results = ids.map((id) => {
      const trial = trials.get(id);
      return trial === undefined ? undefined : trial.result === "correct";
    });
    return { ids, trials, results, position: parts.index, total: parts.total, key: `${question.attempt.attemptId}:${parts.index}` };
  }, [question, store]);
  const [breakOpen, setBreakOpen] = useState(false);
  const breakOpenRef = useRef(false);
  breakOpenRef.current = breakOpen;
  const breakDone = useRef("");
  const currentKey = question === undefined ? "" : `${question.attempt.attemptId}:${question.item.id}`;

  useEffect(() => {
    if (question === undefined || questionKey.current === currentKey) return;
    questionKey.current = currentKey;
    setFeedback(undefined);
    setHintUsed(false);
    setEarReady(item?.prompt === "name");
    earPlayingRef.current = false;
    setEarPlaying(false);
    questionStartIso.current = new Date().toISOString();
    answeredFor.current = "";
    capture.current = undefined;
    releaseGate.current = soundingNotes(defaultLiveMidiStore.getState().notes).length === 0;
    rawNotes.current = structuredClone(defaultLiveMidiStore.getState().notes);
    // P23-49: a question moves focus to its instruction on the next frame. A dialog opened before that frame (the
    // restart confirmation) keeps its own focus: the instruction behind it must not take it away.
    requestAnimationFrame(() => {
      if (document.activeElement?.closest('[role="dialog"]')) return;
      instructionRef.current?.focus({ preventScroll: true });
    });
  }, [currentKey, item?.prompt, question]);

  const beginQuestion = useCallback((target: CourseItem, active: ActiveAttempt) => {
    const at = performance.now();
    promptAt.current = at;
    questionStartIso.current = new Date().toISOString();
    capture.current = new CourseCapture({
      requiredCount: Math.max(1, target.requiredPitchClasses.length),
      settleMs,
      waitForInput: target.level <= 2,
    });
    capture.current.arm(at, [...new Set(soundingNotes(defaultLiveMidiStore.getState().notes))]);
    releaseGate.current = soundingNotes(defaultLiveMidiStore.getState().notes).length === 0;
    answeredFor.current = `${active.attemptId}:${target.id}`;
    setAutoEligible(false);
    setAutoDue(false);
    setAutoCancelled(false);
  }, [settleMs]);

  const playPrompt = useCallback(async (target: CourseItem, markHint: boolean) => {
    if (markHint) setHintUsed(true);
    // P23-47-fix-4: while a prompt (first listen or a replay) sounds, the answer window is closed.
    if (target.prompt === "ear") {
      setEarReady(false);
      capture.current = undefined;
    }
    earPlayingRef.current = true;
    setEarPlaying(true);
    try {
      await playbackController.play(
        { kind: "practice", id: "guided-course:prompt" },
        { type: "chord", chord: symbol(target.root, target.quality as Quality), sound, explicitMidiNotes: target.referenceNotes },
        {
          onEnded(_reason) {
            earPlayingRef.current = false;
            setEarPlaying(false);
            if (target.prompt === "ear") {
              const at = performance.now();
              promptAt.current = at;
              setEarReady(true);
              capture.current = new CourseCapture({ requiredCount: Math.max(1, target.requiredPitchClasses.length), settleMs, waitForInput: target.level <= 2 });
              capture.current.arm(at, [...new Set(soundingNotes(defaultLiveMidiStore.getState().notes))]);
              setCaptureEpoch((epoch) => epoch + 1);
              releaseGate.current = soundingNotes(defaultLiveMidiStore.getState().notes).length === 0;
            }
          },
        },
      );
    } catch {
      earPlayingRef.current = false;
      setEarPlaying(false);
      setEarReady(true);
      setFeedback({ ok: false, result: "invalid", message: "音源を再生できません。もう一度お試しください" });
    }
  }, [settleMs, sound]);

  const playExample = useCallback(async (target: CourseItem) => {
    const token = ++exampleToken.current;
    playbackController.stop();
    setDemoPlaying(true);
    try {
      await playbackController.play(
        { kind: "practice", id: "guided-course:example" },
        { type: "chord", chord: symbol(target.root, target.quality as Quality), sound, explicitMidiNotes: target.referenceNotes },
        { onEnded() { if (token === exampleToken.current) setDemoPlaying(false); } },
      );
    } catch {
      if (token === exampleToken.current) setDemoPlaying(false);
    }
  }, [settleMs, sound]);

  const playNotes = useCallback(async (target: CourseItem, notes: readonly number[]) => {
    const token = ++exampleToken.current;
    playbackController.stop();
    setDemoPlaying(true);
    try {
      await playbackController.play(
        { kind: "practice", id: "guided-course:compare" },
        { type: "chord", chord: symbol(target.root, target.quality as Quality), sound, explicitMidiNotes: [...notes] },
        { onEnded() { if (token === exampleToken.current) setDemoPlaying(false); } },
      );
    } catch {
      if (token === exampleToken.current) setDemoPlaying(false);
    }
  }, [sound]);

  useEffect(() => () => { exampleToken.current += 1; playbackController.stop(); }, []);

  // P23-47: restart the displayed level from its first example/question. The first click only opens
  // the confirmation; capture, timeouts and playback pause until it is cancelled or confirmed.
  const restartLevel: CourseLevel = practiceLevel ?? (plan !== undefined && "level" in plan ? plan.level : 3);
  const restartHasDemo = DEMOS[restartLevel] !== undefined;
  const restartDestination = restartHasDemo ? "最初の見本" : "最初の問題";
  const restartProgress = plan?.kind === "question" ? questionProgressParts(plan) : undefined;
  const restartSentence = practiceLevel !== undefined
    ? "最初の教材に戻ります。正式確認の続きは保存されます。"
    : plan?.kind === "question" && restartProgress !== undefined
      ? `今回の確認（${restartProgress.index} / ${restartProgress.total}問目）を終了し、${restartDestination}に戻ります。これまでの合格記録は残ります。`
      : plan?.kind === "block-result"
        ? `今回の確認を終えています。${restartDestination}に戻ります。これまでの合格記録は残ります。`
        : plan?.kind === "delay-wait"
          ? `今回の確認は当日分を終えています。${restartDestination}に戻ります。これまでの合格記録は残ります。`
          : plan?.kind === "start-attempt"
            ? `今回の確認はまだ始まっていません。${restartDestination}に戻ります。これまでの合格記録は残ります。`
            : `このコースの確認を終えています。新しい周回を${restartDestination}から始めます。これまでの合格記録は残ります。`;
  const restartContinueLabel = practiceLevel === undefined && restartProgress !== undefined ? `${restartProgress.index}問目から続ける` : "キャンセル";
  const restartConfirmLabel = practiceLevel !== undefined ? `Lv${restartLevel}の自由練習を最初から` : `Lv${restartLevel}を最初から`;

  const openRestart = useCallback(() => {
    if (restartBusy || pending) return;
    restartOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRestartError(undefined);
    setRestartOpen(true);
    capture.current = undefined;
    exampleToken.current += 1;
    playbackController.stop();
  }, [pending, restartBusy]);

  useEffect(() => {
    if (restartOpen) return;
    // Esc / continue returns focus to the button that opened the confirmation.
    restartOpener.current?.focus({ preventScroll: true });
  }, [restartOpen]);

  const cancelRestart = useCallback(() => {
    if (restartBusy) return;
    setRestartOpen(false);
    setRestartError(undefined);
    if (practiceLevel !== undefined) return;
    if (plan?.kind !== "question" || item === undefined || feedback !== undefined) return;
    if (item.prompt === "ear" && !earReady) {
      playedFor.current = "";
      void playPrompt(item, false);
    } else {
      beginQuestion(item, plan.attempt);
    }
  }, [beginQuestion, earReady, feedback, item, plan, playPrompt, practiceLevel, restartBusy]);

  const confirmRestart = useCallback(async () => {
    if (restartBusy) return;
    if (practiceLevel !== undefined) {
      setRestartOpen(false);
      setPracticeResetKey((key) => key + 1);
      return;
    }
    if (store === undefined) return;
    setRestartBusy(true);
    setRestartError(undefined);
    try {
      const next = restartCourseLevel(store, restartLevel, new Date());
      await repository.save(next);
      setStore(next);
      setRestartOpen(false);
      setDemoDone((done) => done.filter((level) => level !== restartLevel));
      setDemoIndex(0);
      setFeedback(undefined);
      setFrozenQuestion(undefined);
      capture.current = undefined;
      playbackController.stop();
    } catch (error) {
      setRestartError(error instanceof Error ? error.message : "保存できませんでした。元の状態のまま、もう一度お試しください。");
    } finally {
      setRestartBusy(false);
    }
  }, [practiceLevel, repository, restartBusy, restartLevel, store]);

  const restartDialog = restartOpen
    ? createPortal(<LevelRestartDialog
      levelLabel={`Lv${restartLevel}`}
      sentence={restartSentence}
      practice={practiceLevel !== undefined}
      continueLabel={restartContinueLabel}
      confirmLabel={restartConfirmLabel}
      busy={restartBusy}
      error={restartError}
      onCancel={cancelRestart}
      onConfirm={() => void confirmRestart()}
    />, document.body)
    : null;
  const courseHeaderExtras = { onRestart: openRestart, dialog: restartDialog };

  // Ear questions: one automatic playback. The answer window opens only when the audio ends.
  useEffect(() => {
    if (item === undefined || question === undefined || attempt === undefined) return;
    if (item.prompt !== "ear" || playedFor.current === currentKey) return;
    playedFor.current = currentKey;
    setEarReady(false);
    void playPrompt(item, false);
  }, [attempt, currentKey, item, playPrompt, question]);

  // Name questions: arm immediately when the question is shown.
  useEffect(() => {
    if (item === undefined || attempt === undefined || question === undefined) return;
    if (item.prompt === "name") beginQuestion(item, attempt);
  }, [beginQuestion, item, question, attempt]);

  useEffect(() => {
    if (question === undefined || !earReady) return;
    if (capture.current === undefined && item !== undefined && attempt !== undefined) {
      // The audio ended before the effect above ran, or playback was unavailable: arm now.
      beginQuestion(item, attempt);
    }
  }, [beginQuestion, earReady, item, question, attempt]);

  const persistTrial = useCallback(async (trial: CourseTrial) => {
    if (store === undefined) return;
    setPending(true);
    try {
      const next = await repository.appendTrial(store, trial);
      setStore(next);
    } catch (error) {
      setFeedback({ ok: false, result: "invalid", message: error instanceof Error ? error.message : "保存できません" });
    } finally {
      setPending(false);
    }
  }, [repository, store]);

  const recordInvalid = useCallback((reason: "disconnected" | "prepare-failed" | "clock-jump" | "capability" | "stall" | "hidden") => {
    if (question === undefined || store === undefined) return;
    if (capture.current === undefined) return;
    const target = question.item;
    capture.current.invalidate(reason);
    capture.current = undefined;
    const trial = createCourseTrial({
      attempt: question.attempt,
      itemId: target.id,
      quality: target.quality,
      root: target.root,
      result: "invalid",
      invalidReason: reason,
      sealedNotes: [],
      hintUsed: false,
      selfConfirmed: false,
      midiConfirmed: false,
      startedAt: questionStartIso.current,
      sealedAt: new Date().toISOString(),
    });
    setFeedback({ ok: false, result: "invalid", message: "この回答は記録していません。もう一度弾いてください" });
    setFrozenQuestion(question);
    void persistTrial({ ...trial, trialId: `${trial.trialId}:invalid:${Date.now()}` });
  }, [persistTrial, question, store]);

  const finishSealed = useCallback((sealed: CourseSealed) => {
    if (question === undefined || store === undefined) return;
    const target = question.item;
    const outcome = courseAttemptOutcome(sealed, Math.max(1, target.requiredPitchClasses.length));
    let result: CourseTrialResult = outcome === "played" ? "wrong" : outcome === "incomplete" ? "incomplete" : "no-input";
    let message: string;
    let detail: string | undefined;
    let lines: WrongLines | undefined;
    if (outcome !== "no-input" && sealed.notes.length > 0) {
      const judgement = judgeCourseAnswer(target, target.bass === "root" ? "ear" : "name", sealed.notes);
      // P23-47-fix-4: an ear answer with missing tones is a wrong answer (the reason names the missing tone);
      // name questions keep the incomplete result.
      result = judgement.ok ? "correct" : outcome === "incomplete" && target.prompt !== "ear" ? "incomplete" : "wrong";
      message = result === "correct" ? "正解" : "不正解";
      if (result !== "correct") {
        // P23-51 (mock ⑤): "F の代わりに F♯ を弾きました。" when a wrong note took a chord tone's place; the other reasons stay.
        lines = wrongLines(itemLabel(target), sealed.notes, target.referenceNotes, {
          required: target.requiredPitchClasses,
          allowed: target.allowedPitchClasses,
          ...(target.prompt === "ear" || target.bass === "root" ? { bass: target.root } : {}),
        });
        detail = lines?.kind === "swap" ? lines.line : judgement.reason;
      }
    } else if (outcome === "no-input") {
      message = "MIDI入力を確認できませんでした";
    } else {
      message = "不正解";
      detail = "構成音がそろっていません";
    }
    if (hintUsed && result === "correct") detail = "お手本を使用しました（ヒントあり）";
    const trial = createCourseTrial({
      attempt: question.attempt,
      itemId: target.id,
      quality: target.quality,
      root: target.root,
      result,
      sealedNotes: sealed.notes,
      ...(sealed.speedMs === undefined ? {} : { speedMs: sealed.speedMs }),
      hintUsed,
      selfConfirmed: false,
      // P23-47-fix-3: a hint-assisted answer is never saved as an independent MIDI confirmation.
      midiConfirmed: !hintUsed,
      startedAt: questionStartIso.current,
      sealedAt: new Date().toISOString(),
    });
    capture.current = undefined;
    setFeedback({ ok: result === "correct", result, message, ...(detail === undefined ? {} : { detail }), midi: true, played: sealed.notes, ...(lines === undefined ? {} : { why: lines.sub }) });
    setAutoEligible(result === "correct" && autoAdvanceRef.current);
    setAutoDue(false);
    setAutoCancelled(false);
    setFrozenQuestion(question);
    void persistTrial(trial);
  }, [hintUsed, persistTrial, question, store]);

  const selfConfirm = useCallback((ok: boolean) => {
    if (question === undefined || item === undefined) return;
    const trial = createCourseTrial({
      attempt: question.attempt,
      itemId: item.id,
      quality: item.quality,
      root: item.root,
      result: ok ? "correct" : "wrong",
      sealedNotes: [],
      hintUsed,
      selfConfirmed: true,
      midiConfirmed: false,
      startedAt: questionStartIso.current,
      sealedAt: new Date().toISOString(),
    });
    setFeedback({ ok, result: ok ? "correct" : "wrong", message: ok ? "弾けた（自己確認）" : "まだ難しい", midi: false });
    setAutoEligible(false);
    setAutoDue(false);
    setAutoCancelled(false);
    setFrozenQuestion(question);
    void persistTrial(trial);
  }, [hintUsed, item, persistTrial, question]);

  const giveUp = useCallback(() => {
    if (question === undefined || item === undefined) return;
    const trial = createCourseTrial({
      attempt: question.attempt,
      itemId: item.id,
      quality: item.quality,
      root: item.root,
      result: "wrong",
      sealedNotes: [],
      hintUsed,
      selfConfirmed: false,
      midiConfirmed: false,
      startedAt: questionStartIso.current,
      sealedAt: new Date().toISOString(),
    });
    setFeedback({ ok: false, result: "wrong", message: "わからない", detail: "見本を確認しましょう", midi: false });
    setAutoEligible(false);
    setAutoDue(false);
    setAutoCancelled(false);
    setFrozenQuestion(question);
    void persistTrial(trial);
  }, [hintUsed, item, persistTrial, question]);

  /** One advance action for the button, Enter and the auto-advance timer. The lock prevents a double. */
  const advance = useCallback(() => {
    if (advancing.current) return;
    const current = feedbackRef.current;
    if (current === undefined || pendingRef.current) return;
    // P23-51: after the 5th, 10th, 15th answer the pause comes first; the second advance (its button or Enter) goes on.
    if (current.result !== "invalid" && roundPart !== undefined && breakAfter(roundPart.position, roundPart.total) && breakDone.current !== roundPart.key) {
      if (!breakOpenRef.current) {
        setBreakOpen(true);
        setAutoDue(false);
        return;
      }
      breakDone.current = roundPart.key;
      setBreakOpen(false);
    }
    advancing.current = true;
    const rearmInvalid = current.result === "invalid";
    setFeedback(undefined);
    setAutoEligible(false);
    setAutoDue(false);
    setAutoCancelled(false);
    setFrozenQuestion(undefined);
    if (rearmInvalid && item !== undefined && plan?.kind === "question") beginQuestion(item, plan.attempt);
    window.setTimeout(() => { advancing.current = false; }, 60);
  }, [beginQuestion, item, plan, roundPart]);

  const cancelAuto = useCallback(() => {
    setAutoEligible(false);
    setAutoDue(false);
    setAutoCancelled(true);
    nextRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!autoAdvance || !autoEligible || autoCancelled || restartOpen) return;
    if (feedback === undefined || feedback.result !== "correct" || feedback.midi !== true || pending) return;
    const timer = window.setTimeout(() => setAutoDue(true), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, autoEligible, autoCancelled, feedback, pending, restartOpen]);

  useEffect(() => {
    if (!autoAdvance || !autoDue || autoCancelled || !connected) return;
    if (pending || restartOpen || heldCount > 0) return;
    advance();
  }, [advance, autoAdvance, autoDue, autoCancelled, connected, heldCount, pending, restartOpen]);

  useEffect(() => {
    if (!connected) {
      setAutoEligible(false);
      setAutoDue(false);
    }
  }, [connected]);

  useEffect(() => {
    if (restartOpen) {
      setAutoEligible(false);
      setAutoDue(false);
    }
  }, [restartOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (restartOpen || pendingRef.current || feedbackRef.current === undefined) return;
      if (document.querySelector("[role=dialog]")) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input,select,textarea,button,a,[contenteditable='true']")) return;
      event.preventDefault();
      advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, restartOpen]);

  // MIDI capture: one subscription; never judges while a result is shown or a save is pending.
  useEffect(() => {
    if (restartOpen || question === undefined || item === undefined || attempt === undefined) return;
    const unsubscribe = liveMidiService.subscribeBatches((batch) => {
      const last = batch.events[batch.events.length - 1];
      for (const event of batch.events) {
        rawNotes.current = reduceLiveNoteState(rawNotes.current, event);
        if (feedbackRef.current !== undefined || pending) { releaseGate.current = false; continue; }
        const status = event.status & 240;
        if (status !== 128 && status !== 144) continue;
        const at = performance.now() - Math.max(0, (last?.timestampMs ?? event.timestampMs) - event.timestampMs);
        if (!releaseGate.current) {
          if (soundingNotes(rawNotes.current).length === 0) {
            releaseGate.current = true;
            capture.current?.arm(at, []);
          }
          continue;
        }
        if (capture.current === undefined) continue;
        capture.current.event({ kind: status === 144 && event.data2 > 0 ? "note-on" : "note-off", channel: event.channel, note: event.data1, at });
      }
      setHeldCount(soundingNotes(rawNotes.current).length);
    });
    return () => { unsubscribe(); };
  }, [attempt, item, pending, question, restartOpen]);

  useEffect(() => {
    if (restartOpen || question === undefined || capture.current === undefined || feedback !== undefined) return;
    // Starting (or resuming after the restart dialog) must not inherit a stale poll clock.
    lastPoll.current = 0;
    lastMonotonic.current = performance.now();
    lastWall.current = Date.now();
    const timer = setInterval(() => {
      const monotonic = performance.now();
      const wall = Date.now();
      const monoDelta = monotonic - lastMonotonic.current;
      const wallDelta = wall - lastWall.current;
      lastMonotonic.current = monotonic;
      lastWall.current = wall;
      if (lastPoll.current !== 0 && pollGapInvalid(monotonic - lastPoll.current)) {
        recordInvalid("stall");
        return;
      }
      if (lastPoll.current !== 0 && (monoDelta < 0 || Math.abs(monoDelta - wallDelta) > 100)) {
        recordInvalid("clock-jump");
        return;
      }
      lastPoll.current = monotonic;
      const sealed = capture.current?.advance(monotonic);
      if (sealed !== undefined) finishSealed(sealed);
    }, 10);
    return () => clearInterval(timer);
  }, [captureEpoch, feedback, finishSealed, question, recordInvalid, restartOpen]);

  useEffect(() => {
    if (question === undefined) return;
    lastPoll.current = 0;
    lastMonotonic.current = performance.now();
    lastWall.current = Date.now();
  }, [question]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") return;
      if (question === undefined || feedback !== undefined) return;
      if (hiddenInvalid(document.visibilityState) !== undefined) recordInvalid("hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [feedback, question, recordInvalid]);

  const previousConnection = useRef(connectionKey);
  const connectionInitialized = useRef(false);
  useEffect(() => {
    if (!connectionInitialized.current) {
      connectionInitialized.current = true;
      previousConnection.current = connectionKey;
      return;
    }
    if (previousConnection.current === connectionKey) return;
    previousConnection.current = connectionKey;
    if (question !== undefined && feedback === undefined) recordInvalid("disconnected");
  }, [connectionKey, feedback, question, recordInvalid]);

  useEffect(() => () => { playbackController.stop(); capture.current = undefined; }, []);

  const beginAttempt = useCallback(async (level: CourseLevel, block: "sameDay" | "delay") => {
    if (store === undefined) return;
    const next = startCourseAttempt(clearActiveAttempt(store), level, block, new Date(), { mode: connected ? "midi" : "self" });
    setFeedback(undefined);
    setFrozenQuestion(undefined);
    setPending(true);
    try {
      await repository.save(next);
      setStore(next);
    } catch (error) {
      setFeedback({ ok: false, result: "invalid", message: error instanceof Error ? error.message : "開始を保存できません" });
    } finally {
      setPending(false);
    }
  }, [connected, repository, store]);

  const quarantine = useCallback(async () => {
    setPending(true);
    try {
      await repository.quarantine();
      setLoadProblem(undefined);
      setStore(undefined);
      const loaded = await repository.load();
      if (loaded.kind === "unreadable") setLoadProblem(loaded.reason);
      else setStore(loaded.store);
    } catch (error) {
      setLoadProblem(error instanceof Error ? error.message : "隔離できません");
    } finally {
      setPending(false);
    }
  }, [repository]);

  const finishCourse = useCallback(async () => {
    if (store === undefined) return;
    const next = clearActiveAttempt(store);
    setPending(true);
    try {
      await repository.save(next);
      setStore(next);
    } catch (error) {
      setFeedback({ ok: false, result: "invalid", message: error instanceof Error ? error.message : "保存できません" });
    } finally {
      setPending(false);
    }
  }, [repository, store]);

  const nowQuestion = question;
  const progress = nowQuestion === undefined ? undefined : questionProgress(nowQuestion);

  if (fatal !== undefined) {
    return <div className="guided-course" data-testid="guided-course">
      <CourseHeader onExit={onExit} title="保存できません" connected={connected} />
      <section className="gc-panel">
        <p className="gc-panel-kicker">保存</p>
        <h2>直前の入力を保存できませんでした</h2>
        <p data-testid="course-fatal" role="alert">{fatal}</p>
        <p>入力はメモリ上に残しています。もう一度お試しください。</p>
        <div className="gc-panel-actions"><button type="button" data-testid="course-back" onClick={onExit}>コースへ戻る</button></div>
      </section>
    </div>;
  }

  if (loadProblem !== undefined) {
    return <div className="guided-course" data-testid="guided-course">
      <CourseHeader onExit={onExit} title="保存データを読めません" connected={connected} />
      <section className="gc-panel">
        <p className="gc-panel-kicker">保存データ</p>
        <h2>読めない記録があります</h2>
        <p data-testid="course-unreadable" role="alert">{loadProblem}</p>
        <p>元のデータは消していません。読めない記録を隔離してから始めます。</p>
        <div className="gc-panel-actions">
          <button type="button" className="dojo-primary" data-testid="course-quarantine" disabled={pending} onClick={() => void quarantine()}>読めない記録を隔離する</button>
          <button type="button" data-testid="course-back" onClick={onExit}>コースへ戻る</button>
        </div>
      </section>
    </div>;
  }

  if (store === undefined || plan === undefined) {
    return <div className="guided-course" data-testid="guided-course" aria-busy="true"><p className="gc-note" data-testid="course-loading">読み込み中</p></div>;
  }

  if (wrongPractice !== undefined) {
    return <GuidedBasicPractice
      key={`wrong-${wrongPractice.level}-${wrongPractice.items.map((entry) => entry.id).join(",")}`}
      level={wrongPractice.level}
      items={wrongPractice.items}
      mode="wrong"
      connected={connected}
      settleMs={settleMs}
      onBack={() => { setWrongPractice(undefined); if (initialWrongIds !== undefined) onExit(); }}
      onExit={onExit}
    />;
  }

  if (practiceLevel !== undefined) {
    const allItems = sameDayNameIds(practiceLevel)
      .map((id) => courseItemById(id))
      .filter((entry): entry is CourseItem => entry !== undefined);
    const filtered = practiceQuality === undefined ? allItems : allItems.filter((entry) => entry.quality === practiceQuality);
    const practiceItems = filtered.length > 0 ? filtered : allItems;
    return <GuidedBasicPractice
      key={`${practiceResetKey}-${practiceQuality ?? "all"}`}
      level={practiceLevel}
      items={practiceItems}
      mode="free"
      connected={connected}
      settleMs={settleMs}
      onBack={() => { setPracticeLevel(undefined); setPracticeQuality(undefined); if (initialPractice !== undefined) onExit(); }}
      onExit={onExit}
      onRestart={openRestart}
      dialog={restartDialog}
    />;
  }

  if (demoActive && demo !== undefined && demoLevel !== undefined) {
    const demoIds = demo.ids;
    const demoPosition = demoIndex ?? 0;
    const demoItem = courseItemById(demoIds[demoPosition] ?? "");
    if (demoItem !== undefined) {
      const last = demoPosition === demoIds.length - 1;
      return <div className="guided-course" data-testid="guided-course" data-demo="true" data-stage="demo" data-demo-playing={demoPlaying ? "true" : undefined}>
        <CourseHeader
          {...courseHeaderExtras}
          onExit={onExit}
          level={demoLevel}
          title="見本を見て弾く"
          subtitle={demo.subtitle}
          progress={`見本 ${demoPosition + 1} / ${demoIds.length}`}
          connected={connected}
        />
        <div className="gc-card" data-testid="course-demo">
          <section className="gc-card-top">
            {/* P23-51 (mock ②): the four examples side by side; the note that changed from the card before is yellow. */}
            <p className="gc-instruction" data-testid="course-demo-instruction">{demo.instruction}</p>
            <div className="gc-compare" data-testid="course-compare">
              {demoIds.map((id, index) => {
                const entry = courseItemById(id);
                if (entry === undefined) return null;
                const before = index > 0 ? courseItemById(demoIds[index - 1]!) : undefined;
                const beforePcs = new Set(before !== undefined && before.root === entry.root ? before.referenceNotes.map((note) => note % 12) : entry.referenceNotes.map((note) => note % 12));
                const changed = entry.referenceNotes.filter((note) => !beforePcs.has(note % 12));
                const current = index === demoPosition;
                const label = itemLabel(entry);
                return <button
                  key={id}
                  type="button"
                  className="gc-cmp"
                  aria-pressed={current}
                  aria-label={`${label}を聴く`}
                  data-playing={current && demoPlaying ? "true" : undefined}
                  {...(current ? { "data-testid": "course-demo-card" } : {})}
                  onClick={() => { setDemoIndex(index); void playExample(entry); }}
                >
                  <b {...(current ? { "data-testid": "course-demo-name" } : {})}>{label}</b>
                  <span className="gc-cmp-note">{current && demoPlaying ? <PlayingMark /> : changed.length > 0 ? <u>●</u> : null}{demo.notes[index]}</span>
                  <MiniKeys notes={entry.referenceNotes} diff={changed} label={`${label} の押さえ方`} />
                </button>;
              })}
            </div>
            <p className="gc-demo-notes" data-testid="course-demo-notes" data-playing={demoPlaying ? "true" : undefined}>
              {demoItem.referenceNotes.map((note, index) => <span key={note}>{index > 0 ? <i> · </i> : null}<span className="gc-read-note">{noteNames([note])}</span></span>)}
            </p>
          </section>
          <div className="gc-card-mid gc-keyboard">
            <div className="gc-keyboard-head"><b>鍵盤</b><span>見本の音名</span></div>
            <CourseKeyboard guideNotes={demoItem.referenceNotes} showNames stage />
          </div>
          <div className="gc-card-bottom">
            <p className="gc-note" data-testid="course-demo-counts">
              コード名から弾く{COURSE_BANK.sets[demoLevel].name.sameDay.length}問＋耳で弾く{COURSE_BANK.sets[demoLevel].ear?.items.length ?? 0}問。途中で戻っても続きから再開できます。
            </p>
            <div className="gc-actions">
              {last ? <>
                <button type="button" className="dojo-primary" data-testid="course-demo-start" onClick={() => { exampleToken.current += 1; setDemoPlaying(false); playbackController.stop(); finishDemo(); setDemoIndex(undefined); }}>確認を始める</button>
                <button type="button" data-testid="course-demo-again" onClick={() => { setDemoIndex(0); const target = courseItemById(demoIds[0] ?? ""); if (target !== undefined) void playExample(target); }}>もう1周</button>
              </> : <>
                <button type="button" className="dojo-primary" data-testid="course-demo-next" onClick={() => { const next = demoPosition + 1; setDemoIndex(next); const target = courseItemById(demoIds[next] ?? ""); if (target !== undefined) void playExample(target); }}>次の見本</button>
                <button type="button" data-testid="course-demo-skip" onClick={() => { exampleToken.current += 1; setDemoPlaying(false); playbackController.stop(); finishDemo(); setDemoIndex(undefined); }}>確認へ進む</button>
              </>}
            </div>
          </div>
        </div>
      </div>;
    }
  }

  if (plan.kind === "finished") {
    return <div className="guided-course" data-testid="guided-course">
      <CourseHeader {...courseHeaderExtras} onExit={onExit} level={3} title="基礎コース Lv1〜3 を終えました" subtitle="このコースで確認する範囲はここまでです。" connected={connected} />
      <section className="gc-panel" data-testid="course-finished">
        <p className="gc-panel-kicker">基礎コース</p>
        <h2>Lv1〜3 の確認を終えました</h2>
        <p>このコースで確認する Lv1〜3 はここまでです。ここから先の達成を表示するものではありません。</p>
        <div className="gc-panel-actions"><button type="button" data-testid="course-back" onClick={onExit}>Chord Dojo へ戻る</button></div>
      </section>
    </div>;
  }

  if (plan.kind === "delay-wait") {
    return <div className="guided-course" data-testid="guided-course">
      <CourseHeader {...courseHeaderExtras} onExit={onExit} level={plan.level} title="今日の確認は終わりました" subtitle={`次の復習: ${localTimeText(plan.availableAt)} 以降`} connected={connected} />
      <section className="gc-panel" data-testid="course-delay-wait">
        <p className="gc-panel-kicker">次の復習</p>
        <h2>{localTimeText(plan.availableAt)} 以降に確認します</h2>
        <p>翌日かつ 12 時間以上あけて、同じ Lv の別の問題を確認します。</p>
        <p>今日できる確認はここまでです。</p>
        <div className="gc-panel-actions"><button type="button" data-testid="course-back" onClick={onExit}>Chord Dojo へ戻る</button></div>
      </section>
    </div>;
  }

  if (plan.kind === "block-result") {
    const evaluation = plan.evaluation;
    const blockTitle = BLOCK_TITLE[plan.block];
    const policy = coursePolicy(plan.level);
    const passed = plan.block === "sameDay" ? evaluation.sameDayPassed : evaluation.delayPassed;
    const formal = plan.block === "delay" && evaluation.passed;
    const eligible = plan.block === "delay" || (evaluation.dates.sameDayCompletedAt !== undefined && delayEligibility(evaluation.dates.sameDayCompletedAt, now.toISOString()).eligible);
    const nextDelay = plan.block === "sameDay" && evaluation.dates.sameDayCompletedAt !== undefined
      ? localTimeText(nextDelayAvailableAt(evaluation.dates.sameDayCompletedAt))
      : undefined;
    const reasons = [...new Set(evaluation.reasons)];
    const hintCount = evaluation.blocks.name.hintAssisted + (evaluation.blocks.ear?.hintAssisted ?? 0) + evaluation.blocks.delay.hintAssisted;
    const retryable = plan.block === "sameDay" || evaluation.dates.eligible;
    const weak = weakItemIdsFor(store, plan.level, plan.block, plan.attemptId);
    const weakItems = weak.ids.map((id) => courseItemById(id)).filter((entry): entry is CourseItem => entry !== undefined);
    const total = plan.block === "sameDay" ? evaluation.blocks.name.required : evaluation.blocks.delay.required;
    const correct = plan.block === "sameDay" ? evaluation.blocks.name.correct : evaluation.blocks.delay.correct;
    const passLine = plan.block === "sameDay" ? policy.pass : policy.delay.pass;
    const breakdown = attemptQualityBreakdown(store, plan.level, plan.block, plan.attemptId);
    const bars: ResultBar[] = breakdown.map((entry) => ({
      id: entry.quality,
      label: entry.label,
      correct: entry.correct,
      total: entry.total,
      low: entry.total === 5 ? entry.correct <= 4 : entry.correct < entry.total,
    }));
    const weakest = breakdown
      .filter((entry) => entry.correct < entry.total)
      .sort((a, b) => (a.correct / Math.max(1, a.total)) - (b.correct / Math.max(1, b.total)))[0];
    const candidateNext: StationId = plan.level < 3 ? ((plan.level + 1) as CourseLevel) : 4;
    const priorPending = ([1, 2, 3] as const).filter((lv) => lv < plan.level && !evaluateStoreLevel(store, lv).passed).length;
    const nextAvailable = priorPending === 0 && (frontier === undefined || frontier.states.get(candidateNext) !== "locked" || plan.block === "sameDay");

    const openNextStation = (station: StationId) => {
      void finishCourse().then(() => {
        if (onOpenStation !== undefined) onOpenStation(station, "official", "sameDay");
        else if (typeof station === "number" && station <= 3) void beginAttempt(station as CourseLevel, "sameDay");
        else onExit();
      });
    };

    let primary: ResultAction | undefined;
    let nextBoxTitle = "コースに戻る";
    let nextBoxSub = "地図から次を選べます";

    if (!passed && retryable) {
      nextBoxTitle = "もう一度確認する";
      nextBoxSub = `${total}問（合格の線 ${passLine}問）`;
      primary = {
        label: "もう一度確認する",
        testId: "course-retry",
        onClick: () => void beginAttempt(plan.level, plan.block),
      };
    } else if (passed && plan.block === "sameDay" && eligible) {
      const delayTotal = policy.delay.questions;
      nextBoxTitle = "別の日にもう一度";
      nextBoxSub = `${delayTotal}問、${Math.max(1, Math.ceil(delayTotal * 0.3))}分ほど`;
      primary = {
        label: "別の日の確認を始める",
        testId: "course-start-delay",
        warn: true,
        onClick: () => void beginAttempt(plan.level, "delay"),
      };
    } else if (passed && plan.block === "sameDay" && nextAvailable) {
      nextBoxTitle = `${stationLabel(candidateNext)} を始める`;
      nextBoxSub = "待つ間に次の段へ進めます";
      primary = {
        label: `${stationLabel(candidateNext)} を始める`,
        testId: "course-next-level",
        onClick: () => openNextStation(candidateNext),
      };
    } else if (passed && plan.block === "delay") {
      if (plan.level < 3) {
        const nextLv = (plan.level + 1) as CourseLevel;
        nextBoxTitle = `${stationLabel(nextLv)} を始める`;
        nextBoxSub = LEVEL_ABILITY[nextLv];
        primary = {
          label: `${stationLabel(nextLv)} を始める`,
          testId: "course-next-level",
          onClick: () => openNextStation(nextLv),
        };
      } else {
        nextBoxTitle = "Lv4 を始める";
        nextBoxSub = "応用コースへ進めます";
        primary = {
          label: onOpenStation !== undefined ? "Lv4 を始める" : "基礎コースを終える",
          testId: "course-finish",
          onClick: () => {
            if (onOpenStation !== undefined) openNextStation(4);
            else void finishCourse();
          },
        };
      }
    }

    const boxes: readonly [ResultBox, ResultBox, ResultBox] = [
      {
        tag: passed ? "合格" : "もう一度",
        tagKind: passed ? "done" : "wait",
        title: blockTitle,
        sub: evaluation.blocks.ear !== undefined && plan.block === "sameDay"
          ? `コード名 ${evaluation.blocks.name.correct}/${evaluation.blocks.name.required} · 耳 ${evaluation.blocks.ear.correct}/${evaluation.blocks.ear.required}`
          : `${correct} / ${total}`,
      },
      { tag: "次はこれ", tagKind: "now", title: nextBoxTitle, sub: nextBoxSub, current: true },
      formal
        ? { tag: "修了", tagKind: "done", title: "修了", sub: `Lv${plan.level} を終えました` }
        : {
          tag: eligible && passed && plan.block === "sameDay" ? "確認できます" : "あした以降",
          tagKind: eligible && passed && plan.block === "sameDay" ? "wait" : "todo",
          title: "別の日にもう一度",
          sub: nextAvailable
            ? `待つ間に ${stationLabel(candidateNext)} を始められます`
            : nextDelay !== undefined ? `${nextDelay} 以降` : "翌日以降に確認します",
        },
    ];

    const secondary: ResultAction | undefined = weak.ids.length > 0
      ? {
        label: `間違えた・迷った問題を練習（${weak.ids.length}問）`,
        testId: "course-wrong-practice",
        onClick: () => setWrongPractice({ level: plan.level, items: weakItems }),
      }
      : weakest !== undefined
        ? {
          label: `${weakest.label} をもう少し練習する`,
          testId: "course-weak-practice",
          onClick: () => { setPracticeQuality(weakest.quality); setPracticeLevel(plan.level); },
        }
        : undefined;

    const notes = <>
      {evaluation.blocks.ear !== undefined && plan.block === "sameDay"
        ? <p>耳から弾く {evaluation.blocks.ear.correct} / {evaluation.blocks.ear.required}（合格の線 {policy.ear?.pass ?? evaluation.blocks.ear.required}問）</p>
        : null}
      {evaluation.mode === "self" ? <p>自己確認の結果です。正式合格には含みません。</p> : null}
      {hintCount > 0 ? <p>ヒントありの回答が {hintCount} 問あります。正式合格の分子には入りません。</p> : null}
      {reasons.length > 0 ? <details>
        <summary>詳しい理由</summary>
        <ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </details> : null}
    </>;

    return <div className="guided-course" data-testid="guided-course" data-stage="result">
      <CourseHeader {...courseHeaderExtras} onExit={onExit} level={plan.level} title={`${blockTitle}の結果`} subtitle={`Lv${plan.level} · ${LEVEL_ABILITY[plan.level]}`} connected={connected} />
      <GuidedResultSheet
        testId="course-result"
        ok={passed}
        formal={formal}
        lead={`Lv${plan.level} · ${blockTitle}`}
        total={total}
        correct={correct}
        passLine={passLine}
        bars={bars}
        slowCount={weak.slow}
        boxes={boxes}
        notes={notes}
        primary={primary}
        secondary={secondary}
        tertiary={{
          label: "今日はここまで",
          testId: "course-back",
          onClick: () => void finishCourse().then(() => onExit()),
        }}
        disabled={pending}
      />
    </div>;
  }

  if (nowQuestion === undefined || item === undefined) {
    return <div className="guided-course" data-testid="guided-course" aria-busy="true"><p className="gc-note">準備中</p></div>;
  }

  const taskKind = item.prompt === "ear" ? "聴いて弾く" : "コード名から弾く";
  const invalid = feedback?.result === "invalid";
  const answered = feedback !== undefined && !invalid;
  const correct = feedback?.result === "correct";
  const exampleShown = answered && (feedback?.midi === true || feedback?.ok === false);
  const lastQuestion = nowQuestion.index >= nowQuestion.total;
  const nextWord = lastQuestion ? "結果" : "次の問題";
  const autoWaiting = autoAdvance && autoEligible && !autoCancelled && correct && feedback?.midi === true;
  const guide = autoWaiting
    ? autoDue || heldCount > 0 ? `鍵盤を離すと${nextWord}へ` : `まもなく${nextWord}へ`
    : autoCancelled && correct ? "この問題の自動進行を止めました" : undefined;
  // P23-53 (mock ⑦): the lowest note is on the chip under the disc; the instruction is the mock's one line.
  const baseInstruction = item.prompt === "ear" ? "聴こえた和音を、そのまま弾く" : "このコードを弾いてください";
  const delayNote = nowQuestion.block === "delay" && !answered ? "日をあけた復習です。" : "";
  const instruction = answered
    ? correct ? "鍵盤で正解の一例を確認できます" : "鍵盤で見本を確認できます"
    : baseInstruction;
  const status = feedback?.message ?? (item.prompt === "ear"
    ? earPlaying ? "再生中" : !earReady ? "聴いてください" : "弾いてください"
    : "演奏を待っています");
  const feedbackTitle = autoWaiting ? "✓ 正解" : status;
  // P23-51 (mock ⑤): after a wrong MIDI answer the keyboard shows the played notes against the chord.
  const marks = answered && !correct && feedback?.midi === true && feedback.played !== undefined && feedback.played.length > 0
    ? resultMarks(feedback.played, item.referenceNotes, item.requiredPitchClasses, item.allowedPitchClasses)
    : undefined;
  const hasMiss = marks !== undefined && [...marks.values()].includes("miss");
  // P23-51 (mock ③): this round's five dots; the answered question shows its result at once.
  const roundResults = roundPart === undefined ? [] : roundPart.results.map((value, index) => index === roundPart.position - 1 && answered ? correct : value);
  const roundShown = roundPart === undefined ? undefined : roundState(roundPart.position, roundPart.total, roundResults);
  const roundNode = roundShown === undefined ? undefined : <RoundProgress {...roundShown} />;

  if (breakOpen && roundPart !== undefined && answered) {
    const score = roundScore(roundPart.position, roundPart.total, roundResults);
    const from = (score.round - 1) * ROUND_SIZE;
    let tipSource: Parameters<typeof tipFor>[0] = { level: nowQuestion.level };
    let compare: RoundCompare | undefined;
    for (let at = from; at < roundPart.position; at += 1) {
      if (roundResults[at] !== false) continue;
      const id = roundPart.ids[at]!;
      const wrongItem = courseItemById(id);
      const played = at === roundPart.position - 1 ? feedback.played ?? [] : roundPart.trials.get(id)?.sealedNotes ?? [];
      if (wrongItem === undefined) break;
      const lines = wrongLines(itemLabel(wrongItem), played, wrongItem.referenceNotes, {
        required: wrongItem.requiredPitchClasses,
        allowed: wrongItem.allowedPitchClasses,
        ...(wrongItem.prompt === "ear" || wrongItem.bass === "root" ? { bass: wrongItem.root } : {}),
      });
      tipSource = { level: nowQuestion.level, wrong: { prompt: wrongItem.prompt, quality: wrongItem.quality, root: wrongItem.root, ...(lines === undefined ? {} : { kind: lines.kind }) } };
      if (played.length > 0 && lines !== undefined && lines.kind !== "bass") {
        compare = { answerLabel: itemLabel(wrongItem), answerNotes: wrongItem.referenceNotes, playedNotes: played, onPlay: (notes) => void playNotes(wrongItem, notes) };
      }
      break;
    }
    return <div className="guided-course" data-testid="guided-course" data-midi={connected ? "on" : "off"} data-stage="break">
      <CourseHeader
        {...courseHeaderExtras}
        onExit={onExit}
        level={nowQuestion.level}
        title={taskKind}
        subtitle={LEVEL_ABILITY[nowQuestion.level]}
        progress={progress}
        round={roundNode}
        connected={connected}
      />
      <RoundBreak
        score={score}
        nextCount={Math.min(ROUND_SIZE, roundPart.total - roundPart.position)}
        tip={tipFor(tipSource)}
        compare={compare}
        onNext={advance}
        onStop={onExit}
      />
    </div>;
  }

  return <div className="guided-course" data-testid="guided-course" data-midi={connected ? "on" : "off"} data-stage="question" data-result={feedback?.result}>
    <CourseHeader
      {...courseHeaderExtras}
      onExit={onExit}
      level={nowQuestion.level}
      title={taskKind}
      subtitle={`${LEVEL_ABILITY[nowQuestion.level]}${nowQuestion.block === "delay" ? "・日をあけた復習" : ""}`}
      progress={progress}
      round={roundNode}
      connected={connected}
    />
    <div className="gc-card">
      <section className="gc-card-top" data-testid="course-prompt">
        {/* P23-47-fix-4: an ear question hides the chord name until it is answered; then the heading becomes the same
            audition card as a name question (pressing it plays the correct example). */}
        {item.prompt === "name" || answered ? <GuideChordCard
          label={itemLabel(item)}
          ariaLabel={feedback === undefined ? `${itemLabel(item)}をヒントとして聴く` : `${itemLabel(item)}の正解の一例を聴く`}
          playing={demoPlaying || earPlaying}
          onClick={() => {
            if (feedback === undefined) void playPrompt(item, true);
            else { cancelAuto(); void playExample(item); }
          }}
          testId="course-chord-card"
          nameTestId="course-prompt-name"
          hint={feedback === undefined ? (hintUsed ? "ヒントを聴きました" : "コードカードを押すとヒントになります") : "カードを押すと正解の一例を聴けます"}
          hintTestId="course-chord-card-hint"
        /> : <EarDisc root={itemRootLabel(item)} playing={earPlaying} disabled={pending || earPlaying || feedback !== undefined} onPlay={() => void playPrompt(item, true)} testId="course-prompt-name" />}
        <p className="gc-instruction" data-testid="course-instruction" ref={instructionRef} tabIndex={-1}>{delayNote}{instruction}</p>
        {feedback === undefined && item.prompt === "ear" ? <div className="gc-listen-row">
          <button type="button" data-testid="course-hint" disabled={pending || earPlaying} onClick={() => void playPrompt(item, true)}>もう一度聴く</button>
          {hintUsed ? null : <span className="gc-note">再試聴はヒントありになります</span>}
        </div> : null}
        {hintUsed ? <p className="gc-note" data-testid="course-hint-note">お手本を使用しました（ヒントあり。独立確認にはなりません）</p> : null}
        <div className="gc-feedback" data-testid="course-feedback" role="status" aria-live="polite">
          <span data-testid="course-feedback-text" data-ok={feedback?.ok} data-result={feedback?.result}>{feedbackTitle}</span>
          {feedback?.detail === undefined ? null : <span className="gc-feedback-detail" data-testid="course-feedback-detail">{feedback.detail}</span>}
        </div>
        {answered && !correct && feedback?.why !== undefined ? <p className="gc-why" data-testid="course-why">{feedback.why}</p> : null}
        {guide === undefined ? null : <p className="gc-answer-guide" data-testid="course-answer-guide">
          <span>{guide}</span>
          {autoWaiting ? <button type="button" className="gc-view-answer" data-testid="course-view-answer" onClick={cancelAuto}>この答えを見返す</button> : null}
        </p>}
      </section>
      <div className="gc-card-mid gc-keyboard">
        {marks !== undefined ? <MarksLegend miss={hasMiss} /> : <div className="gc-keyboard-head"><b>鍵盤</b><span>{exampleShown ? "正解の一例" : "押している音"}</span></div>}
        <CourseKeyboard guideNotes={exampleShown ? item.referenceNotes : []} showNames={exampleShown} stage marks={marks} />
        {exampleShown ? <p className="gc-example-notes" data-testid="course-example-notes">{noteNames(item.referenceNotes)}</p> : null}
      </div>
      <div className="gc-card-bottom">
        {exampleShown ? <div className="gc-review" data-testid="course-review">
          {item.prompt === "ear" ? <div className="gc-review-actions">
            <button type="button" data-testid="course-example-play" data-playing={demoPlaying ? "true" : undefined} disabled={demoPlaying} onClick={() => { cancelAuto(); void playExample(item); }}>{demoPlaying ? <><PlayingMark />再生中</> : "正解の一例を聴く"}</button>
          </div> : null}
          <p className="gc-review-note" data-testid="course-example-label">{correct && feedback?.midi === true ? "正解の一例" : "弾き方の例"}: {noteNames(item.referenceNotes)}。{item.prompt === "ear" ? `一番低い音は${itemRootLabel(item)}。上の音は別の配置でも弾けます` : "転回・別の配置でも合格です"}。</p>
        </div> : null}
        {!connected && feedback === undefined ? <div className="gc-choices gc-self-choices" data-testid="course-self-choices">
          <button type="button" data-testid="course-self-ok" disabled={pending} onClick={() => selfConfirm(true)}>弾けた</button>
          <button type="button" data-testid="course-self-miss" disabled={pending} onClick={() => selfConfirm(false)}>まだ難しい</button>
        </div> : null}
        {connected && nowQuestion.level <= 2 && feedback === undefined ? <div className="gc-give-up-row">
          <button type="button" className="gc-give-up" data-testid="course-give-up" disabled={pending} onClick={giveUp}>わからない</button>
        </div> : null}
        <div className="gc-actions">
          {feedback === undefined
            ? <button type="button" className="gc-next-idle" data-testid="course-next" disabled>次へ</button>
            : <button type="button" ref={nextRef} className="dojo-primary" data-testid="course-next" disabled={pending} onClick={advance}>{invalid ? "もう一度" : "次へ（Enter）"}</button>}
          <label className="gc-auto-advance">
            <input
              type="checkbox"
              data-testid="course-auto-advance"
              checked={autoAdvance}
              onChange={(event) => {
                const next = event.currentTarget.checked;
                setAutoAdvance(next);
                if (!next) {
                  setAutoEligible(false);
                  setAutoDue(false);
                  setAutoCancelled(false);
                }
              }}
            />
            正解したら自動で次へ
          </label>
        </div>
        {!connected ? <p className="gc-note" data-testid="course-self-note">自己確認です。進級判定には含まれません</p> : null}
      </div>
    </div>
    <p className="sr-only" data-testid="course-hidden-note">答えは表示していません。弾いた音だけで判定します。</p>
  </div>;
}

type GuidedScreen =
  | { readonly kind: "map" }
  | { readonly kind: "basic"; readonly level: CourseLevel; readonly mode: "official" | "practice" | "demo"; readonly block?: "sameDay" | "delay"; readonly wrongIds?: readonly string[] }
  | { readonly kind: "advanced"; readonly level: AdvancedCourseLevel; readonly mode: "official" | "practice" | "demo"; readonly block?: "sameDay" | "delay"; readonly wrongIds?: readonly string[] };

/**
 * Entry point for the whole guided course (P23-52: course map ①). Loads both the frozen Lv1–3 store
 * and the P23-45 advanced store, computes the nine-station frontier (rule 1: the next station opens
 * while a delayed check waits, capped at two pending), and enters either basic or advanced views
 * from the map. An unreadable basic store goes straight to its quarantine screen.
 */
export function GuidedCourseView({ onExit, settleMs }: GuidedCourseViewProps) {
  const basicRepo = useMemo(() => new CourseRepository(createCourseStorage()), []);
  const advRepo = useMemo(() => new AdvancedRepository(createAdvancedStorage()), []);
  const [basicStore, setBasicStore] = useState<CourseStore | undefined>();
  const [advancedStore, setAdvancedStore] = useState<AdvancedStore | undefined>();
  const [unreadableBasic, setUnreadableBasic] = useState(false);
  const [screen, setScreen] = useState<GuidedScreen>({ kind: "map" });
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([basicRepo.load(), advRepo.load()]).then(([basicLoaded, advLoaded]) => {
      if (!active) return;
      if (basicLoaded.kind === "unreadable") {
        setUnreadableBasic(true);
        return;
      }
      setUnreadableBasic(false);
      setBasicStore(basicLoaded.store);
      setAdvancedStore(advLoaded.kind === "unreadable"
        ? { schema: ADVANCED_STORE_SCHEMA, version: ADVANCED_STORE_VERSION, bankVersion: ADVANCED_BANK_VERSION, attempts: [], trials: [] }
        : advLoaded.store);
      setNow(new Date());
    }).catch(() => {
      if (active) setUnreadableBasic(true);
    });
    return () => { active = false; };
  }, [advRepo, basicRepo, reloadKey]);

  const frontier = useMemo<CourseFrontier | undefined>(() => {
    if (basicStore === undefined || advancedStore === undefined) return undefined;
    return courseFrontier(buildStationProgress(basicStore, advancedStore, now));
  }, [advancedStore, basicStore, now]);

  const openStation = useCallback((station: StationId, mode: "official" | "practice" | "demo", block?: "sameDay" | "delay") => {
    if (typeof station === "number" && station <= 3) {
      setScreen({ kind: "basic", level: station as CourseLevel, mode, ...(block === undefined ? {} : { block }) });
      return;
    }
    setScreen({ kind: "advanced", level: station as AdvancedCourseLevel, mode, ...(block === undefined ? {} : { block }) });
  }, []);

  const openWeakPractice = useCallback((station: StationId, itemIds: readonly string[]) => {
    if (itemIds.length === 0) return;
    if (typeof station === "number" && station <= 3) {
      setScreen({ kind: "basic", level: station as CourseLevel, mode: "practice", wrongIds: itemIds });
      return;
    }
    setScreen({ kind: "advanced", level: station as AdvancedCourseLevel, mode: "practice", wrongIds: itemIds });
  }, []);

  const backToMap = useCallback(() => {
    setScreen({ kind: "map" });
    setReloadKey((key) => key + 1);
  }, []);

  if (unreadableBasic) {
    return <BasicCourseView onExit={onExit} settleMs={settleMs} />;
  }

  if (basicStore === undefined || advancedStore === undefined || frontier === undefined) {
    return <div className="guided-course" data-testid="guided-course" aria-busy="true"><p className="gc-note" data-testid="course-loading">読み込み中</p></div>;
  }

  if (screen.kind === "map") {
    return <GuidedCourseMap
      basicStore={basicStore}
      advancedStore={advancedStore}
      frontier={frontier}
      now={now}
      onExit={onExit}
      onStartOfficial={(station, block) => openStation(station, "official", block)}
      onOpenDemo={(station) => openStation(station, "demo")}
      onOpenPractice={(station) => openStation(station, "practice")}
      onOpenWeakPractice={openWeakPractice}
      onRestartBasic={async (next) => { await basicRepo.save(next); setBasicStore(next); }}
      onRestartAdvanced={async (next) => { await advRepo.save(next); setAdvancedStore(next); }}
    />;
  }

  if (screen.kind === "basic") {
    return <BasicCourseView
      key={`basic-${screen.level}-${screen.mode}-${screen.block ?? ""}-${screen.wrongIds?.join(",") ?? ""}`}
      onExit={backToMap}
      settleMs={settleMs}
      targetLevel={screen.level}
      targetBlock={screen.block}
      demoOnly={screen.mode === "demo"}
      initialPractice={screen.mode === "practice" && screen.wrongIds === undefined ? screen.level : undefined}
      initialWrongIds={screen.wrongIds}
      frontier={frontier}
      onOpenStation={openStation}
    />;
  }

  const basicsPassed = frontier.states.get(4) !== "locked";
  return <AdvancedCourseView
    key={`adv-${String(screen.level)}-${screen.mode}-${screen.block ?? ""}-${screen.wrongIds?.join(",") ?? ""}`}
    onExit={backToMap}
    onSelectBasic={(level) => openStation(level, "practice")}
    settleMs={settleMs}
    basicsPassed={basicsPassed}
    initialLevel={screen.level}
    initialLevelChosen
    initialMode={screen.mode}
    initialWrongIds={screen.wrongIds}
    frontier={frontier}
    onOpenStation={openStation}
  />;
}

