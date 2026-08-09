import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../../../domain/chords";
import type { ChordSymbol, SavedProgressionBlock } from "../../../domain/types";
import {
  buildGeneratedChordContextSnapshot,
  buildVaultChordContextSnapshot,
  type ChordContextSnapshot,
  type ChordContextSnapshotChord,
} from "../domain/chordContextSnapshot";
import { createChordContextBasslineExercise } from "../domain/vaultBassline";
import {
  CHORD_CONTEXT_MAX_SECTION_BEATS,
  buildChordContextPlaybackPlan,
  type ChordContextListenInput,
} from "./chordContextPlayback";

const cMaj7: ChordSymbol = { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" };
const g7: ChordSymbol = { root: 7, quality: "dom7", tensions: [], label: "G7" };

function completeVaultBlock(bars: number): SavedProgressionBlock {
  return {
    id: `long-vault-${bars}`,
    summaryText: "Fixture progression",
    detectedKey: "C major",
    bpm: 96,
    timeSignature: "4/4",
    chords: Array.from({ length: bars }, (_, index) => ({
      bar: index + 1,
      beat: 1,
      durationBeats: 4,
      chord: makeChordSymbol(index % 4 === 3 ? 7 : 0, index % 4 === 3 ? "dom7" : "maj7"),
      confidence: 1,
      alternatives: [],
      warnings: [],
    })),
    tags: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
    analyzerVersion: "fixture",
  };
}

function sectionInput(snapshot: ChordContextSnapshot): ChordContextListenInput {
  return {
    mode: "listen",
    listenMode: "bass-and-chords",
    bpm: snapshot.originalBpm,
    meter: { numerator: 4, denominator: 4 },
    countInBeats: 4,
    chordEvents: snapshot.section.chords.map((chord) => ({
      id: chord.id,
      chord: makeChordSymbol(chord.root, chord.quality, [...chord.tensions], chord.bass),
      startBeat: chord.startBeat,
      durationBeats: chord.durationBeats,
    })),
    bassEvents: snapshot.section.chords.map((chord) => ({
      id: `bass:${chord.id}`,
      pitch: 36 + (chord.root % 12),
      startBeat: chord.startBeat,
      durationBeats: 1,
      velocity: 0.8,
    })),
  };
}

describe("P5.18.1 long Chord Context sections", () => {
  it("creates one deterministic bounded plan for a complete 12-bar phrase", () => {
    const chordEvents = Array.from({ length: 12 }, (_, index) => ({
      id: `chord:${index}`,
      chord: index % 4 === 3 ? g7 : cMaj7,
      startBeat: index * 4,
      durationBeats: 4,
    }));
    const bassEvents = Array.from({ length: 12 }, (_, index) => ({
      id: `bass:${index}`,
      pitch: index % 4 === 3 ? 43 : 36,
      startBeat: index * 4,
      durationBeats: 1,
      velocity: 0.8,
    }));
    const input: ChordContextListenInput = {
      mode: "listen",
      listenMode: "bass-chords-and-metronome",
      bpm: 96,
      meter: { numerator: 4, denominator: 4 },
      countInBeats: 4,
      chordEvents,
      bassEvents,
    };

    const first = buildChordContextPlaybackPlan(input);
    const second = buildChordContextPlaybackPlan(structuredClone(input));

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.error.message);
    const plannedChords = first.plan.events.filter((event) => event.layer === "chords");
    expect(plannedChords).toHaveLength(12);
    expect(first.plan.events.filter((event) => event.layer === "bass")).toHaveLength(12);
    expect(first.plan.events.filter((event) => event.layer === "metronome")).toHaveLength(52);
    expect(plannedChords[plannedChords.length - 1]?.beat).toBe(CHORD_CONTEXT_MAX_SECTION_BEATS - 4);
  });

  it("keeps generated and Vault 4, 8, and 12-bar sources deterministic and complete", () => {
    for (const bars of [4, 8, 12] as const) {
      const chords: readonly ChordContextSnapshotChord[] = Array.from({ length: bars }, (_, index) => ({
        id: `generated:${bars}:${index}`,
        root: index % 4 === 3 ? 7 : 0,
        quality: index % 4 === 3 ? "dom7" : "maj7",
        tensions: [],
        label: index % 4 === 3 ? "G7" : "Cmaj7",
        startBeat: index * 4,
        durationBeats: 4,
      }));
      const generated = buildGeneratedChordContextSnapshot({ key: "C major", bpm: 96, chords });
      const vault = buildVaultChordContextSnapshot({
        sourceReference: { ideaId: `long-idea-${bars}`, blockId: `long-vault-${bars}` },
        block: completeVaultBlock(bars),
        sectionId: `bars:1-${bars}`,
      });

      expect(generated.ok).toBe(true);
      expect(vault.ok).toBe(true);
      if (!generated.ok || !vault.ok) throw new Error("Expected complete long snapshots.");

      for (const snapshot of [generated.snapshot, vault.snapshot]) {
        const firstExercise = createChordContextBasslineExercise(snapshot, 2);
        const secondExercise = createChordContextBasslineExercise(structuredClone(snapshot), 2);
        expect(firstExercise).toEqual(secondExercise);
        expect(firstExercise).toMatchObject({ ok: true, exercise: { chords: expect.any(Array) } });
        if (!firstExercise.ok) throw new Error(firstExercise.error.message);
        expect(firstExercise.exercise.chords).toHaveLength(bars);

        const firstPlan = buildChordContextPlaybackPlan(sectionInput(snapshot));
        const secondPlan = buildChordContextPlaybackPlan(sectionInput(structuredClone(snapshot)));
        expect(firstPlan).toEqual(secondPlan);
        expect(firstPlan.ok).toBe(true);
        if (!firstPlan.ok) throw new Error(firstPlan.error.message);
        const plannedChords = firstPlan.plan.events.filter((event) => event.layer === "chords");
        expect(plannedChords).toHaveLength(bars);
        expect(plannedChords.every((event) => event.beat >= 0 && event.beat < bars * 4)).toBe(true);
      }
    }
  });
});
