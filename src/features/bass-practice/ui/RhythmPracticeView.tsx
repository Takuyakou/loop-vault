import { Select } from "../../../components/ui/controls";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chip, Popover } from "../../../components/ui";
import {
  generateRhythmExercise,
  RHYTHM_GENERATOR_VERSION,
  type PracticeRating,
  type RhythmGeneratorSnapshot,
  type RhythmPracticeAttempt,
  type RhythmVocabularyId,
} from "../domain";
import { RhythmPlaybackController } from "../application/rhythmMetronome";
import { useMetronome } from "../../../components/MetronomeProvider";
import { useGlobalBpm } from "../../../components/GlobalBpmProvider";
import { useEchoActive } from "./EchoPracticeFrame";
import {
  StageButton,
  StageCount,
  StageFrame,
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

type Status = "ready" | "listening" | "heard";
type RhythmPlaybackPort = Pick<RhythmPlaybackController, "start" | "stop" | "dispose">;
type Level = 1 | 2 | 3;

/**
 * P23-62: the rhythms by level. Each new rhythm is the next one of the chosen level (the old screen showed the
 * same offbeat rhythm every time).
 */
const LEVEL_CELLS: Readonly<Record<Level, readonly RhythmVocabularyId[]>> = {
  1: ["quarter", "eighth", "two-beat-cell"],
  2: ["offbeat-eighth", "rest-start", "one-bar-cell", "tied-duration"],
  3: ["anticipation", "dotted-eighth-sixteenth", "sixteenth-syncopation"],
};
const LEVEL_LABELS: Readonly<Record<Level, string>> = { 1: "やさしい", 2: "ふつう", 3: "むずかしい" };
const LISTEN_LIMIT = 2;

export interface RhythmPracticeViewProps {
  readonly onAttemptCompleted?: (attempt: RhythmPracticeAttempt) => Promise<void>;
  /** Test seam that preserves the production controller by default. */
  readonly playbackController?: RhythmPlaybackPort;
}

/**
 * P23-62: リズム on the shared stage. 1 聴く (the rhythm on one note, twice at most; the lane stays empty until a
 * hint) → 2 弾く (count-in, record with the click) → 3 結果 (timing only — the pitch is not judged).
 */
export function RhythmPracticeView({ onAttemptCompleted, playbackController }: RhythmPracticeViewProps) {
  const { enabled: metronome } = useMetronome();
  // P23-06b R1: the exercise starts at the app-wide BPM; `tempo` is the speed of the problem now on screen.
  const { bpm: globalBpm } = useGlobalBpm();
  const [tempo, setTempo] = useState(globalBpm);
  const [meter, setMeter] = useState<"3/4" | "4/4" | "6/8">("4/4");
  const [countInBars, setCountInBars] = useState<1 | 2>(1);
  const [level, setLevel] = useState<Level>(2);
  const [round, setRound] = useState(0);
  const [chipsOpen, setChipsOpen] = useState(0);
  const [status, setStatus] = useState<Status>("ready");
  const [playhead, setPlayhead] = useState<number>();
  const [listenCount, setListenCount] = useState(0);
  const [selfPlaying, setSelfPlaying] = useState(false);
  const [answer, setAnswer] = useState<"take" | "self">();
  const [rating, setRating] = useState<PracticeRating>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const controller = useRef<RhythmPlaybackPort>();
  const playbackGeneration = useRef(0);
  const startedAt = useRef(new Date().toISOString());
  const sessionId = useRef(`rhythm-session-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`);
  if (!controller.current) controller.current = playbackController ?? new RhythmPlaybackController();

  const cells = LEVEL_CELLS[level];
  const vocabularyId = cells[round % cells.length]!;
  const exercise = useMemo(() => {
    const [numerator, denominator] = meter.split("/").map(Number) as [3 | 4 | 6, 4 | 8];
    const snapshot: RhythmGeneratorSnapshot = {
      generatorVersion: RHYTHM_GENERATOR_VERSION,
      seed: `rhythm-ui:${tempo}:${meter}:${countInBars}:${vocabularyId}:${round}`,
      vocabularyId,
      tempo,
      meter: { numerator, denominator },
      phraseBars: 1,
      startPositionBeats: 0,
      countInBars,
      listenLimit: LISTEN_LIMIT,
    };
    const result = generateRhythmExercise(snapshot);
    if (!result.ok) throw new Error(result.error.message);
    return result.exercise;
  }, [countInBars, meter, round, tempo, vocabularyId]);
  const beatsPerBar = exercise.meter.numerator;
  const phraseBeats = exercise.difficulty.phraseLengthBeats;
  const target = useMemo(() => exercise.targetEvents.map((event) => ({ pitch: 40, startBeat: event.startBeat, durationBeats: event.durationBeats, velocity: event.velocity })), [exercise]);
  const take = useJudgedTake({
    mode: "rhythm",
    resetKey: `rhythm:${exercise.id}`,
    practiceSessionId: sessionId.current,
    target,
    bpm: exercise.tempo,
    lengthBeats: phraseBeats + 1,
    beatsPerBar,
    countInBeats: beatsPerBar * countInBars,
    pitchRule: "ignore",
  });

  // P23-06b R2: a new problem starts at the app-wide BPM. A problem already under way keeps its own speed.
  useEffect(() => {
    if (status !== "ready" || saving) return;
    setTempo((current) => (current === globalBpm ? current : globalBpm));
  }, [globalBpm, saving, status]);
  useEffect(() => () => { playbackGeneration.current += 1; controller.current?.dispose(); }, []);

  const stopListening = useCallback(() => {
    playbackGeneration.current += 1;
    controller.current?.stop();
    setPlayhead(undefined);
    setStatus((current) => current === "listening" ? (listenCount > 0 ? "heard" : "ready") : current);
  }, [listenCount]);

  const listen = useCallback(async () => {
    if (status === "listening") { stopListening(); return; }
    if (listenCount >= LISTEN_LIMIT) return;
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
          onPlayhead: (beat) => { if (playbackGeneration.current === generation) setPlayhead(beat); },
          onEnded: () => {
            if (playbackGeneration.current !== generation) return;
            playbackGeneration.current += 1;
            setPlayhead(undefined);
            setStatus("heard");
          },
        },
      });
    } catch (cause) {
      if (playbackGeneration.current !== generation) return;
      playbackGeneration.current += 1;
      controller.current?.stop();
      setPlayhead(undefined);
      setStatus("ready");
      setListenCount((count) => Math.max(0, count - 1));
      setError(cause instanceof Error ? cause.message : "お手本の音を準備できませんでした。");
    }
  }, [exercise, listenCount, metronome, status, stopListening]);

  useEffect(() => {
    if (take.phase !== "done" || !take.result) return;
    setAnswer("take");
    setRating(suggestedRating(take.result.counts.correct, take.result.counts.total, chipsOpen));
    // chipsOpen is read at the moment the take ends, on purpose.
  }, [take.phase, take.result]);

  const nextRhythm = useCallback(async () => {
    if (!rating || saving || !answer) return;
    take.stopPlayback();
    setSaving(true);
    setError(undefined);
    try {
      await onAttemptCompleted?.({
        id: `rhythm-attempt-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`,
        sessionId: sessionId.current,
        startedAt: startedAt.current,
        completedAt: new Date().toISOString(),
        listenCount: Math.max(1, listenCount),
        hintLevel: chipsOpen as 0 | 1 | 2 | 3,
        rating,
        independentSuccess: (rating === "good" || rating === "easy") && chipsOpen <= 2,
        exerciseSnapshot: exercise,
      });
      setRating(undefined); setAnswer(undefined); setChipsOpen(0); setListenCount(0); setSelfPlaying(false);
      setPlayhead(undefined); setStatus("ready"); take.reset();
      startedAt.current = new Date().toISOString();
      setTempo(globalBpm);
      setRound((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "リズムの記録を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }, [answer, chipsOpen, exercise, globalBpm, listenCount, onAttemptCompleted, rating, saving, take]);

  const heard = listenCount > 0 && status !== "listening";
  const takeRunning = take.phase === "preparing" || take.phase === "counting" || take.phase === "recording" || take.phase === "analyzing";
  const step: StageStep = answer ? 2 : takeRunning || selfPlaying || take.phase === "failed" ? 1 : 0;
  const record = useCallback(() => { if (!heard || takeRunning) return; setSelfPlaying(false); setAnswer(undefined); take.start(); }, [heard, take, takeRunning]);
  const playWithoutTake = useCallback(() => { if (!heard || takeRunning) return; take.reset(); setSelfPlaying(true); }, [heard, take, takeRunning]);
  const showAnswer = useCallback(() => { setSelfPlaying(false); take.reset(); setAnswer("self"); setRating(undefined); }, [take]);
  const openHint = useCallback(() => { if (heard && !answer) setChipsOpen((value) => Math.min(3, value + 1)); }, [answer, heard]);

  const active = useEchoActive();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!active || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      let handled = true;
      if (key === "escape") { if (takeRunning) take.stop(); else { take.stopPlayback(); stopListening(); } }
      else if (takeRunning) handled = false;
      else if (key === " ") { if (selfPlaying) showAnswer(); else if (step === 0) void listen(); else if (step === 2) take.playTarget(); else handled = false; }
      else if (key === "h" && step === 0) openHint();
      else if (key === "r" && (step === 0 || answer === "take")) record();
      else if (key === "n" && step === 2) void nextRhythm();
      else if (["1", "2", "3", "4"].includes(key) && step === 2) setRating(STAGE_RATINGS[Number(key) - 1]);
      else handled = false;
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, answer, listen, nextRhythm, openHint, record, selfPlaying, showAnswer, step, stopListening, take, takeRunning]);

  const meta = `${meter} · ${exercise.tempo} BPM · 1 小節`;
  const refNotes: LaneNote[] = exercise.targetEvents.map((event, index) => ({
    startBeat: event.startBeat, durationBeats: event.durationBeats, kind: "ref", label: `お手本 ${index + 1} 音目 ${event.startBeat + 1} 拍目`,
  }));
  // The lane gives the rhythm away, so it stays empty until 「最初の音」 / 「リズムの形」 are open.
  const hiddenNotes: LaneNote[] = chipsOpen >= 3
    ? refNotes.map((note) => ({ ...note, kind: "hide" }))
    : chipsOpen >= 2 && refNotes[0] ? [{ ...refNotes[0], kind: "hide", label: "最初の音" }] : [];
  const chips = [
    { id: "count", label: "音の数", openLabel: `${exercise.targetEvents.length} 音` },
    { id: "first", label: "最初の音" },
    { id: "shape", label: "リズムの形" },
  ];
  const tools = (
    <StageTools>
      <Popover label="リズムの条件" trigger={(props) => <Chip {...props} data-testid="rhythm-conditions">{LEVEL_LABELS[level]} · {meter} · カウント {countInBars} 小節</Chip>}>
        <div className="bp-tools-panel">
          <label>難しさ
            <Select aria-label="リズムの難しさ" value={level} disabled={takeRunning} onChange={(event) => { setLevel(Number(event.target.value) as Level); setRound(0); setListenCount(0); setChipsOpen(0); setAnswer(undefined); setStatus("ready"); take.reset(); }}>
              {([1, 2, 3] as const).map((value) => <option key={value} value={value}>{LEVEL_LABELS[value]}</option>)}
            </Select>
          </label>
          <label>拍子
            <Select id="rhythm-meter" aria-label="リズムの拍子" value={meter} disabled={takeRunning || status === "listening"} onChange={(event) => { setMeter(event.target.value as typeof meter); setListenCount(0); setChipsOpen(0); setAnswer(undefined); setStatus("ready"); }}>
              <option>3/4</option><option>4/4</option><option>6/8</option>
            </Select>
          </label>
          <label>録る前のカウント
            <Select id="rhythm-count-in" aria-label="カウントインの小節数" value={countInBars} disabled={takeRunning} onChange={(event) => setCountInBars(Number(event.target.value) as 1 | 2)}>
              <option value={1}>1 小節</option><option value={2}>2 小節</option>
            </Select>
          </label>
          <p>テンポは上の BPM です。いま {exercise.tempo} BPM{tempo !== globalBpm ? `（次のリズムから ${globalBpm} BPM）` : ""}。お手本を聴く時のクリックは上のメトロノームに従い、録る時はいつも鳴ります。</p>
        </div>
      </Popover>
    </StageTools>
  );

  if (step === 1) {
    return (
      <StageFrame step={1} keys={takeRunning ? "Esc 止める" : selfPlaying ? "Space 答えを見る" : "R もう一度録る"} testId="rhythm-echo-view" state={take.phase}>
        {tools}{take.recorder}
        <p className="bp-meta">{meta}</p>
        {take.phase === "counting" ? <StageCount beats={beatsPerBar * countInBars} current={take.count} /> : null}
        <p className="bp-say">{take.phase === "analyzing" ? "判定しています…" : take.phase === "failed" ? "うまく録れませんでした" : selfPlaying ? "ベースで弾いてください" : take.phase === "recording" ? "クリックに合わせて弾いてください" : "カウントのあとに弾き始めます"}</p>
        {selfPlaying ? <p className="bp-sub">録音はしません。弾き終えたら答えを見て、自分で評価します。</p> : null}
        <StageLane lengthBeats={phraseBeats} beatsPerBar={beatsPerBar} rows={selfPlaying ? [{ label: "お手本", notes: hiddenNotes }] : [{ label: "お手本", notes: hiddenNotes }, { label: "自分", notes: [] }]} {...(take.phase === "recording" && take.beat !== undefined ? { playhead: take.beat } : {})} />
        {take.phase === "failed" ? <p className="bp-note-line" role="alert">{take.error}</p> : null}
        {take.phase === "recording" ? <p className="bp-note-line"><StageMeter level={take.inputLevel} />{take.inputLevel > 0.004 ? "入力に音が届いています" : "入力に音が来ていません。機器とチャンネルを確かめてください"} · 音の高さは何でもかまいません</p> : null}
        <div className="bp-actions">
          {takeRunning ? <StageButton tone="record" keyHint="Esc" onClick={take.stop}>■ 止める</StageButton> : null}
          {selfPlaying ? <StageButton tone="primary" keyHint="Space" onClick={showAnswer}>弾けた・答えを見る</StageButton> : null}
          {take.phase === "failed" ? <>
            <StageButton onClick={showAnswer}>録らずに評価する</StageButton>
            {!take.unavailable ? <StageButton tone="primary" keyHint="R" onClick={record}>● もう一度録る</StageButton> : null}
          </> : null}
        </div>
      </StageFrame>
    );
  }

  if (step === 2) {
    const result = answer === "take" ? take.result : undefined;
    const counts = result?.counts;
    const facts: ResultFact[] = counts ? [
      { text: `合った ${counts.correct}`, tone: "ok" },
      { text: `早い・遅い ${counts.timing}`, tone: "warn" },
      ...(counts.missed ? [{ text: `抜け ${counts.missed}`, tone: "mute" as const }] : []),
      ...(counts.extra ? [{ text: `余分な音 ${counts.extra}`, tone: "ng" as const }] : []),
      { text: `平均 ${result.meanOffsetMs >= 0 ? "+" : ""}${Math.round(result.meanOffsetMs)}ms` },
      { text: "音の高さは見ません" },
    ] : [{ text: "録音なし・自分で評価" }, { text: chipsOpen ? `ヒント ${chipsOpen} 段` : "ヒントなし" }];
    const good = Boolean(counts && counts.total && counts.correct / counts.total >= 0.75);
    const kept = take.recorderStatus === "saved";
    return (
      <StageFrame step={2} keys="Space お手本 · R 録り直す · 1–4 評価 · N 次のリズム" tone={good ? "good" : undefined} testId="rhythm-echo-view" state="review">
        {tools}{take.recorder}
        {counts ? <StageResultHead big={`${counts.correct} / ${counts.total}`} label="タイミングが合いました" facts={facts} /> : <StageResultHead big="答え" label="お手本と比べて、自分で評価してください" facts={facts} />}
        <StageLane lengthBeats={phraseBeats} beatsPerBar={beatsPerBar} rows={result ? [{ label: "お手本", notes: refNotes }, { label: "自分", notes: takeNotes(result, exercise.tempo, phraseBeats + 1, exercise.targetEvents).map((note) => note.kind === "ok" ? { ...note, sub: undefined } : note.kind === "pitch" ? { ...note, kind: "ok" as const, text: "✓", sub: undefined } : note) }] : [{ label: "お手本", notes: refNotes }]} {...(take.beat !== undefined && take.playing ? { playhead: take.beat } : {})} />
        <StageRatingChoice value={rating} onChange={setRating} prompt={result ? "評価（判定は目安。変えられます）" : "評価"} />
        <div className="bp-actions">
          <StageButton onClick={take.playTarget} aria-pressed={take.playing === "target"}>▶ お手本</StageButton>
          {result ? <>
            <StageButton onClick={take.playTake} aria-pressed={take.playing === "take"}>▶ 自分</StageButton>
            <StageButton onClick={take.playOverlay} aria-pressed={take.playing === "overlay"}>▶ 重ねて</StageButton>
            <StageButton onClick={take.keep} disabled={kept}>{kept ? "残しました" : "録音を残す"}</StageButton>
          </> : null}
          <span className="bp-actions-gap" aria-hidden="true" />
          {answer === "take" ? <StageButton keyHint="R" onClick={record}>● 録り直す</StageButton> : null}
          <StageButton tone="primary" keyHint="N" disabled={!rating || saving} onClick={() => void nextRhythm()} data-testid="rhythm-next">次のリズム</StageButton>
        </div>
        {error ? <p className="bp-note-line" role="alert">{error}</p> : null}
      </StageFrame>
    );
  }

  const listensLeft = Math.max(0, LISTEN_LIMIT - listenCount);
  return (
    <StageFrame step={0} keys="Space 聴く · H ヒント · R 録って弾く" testId="rhythm-echo-view" state={status}>
      {tools}{take.recorder}
      <p className="bp-meta">{meta}</p>
      <p className="bp-say">聴いて、同じリズムを弾きます</p>
      <StageLane lengthBeats={phraseBeats} beatsPerBar={beatsPerBar} rows={[{ label: "お手本", notes: hiddenNotes }]} {...(status === "listening" && playhead !== undefined ? { playhead } : {})} />
      <div className="bp-playrow">
        <span style={{ width: 96 }} aria-hidden="true" />
        <StagePlayButton playing={status === "listening"} label={status === "listening" ? "止める" : "お手本を聴く"} disabled={status !== "listening" && listensLeft === 0} onClick={() => void listen()} data-testid="rhythm-listen" />
        <span className="bp-note-line" style={{ width: 120 }}>{listensLeft > 0 ? `あと ${listensLeft} 回聴ける` : "もう聴けません"}</span>
      </div>
      <StageHints chips={chips} open={chipsOpen} disabled={!heard} onOpen={openHint} />
      <div className="bp-actions">
        <StageButton disabled={!heard} onClick={playWithoutTake}>録らずに弾く</StageButton>
        <StageButton tone="primary" keyHint="R" disabled={!heard} onClick={record} data-testid="rhythm-record">● 録って弾く</StageButton>
      </div>
      {!heard && status !== "listening" ? <p className="bp-note-line">まず ▶ でお手本を聴きます（{LISTEN_LIMIT} 回まで）。音の高さは何でもかまいません</p> : null}
      {error ? <p className="bp-note-line" role="alert">{error}</p> : null}
    </StageFrame>
  );
}
