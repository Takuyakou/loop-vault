import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Ear, Lightbulb, Music2, Play, Square } from "lucide-react";
import { Button, Field, StatusMessage, Surface } from "../../../components/ui";
import type { AppLanguage } from "../../../i18n";
import { previewMidiNotes, stopPreview } from "../../../audio/chordPreview";
import {
  ROOT_MOTION_GENERATOR_VERSION,
  ROOT_MOTION_MAX_ATTEMPTS,
  STANDARD_BASS_TUNINGS,
  generateRootMotionExercise,
  type RootMotionCategory,
  type RootMotionDirection,
  type RootMotionLevel,
} from "../domain";
import { RootMotionPracticeSession, type RootMotionIdentifyAnswer } from "../application/rootMotionSession";
import { EchoPracticeHeader, EchoPracticeProgress } from "./EchoPracticeChrome";

const STEPS: Record<AppLanguage, readonly string[]> = {
  en: ["Listen", "Identify", "Sing", "Play", "Review", "Transfer"],
  ja: ["聴く", "答える", "歌う", "演奏", "レビュー", "移調"],
};
const DIRECTIONS: readonly RootMotionDirection[] = ["same", "up", "down"];
const CATEGORIES: readonly RootMotionCategory[] = ["same", "second", "third", "fourth", "tritone", "fifth"];

export type RootMotionPlayback = (notes: Parameters<typeof previewMidiNotes>[0], bpm: number, callbacks: { onEnded: () => void }) => Promise<void>;

export function RootMotionPracticeView({ language = "en", playback }: { readonly language?: AppLanguage; readonly playback?: RootMotionPlayback }) {
  const [level, setLevel] = useState<RootMotionLevel>(1);
  const [round, setRound] = useState(1);
  const [selectedDirection, setSelectedDirection] = useState<RootMotionDirection>();
  const [selectedCategory, setSelectedCategory] = useState<RootMotionCategory>();
  const [selectedSemitones, setSelectedSemitones] = useState<number>();
  const [message, setMessage] = useState<string>();
  const [, forceRender] = useReducer((value: number) => value + 1, 0);
  const generated = useMemo(() => generateRootMotionExercise({
    generatorVersion: ROOT_MOTION_GENERATOR_VERSION,
    seed: `root-motion-ui-${level}-${round}`,
    level,
    noteCount: level >= 4 ? 3 : 2,
    phraseLengthBeats: level >= 4 ? 6 : 4,
    tempo: 96,
    tuning: STANDARD_BASS_TUNINGS[4],
    stringCount: 4,
    fretRange: { min: 0, max: 12 },
    pitchSpan: { minMidi: 28, maxMidi: 55 },
    handedness: "right",
    maxAttempts: ROOT_MOTION_MAX_ATTEMPTS,
  }), [level, round]);
  const exercise = generated.ok ? generated.exercise : undefined;
  const session = useMemo(() => exercise ? new RootMotionPracticeSession(exercise) : undefined, [exercise]);
  const snapshot = session?.getSnapshot();

  useEffect(() => () => stopPreview(), []);
  useEffect(() => { setSelectedDirection(undefined); setSelectedCategory(undefined); setSelectedSemitones(undefined); setMessage(undefined); }, [exercise?.id]);

  const mutate = useCallback((operation: () => { readonly ok: boolean; readonly message?: string }) => {
    const result = operation();
    setMessage(result.ok ? undefined : result.message);
    forceRender();
    return result.ok;
  }, []);

  const listen = useCallback(() => {
    if (!session || !exercise || !mutate(() => session.startListen())) return;
    const notes = exercise.targetEvents.map((event) => ({ pitch: event.midiNote, startBeat: event.startBeat, durationBeats: event.durationBeats, velocity: event.velocity }));
    const play = playback ?? ((target, bpm, callbacks) => previewMidiNotes(target, bpm, "freepats-finger-bass", { onEnded: callbacks.onEnded }));
    void play(notes, exercise.tempo, { onEnded: () => { mutate(() => session.completeListen()); } }).catch((error: unknown) => {
      mutate(() => session.cancelListen());
      setMessage(error instanceof Error ? error.message : "Playback could not start.");
    });
  }, [exercise, mutate, playback, session]);

  if (!exercise || !session || !snapshot) return <StatusMessage tone="error" title="Root Motion Echo">{generated.ok ? "Session is unavailable." : generated.error.message}</StatusMessage>;
  const currentStep = snapshot.status === "ready" || snapshot.status === "listening" ? 0
    : snapshot.status === "identify" ? 1 : snapshot.status === "sing" ? 2
      : snapshot.status === "play" ? 3 : snapshot.status === "review" || snapshot.status === "completed" ? 4 : 0;
  const labels = language === "ja" ? {
    title: "Root Motion Echo", kicker: "ベース練習", badge: "客観Identify・自己評価", description: "2つのルートの移動を答え、歌い、演奏します。歌唱・演奏は自動採点しません。",
    level: "レベル", listen: "お手本を聴く", replay: "もう一度聴く", hint: "ヒント", identify: "答えを記録", direction: "方向", category: "大区分", exact: "正確な半音数", sing: "歌ったら演奏へ", play: "演奏を完了してレビューへ", review: "自己評価", next: "次の問題", first: "最初の回答を記録しました", stopped: "再生を停止", same: "同じ", up: "上行", down: "下行",
  } : {
    title: "Root Motion Echo", kicker: "Bass Practice", badge: "Objective Identify · self review", description: "Identify the movement between roots, then sing and play it. Sing and Play are not automatically scored.",
    level: "Level", listen: "Listen to example", replay: "Replay", hint: "Hint", identify: "Record answer", direction: "Direction", category: "Category", exact: "Exact semitones", sing: "Continue to Play", play: "Finish Play and review", review: "Self review", next: "Next exercise", first: "First answer recorded", stopped: "Playback stopped", same: "Same", up: "Up", down: "Down",
  };
  const answer: RootMotionIdentifyAnswer = { direction: selectedDirection, category: selectedCategory, semitones: selectedSemitones };
  const directionLabel = (value: RootMotionDirection) => value === "same" ? labels.same : value === "up" ? labels.up : labels.down;

  return (
    <section data-testid="root-motion-echo-view" className="space-y-4">
      <EchoPracticeHeader kicker={labels.kicker} title={labels.title} description={labels.description} badge={labels.badge} />
      <EchoPracticeProgress ariaLabel={language === "ja" ? "Root Motion Echoの進行" : "Root Motion Echo progress"} currentIndex={currentStep} steps={STEPS[language]} />
      <Surface className="space-y-5 border-[var(--lv-border)] bg-[var(--lv-surface)] p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={labels.level} htmlFor="root-motion-level" className="w-44"><select id="root-motion-level" aria-label="Root Motion level" value={level} onChange={(event) => { setLevel(Number(event.target.value) as RootMotionLevel); setRound((value) => value + 1); }}><option value={1}>1 — {language === "ja" ? "方向" : "Direction"}</option><option value={2}>2 — {language === "ja" ? "大区分" : "Category"}</option><option value={3}>3 — {language === "ja" ? "正確な音程" : "Exact interval"}</option></select></Field>
          <p className="pb-2 text-sm text-[var(--lv-text-secondary)]">{language === "ja" ? `再生 ${snapshot.listenCount}回・ヒント ${snapshot.hintLevel}/4` : `${snapshot.listenCount} listens · Hint ${snapshot.hintLevel}/4`}</p>
        </div>
        {snapshot.status === "ready" || snapshot.status === "identify" ? <div className="flex flex-wrap gap-2"><Button onClick={listen}><Ear className="size-4" />{snapshot.listenCount > 0 ? labels.replay : labels.listen}</Button><Button variant="secondary" onClick={() => mutate(() => session.nextHint())} disabled={snapshot.status === "ready" || snapshot.hintLevel >= 4}><Lightbulb className="size-4" />{labels.hint}</Button></div> : null}
        {snapshot.status === "listening" ? <div className="flex items-center gap-2 text-sm text-[var(--lv-text-secondary)]"><Music2 className="size-4" />{language === "ja" ? "再生中…" : "Playing…"}<Button variant="secondary" onClick={() => { stopPreview(); mutate(() => session.cancelListen()); }}><Square className="size-4" />{labels.stopped}</Button></div> : null}
        {snapshot.hintLevel > 0 ? <HintText hintLevel={snapshot.hintLevel} motion={exercise.motions[0]} language={language} /> : null}
        {snapshot.status === "identify" ? <div className="space-y-4 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] p-4"><p className="font-semibold text-[var(--lv-text)]">{language === "ja" ? "ルートはどう動きましたか？" : "How did the root move?"}</p><AnswerButtons label={labels.direction} values={DIRECTIONS} selected={selectedDirection} onSelect={setSelectedDirection} labelFor={directionLabel} />{level >= 2 ? <AnswerButtons label={labels.category} values={CATEGORIES} selected={selectedCategory} onSelect={setSelectedCategory} labelFor={(value) => value} /> : null}{level >= 3 ? <AnswerButtons label={labels.exact} values={[0, 1, 2, 3, 4, 5, 6, 7]} selected={selectedSemitones} onSelect={setSelectedSemitones} labelFor={(value) => String(value)} /> : null}<Button onClick={() => mutate(() => session.submitIdentify(answer))}>{labels.identify}</Button></div> : null}
        {snapshot.status === "sing" ? <div className="space-y-3"><p className="text-sm text-[var(--lv-text-secondary)]">{language === "ja" ? "歌って確認したら、ベースで再現してください。ここは自己評価です。" : "Sing the movement, then reproduce it on bass. This remains self-reviewed."}</p><Button onClick={() => mutate(() => session.continueToPlay())}>{labels.sing}</Button></div> : null}
        {snapshot.status === "play" ? <div className="space-y-3"><p className="text-sm text-[var(--lv-text-secondary)]">{language === "ja" ? "ベースで再現したらレビューへ進みます。自動採点は行いません。" : "Reproduce it on bass, then continue to your self review. No automatic scoring is performed."}</p><Button onClick={() => mutate(() => session.completePlay())}><Play className="size-4" />{labels.play}</Button></div> : null}
        {snapshot.status === "review" ? <div className="space-y-3"><p className="font-semibold text-[var(--lv-text)]">{labels.review}</p><div className="flex flex-wrap gap-2">{(["again", "hard", "good", "easy"] as const).map((rating) => <Button key={rating} variant="secondary" onClick={() => mutate(() => session.rate(rating))}>{rating}</Button>)}</div></div> : null}
        {snapshot.status === "completed" ? <div className="space-y-2"><p className="font-semibold text-[var(--lv-success)]">{labels.first}</p><Button onClick={() => setRound((value) => value + 1)}>{labels.next}</Button></div> : null}
        {snapshot.firstAnswer ? <p data-testid="root-motion-first-answer" className="text-sm text-[var(--lv-text-secondary)]">{labels.first} · {snapshot.firstAnswer.directionCorrect ? "direction ✓" : "direction ×"} · {snapshot.firstAnswer.assistance}</p> : null}
        {message ? <StatusMessage tone="error" title="Root Motion Echo">{message}</StatusMessage> : null}
      </Surface>
    </section>
  );
}

function AnswerButtons<T extends string | number>({ label, values, selected, onSelect, labelFor }: { readonly label: string; readonly values: readonly T[]; readonly selected?: T; readonly onSelect: (value: T) => void; readonly labelFor: (value: T) => string }) {
  return <fieldset className="space-y-2"><legend className="text-sm font-semibold text-[var(--lv-text-secondary)]">{label}</legend><div className="flex flex-wrap gap-2">{values.map((value) => <Button key={String(value)} variant={selected === value ? "primary" : "secondary"} onClick={() => onSelect(value)}>{labelFor(value)}</Button>)}</div></fieldset>;
}

function HintText({ hintLevel, motion, language }: { readonly hintLevel: number; readonly motion: { readonly direction: RootMotionDirection; readonly category: RootMotionCategory; readonly semitones: number }; readonly language: AppLanguage }) {
  const direction = language === "ja" ? (motion.direction === "same" ? "同じ" : motion.direction === "up" ? "上行" : "下行") : motion.direction;
  const text = hintLevel === 1 ? `${language === "ja" ? "方向" : "Direction"}: ${direction}` : hintLevel === 2 ? `${language === "ja" ? "大区分" : "Category"}: ${motion.category}` : hintLevel === 3 ? `${language === "ja" ? "正確な半音数" : "Exact semitones"}: ${motion.semitones}` : `${language === "ja" ? "指板シェイプは次のStageで確認できます" : "The fretboard shape is available in the next stage."}`;
  return <p className="rounded-[var(--lv-radius-sm)] bg-[var(--lv-accent-soft)] px-3 py-2 text-sm text-[var(--lv-text)]">{text}</p>;
}