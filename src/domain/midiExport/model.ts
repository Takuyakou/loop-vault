import { voiceChordForPreview } from "../chordVoicing";
import type { ChordSymbol } from "../types";
import { resolveVoicingForUse } from "../voicing";
import {
  DEFAULT_MIDI_EXPORT_BPM,
  DEFAULT_MIDI_EXPORT_TIME_SIGNATURE,
  DEFAULT_MIDI_EXPORT_VELOCITY,
  PROGRESSION_MIDI_PPQ,
  ProgressionMidiExportError,
  type MidiExportChordEvent,
  type MidiExportTimeSignature,
  type MidiExportVoicingSource,
  type MidiExportVoicingSummary,
  type MidiExportWarning,
  type NormalizedMidiEvent,
  type ProgressionMidiExportInput,
  type ProgressionMidiModel,
  type SavedProgressionMidiAdapterOptions,
  type SavedProgressionMidiSource,
} from "./types";

export function savedProgressionToMidiInput(
  block: SavedProgressionMidiSource,
  options: SavedProgressionMidiAdapterOptions = {},
): ProgressionMidiExportInput {
  const warnings: MidiExportWarning[] = [];
  const bpm = validBpm(block.bpm)
    ? block.bpm
    : validBpm(options.ideaBpm)
      ? options.ideaBpm
      : fallbackBpm(warnings);
  const timeSignature = parseTimeSignature(block.timeSignature, warnings);
  const beatsPerBar = timeSignature.numerator * 4 / timeSignature.denominator;

  const events = block.chords.map((event) => {
    const resolved = resolveVoicingForUse(
      event.chord,
      event.voicingMemory,
      voiceChordForPreview(event.chord).notes,
    );
    return {
      chord: event.chord,
      startBeats: (event.bar - 1) * beatsPerBar + event.beat - 1,
      durationBeats: event.durationBeats,
      voicing: {
        midiNotes: resolved.midiNotes,
        source: voicingSourceForOrigin(resolved.origin),
      },
    } satisfies MidiExportChordEvent;
  });

  return { events, bpm, timeSignature, warnings };
}

export function progressionToMidiModel(
  input: ProgressionMidiExportInput,
): ProgressionMidiModel {
  if (input.events.length === 0) {
    throw new ProgressionMidiExportError(
      "empty-progression",
      "The saved progression has no chord events.",
    );
  }
  if (!validBpm(input.bpm)) {
    throw new ProgressionMidiExportError("invalid-bpm", "BPM must be greater than zero.");
  }
  validateTimeSignature(input.timeSignature);

  const ordered = input.events
    .map((event, index) => ({ event, originalIndex: index }))
    .sort((left, right) => (
      left.event.startBeats - right.event.startBeats
      || left.originalIndex - right.originalIndex
    ));
  const firstStartBeat = ordered[0]?.event.startBeats ?? 0;
  if (!Number.isFinite(firstStartBeat)) {
    throw new ProgressionMidiExportError(
      "invalid-position",
      "Chord position must be finite.",
      ordered[0]?.originalIndex,
    );
  }

  const events = ordered.map(({ event, originalIndex }, index) => normalizeEvent(
    event,
    originalIndex,
    index,
    firstStartBeat,
  ));
  const durationTicks = Math.max(...events.map((event) => event.endTick));

  return {
    ppq: PROGRESSION_MIDI_PPQ,
    bpm: input.bpm,
    timeSignature: input.timeSignature,
    durationTicks,
    events,
    voicingSummary: summarizeVoicings(events),
    warnings: [...(input.warnings ?? [])],
  };
}

function normalizeEvent(
  event: MidiExportChordEvent,
  originalIndex: number,
  normalizedIndex: number,
  firstStartBeat: number,
): NormalizedMidiEvent {
  if (!Number.isFinite(event.startBeats)) {
    throw new ProgressionMidiExportError(
      "invalid-position",
      `Chord event ${originalIndex + 1} has an invalid position.`,
      originalIndex,
    );
  }
  if (!Number.isFinite(event.durationBeats) || event.durationBeats <= 0) {
    throw new ProgressionMidiExportError(
      "invalid-duration",
      `Chord event ${originalIndex + 1} must have a positive duration.`,
      originalIndex,
    );
  }

  const startTick = beatsToTicks(event.startBeats - firstStartBeat);
  const durationTicks = beatsToTicks(event.durationBeats);
  if (startTick < 0) {
    throw new ProgressionMidiExportError(
      "invalid-position",
      `Chord event ${originalIndex + 1} starts before the clip.`,
      originalIndex,
    );
  }
  if (durationTicks <= 0) {
    throw new ProgressionMidiExportError(
      "invalid-duration",
      `Chord event ${originalIndex + 1} is shorter than one MIDI tick.`,
      originalIndex,
    );
  }

  if (event.chord === null) {
    return {
      index: normalizedIndex,
      chord: null,
      startTick,
      endTick: startTick + durationTicks,
      durationTicks,
      midiNotes: [],
      velocity: 0,
    };
  }
  if (!event.voicing || event.voicing.midiNotes.length === 0) {
    throw new ProgressionMidiExportError(
      "missing-voicing",
      `Chord event ${originalIndex + 1} has no exportable voicing.`,
      originalIndex,
    );
  }

  const midiNotes = normalizeMidiNotes(event.voicing.midiNotes, originalIndex);
  validateSlashBass(event.chord, midiNotes, originalIndex);
  const velocity = event.voicing.velocity ?? DEFAULT_MIDI_EXPORT_VELOCITY;
  if (!Number.isInteger(velocity) || velocity < 1 || velocity > 127) {
    throw new ProgressionMidiExportError(
      "invalid-velocity",
      `Chord event ${originalIndex + 1} has an invalid velocity.`,
      originalIndex,
    );
  }

  return {
    index: normalizedIndex,
    chord: event.chord,
    startTick,
    endTick: startTick + durationTicks,
    durationTicks,
    midiNotes,
    velocity,
    voicingSource: event.voicing.source,
  };
}

export function beatsToTicks(beats: number): number {
  if (!Number.isFinite(beats)) {
    throw new ProgressionMidiExportError("invalid-position", "Beat value must be finite.");
  }
  return Math.round(beats * PROGRESSION_MIDI_PPQ);
}

function normalizeMidiNotes(notes: readonly number[], eventIndex: number): number[] {
  const unique = [...new Set(notes)];
  if (unique.some((note) => !Number.isInteger(note) || note < 0 || note > 127)) {
    throw new ProgressionMidiExportError(
      "invalid-pitch",
      `Chord event ${eventIndex + 1} contains a MIDI pitch outside 0-127.`,
      eventIndex,
    );
  }
  return unique.sort((left, right) => left - right);
}

function validateSlashBass(
  chord: ChordSymbol,
  notes: readonly number[],
  eventIndex: number,
): void {
  if (chord.bass === undefined) return;
  const lowest = notes[0];
  if (lowest === undefined || normalizePitchClass(lowest) !== normalizePitchClass(chord.bass)) {
    throw new ProgressionMidiExportError(
      "slash-bass-mismatch",
      `Chord event ${eventIndex + 1} does not place its slash bass in the lowest voice.`,
      eventIndex,
    );
  }
}

function summarizeVoicings(events: readonly NormalizedMidiEvent[]): MidiExportVoicingSummary {
  const sources = new Set(
    events.flatMap((event) => event.voicingSource ? [event.voicingSource] : []),
  );
  if (sources.size !== 1) return "mixed";
  return [...sources][0] ?? "mixed";
}

function voicingSourceForOrigin(
  origin: ReturnType<typeof resolveVoicingForUse>["origin"],
): MidiExportVoicingSource {
  if (origin === "practice-override") return "edited";
  if (origin === "source-verified" || origin === "source-auto") return "saved";
  return "generated";
}

function parseTimeSignature(
  value: string | undefined,
  warnings: MidiExportWarning[],
): MidiExportTimeSignature {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? "");
  if (!match) return fallbackTimeSignature(warnings);
  const timeSignature = {
    numerator: Number(match[1]),
    denominator: Number(match[2]),
  };
  if (!isValidTimeSignature(timeSignature)) return fallbackTimeSignature(warnings);
  return timeSignature;
}

function fallbackBpm(warnings: MidiExportWarning[]): number {
  warnings.push({
    code: "bpm-fallback",
    message: `BPM was not set. ${DEFAULT_MIDI_EXPORT_BPM} BPM was used.`,
  });
  return DEFAULT_MIDI_EXPORT_BPM;
}

function fallbackTimeSignature(warnings: MidiExportWarning[]): MidiExportTimeSignature {
  warnings.push({
    code: "time-signature-fallback",
    message: "Time signature was not set. 4/4 was used.",
  });
  return { ...DEFAULT_MIDI_EXPORT_TIME_SIGNATURE };
}

function validateTimeSignature(timeSignature: MidiExportTimeSignature): void {
  if (!isValidTimeSignature(timeSignature)) {
    throw new ProgressionMidiExportError(
      "invalid-time-signature",
      "Time signature must use a positive numerator and a power-of-two denominator.",
    );
  }
}

function isValidTimeSignature(timeSignature: MidiExportTimeSignature): boolean {
  return Number.isInteger(timeSignature.numerator)
    && timeSignature.numerator > 0
    && Number.isInteger(timeSignature.denominator)
    && timeSignature.denominator > 0
    && (timeSignature.denominator & (timeSignature.denominator - 1)) === 0;
}

function validBpm(value: number | undefined): value is number {
  return Number.isFinite(value) && (value ?? 0) > 0;
}

function normalizePitchClass(value: number): number {
  return ((Math.trunc(value) % 12) + 12) % 12;
}

