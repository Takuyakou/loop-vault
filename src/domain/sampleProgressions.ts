import { buildBuiltin } from "./chordDojo/builtins";
import { normalizeMidiNotes, normalizedChordKey } from "./voicing/normalizeVoicing";
import type { ChordSymbol, ChordTimelineItem, VoicingSnapshot } from "./types";

/**
 * P24-03: the three 「サンプル進行」 the empty-Vault guide can add.
 *
 * They are the Chord Dojo's own standard progressions (`buildBuiltin`) at a fixed key, so the cards sound
 * like the lesson they came from. The key is fixed here because `buildBuiltin` voices every key
 * differently; keeping the built notes is what makes the sample a real recording of something.
 */
export interface SampleProgressionSpec {
  /** A `BUILTINS` id (`src/domain/chordDojo/builtins.ts`). */
  readonly id: string;
  /** The song idea's title. */
  readonly title: string;
  /** The name the progression page shows (the memo's name part). */
  readonly name: string;
  /** The confirmed key, in the form `confirmedTextProgressionKeyState` accepts. */
  readonly keyLabel: string;
  /** The key's tonic pitch class, as `buildBuiltin` takes it. */
  readonly keyRoot: number;
}

export const SAMPLE_PROGRESSIONS: readonly SampleProgressionSpec[] = [
  { id: "ouudou", title: "サンプル：王道進行", name: "王道進行", keyLabel: "C major", keyRoot: 0 },
  { id: "marusa", title: "サンプル：丸サ進行", name: "丸サ進行", keyLabel: "F major", keyRoot: 5 },
  { id: "circle", title: "サンプル：循環進行", name: "循環進行", keyLabel: "Bb major", keyRoot: 10 },
];

export const SAMPLE_PROGRESSION_TAG = "サンプル";

export interface SampleProgressionDraft {
  readonly spec: SampleProgressionSpec;
  readonly beatsPerBar: 4;
  readonly scoreLengthBeats: number;
  readonly chords: readonly ChordTimelineItem[];
}

/**
 * The block's chords, in the shape the text save path stores: one card per authored chord, the written
 * notes as the card's own voicing, and no MIDI provenance (no confidence, no alternatives, no warnings).
 */
export function buildSampleProgression(spec: SampleProgressionSpec): SampleProgressionDraft {
  const built = buildBuiltin(spec.id, spec.keyRoot);
  let beat = 0;
  const chords = built.chords.map((entry, index) => {
    const durationBeats = entry.beats ?? 4;
    const item: ChordTimelineItem = {
      eventId: `sample-${spec.id}-${index + 1}`,
      bar: Math.floor(beat / 4) + 1,
      beat: (beat % 4) + 1,
      durationBeats,
      chord: entry.chord,
      confidence: 0,
      alternatives: [],
      warnings: [],
      voicingMemory: { practiceVoicingOverride: sampleVoicing(entry.chord, entry.notes) },
    };
    beat += durationBeats;
    return item;
  });
  return { spec, beatsPerBar: 4, scoreLengthBeats: beat, chords };
}

/** A valid, chord-compatible voicing snapshot: the same shape the text save keeps for its own notes. */
function sampleVoicing(chord: ChordSymbol, notes: readonly number[]): VoicingSnapshot {
  const midiNotes = normalizeMidiNotes(notes);
  return {
    schemaVersion: 1,
    source: "manual",
    representation: "simultaneous-voicing",
    midiNotes,
    bassNote: midiNotes[0]!,
    capturedForChordKey: normalizedChordKey(chord),
    capturedForChordLabel: chord.label,
    confidence: 1,
    userVerified: true,
    extractorVersion: "text-style-v1:generated-close",
  };
}
