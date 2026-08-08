import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ear, Lightbulb, Square } from "lucide-react";
import { stopPreview, previewMidiNotes } from "../../../audio/chordPreview";
import { Button, Surface } from "../../../components/ui";
import {
  BASSLINE_GENERATOR_VERSION,
  buildGeneratedChordContextSnapshot,
  createChordContextVaultBasslineExercise,
  generateBasslineExercise,
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

export interface BasslinePracticeViewProps {
  readonly chordContextSnapshot?: ChordContextSnapshot;
  /** Feature-flag rollback preserves the P5.16 Bassline Echo surface. */
  readonly chordContextEnabled?: boolean;
}

export function BasslinePracticeView({
  chordContextSnapshot,
  chordContextEnabled = true,
}: BasslinePracticeViewProps) {
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
  useEffect(() => { stopChordContext(); }, [chordContextSnapshot?.signature, stopChordContext]);

  const startChordContext = useCallback(async () => {
    if (!activeSnapshot || !exercise.ok) return;
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
        return;
      }
      const engine = createChordContextPlaybackEngine(driver, {
        onError(error) {
          if (generationRef.current === generation) {
            setPlaybackError(error instanceof Error ? error.message : "Chord Context playback stopped unexpectedly.");
          }
        },
        onCompleted() {
          if (sessionRef.current?.generation !== generation) return;
          sessionRef.current = undefined;
          driver.dispose();
          setContextPlayback(undefined);
          setPreparing(false);
          setLegacyPlaying(false);
        },
      });
      sessionRef.current.engine = engine;
      const input = toChordContextInput(activeSnapshot, exercise.exercise.targetEvents, practiceMode, listenMode, playMode);
      const result = engine.start(input);
      if (!result.ok) {
        setPlaybackError(result.error.message);
        engine.dispose();
        driver.dispose();
        sessionRef.current = undefined;
        return;
      }
      if (result.plan.events.length === 0) {
        engine.dispose();
        driver.dispose();
        if (sessionRef.current?.generation === generation) sessionRef.current = undefined;
        setContextPlayback(undefined);
        return;
      }
      if (sessionRef.current?.generation === generation) setContextPlayback(practiceMode);
    } catch (error) {
      if (generationRef.current === generation) {
        setPlaybackError(error instanceof Error ? error.message : "Chord Context audio could not start.");
        sessionRef.current = undefined;
        driver.dispose();
      }
    } finally {
      if (generationRef.current === generation) setPreparing(false);
    }
  }, [activeSnapshot, exercise, legacyPlaying, listenMode, playMode, practiceMode, stopChordContext]);

  const choosePracticeMode = (next: PracticeMode): void => {
    if (next === practiceMode) return;
    stopChordContext();
    setPracticeMode(next);
  };
  const chooseListenMode = (next: ChordContextListenMode): void => {
    if (next === listenMode) return;
    stopChordContext();
    setListenMode(next);
  };
  const choosePlayMode = (next: ChordContextPlayMode): void => {
    if (next === playMode) return;
    stopChordContext();
    setPlayMode(next);
  };
  const chooseLevel = (next: 1 | 2 | 3): void => {
    stopChordContext();
    setLevel(next);
    setHint(0);
    setReview(false);
  };

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
    })), exercise.exercise.tempo, "freepats-finger-bass", {
      onStarted: () => { if (legacyPreviewGenerationRef.current === generation) setLegacyPlaying(true); },
      onEnded: () => { if (legacyPreviewGenerationRef.current === generation) setLegacyPlaying(false); },
    });
  };

  if (!exercise.ok) return <p role="alert">{exercise.error.message}</p>;
  const sourceLabel = chordContextSnapshot?.source.kind === "vault"
    ? `Vault source \u00b7 ${chordContextSnapshot.source.safeLabel}`
    : "Generated source";
  const noContextSource = chordContextEnabled && !activeSnapshot;

  return <Surface className="p-4" data-testid="bassline-echo-view">
    <p className="lv-section-kicker">Bass Practice</p>
    <h2 className="text-2xl font-bold">Bassline Echo</h2>
    <p className="mt-2 text-sm" data-testid="bassline-source">{sourceLabel}{" \u00b7 "}self-rated practice only{" \u00b7 "}no microphone or automatic score.</p>
    <label className="mt-3 block">Level <select aria-label="Bassline level" value={level} onChange={(event) => chooseLevel(Number(event.target.value) as 1 | 2 | 3)}><option value={1}>1 - Roots</option><option value={2}>2 - Chord tones</option><option value={3}>3 - Approach</option></select></label>
    <div className="mt-4 rounded border p-3" aria-label="Bassline progression strip">{exercise.exercise.chords.map((chord) => <span key={`${chord.startBeat}:${chord.label}`} className="mr-2">{chord.label}</span>)}</div>
    <div className="mt-3 text-sm" data-testid="bassline-notes">{hint >= 4 || review ? <>
      <span className="mr-2 text-xs text-[var(--lv-text-muted)]">Answer notes</span>
      {exercise.exercise.targetEvents.map((event) => <span key={event.index} className="mr-2 font-semibold" title={`MIDI ${event.midiNote}`}>{midiNoteName(event.midiNote)}</span>)}
    </> : "Listen and recall first. Notes stay hidden until Hint 4 or Review."}</div>

    {chordContextEnabled ? <section className="mt-4 rounded border p-3" aria-labelledby="chord-context-heading" data-testid="chord-context-controls">
      <h3 id="chord-context-heading" className="font-semibold">Chord Context</h3>
      <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">{activeSnapshot?.source.safeLabel ?? "Chord Context source unavailable."}</p>
      <fieldset className="mt-3">
        <legend>Practice mode</legend>
        <div className="flex flex-wrap gap-3">
          <label><input type="radio" name="chord-context-practice-mode" checked={practiceMode === "listen"} onChange={() => choosePracticeMode("listen")} /> Listen</label>
          <label><input type="radio" name="chord-context-practice-mode" checked={practiceMode === "play"} onChange={() => choosePracticeMode("play")} /> Play</label>
        </div>
      </fieldset>
      {practiceMode === "listen" ? <ContextModeOptions
        legend="Listen layers"
        name="chord-context-listen-mode"
        selected={listenMode}
        onChange={chooseListenMode}
        options={LISTEN_MODE_OPTIONS}
      /> : <ContextModeOptions
        legend="Play accompaniment"
        name="chord-context-play-mode"
        selected={playMode}
        onChange={choosePlayMode}
        options={PLAY_MODE_OPTIONS}
      />}
      <p className="mt-3 text-sm text-[var(--lv-text-secondary)]">
        {practiceMode === "play" ? "Play never auto-plays the target bass." : "Listen uses the target bass only in the selected Listen layer."}
      </p>
      {playbackError ? <p role="alert" className="mt-2 text-sm text-[var(--lv-danger)]">{playbackError}</p> : null}
      <p aria-live="polite" className="mt-2 text-sm" data-testid="chord-context-status">
        {preparing ? "Preparing Chord Context audio." : contextPlayback ? `${contextPlayback === "listen" ? "Listen" : "Play"} playback running.` : "Chord Context stopped."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => { if (contextPlayback || preparing) stopChordContext(); else void startChordContext(); }}
          disabled={noContextSource}
          data-testid="chord-context-start-stop"
        >
          {contextPlayback || preparing ? <Square size={15} /> : <Ear size={15} />}
          {contextPlayback || preparing ? "Stop" : practiceMode === "listen" ? "Start Listen" : "Start Play"}
        </Button>
        <Button variant="ghost" onClick={stopChordContext} disabled={!contextPlayback && !preparing}>Stop</Button>
      </div>
    </section> : null}

    <div className="mt-4 flex flex-wrap gap-2">
      <Button onClick={legacyListen} data-testid="bassline-listen">{legacyPlaying ? <Square size={15} /> : <Ear size={15} />}{legacyPlaying ? "Stop" : "Listen"}</Button>
      <Button variant="ghost" onClick={() => setHint((value) => Math.min(4, value + 1))}><Lightbulb size={15} /> Hint {hint}/4</Button>
      <Button onClick={() => { legacyPreviewGenerationRef.current += 1; stopPreview(); setLegacyPlaying(false); stopChordContext(); setReview(true); }}><Ear size={15} /> Review</Button>
    </div>
    {review ? <RecordCompareSection
      mode="bassline"
      resetKey={`bassline:${chordContextSnapshot?.signature ?? "generated"}:${level}`}
      countInMs={Math.round((4 * 60_000) / exercise.exercise.tempo)}
      onPlaybackStart={stopChordContext}
      targetPlayer={createTargetPlayer(
        (onEnded) => void previewMidiNotes(
          exercise.exercise.targetEvents.map((event) => ({
            pitch: event.midiNote,
            startBeat: event.startBeat,
            durationBeats: event.durationBeats,
            velocity: event.velocity,
          })),
          exercise.exercise.tempo,
          "freepats-finger-bass",
          { onEnded },
        ),
        stopPreview,
      )}
    /> : null}
    {review ? <fieldset className="mt-4"><legend>Self-rated review</legend>{["again", "hard", "good", "easy"].map((rating) => <button key={rating} type="button" className="mr-2">{rating}</button>)}</fieldset> : null}
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

function ContextModeOptions<T extends string>({
  legend,
  name,
  selected,
  onChange,
  options,
}: {
  readonly legend: string;
  readonly name: string;
  readonly selected: T;
  readonly onChange: (value: T) => void;
  readonly options: readonly ContextModeOption<T>[];
}) {
  return <fieldset className="mt-3">
    <legend>{legend}</legend>
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => <label key={option.value} className="rounded border p-2 text-sm">
        <input type="radio" name={name} checked={selected === option.value} onChange={() => onChange(option.value)} /> {option.label}
      </label>)}
    </div>
  </fieldset>;
}

function toChordContextInput(
  snapshot: ChordContextSnapshot,
  bassEvents: readonly { readonly index: number; readonly midiNote: number; readonly startBeat: number; readonly durationBeats: number; readonly velocity: number }[],
  practiceMode: PracticeMode,
  listenMode: ChordContextListenMode,
  playMode: ChordContextPlayMode,
): ChordContextPlaybackInput {
  const source = {
    bpm: snapshot.originalBpm,
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

const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** MIDI note number 竊・scientific pitch name (60 = C4), e.g. 45 竊・"A2". */
function midiNoteName(midi: number): string {
  if (!Number.isFinite(midi)) return "?";
  const rounded = Math.round(midi);
  const name = PITCH_CLASS_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}