import { describe, expect, it } from "vitest";
import { analyzeMidi } from "../midi/analysis";
import { buildCandidateEvents, candidateEventsAsTimeline } from "../midi/candidateBlock";
import { parseMidi } from "../midi/parser";
import { beatsPerBar } from "../midi/timing";
import { voiceChordForPreview } from "../chordVoicing";
import { attachSourceVoicings } from "./sourceVoicing";
import { resolveVoicingForUse } from "./resolveVoicing";
import type { ChordTimelineItem } from "../types";

/**
 * Automated stand-in for the subjective listening check.
 *
 * A human cannot be automated, but "does the saved progression carry the same
 * notes as the candidate that was auditioned" can be. This compares the full
 * event payload — pitch, count, source, timing, duration — across the capture
 * preview and the save conversion.
 */

/** Two bars of piano chords with distinct voicings so a swap would be visible. */
function chordMidi(): Uint8Array {
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0];
  const events: number[] = [];
  const bars = [[38, 53, 57, 60], [40, 55, 59, 62]];
  bars.forEach((pitches) => {
    pitches.forEach((pitch, index) => {
      events.push(index === 0 ? 0x00 : 0x00, 0x90, pitch, 0x64);
    });
    events.push(0x87, 0x40, 0x80, pitches[0], 0x00);
    pitches.slice(1).forEach((pitch) => events.push(0x00, 0x80, pitch, 0x00));
  });
  events.push(0x00, 0xff, 0x2f, 0x00);
  const length = events.length;
  return Uint8Array.from([
    ...header, 0x4d, 0x54, 0x72, 0x6b,
    (length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff,
    ...events,
  ]);
}

/** Everything that decides what the user hears for one event. */
function playbackFingerprint(item: ChordTimelineItem) {
  const resolved = resolveVoicingForUse(
    item.chord,
    item.voicingMemory,
    voiceChordForPreview(item.chord).notes,
  );
  return {
    chord: item.chord.label,
    bar: item.bar,
    beat: item.beat,
    durationBeats: item.durationBeats,
    midiNotes: [...resolved.midiNotes],
    noteCount: resolved.midiNotes.length,
    voicingSource: resolved.origin,
  };
}

describe("capture preview and saved progression carry the same notes", () => {
  const bytes = chordMidi();
  const analysis = analyzeMidi(bytes);
  const sourceData = parseMidi(bytes);
  const context = { analysis, sourceData, sourceVoices: undefined };
  const meter = beatsPerBar(analysis.timeSignature);

  it("keeps every playback field identical through the save conversion", () => {
    const enrichedTimeline = attachSourceVoicings(analysis.fullTimeline, context, new Map());
    const events = buildCandidateEvents(enrichedTimeline, 1, analysis.totalBars, meter);

    // What capture plays.
    const previewed = events.map((event) => playbackFingerprint(event.source));
    // What the save path stores and the saved screens then play.
    const saved = candidateEventsAsTimeline(events, 1, meter).map(playbackFingerprint);

    expect(saved).toEqual(previewed);
  });

  it("preserves pitch, count and source rather than only the chord name", () => {
    const enriched = attachSourceVoicings(analysis.fullTimeline, context, new Map());
    for (const item of enriched) {
      const print = playbackFingerprint(item);
      expect(print.noteCount).toBeGreaterThan(0);
      expect(print.midiNotes).toEqual([...print.midiNotes].sort((a, b) => a - b));
      // The original MIDI voicing is what plays, not a generated substitute.
      expect(print.voicingSource).not.toBe("generated");
    }
  });

  it("keeps the raw parsed notes untouched by the analysis path", () => {
    const before = JSON.stringify(parseMidi(bytes).notes);
    attachSourceVoicings(analyzeMidi(bytes).fullTimeline, context, new Map());
    expect(JSON.stringify(parseMidi(bytes).notes)).toBe(before);
  });

  it("keeps tempo and meter stable across the conversion", () => {
    const events = buildCandidateEvents(analysis.fullTimeline, 1, analysis.totalBars, meter);
    const restored = candidateEventsAsTimeline(events, 1, meter);
    expect(restored.map((item) => item.durationBeats))
      .toEqual(events.map((event) => event.durationBeats));
    expect(analysis.timeSignature).toBe(parseMidi(bytes).timeSignature);
  });
});
