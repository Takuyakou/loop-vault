import type {
  ChordTimelineItem,
  ChordVoicingMemory,
  VoicingSnapshot,
} from "../types";
import {
  canonicalizeKeySignature,
  getCanonicalKey,
  normalizePracticePitchClass,
} from "./keyCatalog";
import { transposeChordSymbol } from "./transposeChordSymbol";
import {
  preservesRomanNumeral,
  romanNumeralForChord,
} from "./transposeRomanNumerals";
import type {
  PracticeProgressionReference,
  TransposedPracticeEvent,
  TransposedPracticeProgression,
  TranspositionPracticeInput,
} from "./types";

export function transposeProgression(
  input: TranspositionPracticeInput,
): TransposedPracticeProgression {
  const sourceKey = canonicalizeKeySignature(input.sourceKey);
  validateSourceReference(input.sourceReference);
  if (sourceKey.mode !== input.sourceMode) {
    throw new Error("sourceKey.mode and sourceMode must match.");
  }
  const targetKey = getCanonicalKey(
    input.targetTonicPitchClass,
    input.sourceMode,
  );
  const semitoneShift = normalizePracticePitchClass(
    targetKey.tonicPitchClass - sourceKey.tonicPitchClass,
  );
  const sourceEventIds = input.events.map((event, index) => (
    sourcePracticeEventId(event, index, input.sourceReference)
  ));
  assertUniqueSourceEventIds(sourceEventIds);
  const events = input.events.map((event, index) => transposeEvent(
    event,
    sourceEventIds[index],
    sourceKey,
    targetKey,
    input.sourceReference,
  ));

  return {
    sourceKey,
    targetKey,
    semitoneShift,
    events,
  };
}

export function practiceEventId(
  event: ChordTimelineItem,
  index: number,
  sourceReference: PracticeProgressionReference,
): string {
  validateSourceReference(sourceReference);
  const reference = progressionReferenceKey(sourceReference);
  const sourceEventId = sourcePracticeEventId(event, index, sourceReference);
  return `practice-event:${reference}:${encodeURIComponent(sourceEventId)}`;
}

function transposeEvent(
  event: ChordTimelineItem,
  sourceEventId: string,
  sourceKey: TranspositionPracticeInput["sourceKey"],
  targetKey: TransposedPracticeProgression["targetKey"],
  sourceReference: PracticeProgressionReference,
): TransposedPracticeEvent {
  const eventId = `practice-event:${progressionReferenceKey(sourceReference)}:${encodeURIComponent(sourceEventId)}`;
  const chord = transposeChordSymbol(event.chord, sourceKey, targetKey);
  if (!preservesRomanNumeral(event.chord, sourceKey, chord, targetKey)) {
    throw new Error(`Transposition changed the degree of event ${eventId}.`);
  }
  const {
    eventId: _storedEventId,
    chord: _storedChord,
    voicingMemory,
    alternatives,
    warnings,
    ...eventData
  } = event;
  return {
    ...eventData,
    eventId,
    sourceEventId,
    chord,
    alternatives: alternatives.map((alternative) => ({
      ...alternative,
      chord: transposeChordSymbol(alternative.chord, sourceKey, targetKey),
    })),
    warnings: [...warnings],
    romanNumeral: romanNumeralForChord(chord, targetKey),
    ...(voicingMemory ? {
      sourceVoicingMemory: cloneVoicingMemory(voicingMemory),
    } : {}),
  };
}

function sourcePracticeEventId(
  event: ChordTimelineItem,
  index: number,
  sourceReference: PracticeProgressionReference,
): string {
  if (event.eventId) return event.eventId;
  return [
    "practice-source",
    progressionReferenceKey(sourceReference),
    `index=${index}`,
    `bar=${event.bar}`,
    `beat=${event.beat}`,
    `duration=${event.durationBeats}`,
  ].join(":");
}

function progressionReferenceKey(
  sourceReference: PracticeProgressionReference,
): string {
  return `${encodeURIComponent(sourceReference.ideaId)}:${encodeURIComponent(sourceReference.blockId)}`;
}

function validateSourceReference(
  sourceReference: PracticeProgressionReference,
): void {
  if (!sourceReference.ideaId.trim() || !sourceReference.blockId.trim()) {
    throw new Error("Practice progression reference requires ideaId and blockId.");
  }
}

function assertUniqueSourceEventIds(sourceEventIds: readonly string[]): void {
  const seen = new Set<string>();
  for (const sourceEventId of sourceEventIds) {
    if (seen.has(sourceEventId)) {
      throw new Error(`Duplicate source event ID: ${sourceEventId}`);
    }
    seen.add(sourceEventId);
  }
}

function cloneVoicingMemory(memory: ChordVoicingMemory): ChordVoicingMemory {
  return {
    ...(memory.sourceVoicing ? {
      sourceVoicing: cloneVoicingSnapshot(memory.sourceVoicing),
    } : {}),
    ...(memory.practiceVoicingOverride ? {
      practiceVoicingOverride: cloneVoicingSnapshot(memory.practiceVoicingOverride),
    } : {}),
  };
}

function cloneVoicingSnapshot(snapshot: VoicingSnapshot): VoicingSnapshot {
  return {
    ...snapshot,
    midiNotes: [...snapshot.midiNotes],
  };
}
