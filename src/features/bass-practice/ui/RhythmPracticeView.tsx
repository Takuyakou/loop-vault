import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ear, Lightbulb, Music2, Square } from "lucide-react";
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
import { useMetronome } from "../../../components/MetronomeProvider";

const RATINGS: readonly PracticeRating[] = ["again", "hard", "good", "easy"];
const RHYTHM_STEPS = {
  ja: ["聴く", "思い出す", "歌う", "考える", "演奏", "レビュー"],
} as const;
type Status = "ready" | "listening" | "recall" | "singing" | "thinking" | "playing" | "review" | "completed";

type RhythmPlaybackPort = Pick<RhythmPlaybackController, "start" | "stop" | "dispose">;

export interface RhythmPracticeViewProps {
  readonly onAttemptCompleted?: (attempt: RhythmPracticeAttempt) => Promise<void>;
  /** Test seam that preserves the production controller by default. */
  readonly playbackController?: RhythmPlaybackPort;
}

export function RhythmPracticeView({
  onAttemptCompleted,
  playbackController,
}: RhythmPracticeViewProps) {
  const { enabled: metronome } = useMetronome();
  const [tempo, setTempo] = useState(88);
  const [meter, setMeter] = useState<"3/4" | "4/4" | "6/8">("4/4");
  const [countInBars, setCountInBars] = useState<1 | 2>(1);
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
      setError(cause instanceof Error ? cause.message : "お手本の音を準備できませんでした。");
    }
  }, [exercise, metronome]);

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
      setError(cause instanceof Error ? cause.message : "リズムのレビューを保存できませんでした。");
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
  const steps = RHYTHM_STEPS.ja;

  return (
    <div data-testid="rhythm-echo-view" data-practice-state={status} className="min-w-0 space-y-4">
      <EchoPracticeHeader
        kicker={"ベース練習"}
        title="Rhythm Echo"
        description={"リズムを聴き、思い出し、歌ってからベースで再現します。"}
        badge={"自己評価 · 自動採点ではありません"}
      />
      <EchoPracticeProgress
        ariaLabel={"Rhythm Echoの進行"}
        currentIndex={stepIndex}
        steps={steps}
      />

      <Surface variant="primary" className="min-w-0 overflow-hidden p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--lv-border)] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">{"現在の課題"}</p>
            <h3 className="mt-1 text-lg font-semibold text-[var(--lv-text)]">{"リズムを耳から再現"}</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-[var(--lv-text-secondary)]">
            <span>{tempo} BPM</span><span>· {meter}</span><span>· {countInBars} {"小節カウント"}</span>
          </div>
        </div>

        <div className="py-7 text-center sm:py-9">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]">
            {status === "listening" ? <Ear aria-hidden="true" size={28} /> : <Music2 aria-hidden="true" size={28} />}
          </span>
          <p className="mt-4 text-lg font-semibold text-[var(--lv-text)]">{rhythmPrompt(status)}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--lv-text-secondary)]">
            {rhythmDescription(status)}
          </p>
          <p role="status" aria-live="polite" aria-atomic="true" className="mt-3 text-sm text-[var(--lv-text-secondary)]">
            {rhythmStatusLabel(status)} · {"再生位置"} {playhead ?? "—"} · {"ヒント"} {hintLevel}/4
          </p>
          <div className="mx-auto mt-5 min-h-16 max-w-2xl rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-3" data-testid="rhythm-grid">
            {gridVisible ? exercise.targetEvents.map((event) => (
              <span key={event.index} className="mr-2 inline-block rounded bg-[var(--lv-accent-soft)] px-2 py-1 text-[var(--lv-accent)]">
                {event.startBeat}+{event.durationBeats}
              </span>
            )) : "リズムグリッドはヒント4またはレビューまで隠れています。"}
          </div>
        </div>

        <div className="grid gap-3 border-t border-[var(--lv-border)] pt-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field htmlFor="rhythm-tempo" label={"テンポ"}>
            <input id="rhythm-tempo" name="rhythm-tempo" aria-label={"リズムのテンポ"} className="lv-input w-full" type="number" min="30" max="240" disabled={controlsLocked} value={tempo} onChange={(event) => setTempo(Math.max(30, Math.min(240, Number(event.target.value))))} />
          </Field>
          <Field htmlFor="rhythm-meter" label={"拍子"}>
            <select id="rhythm-meter" name="rhythm-meter" aria-label={"リズムの拍子"} className="lv-input w-full" disabled={controlsLocked} value={meter} onChange={(event) => setMeter(event.target.value as typeof meter)}><option>3/4</option><option>4/4</option><option>6/8</option></select>
          </Field>
          <Field htmlFor="rhythm-count-in" label={"カウントイン"}>
            <select id="rhythm-count-in" name="rhythm-count-in" aria-label={"カウントインの小節数"} className="lv-input w-full" disabled={controlsLocked} value={countInBars} onChange={(event) => setCountInBars(Number(event.target.value) as 1 | 2)}><option value={1}>{"1小節"}</option><option value={2}>{"2小節"}</option></select>
          </Field>
          <p className="flex min-h-10 items-center self-end text-xs text-[var(--lv-text-muted)]" data-testid="rhythm-global-metronome">
            {"ヘッダーのメトロノーム"}: {metronome ? "ON" : "OFF"}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setHintLevel((value) => Math.min(4, value + 1) as 0 | 1 | 2 | 3 | 4)} disabled={hintLevel === 4}><Lightbulb size={15} /> {"ヒント"} <kbd>H</kbd></Button>
          <Button variant="ghost" onClick={() => setCountInBars((value) => value === 1 ? 2 : 1)} disabled={controlsLocked}>{"カウントイン"} <kbd>C</kbd></Button>
        </div>

        {status === "review" ? (
          <fieldset className="mt-5 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-3">
            <legend className="px-1 font-semibold">{"自己評価"}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {RATINGS.map((value) => <Button key={value} type="button" variant={rating === value ? "primary" : "ghost"} data-review-rating={value} aria-pressed={rating === value} onClick={() => setRating(value)}>{rhythmRatingLabel(value)}</Button>)}
            </div>
            <label className="mt-3 block text-sm text-[var(--lv-text-secondary)]" htmlFor="rhythm-issue">{"今回の課題"}</label>
            <select id="rhythm-issue" name="rhythm-issue" className="lv-input mt-2 w-full max-w-sm" aria-label={"リズム練習の課題"} value={issue ?? ""} onChange={(event) => setIssue((event.target.value || undefined) as typeof issue)}><option value="">{"課題を選択しない"}</option><option value="rhythm">{"リズム"}</option><option value="duration">{"音の長さ"}</option><option value="recall">{"思い出し"}</option></select>
          </fieldset>
        ) : null}

        {error ? <p role="alert" className="mt-3 text-sm text-[var(--lv-danger)]">{error}</p> : null}
        {status === "thinking" || status === "playing" || status === "review" ? <RecordCompareSection mode="rhythm" resetKey={`rhythm:${tempo}:${meter}:${countInBars}`} countInMs={Math.round(countInBars * Number(meter.split("/")[0]) * 60_000 / tempo)} targetPlayer={createTargetPlayer((onEnded) => void previewMidiNotes(exercise.targetEvents.map((event) => ({ pitch: 40, startBeat: event.startBeat, durationBeats: event.durationBeats, velocity: 100 })), tempo, "freepats-picked-bass", { onEnded }), stopPreview)} /> : null}

        <div className="mt-5">
          <Button data-primary-action disabled={(status === "review" && !rating) || saving} onClick={primary}>
            {status === "listening" ? <Square size={15} /> : <Ear size={15} />}
            {primaryActionLabel(status, saving)}
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

function rhythmPrompt(status: Status): string {
  const copy: Record<Status, string> = {
    ready: "まずお手本を聴きましょう",
    listening: "リズムを耳に残しましょう",
    recall: "音を止めて思い出す",
    singing: "リズムを声で歌う",
    thinking: "拍と音の長さを整理する",
    playing: "ベースで再現する",
    review: "演奏を自己評価する",
    completed: "レビューを保存しました",
  };
  return copy[status];
}

function rhythmDescription(status: Status): string {
  const copy: Record<Status, string> = {
    ready: "再生後は「思い出す」へ進みます。準備中でも停止してやり直せます。",
    listening: "画面を見ずにアクセントと休符を聴き取ります。",
    recall: "すぐ演奏せず、頭の中でもう一度鳴らします。",
    singing: "タ・タンなど自分の言葉でリズムを声にします。",
    thinking: "拍の位置と音の長さを確認してから演奏へ進みます。",
    playing: "お手本を自動再生せず、自分のタイミングで弾きます。",
    review: "録音を聴き返し、でき具合を自分で選びます。",
    completed: "次の問題へ進むと新しい練習が始まります。",
  };
  return copy[status];
}

function primaryActionLabel(status: Status, saving: boolean): string {
  if (status === "ready") return "お手本を聴く";
  if (status === "listening") return "再生を停止";
  if (status === "recall") return "歌うへ進む";
  if (status === "singing") return "考えるへ進む";
  if (status === "thinking") return "演奏を始める";
  if (status === "playing") return "レビューへ進む";
  if (status === "review") return saving ? "保存中…" : "自己評価を保存";
  return "次の問題";
}

function rhythmStatusLabel(status: Status): string {
  return { ready: "準備完了", listening: "お手本再生中", recall: "思い出す", singing: "歌う", thinking: "考える", playing: "演奏する", review: "レビュー", completed: "完了" }[status];
}

function rhythmRatingLabel(rating: PracticeRating): string {
  return { again: "もう一度", hard: "難しい", good: "良い", easy: "簡単" }[rating];
}
