import { chordPitchClasses } from "../../../domain/chordVoicing";
import type { ChordQuality, ChordSymbol, Tension } from "../../../domain/types";

/**
 * This plan/driver boundary never creates a destination. Concrete drivers must
 * route through Loop Vault's existing global master-volume path.
 */
export const CHORD_CONTEXT_MIN_MIDI = 57;
export const CHORD_CONTEXT_MAX_MIDI = 76;
export const CHORD_CONTEXT_BASS_MIN_MIDI = 28;
export const CHORD_CONTEXT_BASS_MAX_MIDI = 55;
export const CHORD_CONTEXT_MIN_BPM = 30;
export const CHORD_CONTEXT_MAX_BPM = 240;
/** P5.18-00 locks a selected section to one or two complete 4/4 bars. */
export const CHORD_CONTEXT_MAX_SECTION_BEATS = 8;
/** Count-in is bounded to the same locked one-or-two-bar section. */
export const CHORD_CONTEXT_MAX_COUNT_IN_BEATS = 8;
export const CHORD_CONTEXT_DEFAULT_MIX = Object.freeze({ bassDb: 0, chordsDb: -12, metronomeDb: -9 });

export type ChordContextLayer = "bass" | "chords" | "metronome";
export type ChordContextListenMode = "bass-only" | "chords-only" | "bass-and-chords" | "bass-chords-and-metronome";
export type ChordContextPlayMode = "chords-only" | "chords-and-metronome" | "metronome-only" | "no-accompaniment";
export const DEFAULT_CHORD_CONTEXT_LISTEN_MODE: ChordContextListenMode = "bass-and-chords";
export const DEFAULT_CHORD_CONTEXT_PLAY_MODE: ChordContextPlayMode = "chords-only";

export interface ChordContextMeter { readonly numerator: 4; readonly denominator: 4; }
/** Source-neutral by design; the P5.18-02 Vault adapter owns snapshot conversion. */
export interface ChordContextChordEvent { readonly id: string; readonly chord: ChordSymbol; readonly startBeat: number; readonly durationBeats: number; }
export interface ChordContextBassEvent { readonly id: string; readonly pitch: number; readonly startBeat: number; readonly durationBeats: number; readonly velocity: number; }
interface ChordContextPlaybackBase {
  readonly bpm: number;
  readonly meter: ChordContextMeter;
  /** Metronome-only beats before phrase beat zero, limited to 0..8. */
  readonly countInBeats?: number;
  readonly chordEvents: readonly ChordContextChordEvent[];
  readonly bassEvents: readonly ChordContextBassEvent[];
}
export interface ChordContextListenInput extends ChordContextPlaybackBase {
  readonly mode: "listen";
  readonly listenMode?: ChordContextListenMode;
  readonly playMode?: never;
}
export interface ChordContextPlayInput extends ChordContextPlaybackBase {
  readonly mode: "play";
  readonly playMode?: ChordContextPlayMode;
  readonly listenMode?: never;
}
export type ChordContextPlaybackInput = ChordContextListenInput | ChordContextPlayInput;
export interface ChordContextMix { readonly bassDb: number; readonly chordsDb: number; readonly metronomeDb: number; }
interface ScheduledBase { readonly id: string; readonly layer: ChordContextLayer; readonly beat: number; readonly timeSeconds: number; readonly durationSeconds: number; readonly gainDb: number; }
export interface ScheduledBassEvent extends ScheduledBase { readonly layer: "bass"; readonly pitch: number; readonly velocity: number; }
export interface ScheduledChordEvent extends ScheduledBase { readonly layer: "chords"; readonly notes: readonly number[]; }
export interface ScheduledMetronomeEvent extends ScheduledBase { readonly layer: "metronome"; readonly accent: boolean; readonly countIn: boolean; }
export type ChordContextScheduledEvent = ScheduledBassEvent | ScheduledChordEvent | ScheduledMetronomeEvent;
export interface ChordContextPlaybackPlan { readonly bpm: number; readonly meter: ChordContextMeter; readonly countInBeats: number; readonly mix: ChordContextMix; readonly enabledLayers: readonly ChordContextLayer[]; readonly events: readonly ChordContextScheduledEvent[]; }
export interface ChordContextPlanError { readonly code: "invalid-tempo" | "invalid-meter" | "invalid-mode" | "invalid-count-in" | "invalid-event" | "unsupported-chord" | "driver-failure"; readonly message: string; readonly eventId?: string; }
export type ChordContextPlanResult = { readonly ok: true; readonly plan: ChordContextPlaybackPlan } | { readonly ok: false; readonly error: ChordContextPlanError };
export type ChordContextVoiceResult = { readonly ok: true; readonly notes: readonly number[] } | { readonly ok: false; readonly error: "unsupported-chord" };

/** A single master-routed session. Drivers invoke onCompleted after natural playback end. */
export interface ChordContextPlayer { schedule(event: ChordContextScheduledEvent): void; stop(): void; dispose(): void; }
export interface ChordContextPlaybackLifecycle { onCompleted(): void; }
export interface ChordContextPlaybackDriver { createPlayer(mix: ChordContextMix, lifecycle: ChordContextPlaybackLifecycle): ChordContextPlayer; }
export interface ChordContextPlaybackEngine { start(input: ChordContextPlaybackInput): ChordContextPlanResult; stop(): void; dispose(): void; getActivePlan(): ChordContextPlaybackPlan | undefined; getLastError(): unknown | undefined; }
/** Natural-completion callbacks cannot throw into a browser audio callback. */
export interface ChordContextPlaybackEngineOptions {
  readonly onError?: (error: unknown) => void;
  readonly onCompleted?: () => void;
}

const supportedQualities = new Set<ChordQuality>(["maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7", "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4", "dom7sus4", "add9", "six", "min6", "sixNine"]);
const supportedTensions = new Set<Tension>(["9", "b9", "#9", "11", "#11", "13", "b13"]);
const layerOrder: Record<ChordContextLayer, number> = { metronome: 0, chords: 1, bass: 2 };

export function createChordContextPlaybackEngine(
  driver: ChordContextPlaybackDriver,
  options: ChordContextPlaybackEngineOptions = {},
): ChordContextPlaybackEngine {
  let activePlayer: ChordContextPlayer | undefined;
  let activePlan: ChordContextPlaybackPlan | undefined;
  let lastError: unknown | undefined;
  let disposed = false;

  const releaseActive = (): unknown | undefined => {
    const player = activePlayer;
    activePlayer = undefined;
    activePlan = undefined;
    return player ? closePlayer(player) : undefined;
  };
  const reportNaturalCompletionError = (error: unknown): void => {
    lastError = error;
    try { options.onError?.(error); } catch { /* Driver cleanup must remain non-throwing. */ }
  };
  const completePlayer = (player: ChordContextPlayer): void => {
    if (activePlayer !== player) return;
    // Natural completion cannot leave a graph alive; state is cleared and both
    // cleanup operations run even when the driver reports an exception.
    const cleanupError = releaseActive();
    if (cleanupError !== undefined) reportNaturalCompletionError(cleanupError);
    try { options.onCompleted?.(); } catch (error) { reportNaturalCompletionError(error); }
  };

  return {
    start(input) {
      if (disposed) return failure("driver-failure", "Chord Context playback has been disposed.");
      const result = buildChordContextPlaybackPlan(input);
      if (!result.ok) return result;
      if (result.plan.events.length === 0) {
        const oldCleanupError = releaseActive();
        return oldCleanupError === undefined
          ? result
          : failure("driver-failure", errorMessage(oldCleanupError));
      }

      let nextPlayer: ChordContextPlayer | undefined;
      let completedDuringCreate = false;
      const lifecycle: ChordContextPlaybackLifecycle = {
        onCompleted() {
          if (!nextPlayer) {
            completedDuringCreate = true;
            return;
          }
          completePlayer(nextPlayer);
        },
      };
      try {
        nextPlayer = driver.createPlayer(result.plan.mix, lifecycle);
      } catch (error) {
        return failure("driver-failure", errorMessage(error));
      }

      const oldCleanupError = releaseActive();
      if (oldCleanupError !== undefined) {
        // The old-session failure is primary; the newly allocated graph is still
        // stopped and disposed before returning so replacement cannot leak it.
        closePlayer(nextPlayer);
        return failure("driver-failure", errorMessage(oldCleanupError));
      }
      activePlayer = nextPlayer;
      activePlan = result.plan;
      if (completedDuringCreate) {
        completePlayer(nextPlayer);
        return result;
      }
      try {
        for (const event of result.plan.events) {
          if (activePlayer !== nextPlayer) break;
          nextPlayer.schedule(event);
        }
      } catch (error) {
        if (activePlayer === nextPlayer) {
          activePlayer = undefined;
          activePlan = undefined;
        }
        closePlayer(nextPlayer);
        return failure("driver-failure", errorMessage(error));
      }
      return result;
    },
    stop() {
      const cleanupError = releaseActive();
      if (cleanupError !== undefined) throw cleanupError;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const cleanupError = releaseActive();
      if (cleanupError !== undefined) throw cleanupError;
    },
    getActivePlan: () => activePlan,
    getLastError: () => lastError,
  };
}

export function buildChordContextPlaybackPlan(input: ChordContextPlaybackInput): ChordContextPlanResult {
  const layers = resolveEnabledLayers(input);
  if (!layers) return failure("invalid-mode", "Chord Context playback mode is unsupported.");
  if (!isRecord(input) || !Array.isArray(input.chordEvents) || !Array.isArray(input.bassEvents)) return failure("invalid-event", "Chord Context requires chord and bass event arrays.");
  if (!Number.isFinite(input.bpm) || input.bpm < CHORD_CONTEXT_MIN_BPM || input.bpm > CHORD_CONTEXT_MAX_BPM) return failure("invalid-tempo", `Chord Context BPM must be ${CHORD_CONTEXT_MIN_BPM}-${CHORD_CONTEXT_MAX_BPM}.`);
  if (!isSupportedMeter(input.meter)) return failure("invalid-meter", "Chord Context supports the locked 4/4 source meter only.");
  const countInBeats = input.countInBeats ?? 0;
  if (!Number.isInteger(countInBeats) || countInBeats < 0 || countInBeats > CHORD_CONTEXT_MAX_COUNT_IN_BEATS) return failure("invalid-count-in", `Chord Context count-in must be a whole number from 0 to ${CHORD_CONTEXT_MAX_COUNT_IN_BEATS}.`);

  const chords = [...input.chordEvents];
  const bass = [...input.bassEvents];
  // Validate every source event before sorting, voicing, or finding phrase end.
  // Disabled layers are still source truth and must never smuggle Infinity or a
  // longer section into the scheduler.
  for (const event of chords) {
    const timingError = validateTimedEvent(event);
    if (timingError) return failure("invalid-event", timingError.message, timingError.eventId);
    if (!isSupportedChord(event.chord)) return failure("unsupported-chord", "Chord Context cannot voice this chord safely.", event.id);
  }
  for (const event of bass) {
    const timingError = validateTimedEvent(event);
    if (timingError) return failure("invalid-event", timingError.message, timingError.eventId);
    if (!Number.isInteger(event.pitch) || event.pitch < CHORD_CONTEXT_BASS_MIN_MIDI || event.pitch > CHORD_CONTEXT_BASS_MAX_MIDI || !isNormalizedVelocity(event.velocity)) return failure("invalid-event", "Chord Context bass event is unsupported.", event.id);
  }

  const beatSeconds = 60 / input.bpm;
  const events: ChordContextScheduledEvent[] = [];
  let previousNotes: readonly number[] = [];
  for (const event of chords.sort(compareChordEvents)) {
    const voicing = voiceChordContext(event.chord, previousNotes);
    if (!voicing.ok) return failure("unsupported-chord", "Chord Context cannot voice this chord safely.", event.id);
    previousNotes = voicing.notes;
    if (layers.includes("chords")) events.push(Object.freeze({ id: event.id, layer: "chords" as const, beat: event.startBeat, timeSeconds: (countInBeats + event.startBeat) * beatSeconds, durationSeconds: event.durationBeats * beatSeconds, gainDb: CHORD_CONTEXT_DEFAULT_MIX.chordsDb, notes: voicing.notes }));
  }
  if (layers.includes("bass")) {
    for (const event of bass.sort(compareBassEvents)) events.push(Object.freeze({ id: event.id, layer: "bass" as const, beat: event.startBeat, timeSeconds: (countInBeats + event.startBeat) * beatSeconds, durationSeconds: event.durationBeats * beatSeconds, gainDb: CHORD_CONTEXT_DEFAULT_MIX.bassDb, pitch: event.pitch, velocity: event.velocity }));
  }
  if (layers.includes("metronome")) {
    const phraseEnd = maximumPhraseEnd(chords, bass);
    for (let absoluteBeat = 0; absoluteBeat < countInBeats + phraseEnd; absoluteBeat += 1) {
      const phraseBeat = absoluteBeat - countInBeats;
      events.push(Object.freeze({ id: `metronome:${absoluteBeat}`, layer: "metronome" as const, beat: phraseBeat, timeSeconds: absoluteBeat * beatSeconds, durationSeconds: Math.min(0.08, beatSeconds * 0.35), gainDb: CHORD_CONTEXT_DEFAULT_MIX.metronomeDb, accent: (absoluteBeat < countInBeats ? absoluteBeat : phraseBeat) % input.meter.numerator === 0, countIn: absoluteBeat < countInBeats }));
    }
  }
  return { ok: true, plan: Object.freeze({ bpm: input.bpm, meter: Object.freeze({ ...input.meter }), countInBeats, mix: CHORD_CONTEXT_DEFAULT_MIX, enabledLayers: Object.freeze(layers), events: Object.freeze(events.sort(compareScheduledEvents)) }) };
}

/** Produces upper chord tones only. Slash bass changes the upper-structure center, never adds a low bass voice. */
export function voiceChordContext(chord: ChordSymbol, previousNotes: readonly number[] = []): ChordContextVoiceResult {
  if (!isSupportedChord(chord)) return { ok: false, error: "unsupported-chord" };
  const pitchClasses = chordPitchClasses(chord);
  if (!pitchClasses.length) return { ok: false, error: "unsupported-chord" };
  const upperStructureCenter = chord.bass === undefined ? 66 : CHORD_CONTEXT_MIN_MIDI + normalizePitchClass(chord.bass);
  const notes = pitchClasses.map((pitchClass) => selectUpperVoice(pitchClass, previousNotes, upperStructureCenter)).sort((left, right) => left - right);
  return notes.every((note) => note >= CHORD_CONTEXT_MIN_MIDI && note <= CHORD_CONTEXT_MAX_MIDI)
    ? { ok: true, notes: Object.freeze(notes) }
    : { ok: false, error: "unsupported-chord" };
}

/** Returns undefined for malformed or stale persisted mode values rather than falling through. */
export function resolveEnabledLayers(input: unknown): readonly ChordContextLayer[] | undefined {
  if (!isRecord(input)) return undefined;
  if (input.mode === "listen") {
    if (input.playMode !== undefined) return undefined;
    const listenMode = input.listenMode === undefined ? DEFAULT_CHORD_CONTEXT_LISTEN_MODE : input.listenMode;
    switch (listenMode) {
      case "bass-only": return ["bass"];
      case "chords-only": return ["chords"];
      case "bass-and-chords": return ["bass", "chords"];
      case "bass-chords-and-metronome": return ["bass", "chords", "metronome"];
      default: return undefined;
    }
  }
  if (input.mode === "play") {
    if (input.listenMode !== undefined) return undefined;
    const playMode = input.playMode === undefined ? DEFAULT_CHORD_CONTEXT_PLAY_MODE : input.playMode;
    switch (playMode) {
      case "chords-only": return ["chords"];
      case "chords-and-metronome": return ["chords", "metronome"];
      case "metronome-only": return ["metronome"];
      case "no-accompaniment": return [];
      default: return undefined;
    }
  }
  return undefined;
}

function closePlayer(player: ChordContextPlayer): unknown | undefined {
  let primaryError: unknown | undefined;
  try { player.stop(); } catch (error) { primaryError = error; }
  try { player.dispose(); } catch (error) { if (primaryError === undefined) primaryError = error; }
  return primaryError;
}
function selectUpperVoice(pitchClass: number, previousNotes: readonly number[], center: number): number {
  const candidates = midiCandidates(pitchClass);
  return candidates.reduce((best, candidate) => {
    const candidateScore = voiceScore(candidate, previousNotes, center);
    const bestScore = voiceScore(best, previousNotes, center);
    return candidateScore < bestScore || (candidateScore === bestScore && candidate < best) ? candidate : best;
  });
}
function midiCandidates(pitchClass: number): number[] {
  const normalized = normalizePitchClass(pitchClass);
  const candidates: number[] = [];
  for (let note = CHORD_CONTEXT_MIN_MIDI; note <= CHORD_CONTEXT_MAX_MIDI; note += 1) if (note % 12 === normalized) candidates.push(note);
  return candidates;
}
function voiceScore(note: number, previousNotes: readonly number[], center: number): number {
  const centerDistance = Math.abs(note - center);
  return previousNotes.length ? Math.min(...previousNotes.map((previous) => Math.abs(note - previous))) * 8 + centerDistance : centerDistance;
}
function isSupportedChord(chord: ChordSymbol): boolean { return isRecord(chord) && Number.isInteger(chord.root) && (chord.bass === undefined || Number.isInteger(chord.bass)) && supportedQualities.has(chord.quality as ChordQuality) && Array.isArray(chord.tensions) && chord.tensions.every((tension) => supportedTensions.has(tension as Tension)); }
function isSupportedMeter(meter: unknown): meter is ChordContextMeter { return isRecord(meter) && meter.numerator === 4 && meter.denominator === 4; }
function validateTimedEvent(event: unknown): { readonly message: string; readonly eventId?: string } | undefined {
  if (!isRecord(event)) return { message: "Chord Context events must be objects." };
  const eventId = typeof event.id === "string" ? event.id : undefined;
  const startBeat = event.startBeat;
  const durationBeats = event.durationBeats;
  if (!eventId || !Number.isFinite(startBeat) || typeof startBeat !== "number" || startBeat < 0 || !Number.isFinite(durationBeats) || typeof durationBeats !== "number" || durationBeats <= 0) return { message: "Chord Context events need an id, finite non-negative onset, and finite positive duration.", eventId };
  if (startBeat + durationBeats > CHORD_CONTEXT_MAX_SECTION_BEATS) return { message: `Chord Context events must fit the locked ${CHORD_CONTEXT_MAX_SECTION_BEATS}-beat section.`, eventId };
  return undefined;
}
function isNormalizedVelocity(velocity: unknown): velocity is number { return typeof velocity === "number" && Number.isFinite(velocity) && velocity >= 0 && velocity <= 1; }
function maximumPhraseEnd(chords: readonly ChordContextChordEvent[], bass: readonly ChordContextBassEvent[]): number { return Math.max(0, ...chords.map((event) => event.startBeat + event.durationBeats), ...bass.map((event) => event.startBeat + event.durationBeats)); }
function compareChordEvents(left: ChordContextChordEvent, right: ChordContextChordEvent): number { return left.startBeat - right.startBeat || left.id.localeCompare(right.id); }
function compareBassEvents(left: ChordContextBassEvent, right: ChordContextBassEvent): number { return left.startBeat - right.startBeat || left.id.localeCompare(right.id); }
function compareScheduledEvents(left: ChordContextScheduledEvent, right: ChordContextScheduledEvent): number { return left.timeSeconds - right.timeSeconds || layerOrder[left.layer] - layerOrder[right.layer] || left.id.localeCompare(right.id); }
function normalizePitchClass(value: number): number { return ((value % 12) + 12) % 12; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object"; }
function failure(code: ChordContextPlanError["code"], message: string, eventId?: string): ChordContextPlanResult { return { ok: false, error: { code, message, eventId } }; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Chord Context audio driver failed."; }
