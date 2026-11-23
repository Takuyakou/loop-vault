import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RotateCcw } from "lucide-react";
import { PlayingMark } from "../../components/ui";
import { usePreviewSound } from "../../components/PreviewSoundProvider";
import { courseNoteNames } from "./courseNoteNames";
import { DojoBackButton } from "./DojoBackButton";
import { useDojoMidi } from "./useDojoMidi";
import { CourseKeyboard } from "./CourseKeyboard";
import { GuidedPracticePanel } from "./GuidedPracticePanel";
import { LevelRestartDialog } from "./LevelRestartDialog";
import { GuideChordCard } from "./GuideChordCard";
import { GuidedResultSheet, type ResultAction, type ResultBar, type ResultBox } from "./GuidedResultSheet";
import { stationLabel } from "./GuidedCourseMap";
import { useGuidedAutoAdvance } from "./useGuidedAutoAdvance";
import "./advancedCourse.css";
import "./guidedRound.css";
import type { CourseFrontier, StationId } from "../../domain/chordDojo/guidedCourse/frontier";
import { resultMarks, wrongLines } from "./guidedMarks";
import { breakAfter, roundScore, roundState, ROUND_SIZE } from "./guidedRounds";
import { tipFor } from "./guidedTips";
import { MarksLegend, RoundBreak, RoundProgress, type RoundCompare } from "./GuidedRound";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import { liveMidiService } from "../../liveMidi/liveMidiService";
import { createLiveNoteState, reduceLiveNoteState, soundingNotes } from "../../domain/liveMidi";
import { playbackController } from "../../audio/playbackController";
import type { PreviewSound } from "../../audio/chordPreview";
import { symbol } from "../../domain/chordDojo/recipes";
import type { CourseLevel } from "../../domain/chordDojo/guidedCourse/bank";
import { delayEligibility, nextDelayAvailableAt } from "../../domain/chordDojo/guidedCourse/review";
import { CourseCapture, courseAttemptOutcome, hiddenInvalid, pollGapInvalid, type CourseInvalidReason, type CourseSealed } from "../../domain/chordDojo/guidedCourse/capture";
import { ADVANCED_LEVELS, advancedLevelSpec, type AdvancedBlock } from "../../domain/chordDojo/guidedCourse/advanced/levels";
import { advancedDemoItems, LV8_GROUPS, advancedSetIds, advancedItemById } from "../../domain/chordDojo/guidedCourse/advanced/bank";
import type { PracticeMaterial } from "../../domain/chordDojo/guidedCourse/advanced/practice";
import { NOTE_NAMES } from "../../domain/chordDojo/guidedCourse/advanced/build";
import { judgeAdvancedChord, judgeProgression, judgeSight, expectedChords, SIGHT_BEATS_PER_BAR, SIGHT_MAX_STOP_BEATS, SIGHT_PASS_RATIO } from "../../domain/chordDojo/guidedCourse/advanced/judge";
import { advancedPlan, advancedPracticePlan, advancedRoundStartedAt, evaluateAdvancedLevel, firstUnpassedAdvancedLevel, restartAdvancedLevel, weakAdvancedItemIdsFor, wrongAdvancedItemIdsFor, type AdvancedPlan, type AdvancedPracticePlan } from "../../domain/chordDojo/guidedCourse/advanced/review";
import { AdvancedRepository, appendAdvancedTrial, clearAdvancedActive, createAdvancedStorage, createAdvancedTrial, startAdvancedAttempt } from "../../domain/chordDojo/guidedCourse/advanced/store";
import type { AdvancedAttempt, AdvancedChord, AdvancedCourseLevel as AdvancedLevelAlias, AdvancedItem, AdvancedResult, AdvancedStep, AdvancedStore, AdvancedTrial } from "../../domain/chordDojo/guidedCourse/advanced/types";
import { diagnoseRound } from "./advancedDiagnosis";
import { advancedTipFor } from "./advancedTips";
/**
 * P23-45: the advanced guide course (Lv4–8 and 総合確認). It is a separate screen from the frozen
 * Lv1–3 course and uses a separate store, so the basic course's ids, pass rules and mid-attempt
 * position are never rewritten. Every level starts with examples and an explicit confirmation start;
 * official confirmation and free practice are distinct, and practice answers never count toward a
 * pass. Callers pass `basicsPassed` so the screen can say honestly that Lv4+ is practice-only until
 * the basic course is finished.
 */
export interface AdvancedCourseViewProps {
  readonly onExit: () => void;
  readonly onSelectBasic: (level: CourseLevel) => void;
  readonly settleMs: number;
  readonly basicsPassed: boolean;
  readonly initialLevel: AdvancedLevelAlias;
  /** P23-52: explicit mode chosen on the course map (omitted when mounted standalone in tests). */
  readonly initialMode?: "official" | "practice" | "demo";
  /** P23-55: weak items launched directly from a waiting/due station on the course map. */
  readonly initialWrongIds?: readonly string[] | undefined;
  /** P23-52: the nine-station frontier from the course map, used by the result screen's next step. */
  readonly frontier?: CourseFrontier;
  /** P23-52: jump from a finished result to another station without going back to the map first. */
  readonly onOpenStation?: (station: StationId, mode: "official" | "practice" | "demo", block?: "sameDay" | "delay") => void;
  /** Test seam: shorten the gap between reference chords. */
  readonly playbackGapMs?: number;
  /** True when the learner picked `initialLevel` explicitly (then it is not replaced by the plan). */
  readonly initialLevelChosen?: boolean;
}

interface CourseQuestion {
  readonly kind: "question";
  readonly level: AdvancedLevelAlias;
  readonly block: AdvancedBlock;
  readonly setId: string;
  readonly group?: string;
  readonly attempt: AdvancedAttempt;
  readonly item: AdvancedItem;
  readonly index: number;
  readonly total: number;
}

interface StartTarget {
  readonly level: AdvancedLevelAlias;
  readonly block: AdvancedBlock;
  readonly setId: string;
  readonly group?: string;
  readonly itemIds: readonly string[];
}

interface Feedback {
  readonly ok: boolean;
  readonly result: AdvancedResult;
  readonly message: string;
}

interface AnswerInput {
  readonly result: AdvancedResult;
  readonly steps: readonly AdvancedStep[];
  readonly sealedNotes: readonly number[];
  readonly hintUsed: boolean;
  readonly selfConfirmed: boolean;
  readonly midiConfirmed: boolean;
  readonly tempoBpm?: number;
  readonly startedAt: string;
  readonly sealedAt: string;
}

const LEVEL_TITLE: Readonly<Record<string, string>> = {
  placement: "配置を選ぶ",
  progression: "進行を覚えてつなぐ",
  transpose: "キーを変えて使う",
  vocab: "響きの語彙を広げる",
  "capstone-name": "コード名から弾く",
  "capstone-progression": "耳から進行を弾く",
  "capstone-sight": "初見の譜面を弾く",
};

const SIGHT_COUNT_IN = 4;

const noteNames = courseNoteNames;

function localTimeText(iso: string | undefined): string {
  if (iso === undefined) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function levelAbility(level: AdvancedLevelAlias): string {
  return advancedLevelSpec(level).ability;
}

function AdvancedHeader(props: {
  readonly onExit: () => void;
  readonly level: AdvancedLevelAlias;
  readonly title: string;
  readonly subtitle?: string;
  readonly progress?: string;
  readonly round?: ReactNode;
  readonly connected: boolean;
  readonly practice: boolean;
  /** Mid-confirmation exit to free practice (shown on the question screen only). */
  readonly onPractice?: (() => void) | undefined;
  /** Return to the official confirmation, resuming the saved position. */
  readonly onReturnOfficial?: (() => void) | undefined;
  readonly onRestart?: (() => void) | undefined;
  readonly dialog?: ReactNode;
}) {
  return <header className="gc-head">
    <div className="gc-head-row">
      <DojoBackButton label="コース" onBack={props.onExit} />
      <div className="gc-head-main">
        <p className="gc-kicker">ガイド練習 · <span data-testid="advanced-level">{advancedLevelSpec(props.level).label}</span>{props.practice ? " · 自由練習" : ""}</p>
        <h1>{props.title}</h1>
        {props.subtitle ? <p className="gc-sub">{props.subtitle}</p> : null}
      </div>
    </div>
    <div className="gc-meta">
      {props.round}
      {props.progress ? <span data-testid="advanced-progress">{props.progress}</span> : null}
      {props.onPractice === undefined ? null : <button type="button" data-testid="advanced-header-practice" onClick={props.onPractice}>自由練習へ</button>}
      {props.onReturnOfficial === undefined ? null : <button type="button" data-testid="advanced-header-return" onClick={props.onReturnOfficial}>確認に戻る</button>}
      {props.onRestart === undefined ? null : <button type="button" className="gc-restart" data-testid="advanced-restart" onClick={props.onRestart}><RotateCcw aria-hidden="true" size={16} />このレベルを最初から</button>}
    </div>
    {props.dialog}
  </header>;
}

/** Plays reference chords one after another; each new chord replaces the previous sound. */
async function playChordSequence(
  chords: readonly AdvancedChord[],
  sound: PreviewSound,
  id: string,
  options: { readonly gapMs?: number; readonly cancelled?: () => boolean; readonly onChord?: (index: number) => void } = {},
): Promise<void> {
  const gapMs = options.gapMs ?? 620;
  for (let index = 0; index < chords.length; index += 1) {
    if (options.cancelled?.() === true) return;
    options.onChord?.(index);
    const chord = chords[index]!;
    try {
      await playbackController.play(
        { kind: "practice", id },
        { type: "chord", chord: symbol(chord.root, chord.quality), sound, explicitMidiNotes: chord.referenceNotes },
      );
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, gapMs));
    if (options.cancelled?.() === true) return;
  }
}

function ChordCards(props: {
  readonly item: AdvancedItem;
  readonly stepIndex: number;
  readonly steps: readonly AdvancedStep[];
  readonly done: boolean;
  readonly conceal?: boolean;
}) {
  const chords = expectedChords(props.item);
  // P23-46: a single chord is already the big task label; do not repeat it in a one-card row.
  if (chords.length <= 1) return null;
  const reveal = props.item.revealCards || props.done;
  return <ol className="ac-cards" data-testid="advanced-cards">
    {chords.map((chord, index) => {
      const step = props.steps[index];
      const current = !props.done && index === props.stepIndex;
      const state = props.conceal === true && !props.done ? undefined : step === undefined ? undefined : step.ok ? "ok" : "bad";
      return <li key={`${chord.label}-${index}`} className="ac-card" data-current={current} data-state={state} data-testid={`advanced-card-${index}`}>
        <b>{reveal ? chord.label : `${index + 1}`}</b>
        <span>{reveal ? (props.conceal === true && !props.done ? "カード" : step === undefined ? "コード" : step.ok ? "◯" : "×") : "カード"}</span>
      </li>;
    })}
  </ol>;
}

function LevelGroups(props: { readonly store: AdvancedStore; readonly currentGroup?: string | undefined }) {
  const evaluation = evaluateAdvancedLevel(props.store, 8);
  return <div className="ac-group-row" data-testid="advanced-groups">
    {LV8_GROUPS.map((group) => {
      const entry = evaluation.groups?.find((candidate) => candidate.group === group.id);
      const passed = entry?.passed === true;
      const started = entry !== undefined && entry.sameDay.evaluated > 0;
      return <div key={group.id} className="ac-group" data-state={passed ? "passed" : started ? "active" : undefined} data-current={group.id === props.currentGroup}>
        <b>{group.label}</b>
        <span>{passed ? "合格" : started ? "確認中" : "未"}</span>
        <span>{entry === undefined ? "—" : `${entry.sameDay.independentCorrect}/${entry.sameDay.required} ・ 別日 ${entry.delay.independentCorrect}/${entry.delay.required}`}</span>
      </div>;
    })}
  </div>;
}

/* ---------------------------------------------------------------------------------------------- */
/* One advanced question: a chord, a progression, or a single ear chord.                           */
/* ---------------------------------------------------------------------------------------------- */

function AdvancedQuestion(props: {
  readonly question: CourseQuestion;
  readonly settleMs: number;
  readonly connected: boolean;
  readonly sound: PreviewSound;
  readonly pending: boolean;
  readonly paused: boolean;
  /** P23-47-fix-2: wrong-answer practice hides ear answers even in a practice attempt. */
  readonly hideAnswers?: boolean;
  readonly playbackGapMs?: number;
  readonly onRecord: (input: AnswerInput) => void;
  readonly onInvalid: (reason: CourseInvalidReason) => void;
  readonly onNext: () => void;
}) {
  const { question, settleMs, connected, sound } = props;
  const item = question.item;
  const expected = useMemo(() => expectedChords(item), [item]);
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps] = useState<AdvancedStep[]>([]);
  const [feedback, setFeedback] = useState<Feedback | undefined>();
  const [stepNotice, setStepNotice] = useState<Feedback | undefined>();
  const [autoAdvance, setAutoAdvance] = useGuidedAutoAdvance();
  const [autoEligible, setAutoEligible] = useState(false);
  const [autoDue, setAutoDue] = useState(false);
  const [autoCancelled, setAutoCancelled] = useState(false);
  const [heldCount, setHeldCount] = useState(0);
  const autoAdvanceRef = useRef(autoAdvance);
  autoAdvanceRef.current = autoAdvance;
  const advancing = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [playCount, setPlayCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [earReady, setEarReady] = useState(item.prompt !== "ear");
  const cancelled = useRef(false);
  const concealed = !item.revealCards && (!question.attempt.practice || props.hideAnswers === true);
  const startedAt = useRef(new Date().toISOString());
  const answered = useRef(false);
  const capture = useRef<CourseCapture>();
  const releaseGate = useRef(true);
  const rawNotes = useRef(createLiveNoteState());
  const lastPoll = useRef(0);
  const lastMonotonic = useRef(0);
  const lastWall = useRef(0);
  const stepIndexRef = useRef(0);
  const stepNotes = useRef<number[][]>([]);
  const stepSpeeds = useRef<(number | undefined)[]>([]);
  const feedbackRef = useRef<Feedback>();
  feedbackRef.current = feedback;
  const pendingRef = useRef(props.pending);
  pendingRef.current = props.pending;
  const replay = useRef(false);
  const replayBase = useRef(0);

  const armStep = useCallback((index: number) => {
    const chord = expected[index];
    if (chord === undefined) return;
    const held = soundingNotes(defaultLiveMidiStore.getState().notes);
    const next = new CourseCapture({ requiredCount: Math.max(1, chord.requiredPitchClasses.length), settleMs, waitForInput: false });
    next.arm(performance.now(), [...new Set(held)]);
    capture.current = next;
    releaseGate.current = held.length === 0;
    stepIndexRef.current = index;
    setStepIndex(index);
  }, [expected, settleMs]);

  useEffect(() => {
    cancelled.current = false;
    startedAt.current = new Date().toISOString();
    // An ear question waits for the standard presentation; every other question is ready at once.
    if (item.prompt !== "ear") armStep(0);
    return () => { cancelled.current = true; capture.current = undefined; playbackController.stop(); };
  }, [armStep, item.prompt]);

  // P23-47: the restart confirmation pauses capture, timeouts and playback; cancelling resumes the
  // same question at the same card without recording anything.
  const wasPaused = useRef(false);
  useEffect(() => {
    if (props.paused) {
      wasPaused.current = true;
      capture.current = undefined;
      playbackController.stop();
      setPlaying(false);
      return;
    }
    if (!wasPaused.current) return;
    wasPaused.current = false;
    if (answered.current || feedbackRef.current !== undefined) return;
    armStep(stepIndexRef.current);
  }, [armStep, props.paused]);

  const playMaterial = useCallback(async (markHint: boolean) => {
    if (markHint) setHintUsed(true);
    setPlayCount((count) => count + 1);
    // P23-47-fix-4: a replay pauses judging until it ends; the answer window opens at the end.
    const ear = item.prompt === "ear";
    if (ear) setEarReady(false);
    setPlaying(true);
    try {
      await playChordSequence([...(item.referenceChords ?? []), ...item.chords.slice(item.startIndex ?? 0)], sound, `advanced:${item.id}`, {
        ...(props.playbackGapMs === undefined ? {} : { gapMs: props.playbackGapMs }),
        cancelled: () => cancelled.current,
      });
    } finally {
      if (!cancelled.current) {
        setPlaying(false);
        if (ear) {
          setEarReady(true);
          armStep(0);
        }
      }
    }
  }, [armStep, item, props.playbackGapMs, sound]);

  const playPlain = useCallback(async () => {
    if (item.plainChords === undefined) return;
    setPlaying(true);
    try {
      await playChordSequence(item.plainChords, sound, `advanced:plain:${item.id}`, {
        ...(props.playbackGapMs === undefined ? {} : { gapMs: props.playbackGapMs }),
        cancelled: () => cancelled.current,
      });
    } finally {
      if (!cancelled.current) setPlaying(false);
    }
  }, [item, props.playbackGapMs, sound]);

  const autoPlayed = useRef(false);
  useEffect(() => {
    if (item.prompt !== "ear" || autoPlayed.current) return;
    autoPlayed.current = true;
    setEarReady(false);
    setPlayCount(1);
    setPlaying(true);
    void playChordSequence([...(item.referenceChords ?? []), ...item.chords.slice(item.startIndex ?? 0)], sound, `advanced:auto:${item.id}`, {
      ...(props.playbackGapMs === undefined ? {} : { gapMs: props.playbackGapMs }),
      cancelled: () => cancelled.current,
    }).finally(() => {
      if (cancelled.current) return;
      setPlaying(false);
      // The answer window opens only after the cadence and the progression have finished.
      setEarReady(true);
      armStep(0);
    });
  }, [armStep, item, props.playbackGapMs, sound]);

  const finish = useCallback((result: AdvancedResult, message: string) => {
    if (answered.current) return;
    answered.current = true;
    capture.current = undefined;
    const finalSteps = expected.map((chord, index) => {
      const notes = stepNotes.current[index] ?? [];
      return { notes, ok: notes.length > 0 && judgeAdvancedChord(chord, notes).ok, ...(stepSpeeds.current[index] === undefined ? {} : { speedMs: stepSpeeds.current[index] }) };
    });
    if (replay.current) {
      // A replay from a card is practice inside the same question; it is never recorded again.
      const base = replayBase.current;
      const displayed = finalSteps.map((step, index) => (index < base ? { notes: [] as number[], ok: true } : step));
      const played = finalSteps.slice(base);
      const ok = played.length > 0 && played.every((step) => step.ok);
      setSteps(displayed);
      setFeedback({ ok, result: ok ? "correct" : "wrong", message: ok ? `${base + 1}枚目から通せました` : `${base + 1}枚目からもう一度` });
      setAutoEligible(false);
      return;
    }
    setSteps(finalSteps);
    setFeedback({ ok: result === "correct", result, message: result === "correct" ? "正解" : result === "no-input" ? message : "不正解" });
    setAutoEligible(result === "correct" && autoAdvanceRef.current);
    setAutoDue(false);
    setAutoCancelled(false);
    props.onRecord({
      result,
      steps: finalSteps,
      sealedNotes: finalSteps.flatMap((step) => step.notes),
      hintUsed,
      selfConfirmed: false,
      midiConfirmed: true,
      startedAt: startedAt.current,
      sealedAt: new Date().toISOString(),
    });
  }, [expected, hintUsed, props]);

  const replayFrom = useCallback((index: number) => {
    setFeedback(undefined);
    setStepNotice(undefined);
    setSteps([]);
    stepNotes.current = [];
    stepSpeeds.current = [];
    answered.current = false;
    replay.current = true;
    replayBase.current = index;
    armStep(index);
  }, [armStep]);

  const handleSeal = useCallback((sealed: CourseSealed) => {
    const index = stepIndexRef.current;
    const chord = expected[index];
    if (chord === undefined) return;
    const outcome = courseAttemptOutcome(sealed, Math.max(1, chord.requiredPitchClasses.length));
    if (outcome === "no-input") {
      finish(index === 0 ? "no-input" : "wrong", index === 0 ? "入力がありませんでした" : `${index + 1}枚目で止まりました`);
      return;
    }
    const judgement = judgeAdvancedChord(chord, sealed.notes);
    stepNotes.current[index] = [...sealed.notes];
    stepSpeeds.current[index] = sealed.speedMs;
    setSteps((current) => {
      const next = [...current];
      next[index] = { notes: [...sealed.notes], ok: judgement.ok, ...(sealed.speedMs === undefined ? {} : { speedMs: sealed.speedMs }) };
      return next;
    });
    const nextIndex = index + 1;
    if (nextIndex < expected.length) {
      setStepNotice(concealed
        ? { ok: true, result: "correct", message: `${index + 1}枚目を弾きました。次のカードへ` }
        : { ok: judgement.ok, result: judgement.ok ? "correct" : "wrong", message: `${index + 1}枚目: ${judgement.reason}` });
      armStep(nextIndex);
      return;
    }
    if (expected.length === 1) {
      finish(judgement.ok ? "correct" : "wrong", judgement.reason);
      return;
    }
    const verdict = judgeProgression(item, expected.map((_, position) => stepNotes.current[position] ?? []));
    finish(verdict.ok ? "correct" : "wrong", verdict.reason);
  }, [armStep, concealed, expected, finish, item]);

  useEffect(() => {
    if (!connected || props.paused) return;
    const unsubscribe = liveMidiService.subscribeBatches((batch) => {
      const last = batch.events[batch.events.length - 1];
      for (const event of batch.events) {
        rawNotes.current = reduceLiveNoteState(rawNotes.current, event);
        if (feedbackRef.current !== undefined || pendingRef.current) { releaseGate.current = false; continue; }
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
    return () => unsubscribe();
  }, [connected]);

  const invalidate = useCallback((reason: CourseInvalidReason) => {
    if (feedback !== undefined || answered.current) return;
    capture.current?.invalidate(reason);
    capture.current = undefined;
    setFeedback({ ok: false, result: "invalid", message: "この回答は記録していません。もう一度弾いてください" });
    props.onInvalid(reason);
  }, [feedback, props]);

  useEffect(() => {
    if (!connected || !earReady || props.paused || feedback !== undefined || props.pending) return;
    // Starting (or resuming after a result/replay) must not inherit a stale poll clock.
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
        invalidate("stall");
        return;
      }
      if (lastPoll.current !== 0 && (monoDelta < 0 || Math.abs(monoDelta - wallDelta) > 100)) {
        invalidate("clock-jump");
        return;
      }
      lastPoll.current = monotonic;
      const sealed = capture.current?.advance(monotonic);
      if (sealed !== undefined) handleSeal(sealed);
    }, 10);
    return () => clearInterval(timer);
  }, [connected, earReady, feedback, handleSeal, invalidate, props.paused, props.pending]);

  useEffect(() => {
    if (!connected) return;
    lastPoll.current = 0;
    lastMonotonic.current = performance.now();
    lastWall.current = Date.now();
  }, [connected, question.attempt.attemptId, item.id]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") return;
      if (feedback !== undefined) return;
      if (hiddenInvalid(document.visibilityState) !== undefined) invalidate("hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [feedback, invalidate]);

  const selfConfirm = useCallback((ok: boolean) => {
    if (answered.current) return;
    answered.current = true;
    capture.current = undefined;
    setFeedback({ ok, result: ok ? "correct" : "wrong", message: ok ? "弾けた（自己確認）" : "まだ難しい" });
    setAutoEligible(false);
    props.onRecord({
      result: ok ? "correct" : "wrong",
      steps: [],
      sealedNotes: [],
      hintUsed,
      selfConfirmed: true,
      midiConfirmed: false,
      startedAt: startedAt.current,
      sealedAt: new Date().toISOString(),
    });
  }, [hintUsed, props]);

  const retryPractice = useCallback(() => {
    setFeedback(undefined);
    setStepNotice(undefined);
    setSteps([]);
    stepNotes.current = [];
    stepSpeeds.current = [];
    answered.current = false;
    setStepIndex(0);
    stepIndexRef.current = 0;
    setAutoEligible(false);
    setAutoDue(false);
    setAutoCancelled(false);
    if (item.prompt === "ear") void playMaterial(false);
    else armStep(0);
  }, [armStep, item.prompt, playMaterial]);

  /** One advance action for the button, Enter and the auto-advance timer. */
  const advance = useCallback(() => {
    if (advancing.current || props.pending) return;
    const current = feedbackRef.current;
    if (current === undefined) return;
    advancing.current = true;
    setFeedback(undefined);
    setStepNotice(undefined);
    setSteps([]);
    stepNotes.current = [];
    stepSpeeds.current = [];
    answered.current = false;
    setAutoEligible(false);
    setAutoDue(false);
    setAutoCancelled(false);
    if (current.result === "invalid") {
      setStepIndex(0);
      stepIndexRef.current = 0;
      armStep(0);
      props.onNext();
    } else {
      props.onNext();
    }
    window.setTimeout(() => { advancing.current = false; }, 60);
  }, [armStep, props]);

  const cancelAuto = useCallback(() => {
    setAutoEligible(false);
    setAutoDue(false);
    setAutoCancelled(true);
    nextRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!autoAdvance || !autoEligible || autoCancelled || props.paused) return;
    if (feedback === undefined || feedback.result !== "correct" || props.pending) return;
    const timer = window.setTimeout(() => setAutoDue(true), 1200);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, autoEligible, autoCancelled, feedback, props.paused, props.pending]);

  useEffect(() => {
    if (!autoAdvance || !autoDue || autoCancelled || !connected || props.paused) return;
    if (props.pending || heldCount > 0) return;
    advance();
  }, [advance, autoAdvance, autoDue, autoCancelled, connected, heldCount, props.paused, props.pending]);

  useEffect(() => {
    if (!connected) { setAutoEligible(false); setAutoDue(false); }
  }, [connected]);

  useEffect(() => {
    if (props.paused) { setAutoEligible(false); setAutoDue(false); }
  }, [props.paused]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (props.pending || feedbackRef.current === undefined || props.paused) return;
      if (document.querySelector("[role=dialog]")) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input,select,textarea,button,a,[contenteditable='true']")) return;
      event.preventDefault();
      advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, props.paused, props.pending]);

  const done = feedback !== undefined;
  const foundWrong = done ? steps.findIndex((step) => !step.ok) : -1;
  const correct = done && feedback.result === "correct";
  // A self-confirmed miss has no captured steps; still show (and play) the first reference.
  const wrongIndex = done && (feedback.result === "wrong" || feedback.result === "incomplete")
    ? (foundWrong >= 0 ? foundWrong : 0)
    : -1;
  // After an ear (or otherwise hidden) answer, open the card and keyboard as P23-46 asks.
  const exampleIndex = correct ? (expected.length > 1 ? Math.min(stepIndex, expected.length - 1) : 0) : wrongIndex;
  const keyboardIndex = exampleIndex >= 0 ? exampleIndex : done && (item.prompt === "ear" || !item.revealCards) ? 0 : -1;
  const keyboardNotes = keyboardIndex >= 0 ? expected[keyboardIndex]?.referenceNotes ?? [] : [];
  const wrongJudge = wrongIndex >= 0 ? judgeAdvancedChord(expected[wrongIndex]!, steps[wrongIndex]?.notes ?? []) : undefined;
  // P23-51 (mock ⑤): the wrong chord's played notes against its tones, on the keyboard and in one sentence.
  const wrongChord = wrongIndex >= 0 ? expected[wrongIndex] : undefined;
  const wrongPlayed = wrongIndex >= 0 ? steps[wrongIndex]?.notes ?? [] : [];
  const wrongAllowed = wrongChord === undefined ? [] : [...wrongChord.allowedPitchClasses, ...(wrongChord.bassPitchClass === undefined ? [] : [wrongChord.bassPitchClass])];
  const marks = wrongChord !== undefined && wrongPlayed.length > 0
    ? resultMarks(wrongPlayed, wrongChord.referenceNotes, wrongChord.requiredPitchClasses, wrongAllowed, wrongChord.bassPitchClass)
    : undefined;
  const lines = wrongChord !== undefined && wrongPlayed.length > 0
    ? wrongLines(wrongChord.label, wrongPlayed, wrongChord.referenceNotes, {
      required: wrongChord.requiredPitchClasses,
      allowed: wrongAllowed,
      ...(wrongChord.bassPitchClass === undefined ? {} : { bass: wrongChord.bassPitchClass }),
    })
    : undefined;
  const answerText = done && !item.revealCards && wrongIndex >= 0
    ? expected.map((chord) => chord.label).join(" → ")
    : undefined;
  const guidance = item.prompt === "ear"
    ? "聴いた順番のまま、1枚目から弾いてください"
    : item.kind === "transpose"
      ? "提示されたキーで、進行を1枚目から弾いてください"
      : expected.length > 1
        ? "1枚目から順番に弾いてください"
        : item.chords[0]?.bassPitchClass !== undefined
          ? `最低音を ${NOTE_NAMES[item.chords[0]!.bassPitchClass]} にして弾いてください`
          : "このコードを弾いてください";
  const instruction = done ? (correct ? "鍵盤で正解の一例を確認できます" : "鍵盤で見本を確認できます") : guidance;
  const lastQuestion = question.index >= question.total;
  const nextWord = lastQuestion ? "結果" : "次の問題";
  const autoWaiting = autoAdvance && autoEligible && !autoCancelled && correct;
  const guide = autoWaiting
    ? autoDue || heldCount > 0 ? `鍵盤を離すと${nextWord}へ` : `まもなく${nextWord}へ`
    : autoCancelled && correct ? "この問題の自動進行を止めました" : undefined;
  const status = feedback?.message
    ?? (playing
      ? "再生中・終わったら弾いてください"
      : item.prompt === "ear" && !earReady
        ? "標準の提示を聴いてください（終わると回答できます）"
        : expected.length > 1 ? `${stepIndex + 1}枚目を弾いてください` : connected ? "演奏を待っています" : "自己確認できます");
  const hiddenPrompt = item.prompt === "ear";
  const cardVisible = expected.length === 1 && (done || !hiddenPrompt);
  const playExample = () => {
    cancelAuto();
    void playChordSequence(expected, sound, `advanced:example:${item.id}`);
  };

  return <>
    <div className="gc-card">
      <section className="gc-card-top" data-testid="advanced-prompt">
        {cardVisible ? <GuideChordCard
          label={item.label}
          ariaLabel={done ? `${item.label}の正解の一例を聴く` : `${item.label}をヒントとして聴く`}
          playing={playing}
          onClick={() => { if (done) playExample(); else void playMaterial(true); }}
          testId="advanced-chord-card"
          nameTestId="advanced-prompt-name"
          hint={done ? "カードを押すと正解の一例を聴けます" : hintUsed ? "ヒントを聴きました" : "コードカードを押すとヒントになります"}
          hintTestId="advanced-chord-card-hint"
        /> : <p className="gc-chord" data-testid="advanced-prompt-name">{hiddenPrompt && !done ? "耳から再現" : item.label}</p>}
        <p className="gc-instruction" data-testid="advanced-instruction">{instruction}</p>
        {item.detail !== undefined ? <p className="ac-note" data-testid="advanced-detail">{item.detail}</p> : null}
        <ChordCards item={item} stepIndex={stepIndex} steps={steps} done={done} conceal={concealed} />
        {!done && !cardVisible ? <div className="gc-listen-row">
          <button type="button" data-testid="advanced-listen" disabled={props.pending || playing || (item.prompt === "ear" && steps.length > 0)} onClick={() => void playMaterial(item.prompt !== "ear" || playCount >= item.allowedPlaybacks)}>
            {item.prompt === "ear" ? (playCount >= item.allowedPlaybacks ? "もう一度聴く（ヒント）" : "もう一度聴く") : "お手本を聴く"}
          </button>
          {/* P23-56: a recolour question plays its plain progression for comparison; that is not the answer, so not a hint. */}
          {item.plainChords !== undefined && item.plainChords.length > 0
            ? <button type="button" data-testid="advanced-listen-plain" disabled={props.pending || playing} onClick={() => void playPlain()}>元の進行を聴く</button>
            : null}
          {hintUsed
            ? <span className="gc-note" data-testid="advanced-hint-note">お手本を使用しました（ヒントあり。独立確認にはなりません）</span>
            : <span className="gc-note">{item.prompt === "ear" ? `標準の提示 ${Math.min(playCount, item.allowedPlaybacks)} / ${item.allowedPlaybacks}` : "お手本はヒントありになります"}</span>}
        </div> : null}
        {/* P23-50: the verdict and the auto-advance line sit under the chord, as on the basic course's stage. */}
        <div className="gc-feedback" data-testid="advanced-feedback" role="status" aria-live="polite">
          <span data-testid="advanced-feedback-text" data-ok={feedback?.ok} data-result={feedback?.result}>{autoWaiting ? "✓ 正解" : status}</span>
          {wrongIndex >= 0 ? <span className="gc-feedback-detail" data-testid="advanced-review-reason">{expected.length > 1 ? `${wrongIndex + 1}枚目 ${expected[wrongIndex]?.label}: ` : ""}{lines?.kind === "swap" ? lines.line : wrongJudge?.reason ?? "もう一度確認しましょう"}</span> : null}
        </div>
        {lines !== undefined ? <p className="gc-why" data-testid="advanced-why">{lines.sub}</p> : null}
        {guide === undefined ? null : <p className="gc-answer-guide" data-testid="advanced-answer-guide">
          <span>{guide}</span>
          {autoWaiting ? <button type="button" className="gc-view-answer" data-testid="advanced-view-answer" onClick={cancelAuto}>この答えを見返す</button> : null}
        </p>}
        {stepNotice !== undefined && !done ? <p className="gc-note" data-testid="advanced-step-notice" data-ok={stepNotice.ok}>{stepNotice.message}</p> : null}
      </section>
      <div className="gc-card-mid gc-keyboard">
        {marks !== undefined ? <MarksLegend miss={[...marks.values()].includes("miss")} /> : <div className="gc-keyboard-head"><b>鍵盤</b><span>{keyboardIndex >= 0 ? (correct ? "正解の一例" : "見本の音名") : "押している音"}</span></div>}
        <CourseKeyboard guideNotes={keyboardNotes} showNames={keyboardIndex >= 0} stage marks={marks} />
        {keyboardIndex >= 0 ? <p className="gc-example-notes" data-testid="advanced-example-notes">{noteNames(keyboardNotes)}</p> : null}
      </div>
      <div className="gc-card-bottom">
        {answerText !== undefined ? <p className="gc-review-note" data-testid="advanced-answer-label">答え: {answerText}</p> : null}
        {correct ? <div className="gc-review" data-testid="advanced-review">
          {!cardVisible ? <div className="gc-review-actions">
            <button type="button" data-testid="advanced-example-play" data-playing={playing ? "true" : undefined} disabled={playing} onClick={() => { cancelAuto(); void playMaterial(true); }}>{playing ? "再生中" : "正解の一例を聴く"}</button>
          </div> : null}
          <p className="gc-review-note" data-testid="advanced-example-label">正解の一例: {noteNames(keyboardNotes)}。転回・別の配置でも合格です。</p>
        </div> : wrongIndex >= 0 ? <div className="gc-review" data-testid="advanced-review">
          <div className="gc-review-actions">
            {!cardVisible ? <button type="button" data-testid="advanced-example-play" data-playing={playing ? "true" : undefined} disabled={playing} onClick={() => void playMaterial(true)}>{playing ? <><PlayingMark />再生中</> : "見本を聴く"}</button> : null}
            {connected && expected.length > 1 ? <button type="button" data-testid="advanced-replay-card" onClick={() => replayFrom(wrongIndex)}>{wrongIndex + 1}枚目から弾き直す</button> : null}
          </div>
          <p className="gc-review-note" data-testid="advanced-example-label">弾き方の例: {noteNames(expected[wrongIndex]?.referenceNotes ?? [])}。転回・別の配置でも合格です。</p>
        </div> : null}
        {!connected && !done && earReady ? <div className="gc-choices gc-self-choices" data-testid="advanced-self-choices">
          <button type="button" data-testid="advanced-self-ok" disabled={props.pending} onClick={() => selfConfirm(true)}>弾けた</button>
          <button type="button" data-testid="advanced-self-miss" disabled={props.pending} onClick={() => selfConfirm(false)}>まだ難しい</button>
        </div> : null}
        <div className="gc-actions">
          {question.attempt.practice && done && feedback.result !== "correct" && feedback.result !== "invalid" ? <button type="button" data-testid="advanced-practice-retry" disabled={props.pending} onClick={retryPractice}>もう一度弾く</button> : null}
          {!done
            ? <button type="button" className="gc-next-idle" data-testid="advanced-next" disabled>次へ</button>
            : <button type="button" ref={nextRef} className="dojo-primary" data-testid="advanced-next" disabled={props.pending} onClick={advance}>{feedback.result === "invalid" ? "もう一度" : "次へ（Enter）"}</button>}
          <label className="gc-auto-advance">
            <input
              type="checkbox"
              data-testid="advanced-auto-advance"
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
        {!connected ? <p className="gc-note" data-testid="advanced-self-note">自己確認です。進級判定には含まれません</p> : null}
      </div>
    </div>
    <p className="sr-only" data-testid="advanced-hidden-note">答えは表示していません。弾いた音だけで判定します。</p>
  </>;
}

/* ---------------------------------------------------------------------------------------------- */
/* Capstone ③: an eight-bar chord chart, sampled on every beat.                                    */
/* ---------------------------------------------------------------------------------------------- */

const SIGHT_BPM_CHOICES = [60, 70, 80, 90, 100] as const;

function SightQuestion(props: {
  readonly question: CourseQuestion;
  readonly sound: PreviewSound;
  readonly pending: boolean;
  readonly connected: boolean;
  readonly paused: boolean;
  readonly playbackGapMs?: number;
  readonly onRecord: (input: AnswerInput) => void;
  readonly onInvalid: (reason: CourseInvalidReason) => void;
  readonly onNext: () => void;
}) {
  const { question, sound, connected } = props;
  const item = question.item;
  const [bpm, setBpm] = useState(item.tempoBpm ?? 80);
  const beatMs = 60_000 / bpm;
  const totalBeats = item.chords.length * SIGHT_BEATS_PER_BAR;
  const totalRun = SIGHT_COUNT_IN + totalBeats;
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [steps, setSteps] = useState<AdvancedStep[]>([]);
  const [feedback, setFeedback] = useState<Feedback | undefined>();
  const [playing, setPlaying] = useState(false);
  const [official, setOfficial] = useState(false);
  const startedAt = useRef(new Date().toISOString());
  const beatRef = useRef(-1);
  const samplesRef = useRef<number[][]>([]);
  const startedRef = useRef(0);
  // P23-47-fix-4: a run started without MIDI is a beat practice; a later connection must not turn it official.
  const startedConnected = useRef(connected);
  const timer = useRef<ReturnType<typeof setInterval>>();
  const finished = useRef(false);
  const lastMono = useRef(0);
  const lastWall = useRef(0);

  const clearTimer = useCallback(() => {
    if (timer.current !== undefined) clearInterval(timer.current);
    timer.current = undefined;
  }, []);

  useEffect(() => () => { clearTimer(); playbackController.stop(); }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    finished.current = false;
    beatRef.current = -1;
    samplesRef.current = [];
    setRunning(false);
    setBeat(-1);
    setSteps([]);
    setFeedback(undefined);
  }, [clearTimer]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    const judgement = judgeSight(item, samplesRef.current);
    // P23-47-fix-4: without MIDI this is a beat-reading practice, not a marked run: no score, no record.
    if (!startedConnected.current) {
      setSteps([]);
      setFeedback({ ok: true, result: "incomplete", message: "8小節の拍を確認しました" });
      return;
    }
    setSteps([...judgement.steps]);
    setFeedback({
      ok: judgement.ok,
      result: judgement.ok ? "correct" : "wrong",
      message: `${judgement.reason}（${judgement.matched}/${judgement.total}拍）`,
    });
    props.onRecord({
      result: judgement.ok ? "correct" : "wrong",
      steps: judgement.steps,
      sealedNotes: samplesRef.current.flat(),
      hintUsed: false,
      selfConfirmed: false,
      midiConfirmed: true,
      tempoBpm: bpm,
      startedAt: startedAt.current,
      sealedAt: new Date().toISOString(),
    });
  }, [bpm, connected, item, props]);

  const stop = useCallback((record: boolean) => {
    clearTimer();
    setRunning(false);
    if (record) finish();
  }, [clearTimer, finish]);

  const invalidate = useCallback((reason: CourseInvalidReason) => {
    clearTimer();
    setRunning(false);
    setFeedback({ ok: false, result: "invalid", message: "記録していません。同じ問題からやり直せます" });
    if (connected) props.onInvalid(reason);
  }, [clearTimer, connected, props]);

  // A disconnect during an official run resumes the same question instead of recording.
  useEffect(() => {
    if (!running) return;
    if (startedConnected.current && !connected) invalidate("disconnected");
  }, [connected, invalidate, running]);

  useEffect(() => {
    if (!running) return;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") invalidate("hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [invalidate, running]);

  const beginTimer = useCallback((initialElapsed: number) => {
    startedRef.current = performance.now() - initialElapsed;
    lastMono.current = performance.now();
    lastWall.current = Date.now();
    timer.current = setInterval(() => {
      const monotonic = performance.now();
      const wall = Date.now();
      const monoDelta = monotonic - lastMono.current;
      const wallDelta = wall - lastWall.current;
      lastMono.current = monotonic;
      lastWall.current = wall;
      if (monoDelta < 0 || Math.abs(monoDelta - wallDelta) > 100) {
        invalidate("clock-jump");
        return;
      }
      const elapsed = monotonic - startedRef.current;
      const index = Math.floor(elapsed / beatMs);
      if (index > beatRef.current) {
        beatRef.current = index;
        setBeat(index);
        const sampleIndex = index - SIGHT_COUNT_IN;
        // Sample only the beat that just arrived. A late timer must never copy today's keys
        // into skipped beats: those stay empty and count as not played.
        if (sampleIndex >= 0 && sampleIndex < totalBeats) {
          samplesRef.current[sampleIndex] = [...soundingNotes(defaultLiveMidiStore.getState().notes)];
        }
      }
      if (elapsed >= totalRun * beatMs) stop(true);
    }, Math.min(40, beatMs / 4));
  }, [beatMs, invalidate, stop, totalBeats, totalRun]);

  const start = useCallback(() => {
    if (running) return;
    reset();
    startedAt.current = new Date().toISOString();
    startedConnected.current = connected;
    setOfficial(connected);
    samplesRef.current = [];
    setRunning(true);
    beginTimer(0);
  }, [beginTimer, connected, reset, running]);

  // P23-47: the restart confirmation pauses the performance; cancelling resumes the same beat.
  const pausedElapsed = useRef(0);
  useEffect(() => {
    if (!props.paused || !running) return;
    pausedElapsed.current = performance.now() - startedRef.current;
    clearTimer();
    setRunning(false);
  }, [clearTimer, props.paused, running]);
  useEffect(() => {
    if (props.paused || pausedElapsed.current <= 0) return;
    const elapsed = pausedElapsed.current;
    pausedElapsed.current = 0;
    setRunning(true);
    beginTimer(elapsed);
  }, [beginTimer, props.paused]);

  const done = feedback !== undefined;
  const playingBeats = Math.max(0, Math.min(totalBeats, beat - SIGHT_COUNT_IN + 1));
  const currentBar = done || beat < SIGHT_COUNT_IN ? -1 : Math.floor((beat - SIGHT_COUNT_IN) / SIGHT_BEATS_PER_BAR);
  const currentBeatInBar = done || beat < SIGHT_COUNT_IN ? 0 : ((beat - SIGHT_COUNT_IN) % SIGHT_BEATS_PER_BAR) + 1;
  const wrongIndex = done ? steps.findIndex((step) => !step.ok) : -1;
  const guideReference = wrongIndex >= 0 ? item.chords[Math.floor(wrongIndex / SIGHT_BEATS_PER_BAR)]?.referenceNotes ?? [] : [];
  const countIn = running && beat < SIGHT_COUNT_IN;
  const status = feedback?.message
    ?? (props.paused
      ? "一時停止中"
      : running
        ? countIn ? `カウント ${beat + 1} / ${SIGHT_COUNT_IN}` : `${currentBar + 1} 小節・${currentBeatInBar} 拍目`
        : "開始を押すと拍が進みます");

  return <>
    <div className="gc-card">
      <section className="gc-card-top">
        <p className="gc-chord ac-sight-title" data-testid="advanced-sight-name">{item.label}</p>
        <p className="gc-instruction">{done ? "結果を確認してください" : running ? (countIn ? "カウントを聴いて、構えてください" : "拍に合わせて、各小節のコードを弾いてください") : `このテンポで 4 拍カウントのあと、8 小節を弾きます（${bpm} BPM）`}</p>
        <label className="ac-tempo">
          <span>テンポ</span>
          <select data-testid="advanced-sight-tempo" value={bpm} disabled={running || done} onChange={(event) => setBpm(Number(event.currentTarget.value))}>
            {[...new Set([...SIGHT_BPM_CHOICES, item.tempoBpm ?? 80])].sort((left, right) => left - right).map((choice) => <option key={choice} value={choice}>{choice} BPM</option>)}
          </select>
        </label>
        <ol className="ac-sight-chart" data-testid="advanced-sight-chart">
          {item.chords.map((chord, index) => {
            const bars = steps.length === 0 ? undefined : [0, 1, 2, 3].map((offset) => steps[index * SIGHT_BEATS_PER_BAR + offset]).filter((step) => step !== undefined);
            const state = bars === undefined || bars.length !== SIGHT_BEATS_PER_BAR ? undefined : bars.every((step) => step.ok) ? "ok" : bars.some((step) => step.ok) ? undefined : "bad";
            return <li key={`${chord.label}-${index}`} className="ac-sight-bar" data-current={index === currentBar} data-state={state} data-testid={`advanced-bar-${index}`}>
              <b>{chord.label}</b>
              <span>小節 {index + 1}</span>
            </li>;
          })}
        </ol>
        <div className="ac-tempo" data-testid="advanced-beat">
          <i className="ac-beat" data-on={running} />
          <span>{done ? "終了" : running ? (countIn ? `カウント ${beat + 1} / ${SIGHT_COUNT_IN}` : `${bpm} BPM ・ 小節 ${currentBar + 1} / 8 ・ 拍 ${currentBeatInBar} / 4 ・ 全体 ${playingBeats} / ${totalBeats}`) : `${bpm} BPM ・ 8小節 ・ 32拍`}</span>
        </div>
        <div className="gc-feedback" data-testid="advanced-feedback" role="status" aria-live="polite">
          <span data-testid="advanced-feedback-text" data-ok={feedback?.ok} data-result={feedback?.result}>{status}</span>
        </div>
        {!connected ? <p className="gc-panel-warn" data-testid="advanced-sight-connection">MIDI 未接続です。譜面と拍の練習はできますが、正式な記録は接続して通した試行だけです。</p> : null}
      </section>
      <div className="gc-card-mid gc-keyboard">
        <div className="gc-keyboard-head"><b>鍵盤</b><span>{guideReference.length > 0 ? "見本の音名" : "押している音"}</span></div>
        <CourseKeyboard guideNotes={guideReference} showNames={guideReference.length > 0} stage />
      </div>
      <div className="gc-card-bottom">
        {done && official ? <p className="ac-note" data-testid="advanced-sight-summary">合格ライン {Math.round(SIGHT_PASS_RATIO * 100)}%・途中停止 {SIGHT_MAX_STOP_BEATS} 拍以内。{item.chords.map((chord) => chord.label).join(" → ")}</p> : null}
        {done ? <div className="gc-review" data-testid="advanced-review">
          <div className="gc-review-actions">
            <button type="button" data-testid="advanced-example-play" data-playing={playing ? "true" : undefined} disabled={playing} onClick={() => {
              setPlaying(true);
              void playChordSequence(item.chords, sound, `advanced:sight:${item.id}`, {
                ...(props.playbackGapMs === undefined ? {} : { gapMs: props.playbackGapMs }),
              }).finally(() => setPlaying(false));
            }}>{playing ? <><PlayingMark />再生中</> : "見本を聴く"}</button>
          </div>
        </div> : null}
        <div className="gc-actions">
          {running ? <button type="button" data-testid="advanced-sight-stop" onClick={() => stop(false)}>止める</button> : null}
          {!done && !running ? <button type="button" className="dojo-primary" data-testid="advanced-sight-start" onClick={start}>{connected ? `このテンポで開始（${bpm} BPM）` : "拍の練習を始める"}</button> : null}
          {done && feedback.result === "invalid" ? <button type="button" className="dojo-primary" data-testid="advanced-sight-retry" onClick={reset}>同じ問題からやり直す</button> : null}
          {done && feedback.result !== "invalid" && official ? <button type="button" className="dojo-primary" data-testid="advanced-next" disabled={props.pending} onClick={() => props.onNext()}>次へ</button> : null}
          {done && feedback.result !== "invalid" && !official ? <button type="button" className="dojo-primary" data-testid="advanced-sight-retry" onClick={reset}>もう一度</button> : null}
        </div>
      </div>
    </div>
    <p className="sr-only" data-testid="advanced-hidden-note">譜面のコードを拍に合わせて弾いてください。</p>
  </>;
}

/* ---------------------------------------------------------------------------------------------- */
/* The screen.                                                                                     */
/* ---------------------------------------------------------------------------------------------- */

export function AdvancedCourseView(props: AdvancedCourseViewProps) {
  const { sound } = usePreviewSound();
  const { connected, prepareAudio } = useDojoMidi(false);
  const repository = useMemo(() => new AdvancedRepository(createAdvancedStorage()), []);
  const [store, setStore] = useState<AdvancedStore | undefined>();
  const [loadProblem, setLoadProblem] = useState<string | undefined>();
  const [fatal, setFatal] = useState<string | undefined>();
  const [now, setNow] = useState(() => new Date());
  const [level, setLevel] = useState<AdvancedLevelAlias>(props.initialLevel);
  const [mode, setMode] = useState<"official" | "practice">(
    props.initialMode === "practice" ? "practice" : props.initialMode === "official" ? "official" : props.basicsPassed ? "official" : "practice",
  );
  const [demoOnly, setDemoOnly] = useState(props.initialMode === "demo");
  const [group, setGroup] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [frozen, setFrozen] = useState<CourseQuestion | undefined>();
  /** P23-51: the round end whose pause is open (attempt id and position). */
  const [roundBreak, setRoundBreak] = useState<string | undefined>();
  const [customPractice, setCustomPractice] = useState<{ readonly itemIds: readonly string[]; readonly label: string } | undefined>();
  const [wrongPractice, setWrongPractice] = useState<{ readonly level: AdvancedLevelAlias; readonly itemIds: readonly string[] } | undefined>();
  const [restartOpen, setRestartOpen] = useState(false);
  const [restartBusy, setRestartBusy] = useState(false);
  const [restartError, setRestartError] = useState<string | undefined>();
  const [practiceResetKey, setPracticeResetKey] = useState(0);
  const restartOpener = useRef<HTMLElement | null>(null);
  const [demoIndex, setDemoIndex] = useState(0);
  const [demoSeen, setDemoSeen] = useState<ReadonlySet<string>>(new Set());
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [demoPhase, setDemoPhase] = useState<"idle" | "cadence" | "progression">("idle");
  const [demoChordIndex, setDemoChordIndex] = useState(0);
  const demoToken = useRef(0);
  const chosen = useRef(props.initialLevelChosen === true);

  const playDemo = useCallback((target: (typeof demoItems)[number] | undefined) => {
    if (target === undefined) return;
    const token = ++demoToken.current;
    playbackController.stop();
    setDemoPlaying(true);
    setDemoChordIndex(0);
    const cadence = target.referenceChords ?? [];
    setDemoPhase(cadence.length > 0 ? "cadence" : "progression");
    const chords = expectedChords(target);
    void playChordSequence([...cadence, ...chords], sound, `advanced:demo:${target.id}`, {
      ...(props.playbackGapMs === undefined ? {} : { gapMs: props.playbackGapMs }),
      cancelled: () => token !== demoToken.current,
      onChord(index) {
        if (token !== demoToken.current) return;
        if (index < cadence.length) {
          setDemoPhase("cadence");
        } else {
          setDemoPhase("progression");
          setDemoChordIndex(index - cadence.length);
        }
      },
    }).finally(() => {
      if (token !== demoToken.current) return;
      setDemoPlaying(false);
      setDemoPhase("idle");
    });
  }, [props.playbackGapMs, sound]);

  const stopDemo = useCallback(() => {
    demoToken.current += 1;
    playbackController.stop();
    setDemoPlaying(false);
    setDemoPhase("idle");
  }, []);
  useEffect(() => () => { demoToken.current += 1; playbackController.stop(); }, []);

  useEffect(() => {
    prepareAudio();
    const main = document.getElementById("main-content");
    if (main !== null) main.scrollTop = 0;
  }, [prepareAudio]);

  useEffect(() => {
    let active = true;
    void repository.load().then((loaded) => {
      if (!active) return;
      if (loaded.kind === "unreadable") { setLoadProblem(loaded.reason); return; }
      if (props.initialWrongIds !== undefined && props.initialWrongIds.length > 0) {
        const next = startAdvancedAttempt(clearAdvancedActive(loaded.store, "free"), {
          level: props.initialLevel,
          block: "sameDay",
          setId: "practice",
          itemIds: props.initialWrongIds,
          practice: true,
          mode: "midi",
        }, new Date());
        setLevel(props.initialLevel);
        setMode("practice");
        setWrongPractice({ level: props.initialLevel, itemIds: props.initialWrongIds });
        setCustomPractice({ itemIds: props.initialWrongIds, label: "間違えた・迷った問題の練習" });
        setDemoIndex(0);
        setStore(next);
        void repository.save(next);
        return;
      }
      setStore(loaded.store);
      if (props.initialMode === "practice" || props.initialMode === "demo") {
        setLevel(props.initialLevel);
        setMode("practice");
        return;
      }
      const resume = loaded.store.attempts.find((attempt) => attempt.attemptId === loaded.store.active && !attempt.practice);
      if (resume !== undefined && (props.initialMode === undefined || resume.level === props.initialLevel)) {
        // Resume the official attempt wherever it is (the mid-attempt position must survive).
        setLevel(resume.level);
        setMode("official");
      } else if (props.initialMode === "official") {
        setLevel(props.initialLevel);
        setMode("official");
      } else if (props.basicsPassed && !chosen.current) {
        const first = firstUnpassedAdvancedLevel(loaded.store);
        if (first !== undefined) setLevel(first);
      } else if (!props.basicsPassed) {
        setLevel(4);
        setMode("practice");
      }
    }).catch((error: unknown) => {
      if (active) setLoadProblem(error instanceof Error ? error.message : "保存データを読めません");
    });
    return () => { active = false; };
  }, [props.basicsPassed, props.initialLevel, props.initialMode, props.initialWrongIds, repository]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const officialLevel = useMemo(() => (store === undefined ? undefined : firstUnpassedAdvancedLevel(store)), [store]);

  const plan = useMemo<AdvancedPlan | AdvancedPracticePlan | undefined>(() => {
    if (store === undefined) return undefined;
    return mode === "official" ? advancedPlan(store, level, now) : advancedPracticePlan(store, level, level === 8 ? group : undefined);
  }, [group, level, mode, now, store]);

  const liveQuestion = plan?.kind === "question" ? (plan as CourseQuestion) : undefined;
  const question = frozen ?? liveQuestion;

  const save = useCallback(async (next: AdvancedStore): Promise<AdvancedStore | undefined> => {
    setPending(true);
    try {
      await repository.save(next);
      setStore(next);
      return next;
    } catch (error) {
      setFatal(error instanceof Error ? error.message : "保存できません");
      return undefined;
    } finally {
      setPending(false);
    }
  }, [repository]);

  const begin = useCallback(async (base: AdvancedStore, target: StartTarget, practice: boolean) => {
    const next = startAdvancedAttempt(base, {
      level: target.level,
      block: target.block,
      setId: target.setId,
      itemIds: target.itemIds,
      ...(target.group === undefined ? {} : { group: target.group }),
      practice,
      mode: connected ? "midi" : "self",
    }, new Date());
    await save(next);
  }, [connected, save]);

  const record = useCallback((input: AnswerInput, asInvalid: boolean) => {
    if (store === undefined || question === undefined) return;
    const trial = createAdvancedTrial({
      attempt: question.attempt,
      itemId: question.item.id,
      result: input.result,
      steps: input.steps,
      sealedNotes: input.sealedNotes,
      ...(input.tempoBpm === undefined ? {} : { tempoBpm: input.tempoBpm }),
      hintUsed: input.hintUsed,
      selfConfirmed: input.selfConfirmed,
      midiConfirmed: input.midiConfirmed,
      startedAt: input.startedAt,
      sealedAt: input.sealedAt,
      ...(asInvalid ? { suffix: `invalid:${Date.now()}:${Math.random().toString(36).slice(2, 8)}` } : {}),
    });
    setFrozen(question);
    const next = appendAdvancedTrial(store, trial);
    if (next !== store) void save(next);
  }, [question, save, store]);

  const onRecord = useCallback((input: AnswerInput) => record(input, false), [record]);
  const onInvalid = useCallback((reason: CourseInvalidReason) => {
    void reason;
    record({
      result: "invalid",
      steps: [],
      sealedNotes: [],
      hintUsed: false,
      selfConfirmed: false,
      midiConfirmed: false,
      startedAt: new Date().toISOString(),
      sealedAt: new Date().toISOString(),
    }, true);
  }, [record]);

  const startCustomPractice = useCallback((material: PracticeMaterial) => {
    if (store === undefined) return;
    setCustomPractice({ itemIds: material.itemIds, label: material.label });
    setMode("practice");
    setFrozen(undefined);
    void begin(clearAdvancedActive(store, "free"), { level: material.level, block: "sameDay", setId: "practice", itemIds: material.itemIds }, true);
  }, [begin, store]);

  const goPractice = useCallback(() => {
    stopDemo();
    setWrongPractice(undefined);
    setMode("practice");
    setFrozen(undefined);
    setCustomPractice(undefined);
    setDemoIndex(0);
    if (level === 8 && group === undefined) setGroup(LV8_GROUPS[0]!.id);
  }, [group, level, stopDemo]);

  const startWrongPractice = useCallback((targetLevel: AdvancedLevelAlias, itemIds: readonly string[]) => {
    if (store === undefined || itemIds.length === 0) return;
    setWrongPractice({ level: targetLevel, itemIds });
    setMode("practice");
    setFrozen(undefined);
    setCustomPractice({ itemIds, label: "間違えた・迷った問題の練習" });
    setDemoIndex(0);
    void begin(clearAdvancedActive(store, "free"), { level: targetLevel, block: "sameDay", setId: "practice", itemIds }, true);
  }, [begin, store]);

  const endWrongPractice = useCallback(() => {
    setWrongPractice(undefined);
    setMode("official");
    setFrozen(undefined);
    setCustomPractice(undefined);
    if (props.initialWrongIds !== undefined) {
      if (store !== undefined) {
        void save(clearAdvancedActive(store, "free")).then(() => props.onExit());
      } else {
        props.onExit();
      }
    }
  }, [props, save, store]);

  const returnToOfficial = useCallback(() => {
    stopDemo();
    setMode("official");
    setFrozen(undefined);
    setCustomPractice(undefined);
    if (officialLevel !== undefined) setLevel(officialLevel);
  }, [officialLevel, stopDemo]);

  const openRestart = useCallback(() => {
    if (restartBusy || pending) return;
    restartOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRestartError(undefined);
    stopDemo();
    setRestartOpen(true);
    // P23-47: stop the old playback (demo/ear/sight) while the confirmation is open.
    playbackController.stop();
  }, [pending, restartBusy, stopDemo]);

  useEffect(() => {
    if (restartOpen) return;
    // Esc / continue returns focus to the button that opened the confirmation.
    restartOpener.current?.focus({ preventScroll: true });
  }, [restartOpen]);

  const cancelRestart = useCallback(() => {
    if (restartBusy) return;
    setRestartOpen(false);
    setRestartError(undefined);
  }, [restartBusy]);

  const confirmRestart = useCallback(async () => {
    if (store === undefined || restartBusy) return;
    setRestartBusy(true);
    setRestartError(undefined);
    try {
      const next = restartAdvancedLevel(store, level, new Date());
      await repository.save(next);
      setStore(next);
      setRestartOpen(false);
      setFrozen(undefined);
      setCustomPractice(undefined);
      playbackController.stop();
      if (mode === "practice") {
        setPracticeResetKey((key) => key + 1);
      } else {
        setMode("official");
        setDemoSeen((seen) => {
          const copy = new Set(seen);
          copy.delete(`${String(level)}:official`);
          copy.delete(`${String(level)}:practice`);
          return copy;
        });
      }
    } catch (error) {
      setRestartError(error instanceof Error ? error.message : "保存できませんでした。元の状態のまま、もう一度お試しください。");
    } finally {
      setRestartBusy(false);
    }
  }, [level, mode, repository, restartBusy, store]);

  const demoItems = useMemo(() => advancedDemoItems(level), [level]);
  const demosSeen = demoSeen.has(`${String(level)}:${mode}`);
  const roundBoundary = store === undefined ? undefined : advancedRoundStartedAt(store, level);
  const officialAttempts = store === undefined
    ? []
    : store.attempts.filter((attempt) => attempt.level === level && !attempt.practice && (roundBoundary === undefined || Date.parse(attempt.startedAt) >= Date.parse(roundBoundary)));
  const demoActive = demoItems.length > 0 && (demoOnly || (mode === "official" && store !== undefined && officialAttempts.length === 0 && !demosSeen && plan?.kind === "start"));

  if (fatal !== undefined) {
    return <div className="guided-course" data-testid="guided-course">
      <AdvancedHeader onExit={props.onExit} level={level} title="保存できません" connected={connected} practice={mode === "practice"} />
      <section className="gc-panel">
        <p className="gc-panel-kicker">保存</p>
        <h2>直前の入力を保存できませんでした</h2>
        <p data-testid="advanced-fatal" role="alert">{fatal}</p>
        <p>入力はメモリ上に残しています。もう一度お試しください。</p>
        <div className="gc-panel-actions"><button type="button" onClick={props.onExit}>コースへ戻る</button></div>
      </section>
    </div>;
  }

  if (loadProblem !== undefined) {
    return <div className="guided-course" data-testid="guided-course">
      <AdvancedHeader onExit={props.onExit} level={level} title="保存データを読めません" connected={connected} practice={false} />
      <section className="gc-panel">
        <p className="gc-panel-kicker">保存データ</p>
        <h2>読めない記録があります</h2>
        <p data-testid="advanced-unreadable" role="alert">{loadProblem}</p>
        <p>元のデータは消していません。読めない記録を隔離してから始めます。</p>
        <div className="gc-panel-actions">
          <button type="button" className="dojo-primary" data-testid="advanced-quarantine" disabled={pending} onClick={() => {
            setPending(true);
            void repository.quarantine().then(() => repository.load()).then((loaded) => {
              setLoadProblem(undefined);
              if (loaded.kind === "unreadable") setLoadProblem(loaded.reason);
              else setStore(loaded.store);
            }).catch((error: unknown) => setFatal(error instanceof Error ? error.message : "隔離できません")).finally(() => setPending(false));
          }}>読めない記録を隔離する</button>
          <button type="button" onClick={props.onExit}>Chord Dojo へ戻る</button>
        </div>
      </section>
    </div>;
  }

  if (store === undefined || plan === undefined) {
    return <div className="guided-course" data-testid="guided-course" aria-busy="true"><p className="gc-note" data-testid="advanced-loading">読み込み中</p></div>;
  }

  const practice = mode === "practice";
  const levelLabel = advancedLevelSpec(level).label;
  const restartDestination = advancedDemoItems(level).length > 0 ? "最初の見本" : "最初の問題";
  const restartSentence = practice
    ? "最初の教材に戻ります。正式確認の続きは保存されます。"
    : plan.kind === "question"
      ? `今回の確認（${plan.index} / ${plan.total}問目）を終了し、${restartDestination}に戻ります。これまでの合格記録は残ります。`
      : plan.kind === "block-result"
        ? `今回の確認は${plan.report.evaluated}問を終えています。${restartDestination}に戻ります。これまでの合格記録は残ります。`
        : plan.kind === "delay-wait"
          ? `今回の確認は当日分を終えています。${restartDestination}に戻ります。これまでの合格記録は残ります。`
          : plan.kind === "start"
            ? `今回の確認はまだ始まっていません。${restartDestination}に戻ります。これまでの合格記録は残ります。`
            : `このレベルは合格済みです。新しい周回を${restartDestination}から始めます。これまでの合格記録は残ります。`;
  const restartContinueLabel = !practice && plan.kind === "question" ? `${plan.index}問目から続ける` : "キャンセル";
  const restartConfirmLabel = practice ? `${levelLabel}の自由練習を最初から` : `${levelLabel}を最初から`;
  const restartDialog = restartOpen
    ? createPortal(<LevelRestartDialog
      levelLabel={levelLabel}
      sentence={restartSentence}
      practice={practice}
      continueLabel={restartContinueLabel}
      confirmLabel={restartConfirmLabel}
      busy={restartBusy}
      error={restartError}
      onCancel={cancelRestart}
      onConfirm={() => void confirmRestart()}
    />, document.body)
    : null;
  const header = {
    onExit: props.onExit,
    level,
    connected,
    practice,
    onRestart: openRestart,
    dialog: restartDialog,
  } as const;

  if (demoActive) {
    const item = demoItems[Math.min(demoIndex, demoItems.length - 1)]!;
    const last = demoIndex >= demoItems.length - 1;
    return <div className="guided-course" data-testid="guided-course" data-advanced="true" data-demo="true" data-stage="demo">
      <AdvancedHeader {...header} title="見本を見て弾く" subtitle={`${advancedLevelSpec(level).label}・${levelAbility(level)}`} progress={`見本 ${demoIndex + 1} / ${demoItems.length}`} />
      <div className="gc-card" data-testid="advanced-demo">
        <section className="gc-card-top">
          {expectedChords(item).length === 1 && item.prompt !== "ear" ? <GuideChordCard
            label={item.label}
            ariaLabel={`${item.label}を聴く`}
            playing={demoPlaying}
            onClick={() => playDemo(item)}
            testId="advanced-demo-card"
            nameTestId="advanced-demo-name"
            hint="カードを押すと音をもう一度聴けます"
            hintTestId="advanced-demo-card-hint"
          /> : <>
            <p className="gc-chord" data-testid="advanced-demo-name">{item.label}</p>
            <ol className="ac-cards">
              {expectedChords(item).map((chord, index) => <li key={`${chord.label}-${index}`} className="ac-card" data-current={demoPlaying && index === demoChordIndex ? "true" : undefined}><b>{chord.label}</b><span>コード</span></li>)}
            </ol>
          </>}
          {demoPhase === "cadence" ? <p className="gc-note" data-testid="advanced-demo-cadence">基準のカデンツ</p> : null}
          {item.detail === undefined ? null : <p className="ac-note">{item.detail}</p>}
          <p className="gc-instruction">見本の押さえ方と響きを確かめましょう</p>
        </section>
        <div className="gc-card-mid gc-keyboard">
          <div className="gc-keyboard-head"><b>鍵盤</b><span>見本の音名</span></div>
          <CourseKeyboard guideNotes={(demoPlaying ? expectedChords(item)[demoChordIndex] : expectedChords(item)[0])?.referenceNotes ?? []} showNames stage />
        </div>
        <div className="gc-card-bottom">
          <p className="gc-note" data-testid="advanced-demo-counts">
            {advancedLevelSpec(level).label}は公式の確認で{advancedLevelSpec(level).sameDay.questions}問、別日に{advancedLevelSpec(level).delay.questions}問です。途中で戻っても続きから再開できます。
          </p>
          <div className="gc-actions">
            {last ? <>
              <button type="button" className="dojo-primary" data-testid="advanced-demo-start" onClick={() => { stopDemo(); if (demoOnly) { setDemoOnly(false); props.onExit(); } else setDemoSeen(new Set([...demoSeen, `${String(level)}:${mode}`])); }}>{demoOnly ? "コースへ戻る" : "確認を始める"}</button>
              <button type="button" data-testid="advanced-demo-again" onClick={() => { setDemoIndex(0); playDemo(demoItems[0]); }}>もう1周</button>
            </> : <>
              <button type="button" className="dojo-primary" data-testid="advanced-demo-next" onClick={() => { const next = demoIndex + 1; setDemoIndex(next); playDemo(demoItems[next]); }}>次の見本</button>
              <button type="button" data-testid="advanced-demo-skip" onClick={() => { stopDemo(); if (demoOnly) { setDemoOnly(false); props.onExit(); } else setDemoSeen(new Set([...demoSeen, `${String(level)}:${mode}`])); }}>{demoOnly ? "コースへ戻る" : "確認へ進む"}</button>
            </>}
          </div>
        </div>
      </div>
    </div>;
  }

  if (question !== undefined) {
    const q = question;
    // P23-51 (rule 2): the official confirmation is shown in rounds of five, with a pause after each round.
    const official = !practice && wrongPractice === undefined;
    const trialsById = new Map(store.trials.filter((trial) => trial.attemptId === q.attempt.attemptId).map((trial) => [trial.itemId, trial]));
    const results = q.attempt.itemIds.map((id) => {
      const trial = trialsById.get(id);
      return trial === undefined ? undefined : trial.result === "correct";
    });
    const rounds = official ? roundState(q.index, q.total, results) : undefined;
    const breakKey = `${q.attempt.attemptId}:${q.index}`;
    // P23-54: a Lv4 connection or a Lv7 ear question is kind "progression" too; only the capstone names its part by kind.
    const title = wrongPractice !== undefined ? "間違えた・迷った問題の練習" : q.level === "capstone" ? (LEVEL_TITLE[q.item.kind] ?? levelAbility(q.level)) : levelAbility(q.level);
    const headerProps = {
      ...header,
      title,
      subtitle: wrongPractice === undefined ? `${levelAbility(q.level)}${q.block === "delay" ? "・日をあけた復習" : ""}` : "点数には反映されません",
      progress: wrongPractice === undefined ? `${q.index} / ${q.total}` : `間違えた・迷った問題の練習 ${q.index} / ${q.total}`,
      round: rounds === undefined ? undefined : <RoundProgress {...rounds} />,
    };
    /** P24-04: the compare panel for the first wrong answer, built the way Lv1–3 builds it. */
    function roundCompareOf(trial: AdvancedTrial | undefined, diagnosisKind: string): RoundCompare | undefined {
      if (trial === undefined || trial.selfConfirmed || trial.result === "correct") return undefined;
      if (diagnosisKind === "cap-sight-stop" || diagnosisKind === "cap-sight-accuracy") return undefined;
      const item = advancedItemById(trial.itemId);
      if (item === undefined) return undefined;
      const chords = expectedChords(item);
      const play = (chord: AdvancedChord) => (notes: readonly number[]) => {
        void playbackController.play({ kind: "practice", id: `p24-04:compare:${chord.label}` },
          { type: "chord", chord: symbol(chord.root, chord.quality), sound, explicitMidiNotes: [...notes] }).catch(() => undefined);
      };
      if (chords.length <= 1) {
        const chord = chords[0];
        if (chord === undefined || trial.sealedNotes.length === 0) return undefined;
        return { answerLabel: chord.label, answerNotes: [...chord.referenceNotes], playedNotes: [...trial.sealedNotes], onPlay: play(chord) };
      }
      const bad = trial.steps.findIndex((step) => !step.ok);
      const chord = bad < 0 ? undefined : chords[bad];
      const notes = bad < 0 ? undefined : trial.steps[bad]?.notes;
      if (chord === undefined || notes === undefined || notes.length === 0) return undefined;
      return {
        answerLabel: `${chord.label}（${bad + 1}枚目）`,
        answerNotes: [...chord.referenceNotes],
        playedNotes: [...notes],
        onPlay: play(chord),
      };
    }
    const next = () => {
      if (official && trialsById.has(q.item.id) && breakAfter(q.index, q.total)) {
        setRoundBreak(breakKey);
        return;
      }
      setFrozen(undefined);
    };
    if (official && roundBreak === breakKey) {
      const score = roundScore(q.index, q.total, results);
      const from = (score.round - 1) * ROUND_SIZE;
      const anyWrong = results.slice(from, q.index).some((value) => value === false);
      // P24-04: the words come from the first wrong answer of this round; the old one-liner stays the fallback.
      const roundTrials = q.attempt.itemIds.slice(from, q.index + 1)
        .map((id) => trialsById.get(id))
        .filter((trial): trial is AdvancedTrial => trial !== undefined);
      const diagnosis = diagnoseRound(roundTrials, q.level);
      const wrongTrial = roundTrials.find((trial) => trial.result !== "correct");
      const tip = advancedTipFor(diagnosis, q.level, score.round, wrongTrial?.itemId)
        ?? tipFor({ level: q.level, ...(anyWrong ? { wrong: { prompt: "name" as const } } : {}) });
      const compare = roundCompareOf(wrongTrial, diagnosis.kind);
      return <div className="guided-course" data-testid="guided-course" data-advanced="true" data-midi={connected ? "on" : "off"} data-stage="break">
        <AdvancedHeader {...headerProps} />
        <RoundBreak
          score={score}
          nextCount={Math.min(ROUND_SIZE, q.total - q.index)}
          tip={tip}
          compare={compare}
          onNext={() => { setRoundBreak(undefined); setFrozen(undefined); }}
          onStop={props.onExit}
        />
      </div>;
    }
    return <div className="guided-course" data-testid="guided-course" data-advanced="true" data-midi={connected ? "on" : "off"} data-stage={q.item.kind === "capstone-sight" ? "sight" : "question"}>
      <AdvancedHeader {...headerProps} onPractice={practice ? undefined : goPractice} onReturnOfficial={practice && props.basicsPassed ? returnToOfficial : undefined} />
      {q.item.kind === "capstone-sight"
        ? <SightQuestion key={`${q.attempt.attemptId}:${q.item.id}`} question={q} sound={sound} pending={pending} connected={connected} paused={restartOpen} playbackGapMs={props.playbackGapMs} onRecord={onRecord} onInvalid={onInvalid} onNext={next} />
        : <AdvancedQuestion key={`${q.attempt.attemptId}:${q.item.id}`} question={q} settleMs={props.settleMs} connected={connected} sound={sound} pending={pending} paused={restartOpen} hideAnswers={wrongPractice !== undefined} playbackGapMs={props.playbackGapMs} onRecord={onRecord} onInvalid={onInvalid} onNext={next} />}
    </div>;
  }

  if (plan.kind === "practice-result") {
    const wrongPracticeMode = wrongPractice !== undefined;
    const remainingWrong = wrongPracticeMode ? wrongAdvancedItemIdsFor(store, plan.attemptId) : [];
    return <div className="guided-course" data-testid="guided-course" data-advanced="true">
      <AdvancedHeader {...header} title={wrongPracticeMode ? "間違えた・迷った問題の練習が終わりました" : `${advancedLevelSpec(plan.level).label} 自由練習`} subtitle={wrongPracticeMode ? "点数には反映されません" : "練習の結果は進級に数えません"} />
      <section className="gc-panel gc-result" data-testid="advanced-practice-result" data-ok={plan.correct === plan.total}>
        <p className="gc-panel-kicker">{wrongPracticeMode ? "間違えた・迷った問題の練習" : "自由練習"}</p>
        <h2>{wrongPracticeMode ? <>正解 <b data-testid="advanced-wrong-correct">{plan.correct}</b> / {plan.total}</> : "練習を終えました"}</h2>
        <div className="gc-result-counts"><span>正解 <b>{plan.correct}/{plan.total}</b></span></div>
        <p data-testid="advanced-practice-summary">{wrongPracticeMode
          ? plan.correct === plan.total ? `${plan.total}問すべて弾けました` : `${plan.correct}問弾けました。残り${remainingWrong.length}問です`
          : plan.correct === plan.total ? `${customPractice?.label ?? "教材"} を通せました。同じ教材をもう一度か、別の教材へ。` : "見本で確かめてから、もう一度弾いてみましょう。"}</p>
        <p>{wrongPracticeMode ? "この結果は正式確認の点数・昇級・再開位置に反映しません。" : "この結果は昇格や正式確認の分子に数えません。確認に戻ると、止めた位置から再開できます。"}</p>
        <div className="gc-panel-actions">
          {wrongPracticeMode
            ? <>
              <button type="button" className="dojo-primary" data-testid="advanced-wrong-back" disabled={pending} onClick={endWrongPractice}>元の結果に戻る</button>
              {remainingWrong.length > 0 ? <button type="button" data-testid="advanced-wrong-again" disabled={pending} onClick={() => startWrongPractice(wrongPractice.level, remainingWrong)}>まだ間違えた・迷った問題を練習（{remainingWrong.length}問）</button> : null}
            </>
            : <>
              <button type="button" className="dojo-primary" data-testid="advanced-practice-again" disabled={pending} onClick={() => void begin(clearAdvancedActive(store, "free"), { level: plan.level, block: "sameDay", setId: customPractice === undefined ? (level === 8 ? (group ?? LV8_GROUPS[0]!.id) : "sameDay") : "practice", ...(level === 8 && customPractice === undefined ? { group: group ?? LV8_GROUPS[0]!.id } : {}), itemIds: customPractice?.itemIds ?? advancedSetIds(plan.level, "sameDay", group) }, true)}>もう一度練習</button>
              {props.basicsPassed ? <button type="button" data-testid="advanced-return-official" disabled={pending} onClick={() => void save(clearAdvancedActive(store, "free")).then(() => returnToOfficial())}>確認に戻る</button> : null}
              <button type="button" data-testid="advanced-back" onClick={props.onExit}>Chord Dojo へ戻る</button>
            </>}
        </div>
      </section>
    </div>;
  }

  if (plan.kind === "block-result") {
    const evaluation = plan.evaluation;
    const report = plan.report;
    const passLabel = report.ok;
    const formal = evaluation.passed && !practice;
    const eligible = plan.block === "delay" || (evaluation.dates.sameDayCompletedAt !== undefined && delayEligibility(evaluation.dates.sameDayCompletedAt, now.toISOString()).eligible);
    const nextDelay = evaluation.dates.sameDayCompletedAt === undefined ? undefined : localTimeText(nextDelayAvailableAt(evaluation.dates.sameDayCompletedAt));
    const groupLabel = plan.group === undefined ? undefined : LV8_GROUPS.find((entry) => entry.id === plan.group)?.label;
    const attempt = store.attempts.find((entry) => entry.attemptId === plan.attemptId);
    const officialWeak = practice ? { ids: [] as readonly string[], wrong: 0, slow: 0 } : weakAdvancedItemIdsFor(store, plan.attemptId);
    const passLine = report.parts.reduce((sum, part) => sum + part.pass, 0);
    const bars: ResultBar[] = report.parts.length > 1
      ? report.parts.map((part) => ({
        id: part.id,
        label: part.label,
        correct: part.correct,
        total: part.required,
        low: part.correct < part.required || !part.ok,
      }))
      : [];
    const blockName = plan.block === "sameDay" ? "今日の確認" : "日をあけた復習";
    const nextIdx = ADVANCED_LEVELS.findIndex((spec) => spec.level === level);
    const candidateNext: StationId | undefined = nextIdx >= 0 && nextIdx + 1 < ADVANCED_LEVELS.length ? ADVANCED_LEVELS[nextIdx + 1]?.level : undefined;
    const nextAvailable = candidateNext !== undefined && (props.frontier === undefined || props.frontier.states.get(candidateNext) !== "locked");
    const nextAfterDelay = firstUnpassedAdvancedLevel(store);

    let primary: ResultAction | undefined;
    let nextBoxTitle = "コースに戻る";
    let nextBoxSub = "地図から次を選べます";

    if (!passLabel && (practice || plan.block === "sameDay" || eligible)) {
      nextBoxTitle = practice ? "もう一度練習する" : "もう一度確認する";
      nextBoxSub = `${report.required}問（合格の線 ${passLine}問）`;
      primary = {
        label: practice ? "もう一度練習" : "もう一度確認する",
        testId: "advanced-retry",
        onClick: () => void begin(clearAdvancedActive(store, practice ? "free" : "official"), {
          level: plan.level,
          block: plan.block,
          setId: plan.setId,
          ...(plan.group === undefined ? {} : { group: plan.group }),
          itemIds: attempt?.itemIds ?? advancedSetIds(plan.level, plan.block, plan.group),
        }, practice),
      };
    } else if (passLabel && plan.block === "sameDay" && !practice && eligible) {
      const delayTotal = advancedSetIds(plan.level, "delay", plan.group).length;
      nextBoxTitle = "別の日にもう一度";
      nextBoxSub = `${delayTotal}問、${Math.max(1, Math.ceil(delayTotal * 0.3))}分ほど`;
      primary = {
        label: "別の日の確認を始める",
        testId: "advanced-start-delay",
        warn: true,
        onClick: () => void begin(clearAdvancedActive(store), {
          level: plan.level,
          block: "delay",
          setId: plan.setId,
          ...(plan.group === undefined ? {} : { group: plan.group }),
          itemIds: advancedSetIds(plan.level, "delay", plan.group),
        }, false),
      };
    } else if (passLabel && plan.block === "sameDay" && !practice && nextAvailable && candidateNext !== undefined) {
      nextBoxTitle = `${stationLabel(candidateNext)} を始める`;
      nextBoxSub = "待つ間に次の段へ進めます";
      primary = {
        label: `${stationLabel(candidateNext)} を始める`,
        testId: "advanced-next-level",
        onClick: () => void save(clearAdvancedActive(store)).then(() => {
          if (props.onOpenStation !== undefined) props.onOpenStation(candidateNext, "official", "sameDay");
          else { setLevel(candidateNext as AdvancedLevelAlias); setMode("official"); setFrozen(undefined); }
        }),
      };
    } else if (passLabel && plan.block === "delay" && !practice) {
      nextBoxTitle = evaluation.passed && nextAfterDelay !== undefined ? `${stationLabel(nextAfterDelay)} を始める` : "続ける";
      nextBoxSub = evaluation.passed ? "次の段の確認へ進めます" : "残りの確認へ進めます";
      primary = {
        label: evaluation.passed ? "次のレベルへ" : "続ける",
        testId: "advanced-next-level",
        onClick: () => void save(clearAdvancedActive(store)).then(() => {
          if (nextAfterDelay !== undefined) {
            if (props.onOpenStation !== undefined) props.onOpenStation(nextAfterDelay, "official", "sameDay");
            else { setLevel(nextAfterDelay); setMode("official"); setFrozen(undefined); }
          } else {
            props.onExit();
          }
        }),
      };
    } else if (passLabel && plan.block === "sameDay" && !practice) {
      nextBoxTitle = "続ける";
      nextBoxSub = nextDelay !== undefined ? `${nextDelay} 以降に別日確認` : "翌日以降に別日確認";
      primary = {
        label: "続ける",
        testId: "advanced-continue",
        onClick: () => void save(clearAdvancedActive(store)).then(() => setFrozen(undefined)),
      };
    }

    const boxes: readonly [ResultBox, ResultBox, ResultBox] = [
      { tag: passLabel ? "合格" : "もう一度", tagKind: passLabel ? "done" : "wait", title: blockName, sub: `${report.correct} / ${report.required}` },
      { tag: "次はこれ", tagKind: "now", title: nextBoxTitle, sub: nextBoxSub, current: true },
      formal
        ? { tag: "修了", tagKind: "done", title: "修了", sub: `${advancedLevelSpec(level).label} を終えました` }
        : {
          tag: eligible && passLabel && plan.block === "sameDay" ? "確認できます" : "あした以降",
          tagKind: eligible && passLabel && plan.block === "sameDay" ? "wait" : "todo",
          title: "別の日にもう一度",
          sub: nextAvailable && candidateNext !== undefined
            ? `待つ間に ${stationLabel(candidateNext)} を始められます`
            : nextDelay !== undefined ? `${nextDelay} 以降` : "翌日以降に確認します",
        },
    ];

    const secondary: ResultAction | undefined = officialWeak.ids.length > 0
      ? { label: `間違えた・迷った問題を練習（${officialWeak.ids.length}問）`, testId: "advanced-wrong-practice", onClick: () => startWrongPractice(plan.level, officialWeak.ids) }
      : practice
        ? { label: "確認に戻る", testId: "advanced-return-official", onClick: () => void save(clearAdvancedActive(store, "free")).then(() => returnToOfficial()) }
        : undefined;

    const notes = <>
      {report.speed === undefined ? null : <p>{`3秒以内 ${report.speed.withinLimit}/${report.speed.correct}（${Math.round(report.speed.ratio * 100)}%・80%以上で合格）`}</p>}
      {plan.block === "delay" && evaluation.dates.reason !== undefined ? <p>{evaluation.dates.reason}</p> : null}
      {evaluation.mode === "self" ? <p>自己確認の結果です。正式合格には含みません。</p> : null}
      {report.hintAssisted > 0 ? <p>ヒントありの回答が {report.hintAssisted} 問あります。正式合格の分子には入りません。</p> : null}
      {level === 6 && evaluation.missingKeys.length > 0 ? <p>未確認のキー: {evaluation.missingKeys.map((key) => NOTE_NAMES[key]).join("・")}</p> : null}
      {evaluation.reasons.length > 0 ? <details>
        <summary>詳しい理由</summary>
        <ul>{[...new Set(evaluation.reasons)].map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </details> : null}
    </>;

    return <div className="guided-course" data-testid="guided-course" data-advanced="true" data-stage="result">
      <AdvancedHeader {...header} title={`${blockName}の結果`} subtitle={`${advancedLevelSpec(level).label} · ${levelAbility(level)}${groupLabel === undefined ? "" : ` · ${groupLabel}`}`} />
      <GuidedResultSheet
        testId="advanced-result"
        ok={passLabel}
        formal={formal}
        lead={`${blockName}${groupLabel === undefined ? "" : ` · ${groupLabel}`}`}
        total={report.required}
        correct={report.correct}
        passLine={passLine}
        bars={bars}
        slowCount={officialWeak.slow}
        wideBarLabels
        boxes={boxes}
        notes={notes}
        primary={primary}
        secondary={secondary}
        tertiary={{
          label: "今日はここまで",
          testId: "advanced-back",
          onClick: () => {
            if (!practice && store.active !== undefined) {
              void save(clearAdvancedActive(store)).then(() => props.onExit());
            } else {
              props.onExit();
            }
          },
        }}
        disabled={pending}
      />
    </div>;
  }

  if (plan.kind === "recheck") {
    return <div className="guided-course" data-testid="guided-course" data-advanced="true">
      <AdvancedHeader {...header} title="未確認のキーを確認します" subtitle="このキーだけを後日再確認します" />
      <section className="gc-panel" data-testid="advanced-recheck">
        <p className="gc-panel-kicker">Lv6 キーの再確認</p>
        <h2>未確認のキー: {plan.keys.map((key) => NOTE_NAMES[key]).join("・")}</h2>
        <p>同じキーの別の進行で確認します。正答すると12キーの証拠がそろいます。</p>
        <div className="gc-panel-actions">
          <button type="button" className="dojo-primary" data-testid="advanced-recheck-start" disabled={pending} onClick={() => void begin(clearAdvancedActive(store), { level: 6, block: "sameDay", setId: "recheck", itemIds: plan.itemIds }, false)}>再確認を始める</button>
          <button type="button" data-testid="advanced-back" onClick={props.onExit}>Chord Dojo へ戻る</button>
        </div>
      </section>
    </div>;
  }

  if (plan.kind === "delay-wait") {
    return <div className="guided-course" data-testid="guided-course" data-advanced="true">
      <AdvancedHeader {...header} title="今日の確認は終わりました" subtitle={`次の復習: ${localTimeText(plan.availableAt)} 以降`} />
      <section className="gc-panel" data-testid="advanced-delay-wait">
        <p className="gc-panel-kicker">次の復習</p>
        <h2>{localTimeText(plan.availableAt)} 以降に確認します</h2>
        <p>{plan.reason}</p>
        <p>翌日かつ 12 時間以上あけて、同じレベルの別の問題を確認します。</p>
        <p>待つあいだも、ほかのレベルを自由練習できます。</p>
        <div className="gc-panel-actions">
          <button type="button" data-testid="advanced-practice-here" disabled={pending} onClick={goPractice}>自由練習へ</button>
          <button type="button" data-testid="advanced-back" onClick={props.onExit}>Chord Dojo へ戻る</button>
        </div>
      </section>
    </div>;
  }

  if (plan.kind === "finished") {
    const allDone = officialLevel === undefined;
    return <div className="guided-course" data-testid="guided-course" data-advanced="true">
      <AdvancedHeader {...header} title={allDone ? "ガイド練習を終えました" : `${advancedLevelSpec(level).label} は合格済みです`} subtitle={allDone ? "Lv4〜8 と総合確認を終えました。" : levelAbility(level)} />
      <section className="gc-panel" data-testid="advanced-finished">
        <p className="gc-panel-kicker">{allDone ? "ガイド練習" : advancedLevelSpec(level).label}</p>
        <h2>{allDone ? "このコースの確認はここまでです" : "このレベルは合格しています"}</h2>
        {allDone ? <ul className="gc-result-counts" data-testid="advanced-abilities">
          {ADVANCED_LEVELS.map((spec) => <li key={String(spec.level)}>{spec.label} <b>{spec.ability}</b></li>)}
        </ul> : null}
        {allDone ? <p>ここから先の達成を表示するものではありません。各レベルの課題は自由練習で続けられます。</p> : <p>自由練習で同じ課題を続けられます。次のレベルの確認へ進めます。</p>}
        <LevelGroups store={store} />
        <div className="gc-panel-actions">
          {!allDone ? <button type="button" className="dojo-primary" data-testid="advanced-next-level" disabled={pending} onClick={() => void save(clearAdvancedActive(store)).then(() => {
            const next = firstUnpassedAdvancedLevel(store);
            if (next !== undefined) { setLevel(next); setMode("official"); }
          })}>次のレベルへ</button> : null}
          <button type="button" data-testid="advanced-practice-here" onClick={goPractice}>自由練習へ</button>
          <button type="button" data-testid="advanced-back" onClick={props.onExit}>Chord Dojo へ戻る</button>
        </div>
      </section>
    </div>;
  }

  if (plan.kind !== "start") return null;
  const spec = advancedLevelSpec(level);
  const official = practice
    ? undefined
    : {
      count: plan.itemIds.length,
      blockLabel: plan.block === "sameDay" ? "今日の確認" : "日をあけた復習",
      onStart: () => void begin(clearAdvancedActive(store), targetPlan(plan, level), false),
    };
  return <div className="guided-course" data-testid="guided-course" data-advanced="true">
    <AdvancedHeader {...header} title={practice ? `${spec.label} 自由練習` : `${spec.label} ${spec.ability}`} subtitle={practice ? "1つの教材を選んで、見本から自分で弾くまで練習します。" : "見本を聴いてから、公式の確認を明示操作で始めます。"} />
    <section className="gc-panel" data-testid="advanced-start-panel">
      {level === 8 ? <LevelGroups store={store} currentGroup={group} /> : null}
      <GuidedPracticePanel
        key={practiceResetKey}
        level={level}
        group={group}
        onGroupChange={(next) => setGroup(next)}
        mode={mode}
        sound={sound}
        connected={connected}
        paused={restartOpen}
        playbackGapMs={props.playbackGapMs}
        official={official}
        onPractice={startCustomPractice}
        onReturnOfficial={practice && props.basicsPassed ? returnToOfficial : undefined}
        onGoPractice={practice ? undefined : goPractice}
        basicsPassed={props.basicsPassed}
      />
      <div className="gc-panel-actions">
        <button type="button" data-testid="advanced-back" onClick={props.onExit}>Chord Dojo へ戻る</button>
      </div>
    </section>
  </div>;
}

function targetPlan(plan: Extract<AdvancedPlan, { kind: "start" }>, level: AdvancedLevelAlias): StartTarget {
  return {
    level,
    block: plan.block,
    setId: plan.setId,
    ...(plan.group === undefined ? {} : { group: plan.group }),
    itemIds: plan.itemIds,
  };
}
