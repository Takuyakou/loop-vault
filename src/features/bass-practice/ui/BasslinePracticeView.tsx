import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ear, Lightbulb, Square } from "lucide-react";
import type { AppLanguage } from "../../../i18n";
import { stopPreview, previewMidiNotes } from "../../../audio/chordPreview";
import { Button, Surface } from "../../../components/ui";
import {
  BASSLINE_GENERATOR_VERSION,
  buildGeneratedChordContextSnapshot,
  createChordContextHistoryEntry,
  createChordContextVaultBasslineExercise,
  generateBasslineExercise,
  type ChordContextHistoryEntry,
  type ChordContextSnapshot,
  type VaultChordContextSnapshot,
} from "../domain";
import {
  DEFAULT_CHORD_CONTEXT_LISTEN_MODE,
  DEFAULT_CHORD_CONTEXT_PLAY_MODE,
  createChordContextPlaybackEngine,
  type ChordContextPlaybackEngine,
  type ChordContextPlaybackInput,
  type ChordContextListenMode,
  type ChordContextPlayMode,
} from "../application/chordContextPlayback";
import {
  createChordContextToneDriver,
  type PreparedChordContextToneDriver,
} from "../application/chordContextToneDriver";
import { RecordCompareSection } from "../recording/ui/RecordCompareSection";
import { createTargetPlayer } from "../recording/application/playback";

const GENERATED_CONTEXT_CHORDS = [
  { id: "generated:0", root: 2, quality: "min7" as const, tensions: [] as const, label: "Dm7", startBeat: 0, durationBeats: 2 },
  { id: "generated:1", root: 7, quality: "dom7" as const, tensions: [] as const, label: "G7", startBeat: 2, durationBeats: 2 },
  { id: "generated:2", root: 0, quality: "maj7" as const, tensions: [] as const, label: "Cmaj7", startBeat: 4, durationBeats: 4 },
] as const;

type PracticeMode = "listen" | "play";
type ActiveChordContextSession = {
  readonly generation: number;
  readonly driver: PreparedChordContextToneDriver;
  engine?: ChordContextPlaybackEngine;
};
type ChordContextPlaybackActivity = {
  readonly started: boolean;
  readonly metronomeUsed: boolean;
};
const NO_CHORD_CONTEXT_ACTIVITY: ChordContextPlaybackActivity = Object.freeze({ started: false, metronomeUsed: false });

export interface BasslinePracticeViewProps {
  readonly language?: AppLanguage;
  readonly chordContextSnapshot?: ChordContextSnapshot;
  /** Feature-flag rollback preserves the P5.16 Bassline Echo surface. */
  readonly chordContextEnabled?: boolean;
  /** Persists only the factual P5.18 History record in the existing Practice document. */
  readonly onChordContextHistoryRecorded?: (entry: ChordContextHistoryEntry) => Promise<void>;
}

export function BasslinePracticeView({
  language = "en",
  chordContextSnapshot,
  chordContextEnabled = true,
  onChordContextHistoryRecorded,
}: BasslinePracticeViewProps) {
  const ja = language === "ja";
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [hint, setHint] = useState(0);
  const [review, setReview] = useState(false);
  const [legacyPlaying, setLegacyPlaying] = useState(false);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("listen");
  const [listenMode, setListenMode] = useState<ChordContextListenMode>(DEFAULT_CHORD_CONTEXT_LISTEN_MODE);
  const [playMode, setPlayMode] = useState<ChordContextPlayMode>(DEFAULT_CHORD_CONTEXT_PLAY_MODE);
  const [contextPlayback, setContextPlayback] = useState<PracticeMode | undefined>();
  const [preparing, setPreparing] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | undefined>();
  const sessionRef = useRef<ActiveChordContextSession>();
  const generationRef = useRef(0);
  const legacyPreviewGenerationRef = useRef(0);

  const generatedSnapshot = useMemo(
    () => buildGeneratedChordContextSnapshot({ key: "C major", bpm: 96, chords: GENERATED_CONTEXT_CHORDS }),
    [],
  );
  const activeSnapshot = chordContextSnapshot ?? (generatedSnapshot.ok ? generatedSnapshot.snapshot : undefined);
  const [effectiveBpm, setEffectiveBpm] = useState(() => activeSnapshot?.originalBpm ?? 96);
  const [recordPlayMode, setRecordPlayMode] = useState<Extract<ChordContextPlayMode, "chords-only" | "chords-and-metronome">>("chords-only");
  const [recordCompareUsed, setRecordCompareUsed] = useState(false);
  const [metronomeUsed, setMetronomeUsed] = useState(false);
  const [recordingInFlight, setRecordingInFlight] = useState(false);
  const [hasUnkeptRecordingTake, setHasUnkeptRecordingTake] = useState(false);
  const [recordingFacts, setRecordingFacts] = useState<RecordedChordContextFacts>();
  const [retainedTakeReference, setRetainedTakeReference] = useState<string>();
  const [historyStatus, setHistoryStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const historySavingRef = useRef(false);
  const historyEntryIdRef = useRef<string>();
  const historyStatusRef = useRef(historyStatus);
  const basslineRecordSessionIdRef = useRef(newChordContextRecordSessionId());
  useEffect(() => { historyStatusRef.current = historyStatus; }, [historyStatus]);
  const invalidateRecordedFacts = useCallback(() => {
    setRecordCompareUsed(false);
    setMetronomeUsed(false);
    setRecordingFacts(undefined);
    setRetainedTakeReference(undefined);
    setHasUnkeptRecordingTake(false);
    historyEntryIdRef.current = undefined;
    setHistoryStatus("idle");
  }, []);
  const exercise = useMemo(() => isVaultChordContextSnapshot(chordContextSnapshot)
    ? createChordContextVaultBasslineExercise(chordContextSnapshot, level)
    : generateBasslineExercise({
      generatorVersion: BASSLINE_GENERATOR_VERSION,
      seed: `bassline-ui:${level}`,
      source: "generated",
      level,
      tempo: 96,
      meter: { numerator: 4, denominator: 4 },
      key: "C major",
      chords: GENERATED_CONTEXT_CHORDS.map((chord) => ({
        root: chord.root,
        label: chord.label,
        startBeat: chord.startBeat,
        durationBeats: chord.durationBeats,
      })),
    }), [chordContextSnapshot, level]);

  const stopChordContext = useCallback(() => {
    generationRef.current += 1;
    const session = sessionRef.current;
    sessionRef.current = undefined;
    try { session?.engine?.stop(); } catch { /* A stopped graph must not strand UI state. */ }
    try { session?.engine?.dispose(); } catch { /* Driver cleanup is best effort after stop. */ }
    try { session?.driver.dispose(); } catch { /* No browser audio exception may escape navigation. */ }
    setContextPlayback(undefined);
    setPreparing(false);
  }, []);

  useEffect(() => () => {
    legacyPreviewGenerationRef.current += 1;
    stopChordContext();
    stopPreview();
  }, [stopChordContext]);
  useEffect(() => {
    stopChordContext();
    stopPreview();
    setLegacyPlaying(false);
    setEffectiveBpm(activeSnapshot?.originalBpm ?? 96);
    setRecordingInFlight(false);
    invalidateRecordedFacts();
  }, [activeSnapshot?.originalBpm, chordContextSnapshot?.signature, invalidateRecordedFacts, stopChordContext]);

  const prepareChordContext = useCallback(async (): Promise<boolean> => {
    if (!activeSnapshot || !exercise.ok) return false;
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    stopChordContext();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const driver = createChordContextToneDriver();
    sessionRef.current = { generation, driver };
    setPlaybackError(undefined);
    setPreparing(true);
    try {
      await driver.prepare();
      if (generationRef.current !== generation || sessionRef.current?.generation !== generation) {
        driver.dispose();
        return false;
      }
      return true;
    } catch (error) {
      if (generationRef.current === generation) {
        setPlaybackError(error instanceof Error ? error.message : "Chord Context audio could not prepare.");
        sessionRef.current = undefined;
      }
      driver.dispose();
      return false;
    } finally {
      if (generationRef.current === generation) setPreparing(false);
    }
  }, [activeSnapshot, exercise, stopChordContext]);

  const schedulePreparedChordContext = useCallback((options: { readonly practiceMode?: PracticeMode; readonly listenMode?: ChordContextListenMode; readonly playMode?: ChordContextPlayMode } = {}): ChordContextPlaybackActivity => {
    if (!activeSnapshot || !exercise.ok) return NO_CHORD_CONTEXT_ACTIVITY;
    const session = sessionRef.current;
    if (!session) return NO_CHORD_CONTEXT_ACTIVITY;
    const generation = session.generation;
    const selectedPracticeMode = options.practiceMode ?? practiceMode;
    const selectedListenMode = options.listenMode ?? listenMode;
    const selectedPlayMode = options.playMode ?? playMode;
    const engine = createChordContextPlaybackEngine(session.driver, {
      onError(error) {
        if (generationRef.current === generation) {
          setPlaybackError(error instanceof Error ? error.message : "Chord Context playback stopped unexpectedly.");
        }
      },
      onCompleted() {
        if (sessionRef.current?.generation !== generation) return;
        sessionRef.current = undefined;
        session.driver.dispose();
        setContextPlayback(undefined);
        setPreparing(false);
        setLegacyPlaying(false);
      },
    });
    session.engine = engine;
    const input = toChordContextInput(activeSnapshot, exercise.exercise.targetEvents, effectiveBpm, selectedPracticeMode, selectedListenMode, selectedPlayMode);
    const result = engine.start(input);
    if (!result.ok) {
      setPlaybackError(result.error.message);
      engine.dispose();
      session.driver.dispose();
      if (sessionRef.current?.generation === generation) sessionRef.current = undefined;
      return NO_CHORD_CONTEXT_ACTIVITY;
    }
    const activePlan = engine.getActivePlan();
    if (!activePlan || activePlan.events.length === 0) {
      engine.dispose();
      session.driver.dispose();
      if (sessionRef.current?.generation === generation) sessionRef.current = undefined;
      setContextPlayback(undefined);
      return NO_CHORD_CONTEXT_ACTIVITY;
    }
    const activity = Object.freeze({ started: true, metronomeUsed: activePlan.events.some((event) => event.layer === "metronome") });
    if (sessionRef.current?.generation === generation) {
      setContextPlayback(selectedPracticeMode);
      if (activity.metronomeUsed) setMetronomeUsed(true);
    }
    return activity;
  }, [activeSnapshot, effectiveBpm, exercise, listenMode, playMode, practiceMode]);

  const startChordContext = useCallback(async (options: { readonly practiceMode?: PracticeMode; readonly listenMode?: ChordContextListenMode; readonly playMode?: ChordContextPlayMode } = {}): Promise<ChordContextPlaybackActivity> => {
    const prepared = await prepareChordContext();
    if (!prepared) return NO_CHORD_CONTEXT_ACTIVITY;
    return schedulePreparedChordContext(options);
  }, [prepareChordContext, schedulePreparedChordContext]);
  const choosePracticeMode = (next: PracticeMode): void => {
    if (next === practiceMode) return;
    stopChordContext();
    setPracticeMode(next);
    invalidateRecordedFacts();
  };
  const chooseListenMode = (next: ChordContextListenMode): void => {
    if (next === listenMode) return;
    stopChordContext();
    setListenMode(next);
    invalidateRecordedFacts();
  };
  const choosePlayMode = (next: ChordContextPlayMode): void => {
    if (next === playMode) return;
    stopChordContext();
    setPlayMode(next);
    invalidateRecordedFacts();
  };
  const chooseEffectiveBpm = (next: number): void => {
    const tempo = clampChordContextBpm(next, activeSnapshot?.originalBpm ?? 96);
    if (tempo === effectiveBpm) return;
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    stopChordContext();
    setEffectiveBpm(tempo);
    invalidateRecordedFacts();
  };
  const chooseLevel = (next: 1 | 2 | 3): void => {
    stopChordContext();
    setLevel(next);
    setHint(0);
    setReview(false);
    invalidateRecordedFacts();
  };

  const saveChordContextHistory = useCallback(async () => {
    if (!activeSnapshot || !onChordContextHistoryRecorded || recordingInFlight || hasUnkeptRecordingTake || historySavingRef.current || historyStatusRef.current === "saved") return;
    const facts = recordingFacts ?? { effectiveBpm, listenMode, playMode, metronomeUsed, recordCompareUsed: false };
    const id = historyEntryIdRef.current ?? newChordContextHistoryId();
    historyEntryIdRef.current = id;
    historySavingRef.current = true;
    setHistoryStatus("saving");
    try {
      await onChordContextHistoryRecorded(createChordContextHistoryEntry({
        id,
        completedAt: new Date().toISOString(),
        snapshot: activeSnapshot,
        effectiveBpm: facts.effectiveBpm,
        listenMode: facts.listenMode,
        playMode: facts.playMode,
        metronomeUsed: facts.metronomeUsed,
        recordCompareUsed: facts.recordCompareUsed,
        ...(retainedTakeReference === undefined ? {} : { retainedTakeReference }),
      }));
      setHistoryStatus("saved");
    } catch {
      setHistoryStatus("error");
    } finally {
      historySavingRef.current = false;
    }
  }, [activeSnapshot, effectiveBpm, hasUnkeptRecordingTake, listenMode, metronomeUsed, onChordContextHistoryRecorded, playMode, recordCompareUsed, recordingFacts, recordingInFlight, retainedTakeReference]);

  const legacyListen = () => {
    stopChordContext();
    if (!exercise.ok) return;
    const generation = legacyPreviewGenerationRef.current + 1;
    legacyPreviewGenerationRef.current = generation;
    if (legacyPlaying) { stopPreview(); setLegacyPlaying(false); return; }
    void previewMidiNotes(exercise.exercise.targetEvents.map((event) => ({
      pitch: event.midiNote,
      startBeat: event.startBeat,
      durationBeats: event.durationBeats,
      velocity: event.velocity,
    })), effectiveBpm, "freepats-finger-bass", {
      onStarted: () => { if (legacyPreviewGenerationRef.current === generation) setLegacyPlaying(true); },
      onEnded: () => { if (legacyPreviewGenerationRef.current === generation) setLegacyPlaying(false); },
    });
  };

  if (!exercise.ok) return <p role="alert">{exercise.error.message}</p>;
  const sourceLabel = chordContextSnapshot?.source.kind === "vault"
    ? `${ja ? "Vault進行" : "Vault source"} \u00b7 ${chordContextSnapshot.source.safeLabel}`
    : ja ? "生成進行" : "Generated source";
  const noContextSource = chordContextEnabled && !activeSnapshot;

  return <Surface className="p-4" data-testid="bassline-echo-view">
    <p className="lv-section-kicker">{ja ? "ベース練習" : "Bass Practice"}</p>
    <h2 className="text-2xl font-bold">Bassline Echo</h2>
    <p className="mt-2 text-sm" data-testid="bassline-source">{sourceLabel}{" \u00b7 "}{ja ? "自己評価式" : "self-rated practice only"}{" \u00b7 "}{ja ? "自動採点なし。" : "no automatic score."}</p>
    <label className="mt-3 block">{ja ? "レベル" : "Level"} <select aria-label={ja ? "ベースラインのレベル" : "Bassline level"} disabled={recordingInFlight} value={level} onChange={(event) => chooseLevel(Number(event.target.value) as 1 | 2 | 3)}><option value={1}>{ja ? "1 - ルート" : "1 - Roots"}</option><option value={2}>{ja ? "2 - コードトーン" : "2 - Chord tones"}</option><option value={3}>{ja ? "3 - アプローチ" : "3 - Approach"}</option></select></label>
    <div className="mt-4 rounded border p-3" aria-label={ja ? "ベースラインのコード進行" : "Bassline progression strip"}>{exercise.exercise.chords.map((chord) => <span key={`${chord.startBeat}:${chord.label}`} className="mr-2">{chord.label}</span>)}</div>
    <div className="mt-3 text-sm" data-testid="bassline-notes">{hint >= 4 || review ? <>
      <span className="mr-2 text-xs text-[var(--lv-text-muted)]">{ja ? "お手本の音名" : "Answer notes"}</span>
      {exercise.exercise.targetEvents.map((event) => <span key={event.index} className="mr-2 font-semibold" title={`MIDI ${event.midiNote}`}>{midiNoteName(event.midiNote)}</span>)}
    </> : ja ? "まずお手本を聴いて思い出してください。音名はヒント4またはレビューで表示されます。" : "Listen and recall first. Notes stay hidden until Hint 4 or Review."}</div>

    {chordContextEnabled ? <section className="mt-4 rounded border p-3" aria-labelledby="chord-context-heading" data-testid="chord-context-controls">
      <h3 id="chord-context-heading" className="font-semibold">Chord Context</h3>
      <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">{activeSnapshot?.source.safeLabel ?? (ja ? "Chord Contextの進行を利用できません。" : "Chord Context source unavailable.")}</p>
      <fieldset className="mt-3" data-testid="chord-context-tempo">
        <legend>{ja ? "セッションテンポ" : "Session tempo"}</legend>
        <p className="mt-1 text-xs text-[var(--lv-text-secondary)]">{ja ? "元のテンポ" : "Original"}: {activeSnapshot?.originalBpm ?? 96} BPM. {ja ? "変更はこのセッションだけに適用され、Vaultは変更されません。" : "This override is session-only; the Vault is not changed."}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="chord-context-effective-bpm">BPM</label>
          <input id="chord-context-effective-bpm" data-testid="chord-context-effective-bpm" type="number" min={30} max={240} step={1} value={effectiveBpm} disabled={recordingInFlight} onChange={(event) => chooseEffectiveBpm(event.currentTarget.valueAsNumber)} onBlur={(event) => chooseEffectiveBpm(event.currentTarget.valueAsNumber)} className="lv-input w-24" />
          <Button type="button" variant="ghost" data-testid="chord-context-bpm-plus-four" onClick={() => chooseEffectiveBpm(effectiveBpm + 4)} disabled={recordingInFlight || effectiveBpm >= 240}>+4 BPM</Button>
          <Button type="button" variant="ghost" onClick={() => chooseEffectiveBpm(activeSnapshot?.originalBpm ?? 96)} disabled={recordingInFlight || effectiveBpm === (activeSnapshot?.originalBpm ?? 96)}>{ja ? "元のテンポに戻す" : "Use original"}</Button>
        </div>
      </fieldset>
      <fieldset className="mt-3">
        <legend>{ja ? "練習モード" : "Practice mode"}</legend>
        <div className="flex flex-wrap gap-3">
          <label><input type="radio" name="chord-context-practice-mode" disabled={recordingInFlight} checked={practiceMode === "listen"} onChange={() => choosePracticeMode("listen")} /> {ja ? "聴く" : "Listen"}</label>
          <label><input type="radio" name="chord-context-practice-mode" disabled={recordingInFlight} checked={practiceMode === "play"} onChange={() => choosePracticeMode("play")} /> {ja ? "演奏" : "Play"}</label>
        </div>
      </fieldset>
      {practiceMode === "listen" ? <ContextModeOptions
        legend={ja ? "お手本のレイヤー" : "Listen layers"}
        name="chord-context-listen-mode"
        selected={listenMode}
        onChange={chooseListenMode}
        options={listenModeOptions(language)}
        disabled={recordingInFlight}
      /> : <ContextModeOptions
        legend={ja ? "演奏時の伴奏" : "Play accompaniment"}
        name="chord-context-play-mode"
        selected={playMode}
        onChange={choosePlayMode}
        options={playModeOptions(language)}
        disabled={recordingInFlight}
      />}
      <p className="mt-3 text-sm text-[var(--lv-text-secondary)]">
        {practiceMode === "play" ? ja ? "演奏モードではお手本のベースを自動再生しません。" : "Play never auto-plays the target bass." : ja ? "聴くモードでは選択したレイヤーにだけお手本のベースが含まれます。" : "Listen uses the target bass only in the selected Listen layer."}
      </p>
      {playbackError ? <p role="alert" className="mt-2 text-sm text-[var(--lv-danger)]">{playbackError}</p> : null}
      <p aria-live="polite" className="mt-2 text-sm" data-testid="chord-context-status">
        {preparing ? ja ? "Chord Contextの音を準備しています。" : "Preparing Chord Context audio." : contextPlayback ? ja ? `${contextPlayback === "listen" ? "お手本" : "演奏"}を再生中です。` : `${contextPlayback === "listen" ? "Listen" : "Play"} playback running.` : ja ? "Chord Contextは停止しています。" : "Chord Context stopped."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => { if (contextPlayback || preparing) stopChordContext(); else void startChordContext(); }}
          disabled={noContextSource || recordingInFlight}
          data-testid="chord-context-start-stop"
        >
          {contextPlayback || preparing ? <Square size={15} /> : <Ear size={15} />}
          {contextPlayback || preparing ? ja ? "停止" : "Stop" : practiceMode === "listen" ? ja ? "お手本を再生" : "Start Listen" : ja ? "伴奏を開始" : "Start Play"}
        </Button>
        <Button variant="ghost" onClick={stopChordContext} disabled={recordingInFlight || (!contextPlayback && !preparing)}>{ja ? "停止" : "Stop"}</Button>
      </div>
    </section> : null}

    <div className="mt-4 flex flex-wrap gap-2">
      <Button onClick={legacyListen} disabled={recordingInFlight} data-testid="bassline-listen">{legacyPlaying ? <Square size={15} /> : <Ear size={15} />}{legacyPlaying ? ja ? "停止" : "Stop" : ja ? "お手本を聴く" : "Listen"}</Button>
      <Button variant="ghost" disabled={recordingInFlight} onClick={() => setHint((value) => Math.min(4, value + 1))}><Lightbulb size={15} /> {ja ? "ヒント" : "Hint"} {hint}/4</Button>
      <Button disabled={recordingInFlight} onClick={() => { legacyPreviewGenerationRef.current += 1; stopPreview(); setLegacyPlaying(false); stopChordContext(); setReview(true); }}><Ear size={15} /> {ja ? "レビュー" : "Review"}</Button>
    </div>
    {review ? <section className="mt-4 rounded border p-3" aria-labelledby="record-accompaniment-heading" data-testid="record-accompaniment">
      <h3 id="record-accompaniment-heading" className="font-semibold">{ja ? "録音時の伴奏" : "Recording accompaniment"}</h3>
      <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">{ja ? "録音時の伴奏をコードのみ、またはコードとメトロノームから選べます。スピーカー音の回り込みを減らすためヘッドホンを使用してください。アプリの音は録音へ内部ミックスされません。" : "Choose chords only or chords with metronome for the take. Use headphones to reduce speaker bleed; app audio is never internally mixed into the captured take."}</p>
      <fieldset className="mt-3">
        <legend>{ja ? "録音中の伴奏" : "Accompaniment while recording"}</legend>
        <label className="mr-3"><input type="radio" name="record-accompaniment" disabled={recordingInFlight} checked={recordPlayMode === "chords-only"} onChange={() => { setRecordPlayMode("chords-only"); invalidateRecordedFacts(); }} /> {ja ? "コードのみ" : "Chords only"}</label>
        <label><input type="radio" name="record-accompaniment" disabled={recordingInFlight} checked={recordPlayMode === "chords-and-metronome"} onChange={() => { setRecordPlayMode("chords-and-metronome"); invalidateRecordedFacts(); }} /> {ja ? "コード + メトロノーム" : "Chords + Metronome"}</label>
      </fieldset>
    </section> : null}
    {review ? <RecordCompareSection
      mode="bassline"
      resetKey={"bassline:" + (chordContextSnapshot?.signature ?? "generated") + ":" + level + ":" + effectiveBpm + ":" + listenMode + ":" + playMode + ":" + recordPlayMode}
      practiceSessionId={basslineRecordSessionIdRef.current}
      countInMs={Math.round((4 * 60_000) / effectiveBpm)}
      onPlaybackStart={stopChordContext}
      onRecordingActivityChange={setRecordingInFlight}
      onUnkeptTakeChange={setHasUnkeptRecordingTake}
      onRecordingPrepare={prepareChordContext}
      onRecordingStart={() => {
        const activity = schedulePreparedChordContext({ practiceMode: "play", playMode: recordPlayMode });
        const facts: RecordedChordContextFacts = {
          effectiveBpm,
          listenMode,
          playMode: recordPlayMode,
          metronomeUsed: activity.metronomeUsed,
          recordCompareUsed: true,
        };
        setRecordingFacts(facts);
        setRecordCompareUsed(true);
        if (activity.metronomeUsed) setMetronomeUsed(true);
        setRetainedTakeReference(undefined);
        historyEntryIdRef.current = undefined;
        setHistoryStatus("idle");
        return activity.started;
      }}
      onRecordingStop={stopChordContext}
      onTakeKept={(id) => {
        setRetainedTakeReference(id);
        if (historyStatusRef.current !== "saved") setHistoryStatus("idle");
      }}
      targetPlayer={createTargetPlayer(
        (onEnded) => void previewMidiNotes(
          exercise.exercise.targetEvents.map((event) => ({
            pitch: event.midiNote,
            startBeat: event.startBeat,
            durationBeats: event.durationBeats,
            velocity: event.velocity,
          })),
          effectiveBpm,
          "freepats-finger-bass",
          { onEnded },
        ),
        stopPreview,
      )}
    /> : null}
    {review ? <section className="mt-4 rounded border p-3" aria-labelledby="chord-context-history-heading" data-testid="chord-context-history-save">
      <h3 id="chord-context-history-heading" className="font-semibold">{ja ? "練習履歴" : "Practice History"}</h3>
      <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">{ja ? "進行、セクション、テンポ、選択レイヤー、保持したテイクの参照など、事実だけを保存します。演奏の採点は行いません。" : "Save factual source, section, tempo, selected layers, and retained-take reference only. This does not score your playing."}</p>
      {historyStatus === "error" ? <p role="alert" className="mt-2 text-sm text-[var(--lv-danger)]">{ja ? "練習履歴を保存できませんでした。レビュー内容はこのまま残ります。" : "Practice History could not be saved. Your review remains available."}</p> : null}
      {hasUnkeptRecordingTake ? <p role="status" className="mt-2 text-sm">{ja ? "このセッションを保存する前に、録音したテイクを保持するか破棄してください。" : "Keep or discard the recorded take before saving this factual session."}</p> : null}
      <p aria-live="polite" className="mt-2 text-sm">{historyStatus === "saving" ? ja ? "練習履歴を保存しています。" : "Saving factual History." : historyStatus === "saved" ? ja ? "練習履歴へ保存しました。" : "Factual session saved to History." : ja ? "このセッションはまだ履歴へ保存されていません。" : "History is not yet saved."}</p>
      <Button className="mt-3" onClick={() => void saveChordContextHistory()} disabled={!onChordContextHistoryRecorded || recordingInFlight || hasUnkeptRecordingTake || historyStatus === "saving" || historyStatus === "saved"} data-testid="chord-context-save-history">{historyStatus === "saved" ? ja ? "履歴へ保存済み" : "Saved to History" : ja ? "セッションを履歴へ保存" : "Save factual session"}</Button>
    </section> : null}
  </Surface>;
}

function isVaultChordContextSnapshot(snapshot: ChordContextSnapshot | undefined): snapshot is VaultChordContextSnapshot {
  return snapshot?.source.kind === "vault";
}

interface ContextModeOption<T extends string> { readonly value: T; readonly label: string; }
const LISTEN_MODE_OPTIONS: readonly ContextModeOption<ChordContextListenMode>[] = [
  { value: "bass-only", label: "Bass only" },
  { value: "chords-only", label: "Chords only" },
  { value: "bass-and-chords", label: "Bass + Chords" },
  { value: "bass-chords-and-metronome", label: "Bass + Chords + Metronome" },
];
const PLAY_MODE_OPTIONS: readonly ContextModeOption<ChordContextPlayMode>[] = [
  { value: "chords-only", label: "Chords only" },
  { value: "chords-and-metronome", label: "Chords + Metronome" },
  { value: "metronome-only", label: "Metronome only" },
  { value: "no-accompaniment", label: "No accompaniment" },
];

function listenModeOptions(language: AppLanguage): readonly ContextModeOption<ChordContextListenMode>[] {
  if (language === "en") return LISTEN_MODE_OPTIONS;
  return [
    { value: "bass-only", label: "ベースのみ" },
    { value: "chords-only", label: "コードのみ" },
    { value: "bass-and-chords", label: "ベース + コード" },
    { value: "bass-chords-and-metronome", label: "ベース + コード + メトロノーム" },
  ];
}

function playModeOptions(language: AppLanguage): readonly ContextModeOption<ChordContextPlayMode>[] {
  if (language === "en") return PLAY_MODE_OPTIONS;
  return [
    { value: "chords-only", label: "コードのみ" },
    { value: "chords-and-metronome", label: "コード + メトロノーム" },
    { value: "metronome-only", label: "メトロノームのみ" },
    { value: "no-accompaniment", label: "伴奏なし" },
  ];
}

function ContextModeOptions<T extends string>({
  legend,
  name,
  selected,
  onChange,
  options,
  disabled = false,
}: {
  readonly legend: string;
  readonly name: string;
  readonly selected: T;
  readonly onChange: (value: T) => void;
  readonly options: readonly ContextModeOption<T>[];
  readonly disabled?: boolean;
}) {
  return <fieldset className="mt-3">
    <legend>{legend}</legend>
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => <label key={option.value} className="rounded border p-2 text-sm">
        <input type="radio" name={name} disabled={disabled} checked={selected === option.value} onChange={() => onChange(option.value)} /> {option.label}
      </label>)}
    </div>
  </fieldset>;
}

function toChordContextInput(
  snapshot: ChordContextSnapshot,
  bassEvents: readonly { readonly index: number; readonly midiNote: number; readonly startBeat: number; readonly durationBeats: number; readonly velocity: number }[],
  effectiveBpm: number,
  practiceMode: PracticeMode,
  listenMode: ChordContextListenMode,
  playMode: ChordContextPlayMode,
): ChordContextPlaybackInput {
  const source = {
    bpm: effectiveBpm,
    meter: snapshot.meter,
    chordEvents: snapshot.section.chords.map((chord) => ({
      id: chord.id,
      chord: {
        root: chord.root,
        quality: chord.quality,
        tensions: [...chord.tensions],
        ...(chord.bass === undefined ? {} : { bass: chord.bass }),
        label: chord.label,
      },
      startBeat: chord.startBeat,
      durationBeats: chord.durationBeats,
    })),
    bassEvents: bassEvents.map((event) => ({
      id: `bass:${event.index}`,
      pitch: event.midiNote,
      startBeat: event.startBeat,
      durationBeats: event.durationBeats,
      velocity: event.velocity,
    })),
  };
  return practiceMode === "listen"
    ? { ...source, mode: "listen", listenMode }
    : { ...source, mode: "play", playMode };
}

function clampChordContextBpm(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(30, Math.min(240, Math.round(value)));
}

interface RecordedChordContextFacts {
  readonly effectiveBpm: number;
  readonly listenMode: ChordContextListenMode;
  readonly playMode: ChordContextPlayMode;
  readonly metronomeUsed: boolean;
  readonly recordCompareUsed: boolean;
}

function newChordContextRecordSessionId(): string {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  return "bassline-chord-context-session:" + value;
}

function newChordContextHistoryId(): string {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  return "chord-context-history:" + value;
}

const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** MIDI note number 竊・scientific pitch name (60 = C4), e.g. 45 竊・"A2". */
function midiNoteName(midi: number): string {
  if (!Number.isFinite(midi)) return "?";
  const rounded = Math.round(midi);
  const name = PITCH_CLASS_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}