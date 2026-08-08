import { describe, expect, it } from "vitest";
import { buildGeneratedChordContextSnapshot } from "./chordContextSnapshot";
import { createChordContextHistoryEntry } from "./chordContextHistory";

describe("Chord Context factual history", () => {
  it("persists source facts and tempo without storing the source snapshot itself", () => {
    const built = buildGeneratedChordContextSnapshot({
      key: "C major",
      bpm: 96,
      chords: [
        { id: "one", root: 0, quality: "maj7", tensions: [], label: "Cmaj7", startBeat: 0, durationBeats: 4 },
      ],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const entry = createChordContextHistoryEntry({
      id: "history:1",
      completedAt: "2026-08-08T00:00:00.000Z",
      snapshot: built.snapshot,
      effectiveBpm: 100,
      listenMode: "bass-and-chords",
      playMode: "chords-and-metronome",
      metronomeUsed: true,
      recordCompareUsed: true,
      retainedTakeReference: "rec:opaque",
    });

    expect(entry).toMatchObject({
      source: { kind: "generated", safeLabel: "Generated progression" },
      originalBpm: 96,
      effectiveBpm: 100,
      metronomeUsed: true,
      recordCompareUsed: true,
      retainedTakeReference: "rec:opaque",
    });
    expect(JSON.stringify(entry)).not.toContain("rawMidi");
    expect(JSON.stringify(entry)).not.toContain("sourcePath");
  });
  it("does not infer metronome use from a selected mode without successful activity", () => {
    const built = buildGeneratedChordContextSnapshot({
      key: "C major",
      bpm: 96,
      chords: [{ id: "one", root: 0, quality: "maj7", tensions: [], label: "Cmaj7", startBeat: 0, durationBeats: 4 }],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const entry = createChordContextHistoryEntry({
      id: "history:failed-playback",
      completedAt: "2026-08-08T00:00:00.000Z",
      snapshot: built.snapshot,
      effectiveBpm: 96,
      listenMode: "bass-chords-and-metronome",
      playMode: "chords-and-metronome",
      metronomeUsed: false,
      recordCompareUsed: false,
    });
    expect(entry.metronomeUsed).toBe(false);
  });
});