import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { usePreviewSound } from "../../components/PreviewSoundProvider";
import { DojoBackButton } from "./DojoBackButton";
import { CourseKeyboard } from "./CourseKeyboard";
import { GuideChordCard } from "./GuideChordCard";
import { useGuidedAutoAdvance } from "./useGuidedAutoAdvance";
import "./guidedCourse.css";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import { liveMidiService } from "../../liveMidi/liveMidiService";
import { createLiveNoteState, reduceLiveNoteState, soundingNotes } from "../../domain/liveMidi";
import { playbackController } from "../../audio/playbackController";
import { symbol, type Quality } from "../../domain/chordDojo/recipes";
import { itemLabel, itemRootLabel, type CourseItem, type CourseLevel } from "../../domain/chordDojo/guidedCourse/bank";
import { courseNoteNames } from "./courseNoteNames";
import { resultMarks, wrongLines } from "./guidedMarks";
import { EarDisc, MarksLegend } from "./GuidedRound";
import "./guidedRound.css";
import { earChoiceCorrect, judgeCourseAnswer } from "../../domain/chordDojo/guidedCourse/answer";
import { CourseCapture, courseAttemptOutcome, pollGapInvalid, type CourseSealed } from "../../domain/chordDojo/guidedCourse/capture";

/**
 * P23-47-fix-2: the basic free-practice / "wrong answers only" runner. It never writes the course
 * store, so scores, passes and the interrupted official position are untouched. The card and capture
 * follow the official question, with "もう一度弾く" for a wrong or incomplete answer.
 */
export interface BasicPracticeResult {
  readonly id: string;
  readonly verdict: "correct" | "wrong" | "incomplete";
}

export interface BasicPracticeSummary {
  readonly total: number;
  readonly correct: number;
  readonly wrongIds: readonly string[];
  readonly unansweredIds: readonly string[];
}

export interface GuidedBasicPracticeProps {
  readonly level: CourseLevel;
  readonly items: readonly CourseItem[];
  readonly mode: "free" | "wrong";
  readonly connected: boolean;
  readonly settleMs: number;
  readonly onBack: () => void;
  readonly onExit: () => void;
  readonly onRestart?: (() => void) | undefined;
  readonly dialog?: ReactNode;
  readonly onSummary?: (summary: BasicPracticeSummary) => void;
}

interface PracticeFeedback {
  readonly ok: boolean;
  readonly result: "correct" | "wrong" | "incomplete" | "invalid";
  readonly title: string;
  readonly detail?: string;
  readonly midi: boolean;
  /** P23-51: the notes of a MIDI answer (the keyboard's marks) and mock ⑤'s second line. */
  readonly played?: readonly number[];
  readonly why?: string;
}

const AUTO_ADVANCE_MS = 1200;

const noteNames = courseNoteNames;

export function GuidedBasicPractice(props: GuidedBasicPracticeProps) {
  const { sound } = usePreviewSound();
  const [items, setItems] = useState<readonly CourseItem[]>(props.items);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<PracticeFeedback>();
  const pending = false;
  const [results, setResults] = useState<Map<string, "correct" | "wrong" | "incomplete">>(new Map());
  const [finished, setFinished] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [earReady, setEarReady] = useState(false);
  const [earPlaying, setEarPlaying] = useState(false);
  const [choice, setChoice] = useState<string>();
  const [heldCount, setHeldCount] = useState(0);
  const [cardPlaying, setCardPlaying] = useState(false);
  const cardToken = useRef(0);
  const [autoAdvance, setAutoAdvance] = useGuidedAutoAdvance();
  const [autoEligible, setAutoEligible] = useState(false);
  const [autoDue, setAutoDue] = useState(false);
  const [autoCancelled, setAutoCancelled] = useState(false);
  const autoAdvanceRef = useRef(autoAdvance);
  autoAdvanceRef.current = autoAdvance;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const feedbackRef = useRef<PracticeFeedback>();
  feedbackRef.current = feedback;
  const advancing = useRef(false);
  const capture = useRef<CourseCapture>();
  const rawNotes = useRef(createLiveNoteState());
  const releaseGate = useRef(true);
  const lastPoll = useRef(0);
  const lastMonotonic = useRef(0);
  const lastWall = useRef(0);
  const questionStartIso = useRef(new Date().toISOString());
  const nextRef = useRef<HTMLButtonElement>(null);
  const item = items[index];
  const practice = props.mode === "wrong";
  const progressLabel = practice ? `間違えた・迷った問題の練習 ${Math.min(index + 1, items.length)} / ${items.length}` : `練習 ${Math.min(index + 1, items.length)} / ${items.length}`;

  const record = useCallback((target: CourseItem, verdict: "correct" | "wrong" | "incomplete") => {
    setResults((previous) => {
      const next = new Map(previous);
      next.set(target.id, verdict);
      return next;
    });
  }, []);

  const playCard = useCallback(async (target: CourseItem) => {
    const token = ++cardToken.current;
    playbackController.stop();
    setCardPlaying(true);
    try {
      await playbackController.play(
        { kind: "practice", id: "guided-practice:preview" },
        { type: "chord", chord: symbol(target.root, target.quality as Quality), sound, explicitMidiNotes: target.referenceNotes },
        { onEnded() { if (token === cardToken.current) setCardPlaying(false); } },
      );
    } catch {
      if (token === cardToken.current) setCardPlaying(false);
    }
  }, [sound]);

  useEffect(() => () => { cardToken.current += 1; playbackController.stop(); }, []);

  /** Start the current item: arm the capture, or play an ear prompt before arming. */
  const startItem = useCallback((target: CourseItem) => {
    const at = performance.now();
    questionStartIso.current = new Date().toISOString();
    capture.current = new CourseCapture({
      requiredCount: Math.max(1, target.requiredPitchClasses.length),
      settleMs: props.settleMs,
      waitForInput: target.level <= 2,
    });
    capture.current.arm(at, [...new Set(soundingNotes(defaultLiveMidiStore.getState().notes))]);
    releaseGate.current = soundingNotes(defaultLiveMidiStore.getState().notes).length === 0;
    setEarReady(target.prompt !== "ear");
  }, [props.settleMs]);

  const playPrompt = useCallback(async (target: CourseItem) => {
    setEarPlaying(true);
    setEarReady(false);
    try {
      await playbackController.play(
        { kind: "practice", id: "guided-practice:prompt" },
        { type: "chord", chord: symbol(target.root, target.quality as Quality), sound, explicitMidiNotes: target.referenceNotes },
        {
          onEnded(reason) {
            setEarPlaying(false);
            if (reason === "completed") {
              const at = performance.now();
              setEarReady(true);
              capture.current?.arm(at, [...new Set(soundingNotes(defaultLiveMidiStore.getState().notes))]);
              releaseGate.current = soundingNotes(defaultLiveMidiStore.getState().notes).length === 0;
            }
          },
        },
      );
    } catch {
      setEarPlaying(false);
      setEarReady(true);
    }
  }, [sound]);

  // New item: clear the answer state and arm.
  useEffect(() => {
    if (finished) return;
    setFeedback(undefined);
    setHintUsed(false);
    setChoice(undefined);
    setAutoEligible(false);
    setAutoDue(false);
    setAutoCancelled(false);
    const target = items[index];
    if (target === undefined) return;
    startItem(target);
    if (target.prompt === "ear") void playPrompt(target);
  }, [finished, index, items, playPrompt, startItem]);

  const verdictOf = useCallback((target: CourseItem, sealed: CourseSealed): { verdict: "correct" | "wrong" | "incomplete"; detail?: string; midi: true } => {
    const outcome = courseAttemptOutcome(sealed, Math.max(1, target.requiredPitchClasses.length));
    if (outcome === "no-input") return { verdict: "wrong", detail: "MIDI入力を確認できませんでした", midi: true };
    if (sealed.notes.length === 0) return { verdict: "incomplete", detail: "構成音がそろっていません", midi: true };
    const judgement = judgeCourseAnswer(target, target.bass === "root" ? "ear" : "name", sealed.notes);
    const choiceOk = target.ear?.choiceDisplayed === true ? earChoiceCorrect(target, choice) : true;
    const verdict = judgement.ok && choiceOk ? "correct" : outcome === "incomplete" ? "incomplete" : "wrong";
    return { verdict, ...(verdict === "correct" ? {} : { detail: choiceOk ? judgement.reason : "選択が違います" }), midi: true };
  }, [choice]);

  const finishSealed = useCallback((sealed: CourseSealed) => {
    const target = item;
    if (target === undefined || feedbackRef.current !== undefined) return;
    const judged = verdictOf(target, sealed);
    // P23-51 (mock ⑤): the swap sentence and the chord's tones, as on the course's question.
    const lines = judged.verdict === "correct" ? undefined : wrongLines(itemLabel(target), sealed.notes, target.referenceNotes, {
      required: target.requiredPitchClasses,
          allowed: target.allowedPitchClasses,
      ...(target.prompt !== "ear" && target.bass === "root" ? { bass: target.root } : {}),
    });
    const detail = hintUsed && judged.verdict === "correct" ? "お手本を使用しました（ヒントあり）" : lines?.kind === "swap" && judged.detail !== "選択が違います" ? lines.line : judged.detail;
    setFeedback({ ok: judged.verdict === "correct", result: judged.verdict, title: judged.verdict === "correct" ? "正解" : "不正解", ...(detail === undefined ? {} : { detail }), midi: true, played: sealed.notes, ...(lines === undefined ? {} : { why: lines.sub }) });
    setAutoEligible(judged.verdict === "correct" && autoAdvanceRef.current);
    setAutoDue(false);
    setAutoCancelled(false);
    record(target, judged.verdict);
    capture.current = undefined;
  }, [hintUsed, item, record, verdictOf]);

  const selfConfirm = useCallback((ok: boolean) => {
    const target = item;
    if (target === undefined) return;
    setFeedback({ ok, result: ok ? "correct" : "wrong", title: ok ? "弾けた（自己確認）" : "まだ難しい", midi: false });
    setAutoEligible(false);
    record(target, ok ? "correct" : "wrong");
  }, [item, record]);

  const retry = useCallback(() => {
    const target = item;
    if (target === undefined) return;
    setFeedback(undefined);
    setAutoEligible(false);
    setAutoDue(false);
    setAutoCancelled(false);
    startItem(target);
    if (target.prompt === "ear") void playPrompt(target);
  }, [item, playPrompt, startItem]);

  const advance = useCallback(() => {
    if (advancing.current || pendingRef.current) return;
    const current = feedbackRef.current;
    if (current === undefined) return;
    advancing.current = true;
    setFeedback(undefined);
    setAutoEligible(false);
    setAutoDue(false);
    setAutoCancelled(false);
    if (index >= items.length - 1) {
      setFinished(true);
    } else {
      setIndex((value) => value + 1);
    }
    window.setTimeout(() => { advancing.current = false; }, 60);
  }, [index, items.length]);

  const cancelAuto = useCallback(() => {
    setAutoEligible(false);
    setAutoDue(false);
    setAutoCancelled(true);
    nextRef.current?.focus({ preventScroll: true });
  }, []);

  const restartRemaining = useCallback((remaining: readonly string[]) => {
    const next = props.items.filter((entry) => remaining.includes(entry.id));
    if (next.length === 0) return;
    setItems(next);
    setResults(new Map());
    setFinished(false);
    setIndex(0);
    setFeedback(undefined);
    setAutoEligible(false);
    setAutoDue(false);
    setAutoCancelled(false);
  }, [props.items]);

  // MIDI capture (same boundary/settle/speed rules as the official question).
  useEffect(() => {
    if (finished || item === undefined) return;
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
  }, [finished, item, pending]);

  useEffect(() => {
    if (finished || item === undefined || capture.current === undefined || feedback !== undefined) return;
    lastPoll.current = 0;
    lastMonotonic.current = performance.now();
    lastWall.current = Date.now();
    const timer = window.setInterval(() => {
      const monotonic = performance.now();
      const wall = Date.now();
      const monoDelta = monotonic - lastMonotonic.current;
      const wallDelta = wall - lastWall.current;
      lastMonotonic.current = monotonic;
      lastWall.current = wall;
      if (lastPoll.current !== 0 && pollGapInvalid(monotonic - lastPoll.current)) return;
      if (lastPoll.current !== 0 && (monoDelta < 0 || Math.abs(monoDelta - wallDelta) > 100)) return;
      lastPoll.current = monotonic;
      const sealed = capture.current?.advance(monotonic);
      if (sealed !== undefined) finishSealed(sealed);
    }, 10);
    return () => window.clearInterval(timer);
  }, [feedback, finishSealed, finished, item]);

  useEffect(() => {
    if (finished || item === undefined || feedback !== undefined) return;
    const onVisibility = () => {
      if (document.visibilityState !== "visible" && capture.current !== undefined) {
        capture.current.invalidate("hidden");
        capture.current = undefined;
        setFeedback({ ok: false, result: "invalid", title: "この回答は記録していません", detail: "もう一度弾いてください", midi: false });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [feedback, finished, item]);

  useEffect(() => {
    if (!autoAdvance || !autoEligible || autoCancelled) return;
    if (feedback === undefined || feedback.result !== "correct" || !feedback.midi || pending) return;
    const timer = window.setTimeout(() => setAutoDue(true), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, autoEligible, autoCancelled, feedback, pending]);

  useEffect(() => {
    if (!autoAdvance || !autoDue || autoCancelled || !props.connected) return;
    if (pending || heldCount > 0) return;
    advance();
  }, [advance, autoAdvance, autoDue, autoCancelled, heldCount, pending, props.connected]);

  useEffect(() => { if (!props.connected) { setAutoEligible(false); setAutoDue(false); } }, [props.connected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (pendingRef.current || feedbackRef.current === undefined) return;
      if (document.querySelector("[role=dialog]")) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input,select,textarea,button,a,[contenteditable='true']")) return;
      event.preventDefault();
      advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance]);

  if (finished) {
    const correct = items.filter((entry) => results.get(entry.id) === "correct").length;
    const wrongIds = items.filter((entry) => results.get(entry.id) !== "correct" && results.get(entry.id) !== undefined).map((entry) => entry.id);
    const unansweredIds = items.filter((entry) => results.get(entry.id) === undefined).map((entry) => entry.id);
    const wrong = wrongIds.length;
    const all = correct === items.length;
    return <div className="guided-course" data-testid="guided-course" data-practice={props.mode}>
      <header className="gc-head">
        <div className="gc-head-row">
          <DojoBackButton label="コース" onBack={props.onExit} />
          <div className="gc-head-main">
            <p className="gc-kicker">ガイド練習 · <span>Lv{props.level}</span></p>
            <h1>{practice ? "間違えた・迷った問題の練習が終わりました" : "練習が終わりました"}</h1>
            {practice ? <p className="gc-sub">点数には反映されません</p> : null}
          </div>
        </div>
      </header>
      <section className="gc-panel gc-practice-summary" data-testid="course-practice-summary">
        <p className="gc-panel-kicker">{practice ? "間違えた・迷った問題の練習" : "自由練習"}</p>
        <h2>正解 <b data-testid="summary-correct">{correct}</b> / {items.length}</h2>
        {practice ? <p data-testid="summary-line">{all ? `${items.length}問すべて弾けました` : `${correct}問弾けました。残り${wrong}問です`}</p> : null}
        {unansweredIds.length > 0 ? <p data-testid="summary-unanswered">未回答 {unansweredIds.length}問</p> : null}
        <div className="gc-panel-actions">
          {practice
            ? <>
              <button type="button" className="dojo-primary" data-testid="course-practice-back" onClick={props.onBack}>元の結果に戻る</button>
              {wrong > 0 ? <button type="button" data-testid="course-practice-again" onClick={() => restartRemaining(wrongIds)}>まだ間違えた・迷った問題を練習（{wrong}問）</button> : null}
            </>
            : <>
              <button type="button" className="dojo-primary" data-testid="course-practice-restart" onClick={() => { setItems(props.items); setResults(new Map()); setFinished(false); setIndex(0); }}>もう一度練習</button>
              <button type="button" data-testid="course-practice-back" onClick={props.onBack}>戻る</button>
            </>}
        </div>
      </section>
    </div>;
  }

  if (item === undefined) {
    return <div className="guided-course" data-testid="guided-course" aria-busy="true"><p className="gc-note">準備中</p></div>;
  }

  const answered = feedback !== undefined && feedback.result !== "invalid";
  const correct = feedback?.result === "correct";
  const exampleShown = answered;
  const marks = answered && !correct && feedback?.midi === true && feedback.played !== undefined && feedback.played.length > 0
    ? resultMarks(feedback.played, item.referenceNotes, item.requiredPitchClasses, item.allowedPitchClasses)
    : undefined;
  const canRetry = answered && feedback?.result !== "correct";
  const last = index >= items.length - 1;
  const nextWord = last ? "練習結果" : "次の問題";
  const autoWaiting = autoAdvance && autoEligible && !autoCancelled && correct && feedback?.midi === true;
  const guide = autoWaiting
    ? autoDue || heldCount > 0 ? `鍵盤を離すと${nextWord}へ` : `まもなく${nextWord}へ`
    : autoCancelled && correct ? "この問題の自動進行を止めました" : undefined;
  const showChoices = item.ear?.choiceDisplayed === true;
  const status = feedback?.title ?? (item.prompt === "ear"
    ? earPlaying ? "再生中" : !earReady ? "聴いてください" : showChoices && choice === undefined ? "メジャーかマイナーを選んでから弾いてください" : "弾いてください"
    : "演奏を待っています");

  return <div className="guided-course" data-testid="guided-course" data-practice={props.mode} data-stage="question">
    <header className="gc-head">
      <div className="gc-head-row">
        <DojoBackButton label="コース" onBack={props.onBack} />
        <div className="gc-head-main">
          <p className="gc-kicker">ガイド練習 · <span data-testid="course-level">Lv{props.level}</span></p>
          <h1>{practice ? "間違えた・迷った問題の練習" : "自由練習"}</h1>
          <p className="gc-sub">{practice ? "点数には反映されません" : "聴いて確かめましょう・記録しません"}</p>
        </div>
      </div>
      <div className="gc-meta">
        <span data-testid="course-progress">{progressLabel}</span>
        {props.onRestart === undefined ? null : <button type="button" className="gc-restart" data-testid="course-restart" onClick={props.onRestart}><RotateCcw aria-hidden="true" size={16} />このレベルを最初から</button>}
      </div>
      {props.dialog}
    </header>
    <div className="gc-card" data-testid={practice ? "course-wrong-practice" : "course-practice"}>
      <section className="gc-card-top">
        {item.prompt === "name" ? <GuideChordCard
          label={itemLabel(item)}
          ariaLabel={`${itemLabel(item)}を聴く`}
          playing={cardPlaying}
          onClick={() => void playCard(item)}
          testId="course-practice-card"
          nameTestId="course-practice-name"
          hint={feedback === undefined ? "カードを押すと音をもう一度聴けます" : "カードを押すと正解の一例を聴けます"}
          hintTestId="course-practice-card-hint"
        /> : <EarDisc root={itemRootLabel(item)} playing={earPlaying} disabled={pending || earPlaying || feedback !== undefined} onPlay={() => { setHintUsed(true); void playPrompt(item); }} testId="course-practice-name" />}
        <p className="gc-instruction">{answered ? (correct ? "鍵盤で正解の一例を確認できます" : "鍵盤で見本を確認できます") : "このコードを弾いてください"}</p>
        {showChoices ? <div className="gc-choices" data-testid="course-choices">
          {item.ear!.choices.map((entry) => <button key={entry} type="button" aria-pressed={choice === entry} disabled={pending || feedback !== undefined} onClick={() => setChoice(entry)}>{entry === "maj" ? "メジャー" : "マイナー"}</button>)}
        </div> : null}
        <div className="gc-feedback" data-testid="course-feedback" role="status" aria-live="polite">
          <span data-testid="course-feedback-text" data-ok={feedback?.ok} data-result={feedback?.result}>{autoWaiting ? "✓ 正解" : status}</span>
          {feedback?.detail === undefined ? null : <span className="gc-feedback-detail" data-testid="course-feedback-detail">{feedback.detail}</span>}
        </div>
        {answered && !correct && feedback?.why !== undefined ? <p className="gc-why" data-testid="course-why">{feedback.why}</p> : null}
        {guide === undefined ? null : <p className="gc-answer-guide" data-testid="course-answer-guide">
          <span>{guide}</span>
          {autoWaiting ? <button type="button" className="gc-view-answer" data-testid="course-view-answer" onClick={cancelAuto}>この答えを見返す</button> : null}
        </p>}
      </section>
      <div className="gc-card-mid gc-keyboard">
        {marks !== undefined ? <MarksLegend miss={[...marks.values()].includes("miss")} /> : <div className="gc-keyboard-head"><b>鍵盤</b><span>{exampleShown ? "正解の一例" : "押している音"}</span></div>}
        <CourseKeyboard guideNotes={exampleShown ? item.referenceNotes : []} showNames={exampleShown} stage marks={marks} />
        {exampleShown ? <p className="gc-example-notes" data-testid="course-example-notes">{noteNames(item.referenceNotes)}</p> : null}
      </div>
      <div className="gc-card-bottom">
        {exampleShown ? <div className="gc-review">
          <p className="gc-review-note">{correct ? "正解の一例" : "弾き方の例"}: {noteNames(item.referenceNotes)}。転回・別の配置でも合格です。</p>
        </div> : null}
        {!props.connected && feedback === undefined ? <div className="gc-choices gc-self-choices" data-testid="course-self-choices">
          <button type="button" data-testid="course-practice-ok" disabled={pending} onClick={() => selfConfirm(true)}>弾けた</button>
          <button type="button" data-testid="course-practice-miss" disabled={pending} onClick={() => selfConfirm(false)}>まだ難しい</button>
        </div> : null}
        {feedback === undefined ? <div className="gc-give-up-row">
          <button type="button" className="gc-give-up" disabled={pending || earPlaying} onClick={() => selfConfirm(false)}>まだ難しい</button>
        </div> : null}
        <div className="gc-actions">
          {canRetry ? <button type="button" data-testid="course-practice-retry" disabled={pending} onClick={retry}>もう一度弾く</button> : null}
          {feedback === undefined
            ? <button type="button" className="gc-next-idle" data-testid="course-next" disabled>次へ</button>
            : <button type="button" ref={nextRef} className="dojo-primary" data-testid="course-next" disabled={pending} onClick={advance}>{last ? "結果を見る（Enter）" : "次へ（Enter）"}</button>}
          <label className="gc-auto-advance">
            <input
              type="checkbox"
              data-testid="course-auto-advance"
              checked={autoAdvance}
              onChange={(event) => {
                const next = event.currentTarget.checked;
                setAutoAdvance(next);
                if (!next) { setAutoEligible(false); setAutoDue(false); setAutoCancelled(false); }
              }}
            />
            正解したら自動で次へ
          </label>
        </div>
        {practice ? <div className="gc-practice-back-row">
          <button type="button" data-testid="course-wrong-back" onClick={props.onBack}>元の結果に戻る</button>
        </div> : null}
      </div>
    </div>
  </div>;
}
