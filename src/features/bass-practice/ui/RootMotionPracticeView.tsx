import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Ear, Lightbulb, Music2, Play, Square } from "lucide-react";
import { Button, Field, StatusMessage, Surface } from "../../../components/ui";
import type { AppLanguage } from "../../../i18n";
import { previewMidiNotes, stopPreview } from "../../../audio/chordPreview";
import {
  ROOT_MOTION_GENERATOR_VERSION,
  ROOT_MOTION_MAX_ATTEMPTS,
  STANDARD_BASS_TUNINGS,
  createRootMotionHistoryEntry,
  createVaultRootMotionExercise,
  deriveRootMotionTransfer,
  generateRootMotionExercise,
  type PracticeSettings,
  type RootMotionCategory,
  type RootMotionDirection,
  type RootMotionExercise,
  type RootMotionHistoryEntry,
  type RootMotionLevel,
  type VaultChordContextSnapshot,
} from "../domain";
import { RootMotionPracticeSession, type RootMotionIdentifyAnswer } from "../application/rootMotionSession";
import { createTargetPlayer } from "../recording/application/playback";
import { RecordCompareSection } from "../recording/ui/RecordCompareSection";
import { EchoPracticeHeader, EchoPracticeProgress } from "./EchoPracticeChrome";
import { RootMotionFretboard } from "./RootMotionFretboard";

const STEPS: Record<AppLanguage, readonly string[]> = {
  en: ["Listen", "Identify", "Sing", "Play", "Review", "Transfer"],
  ja: ["\u8074\u304f", "\u898b\u5206\u3051\u308b", "\u6b4c\u3046", "\u6f14\u594f", "\u30ec\u30d3\u30e5\u30fc", "\u79fb\u8abf"],
};
const DIRECTIONS: readonly RootMotionDirection[] = ["same", "up", "down"];
const CATEGORIES: readonly RootMotionCategory[] = ["same", "second", "third", "fourth", "tritone", "fifth"];

export type RootMotionPlayback = (notes: Parameters<typeof previewMidiNotes>[0], bpm: number, callbacks: { onEnded: () => void }) => Promise<void>;

export interface RootMotionPracticeViewProps {
  readonly language?: AppLanguage;
  readonly playback?: RootMotionPlayback;
  readonly initialSettings?: PracticeSettings;
  readonly onHistoryRecorded?: (entry: RootMotionHistoryEntry) => Promise<void>;
  /** Safe, title-free snapshots supplied by the existing Vault picker boundary. */
  readonly vaultSnapshots?: readonly VaultChordContextSnapshot[];
}

export function RootMotionPracticeView({ language = "en", playback, initialSettings, onHistoryRecorded, vaultSnapshots = [] }: RootMotionPracticeViewProps) {
  const [level, setLevel] = useState<RootMotionLevel>(1);
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
  const savedHistoryIds = useRef(new Set<string>());
  const [, forceRender] = useReducer((value: number) => value + 1, 0);
  const settings = useMemo(() => ({
    stringCount: initialSettings?.stringCount ?? 4,
    handedness: initialSettings?.handedness ?? "right",
    fretRange: initialSettings?.fretRange ?? { min: 0, max: 12 },
  }), [initialSettings?.fretRange, initialSettings?.handedness, initialSettings?.stringCount]);
  const generated = useMemo(() => generateRootMotionExercise({
    generatorVersion: ROOT_MOTION_GENERATOR_VERSION,
    seed: `root-motion-ui-${level}-${round}-${settings.stringCount}-${settings.handedness}-${settings.fretRange.min}-${settings.fretRange.max}`,
    level,
    noteCount: level >= 4 ? 3 : 2,
    phraseLengthBeats: level >= 4 ? 6 : 4,
    tempo: 96,
    tuning: STANDARD_BASS_TUNINGS[settings.stringCount],
    stringCount: settings.stringCount,
    fretRange: settings.fretRange,
    pitchSpan: { minMidi: 28, maxMidi: 55 },
    handedness: settings.handedness,
    maxAttempts: ROOT_MOTION_MAX_ATTEMPTS,
  }), [level, round, settings]);
  const selectedVaultSnapshot = useMemo(() => vaultSnapshots.find((snapshot) => snapshot.signature === selectedVaultSignature) ?? vaultSnapshots[0], [selectedVaultSignature, vaultSnapshots]);
  const vaultGenerated = useMemo(() => selectedVaultSnapshot ? createVaultRootMotionExercise({
    snapshot: selectedVaultSnapshot,
    level,
    tuning: STANDARD_BASS_TUNINGS[settings.stringCount],
    stringCount: settings.stringCount,
    fretRange: settings.fretRange,
    pitchSpan: { minMidi: 28, maxMidi: 55 },
    handedness: settings.handedness,
  }) : undefined, [level, selectedVaultSnapshot, settings]);
  const baseExercise = sourceKind === "vault-root-path"
    ? vaultGenerated?.ok ? vaultGenerated.exercise : undefined
    : generated.ok ? generated.exercise : undefined;
  const exercise = transfer ?? baseExercise;
  const session = useMemo(() => exercise ? new RootMotionPracticeSession(exercise) : undefined, [exercise]);
  const snapshot = session?.getSnapshot();

  useEffect(() => () => stopPreview(), []);
  useEffect(() => {
    if (!vaultSnapshots.length) { if (sourceKind === "vault-root-path") setSourceKind("generated"); return; }
    if (!selectedVaultSignature || !vaultSnapshots.some((snapshot) => snapshot.signature === selectedVaultSignature)) setSelectedVaultSignature(vaultSnapshots[0]!.signature);
  }, [selectedVaultSignature, sourceKind, vaultSnapshots]);
  useEffect(() => { setTransfer(undefined); setTransferOfExerciseId(undefined); }, [baseExercise?.id]);
  useEffect(() => { setSelectedDirection(undefined); setSelectedCategory(undefined); setSelectedSemitones(undefined); setRetainedTakeReference(undefined); setMessage(undefined); }, [exercise?.id]);

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

  const saveHistory = useCallback((rating: "again" | "hard" | "good" | "easy") => {
    if (!exercise || !session || !onHistoryRecorded) return;
    const firstAnswer = session.getSnapshot().firstAnswer;
    if (!firstAnswer) return;
    const entry = createRootMotionHistoryEntry({ completedAt: new Date().toISOString(), exercise, firstAnswer, selfRating: rating, transferOfExerciseId, retainedTakeReference });
    if (savedHistoryIds.current.has(entry.id)) return;
    savedHistoryIds.current.add(entry.id);
    void onHistoryRecorded(entry).catch((error: unknown) => {
      savedHistoryIds.current.delete(entry.id);
      setMessage(error instanceof Error ? error.message : "Practice history could not be saved.");
    });
  }, [exercise, onHistoryRecorded, retainedTakeReference, session, transferOfExerciseId]);

  if (!exercise || !session || !snapshot) return <StatusMessage tone="error" title="Root Motion Echo">{sourceKind === "vault-root-path" ? (vaultGenerated?.ok === false ? vaultGenerated.error.message : "Select a supported Vault-derived root path.") : (generated.ok ? "Session is unavailable." : generated.error.message)}</StatusMessage>;
  const currentStep = snapshot.status === "ready" || snapshot.status === "listening" ? 0
    : snapshot.status === "identify" ? 1 : snapshot.status === "sing" ? 2
      : snapshot.status === "play" ? 3 : snapshot.status === "review" || snapshot.status === "completed" ? 4 : 0;
  const labels = language === "ja" ? {
    title: "Root Motion Echo", kicker: "\u30d9\u30fc\u30b9\u7df4\u7fd2", badge: "\u81ea\u5df1\u8a55\u4fa1\u5f0f\u3001\u81ea\u52d5\u63a1\u70b9\u306f\u3057\u307e\u305b\u3093", description: "\u30eb\u30fc\u30c8\u9593\u306e\u52d5\u304d\u3092\u898b\u5206\u3051\u3001\u6b4c\u3063\u3066\u30d9\u30fc\u30b9\u3067\u518d\u73fe\u3057\u307e\u3059\u3002",
    level: "\u30ec\u30d9\u30eb", listen: "\u304a\u624b\u672c\u3092\u8074\u304f", replay: "\u3082\u3046\u4e00\u5ea6\u8074\u304f", hint: "\u30d2\u30f3\u30c8", identify: "\u56de\u7b54\u3092\u78ba\u5b9a", direction: "\u65b9\u5411", category: "\u97f3\u7a0b\u306e\u7a2e\u985e", exact: "\u6b63\u78ba\u306a\u534a\u97f3\u6570", sing: "\u6b4c\u3063\u3066\u6f14\u594f\u3078", play: "\u6f14\u594f\u3092\u7d42\u3048\u3066\u30ec\u30d3\u30e5\u30fc\u3078", review: "\u81ea\u5df1\u8a55\u4fa1", next: "\u6b21\u306e\u30d5\u30ec\u30fc\u30ba", transfer: "\u5225\u306e\u958b\u59cb\u97f3\u3067\u79fb\u8abf", first: "\u6700\u521d\u306e\u56de\u7b54\u3092\u8a18\u9332\u3057\u307e\u3057\u305f", stopped: "\u505c\u6b62", same: "\u540c\u3058", up: "\u4e0a\u884c", down: "\u4e0b\u884c",
  } : {
    title: "Root Motion Echo", kicker: "Bass Practice", badge: "Objective Identify · self review", description: "Identify the movement between roots, then sing and play it. Sing and Play are not automatically scored.",
    level: "Level", listen: "Listen to example", replay: "Replay", hint: "Hint", identify: "Record answer", direction: "Direction", category: "Category", exact: "Exact semitones", sing: "Continue to Play", play: "Finish Play and review", review: "Self review", next: "Next exercise", transfer: "Transfer to a new starting root", first: "First answer recorded", stopped: "Stop", same: "Same", up: "Up", down: "Down",
  };
  const answer: RootMotionIdentifyAnswer = { direction: selectedDirection, category: selectedCategory, semitones: selectedSemitones };
  const directionLabel = (value: RootMotionDirection) => value === "same" ? labels.same : value === "up" ? labels.up : labels.down;
  const rate = (rating: "again" | "hard" | "good" | "easy") => {
    if (mutate(() => session.rate(rating))) saveHistory(rating);
  };

  return <section data-testid="root-motion-echo-view" className="space-y-4">
    <EchoPracticeHeader kicker={labels.kicker} title={labels.title} description={labels.description} badge={labels.badge} />
    <EchoPracticeProgress ariaLabel={language === "ja" ? "Root Motion Echo\u306e\u9032\u884c" : "Root Motion Echo progress"} currentIndex={currentStep} steps={STEPS[language]} />
    <Surface className="space-y-5 border-[var(--lv-border)] bg-[var(--lv-surface)] p-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={language === "ja" ? "\u30bd\u30fc\u30b9" : "Source"} htmlFor="root-motion-source" className="w-64"><select id="root-motion-source" data-testid="root-motion-source" aria-label="Root Motion source" value={sourceKind} onChange={(event) => { setSourceKind(event.target.value as "generated" | "vault-root-path"); setRound((value) => value + 1); }}><option value="generated">{language === "ja" ? "\u751f\u6210\u3055\u308c\u305f\u30eb\u30fc\u30c8\u30e2\u30fc\u30b7\u30e7\u30f3" : "Generated Root Motion"}</option><option value="vault-root-path" disabled={!selectedVaultSnapshot}>{language === "ja" ? "Vault\u7531\u6765\u306e\u30eb\u30fc\u30c8\u30d1\u30b9" : "Vault-derived root path"}</option></select></Field>
        {sourceKind === "vault-root-path" && vaultSnapshots.length > 1 ? <Field label={language === "ja" ? "\u30bb\u30af\u30b7\u30e7\u30f3" : "Vault section"} htmlFor="root-motion-vault-section" className="w-64"><select id="root-motion-vault-section" value={selectedVaultSnapshot?.signature ?? ""} onChange={(event) => { setSelectedVaultSignature(event.target.value); setRound((value) => value + 1); }}>{vaultSnapshots.map((snapshot) => <option key={snapshot.signature} value={snapshot.signature}>{snapshot.source.safeLabel}</option>)}</select></Field> : null}
        <Field label={labels.level} htmlFor="root-motion-level" className="w-44"><select id="root-motion-level" aria-label="Root Motion level" value={level} onChange={(event) => { setLevel(Number(event.target.value) as RootMotionLevel); setRound((value) => value + 1); }}><option value={1}>1 — {language === "ja" ? "\u65b9\u5411" : "Direction"}</option><option value={2}>2 — {language === "ja" ? "\u97f3\u7a0b\u306e\u7a2e\u985e" : "Category"}</option><option value={3}>3 — {language === "ja" ? "\u6b63\u78ba\u306a\u97f3\u7a0b" : "Exact interval"}</option><option value={4}>4 — {language === "ja" ? "\u30d5\u30ec\u30c3\u30c8\u30dc\u30fc\u30c9\u306e\u5f62" : "Shape"}</option><option value={5}>5 — {language === "ja" ? "\u79fb\u8abf" : "Transfer"}</option></select></Field>
        <p className="pb-2 text-sm text-[var(--lv-text-secondary)]">{sourceKind === "vault-root-path" ? (language === "ja" ? "Vault\u7531\u6765\u306e\u30eb\u30fc\u30c8\u30d1\u30b9\u3002\u5143\u306e\u30d9\u30fc\u30b9\u30e9\u30a4\u30f3\u3067\u306f\u3042\u308a\u307e\u305b\u3093\u3002" : "Vault-derived root path — not an original bassline.") : (language === "ja" ? `\u8996\u8074 ${snapshot.listenCount}\u56de · \u30d2\u30f3\u30c8 ${snapshot.hintLevel}/4` : `${snapshot.listenCount} listens · Hint ${snapshot.hintLevel}/4`)}</p>
      </div>
      {snapshot.status === "ready" || snapshot.status === "identify" ? <div className="flex flex-wrap gap-2"><Button data-testid="root-motion-listen" onClick={listen}><Ear className="size-4" />{snapshot.listenCount > 0 ? labels.replay : labels.listen}</Button><Button variant="secondary" onClick={() => mutate(() => session.nextHint())} disabled={snapshot.status === "ready" || snapshot.hintLevel >= 4}><Lightbulb className="size-4" />{labels.hint}</Button></div> : null}
      {snapshot.status === "listening" ? <div className="flex items-center gap-2 text-sm text-[var(--lv-text-secondary)]"><Music2 className="size-4" />{language === "ja" ? "\u518d\u751f\u4e2d…" : "Playing…"}<Button variant="secondary" onClick={() => { stopPreview(); mutate(() => session.cancelListen()); }}><Square className="size-4" />{labels.stopped}</Button></div> : null}
      {snapshot.hintLevel > 0 ? <HintText hintLevel={snapshot.hintLevel} motion={exercise.motions[0]} language={language} /> : null}
      {snapshot.hintLevel === 4 || snapshot.status === "review" || snapshot.status === "completed" ? <RootMotionFretboard exercise={exercise} handedness={settings.handedness} /> : null}
      {snapshot.status === "identify" ? <div className="space-y-4 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] p-4"><p className="font-semibold text-[var(--lv-text)]">{language === "ja" ? "\u30eb\u30fc\u30c8\u306f\u3069\u3046\u52d5\u304d\u307e\u3057\u305f\u304b\uff1f" : "How did the root move?"}</p><AnswerButtons label={labels.direction} values={DIRECTIONS} selected={selectedDirection} onSelect={setSelectedDirection} labelFor={directionLabel} />{level >= 2 ? <AnswerButtons label={labels.category} values={CATEGORIES} selected={selectedCategory} onSelect={setSelectedCategory} labelFor={(value) => value} /> : null}{level >= 3 ? <AnswerButtons label={labels.exact} values={[0, 1, 2, 3, 4, 5, 6, 7]} selected={selectedSemitones} onSelect={setSelectedSemitones} labelFor={(value) => String(value)} /> : null}<Button onClick={() => mutate(() => session.submitIdentify(answer))}>{labels.identify}</Button></div> : null}
      {snapshot.status === "sing" ? <div className="space-y-3"><p className="text-sm text-[var(--lv-text-secondary)]">{language === "ja" ? "\u6b4c\u3063\u3066\u97f3\u7a0b\u3092\u78ba\u304b\u3081\u305f\u3089\u3001\u30d9\u30fc\u30b9\u3067\u518d\u73fe\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u3053\u308c\u306f\u81ea\u5df1\u8a55\u4fa1\u5f0f\u3067\u3059\u3002" : "Sing the movement, then reproduce it on bass. This remains self-reviewed."}</p><Button onClick={() => mutate(() => session.continueToPlay())}>{labels.sing}</Button></div> : null}
      {snapshot.status === "play" ? <div className="space-y-3"><p className="text-sm text-[var(--lv-text-secondary)]">{language === "ja" ? "\u30d9\u30fc\u30b9\u3067\u518d\u73fe\u3057\u305f\u3089\u30ec\u30d3\u30e5\u30fc\u306b\u9032\u307f\u307e\u3059\u3002\u81ea\u52d5\u63a1\u70b9\u306f\u884c\u3044\u307e\u305b\u3093\u3002" : "Reproduce it on bass, then continue to your self review. No automatic scoring is performed."}</p><Button onClick={() => mutate(() => session.completePlay())}><Play className="size-4" />{labels.play}</Button></div> : null}
      {snapshot.status === "review" || snapshot.status === "completed" ? <RecordCompareSection mode="root-motion" resetKey={`root-motion:${exercise.id}`} practiceSessionId={`root-motion:${exercise.id}`} countInMs={Math.round((4 * 60_000) / exercise.tempo)} onTakeKept={setRetainedTakeReference} targetPlayer={createTargetPlayer((onEnded) => void previewMidiNotes(exercise.targetEvents.map((event) => ({ pitch: event.midiNote, startBeat: event.startBeat, durationBeats: event.durationBeats, velocity: event.velocity })), exercise.tempo, "freepats-finger-bass", { onEnded }), stopPreview)} /> : null}
      {snapshot.status === "review" ? <div className="space-y-3"><p className="font-semibold text-[var(--lv-text)]">{labels.review}</p><div className="flex flex-wrap gap-2">{(["again", "hard", "good", "easy"] as const).map((rating) => <Button key={rating} variant="secondary" onClick={() => rate(rating)}>{rating}</Button>)}</div></div> : null}
      {snapshot.status === "completed" ? <div className="flex flex-wrap gap-2"><p className="basis-full font-semibold text-[var(--lv-success)]">{labels.first}</p><Button onClick={() => setRound((value) => value + 1)}>{labels.next}</Button><Button variant="secondary" onClick={() => { const result = deriveRootMotionTransfer(exercise); if (result.ok) { setTransferOfExerciseId(exercise.id); setTransfer(result.exercise); } else setMessage(result.error.message); }}>{labels.transfer}</Button></div> : null}
      {snapshot.firstAnswer ? <p data-testid="root-motion-first-answer" className="text-sm text-[var(--lv-text-secondary)]">{labels.first} · {snapshot.firstAnswer.directionCorrect ? "direction ✓" : "direction ✕"} · {snapshot.firstAnswer.assistance}</p> : null}
      {message ? <StatusMessage tone="error" title="Root Motion Echo">{message}</StatusMessage> : null}
    </Surface>
  </section>;
}

function AnswerButtons<T extends string | number>({ label, values, selected, onSelect, labelFor }: { readonly label: string; readonly values: readonly T[]; readonly selected?: T; readonly onSelect: (value: T) => void; readonly labelFor: (value: T) => string }) {
  return <fieldset className="space-y-2"><legend className="text-sm font-semibold text-[var(--lv-text-secondary)]">{label}</legend><div className="flex flex-wrap gap-2">{values.map((value) => <Button key={String(value)} variant={selected === value ? "primary" : "secondary"} onClick={() => onSelect(value)}>{labelFor(value)}</Button>)}</div></fieldset>;
}

function HintText({ hintLevel, motion, language }: { readonly hintLevel: number; readonly motion: { readonly direction: RootMotionDirection; readonly category: RootMotionCategory; readonly semitones: number }; readonly language: AppLanguage }) {
  const direction = language === "ja" ? (motion.direction === "same" ? "\u540c\u3058" : motion.direction === "up" ? "\u4e0a\u884c" : "\u4e0b\u884c") : motion.direction;
  const text = hintLevel === 1 ? `${language === "ja" ? "\u65b9\u5411" : "Direction"}: ${direction}` : hintLevel === 2 ? `${language === "ja" ? "\u7a2e\u985e" : "Category"}: ${motion.category}` : hintLevel === 3 ? `${language === "ja" ? "\u534a\u97f3\u6570" : "Exact semitones"}: ${motion.semitones}` : language === "ja" ? "\u30d5\u30ec\u30c3\u30c8\u30dc\u30fc\u30c9\u306b\u30eb\u30fc\u30c8\u306e\u5f62\u3092\u8868\u793a\u3057\u307e\u3059\u3002" : "The fretboard shape is now available.";
  return <p className="rounded-[var(--lv-radius-sm)] bg-[var(--lv-accent-soft)] px-3 py-2 text-sm text-[var(--lv-text)]">{text}</p>;
}