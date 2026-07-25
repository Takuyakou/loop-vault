import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { layoutSongMiniMapCandidates } from "../../components/SongMiniMap";
import { analyzeMidi, defaultAnalyzerMode } from "./analysis";
import type { MidiAnalyzerMode } from "./types";

const modes: MidiAnalyzerMode[] = ["legacy", "voice-aware-rerank-v1"];

describe("long MIDI candidate coverage", () => {
  it.each(modes)("keeps early, middle, and ending candidates in %s", (mode) => {
    const bytes = longMidiBytes();
    const result = analyzeMidi(bytes, { mode });
    const second = analyzeMidi(bytes, { mode });
    const finalTimelineItem = result.fullTimeline[result.fullTimeline.length - 1];
    const finalTimelineEndBeat = (finalTimelineItem.bar - 1) * 4
      + finalTimelineItem.beat - 1
      + finalTimelineItem.durationBeats;
    const miniMapLayout = layoutSongMiniMapCandidates(result.blockCandidates, result.totalBars);

    expect(defaultAnalyzerMode).toBe("legacy");
    expect(result.totalBars).toBe(240);
    expect(finalTimelineEndBeat).toBe(960);
    expect(result.blockCandidates).toHaveLength(12);
    expect(result.blockCandidates.every(
      (candidate) => Number.isFinite(candidate.selectionScore),
    )).toBe(true);
    expect(result.blockCandidates.some((candidate) => overlaps(candidate, 1, 4))).toBe(true);
    expect(result.blockCandidates.some((candidate) => overlaps(candidate, 117, 120))).toBe(true);
    expect(result.blockCandidates.some((candidate) => overlaps(candidate, 237, 240))).toBe(true);
    // Two-bar windows were added in P4.0-04 so short loops and vamps can be
    // found at their real length.
    expect(new Set(result.blockCandidates.map((candidate) => candidate.lengthBars)))
      .toEqual(new Set([2, 4, 8, 16]));
    expect(second.blockCandidates).toEqual(result.blockCandidates);
    expect(JSON.stringify(result)).not.toContain("rankingScore");
    expect(miniMapLayout).toHaveLength(result.blockCandidates.length);
    expect(miniMapLayout.some(({ candidate }) => candidate.endBar === 240)).toBe(true);
  });
});

function overlaps(
  candidate: { startBar: number; endBar: number },
  startBar: number,
  endBar: number,
): boolean {
  return candidate.startBar <= endBar && candidate.endBar >= startBar;
}

function longMidiBytes(): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(120);
  const track = midi.addTrack();
  track.channel = 0;
  track.instrument.number = 0;
  const sections = [
    { startBar: 1, endBar: 4, pitches: [60, 64, 67] },
    { startBar: 117, endBar: 120, pitches: [65, 69, 72] },
    { startBar: 237, endBar: 240, pitches: [67, 71, 74] },
  ];
  for (const section of sections) {
    for (let bar = section.startBar; bar <= section.endBar; bar += 1) {
      for (const pitch of section.pitches) {
        track.addNote({
          midi: pitch,
          ticks: (bar - 1) * 1920,
          durationTicks: 1920,
          velocity: 0.8,
        });
      }
    }
  }
  return new Uint8Array(midi.toArray());
}
