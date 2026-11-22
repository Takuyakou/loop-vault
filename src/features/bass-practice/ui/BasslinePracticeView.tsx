import { Button } from "../../../components/ui";
import { Chip, Select } from "../../../components/ui/controls";
import { useAnnounceSongBpm, useGlobalBpm } from "../../../components/GlobalBpmProvider";
import type { DegreeUiSettings } from "./BassPracticeView";
import { useEchoActive } from "./EchoPracticeFrame";
import type { SavedChordNotes } from "../application/vaultSavedChordNotes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stopPreview, previewMidiNotes } from "../../../audio/chordPreview";
import {
  BASSLINE_GENERATOR_VERSION,
  BASSLINE_PROGRESSION_PRESETS,
  buildBasslinePresetSnapshot,
  buildGeneratedChordContextSnapshot,
  createChordContextBasslineExercise,
  createChordContextHistoryEntry,
  createSourceBasslineHistoryEntry,
  resolveSourceBasslineHistory,
  buildSourceBasslinePracticeWindow,
  DEFAULT_SOURCE_BASSLINE_WINDOW_BARS,
  isSourceBasslineRecordEligible,
  nextSourceBasslineWindowStart,
  previousSourceBasslineWindowStart,
  generateBasslineExercise,
  type BasslineProgressionPresetId,
  type ChordContextHistoryEntry,
  type ChordContextSnapshot,
  type SourceBasslineHarmonyEvent,
  type SourceBasslineHistoryEntry,
  type SourceBasslinePracticeLevel,
  type SourceBasslineWindowBars,
  type VaultChordContextSnapshot,
} from "../domain";
import {
  DEFAULT_CHORD_CONTEXT_LISTEN_MODE,
  CHORD_CONTEXT_BASS_MAX_MIDI,
  CHORD_CONTEXT_BASS_MIN_MIDI,
  createChordContextPlaybackEngine,
  type ChordContextPlaybackEngine,
  type ChordContextPlaybackInput,
  type ChordContextListenMode,
  type ChordContextPlayMode,
} from "../application/chordContextPlayback";
import {
  createChordContextToneDriver,
  type ChordContextChordTimbre,
  type PreparedChordContextToneDriver,
} from "../application/chordContextToneDriver";
import type { VaultPickerCandidateView, VaultSourceBasslineCandidateView } from "../application/vaultPickerCandidates";
import { VaultProgressionPicker } from "./VaultProgressionPicker";
import { noteName } from "../midi/noteName";
import type { BassAnalysis } from "../midi/analysis";
import {
  keyLabel,
  StageButton,
  StageCount,
  StageFrame,
  StageFretboard,
  StageHints,
  StageLane,
  StageMeter,
  StagePlayButton,
  StageResultHead,
  StageTools,
  type HintChip,
  type LaneNote,
  type ResultFact,
  type StageStep,
} from "../stage/Stage";
import { takeNotes, useJudgedTake } from "../stage/useJudgedTake";

const GENERATED_CONTEXT_CHORDS = [
  { id: "generated:0", root: 2, quality: "min7" as const, tensions: [] as const, label: "Dm7", startBeat: 0, durationBeats: 2 },
  { id: "generated:1", root: 7, quality: "dom7" as const, tensions: [] as const, label: "G7", startBeat: 2, durationBeats: 2 },
  { id: "generated:2", root: 0, quality: "maj7" as const, tensions: [] as const, label: "Cmaj7", startBeat: 4, durationBeats: 4 },
] as const;

const PRESET_TONICS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
const SOURCE_SESSION_DEFAULT_BPM = 96;

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
type SourceWindowPreferenceTransaction = {
  readonly bars: SourceBasslineWindowBars;
  readonly visibleIntent: number;
  outcome?: "success" | "failure";
};
const NO_CHORD_CONTEXT_ACTIVITY: ChordContextPlaybackActivity = Object.freeze({ started: false, metronomeUsed: false });

export interface BasslinePracticeViewProps {
  readonly instrument?: DegreeUiSettings;
  readonly chordContextSnapshot?: ChordContextSnapshot;
  /** Current-Vault pitches for this session only; never included in history. */
  readonly resolveSavedChordNotes?: (snapshot: ChordContextSnapshot) => SavedChordNotes;
  readonly chordContextSnapshots?: readonly VaultChordContextSnapshot[];
  /** Live Vault title projection for picker display and search only. */
  readonly vaultPickerCandidates?: readonly VaultPickerCandidateView[];
  /** Strict source assets keyed only by their stable Vault idea/block reference. */
  readonly vaultSourceBasslines?: readonly VaultSourceBasslineCandidateView[];
  /** Feature-flag rollback preserves the P5.16 Bassline Echo surface. */
  readonly chordContextEnabled?: boolean;
  /** Persists only the factual P5.18 History record in the existing Practice document. */
  readonly onChordContextHistoryRecorded?: (entry: ChordContextHistoryEntry) => Promise<void>;
  readonly sourceBasslineHistory?: readonly SourceBasslineHistoryEntry[];
  readonly onSourceBasslineHistoryRecorded?: (entry: SourceBasslineHistoryEntry) => Promise<void>;
  readonly initialWindowBars?: SourceBasslineWindowBars;
  readonly onSourceBasslineWindowBarsChange?: (bars: SourceBasslineWindowBars) => Promise<void>;
}

/**
 * P23-63: コード進行のベース on the shared practice stage (1 聴く → 2 弾く → 3 結果). The engine, the
 * progression/source/window/level rules and what a history entry holds are unchanged; only the arrangement and the
 * judged take are new. Every setting lives in the top band's 条件 popover, the take is judged by `useJudgedTake` with
 * the practice's own Chord Context as its accompaniment, and 「記録して次へ」 writes the same factual history.
 */
export function BasslinePracticeView({
  instrument,
  chordContextSnapshot,
  resolveSavedChordNotes,
  chordContextSnapshots,
  vaultPickerCandidates,
  vaultSourceBasslines,
  chordContextEnabled = true,
  onChordContextHistoryRecorded,
  sourceBasslineHistory = [],
  onSourceBasslineHistoryRecorded,
  initialWindowBars = DEFAULT_SOURCE_BASSLINE_WINDOW_BARS,
  onSourceBasslineWindowBarsChange,
}: BasslinePracticeViewProps) {
  const [level, setLevel] = useState<SourceBasslinePracticeLevel>(1);
  const [basslineSource, setBasslineSource] = useState<"generated" | "source-bassline">("generated");
  const [sourceWindowBars, setSourceWindowBars] = useState<SourceBasslineWindowBars>(initialWindowBars);
  const sourceWindowBarsRef = useRef(sourceWindowBars);
  const confirmedSourceWindowBarsRef = useRef(sourceWindowBars);
  const sourceWindowPreferenceGenerationRef = useRef(0);
  const processedSourceWindowPreferenceGenerationRef = useRef(0);
  const sourceWindowPreferenceTransactionsRef = useRef(new Map<number, SourceWindowPreferenceTransaction>());
  const sourceWindowPreferenceMountedRef = useRef(true);
  const sourceWindowVisibleIntentRef = useRef(0);
  const [sourceWindowPreferenceError, setSourceWindowPreferenceError] = useState<string>();
  useEffect(() => {
    sourceWindowPreferenceMountedRef.current = true;
    return () => {
      sourceWindowPreferenceMountedRef.current = false;
      sourceWindowVisibleIntentRef.current += 1;
      sourceWindowPreferenceGenerationRef.current += 1;
      processedSourceWindowPreferenceGenerationRef.current = sourceWindowPreferenceGenerationRef.current;
      sourceWindowPreferenceTransactionsRef.current.clear();
    };
  }, []);
  const [sourceWindowStartBar, setSourceWindowStartBar] = useState(1);
  const [selectedSourceReference, setSelectedSourceReference] = useState<VaultSourceBasslineCandidateView["reference"]>();
  const [hint, setHint] = useState(0);
  const [review, setReview] = useState(false);
  const [selfPlaying, setSelfPlaying] = useState(false);
  const [selfRated, setSelfRated] = useState(false);
  const [heard, setHeard] = useState(false);
  const [legacyPlaying, setLegacyPlaying] = useState(false);
  const [listenMode, setListenMode] = useState<ChordContextListenMode>(DEFAULT_CHORD_CONTEXT_LISTEN_MODE);
  const [recordPlayMode, setRecordPlayMode] = useState<Extract<ChordContextPlayMode, "chords-only" | "chords-and-metronome">>("chords-only");
  const [chordTimbre, setChordTimbre] = useState<ChordContextChordTimbre>("electric");
  const [contextPlayback, setContextPlayback] = useState<PracticeMode | undefined>();
  const [preparing, setPreparing] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | undefined>();
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const conditionsPanelRef = useRef<HTMLDivElement>(null);
  const conditionsPanelId = useRef(`bassline-conditions-${Math.random().toString(36).slice(2)}`).current;
  const sessionRef = useRef<ActiveChordContextSession>();
  const generationRef = useRef(0);
  const legacyPreviewGenerationRef = useRef(0);

  const generatedSnapshot = useMemo(
    () => buildGeneratedChordContextSnapshot({ key: "C major", bpm: 96, chords: GENERATED_CONTEXT_CHORDS }),
    [],
  );
  const [presetKeys, setPresetKeys] = useState<Readonly<Partial<Record<BasslineProgressionPresetId, string>>>>({});
  const presetSnapshots = useMemo(() => Object.freeze(BASSLINE_PROGRESSION_PRESETS.flatMap((preset) => {
    const snapshot = buildBasslinePresetSnapshot({ presetId: preset.id, key: presetKeys[preset.id] });
    return snapshot.ok ? [snapshot.snapshot] : [];
  })), [presetKeys]);
  const availableSnapshots = useMemo(() => {
    const candidates: ChordContextSnapshot[] = [];
    const signatures = new Set<string>();
    const add = (snapshot: ChordContextSnapshot | undefined) => {
      if (!snapshot || signatures.has(snapshot.signature)) return;
      signatures.add(snapshot.signature);
      candidates.push(snapshot);
    };
    if (generatedSnapshot.ok) add(generatedSnapshot.snapshot);
    for (const snapshot of presetSnapshots) add(snapshot);
    add(chordContextSnapshot);
    for (const snapshot of chordContextSnapshots ?? []) add(snapshot);
    return Object.freeze(candidates);
  }, [chordContextSnapshot, chordContextSnapshots, generatedSnapshot, presetSnapshots]);
  const [selectedSnapshotSignature, setSelectedSnapshotSignature] = useState(
    () => chordContextSnapshot?.signature ?? (generatedSnapshot.ok ? generatedSnapshot.snapshot.signature : undefined),
  );
  useEffect(() => {
    if (chordContextSnapshot) setSelectedSnapshotSignature(chordContextSnapshot.signature);
  }, [chordContextSnapshot?.signature]);
  const activeSnapshot = availableSnapshots.find((snapshot) => snapshot.signature === selectedSnapshotSignature)
    ?? availableSnapshots[0];
  const vaultSnapshots = useMemo(
    () => Object.freeze(availableSnapshots.filter((snapshot): snapshot is VaultChordContextSnapshot => snapshot.source.kind === "vault")),
    [availableSnapshots],
  );
  const pickerCandidates: readonly VaultPickerCandidateView[] = useMemo(
    () => vaultPickerCandidates ?? Object.freeze(vaultSnapshots.map((safeSnapshot) => Object.freeze({
      displayTitle: safeSnapshot.source.safeLabel,
      searchableTitle: safeSnapshot.source.safeLabel.toLocaleLowerCase(),
      safeSnapshot,
    }))),
    [vaultPickerCandidates, vaultSnapshots],
  );
  const sourceCandidate = selectedSourceReference
    ? vaultSourceBasslines?.find(({ reference }) => sameSourceReference(reference, selectedSourceReference))
    : undefined;
  const sourceSnapshot = sourceCandidate?.sourceBassline;
  const sourceCatalogAvailable = Boolean(vaultSourceBasslines?.length);
  const sourceWindowResult = useMemo(
    () => sourceSnapshot
      ? buildSourceBasslinePracticeWindow(sourceSnapshot, sourceWindowBars, sourceWindowStartBar)
      : undefined,
    [sourceSnapshot, sourceWindowBars, sourceWindowStartBar],
  );
  const sourceWindow = sourceWindowResult?.ok ? sourceWindowResult.window : undefined;
  const sourceSelected = basslineSource === "source-bassline";
  const sourceLevelResult = sourceWindow?.levels[level];
  const sourceLevelAvailable = Boolean(sourceLevelResult?.available);
  const sourcePitchReplacementCount = sourceLevelResult?.available ? sourceLevelResult.pitchReplacementCount : 0;
  const tempoBaselineBpm = sourceSelected ? SOURCE_SESSION_DEFAULT_BPM : activeSnapshot?.originalBpm ?? SOURCE_SESSION_DEFAULT_BPM;
  const sourceAvailable = Boolean(sourceSnapshot && sourceWindowResult?.ok);
  const previousWindowStart = sourceWindow ? previousSourceBasslineWindowStart(sourceWindow.requestedBars, sourceWindow.startBar) : undefined;
  const nextWindowStart = sourceWindow ? nextSourceBasslineWindowStart(sourceWindow.totalBars, sourceWindow.requestedBars, sourceWindow.startBar) : undefined;
  // P23-06b L1/L7: the screen plays at the app-wide BPM and announces the song's BPM while one is selected.
  const { bpm: globalBpm, setBpm: setGlobalBpm } = useGlobalBpm();
  useAnnounceSongBpm(!sourceSelected && activeSnapshot && activeSnapshot.source.kind !== "generated"
    ? activeSnapshot.originalBpm
    : undefined);
  const [effectiveBpm, setEffectiveBpm] = useState(globalBpm);
  const sourceRecordEligible = !sourceSelected || !sourceWindow
    || isSourceBasslineRecordEligible(sourceWindow.actualBars, effectiveBpm);
  const [recordCompareUsed, setRecordCompareUsed] = useState(false);
  const [metronomeUsed, setMetronomeUsed] = useState(false);
  const [recordingFacts, setRecordingFacts] = useState<RecordedChordContextFacts>();
  const [retainedTakeReference, setRetainedTakeReference] = useState<string>();
  const [historyStatus, setHistoryStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [historyRestartMessage, setHistoryRestartMessage] = useState<string>();
  const historySavingRef = useRef(false);
  const historyGenerationRef = useRef(0);
  const historyEntryIdRef = useRef<string>();
  const historyStatusRef = useRef(historyStatus);
  const basslineRecordSessionIdRef = useRef(newChordContextRecordSessionId());
  useEffect(() => { historyStatusRef.current = historyStatus; }, [historyStatus]);
  useEffect(() => () => {
    historyGenerationRef.current += 1;
    historySavingRef.current = false;
  }, []);
  const invalidateRecordedFacts = useCallback(() => {
    historyGenerationRef.current += 1;
    historySavingRef.current = false;
    historyStatusRef.current = "idle";
    setHistoryRestartMessage(undefined);
    setRecordCompareUsed(false);
    setMetronomeUsed(false);
    setRecordingFacts(undefined);
    setRetainedTakeReference(undefined);
    historyEntryIdRef.current = undefined;
    setHistoryStatus("idle");
  }, []);
  const exercise = useMemo(() => activeSnapshot && activeSnapshot.source.kind !== "generated"
    ? createChordContextBasslineExercise(activeSnapshot, level)
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
    }), [activeSnapshot, level]);

  const activeTargetEvents = sourceSelected ? (sourceLevelResult?.available ? sourceLevelResult.targetEvents : []) : (exercise.ok ? exercise.exercise.targetEvents : []);
  const hasPracticeTarget = activeTargetEvents.length > 0;
  const sourceContextPlayable = !sourceSelected || Boolean(
    sourceWindow?.harmonyEvents?.length
    && activeTargetEvents.every((event) => event.midiNote >= CHORD_CONTEXT_BASS_MIN_MIDI && event.midiNote <= CHORD_CONTEXT_BASS_MAX_MIDI),
  );
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
  // P23-63: the reset is keyed by what the snapshot *is* (its signature), not by the object identity a re-read of the
  // practice file produces — saving a history entry must not send the window back to bar 1.
  useEffect(() => {
    stopChordContext();
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    setSourceWindowStartBar(1);
    setHint(0);
    setReview(false);
    setSelfPlaying(false);
    setSelfRated(false);
    setHeard(false);
    setPlaybackError(undefined);
    invalidateRecordedFacts();
  }, [activeSnapshot?.signature, sourceSnapshot?.snapshotSignature, invalidateRecordedFacts, stopChordContext]);

  const prepareChordContext = useCallback(async (): Promise<boolean> => {
    if (!activeSnapshot || !exercise.ok || !hasPracticeTarget || (sourceSelected && !sourceContextPlayable)) return false;
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    stopChordContext();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const driver = createChordContextToneDriver({ chordTimbre });
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
        setPlaybackError(error instanceof Error ? error.message : "Chord Context の音を準備できませんでした。");
        sessionRef.current = undefined;
      }
      driver.dispose();
      return false;
    } finally {
      if (generationRef.current === generation) setPreparing(false);
    }
  }, [activeSnapshot, chordTimbre, exercise, hasPracticeTarget, sourceContextPlayable, sourceSelected, stopChordContext]);

  const schedulePreparedChordContext = useCallback((options: {
    readonly practiceMode: PracticeMode;
    readonly listenMode?: ChordContextListenMode;
    readonly playMode?: ChordContextPlayMode;
  }): ChordContextPlaybackActivity => {
    if (!activeSnapshot || !exercise.ok || !hasPracticeTarget || (sourceSelected && !sourceContextPlayable)) return NO_CHORD_CONTEXT_ACTIVITY;
    const session = sessionRef.current;
    if (!session) return NO_CHORD_CONTEXT_ACTIVITY;
    const generation = session.generation;
    const selectedPracticeMode = options.practiceMode;
    const selectedListenMode = options.listenMode ?? listenMode;
    const selectedPlayMode = options.playMode ?? recordPlayMode;
    const engine = createChordContextPlaybackEngine(session.driver, {
      onError(error) {
        if (generationRef.current === generation) {
          setPlaybackError(error instanceof Error ? error.message : "Chord Context の再生が途中で止まりました。");
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
    const input = toChordContextInput(activeSnapshot, activeTargetEvents, effectiveBpm, selectedPracticeMode, selectedListenMode, selectedPlayMode, sourceSelected ? sourceWindow?.harmonyEvents : undefined, sourceSelected ? undefined : resolveSavedChordNotes?.(activeSnapshot));
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
    if (import.meta.env.VITE_P527_E2E_FIXTURE === "1") {
      (window as typeof window & {__lvBassSavedPlayback?: {mode: string; notes: readonly (readonly number[])[]}}).__lvBassSavedPlayback = {
        mode: selectedPracticeMode, notes: activePlan.events.filter(event => event.layer === "chords").map(event => event.notes),
      };
    }
    const activity = Object.freeze({ started: true, metronomeUsed: activePlan.events.some((event) => event.layer === "metronome") });
    if (sessionRef.current?.generation === generation) {
      setContextPlayback(selectedPracticeMode);
      if (activity.metronomeUsed) setMetronomeUsed(true);
    }
    return activity;
  }, [activeSnapshot, activeTargetEvents, effectiveBpm, exercise, hasPracticeTarget, listenMode, recordPlayMode, resolveSavedChordNotes, sourceContextPlayable, sourceSelected, sourceWindow?.harmonyEvents]);

  const startChordContext = useCallback(async (options: {
    readonly practiceMode: PracticeMode;
    readonly listenMode?: ChordContextListenMode;
    readonly playMode?: ChordContextPlayMode;
  }): Promise<ChordContextPlaybackActivity> => {
    const prepared = await prepareChordContext();
    if (!prepared) return NO_CHORD_CONTEXT_ACTIVITY;
    return schedulePreparedChordContext(options);
  }, [prepareChordContext, schedulePreparedChordContext]);

  // ── the take: the same judged path as 度数, with this practice's Chord Context as the accompaniment ──
  const takeTarget = useMemo(() => activeTargetEvents.map((event) => ({
    pitch: event.midiNote, startBeat: event.startBeat, durationBeats: event.durationBeats, velocity: event.velocity,
  })), [activeTargetEvents]);
  const targetLengthBeats = Math.max(4, ...activeTargetEvents.map((event) => event.startBeat + event.durationBeats));
  const generatedLengthBeats = Math.max(targetLengthBeats, activeSnapshot?.section.lengthBeats ?? 0);
  const windowLengthBeats = sourceSelected ? (sourceWindow ? sourceWindow.actualBars * 4 : 4) : generatedLengthBeats;
  const prepareAccompaniment = useCallback(async (): Promise<boolean> => {
    if (!chordContextEnabled) return true;
    if (sourceSelected && !sourceContextPlayable) return true;
    return prepareChordContext();
  }, [chordContextEnabled, prepareChordContext, sourceContextPlayable, sourceSelected]);
  const startAccompaniment = useCallback((): void => {
    const activity = !chordContextEnabled || (sourceSelected && !sourceContextPlayable)
      ? NO_CHORD_CONTEXT_ACTIVITY
      : schedulePreparedChordContext({ practiceMode: "play", playMode: recordPlayMode });
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
    // The stage's own playhead is the clock: no offset is returned.
  }, [chordContextEnabled, effectiveBpm, listenMode, recordPlayMode, schedulePreparedChordContext, sourceContextPlayable, sourceSelected]);
  const take = useJudgedTake({
    mode: "bassline",
    resetKey: `bassline:${activeSnapshot?.signature ?? "generated"}:${basslineSource}:${sourceWindow?.snapshotSignature ?? "no-source"}:${sourceWindow?.startBar ?? 0}:${sourceWindowBars}:${level}:${effectiveBpm}:${listenMode}:${recordPlayMode}:${chordTimbre}`,
    practiceSessionId: basslineRecordSessionIdRef.current,
    target: takeTarget,
    bpm: effectiveBpm,
    lengthBeats: windowLengthBeats + 1,
    beatsPerBar: 4,
    pitchRule: "octave",
    click: false,
    prepareAccompaniment,
    startAccompaniment,
    stopAccompaniment: stopChordContext,
    onTakeKept: setRetainedTakeReference,
  });
  const takeRunning = take.phase === "preparing" || take.phase === "counting" || take.phase === "recording" || take.phase === "analyzing";
  const listening = contextPlayback === "listen" || legacyPlaying;
  const judgedResult = take.result && !selfRated ? take.result : undefined;
  const step: StageStep = takeRunning || selfPlaying || (take.phase === "failed" && !review) ? 1 : review ? 2 : 0;
  const practiceState = takeRunning
    ? (take.phase === "recording" ? "recording" : take.phase === "counting" ? "counting" : take.phase === "analyzing" ? "analyzing" : "preparing")
    : take.phase === "failed" && !review
      ? "failed"
      : review
        ? (judgedResult ? "result" : "answer")
        : selfPlaying ? "playing" : listening ? "listening" : heard ? "heard" : "ready";

  const resetSourcePractice = useCallback(() => {
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    stopChordContext();
    setHint(0);
    setReview(false);
    setSelfPlaying(false);
    setSelfRated(false);
    setHeard(false);
    setPlaybackError(undefined);
    invalidateRecordedFacts();
  }, [invalidateRecordedFacts, stopChordContext]);
  const chooseBasslineSource = useCallback((next: "generated" | "source-bassline") => {
    if (next === basslineSource || (next === "source-bassline" && !sourceCatalogAvailable)) return;
    sourceWindowVisibleIntentRef.current += 1;
    resetSourcePractice();
    setBasslineSource(next);
    setSourceWindowStartBar(1);
    if (next === "source-bassline") setLevel(3);
  }, [basslineSource, resetSourcePractice, sourceCatalogAvailable]);
  const chooseSourceReference = useCallback((referenceKey: string) => {
    const candidate = vaultSourceBasslines?.find(({ reference }) => sourceReferenceKey(reference) === referenceKey);
    if (!candidate || (selectedSourceReference && sameSourceReference(candidate.reference, selectedSourceReference))) return;
    sourceWindowVisibleIntentRef.current += 1;
    resetSourcePractice();
    setSelectedSourceReference(candidate.reference);
    setSourceWindowStartBar(1);
  }, [resetSourcePractice, selectedSourceReference, vaultSourceBasslines]);
  const settleSourceWindowPreference = useCallback((generation: number, outcome: "success" | "failure") => {
    const transaction = sourceWindowPreferenceTransactionsRef.current.get(generation);
    if (!transaction || !sourceWindowPreferenceMountedRef.current) return;
    transaction.outcome = outcome;
    let currentOutcome: "success" | "failure" | undefined;
    while (true) {
      const nextGeneration = processedSourceWindowPreferenceGenerationRef.current + 1;
      const next = sourceWindowPreferenceTransactionsRef.current.get(nextGeneration);
      if (!next?.outcome) break;
      if (next.outcome === "success") confirmedSourceWindowBarsRef.current = next.bars;
      if (next.visibleIntent === sourceWindowVisibleIntentRef.current) currentOutcome = next.outcome;
      sourceWindowPreferenceTransactionsRef.current.delete(nextGeneration);
      processedSourceWindowPreferenceGenerationRef.current = nextGeneration;
    }
    if (!currentOutcome) return;
    if (currentOutcome === "success") {
      setSourceWindowPreferenceError(undefined);
      return;
    }
    resetSourcePractice();
    const confirmed = confirmedSourceWindowBarsRef.current;
    sourceWindowBarsRef.current = confirmed;
    setSourceWindowBars(confirmed);
    setSourceWindowStartBar(1);
    setSourceWindowPreferenceError("区間の長さを保存できませんでした。保存済みの選択へ戻しました。");
  }, [resetSourcePractice]);
  const chooseSourceWindowBars = useCallback((next: SourceBasslineWindowBars) => {
    if (next === sourceWindowBarsRef.current) return;
    const generation = sourceWindowPreferenceGenerationRef.current + 1;
    sourceWindowPreferenceGenerationRef.current = generation;
    const visibleIntent = sourceWindowVisibleIntentRef.current + 1;
    sourceWindowVisibleIntentRef.current = visibleIntent;
    sourceWindowPreferenceTransactionsRef.current.set(generation, { bars: next, visibleIntent });
    sourceWindowBarsRef.current = next;
    resetSourcePractice();
    setSourceWindowBars(next);
    setSourceWindowStartBar(1);
    setSourceWindowPreferenceError(undefined);
    let save: Promise<void> | undefined;
    try {
      save = onSourceBasslineWindowBarsChange?.(next);
    } catch {
      settleSourceWindowPreference(generation, "failure");
      return;
    }
    if (!save) {
      settleSourceWindowPreference(generation, "success");
      return;
    }
    void save.then(
      () => settleSourceWindowPreference(generation, "success"),
      () => settleSourceWindowPreference(generation, "failure"),
    );
  }, [onSourceBasslineWindowBarsChange, resetSourcePractice, settleSourceWindowPreference]);
  const moveSourceWindow = useCallback((nextStartBar: number | undefined) => {
    if (nextStartBar === undefined || nextStartBar === sourceWindowStartBar) return;
    sourceWindowVisibleIntentRef.current += 1;
    resetSourcePractice();
    setSourceWindowStartBar(nextStartBar);
  }, [resetSourcePractice, sourceWindowStartBar]);
  const chooseListenMode = (next: ChordContextListenMode): void => {
    if (next === listenMode) return;
    stopChordContext();
    setListenMode(next);
    invalidateRecordedFacts();
  };
  const chooseRecordPlayMode = (next: ChordContextPlayMode): void => {
    if (next !== "chords-only" && next !== "chords-and-metronome") return;
    if (next === recordPlayMode) return;
    stopChordContext();
    setRecordPlayMode(next);
    invalidateRecordedFacts();
  };
  const activateSnapshot = (next: ChordContextSnapshot): void => {
    if (next.signature === activeSnapshot?.signature) return;
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    stopChordContext();
    setSelectedSnapshotSignature(next.signature);
    setHint(0);
    setReview(false);
    setHeard(false);
    setPlaybackError(undefined);
    invalidateRecordedFacts();
  };
  const chooseProgression = (signature: string): void => {
    const next = availableSnapshots.find((snapshot) => snapshot.signature === signature);
    if (next) activateSnapshot(next);
  };
  const choosePreset = (presetId: BasslineProgressionPresetId | "generated"): void => {
    if (presetId === "generated") {
      if (generatedSnapshot.ok) activateSnapshot(generatedSnapshot.snapshot);
      return;
    }
    const next = presetSnapshots.find((snapshot) => snapshot.source.kind === "preset" && snapshot.source.presetId === presetId);
    if (next) activateSnapshot(next);
  };
  const choosePresetKey = (key: string): void => {
    const source = activeSnapshot?.source;
    if (!source || source.kind !== "preset") return;
    const presetId = source.presetId;
    if (!isBasslineProgressionPresetId(presetId)) {
      setPlaybackError("Preset source is unavailable.");
      return;
    }
    const next = buildBasslinePresetSnapshot({ presetId, key });
    if (!next.ok) {
      setPlaybackError(next.error.message);
      return;
    }
    setPresetKeys((current) => ({ ...current, [presetId]: key }));
    activateSnapshot(next.snapshot);
  };
  const chooseChordTimbre = (next: ChordContextChordTimbre): void => {
    if (next === chordTimbre) return;
    stopChordContext();
    setChordTimbre(next);
    invalidateRecordedFacts();
  };
  // P23-06b L3: the field moves the app-wide BPM; the screen follows it (L4), never the other way round.
  const chooseEffectiveBpm = (next: number): void => {
    setGlobalBpm(clampChordContextBpm(next, tempoBaselineBpm));
  };
  // P23-06b L4: a speed picked here or in the top bar reaches this screen; a take keeps the speed it started at
  // until it ends, then the new one applies.
  useEffect(() => {
    if (takeRunning || globalBpm === effectiveBpm) return;
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    stopChordContext();
    setEffectiveBpm(globalBpm);
    setReview(false);
    setSelfPlaying(false);
    setSelfRated(false);
    invalidateRecordedFacts();
  }, [effectiveBpm, globalBpm, invalidateRecordedFacts, stopChordContext, takeRunning]);

  const chooseLevel = (next: 1 | 2 | 3): void => {
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    stopChordContext();
    setLevel(next);
    setHint(0);
    setReview(false);
    setHeard(false);
    invalidateRecordedFacts();
  };

  const saveChordContextHistory = useCallback(async (): Promise<boolean> => {
    if (!activeSnapshot || !onChordContextHistoryRecorded || takeRunning || historySavingRef.current) return false;
    if (historyStatusRef.current === "saved") return true;
    const facts = recordingFacts ?? { effectiveBpm, listenMode, playMode: recordPlayMode, metronomeUsed, recordCompareUsed: false };
    const id = historyEntryIdRef.current ?? newChordContextHistoryId();
    historyEntryIdRef.current = id;
    const saveGeneration = historyGenerationRef.current + 1;
    historyGenerationRef.current = saveGeneration;
    historySavingRef.current = true;
    historyStatusRef.current = "saving";
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
      if (historyGenerationRef.current !== saveGeneration) return false;
      historyStatusRef.current = "saved";
      setHistoryStatus("saved");
      return true;
    } catch {
      if (historyGenerationRef.current !== saveGeneration) return false;
      historyStatusRef.current = "error";
      setHistoryStatus("error");
      return false;
    } finally {
      if (historyGenerationRef.current === saveGeneration) historySavingRef.current = false;
    }
  }, [activeSnapshot, effectiveBpm, listenMode, metronomeUsed, onChordContextHistoryRecorded, recordCompareUsed, recordPlayMode, recordingFacts, retainedTakeReference, takeRunning]);

  const saveSourceBasslineHistory = useCallback(async (): Promise<boolean> => {
    if (!sourceCandidate || !sourceWindow || !sourceLevelResult?.available || !onSourceBasslineHistoryRecorded
      || takeRunning || historySavingRef.current) return false;
    if (historyStatusRef.current === "saved") return true;
    const id = historyEntryIdRef.current ?? newSourceBasslineHistoryId();
    historyEntryIdRef.current = id;
    const saveGeneration = historyGenerationRef.current + 1;
    historyGenerationRef.current = saveGeneration;
    historySavingRef.current = true;
    historyStatusRef.current = "saving";
    setHistoryStatus("saving");
    try {
      await onSourceBasslineHistoryRecorded(createSourceBasslineHistoryEntry({
        id,
        completedAt: new Date().toISOString(),
        reference: sourceCandidate.reference,
        snapshotSignature: sourceWindow.snapshotSignature,
        ...(sourceCandidate.sourceBassline.capturedHarmony === undefined
          ? {}
          : { capturedHarmonySignature: sourceCandidate.sourceBassline.capturedHarmony.signature }),
        requestedBars: sourceWindow.requestedBars,
        startBar: sourceWindow.startBar,
        endBar: sourceWindow.endBar,
        actualBars: sourceWindow.actualBars,
        level,
        croppedSourceNoteCount: sourceWindow.croppedSourceNoteCount,
        projectedNoteCount: sourceLevelResult.targetEvents.length,
        omittedSimultaneousNoteCount: sourceWindow.omittedSimultaneousNoteCount,
        boundaryClippedNoteCount: sourceWindow.boundaryClippedNoteCount,
        overlapClippedNoteCount: sourceWindow.overlapClippedNoteCount,
        pitchReplacementCount: sourceLevelResult.pitchReplacementCount,
        capturedHarmonyComparison: sourceCandidate.harmonyComparison ?? "comparison-unavailable",
        ...(retainedTakeReference === undefined ? {} : { retainedTakeReference }),
      }));
      if (historyGenerationRef.current !== saveGeneration) return false;
      historyStatusRef.current = "saved";
      setHistoryStatus("saved");
      return true;
    } catch {
      if (historyGenerationRef.current !== saveGeneration) return false;
      historyStatusRef.current = "error";
      setHistoryStatus("error");
      return false;
    } finally {
      if (historyGenerationRef.current === saveGeneration) historySavingRef.current = false;
    }
  }, [level, onSourceBasslineHistoryRecorded, retainedTakeReference, sourceCandidate, sourceLevelResult, sourceWindow, takeRunning]);

  const restartSourceBasslineHistory = useCallback((entry: SourceBasslineHistoryEntry) => {
    const resolution = resolveSourceBasslineHistory(entry, vaultSourceBasslines ?? []);
    if (!resolution.available) {
      setHistoryRestartMessage(resolution.reason === "snapshot-mismatch"
        ? ("保存元は変更されているため、この履歴を再開できません。別のソースへ置き換えません。")
        : ("保存元が削除または利用不可のため、この履歴を再開できません。別のソースへ置き換えません。"));
      return;
    }
    const restoredWindow = buildSourceBasslinePracticeWindow(
      resolution.asset.sourceBassline,
      entry.window.requestedBars,
      entry.window.startBar,
    );
    if (
      !restoredWindow.ok
      || restoredWindow.window.endBar !== entry.window.endBar
      || restoredWindow.window.actualBars !== entry.window.actualBars
      || !restoredWindow.window.levels[entry.level].available
    ) {
      setHistoryRestartMessage("保存済み条件を正確に復元できないため、この履歴を再開できません。");
      return;
    }
    resetSourcePractice();
    sourceWindowVisibleIntentRef.current += 1;
    setBasslineSource("source-bassline");
    setSelectedSourceReference(resolution.asset.reference);
    sourceWindowBarsRef.current = entry.window.requestedBars;
    setSourceWindowBars(entry.window.requestedBars);
    setSourceWindowStartBar(entry.window.startBar);
    setLevel(entry.level);
    setHistoryRestartMessage("履歴の元ベースライン条件を復元しました。");
  }, [resetSourcePractice, vaultSourceBasslines]);

  const advancingRef = useRef(false);
  /** 記録して次へ: the same history write, then the next window (元ベースライン) or the same progression at 1 聴く. */
  const saveAndAdvance = useCallback(async () => {
    if (advancingRef.current || takeRunning) return;
    advancingRef.current = true;
    try {
      take.stopPlayback();
      const saved = await (sourceSelected ? saveSourceBasslineHistory() : saveChordContextHistory());
      if (!saved) return;
      if (sourceSelected) {
        const nextStartBar = nextWindowStart ?? 1;
        resetSourcePractice();
        setSourceWindowStartBar(nextStartBar);
        sourceWindowVisibleIntentRef.current += 1;
      } else {
        resetSourcePractice();
      }
    } finally {
      advancingRef.current = false;
    }
  }, [nextWindowStart, resetSourcePractice, saveChordContextHistory, saveSourceBasslineHistory, sourceSelected, take, takeRunning]);

  const stopListening = useCallback(() => {
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    stopChordContext();
  }, [stopChordContext]);

  const legacyListen = () => {
    stopChordContext();
    if (!exercise.ok) return;
    const generation = legacyPreviewGenerationRef.current + 1;
    legacyPreviewGenerationRef.current = generation;
    if (legacyPlaying) { stopPreview(); setLegacyPlaying(false); return; }
    void previewMidiNotes(activeTargetEvents.map((event) => ({
      pitch: event.midiNote,
      startBeat: event.startBeat,
      durationBeats: event.durationBeats,
      velocity: event.velocity,
    })), effectiveBpm, "freepats-finger-bass", {
      onStarted: () => {
        if (legacyPreviewGenerationRef.current !== generation) return;
        setLegacyPlaying(true);
        setHeard(true);
      },
      onEnded: () => { if (legacyPreviewGenerationRef.current === generation) setLegacyPlaying(false); },
    });
  };

  const useLegacyListen = !chordContextEnabled || (sourceSelected && !sourceContextPlayable);
  const listen = () => {
    if (listening) { stopListening(); return; }
    if (useLegacyListen) { legacyListen(); return; }
    void startChordContext({ practiceMode: "listen", listenMode }).then((activity) => {
      if (activity.started) setHeard(true);
    });
  };
  const openHint = () => setHint((value) => Math.min(2, value + 1));
  const record = () => {
    if (!heard || takeRunning || listening) return;
    setSelfPlaying(false);
    setSelfRated(false);
    setReview(false);
    take.reset();
    take.start();
  };
  const playWithoutTake = () => {
    if (!heard || takeRunning) return;
    take.reset();
    setReview(false);
    setSelfRated(false);
    setSelfPlaying(true);
  };
  const showAnswer = () => {
    setSelfPlaying(false);
    setSelfRated(true);
    take.reset();
    setReview(true);
  };

  const active = useEchoActive();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!active || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      let handled = true;
      if (key === "escape") {
        if (takeRunning) take.stop();
        else { take.stopPlayback(); stopListening(); }
      } else if (takeRunning) handled = false;
      else if (key === " ") { if (step === 0) listen(); else if (step === 2) take.playTarget(); else handled = false; }
      else if (key === "h" && step === 0) openHint();
      else if (key === "r" && (step === 0 || (step === 2 && !selfRated))) record();
      else if (key === "n" && step === 2) void saveAndAdvance();
      else handled = false;
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // A judged take is in: the result takes the stage.
  useEffect(() => {
    if (take.phase !== "done" || !take.result) return;
    setSelfPlaying(false);
    setSelfRated(false);
    setReview(true);
  }, [take.phase, take.result]);

  // P23-63: the 条件 panel closes on an outside press and Esc. The Vault picker's own dialog is a portal, so a press
  // inside it must not close the panel under it.
  useEffect(() => {
    if (!conditionsOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (conditionsPanelRef.current?.contains(target)) return;
      if (target?.closest?.("[data-modal-backdrop]")) return;
      if (target?.closest?.("[data-testid='bassline-conditions']")) return;
      setConditionsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [conditionsOpen]);

  if (!exercise.ok) return <p role="alert">{exercise.error.message}</p>;
  const progressionSourceLabel = activeSnapshot?.source.kind === "vault"
    ? `${"Vault進行"} \u00b7 ${activeSnapshot.source.safeLabel}`
    : activeSnapshot?.source.kind === "preset"
      ? `${"プリセット進行"} \u00b7 ${activeSnapshot.source.safeLabel}`
      : "おまかせの進行";
  const selectedSourceReferenceKey = selectedSourceReference ? sourceReferenceKey(selectedSourceReference) : "";
  const sourceUnavailableReason = !selectedSourceReference
    ? ("保存済みの元ベースラインを選んでください。")
    : !sourceCandidate
      ? ("選択した保存済み元ベースラインは利用できません。別の保存済みソースを選ぶか、生成ベースラインへ戻ってください。")
      : sourceWindowResult && !sourceWindowResult.ok
        ? ("保存済みの元ベースラインをこの区間で利用できません。")
        : ("保存済みの元ベースラインを選んでください。");
  const sourceLevelUnavailableReason = sourceSelected && sourceWindow && sourceLevelResult && !sourceLevelResult.available
    ? sourceSimplificationReason(sourceLevelResult.reason)
    : undefined;
  const unavailableSimplification = sourceWindow
    ? [sourceWindow.levels[1], sourceWindow.levels[2]].find((result) => !result.available)
    : undefined;
  const sourceSimplificationAvailabilityReason = unavailableSimplification && !unavailableSimplification.available
    ? sourceSimplificationReason(unavailableSimplification.reason)
    : undefined;
  const sourceHarmonyComparisonLabel = sourceCandidate
    ? sourceCandidate.harmonyComparison === "match"
      ? ("保存時の和声と現在の進行: 一致")
      : sourceCandidate.harmonyComparison === "mismatch"
        ? ("保存時の和声と現在の進行: 不一致（簡略化とChord Contextは保存時の和声を使用）")
        : ("保存時の和声と現在の進行: 比較できません")
    : undefined;
  const sourceContextReason = sourceSelected && !sourceContextPlayable
    ? !sourceAvailable
      ? sourceUnavailableReason
      : sourceWindow?.harmonyUnavailableReason
        ? ("正確な保存済み和声がないため、Chord Contextは利用できません。録音は伴奏なしで利用できます。")
        : ("この区間の音域はChord Contextの安全なベース範囲外です。録音は伴奏なしで利用できます。")
    : undefined;
  const sourceLevelDescriptionId = sourceLevelUnavailableReason ? "source-bassline-level-unavailable" : undefined;
  const sourceEmptyDescriptionId = sourceSelected && sourceWindow && sourceLevelAvailable && !hasPracticeTarget ? "source-bassline-empty" : undefined;
  const sourceUnavailableDescriptionId = sourceSelected && !sourceAvailable ? "source-bassline-unavailable" : undefined;
  const recordDescriptionId = sourceLevelDescriptionId ?? sourceEmptyDescriptionId ?? sourceUnavailableDescriptionId;
  const hasVaultProgressions = pickerCandidates.length > 0;
  const activePresetId = activeSnapshot?.source.kind === "preset" ? activeSnapshot.source.presetId : undefined;
  const activePreset = activePresetId === undefined
    ? undefined
    : BASSLINE_PROGRESSION_PRESETS.find((preset) => preset.id === activePresetId);
  const selectedProgressionSource = activePresetId ?? (activeSnapshot?.source.kind === "vault" ? "vault" : "generated");

  // ── what the stage shows ──
  const bars = Math.max(1, Math.ceil(windowLengthBeats / 4));
  const tonic = tonicLabel(activeSnapshot?.tonalContext.key ?? "C major");
  const mode = activeSnapshot?.tonalContext.mode ?? ((activeSnapshot?.tonalContext.key ?? "").endsWith("minor") ? "minor" : "major");
  const meta = `${keyLabel(tonic, mode)} · ${effectiveBpm} BPM · ${bars} 小節`;
  const progressionName = sourceSelected
    ? "元のベースライン"
    : activeSnapshot?.source.kind === "vault"
      ? progressionSourceLabel
      : activePreset?.name ?? formatProgressionChords(activeSnapshot?.section.chords);
  const conditionsChip = !chordContextEnabled
    ? `レベル ${level} · ${effectiveBpm} BPM`
    : sourceSelected
      ? `元のベースライン${sourceWindow ? ` · ${sourceWindow.startBar}〜${sourceWindow.endBar} 小節` : ""} · レベル ${level} · ${effectiveBpm} BPM`
      : `${progressionName} · ${tonic} · レベル ${level} · ${effectiveBpm} BPM`;
  const chordNames = sourceSelected
    ? sourceWindow && activeSnapshot && sourceCandidate?.harmonyComparison === "match"
      && sourceWindow.startBar >= activeSnapshot.section.startBar && sourceWindow.endBar <= activeSnapshot.section.endBar
      ? chordLabelsForWindow(activeSnapshot.section, sourceWindow.startBar, windowLengthBeats)
      : undefined
    : activeSnapshot
      ? activeSnapshot.section.chords.map((chord) => ({ startBeat: chord.startBeat, label: chord.label }))
      : undefined;
  const hiddenNotes: LaneNote[] = activeTargetEvents.map((event, index) => ({
    startBeat: event.startBeat,
    durationBeats: event.durationBeats,
    kind: "hide",
    text: hint >= 2 ? noteName(event.midiNote) : "?",
    label: hint >= 2 ? `お手本 ${index + 1} 音目 ${noteName(event.midiNote)}` : `${index + 1} 音目`,
  }));
  const answerNotes: LaneNote[] = activeTargetEvents.map((event, index) => ({
    startBeat: event.startBeat,
    durationBeats: event.durationBeats,
    kind: "ref",
    text: noteName(event.midiNote),
    label: `お手本 ${index + 1} 音目 ${noteName(event.midiNote)}`,
  }));
  const hintChips: readonly HintChip[] = [
    { id: "count", label: "音の数", openLabel: `${activeTargetEvents.length} 音` },
    { id: "names", label: "音名と指板" },
  ];
  const fretDots = (marks?: BassAnalysis["marks"]) => activeTargetEvents.map((event, index) => ({
    midiNote: event.midiNote,
    label: noteName(event.midiNote),
    ...(marks && marks[index]?.kind !== "ok" ? { tone: "warn" as const } : {}),
  }));
  const fretboard = (marks?: BassAnalysis["marks"]) => (
    <StageFretboard
      dots={fretDots(marks)}
      stringCount={instrument?.stringCount ?? 4}
      fretRange={instrument?.fretRange ?? { min: 0, max: 12 }}
      handedness={instrument?.handedness ?? "right"}
    />
  );
  const accompanimentLabel = sourceSelected && !sourceContextPlayable
    ? "なし"
    : recordPlayMode === "chords-and-metronome" ? "コード + メトロノーム" : "コードのみ";
  const recordBlockedReason = !hasPracticeTarget
    ? (sourceSelected ? "この区間にはベース音がありません。別の区間へ移動してください。" : "録るための音がありません。")
    : !sourceRecordEligible
      ? `この${sourceWindow?.actualBars ?? 0}小節区間は${effectiveBpm} BPMで60秒を超えるため、新しい録音を開始できません。`
      : undefined;
  const recordReasonId = recordBlockedReason ? "bassline-record-reason" : undefined;
  const result = judgedResult;
  const counts = result?.counts;
  const takeBeats = windowLengthBeats;
  const errorLine = playbackError;

  const tools = (
    <StageTools>
      <span className="lv-popover-anchor">
        <Chip
          aria-expanded={conditionsOpen}
          aria-controls={conditionsPanelId}
          data-testid="bassline-conditions"
          title={conditionsChip}
          style={{ display: "inline-block", maxWidth: "min(420px, calc(100vw - 96px))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          onClick={() => setConditionsOpen((open) => !open)}
        >
          {conditionsChip}
        </Chip>
        {conditionsOpen ? <div
          id={conditionsPanelId}
          ref={conditionsPanelRef}
          role="dialog"
          aria-label="コード進行のベースの条件"
          className="lv-popover bp-tools-panel"
          style={{ top: "100%", left: "auto", right: 0, width: "min(340px, calc(100vw - 48px))", maxHeight: "min(70vh, 560px)", overflowY: "auto" }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
            event.stopPropagation();
            setConditionsOpen(false);
          }}
        >
          {chordContextEnabled ? <>
          {/* 1 練習する進行 */}
          <div className="grid gap-1">
            <p>練習する進行</p>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                id="bassline-progression-select"
                name="bassline-progression-select"
                data-testid="bassline-progression-select"
                aria-label="練習する進行"
                className="min-w-0 flex-1"
                disabled={takeRunning || preparing}
                value={selectedProgressionSource}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (value !== "vault") choosePreset(value as BasslineProgressionPresetId | "generated");
                }}
              >
                <option value="generated">{"現在のデフォルト（生成）"}</option>
                {activeSnapshot?.source.kind === "vault" ? <option value="vault">{`Vault: ${activeSnapshot.source.safeLabel}`}</option> : null}
                {BASSLINE_PROGRESSION_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </Select>
              <VaultProgressionPicker
                candidates={pickerCandidates}
                activeSignature={activeSnapshot?.source.kind === "vault" ? activeSnapshot.signature : undefined}
                disabled={takeRunning || preparing}
                onConfirm={chooseProgression}
              />
            </div>
            {activeSnapshot?.source.kind !== "generated" && generatedSnapshot.ok ? <Button
              data-testid="bassline-progression-use-default"
              variant="ghost"
              size="sm"
              disabled={takeRunning || preparing}
              onClick={() => activateSnapshot(generatedSnapshot.snapshot)}
            >
              {"現在のデフォルトに戻す"}
            </Button> : null}
            {!hasVaultProgressions ? <p>{"Vaultの進行は、保存するとここに並びます。"}</p> : null}
          </div>

          {/* 2 プリセットのキー */}
          {activePreset ? <div className="grid gap-1"><p>プリセットのキー</p>
            <Select
              id="bassline-preset-key-select"
              name="bassline-preset-key-select"
              data-testid="bassline-preset-key-select"
              aria-label="プリセットのキー"
              className="w-full"
              disabled={takeRunning || preparing}
              value={activeSnapshot?.tonalContext.key ?? activePreset.defaultKey}
              onChange={(event) => choosePresetKey(event.currentTarget.value)}
            >
              {presetKeyOptions(activePreset.defaultKey).map((key) => <option key={key} value={key}>{key}</option>)}
            </Select>
          </div> : null}

          {/* 3 ベースライン */}
          <div className="grid gap-1"><p>ベースライン</p>
            <Select
              id="bassline-line-source"
              name="bassline-line-source"
              data-testid="bassline-line-source"
              aria-label="ベースライン"
              className="w-full"
              aria-describedby={sourceSelected && !sourceAvailable ? "bassline-line-source-description source-bassline-unavailable" : "bassline-line-source-description"}
              disabled={takeRunning || preparing}
              value={basslineSource}
              onChange={(event) => chooseBasslineSource(event.currentTarget.value as "generated" | "source-bassline")}
            >
              <option value="generated">{"作る"}</option>
              <option value="source-bassline" disabled={!sourceCatalogAvailable && !sourceSelected}>{"元のベースライン"}</option>
            </Select>
          </div>
          {sourceSelected ? <div className="grid gap-1"><p>保存済みの元ベースライン</p>
            <Select
              id="source-bassline-vault-select"
              data-testid="source-bassline-vault-select"
              aria-label="保存済みの元ベースライン"
              className="w-full min-w-0"
              aria-describedby="source-bassline-selection-description"
              disabled={takeRunning || preparing || !sourceCatalogAvailable}
              value={selectedSourceReferenceKey}
              onChange={(event) => chooseSourceReference(event.currentTarget.value)}
            >
              <option value="" disabled>{"選択してください"}</option>
              {selectedSourceReference && !sourceCandidate ? <option value={selectedSourceReferenceKey} disabled>{"選択したソースは利用できません"}</option> : null}
              {(vaultSourceBasslines ?? []).map((candidate, index) => <option key={sourceReferenceKey(candidate.reference)} value={sourceReferenceKey(candidate.reference)}>{candidate.displayTitle} · {index + 1}</option>)}
            </Select>
            <p id="source-bassline-selection-description">{"Vaultの項目参照だけを使い、ノート列は複製しません。"}</p>
          </div> : null}
          {sourceSelected && !sourceAvailable ? <p id="source-bassline-unavailable" aria-live="polite">{sourceUnavailableReason}</p> : null}
          {!sourceSelected && !sourceCatalogAvailable ? <p>{"元ベースライン付きの進行をVaultへ保存すると選べます。"}</p> : null}
          </> : null}

          {/* 4 レベル */}
          <div className="grid gap-1"><p>レベル</p>
            <Select
              id="bassline-level"
              name="bassline-level"
              aria-label="ベースラインのレベル"
              aria-describedby={sourceSelected ? "bassline-level-description" : undefined}
              className="w-full"
              disabled={takeRunning || (sourceSelected && !sourceWindow)}
              value={level}
              onChange={(event) => chooseLevel(Number(event.currentTarget.value) as SourceBasslinePracticeLevel)}
            >
              {sourceSelected ? <>
                <option value={1} disabled={!sourceWindow?.levels[1].available}>{"1 - ルート中心の簡略版"}</option>
                <option value={2} disabled={!sourceWindow?.levels[2].available}>{"2 - コードトーン簡略版"}</option>
                <option value={3}>{"3 - 元ライン（単音化）"}</option>
              </> : <>
                <option value={1}>{"1 - ルート"}</option>
                <option value={2}>{"2 - コードトーン"}</option>
                <option value={3}>{"3 - アプローチ"}</option>
              </>}
            </Select>
          </div>
          {sourceSelected ? <p id="bassline-level-description" aria-live="polite">{sourceLevelUnavailableReason ?? sourceSimplificationAvailabilityReason ?? "保存済み和声から決定的に導出し、元スナップショットは変更しません。"}</p> : null}

          {/* 5 区間 (元のベースライン) */}
          {sourceSelected ? <section className="grid min-w-0 gap-2 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-2" aria-labelledby="source-bassline-window-heading" data-testid="source-bassline-window">
            <h3 id="source-bassline-window-heading" className="text-xs font-semibold">{sourceLevelLabel(level)}</h3>
            {sourceHarmonyComparisonLabel ? <p role="status" aria-live="polite" data-testid="source-bassline-harmony-comparison">{sourceHarmonyComparisonLabel}</p> : null}
            <fieldset className="min-w-0" aria-describedby="source-bassline-window-selector-reason">
              <legend className="text-xs text-[var(--lv-text-secondary)]">{"区間の長さ"}</legend>
              <div role="group" aria-label={"元ベースラインの区間の長さ"} data-testid="source-bassline-window-bars" className="mt-1 grid w-full grid-cols-4 overflow-hidden rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)]">
                {([1, 2, 4, 8] as const).map((windowBars) => <button
                  key={windowBars}
                  type="button"
                  aria-pressed={sourceWindowBars === windowBars}
                  disabled={takeRunning || !sourceWindow}
                  className={`min-h-10 border-r border-[var(--lv-border)] px-2 text-sm font-semibold last:border-r-0 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--lv-accent)] ${sourceWindowBars === windowBars ? "bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : "bg-[var(--lv-surface)] text-[var(--lv-text-secondary)]"}`}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    chooseSourceWindowBars(windowBars);
                  }}
                  onClick={() => chooseSourceWindowBars(windowBars)}
                >{windowBars}</button>)}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50" data-testid="source-bassline-previous" aria-disabled={takeRunning || previousWindowStart === undefined || undefined} aria-describedby={previousWindowStart === undefined ? "source-bassline-previous-reason" : undefined} disabled={takeRunning} onClick={() => moveSourceWindow(previousWindowStart)}>{"前の区間"}</Button>
              <Button type="button" variant="ghost" size="sm" className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50" data-testid="source-bassline-next" aria-disabled={takeRunning || nextWindowStart === undefined || undefined} aria-describedby={nextWindowStart === undefined ? "source-bassline-next-reason" : undefined} disabled={takeRunning} onClick={() => moveSourceWindow(nextWindowStart)}>{"次の区間"}</Button>
            </div>
            <p id="source-bassline-window-selector-reason">{takeRunning
              ? ("録音中は区間の長さを変更できません。")
              : !sourceWindow ? sourceUnavailableReason : ("1、2、4、8小節から選べます。")}</p>
            {sourceWindowPreferenceError ? <p role="alert" className="text-[var(--lv-danger)]" data-testid="source-bassline-window-save-error">{sourceWindowPreferenceError}</p> : null}
            <p id="source-bassline-previous-reason" className="sr-only">{previousWindowStart === undefined ? ("最初の区間です。") : ""}</p>
            <p id="source-bassline-next-reason" className="sr-only">{nextWindowStart === undefined ? ("最後の区間です。") : ""}</p>
            <p aria-live="polite" data-testid="source-bassline-range" className="font-medium">{sourceWindow ? (`${sourceWindow.startBar}〜${sourceWindow.endBar}小節${sourceWindow.actualBars < sourceWindow.requestedBars ? "（最終区間）" : ""}`) : sourceUnavailableReason}</p>
            {sourceWindow ? <p data-testid="source-bassline-projection-facts">{`切り出しノート ${sourceWindow.croppedSourceNoteCount} / 単音投影 ${sourceWindow.targetEvents.length} / レベル対象 ${activeTargetEvents.length} / 同時発音の省略 ${sourceWindow.omittedSimultaneousNoteCount} / 境界clip ${sourceWindow.boundaryClippedNoteCount} / 重なりduration clip ${sourceWindow.overlapClippedNoteCount} / pitch置換 ${sourcePitchReplacementCount}`}</p> : null}
            {sourceLevelUnavailableReason ? <p id="source-bassline-level-unavailable" role="status" data-testid="source-bassline-level-unavailable" className="text-[var(--lv-warning)]">{sourceLevelUnavailableReason}</p> : null}
            {sourceWindow && sourceLevelAvailable && !hasPracticeTarget ? <p id="source-bassline-empty" role="status" data-testid="source-bassline-empty" className="text-[var(--lv-warning)]">{"この区間にはベース音がありません。別の区間へ移動してください。"}</p> : null}
          </section> : null}

          {chordContextEnabled ? <>
          {/* 6 テンポ */}
          <fieldset data-testid="chord-context-tempo">
            <legend className="text-xs text-[var(--lv-text-secondary)]">{"テンポ"}</legend>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input id="chord-context-effective-bpm" data-testid="chord-context-effective-bpm" aria-label="BPM" type="number" min={30} max={240} step={1} value={effectiveBpm} disabled={takeRunning} onChange={(event) => chooseEffectiveBpm(event.currentTarget.valueAsNumber)} onBlur={(event) => chooseEffectiveBpm(event.currentTarget.valueAsNumber)} className="bass-input w-20" />
              <Button type="button" variant="ghost" size="sm" data-testid="chord-context-bpm-plus-four" onClick={() => chooseEffectiveBpm(effectiveBpm + 4)} disabled={takeRunning || effectiveBpm >= 240}>+4 BPM</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => chooseEffectiveBpm(tempoBaselineBpm)} disabled={takeRunning || effectiveBpm === tempoBaselineBpm}>{sourceSelected ? ("目安に戻す") : ("元のテンポに戻す")}</Button>
            </div>
            <p className="mt-1">{sourceSelected
              ? (`目安: ${SOURCE_SESSION_DEFAULT_BPM} BPM。ここで変えると、上の共通 BPM が変わります。Vault は変わりません。`)
              : (`元のテンポ: ${tempoBaselineBpm} BPM。ここで変えると、上の共通 BPM が変わります。Vault は変わりません。`)}</p>
            {takeRunning && globalBpm !== effectiveBpm ? (
              <p role="status" data-testid="chord-context-tempo-pending" className="mt-1">
                {"録音中は "}{effectiveBpm}{" BPM のままです。終わると "}{globalBpm}{" BPM になります。残していない録音は消えます。"}
              </p>
            ) : null}
          </fieldset>

          {/* 7 コードの音色 */}
          <div className="grid gap-1"><p>コードの音色</p>
            <Select id="chord-context-timbre" name="chord-context-timbre" data-testid="chord-context-timbre" aria-label="コードの音色" className="w-full" disabled={takeRunning} value={chordTimbre} onChange={(event) => chooseChordTimbre(event.currentTarget.value as ChordContextChordTimbre)}>
              <option value="electric">{"エレクトリック"}</option>
              <option value="piano">{"ピアノ"}</option>
            </Select>
          </div>

          {/* 8 聴く時に鳴らす */}
          <div className="grid gap-1"><p>聴く時に鳴らす</p>
            <Select id="chord-context-listen-mode" data-testid="chord-context-listen-mode" aria-label="聴く時に鳴らす" className="w-full" disabled={takeRunning} value={listenMode} onChange={(event) => chooseListenMode(event.currentTarget.value as ChordContextListenMode)}>
              {listenModeOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </div>

          {/* 9 弾く時に鳴らす */}
          {sourceSelected && !sourceContextPlayable ? <div className="grid gap-1">
            <p>弾く時に鳴らす</p>
            <p>{"伴奏なし(ヘッドホンで)"}</p>
            {sourceContextReason ? <p id="source-bassline-context-reason" role="status" data-testid="source-bassline-context-reason">{sourceContextReason}</p> : null}
          </div> : <div className="grid gap-1"><p>弾く時に鳴らす</p>
            <Select id="chord-context-play-mode" data-testid="chord-context-play-mode" aria-label="弾く時に鳴らす" className="w-full" disabled={takeRunning} value={recordPlayMode} onChange={(event) => chooseRecordPlayMode(event.currentTarget.value as ChordContextPlayMode)}>
              {recordPlayModeOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </div>}

          {/* 10 前の練習から */}
          {sourceBasslineHistory.length ? <section className="grid gap-2 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-2" aria-labelledby="source-bassline-history-heading" data-testid="source-bassline-history">
            <h3 id="source-bassline-history-heading" className="text-xs font-semibold">{"前の練習から"}</h3>
            <ul className="grid min-w-0 gap-2">
              {[...sourceBasslineHistory].reverse().slice(0, 20).map((entry) => {
                const resolution = resolveSourceBasslineHistory(entry, vaultSourceBasslines ?? []);
                return <li key={entry.id} className="min-w-0">
                  <p className="break-words font-medium">{sourceLevelLabel(entry.level)} · {`${entry.window.startBar}〜${entry.window.endBar}小節`}</p>
                  <p className="break-words">{`単音投影 ${entry.facts.projectedNoteCount} / pitch置換 ${entry.facts.pitchReplacementCount} / 保存元 ${resolution.available ? "利用可能" : resolution.reason === "snapshot-mismatch" ? "変更済み" : "なし"}`}</p>
                  <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => restartSourceBasslineHistory(entry)}>{"この条件を再開"}</Button>
                </li>;
              })}
            </ul>
            {historyRestartMessage ? <p aria-live="polite" data-testid="source-bassline-history-restart-status">{historyRestartMessage}</p> : null}
          </section> : null}
          </> : null}
        </div> : null}
      </span>
    </StageTools>
  );

  // ── 2 弾く: the take is running (or failed), or the player plays without a take ──
  if (step === 1) {
    const recordingNow = take.phase === "recording";
    return (
      <StageFrame step={1} keys={takeRunning ? "Esc 止める" : selfPlaying ? "Space 答えを見る" : "R もう一度録る"} testId="bassline-echo-view" state={practiceState}>
        {tools}{take.recorder}
        <p className="bp-meta">{meta}</p>
        {take.phase === "counting" ? <StageCount beats={4} current={take.count} /> : null}
        <p className="bp-say">{
          take.phase === "analyzing" ? "判定しています…"
            : take.phase === "failed" ? "うまく録れませんでした"
              : selfPlaying ? "ベースで弾いてください"
                : take.phase === "counting" || take.phase === "preparing" ? "カウントのあとに弾き始めます"
                  : "伴奏に合わせて弾いてください"
        }</p>
        {selfPlaying ? <p className="bp-sub">録音はしません。弾き終えたら答えを見ます。</p> : null}
        <StageLane
          lengthBeats={takeBeats}
          beatsPerBar={4}
          wide={takeBeats > 8}
          rows={selfPlaying ? [{ label: "お手本", notes: hiddenNotes }] : [{ label: "お手本", notes: hiddenNotes }, { label: "自分", notes: [] }]}
          {...(chordNames?.length ? { chords: chordNames } : {})}
          {...(recordingNow && take.beat !== undefined ? { playhead: take.beat } : {})}
        />
        {take.phase === "failed" ? <p className="bp-note-line" role="alert">{take.error}</p> : null}
        {recordingNow ? (
          <p className="bp-note-line" data-testid="bassline-input-line"><StageMeter level={take.inputLevel} />{take.inputLevel > 0.004 ? "入力に音が届いています" : "入力に音が来ていません。機器とチャンネルを確かめてください"} · 伴奏 {accompanimentLabel} · 録音は判定にだけ使い、保存しません</p>
        ) : null}
        <div className="bp-actions">
          {takeRunning ? <StageButton tone="record" keyHint="Esc" onClick={take.stop} data-testid="bassline-stop">■ 止める</StageButton> : null}
          {selfPlaying ? <StageButton tone="primary" keyHint="Space" onClick={showAnswer} data-testid="bassline-show-answer">弾けた・答えを見る</StageButton> : null}
          {take.phase === "failed" ? <>
            <StageButton onClick={showAnswer} data-testid="bassline-self-rate">答えを見る</StageButton>
            {!take.unavailable ? <StageButton tone="primary" keyHint="R" onClick={record} data-testid="bassline-retry">● もう一度録る</StageButton> : null}
          </> : null}
        </div>
        {errorLine ? <p className="bp-note-line" role="alert">{errorLine}</p> : null}
      </StageFrame>
    );
  }

  // ── 3 結果 ──
  if (step === 2) {
    const facts: ResultFact[] = counts ? [
      { text: `合った ${counts.correct}`, tone: "ok" },
      { text: `音が違う ${counts.wrongPitch}`, tone: "ng" },
      { text: `早い・遅い ${counts.timing}`, tone: "warn" },
      ...(counts.missed ? [{ text: `抜け ${counts.missed}`, tone: "mute" as const }] : []),
      ...(counts.extra ? [{ text: `余分な音 ${counts.extra}`, tone: "ng" as const }] : []),
      { text: `タイミング 平均 ${result!.meanOffsetMs >= 0 ? "+" : ""}${Math.round(result!.meanOffsetMs)}ms` },
      { text: `伴奏 ${accompanimentLabel}` },
    ] : [{ text: `伴奏 ${accompanimentLabel}` }];
    const good = Boolean(counts && counts.total && counts.correct / counts.total >= 0.75);
    return (
      <StageFrame step={2} keys="Space お手本 · R 録り直す · N 記録して次へ" tone={good ? "good" : undefined} testId="bassline-echo-view" state={practiceState}>
        {tools}{take.recorder}
        {counts
          ? <StageResultHead big={`${counts.correct} / ${counts.total}`} label="音が合いました" facts={facts} />
          : <StageResultHead big="答え" label="お手本と比べてください" facts={facts} />}
        <StageLane
          lengthBeats={takeBeats}
          beatsPerBar={4}
          wide={takeBeats > 8}
          rows={result
            ? [{ label: "お手本", notes: answerNotes }, { label: "自分", notes: takeNotes(result, effectiveBpm, takeBeats + 1, activeTargetEvents) }]
            : [{ label: "お手本", notes: answerNotes }]}
          {...(chordNames?.length ? { chords: chordNames } : {})}
          {...(take.beat !== undefined && take.playing ? { playhead: take.beat } : {})}
        />
        {fretboard(result?.marks)}
        {historyStatus === "error" ? <p className="bp-note-line" role="alert" data-testid="bassline-history-error">{"練習の記録を残せませんでした。"}</p> : null}
        <div className="bp-actions" data-testid="bassline-result-actions">
          <StageButton onClick={take.playTarget} aria-pressed={take.playing === "target"}>▶ お手本</StageButton>
          {result ? <>
            <StageButton onClick={take.playTake} aria-pressed={take.playing === "take"}>▶ 自分</StageButton>
            <StageButton onClick={take.playOverlay} aria-pressed={take.playing === "overlay"}>▶ 重ねて</StageButton>
            <StageButton onClick={take.keep} disabled={take.recorderStatus === "saved"} data-testid="bassline-keep-take">{take.recorderStatus === "saved" ? "残しました" : "録音を残す"}</StageButton>
          </> : null}
          <span className="bp-actions-gap" aria-hidden="true" />
          {!selfRated ? <StageButton keyHint="R" onClick={record} data-testid="bassline-record-again">● 録り直す</StageButton> : null}
          <StageButton tone="primary" keyHint="N" disabled={historyStatus === "saving"} onClick={() => void saveAndAdvance()} data-testid="bassline-next">
            {historyStatus === "saving" ? "記録しています…" : "記録して次へ"}
          </StageButton>
        </div>
        <p className="bp-note-line">{"『記録して次へ』で練習の記録に残します(判定の数は残しません)"}</p>
        {errorLine ? <p className="bp-note-line" role="alert">{errorLine}</p> : null}
      </StageFrame>
    );
  }

  // ── 1 聴く ──
  const recordDisabled = !heard || listening || Boolean(recordBlockedReason);
  return (
    <StageFrame step={0} keys="Space 聴く · H ヒント · R 録って弾く" testId="bassline-echo-view" state={practiceState}>
      {tools}{take.recorder}
      <p className="bp-meta">{meta}</p>
      <p className="bp-say">{sourceSelected ? "元のベースラインを聴いて弾きます" : "コード進行の上で、ベースラインを聴いて弾きます"}</p>
      <StageLane
        lengthBeats={takeBeats}
        beatsPerBar={4}
        wide={takeBeats > 8}
        rows={[{ label: "お手本", notes: hiddenNotes }]}
        {...(chordNames?.length ? { chords: chordNames } : {})}
      />
      <div className="bp-playrow">
        {useLegacyListen
          ? <span style={{ width: 120 }} aria-hidden="true" />
          : <StageButton onClick={() => chooseListenMode(nextListenMode(listenMode))} data-testid="bassline-listen-mode">{listenModeLabel(listenMode)}</StageButton>}
        <StagePlayButton playing={listening} label={listening ? "止める" : "お手本を聴く"} disabled={!listening && !hasPracticeTarget} aria-describedby={!hasPracticeTarget ? sourceUnavailableDescriptionId : undefined} onClick={listen} data-testid="bassline-listen" />
        <span className="bp-note-line" style={{ width: 120 }}>{"何度でも聴けます"}</span>
      </div>
      <StageHints chips={hintChips} open={hint} disabled={!hasPracticeTarget} onOpen={openHint} />
      {hint >= 2 ? fretboard() : null}
      <div className="bp-actions">
        <StageButton disabled={!heard || listening} onClick={playWithoutTake} data-testid="bassline-play-without-take">録らずに弾く</StageButton>
        <StageButton tone="primary" keyHint="R" disabled={recordDisabled} aria-describedby={recordReasonId ?? recordDescriptionId} onClick={record} data-testid="bassline-record">● 録って弾く</StageButton>
      </div>
      {!heard ? <p className="bp-note-line">{"まず ▶ で聴きます"}</p> : null}
      {recordBlockedReason ? <p id="bassline-record-reason" data-testid="bassline-record-reason" className="bp-note-line">{recordBlockedReason}</p> : null}
      {errorLine ? <p className="bp-note-line" role="alert">{errorLine}</p> : null}
    </StageFrame>
  );
}

function formatProgressionChords(chords?: readonly { readonly label: string }[]): string {
  const labels = (chords ?? []).map((chord) => chord.label.trim()).filter(Boolean);
  if (labels.length === 0) return "おまかせの進行";
  return labels.length > 4 ? `${labels.slice(0, 3).join("\u2013")}…` : labels.join("\u2013");
}

interface ContextModeOption<T extends string> { readonly value: T; readonly label: string; }

function listenModeOptions(): readonly ContextModeOption<ChordContextListenMode>[] {
  return [
    { value: "bass-only", label: "ベースのみ" },
    { value: "chords-only", label: "コードのみ" },
    { value: "bass-and-chords", label: "ベース + コード" },
    { value: "bass-chords-and-metronome", label: "ベース + コード + メトロノーム" },
  ];
}

function recordPlayModeOptions(): readonly ContextModeOption<Extract<ChordContextPlayMode, "chords-only" | "chords-and-metronome">>[] {
  return [
    { value: "chords-only", label: "コードのみ" },
    { value: "chords-and-metronome", label: "コード + メトロノーム" },
  ];
}

function listenModeLabel(mode: ChordContextListenMode): string {
  return listenModeOptions().find((option) => option.value === mode)?.label ?? mode;
}

function nextListenMode(mode: ChordContextListenMode): ChordContextListenMode {
  const options = listenModeOptions();
  const index = options.findIndex((option) => option.value === mode);
  return options[(index + 1) % options.length]!.value;
}

function toChordContextInput(
  snapshot: ChordContextSnapshot,
  bassEvents: readonly { readonly index: number; readonly midiNote: number; readonly startBeat: number; readonly durationBeats: number; readonly velocity: number }[],
  effectiveBpm: number,
  practiceMode: PracticeMode,
  listenMode: ChordContextListenMode,
  playMode: ChordContextPlayMode,
  capturedHarmony?: readonly SourceBasslineHarmonyEvent[],
  savedMidiNotesByChordId?: SavedChordNotes,
): ChordContextPlaybackInput {
  const source = {
    bpm: effectiveBpm,
    meter: snapshot.meter,
    chordEvents: capturedHarmony
      ? capturedHarmony.map((event) => ({
        id: event.id,
        pitchClasses: event.pitchClasses,
        startBeat: event.startBeat,
        durationBeats: event.durationBeats,
      }))
      : snapshot.section.chords.map((chord) => ({
        id: chord.id,
        ...(savedMidiNotesByChordId?.[chord.id] ? {savedMidiNotes: savedMidiNotesByChordId[chord.id]} : {}),
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

/** The chord names of a source window, taken from the progression the source was saved with (only when it matches). */
function chordLabelsForWindow(
  section: ChordContextSnapshot["section"],
  windowStartBar: number,
  windowLengthBeats: number,
): readonly { readonly startBeat: number; readonly label: string }[] {
  const offsetBeats = (windowStartBar - section.startBar) * 4;
  return section.chords
    .map((chord) => ({ label: chord.label, start: chord.startBeat - offsetBeats, end: chord.startBeat - offsetBeats + chord.durationBeats }))
    .filter(({ start, end }) => end > 0 && start < windowLengthBeats)
    .map(({ label, start }) => ({ startBeat: Math.max(0, start), label }));
}

function isBasslineProgressionPresetId(value: string): value is BasslineProgressionPresetId {
  return BASSLINE_PROGRESSION_PRESETS.some((preset) => preset.id === value);
}
function sameSourceReference(
  left: VaultSourceBasslineCandidateView["reference"],
  right: VaultSourceBasslineCandidateView["reference"],
): boolean {
  return left.ideaId === right.ideaId && left.blockId === right.blockId;
}

function sourceReferenceKey(reference: VaultSourceBasslineCandidateView["reference"]): string {
  return `${encodeURIComponent(reference.ideaId)}:${encodeURIComponent(reference.blockId)}`;
}

function presetKeyOptions(defaultKey: string): readonly string[] {
  const modeName = defaultKey.endsWith(" minor") ? "minor" : "major";
  return PRESET_TONICS.map((tonic) => `${tonic} ${modeName}`);
}
function clampChordContextBpm(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(30, Math.min(240, Math.round(value)));
}

/** 「C」/「B♭」: the tonic of a snapshot key (「C major」 → 「C」). */
function tonicLabel(key: string): string {
  const tonic = key.replace(/\s+(major|minor)$/i, "").trim() || "C";
  return tonic.replace(/b$/, "♭").replace(/#$/, "♯");
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

function newSourceBasslineHistoryId(): string {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  return "source-bassline-history:" + value;
}
function sourceLevelLabel(level: SourceBasslinePracticeLevel): string {
  if (level === 1) return "ルート中心の簡略版";
  if (level === 2) return "コードトーン簡略版";
  return "元ライン（単音化）";
}
function sourceSimplificationReason(
  reason: "missing-harmony" | "harmony-gap" | "conflicting-harmony" | "unsafe-playable-range",
): string {
  if (reason === "missing-harmony") return "正確な保存済み和声がないため、この簡略レベルは利用できません。レベル3は利用できます。";
  if (reason === "harmony-gap") return "ターゲット開始位置に保存済み和声の空白があるため、この簡略レベルは利用できません。";
  if (reason === "conflicting-harmony") return "保存済み和声が一意でないため、この簡略レベルは利用できません。";
  return "安全なベース音域へ決定的に割り当てられないため、この簡略レベルは利用できません。";
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
