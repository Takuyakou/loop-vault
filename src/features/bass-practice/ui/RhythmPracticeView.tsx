import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ear, Lightbulb, Music2, Square } from "lucide-react";
import type { AppLanguage } from "../../../i18n";
import { Button, Field, Surface } from "../../../components/ui";
import {
  generateRhythmExercise,
  RHYTHM_GENERATOR_VERSION,
  type PracticeIssue,
  type PracticeRating,
  type RhythmGeneratorSnapshot,
  type RhythmPracticeAttempt,
} from "../domain";
import { RhythmPlaybackController } from "../application/rhythmMetronome";
import { RecordCompareSection } from "../recording/ui/RecordCompareSection";
import { createTargetPlayer } from "../recording/application/playback";
import { previewMidiNotes, stopPreview } from "../../../audio/chordPreview";
import { EchoPracticeHeader, EchoPracticeProgress } from "./EchoPracticeChrome";

const RATINGS: readonly PracticeRating[] = ["again", "hard", "good", "easy"];
const RHYTHM_STEPS = {
  en: ["Listen", "Recall", "Sing", "Think", "Play", "Review"],
  ja: ["聴く", "思い出す", "歌う", "考える", "演奏", "レビュー"],
} as const;
type Status = "ready" | "listening" | "recall" | "singing" | "thinking" | "playing" | "review" | "completed";

type RhythmPlaybackPort = Pick<RhythmPlaybackController, "start" | "stop" | "dispose">;

export interface RhythmPracticeViewProps {
  readonly language?: AppLanguage;
  readonly onAttemptCompleted?: (attempt: RhythmPracticeAttempt) => Promise<void>;
  /** Test seam that preserves the production controller by default. */
  readonly playbackController?: RhythmPlaybackPort;
}

export function RhythmPracticeView({
  language = "en",
  onAttemptCompleted,
  playbackController,
}: RhythmPracticeViewProps) {
  const ja = language === "ja";
  const [tempo, setTempo] = useState(88);
  const [meter, setMeter] = useState<"3/4" | "4/4" | "6/8">("4/4");
  const [countInBars, setCountInBars] = useState<1 | 2>(1);
  const [metronome, setMetronome] = useState(true);
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [status, setStatus] = useState<Status>("ready");
  const [rating, setRating] = useState<PracticeRating>();
  const [issue, setIssue] = useState<Extract<PracticeIssue, "rhythm" | "duration" | "recall">>();
  const [playhead, setPlayhead] = useState<number>();
  const [listenCount, setListenCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const controller = useRef<RhythmPlaybackPort>();
  const playbackGeneration = useRef(0);
  const startedAt = useRef(new Date().toISOString());
  const sessionId = useRef(`rhythm-session-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`);

  if (!controller.current) controller.current = playbackController ?? new RhythmPlaybackController();

  const exercise = useMemo(() => {
    const [numerator, denominator] = meter.split("/").map(Number) as [3 | 4 | 6, 4 | 8];
    const snapshot: RhythmGeneratorSnapshot = {
      generatorVersion: RHYTHM_GENERATOR_VERSION,
      seed: `rhythm-ui:${tempo}:${meter}:${countInBars}`,
      vocabularyId: "offbeat-eighth",
      tempo,
      meter: { numerator, denominator },
      phraseBars: 1,
      startPositionBeats: 0,
      countInBars,
      listenLimit: 2,
    };
    const result = generateRhythmExercise(snapshot);
    if (!result.ok) throw new Error(result.error.message);
    return result.exercise;
  }, [countInBars, meter, tempo]);

  useEffect(() => () => {
    playbackGeneration.current += 1;
    controller.current?.dispose();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      const key = event.key.toLowerCase();
      if (key === "m" && status !== "listening") setMetronome((value) => !value);
      if (key === "c" && status !== "listening") setCountInBars((value) => value === 1 ? 2 : 1);
      if (key === "h") setHintLevel((value) => Math.min(4, value + 1) as 0 | 1 | 2 | 3 | 4);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status]);

  const stopListening = useCallback(() => {
    playbackGeneration.current += 1;
    controller.current?.stop();
    setPlayhead(undefined);
    setStatus((current) => current === "listening" ? "ready" : current);
  }, []);

  const play = useCallback(async () => {
    const generation = playbackGeneration.current + 1;
    playbackGeneration.current = generation;
    setError(undefined);
    setStatus("listening");
    setPlayhead(undefined);
    setListenCount((count) => count + 1);
    try {
      await controller.current?.start(exercise, {
        metronomeEnabled: metronome,
        callbacks: {
          onPlayhead: (beat) => {
            if (playbackGeneration.current === generation) setPlayhead(beat);
          },
          onEnded: () => {
            if (playbackGeneration.current !== generation) return;
            playbackGeneration.current += 1;
            setPlayhead(undefined);
            setStatus("recall");
          },
        },
      });
    } catch (cause) {
      if (playbackGeneration.current !== generation) return;
      playbackGeneration.current += 1;
      controller.current?.stop();
      setPlayhead(undefined);
      setStatus("ready");
      setError(cause instanceof Error ? cause.message : ja ? "お手本の音を準備できませんでした。" : "The example audio could not be prepared.");
    }
  }, [exercise, ja, metronome]);

  const saveReview = async () => {
    if (!rating || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await onAttemptCompleted?.({
        id: `rhythm-attempt-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`,
        sessionId: sessionId.current,
        startedAt: startedAt.current,
        completedAt: new Date().toISOString(),
        listenCount: Math.max(1, listenCount),
        hintLevel,
        rating,
        mainIssue: issue,
        independentSuccess: (rating === "good" || rating === "easy") && hintLevel <= 2,
        exerciseSnapshot: exercise,
      });
      setStatus("completed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ja ? "リズムのレビューを保存できませんでした。" : "Rhythm review could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const primary = () => {
    if (status === "ready") void play();
    else if (status === "listening") stopListening();
    else if (status === "recall") setStatus("singing");
    else if (status === "singing") setStatus("thinking");
    else if (status === "thinking") setStatus("playing");
    else if (status === "playing") setStatus("review");
    else if (status === "review") void saveReview();
    else {
      setRating(undefined);
      setIssue(undefined);
      setHintLevel(0);
      setListenCount(0);
      setPlayhead(undefined);
      startedAt.current = new Date().toISOString();
      setStatus("ready");
    }
  };

  const gridVisible = hintLevel >= 4 || status === "review" || status === "completed";
  const controlsLocked = status === "listening" || saving;
  const stepIndex = rhythmStepIndex(status);
  const steps = RHYTHM_STEPS[language];

  return (
    <div data-testid="rhythm-echo-view" data-practice-state={status} className="min-w-0 space-y-4">
      <EchoPracticeHeader
        kicker={ja ? "ベース練習" : "Bass Practice"}
        title="Rhythm Echo"
        description={ja ? "リズムを聴き、思い出し、歌ってからベースで再現します。" : "Listen, recall, sing, and reproduce the rhythm on bass."}
        badge={ja ? "自己評価 · 自動採点ではありません" : "Self-rated · No automatic scoring"}
      />
      <EchoPracticeProgress
        ariaLabel={ja ? "Rhythm Echoの進行" : "Rhythm Echo progress"}
        currentIndex={stepIndex}
        steps={steps}
      />

      <Surface variant="primary" className="min-w-0 overflow-hidden p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--lv-border)] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">{ja ? "現在の課題" : "Current challenge"}</p>
            <h3 className="mt-1 text-lg font-semibold text-[var(--lv-text)]">{ja ? "リズムを耳から再現" : "Reproduce the rhythm by ear"}</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-[var(--lv-text-secondary)]">
            <span>{tempo} BPM</span><span>· {meter}</span><span>· {countInBars} {ja ? "小節カウント" : countInBars === 1 ? "bar count-in" : "bars count-in"}</span>
          </div>
        </div>

        <div className="py-7 text-center sm:py-9">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]">
            {status === "listening" ? <Ear aria-hidden="true" size={28} /> : <Music2 aria-hidden="true" size={28} />}
          </span>
          <p className="mt-4 text-lg font-semibold text-[var(--lv-text)]">{rhythmPrompt(status, language)}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--lv-text-secondary)]">
            {rhythmDescription(status, language)}
          </p>
          <p role="status" aria-live="polite" aria-atomic="true" className="mt-3 text-sm text-[var(--lv-text-secondary)]">
            {rhythmStatusLabel(status, language)} · {ja ? "再生位置" : "Playhead"} {playhead ?? "—"} · {ja ? "ヒント" : "Hint"} {hintLevel}/4
          </p>
          <div className="mx-auto mt-5 min-h-16 max-w-2xl rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-3" data-testid="rhythm-grid">
            {gridVisible ? exercise.targetEvents.map((event) => (
              <span key={event.index} className="mr-2 inline-block rounded bg-[var(--lv-accent-soft)] px-2 py-1 text-[var(--lv-accent)]">
                {event.startBeat}+{event.durationBeats}
              </span>
            )) : ja ? "リズムグリッドはヒント4またはレビューまで隠れています。" : "The rhythm grid stays hidden until Hint 4 or Review."}
          </div>
        </div>

        <div className="grid gap-3 border-t border-[var(--lv-border)] pt-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field htmlFor="rhythm-tempo" label={ja ? "テンポ" : "Tempo"}>
            <input id="rhythm-tempo" name="rhythm-tempo" aria-label={ja ? "リズムのテンポ" : "Rhythm tempo"} className="lv-input w-full" type="number" min="30" max="240" disabled={controlsLocked} value={tempo} onChange={(event) => setTempo(Math.max(30, Math.min(240, Number(event.target.value))))} />
          </Field>
          <Field htmlFor="rhythm-meter" label={ja ? "拍子" : "Meter"}>
            <select id="rhythm-meter" name="rhythm-meter" aria-label={ja ? "リズムの拍子" : "Rhythm meter"} className="lv-input w-full" disabled={controlsLocked} value={meter} onChange={(event) => setMeter(event.target.value as typeof meter)}><option>3/4</option><option>4/4</option><option>6/8</option></select>
          </Field>
          <Field htmlFor="rhythm-count-in" label={ja ? "カウントイン" : "Count-in"}>
            <select id="rhythm-count-in" name="rhythm-count-in" aria-label={ja ? "カウントインの小節数" : "Rhythm count-in"} className="lv-input w-full" disabled={controlsLocked} value={countInBars} onChange={(event) => setCountInBars(Number(event.target.value) as 1 | 2)}><option value={1}>{ja ? "1小節" : "1 bar"}</option><option value={2}>{ja ? "2小節" : "2 bars"}</option></select>
          </Field>
          <label className="flex min-h-10 items-center gap-2 self-end rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] px-3 text-sm text-[var(--lv-text-secondary)]">
            <input name="rhythm-metronome" type="checkbox" disabled={controlsLocked} checked={metronome} onChange={(event) => setMetronome(event.target.checked)} />
            {ja ? "メトロノーム" : "Metronome"} <kbd>M</kbd>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setHintLevel((value) => Math.min(4, value + 1) as 0 | 1 | 2 | 3 | 4)} disabled={hintLevel === 4}><Lightbulb size={15} /> {ja ? "ヒント" : "Hint"} <kbd>H</kbd></Button>
          <Button variant="ghost" onClick={() => setMetronome((value) => !value)} disabled={controlsLocked}>{ja ? "メトロノーム" : "Metronome"} <kbd>M</kbd></Button>
          <Button variant="ghost" onClick={() => setCountInBars((value) => value === 1 ? 2 : 1)} disabled={controlsLocked}>{ja ? "カウントイン" : "Count-in"} <kbd>C</kbd></Button>
        </div>

        {status === "review" ? (
          <fieldset className="mt-5 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-3">
            <legend className="px-1 font-semibold">{ja ? "自己評価" : "Self-rated review"}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {RATINGS.map((value) => <Button key={value} type="button" variant={rating === value ? "primary" : "ghost"} data-review-rating={value} aria-pressed={rating === value} onClick={() => setRating(value)}>{rhythmRatingLabel(value, language)}</Button>)}
            </div>
            <label className="mt-3 block text-sm text-[var(--lv-text-secondary)]" htmlFor="rhythm-issue">{ja ? "今回の課題" : "Main issue"}</label>
            <select id="rhythm-issue" name="rhythm-issue" className="lv-input mt-2 w-full max-w-sm" aria-label={ja ? "リズム練習の課題" : "Rhythm issue"} value={issue ?? ""} onChange={(event) => setIssue((event.target.value || undefined) as typeof issue)}><option value="">{ja ? "課題を選択しない" : "No issue selected"}</option><option value="rhythm">{ja ? "リズム" : "Rhythm"}</option><option value="duration">{ja ? "音の長さ" : "Duration"}</option><option value="recall">{ja ? "思い出し" : "Recall"}</option></select>
          </fieldset>
        ) : null}

        {error ? <p role="alert" className="mt-3 text-sm text-[var(--lv-danger)]">{error}</p> : null}
        {status === "thinking" || status === "playing" || status === "review" ? <RecordCompareSection mode="rhythm" resetKey={`rhythm:${tempo}:${meter}:${countInBars}`} countInMs={Math.round(countInBars * Number(meter.split("/")[0]) * 60_000 / tempo)} targetPlayer={createTargetPlayer((onEnded) => void previewMidiNotes(exercise.targetEvents.map((event) => ({ pitch: 40, startBeat: event.startBeat, durationBeats: event.durationBeats, velocity: 100 })), tempo, "freepats-picked-bass", { onEnded }), stopPreview)} /> : null}

        <div className="mt-5">
          <Button data-primary-action disabled={(status === "review" && !rating) || saving} onClick={primary}>
            {status === "listening" ? <Square size={15} /> : <Ear size={15} />}
            {primaryActionLabel(status, language, saving)}
          </Button>
        </div>
      </Surface>
    </div>
  );
}

function rhythmStepIndex(status: Status): number {
  if (status === "ready" || status === "listening") return 0;
  if (status === "recall") return 1;
  if (status === "singing") return 2;
  if (status === "thinking") return 3;
  if (status === "playing") return 4;
  return 5;
}

function rhythmPrompt(status: Status, language: AppLanguage): string {
  const ja = language === "ja";
  const copy: Record<Status, readonly [string, string]> = {
    ready: ["まずお手本を聴きましょう", "Listen to the example first"],
    listening: ["リズムを耳に残しましょう", "Hold the rhythm in your ear"],
    recall: ["音を止めて思い出す", "Recall it in silence"],
    singing: ["リズムを声で歌う", "Sing the rhythm"],
    thinking: ["拍と音の長さを整理する", "Think in beats and durations"],
    playing: ["ベースで再現する", "Reproduce it on bass"],
    review: ["演奏を自己評価する", "Review your performance"],
    completed: ["レビューを保存しました", "Review saved"],
  };
  return copy[status][ja ? 0 : 1];
}

function rhythmDescription(status: Status, language: AppLanguage): string {
  const ja = language === "ja";
  const copy: Record<Status, readonly [string, string]> = {
    ready: ["再生後は「思い出す」へ進みます。準備中でも停止してやり直せます。", "After playback you will move to Recall. You can stop safely while audio prepares."],
    listening: ["画面を見ずにアクセントと休符を聴き取ります。", "Listen for accents and rests without looking at the grid."],
    recall: ["すぐ演奏せず、頭の中でもう一度鳴らします。", "Replay the rhythm mentally before making a sound."],
    singing: ["タ・タンなど自分の言葉でリズムを声にします。", "Vocalize the rhythm with syllables that feel natural."],
    thinking: ["拍の位置と音の長さを確認してから演奏へ進みます。", "Confirm beat positions and note lengths before playing."],
    playing: ["お手本を自動再生せず、自分のタイミングで弾きます。", "Play in your own time without automatic scoring."],
    review: ["録音を聴き返し、でき具合を自分で選びます。", "Listen back and choose your own rating."],
    completed: ["次の問題へ進むと新しい練習が始まります。", "Continue to begin the next exercise."],
  };
  return copy[status][ja ? 0 : 1];
}

function primaryActionLabel(status: Status, language: AppLanguage, saving: boolean): string {
  const ja = language === "ja";
  if (status === "ready") return ja ? "お手本を聴く" : "Listen to example";
  if (status === "listening") return ja ? "再生を停止" : "Stop playback";
  if (status === "recall") return ja ? "歌うへ進む" : "Continue to Sing";
  if (status === "singing") return ja ? "考えるへ進む" : "Continue to Think";
  if (status === "thinking") return ja ? "演奏を始める" : "Start playing";
  if (status === "playing") return ja ? "レビューへ進む" : "Continue to Review";
  if (status === "review") return saving ? ja ? "保存中…" : "Saving…" : ja ? "自己評価を保存" : "Save self review";
  return ja ? "次の問題" : "Next exercise";
}

function rhythmStatusLabel(status: Status, language: AppLanguage): string {
  if (language === "en") return status;
  return { ready: "準備完了", listening: "お手本再生中", recall: "思い出す", singing: "歌う", thinking: "考える", playing: "演奏する", review: "レビュー", completed: "完了" }[status];
}

function rhythmRatingLabel(rating: PracticeRating, language: AppLanguage): string {
  if (language === "en") return rating[0].toUpperCase() + rating.slice(1);
  return { again: "もう一度", hard: "難しい", good: "良い", easy: "簡単" }[rating];
}
