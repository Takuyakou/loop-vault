import { voiceChordForPreview } from "../chordVoicing";
import { resolveVoicingForUse } from "../voicing";
import { transposeChordSymbol } from "./transposeChordSymbol";
import type {
  TransposedPracticeProgression,
  TransposedResolvedVoicingEvent,
  TransposedResolvedVoicingResult,
  TransposedResolvedVoicingWarning,
} from "./types";

export const PRACTICE_PIANO_MIN_MIDI = 21;
export const PRACTICE_PIANO_MAX_MIDI = 108;
export const GLOBAL_OCTAVE_OFFSET_CANDIDATES = [-24, -12, 0, 12, 24] as const;
export const LARGE_VOICING_JUMP_SEMITONES = 18;

export function transposeResolvedVoicing(
  progression: TransposedPracticeProgression,
): TransposedResolvedVoicingResult {
  const resolvedEvents = progression.events.map((event) => {
    const sourceChord = transposeChordSymbol(
      event.chord,
      progression.targetKey,
      progression.sourceKey,
    );
    const resolved = resolveVoicingForUse(
      sourceChord,
      event.sourceVoicingMemory,
      voiceChordForPreview(sourceChord).notes,
    );
    const generatedFallback = resolved.origin === "generated";
    return {
      eventId: event.eventId,
      sourceMidiNotes: [...resolved.midiNotes],
      shiftedMidiNotes: generatedFallback
        ? [...voiceChordForPreview(event.chord).notes]
        : resolved.midiNotes.map((note) => note + progression.semitoneShift),
      origin: resolved.origin,
    };
  });
  const shiftedNotes = resolvedEvents.flatMap((event) => event.shiftedMidiNotes);
  const sourceNotes = resolvedEvents.flatMap((event) => event.sourceMidiNotes);
  const globalOctaveOffset = selectGlobalOctaveOffset(sourceNotes, shiftedNotes);

  if (globalOctaveOffset === undefined) {
    return {
      ok: false,
      reason: "midi-range-unavailable",
      minimumNote: minimum(shiftedNotes),
      maximumNote: maximum(shiftedNotes),
      allowedMinimum: PRACTICE_PIANO_MIN_MIDI,
      allowedMaximum: PRACTICE_PIANO_MAX_MIDI,
    };
  }

  const events: TransposedResolvedVoicingEvent[] = resolvedEvents.map((event) => ({
    eventId: event.eventId,
    sourceMidiNotes: [...event.sourceMidiNotes],
    midiNotes: event.shiftedMidiNotes.map((note) => note + globalOctaveOffset),
    origin: event.origin,
    generatedFallback: event.origin === "generated",
  }));

  return {
    ok: true,
    plan: {
      globalOctaveOffset,
      events,
      warnings: collectWarnings(events),
    },
  };
}

export function selectGlobalOctaveOffset(
  sourceNotes: readonly number[],
  shiftedNotes: readonly number[],
): number | undefined {
  if (sourceNotes.length === 0 || shiftedNotes.length === 0) return 0;
  const sourceCenter = average(sourceNotes);
  const shiftedCenter = average(shiftedNotes);
  return GLOBAL_OCTAVE_OFFSET_CANDIDATES
    .filter((offset) => shiftedNotes.every((note) => (
      note + offset >= PRACTICE_PIANO_MIN_MIDI
      && note + offset <= PRACTICE_PIANO_MAX_MIDI
    )))
    .sort((left, right) => (
      Math.abs(shiftedCenter + left - sourceCenter)
      - Math.abs(shiftedCenter + right - sourceCenter)
      || Math.abs(left) - Math.abs(right)
      || left - right
    ))[0];
}

function collectWarnings(
  events: readonly TransposedResolvedVoicingEvent[],
): TransposedResolvedVoicingWarning[] {
  const warnings: TransposedResolvedVoicingWarning[] = events
    .filter((event) => event.generatedFallback)
    .map((event) => ({
      type: "generated-fallback",
      eventId: event.eventId,
    }));

  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];
    const jump = roundSemitones(
      Math.abs(average(current.midiNotes) - average(previous.midiNotes)),
    );
    if (jump > LARGE_VOICING_JUMP_SEMITONES) {
      warnings.push({
        type: "large-voicing-jump",
        fromEventId: previous.eventId,
        toEventId: current.eventId,
        semitones: jump,
      });
    }
  }
  return warnings;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundSemitones(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function minimum(values: readonly number[]): number {
  return values.length > 0 ? Math.min(...values) : 0;
}

function maximum(values: readonly number[]): number {
  return values.length > 0 ? Math.max(...values) : 0;
}
