import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ear, Lightbulb, Square } from "lucide-react";
import { stopPreview, previewMidiNotes } from "../../../audio/chordPreview";
import { Button, Field, Surface } from "../../../components/ui";
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
  DEFAULT_CHORD_CONTEXT_PLAY_MODE,
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
import { RecordCompareSection } from "../recording/ui/RecordCompareSection";
import { createTargetPlayer } from "../recording/application/playback";
import { EchoPracticeHeader, EchoPracticeProgress } from "./EchoPracticeChrome";
import type { VaultPickerCandidateView, VaultSourceBasslineCandidateView } from "../application/vaultPickerCandidates";
import { VaultProgressionPicker } from "./VaultProgressionPicker";

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
const BASSLINE_STEPS = {
  ja: ["設定", "聴く", "演奏", "レビュー"],
} as const;

export interface BasslinePracticeViewProps {
  readonly chordContextSnapshot?: ChordContextSnapshot;
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

export function BasslinePracticeView({
  chordContextSnapshot,
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
  const [legacyPlaying, setLegacyPlaying] = useState(false);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("listen");
  const [listenMode, setListenMode] = useState<ChordContextListenMode>(DEFAULT_CHORD_CONTEXT_LISTEN_MODE);
  const [playMode, setPlayMode] = useState<ChordContextPlayMode>(DEFAULT_CHORD_CONTEXT_PLAY_MODE);
  const [chordTimbre, setChordTimbre] = useState<ChordContextChordTimbre>("electric");
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
  const [effectiveBpm, setEffectiveBpm] = useState(() => activeSnapshot?.originalBpm ?? SOURCE_SESSION_DEFAULT_BPM);
  const sourceRecordEligible = !sourceSelected || !sourceWindow
    || isSourceBasslineRecordEligible(sourceWindow.actualBars, effectiveBpm);
  const [recordPlayMode, setRecordPlayMode] = useState<Extract<ChordContextPlayMode, "chords-only" | "chords-and-metronome">>("chords-only");
  const [recordCompareUsed, setRecordCompareUsed] = useState(false);
  const [metronomeUsed, setMetronomeUsed] = useState(false);
  const [recordingInFlight, setRecordingInFlight] = useState(false);
  const [hasUnkeptRecordingTake, setHasUnkeptRecordingTake] = useState(false);
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
    setHasUnkeptRecordingTake(false);
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
  useEffect(() => {
    stopChordContext();
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    setSourceWindowStartBar(1);
    setEffectiveBpm(tempoBaselineBpm);
    setHint(0);
    setReview(false);
    setPlaybackError(undefined);
    setRecordingInFlight(false);
    invalidateRecordedFacts();
  }, [activeSnapshot, sourceSnapshot, tempoBaselineBpm, invalidateRecordedFacts, stopChordContext]);

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

  const schedulePreparedChordContext = useCallback((options: { readonly practiceMode?: PracticeMode; readonly listenMode?: ChordContextListenMode; readonly playMode?: ChordContextPlayMode } = {}): ChordContextPlaybackActivity => {
    if (!activeSnapshot || !exercise.ok || !hasPracticeTarget || (sourceSelected && !sourceContextPlayable)) return NO_CHORD_CONTEXT_ACTIVITY;
    const session = sessionRef.current;
    if (!session) return NO_CHORD_CONTEXT_ACTIVITY;
    const generation = session.generation;
    const selectedPracticeMode = options.practiceMode ?? practiceMode;
    const selectedListenMode = options.listenMode ?? listenMode;
    const selectedPlayMode = options.playMode ?? playMode;
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
    const input = toChordContextInput(activeSnapshot, activeTargetEvents, effectiveBpm, selectedPracticeMode, selectedListenMode, selectedPlayMode, sourceSelected ? sourceWindow?.harmonyEvents : undefined);
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
  }, [activeSnapshot, activeTargetEvents, effectiveBpm, exercise, hasPracticeTarget, listenMode, playMode, practiceMode, sourceContextPlayable, sourceSelected, sourceWindow?.harmonyEvents]);

  const startChordContext = useCallback(async (options: { readonly practiceMode?: PracticeMode; readonly listenMode?: ChordContextListenMode; readonly playMode?: ChordContextPlayMode } = {}): Promise<ChordContextPlaybackActivity> => {
    const prepared = await prepareChordContext();
    if (!prepared) return NO_CHORD_CONTEXT_ACTIVITY;
    return schedulePreparedChordContext(options);
  }, [prepareChordContext, schedulePreparedChordContext]);
  const resetSourcePractice = useCallback(() => {
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    stopChordContext();
    setHint(0);
    setReview(false);
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
  const stopForRecordComparePlayback = useCallback(() => {
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    stopChordContext();
  }, [stopChordContext]);
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
  const activateSnapshot = (next: ChordContextSnapshot): void => {
    if (next.signature === activeSnapshot?.signature) return;
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    stopChordContext();
    setSelectedSnapshotSignature(next.signature);
    setHint(0);
    setReview(false);
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
  const chooseEffectiveBpm = (next: number): void => {
    const tempo = clampChordContextBpm(next, tempoBaselineBpm);
    if (tempo === effectiveBpm) return;
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
    stopChordContext();
    setEffectiveBpm(tempo);
    invalidateRecordedFacts();
  };
  const chooseLevel = (next: 1 | 2 | 3): void => {
    legacyPreviewGenerationRef.current += 1;
    stopPreview();
    setLegacyPlaying(false);
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
      if (historyGenerationRef.current === saveGeneration) {
        historyStatusRef.current = "saved";
        setHistoryStatus("saved");
      }
    } catch {
      if (historyGenerationRef.current === saveGeneration) {
        historyStatusRef.current = "error";
        setHistoryStatus("error");
      }
    } finally {
      if (historyGenerationRef.current === saveGeneration) historySavingRef.current = false;
    }
  }, [activeSnapshot, effectiveBpm, hasUnkeptRecordingTake, listenMode, metronomeUsed, onChordContextHistoryRecorded, playMode, recordCompareUsed, recordingFacts, recordingInFlight, retainedTakeReference]);

  const saveSourceBasslineHistory = useCallback(async () => {
    if (!sourceCandidate || !sourceWindow || !sourceLevelResult?.available || !onSourceBasslineHistoryRecorded
      || recordingInFlight || hasUnkeptRecordingTake || historySavingRef.current || historyStatusRef.current === "saved") return;
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
      if (historyGenerationRef.current === saveGeneration) {
        historyStatusRef.current = "saved";
        setHistoryStatus("saved");
      }
    } catch {
      if (historyGenerationRef.current === saveGeneration) {
        historyStatusRef.current = "error";
        setHistoryStatus("error");
      }
    } finally {
      if (historyGenerationRef.current === saveGeneration) historySavingRef.current = false;
    }
  }, [hasUnkeptRecordingTake, level, onSourceBasslineHistoryRecorded, recordingInFlight, retainedTakeReference, sourceCandidate, sourceLevelResult, sourceWindow]);

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
      onStarted: () => { if (legacyPreviewGenerationRef.current === generation) setLegacyPlaying(true); },
      onEnded: () => { if (legacyPreviewGenerationRef.current === generation) setLegacyPlaying(false); },
    });
  };

  if (!exercise.ok) return <p role="alert">{exercise.error.message}</p>;
  const progressionSourceLabel = activeSnapshot?.source.kind === "vault"
    ? `${"Vault進行"} \u00b7 ${activeSnapshot.source.safeLabel}`
    : activeSnapshot?.source.kind === "preset"
      ? `${"プリセット進行"} \u00b7 ${activeSnapshot.source.safeLabel}`
      : "既定の生成進行";
  const selectedSourceReferenceKey = selectedSourceReference ? sourceReferenceKey(selectedSourceReference) : "";
  const sourceLabel = sourceSelected
    ? sourceCandidate
      ? `${"元ベースライン"} \u00b7 ${sourceCandidate.displayTitle}`
      : "元ベースライン · 未選択"
    : progressionSourceLabel;
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
    : undefined;  const sourceHarmonyComparisonLabel = sourceCandidate
    ? sourceCandidate.harmonyComparison === "match"
      ? ("保存時の和声と現在の進行: 一致")
      : sourceCandidate.harmonyComparison === "mismatch"
        ? ("保存時の和声と現在の進行: 不一致（簡略化とChord Contextは保存時の和声を使用）")
        : ("保存時の和声と現在の進行: 比較できません")
    : undefined;  const sourceContextReason = sourceSelected && !sourceContextPlayable
    ? !sourceAvailable
      ? sourceUnavailableReason
      : sourceWindow?.harmonyUnavailableReason
        ? ("正確な保存済み和声がないため、Chord Contextは利用できません。録音は伴奏なしで利用できます。")
        : ("この区間の音域はChord Contextの安全なベース範囲外です。録音は伴奏なしで利用できます。")
    : undefined;
  const sourceLevelDescriptionId = sourceLevelUnavailableReason ? "source-bassline-level-unavailable" : undefined;
  const sourceEmptyDescriptionId = sourceSelected && sourceWindow && sourceLevelAvailable && !hasPracticeTarget ? "source-bassline-empty" : undefined;
  const sourceUnavailableDescriptionId = sourceSelected && !sourceAvailable ? "source-bassline-unavailable" : undefined;
  const chordContextDescriptionId = sourceLevelDescriptionId
    ?? sourceEmptyDescriptionId
    ?? (sourceContextReason ? "source-bassline-context-reason" : sourceUnavailableDescriptionId);
  const noContextSource = chordContextEnabled && (!hasPracticeTarget || !sourceContextPlayable);
  const hasVaultProgressions = pickerCandidates.length > 0;
  const activePresetId = activeSnapshot?.source.kind === "preset" ? activeSnapshot.source.presetId : undefined;
  const activePreset = activePresetId === undefined
    ? undefined
    : BASSLINE_PROGRESSION_PRESETS.find((preset) => preset.id === activePresetId);
  const selectedProgressionSource = activePresetId ?? (activeSnapshot?.source.kind === "vault" ? "vault" : "generated");
  const basslineStepIndex = review ? 3 : contextPlayback === "play" ? 2 : contextPlayback === "listen" || legacyPlaying ? 1 : 0;
  const basslineSteps = BASSLINE_STEPS.ja;

  return <div className="min-w-0 space-y-4" data-testid="bassline-echo-view">
    <EchoPracticeHeader
      kicker={"ベース練習"}
      title="Bassline Echo"
      description={"コード進行を聴き、ベースラインを思い出して演奏します。"}
      badge={"自己評価 · 自動採点ではありません"}
    />
    <EchoPracticeProgress
      ariaLabel={"Bassline Echoの進行"}
      currentIndex={basslineStepIndex}
      steps={basslineSteps}
    />
    <Surface variant="primary" className="min-w-0 overflow-hidden p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--lv-border)] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">{"現在の課題"}</p>
          <h3 className="mt-1 text-lg font-semibold">{"コード進行の中でベースを再現"}</h3>
          <p className="mt-1 text-sm text-[var(--lv-text-secondary)]" data-testid="bassline-source">{sourceLabel}</p>
        </div>
        <div className={chordContextEnabled ? "grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_13rem] lg:w-[38rem]" : "w-full sm:w-52"}>
          {chordContextEnabled ? <div className="space-y-3">
            <Field
              htmlFor="bassline-progression-select"
              label={"練習するコード進行"}
              helper={hasVaultProgressions
                ? ("プリセットを選ぶか、Vaultから選びます。Vaultは確認後にだけ反映されます。")
                : ("プリセットを選ぶか、対応する4/4の進行をVaultに保存して選びます。")}
            >
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="bassline-progression-select"
                  name="bassline-progression-select"
                  data-testid="bassline-progression-select"
                  className="lv-input min-w-0 flex-1"
                  disabled={recordingInFlight || preparing}
                  value={selectedProgressionSource}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (value !== "vault") choosePreset(value as BasslineProgressionPresetId | "generated");
                  }}
                >
                  <option value="generated">{"現在のデフォルト（生成）"}</option>
                  {activeSnapshot?.source.kind === "vault" ? <option value="vault">{`Vault: ${activeSnapshot.source.safeLabel}`}</option> : null}
                  {BASSLINE_PROGRESSION_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                </select>
                <VaultProgressionPicker
                  candidates={pickerCandidates}
                  activeSignature={activeSnapshot?.source.kind === "vault" ? activeSnapshot.signature : undefined}
                  disabled={recordingInFlight || preparing}
                  onConfirm={chooseProgression}
                />
                {activeSnapshot?.source.kind !== "generated" && generatedSnapshot.ok ? <Button
                  data-testid="bassline-progression-use-default"
                  variant="ghost"
                  size="sm"
                  disabled={recordingInFlight || preparing}
                  onClick={() => activateSnapshot(generatedSnapshot.snapshot)}
                >
                  {"現在のデフォルトに戻す"}
                </Button> : null}
              </div>
            </Field>
            <Field
              htmlFor="bassline-line-source"
              label={"ベースラインのソース"}
              helper={sourceSelected
                ? sourceAvailable
                  ? ("保存済みの原演奏は、選択したVault項目からだけ読み取ります。")
                  : sourceUnavailableReason
                : sourceCatalogAvailable
                  ? ("元ベースラインは明示選択したときだけ使います。")
                  : ("利用するには、元ベースライン付きの進行をVaultへ保存してください。")}
            >
              <select
                id="bassline-line-source"
                name="bassline-line-source"
                data-testid="bassline-line-source"
                className="lv-input w-full"
                aria-describedby={sourceSelected && !sourceAvailable ? "bassline-line-source-description source-bassline-unavailable" : "bassline-line-source-description"}
                disabled={recordingInFlight || preparing}
                value={basslineSource}
                onChange={(event) => chooseBasslineSource(event.currentTarget.value as "generated" | "source-bassline")}
              >
                <option value="generated">{"生成ベースライン"}</option>
                <option value="source-bassline" disabled={!sourceCatalogAvailable && !sourceSelected}>{"元ベースライン"}</option>
              </select>
              {sourceSelected ? <div className="mt-3 min-w-0">
                <label className="text-xs font-medium text-[var(--lv-text-secondary)]" htmlFor="source-bassline-vault-select">{"保存済み元ベースライン"}</label>
                <select
                  id="source-bassline-vault-select"
                  data-testid="source-bassline-vault-select"
                  className="lv-input mt-1 w-full min-w-0"
                  aria-describedby="source-bassline-selection-description"
                  disabled={recordingInFlight || preparing || !sourceCatalogAvailable}
                  value={selectedSourceReferenceKey}
                  onChange={(event) => chooseSourceReference(event.currentTarget.value)}
                >
                  <option value="" disabled>{"選択してください"}</option>
                  {selectedSourceReference && !sourceCandidate ? <option value={selectedSourceReferenceKey} disabled>{"選択したソースは利用できません"}</option> : null}
                  {(vaultSourceBasslines ?? []).map((candidate, index) => <option key={sourceReferenceKey(candidate.reference)} value={sourceReferenceKey(candidate.reference)}>{candidate.displayTitle} · {index + 1}</option>)}
                </select>
                <p id="source-bassline-selection-description" className="mt-1 text-xs text-[var(--lv-text-muted)]">{"選択状態にはVaultの項目参照だけを使い、ノート列は複製しません。"}</p>
              </div> : null}
              {sourceSelected && !sourceAvailable ? <p id="source-bassline-unavailable" aria-live="polite" className="mt-1 text-xs text-[var(--lv-text-secondary)]">{sourceUnavailableReason}</p> : null}
            </Field>
            {activePreset ? <Field htmlFor="bassline-preset-key-select" label={"プリセットのキー"}>
              <select
                id="bassline-preset-key-select"
                name="bassline-preset-key-select"
                data-testid="bassline-preset-key-select"
                className="lv-input w-full"
                disabled={recordingInFlight || preparing}
                value={activeSnapshot?.tonalContext.key ?? activePreset.defaultKey}
                onChange={(event) => choosePresetKey(event.currentTarget.value)}
              >
                {presetKeyOptions(activePreset.defaultKey).map((key) => <option key={key} value={key}>{key}</option>)}
              </select>
            </Field> : null}
          </div> : null}
          <Field htmlFor="bassline-level" label={"レベル"}>
            <select
              id="bassline-level"
              name="bassline-level"
              className="lv-input w-full"
              aria-label={"ベースラインのレベル"}
              aria-describedby={sourceSelected ? "bassline-level-description" : undefined}
              disabled={recordingInFlight || (sourceSelected && !sourceWindow)}
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
            </select>
            {sourceSelected ? <p id="bassline-level-description" aria-live="polite" className="mt-1 text-xs text-[var(--lv-text-secondary)]">{sourceLevelUnavailableReason ?? sourceSimplificationAvailabilityReason ?? ("保存済み和声から決定的に導出します。元スナップショットは変更しません。")}</p> : null}
          </Field>        </div>
      </div>
      {sourceSelected ? <section className="mt-4 min-w-0 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-3" aria-labelledby="source-bassline-window-heading" data-testid="source-bassline-window">
        <h3 id="source-bassline-window-heading" className="font-semibold">{sourceLevelLabel(level)}</h3>
        <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">{"保存済みの全ノートを変更せず、区間切り出し後の単音投影から選択レベルを導出します。"}</p>
        {sourceHarmonyComparisonLabel ? <p role="status" aria-live="polite" data-testid="source-bassline-harmony-comparison" className="mt-2 break-words text-sm text-[var(--lv-text-secondary)]">{sourceHarmonyComparisonLabel}</p> : null}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <fieldset className="min-w-0 flex-1" aria-describedby="source-bassline-window-selector-reason">
            <legend className="text-sm font-medium">{"区間の長さ"}</legend>
            <div role="group" aria-label={"元ベースラインの区間の長さ"} data-testid="source-bassline-window-bars" className="mt-1 grid w-full max-w-xs grid-cols-4 overflow-hidden rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)]">
              {([1, 2, 4, 8] as const).map((bars) => <button
                key={bars}
                type="button"
                aria-pressed={sourceWindowBars === bars}
                disabled={recordingInFlight || !sourceWindow}
                className={`min-h-10 border-r border-[var(--lv-border)] px-2 text-sm font-semibold last:border-r-0 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--lv-accent)] ${sourceWindowBars === bars ? "bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : "bg-[var(--lv-surface)] text-[var(--lv-text-secondary)]"}`}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  chooseSourceWindowBars(bars);
                }}
                onClick={() => chooseSourceWindowBars(bars)}
              >{bars}</button>)}
            </div>
          </fieldset>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button type="button" variant="ghost" className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50" data-testid="source-bassline-previous" aria-disabled={recordingInFlight || previousWindowStart === undefined || undefined} aria-describedby={previousWindowStart === undefined ? "source-bassline-previous-reason" : undefined} disabled={recordingInFlight} onClick={() => moveSourceWindow(previousWindowStart)}>{"前の区間"}</Button>
            <Button type="button" variant="ghost" className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50" data-testid="source-bassline-next" aria-disabled={recordingInFlight || nextWindowStart === undefined || undefined} aria-describedby={nextWindowStart === undefined ? "source-bassline-next-reason" : undefined} disabled={recordingInFlight} onClick={() => moveSourceWindow(nextWindowStart)}>{"次の区間"}</Button>
          </div>
        </div>
        <p id="source-bassline-window-selector-reason" className="mt-2 text-xs text-[var(--lv-text-secondary)]">{recordingInFlight
          ? ("録音中は区間の長さを変更できません。")
          : !sourceWindow ? sourceUnavailableReason : ("1、2、4、8小節から選べます。")}</p>
        {sourceWindowPreferenceError ? <p role="alert" className="mt-2 text-sm text-[var(--lv-danger)]" data-testid="source-bassline-window-save-error">{sourceWindowPreferenceError}</p> : null}
        <p id="source-bassline-previous-reason" className="sr-only">{previousWindowStart === undefined ? ("最初の区間です。") : ""}</p>
        <p id="source-bassline-next-reason" className="sr-only">{nextWindowStart === undefined ? ("最後の区間です。") : ""}</p>
        <p aria-live="polite" data-testid="source-bassline-range" className="mt-3 font-medium">{sourceWindow ? (`${sourceWindow.startBar}〜${sourceWindow.endBar}小節${sourceWindow.actualBars < sourceWindow.requestedBars ? "（最終区間）" : ""}`) : sourceUnavailableReason}</p>
        {sourceWindow ? <p data-testid="source-bassline-projection-facts" className="mt-2 break-words text-sm text-[var(--lv-text-secondary)]">{`切り出しノート ${sourceWindow.croppedSourceNoteCount} / 単音投影 ${sourceWindow.targetEvents.length} / レベル対象 ${activeTargetEvents.length} / 同時発音の省略 ${sourceWindow.omittedSimultaneousNoteCount} / 境界clip ${sourceWindow.boundaryClippedNoteCount} / 重なりduration clip ${sourceWindow.overlapClippedNoteCount} / pitch置換 ${sourcePitchReplacementCount}`}</p> : null}
        {sourceLevelUnavailableReason ? <p id="source-bassline-level-unavailable" role="status" data-testid="source-bassline-level-unavailable" className="mt-2 text-sm text-[var(--lv-warning)]">{sourceLevelUnavailableReason}</p> : null}        {sourceWindow && sourceLevelAvailable && !hasPracticeTarget ? <p id="source-bassline-empty" role="status" data-testid="source-bassline-empty" className="mt-2 text-sm text-[var(--lv-warning)]">{"この区間にはベース音がありません。別の区間へ移動してください。"}</p> : null}
        <p className="mt-2 text-xs text-[var(--lv-text-secondary)]">{"Transferは元ベースラインでは利用できません。区間移動には前/次を使ってください。"}</p>
      </section> : null}
      {!sourceSelected ? <div className="mt-4 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-3" aria-label={"ベースラインのコード進行"}>{exercise.exercise.chords.map((chord) => <span key={`${chord.startBeat}:${chord.label}`} className="mr-2 inline-block font-semibold">{chord.label}</span>)}</div> : null}
    {chordContextEnabled && activeSnapshot && !sourceSelected ? <section className="mt-3 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-3" aria-live="polite" data-testid="bassline-source-summary">
      <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">{"選択中の進行"}</p>
      <dl className="mt-2 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="text-[var(--lv-text-muted)]">{"ソース"}</dt><dd data-testid="bassline-source-kind" className="font-medium">{sourceLabel}</dd></div>
        <div><dt className="text-[var(--lv-text-muted)]">{"キー"}</dt><dd>{activeSnapshot.tonalContext.key}</dd></div>
        <div><dt className="text-[var(--lv-text-muted)]">{"セクション"}</dt><dd>{`${activeSnapshot.section.startBar}〜${activeSnapshot.section.endBar}小節`}</dd></div>
        <div><dt className="text-[var(--lv-text-muted)]">{"元のテンポ"}</dt><dd>{activeSnapshot.originalBpm} BPM</dd></div>
      </dl>
    </section> : null}
    <div className="mt-3 text-sm" data-testid="bassline-notes">{hint >= 4 || review ? <>
      <span className="mr-2 text-xs text-[var(--lv-text-muted)]">{"お手本の音名"}</span>
      {activeTargetEvents.map((event) => <span key={event.index} className="mr-2 font-semibold" title={`MIDI ${event.midiNote}`}>{midiNoteName(event.midiNote)}</span>)}
    </> : "まずお手本を聴いて思い出してください。音名はヒント4またはレビューで表示されます。"}</div>

    {chordContextEnabled ? <section className="mt-4 rounded border p-3" aria-labelledby="chord-context-heading" data-testid="chord-context-controls">
      <h3 id="chord-context-heading" className="font-semibold">Chord Context</h3>
      <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">{sourceSelected ? sourceCandidate?.displayTitle ?? sourceUnavailableReason : activeSnapshot?.source.safeLabel ?? ("Chord Contextの進行を利用できません。")}</p>
      {sourceContextReason ? <p id="source-bassline-context-reason" role="status" className="mt-2 text-sm text-[var(--lv-warning)]">{sourceContextReason}</p> : null}
      <fieldset className="mt-3" data-testid="chord-context-tempo">
        <legend>{"セッションテンポ"}</legend>
        <p className="mt-1 text-xs text-[var(--lv-text-secondary)]">{sourceSelected ? (`セッション既定: ${SOURCE_SESSION_DEFAULT_BPM} BPM。変更はこのセッションだけに適用され、Vaultは変更されません。`) : (`元のテンポ: ${tempoBaselineBpm} BPM。変更はこのセッションだけに適用され、Vaultは変更されません。`)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="chord-context-effective-bpm">BPM</label>
          <input id="chord-context-effective-bpm" data-testid="chord-context-effective-bpm" type="number" min={30} max={240} step={1} value={effectiveBpm} disabled={recordingInFlight} onChange={(event) => chooseEffectiveBpm(event.currentTarget.valueAsNumber)} onBlur={(event) => chooseEffectiveBpm(event.currentTarget.valueAsNumber)} className="lv-input w-24" />
          <Button type="button" variant="ghost" data-testid="chord-context-bpm-plus-four" onClick={() => chooseEffectiveBpm(effectiveBpm + 4)} disabled={recordingInFlight || effectiveBpm >= 240}>+4 BPM</Button>
          <Button type="button" variant="ghost" onClick={() => chooseEffectiveBpm(tempoBaselineBpm)} disabled={recordingInFlight || effectiveBpm === tempoBaselineBpm}>{sourceSelected ? ("セッション既定に戻す") : ("元のテンポに戻す")}</Button>
        </div>
      </fieldset>
      <Field htmlFor="chord-context-timbre" label={"コード音色"} helper={"このセッションだけに適用されます。"} className="mt-3 max-w-sm">
        <select id="chord-context-timbre" name="chord-context-timbre" data-testid="chord-context-timbre" className="lv-input w-full" disabled={recordingInFlight} value={chordTimbre} onChange={(event) => chooseChordTimbre(event.currentTarget.value as ChordContextChordTimbre)}>
          <option value="electric">{"エレクトリック"}</option>
          <option value="piano">{"ピアノ"}</option>
        </select>
      </Field>
      <fieldset className="mt-3">
        <legend>{"練習モード"}</legend>
        <div className="flex flex-wrap gap-3">
          <label><input type="radio" name="chord-context-practice-mode" disabled={recordingInFlight} checked={practiceMode === "listen"} onChange={() => choosePracticeMode("listen")} /> {"聴く"}</label>
          <label><input type="radio" name="chord-context-practice-mode" disabled={recordingInFlight} checked={practiceMode === "play"} onChange={() => choosePracticeMode("play")} /> {"演奏"}</label>
        </div>
      </fieldset>
      {practiceMode === "listen" ? <ContextModeOptions
        legend={"お手本のレイヤー"}
        name="chord-context-listen-mode"
        selected={listenMode}
        onChange={chooseListenMode}
        options={listenModeOptions()}
        disabled={recordingInFlight}
      /> : <ContextModeOptions
        legend={"演奏時の伴奏"}
        name="chord-context-play-mode"
        selected={playMode}
        onChange={choosePlayMode}
        options={playModeOptions()}
        disabled={recordingInFlight}
      />}
      <p className="mt-3 text-sm text-[var(--lv-text-secondary)]">
        {practiceMode === "play" ? "演奏モードではお手本のベースを自動再生しません。" : "聴くモードでは選択したレイヤーにだけお手本のベースが含まれます。"}
      </p>
      {playbackError ? <p role="alert" className="mt-2 text-sm text-[var(--lv-danger)]">{playbackError}</p> : null}
      <p aria-live="polite" className="mt-2 text-sm" data-testid="chord-context-status">
        {preparing ? "Chord Contextの音を準備しています。" : contextPlayback ? `${contextPlayback === "listen" ? "お手本" : "演奏"}を再生中です。` : "Chord Contextは停止しています。"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => { if (contextPlayback || preparing) stopChordContext(); else void startChordContext(); }}
          disabled={noContextSource || recordingInFlight}
          aria-describedby={chordContextDescriptionId}
          data-testid="chord-context-start-stop"
        >
          {contextPlayback || preparing ? <Square size={15} /> : <Ear size={15} />}
          {contextPlayback || preparing ? "停止" : practiceMode === "listen" ? "お手本を再生" : "伴奏を開始"}
        </Button>
        <Button variant="ghost" onClick={stopChordContext} disabled={recordingInFlight || (!contextPlayback && !preparing)}>{"停止"}</Button>
      </div>
    </section> : null}

    <div className="mt-4 flex flex-wrap gap-2">
      <Button onClick={legacyListen} disabled={recordingInFlight || !hasPracticeTarget} aria-describedby={sourceLevelDescriptionId ?? sourceEmptyDescriptionId ?? sourceUnavailableDescriptionId} data-testid="bassline-listen">{legacyPlaying ? <Square size={15} /> : <Ear size={15} />}{legacyPlaying ? "停止" : "お手本を聴く"}</Button>
      <Button variant="ghost" disabled={recordingInFlight || !hasPracticeTarget} aria-describedby={sourceLevelDescriptionId ?? sourceEmptyDescriptionId ?? sourceUnavailableDescriptionId} onClick={() => setHint((value) => Math.min(4, value + 1))}><Lightbulb size={15} /> {"ヒント"} {hint}/4</Button>
      <Button disabled={recordingInFlight || !hasPracticeTarget} aria-describedby={sourceLevelDescriptionId ?? sourceEmptyDescriptionId ?? sourceUnavailableDescriptionId} onClick={() => { legacyPreviewGenerationRef.current += 1; stopPreview(); setLegacyPlaying(false); stopChordContext(); setReview(true); }}><Ear size={15} /> {"レビュー"}</Button>
    </div>
    {review ? <section className="mt-4 rounded border p-3" aria-labelledby="record-accompaniment-heading" data-testid="record-accompaniment">
      <h3 id="record-accompaniment-heading" className="font-semibold">{"録音時の伴奏"}</h3>
      <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">{sourceSelected && !sourceContextPlayable
        ? ("正確な保存済み和声がないため、この元ベースラインは伴奏なしで録音します。ヘッドホンを使用してください。")
        : ("録音時の伴奏をコードのみ、またはコードとメトロノームから選べます。スピーカー音の回り込みを減らすためヘッドホンを使用してください。アプリの音は録音へ内部ミックスされません。")}</p>
      {sourceSelected && !sourceContextPlayable ? <p role="status" className="mt-3 text-sm">{"録音中の伴奏: なし"}</p> : <fieldset className="mt-3">
        <legend>{"録音中の伴奏"}</legend>
        <label className="mr-3"><input type="radio" name="record-accompaniment" disabled={recordingInFlight} checked={recordPlayMode === "chords-only"} onChange={() => { setRecordPlayMode("chords-only"); invalidateRecordedFacts(); }} /> {"コードのみ"}</label>
        <label><input type="radio" name="record-accompaniment" disabled={recordingInFlight} checked={recordPlayMode === "chords-and-metronome"} onChange={() => { setRecordPlayMode("chords-and-metronome"); invalidateRecordedFacts(); }} /> {"コード + メトロノーム"}</label>
      </fieldset>}
    </section> : null}
    {review ? <RecordCompareSection
      mode="bassline"
      resetKey={"bassline:" + (activeSnapshot?.signature ?? "generated") + ":" + basslineSource + ":" + (sourceWindow?.snapshotSignature ?? "no-source") + ":" + (sourceWindow?.startBar ?? 0) + ":" + sourceWindowBars + ":" + level + ":" + effectiveBpm + ":" + listenMode + ":" + playMode + ":" + recordPlayMode + ":" + chordTimbre}
      practiceSessionId={basslineRecordSessionIdRef.current}
      countInMs={Math.round((4 * 60_000) / effectiveBpm)}
      recordStartDisabledReason={!sourceRecordEligible
        ? (`この${sourceWindow?.actualBars ?? 0}小節区間は${effectiveBpm} BPMで60秒を超えるため、新しい録音を開始できません。`)
        : undefined}
      onPlaybackStart={stopForRecordComparePlayback}
      onRecordingActivityChange={setRecordingInFlight}
      onUnkeptTakeChange={setHasUnkeptRecordingTake}
      onRecordingPrepare={sourceSelected && !sourceContextPlayable ? async () => true : prepareChordContext}
      onRecordingStart={() => {
        const activity = sourceSelected && !sourceContextPlayable
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
        return sourceSelected && !sourceContextPlayable ? true : activity.started;
      }}
      onRecordingStop={stopChordContext}
      onTakeKept={(id) => {
        setRetainedTakeReference(id);
        if (historyStatusRef.current !== "saved") setHistoryStatus("idle");
      }}
      targetPlayer={createTargetPlayer(
        (onEnded) => void previewMidiNotes(
          activeTargetEvents.map((event) => ({
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
    {review ? <section className="mt-4 rounded border p-3" aria-labelledby="bassline-history-heading" data-testid={sourceSelected ? "source-bassline-history-save" : "chord-context-history-save"}>
      <h3 id="bassline-history-heading" className="font-semibold">{"練習履歴"}</h3>
      <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">{sourceSelected
        ? ("Vault項目参照、スナップショット署名、区間、レベル、差分数、保持したテイク参照だけを保存します。ノート列や演奏の採点は保存しません。")
        : ("進行、セクション、テンポ、選択レイヤー、保持したテイクの参照など、事実だけを保存します。演奏の採点は行いません。")}</p>
      {historyStatus === "error" ? <p role="alert" className="mt-2 text-sm text-[var(--lv-danger)]">{"練習履歴を保存できませんでした。レビュー内容はこのまま残ります。"}</p> : null}
      {hasUnkeptRecordingTake ? <p role="status" className="mt-2 text-sm">{"このセッションを保存する前に、録音したテイクを保持するか破棄してください。"}</p> : null}
      <p aria-live="polite" className="mt-2 text-sm">{historyStatus === "saving" ? "練習履歴を保存しています。" : historyStatus === "saved" ? "練習履歴へ保存しました。" : "このセッションはまだ履歴へ保存されていません。"}</p>
      <Button
        className="mt-3"
        onClick={() => void (sourceSelected ? saveSourceBasslineHistory() : saveChordContextHistory())}
        disabled={(sourceSelected ? !onSourceBasslineHistoryRecorded || !sourceLevelResult?.available : !onChordContextHistoryRecorded) || recordingInFlight || hasUnkeptRecordingTake || historyStatus === "saving" || historyStatus === "saved"}
        data-testid={sourceSelected ? "source-bassline-save-history" : "chord-context-save-history"}
      >{historyStatus === "saved" ? "履歴へ保存済み" : "セッションを履歴へ保存"}</Button>
    </section> : null}
    {sourceBasslineHistory.length ? <section className="mt-4 rounded border p-3" aria-labelledby="source-bassline-history-heading" data-testid="source-bassline-history">
      <h3 id="source-bassline-history-heading" className="font-semibold">{"元ベースライン履歴"}</h3>
      <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">{"履歴は参照と事実だけを保持します。保存元がない場合は別のソースへ置き換えません。"}</p>
      <ul className="mt-3 grid min-w-0 gap-2">
        {[...sourceBasslineHistory].reverse().slice(0, 20).map((entry) => {
          const resolution = resolveSourceBasslineHistory(entry, vaultSourceBasslines ?? []);
          return <li key={entry.id} className="min-w-0 rounded border border-[var(--lv-border)] p-2 text-sm">
            <p className="break-words font-medium">{sourceLevelLabel(entry.level)} · {`${entry.window.startBar}〜${entry.window.endBar}小節`}</p>
            <p className="mt-1 break-words text-xs text-[var(--lv-text-secondary)]">{`単音投影 ${entry.facts.projectedNoteCount} / pitch置換 ${entry.facts.pitchReplacementCount} / 保存元 ${resolution.available ? "利用可能" : resolution.reason === "snapshot-mismatch" ? "変更済み" : "なし"}`}</p>
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => restartSourceBasslineHistory(entry)}>{"この条件を再開"}</Button>
          </li>;
        })}
      </ul>
      {historyRestartMessage ? <p aria-live="polite" className="mt-3 text-sm" data-testid="source-bassline-history-restart-status">{historyRestartMessage}</p> : null}
    </section> : null}    </Surface>
  </div>;
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

function playModeOptions(): readonly ContextModeOption<ChordContextPlayMode>[] {
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
  capturedHarmony?: readonly SourceBasslineHarmonyEvent[],
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
  const mode = defaultKey.endsWith(" minor") ? "minor" : "major";
  return PRESET_TONICS.map((tonic) => `${tonic} ${mode}`);
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
const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** MIDI note number 竊・scientific pitch name (60 = C4), e.g. 45 竊・"A2". */
function midiNoteName(midi: number): string {
  if (!Number.isFinite(midi)) return "?";
  const rounded = Math.round(midi);
  const name = PITCH_CLASS_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}
