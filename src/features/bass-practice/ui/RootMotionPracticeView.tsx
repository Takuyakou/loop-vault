import { Select } from "../../../components/ui/controls";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Chip, Popover } from "../../../components/ui";
import { previewMidiNotes, stopPreview, type PreviewEndReason } from "../../../audio/chordPreview";
import {
  ROOT_MOTION_GENERATOR_VERSION,
  ROOT_MOTION_MAX_ATTEMPTS,
  STANDARD_BASS_TUNINGS,
  createRootMotionHistoryEntry,
  createVaultRootMotionExercise,
  deriveRootMotionTransfer,
  generateRootMotionExercise,
  rootMotionPhraseLengthBeats,
  type PracticeSettings,
  type RootMotionCategory,
  type RootMotionDirection,
  type RootMotionExercise,
  type RootMotionHistoryEntry,
  type RootMotionLevel,
  type RootMotionNoteCount,
  type VaultChordContextSnapshot,
} from "../domain";
import { RootMotionPracticeSession, type RootMotionIdentifyAnswer } from "../application/rootMotionSession";
import { noteName } from "../midi/noteName";
import { useEchoActive } from "./EchoPracticeFrame";
import {
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
  type StageRating,
  type StageStep,
} from "../stage/Stage";
import { suggestedRating, takeNotes, useJudgedTake } from "../stage/useJudgedTake";

const DIRECTIONS: readonly RootMotionDirection[] = ["same", "up", "down"];
const CATEGORIES: readonly RootMotionCategory[] = ["same", "second", "third", "fourth", "tritone", "fifth"];
const NOTE_COUNTS: readonly RootMotionNoteCount[] = [2, 3, 4, 5, 6, 7, 8];
const DIRECTION_LABELS: Readonly<Record<RootMotionDirection, string>> = { same: "同じ", up: "上がる", down: "下がる" };
const CATEGORY_LABELS: Readonly<Record<RootMotionCategory, string>> = { same: "同じ音", second: "2度", third: "3度", fourth: "4度", tritone: "増4度", fifth: "5度" };
const LEVEL_LABELS: Readonly<Record<RootMotionLevel, string>> = { 1: "方向", 2: "音程の種類", 3: "半音の数", 4: "指板の形", 5: "別の音から" };

export type RootMotionPlayback = (notes: Parameters<typeof previewMidiNotes>[0], bpm: number, callbacks: { onEnded: (reason: PreviewEndReason) => void }) => Promise<void>;

export interface RootMotionPracticeViewProps {
  readonly playback?: RootMotionPlayback;
  readonly initialSettings?: PracticeSettings;
  readonly onHistoryRecorded?: (entry: RootMotionHistoryEntry) => Promise<void>;
  /** Persists only the requested chain length in additive Practice settings. */
  readonly onNoteCountChange?: (noteCount: RootMotionNoteCount) => Promise<void>;
  /** Safe, title-free snapshots supplied by the existing Vault picker boundary. */
  readonly vaultSnapshots?: readonly VaultChordContextSnapshot[];
}

/**
 * P23-62: ルートの動き on the shared stage. 1 聴く (listen, then answer how the first move went — the answer is
 * checked at once) → 2 弾く (count-in, record) → 3 結果 (the roots judged by pitch class and timing).
 */
export function RootMotionPracticeView({ playback, initialSettings, onHistoryRecorded, onNoteCountChange, vaultSnapshots = [] }: RootMotionPracticeViewProps) {
  const [level, setLevel] = useState<RootMotionLevel>(1);
  const configuredNoteCount = initialSettings?.rootMotionNoteCount ?? 2;
  const [noteCount, setNoteCount] = useState<RootMotionNoteCount>(configuredNoteCount);
  const [round, setRound] = useState(1);
  const [sourceKind, setSourceKind] = useState<"generated" | "vault-root-path">("generated");
  const [selectedVaultSignature, setSelectedVaultSignature] = useState<string>();
  const [transfer, setTransfer] = useState<RootMotionExercise>();
  const [transferOfExerciseId, setTransferOfExerciseId] = useState<string>();
  const [retainedTakeReference, setRetainedTakeReference] = useState<string>();
  const [selectedDirection, setSelectedDirection] = useState<RootMotionDirection>();
  const [selectedCategory, setSelectedCategory] = useState<RootMotionCategory>();
  const [selectedSemitones, setSelectedSemitones] = useState<number>();
  const [message, setMessage] = useState<string>();
  const [selfPlaying, setSelfPlaying] = useState(false);
  const [answer, setAnswer] = useState<"take" | "self">();
  const [rating, setRating] = useState<StageRating>();
  const savedHistoryIds = useRef(new Set<string>());
  const [, forceRender] = useReducer((value: number) => value + 1, 0);
  // Parent persistence publishes a fresh settings object. Keep semantically equal
  // settings stable so History saves never reset an active Root Motion session.
  const stringCount = initialSettings?.stringCount ?? 4;
  const handedness = initialSettings?.handedness ?? "right";
  const fretMin = initialSettings?.fretRange.min ?? 0;
  const fretMax = initialSettings?.fretRange.max ?? 12;
  const settings = useMemo(() => ({ stringCount, handedness, fretRange: { min: fretMin, max: fretMax } }), [fretMax, fretMin, handedness, stringCount]);
  const generated = useMemo(() => generateRootMotionExercise({
    generatorVersion: ROOT_MOTION_GENERATOR_VERSION,
    seed: `root-motion-ui-${level}-${noteCount}-${round}-${settings.stringCount}-${settings.handedness}-${settings.fretRange.min}-${settings.fretRange.max}`,
    level,
    noteCount,
    phraseLengthBeats: rootMotionPhraseLengthBeats(noteCount),
    tempo: 96,
    tuning: STANDARD_BASS_TUNINGS[settings.stringCount],
    stringCount: settings.stringCount,
    fretRange: settings.fretRange,
    pitchSpan: { minMidi: 28, maxMidi: 55 },
    handedness: settings.handedness,
    maxAttempts: ROOT_MOTION_MAX_ATTEMPTS,
  }), [level, noteCount, round, settings]);
  const selectedVaultSnapshot = useMemo(() => vaultSnapshots.find((snapshot) => snapshot.signature === selectedVaultSignature) ?? vaultSnapshots[0], [selectedVaultSignature, vaultSnapshots]);
  const vaultGenerated = useMemo(() => selectedVaultSnapshot ? createVaultRootMotionExercise({
    snapshot: selectedVaultSnapshot,
    noteCount,
    level,
    tuning: STANDARD_BASS_TUNINGS[settings.stringCount],
    stringCount: settings.stringCount,
    fretRange: settings.fretRange,
    pitchSpan: { minMidi: 28, maxMidi: 55 },
    handedness: settings.handedness,
  }) : undefined, [level, noteCount, selectedVaultSnapshot, settings]);
  const baseExercise = sourceKind === "vault-root-path"
    ? vaultGenerated?.ok ? vaultGenerated.exercise : undefined
    : generated.ok ? generated.exercise : undefined;
  const exercise = transfer ?? baseExercise;
  const session = useMemo(() => exercise ? new RootMotionPracticeSession(exercise) : undefined, [exercise]);
  const snapshot = session?.getSnapshot();

  const target = useMemo(() => (exercise?.targetEvents ?? []).map((event) => ({ pitch: event.midiNote, startBeat: event.startBeat, durationBeats: event.durationBeats, velocity: event.velocity })), [exercise]);
  const phraseBeats = Math.max(1, ...target.map((note) => note.startBeat + note.durationBeats));
  const take = useJudgedTake({
    mode: "root-motion",
    resetKey: `root-motion:${exercise?.id ?? "none"}`,
    practiceSessionId: `root-motion:${exercise?.id ?? "none"}`,
    target,
    bpm: exercise?.tempo ?? 96,
    lengthBeats: phraseBeats + 1,
    beatsPerBar: 4,
    pitchRule: "octave",
    onTakeKept: setRetainedTakeReference,
  });

  // A source, level, or transfer change replaces the exercise; release its preview before the replacement is usable.
  useEffect(() => () => stopPreview(), [exercise?.id]);
  useEffect(() => {
    if (!vaultSnapshots.length) { if (sourceKind === "vault-root-path") setSourceKind("generated"); return; }
    if (!selectedVaultSignature || !vaultSnapshots.some((candidate) => candidate.signature === selectedVaultSignature)) setSelectedVaultSignature(vaultSnapshots[0]!.signature);
  }, [selectedVaultSignature, sourceKind, vaultSnapshots]);
  useEffect(() => { setTransfer(undefined); setTransferOfExerciseId(undefined); }, [baseExercise?.id]);
  useEffect(() => {
    setSelectedDirection(undefined); setSelectedCategory(undefined); setSelectedSemitones(undefined);
    setRetainedTakeReference(undefined); setMessage(undefined); setSelfPlaying(false); setAnswer(undefined); setRating(undefined);
  }, [exercise?.id]);
  useEffect(() => { setNoteCount(configuredNoteCount); }, [configuredNoteCount]);

  const mutate = useCallback((operation: () => { readonly ok: boolean; readonly message?: string }) => {
    const result = operation();
    setMessage(result.ok ? undefined : result.message);
    forceRender();
    return result.ok;
  }, []);

  const listening = snapshot?.status === "listening";
  const listen = useCallback(() => {
    if (!session || !exercise) return;
    if (session.getSnapshot().status === "listening") { stopPreview(); mutate(() => session.cancelListen()); return; }
    if (!mutate(() => session.startListen())) return;
    const notes = exercise.targetEvents.map((event) => ({ pitch: event.midiNote, startBeat: event.startBeat, durationBeats: event.durationBeats, velocity: event.velocity }));
    const play = playback ?? ((targetNotes, bpm, callbacks) => previewMidiNotes(targetNotes, bpm, "freepats-finger-bass", { onEnded: callbacks.onEnded }));
    void play(notes, exercise.tempo, { onEnded: (reason) => { if (reason === "completed") mutate(() => session.completeListen()); } }).catch((error: unknown) => {
      mutate(() => session.cancelListen());
      setMessage(error instanceof Error ? error.message : "再生を開始できませんでした。");
    });
  }, [exercise, mutate, playback, session]);

  /** The moves the stage passes through when the playing ends: 歌う → 弾く → 答え. */
  const finishPlaying = useCallback(() => {
    if (!session) return;
    if (session.getSnapshot().status === "sing") mutate(() => session.continueToPlay());
    if (session.getSnapshot().status === "play") mutate(() => session.completePlay());
  }, [mutate, session]);

  useEffect(() => {
    if (take.phase !== "done" || !take.result) return;
    finishPlaying();
    setAnswer("take");
    setRating(suggestedRating(take.result.counts.correct, take.result.counts.total, snapshot?.hintLevel ?? 0));
    // The hint level is read at the moment the take ends, on purpose.
  }, [take.phase, take.result]);

  const saveHistory = useCallback((value: StageRating) => {
    if (!exercise || !session || !onHistoryRecorded) return;
    const firstAnswer = session.getSnapshot().firstAnswer;
    if (!firstAnswer) return;
    const entry = createRootMotionHistoryEntry({ completedAt: new Date().toISOString(), exercise, firstAnswer, selfRating: value, transferOfExerciseId, retainedTakeReference });
    if (savedHistoryIds.current.has(entry.id)) return;
    savedHistoryIds.current.add(entry.id);
    void onHistoryRecorded(entry).catch((error: unknown) => {
      savedHistoryIds.current.delete(entry.id);
      setMessage(error instanceof Error ? error.message : "練習の記録を保存できませんでした。");
    });
  }, [exercise, onHistoryRecorded, retainedTakeReference, session, transferOfExerciseId]);

  const beginNewExercise = useCallback(() => {
    stopPreview(); take.reset();
    setTransfer(undefined); setTransferOfExerciseId(undefined);
    setRound((value) => value + 1);
  }, [take]);
  const chooseNoteCount = (nextNoteCount: RootMotionNoteCount) => {
    if (nextNoteCount === noteCount) return;
    beginNewExercise();
    setNoteCount(nextNoteCount);
    if (onNoteCountChange) void onNoteCountChange(nextNoteCount).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : "練習の設定を保存できませんでした。");
    });
  };

  const commit = useCallback((then: "next" | "transfer") => {
    if (!session || !exercise || !rating) return;
    take.stopPlayback();
    if (!mutate(() => session.rate(rating))) return;
    saveHistory(rating);
    if (then === "transfer") {
      const result = deriveRootMotionTransfer(exercise);
      if (result.ok) { setTransferOfExerciseId(exercise.id); setTransfer(result.exercise); return; }
      setMessage("別の音から始める問題を作れませんでした。次の動きへ進みます。");
    }
    beginNewExercise();
  }, [beginNewExercise, exercise, mutate, rating, saveHistory, session, take]);

  const status = snapshot?.status;
  const identified = status === "sing" || status === "play" || (status === "listening" && Boolean(snapshot?.firstAnswer));
  const takeRunning = take.phase === "preparing" || take.phase === "counting" || take.phase === "recording" || take.phase === "analyzing";
  const step: StageStep = answer ? 2 : takeRunning || selfPlaying || take.phase === "failed" ? 1 : 0;
  const record = useCallback(() => { if ((!identified && !answer) || takeRunning) return; setSelfPlaying(false); setAnswer(undefined); take.start(); }, [answer, identified, take, takeRunning]);
  const playWithoutTake = useCallback(() => { if (!identified || takeRunning) return; take.reset(); setSelfPlaying(true); }, [identified, take, takeRunning]);
  const showAnswer = useCallback(() => { setSelfPlaying(false); take.reset(); finishPlaying(); setAnswer("self"); setRating(undefined); }, [finishPlaying, take]);
  const canHint = (status === "identify" || status === "sing" || status === "play") && (snapshot?.hintLevel ?? 0) < 4;
  const openHint = useCallback(() => { if (session && canHint) mutate(() => session.nextHint()); }, [canHint, mutate, session]);
  const submit = useCallback(() => {
    if (!session) return;
    const value: RootMotionIdentifyAnswer = { direction: selectedDirection, category: selectedCategory, semitones: selectedSemitones };
    mutate(() => session.submitIdentify(value));
  }, [mutate, selectedCategory, selectedDirection, selectedSemitones, session]);

  const active = useEchoActive();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!active || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      let handled = true;
      if (key === "escape") { if (takeRunning) take.stop(); else { take.stopPlayback(); if (listening) listen(); } }
      else if (takeRunning) handled = false;
      else if (key === " ") { if (selfPlaying) showAnswer(); else if (step === 0) listen(); else if (step === 2) take.playTarget(); else handled = false; }
      else if (key === "h" && step === 0) openHint();
      else if (key === "r" && (step === 0 || answer === "take")) record();
      else if (key === "n" && step === 2) commit("next");
      else if (["1", "2", "3", "4"].includes(key) && step === 2) setRating(STAGE_RATINGS[Number(key) - 1]);
      else handled = false;
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, answer, commit, listen, listening, openHint, record, selfPlaying, showAnswer, step, take, takeRunning]);

  const selectedVaultRootCount = selectedVaultSnapshot?.section.chords.length ?? 0;
  const tools = (
    <StageTools>
      <Popover label="ルートの動きの条件" trigger={(props) => <Chip {...props} data-testid="root-motion-conditions">{sourceKind === "vault-root-path" ? "Vault の進行" : "おまかせ"} · {LEVEL_LABELS[level]} · {noteCount} 音</Chip>}>
        <div className="bp-tools-panel">
          <label>ルートの出どころ
            <Select id="root-motion-source" data-testid="root-motion-source" aria-label="ルートの出どころ" value={sourceKind} disabled={takeRunning} onChange={(event) => { setSourceKind(event.target.value as "generated" | "vault-root-path"); beginNewExercise(); }}>
              <option value="generated">おまかせ（作る）</option>
              <option value="vault-root-path" disabled={!selectedVaultSnapshot}>Vault の進行のルート</option>
            </Select>
          </label>
          {sourceKind === "vault-root-path" && vaultSnapshots.length > 1 ? <label>進行
            <Select id="root-motion-vault-section" aria-label="Vault の進行" value={selectedVaultSnapshot?.signature ?? ""} disabled={takeRunning} onChange={(event) => { setSelectedVaultSignature(event.target.value); beginNewExercise(); }}>
              {vaultSnapshots.map((candidate) => <option key={candidate.signature} value={candidate.signature}>{candidate.source.safeLabel}</option>)}
            </Select>
          </label> : null}
          <label>答えること
            <Select id="root-motion-level" aria-label="ルートの動きのレベル" value={level} disabled={takeRunning} onChange={(event) => { setLevel(Number(event.target.value) as RootMotionLevel); beginNewExercise(); }}>
              {([1, 2, 3, 4, 5] as const).map((value) => <option key={value} value={value}>{value} · {LEVEL_LABELS[value]}</option>)}
            </Select>
          </label>
          <label>音の数
            <Select id="root-motion-note-count" data-testid="root-motion-note-count" aria-label="ルートの音の数" value={noteCount} disabled={takeRunning} onChange={(event) => chooseNoteCount(Number(event.target.value) as RootMotionNoteCount)}>
              {NOTE_COUNTS.map((candidate) => <option key={candidate} value={candidate} disabled={sourceKind === "vault-root-path" && candidate > selectedVaultRootCount}>{`${candidate} 音・${rootMotionPhraseLengthBeats(candidate)} 拍`}</option>)}
            </Select>
          </label>
          {sourceKind === "vault-root-path" ? <p>Vault の進行のルートを使います。元のベースラインではありません。</p> : null}
        </div>
      </Popover>
    </StageTools>
  );

  if (!exercise || !session || !snapshot) {
    return (
      <StageFrame step={0} testId="root-motion-echo-view">
        {tools}
        <p className="bp-say">この条件では問題を作れませんでした</p>
        <p className="bp-sub" role="alert">{sourceKind === "vault-root-path" ? (vaultGenerated?.ok === false ? vaultGenerated.error.message : "Vault から作れるルートの流れを選んでください。") : (generated.ok ? "練習を始められません。" : generated.error.message)}</p>
      </StageFrame>
    );
  }

  const names = exercise.targetEvents.map((event) => noteName(event.midiNote));
  const meta = `${exercise.tempo} BPM · ${exercise.targetEvents.length} 音`;
  const hint = snapshot.hintLevel;
  const firstMotion = exercise.motions[0];
  const hiddenNotes: LaneNote[] = exercise.targetEvents.map((event, index) => ({
    startBeat: event.startBeat, durationBeats: event.durationBeats, kind: "hide",
    text: hint >= 4 ? names[index] : index === 0 ? "1" : "?",
    label: hint >= 4 ? `${index + 1} 音目 ${names[index]}` : `${index + 1} 音目`,
  }));
  const refNotes: LaneNote[] = exercise.targetEvents.map((event, index) => ({
    startBeat: event.startBeat, durationBeats: event.durationBeats, kind: "ref", text: names[index], label: `お手本 ${index + 1} 音目 ${names[index]}`,
  }));
  const chips = firstMotion ? [
    { id: "direction", label: "方向", openLabel: `方向 ${DIRECTION_LABELS[firstMotion.direction]}` },
    { id: "category", label: "音程の種類", openLabel: CATEGORY_LABELS[firstMotion.category] },
    { id: "semitones", label: "半音の数", openLabel: `半音 ${firstMotion.semitones}` },
    { id: "fretboard", label: "音名と指板" },
  ] : [];
  const dots = exercise.targetEvents.map((event, index) => ({ midiNote: event.midiNote, label: names[index]!.replace(/\d+$/, "") }));
  const fretboard = <StageFretboard dots={dots} stringCount={settings.stringCount} fretRange={settings.fretRange} handedness={settings.handedness} />;
  const first = snapshot.firstAnswer;
  const transferBanner = transfer ? <p className="bp-banner">別の音から：同じ動きを {names[0]} から</p> : null;

  if (step === 1) {
    return (
      <StageFrame step={1} keys={takeRunning ? "Esc 止める" : selfPlaying ? "Space 答えを見る" : "R もう一度録る"} testId="root-motion-echo-view" state={status}>
        {tools}{take.recorder}
        <p className="bp-meta">{meta}</p>
        {take.phase === "counting" ? <StageCount beats={4} current={take.count} /> : null}
        <p className="bp-say">{take.phase === "analyzing" ? "判定しています…" : take.phase === "failed" ? "うまく録れませんでした" : selfPlaying ? "ベースで弾いてください" : take.phase === "recording" ? "クリックに合わせて弾いてください" : "カウントのあとに弾き始めます"}</p>
        {selfPlaying ? <p className="bp-sub">録音はしません。弾き終えたら答えを見て、自分で評価します。</p> : null}
        <StageLane lengthBeats={phraseBeats} beatsPerBar={4} rows={selfPlaying ? [{ label: "お手本", notes: hiddenNotes }] : [{ label: "お手本", notes: hiddenNotes }, { label: "自分", notes: [] }]} {...(take.phase === "recording" && take.beat !== undefined ? { playhead: take.beat } : {})} />
        {take.phase === "failed" ? <p className="bp-note-line" role="alert">{take.error}</p> : null}
        {take.phase === "recording" ? <p className="bp-note-line"><StageMeter level={take.inputLevel} />{take.inputLevel > 0.004 ? "入力に音が届いています" : "入力に音が来ていません。機器とチャンネルを確かめてください"} · オクターブ違いは合いにします</p> : null}
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
    const facts: ResultFact[] = [
      ...(counts ? [
        { text: `合った ${counts.correct}`, tone: "ok" as const },
        { text: `音が違う ${counts.wrongPitch}`, tone: "ng" as const },
        { text: `早い・遅い ${counts.timing}`, tone: "warn" as const },
        ...(counts.missed ? [{ text: `抜け ${counts.missed}`, tone: "mute" as const }] : []),
      ] : [{ text: "録音なし・自分で評価" }]),
      ...(first ? [{ text: `最初の答え ${first.directionCorrect && (level < 2 || first.categoryCorrect) && (level < 3 || first.exactIntervalCorrect) ? "◯" : "✕"}` }] : []),
      { text: hint ? `ヒント ${hint} 段` : "ヒントなし" },
    ];
    const good = Boolean(counts && counts.total && counts.correct / counts.total >= 0.75);
    const kept = take.recorderStatus === "saved";
    return (
      <StageFrame step={2} keys="Space お手本 · R 録り直す · 1–4 評価 · N 次の動き" tone={good ? "good" : undefined} testId="root-motion-echo-view" state={status}>
        {tools}{take.recorder}
        {transferBanner}
        {counts ? <StageResultHead big={`${counts.correct} / ${counts.total}`} label="ルートが合いました" facts={facts} /> : <StageResultHead big="答え" label="お手本と比べて、自分で評価してください" facts={facts} />}
        <StageLane lengthBeats={phraseBeats} beatsPerBar={4} rows={result ? [{ label: "お手本", notes: refNotes }, { label: "自分", notes: takeNotes(result, exercise.tempo, phraseBeats + 1, exercise.targetEvents) }] : [{ label: "お手本", notes: refNotes }]} {...(take.beat !== undefined && take.playing ? { playhead: take.beat } : {})} />
        {fretboard}
        <StageRatingChoice value={rating} onChange={setRating} prompt={result ? "評価（判定は目安。変えられます）" : "評価"} />
        <div className="bp-actions">
          <StageButton onClick={take.playTarget} aria-pressed={take.playing === "target"}>▶ お手本</StageButton>
          {result ? <>
            <StageButton onClick={take.playTake} aria-pressed={take.playing === "take"}>▶ 自分</StageButton>
            <StageButton onClick={take.playOverlay} aria-pressed={take.playing === "overlay"}>▶ 重ねて</StageButton>
            <StageButton onClick={take.keep} disabled={kept}>{kept ? "残しました" : "録音を残す"}</StageButton>
          </> : null}
          <span className="bp-actions-gap" aria-hidden="true" />
          {!transfer ? <StageButton disabled={!rating} onClick={() => commit("transfer")} data-testid="root-motion-transfer">別の音から</StageButton> : null}
          {answer === "take" ? <StageButton keyHint="R" onClick={record}>● 録り直す</StageButton> : null}
          <StageButton tone="primary" keyHint="N" disabled={!rating} onClick={() => commit("next")} data-testid="root-motion-next">次の動き</StageButton>
        </div>
        {message ? <p className="bp-note-line" role="alert">{message}</p> : null}
      </StageFrame>
    );
  }

  // ── 1 聴く: listen, then answer how the first move went ──
  const needsCategory = level >= 2;
  const needsSemitones = level >= 3;
  const ready = Boolean(selectedDirection && (!needsCategory || selectedCategory) && (!needsSemitones || selectedSemitones !== undefined));
  return (
    <StageFrame step={0} keys="Space 聴く · H ヒント · R 録って弾く" testId="root-motion-echo-view" state={status}>
      {tools}{take.recorder}
      <p className="bp-meta">{meta}</p>
      {transferBanner}
      <p className="bp-say">{status === "identify" ? "1 つめから 2 つめへ、ルートはどう動きましたか？" : identified ? "同じルートの流れを弾きます" : "聴いて、ルートの動きを見分けます"}</p>
      <StageLane lengthBeats={phraseBeats} beatsPerBar={4} rows={[{ label: "お手本", notes: hiddenNotes }]} />
      <div className="bp-playrow">
        <span style={{ width: 96 }} aria-hidden="true" />
        <StagePlayButton playing={listening} label={listening ? "止める" : "お手本を聴く"} disabled={status !== "ready" && status !== "identify" && status !== "sing" && !listening} onClick={listen} data-testid="root-motion-listen" />
        <span className="bp-note-line" style={{ width: 120 }}>{snapshot.listenCount ? `${snapshot.listenCount} 回聴いた` : "何度でも聴けます"}</span>
      </div>
      {status === "identify" ? (
        <div className="bp-hints" role="group" aria-label="答え">
          <AnswerChoice label="方向" values={DIRECTIONS} selected={selectedDirection} onSelect={setSelectedDirection} labelFor={(value) => DIRECTION_LABELS[value]} />
          {needsCategory ? <AnswerChoice label="種類" values={CATEGORIES} selected={selectedCategory} onSelect={setSelectedCategory} labelFor={(value) => CATEGORY_LABELS[value]} /> : null}
          {needsSemitones ? <AnswerChoice label="半音" values={[0, 1, 2, 3, 4, 5, 6, 7]} selected={selectedSemitones} onSelect={setSelectedSemitones} labelFor={String} /> : null}
          <StageButton tone="primary" disabled={!ready} onClick={submit} data-testid="root-motion-submit">答える</StageButton>
        </div>
      ) : null}
      {first ? (
        <p className="bp-note-line" data-testid="root-motion-first-answer">
          答え：{DIRECTION_LABELS[first.expected.direction]}・{CATEGORY_LABELS[first.expected.category]}・半音 {first.expected.semitones} ／ あなた：{first.directionCorrect ? "方向 ◯" : "方向 ✕"}{needsCategory ? (first.categoryCorrect ? "・種類 ◯" : "・種類 ✕") : ""}{needsSemitones ? (first.exactIntervalCorrect ? "・半音 ◯" : "・半音 ✕") : ""}
        </p>
      ) : null}
      {chips.length ? <StageHints chips={chips} open={hint} disabled={!canHint} onOpen={openHint} /> : null}
      {hint >= 4 ? fretboard : null}
      <div className="bp-actions">
        <StageButton disabled={!identified || listening} onClick={playWithoutTake}>録らずに弾く</StageButton>
        <StageButton tone="primary" keyHint="R" disabled={!identified || listening} onClick={record} data-testid="root-motion-record">● 録って弾く</StageButton>
      </div>
      {status === "ready" ? <p className="bp-note-line">まず ▶ で聴いて、最初の動きを答えます</p> : null}
      {message ? <p className="bp-note-line" role="alert">{message}</p> : null}
    </StageFrame>
  );
}

function AnswerChoice<T extends string | number>({ label, values, selected, onSelect, labelFor }: { readonly label: string; readonly values: readonly T[]; readonly selected?: T; readonly onSelect: (value: T) => void; readonly labelFor: (value: T) => string }) {
  return (
    <span className="bp-rating" role="group" aria-label={label}>
      <span>{label}</span>
      <span className="bp-rating-seg">
        {values.map((value) => <button key={String(value)} type="button" aria-pressed={selected === value} onClick={() => onSelect(value)}>{labelFor(value)}</button>)}
      </span>
    </span>
  );
}
