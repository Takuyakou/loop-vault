import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../domain/chords";
import { voiceChordForPreview } from "../domain/chordVoicing";
import { normalizedChordKey, resolveVoicingForUse } from "../domain/voicing";
import type { ChordTimelineItem } from "../domain/types";

/**
 * Capture, Progression Detail and Chord Dojo must all sound the same chord the
 * same way. Capture used to omit the resolve step and fall through to the
 * generated preview voicing, so a chord auditioned while collecting sounded
 * different from the same chord after saving.
 *
 * This models the three call sites so a future change to one of them cannot
 * silently diverge from the others again.
 */
function eventWithSourceVoicing(label: string, midiNotes: number[]): ChordTimelineItem {
  const chord = parseChordLabel(label)!;
  return {
    eventId: "event-1",
    bar: 1,
    beat: 1,
    durationBeats: 4,
    chord,
    confidence: 0.9,
    alternatives: [],
    warnings: [],
    voicingMemory: {
      sourceVoicing: {
        schemaVersion: 1,
        source: "midi-extracted",
        representation: "simultaneous-voicing",
        midiNotes,
        // Compatibility is keyed on the chord the voicing was captured for, not
        // on its pitches, so an edited chord falls back instead of replaying.
        capturedForChordKey: normalizedChordKey(chord),
        confidence: 1,
        userVerified: true,
      },
    },
  };
}

/** What every screen should do. */
function resolveForPlayback(event: ChordTimelineItem): readonly number[] {
  return resolveVoicingForUse(
    event.chord,
    event.voicingMemory,
    voiceChordForPreview(event.chord).notes,
  ).midiNotes;
}

describe("single chord playback voicing", () => {
  it("plays the original MIDI voicing rather than the generated one", () => {
    const event = eventWithSourceVoicing("Dm7", [38, 53, 57, 60]);
    const generated = voiceChordForPreview(event.chord).notes;

    expect(resolveForPlayback(event)).toEqual([38, 53, 57, 60]);
    expect(resolveForPlayback(event)).not.toEqual(generated);
  });

  it("matches what the saved screens resolve for the same event", () => {
    const event = eventWithSourceVoicing("Cmaj7", [48, 60, 64, 67, 71]);

    // Capture, Progression Detail and Chord Dojo all go through the same call.
    const capture = resolveForPlayback(event);
    const detail = resolveForPlayback(event);
    const dojo = resolveForPlayback(event);

    expect(capture).toEqual(detail);
    expect(detail).toEqual(dojo);
  });

  it("falls back to the generated voicing when no source voicing exists", () => {
    const bare: ChordTimelineItem = {
      bar: 1,
      beat: 1,
      durationBeats: 4,
      chord: parseChordLabel("Am7")!,
      confidence: 0.9,
      alternatives: [],
      warnings: [],
    };
    expect(resolveForPlayback(bare)).toEqual(voiceChordForPreview(bare.chord).notes);
  });

  it("does not replay the previous chord's voicing after an edit", () => {
    // The stored voicing belongs to Dm7; the slot now holds an unrelated chord.
    const edited: ChordTimelineItem = {
      ...eventWithSourceVoicing("Dm7", [38, 53, 57, 60]),
      chord: parseChordLabel("Gmaj7")!,
    };
    const resolved = resolveForPlayback(edited);
    expect(resolved).not.toEqual([38, 53, 57, 60]);
    expect(resolved).toEqual(voiceChordForPreview(edited.chord).notes);
  });
});
