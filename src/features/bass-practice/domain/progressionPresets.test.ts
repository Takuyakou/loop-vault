import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../../../domain/chords";
import type { SavedProgressionBlock } from "../../../domain/types";
import {
  buildGeneratedChordContextSnapshot,
  buildVaultChordContextSnapshot,
  selectVaultChordContextSections,
  validateChordContextSnapshot,
} from "./chordContextSnapshot";
import {
  BASSLINE_PRESET_CATALOG_VERSION,
  BASSLINE_PROGRESSION_PRESETS,
  buildBasslinePresetSnapshot,
} from "./progressionPresets";
import { createChordContextPresetBasslineExercise } from "./vaultBassline";
import { createChordContextHistoryEntry } from "./chordContextHistory";

const majorKeys = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

describe("P5.18.1 Bassline preset catalog", () => {
  it("ships eight learning roles plus the immutable legacy-default compatibility preset", () => {
    expect(BASSLINE_PRESET_CATALOG_VERSION).toBe("bassline-preset-catalog-v1");
    expect(BASSLINE_PROGRESSION_PRESETS).toHaveLength(9);
    expect(new Set(BASSLINE_PROGRESSION_PRESETS.map((preset) => preset.id)).size).toBe(9);
    expect(BASSLINE_PROGRESSION_PRESETS.map((preset) => preset.id)).toEqual([
      "legacy-generated-default", "fourth-fifth-foundation", "pop-four-chords", "minor-descent",
      "turnaround", "ii-v-i", "modal-rock", "descending-bass", "twelve-bar-blues",
    ]);
    expect(BASSLINE_PROGRESSION_PRESETS.every((preset) => Object.isFrozen(preset))).toBe(true);
  });

  it("builds exact, immutable, deterministic preset snapshots at their declared section lengths", () => {
    const expectedLengths = [8, 16, 16, 16, 16, 16, 16, 32, 48];
    const built = BASSLINE_PROGRESSION_PRESETS.map((preset) => buildBasslinePresetSnapshot({ presetId: preset.id }));
    expect(built.every((result) => result.ok)).toBe(true);
    const snapshots = built.map((result) => {
      if (!result.ok) throw new Error(result.error.message);
      return result.snapshot;
    });
    expect(snapshots.map((snapshot) => snapshot.section.lengthBeats)).toEqual(expectedLengths);
    expect(snapshots.every((snapshot) => snapshot.source.kind === "preset")).toBe(true);
    expect(snapshots.every((snapshot) => Object.isFrozen(snapshot.section.chords))).toBe(true);
    expect(snapshots.every((snapshot) => validateChordContextSnapshot(structuredClone(snapshot)).ok)).toBe(true);
    expect(buildBasslinePresetSnapshot({ presetId: "twelve-bar-blues" })).toEqual(buildBasslinePresetSnapshot({ presetId: "twelve-bar-blues" }));
  });

  it("preserves chord quality and slash-bass identity across all twelve deterministic tonal centres", () => {
    const descending = buildBasslinePresetSnapshot({ presetId: "descending-bass" });
    expect(descending.ok).toBe(true);
    if (!descending.ok) throw new Error(descending.error.message);
    expect(descending.snapshot.section.chords.map((chord) => chord.label)).toEqual([
      "C", "G/B", "Am", "Em/G", "F", "C/E", "Dm7", "G7",
    ]);

    for (const tonic of majorKeys) {
      const first = buildBasslinePresetSnapshot({ presetId: "descending-bass", key: `${tonic} major` });
      const second = buildBasslinePresetSnapshot({ presetId: "descending-bass", key: `${tonic} major` });
      expect(first).toEqual(second);
      if (!first.ok) throw new Error(`${tonic}: ${first.error.message}`);
      expect(first.snapshot.section.chords).toHaveLength(8);
    }
    expect(buildBasslinePresetSnapshot({ presetId: "minor-descent", key: "C major" })).toMatchObject({
      ok: false,
      error: { code: "unsupported-source" },
    });
  });

  it("keeps the legacy generated snapshot valid while exposing a distinct preset identity", () => {
    const legacy = buildBasslinePresetSnapshot({ presetId: "legacy-generated-default" });
    const generated = buildGeneratedChordContextSnapshot({
      key: "C major", bpm: 96, chords: [
        { id: "generated:0", root: 2, quality: "min7", tensions: [], label: "Dm7", startBeat: 0, durationBeats: 2 },
        { id: "generated:1", root: 7, quality: "dom7", tensions: [], label: "G7", startBeat: 2, durationBeats: 2 },
        { id: "generated:2", root: 0, quality: "maj7", tensions: [], label: "Cmaj7", startBeat: 4, durationBeats: 4 },
      ],
    });
    expect(legacy.ok && generated.ok).toBe(true);
    if (!legacy.ok || !generated.ok) throw new Error("Expected snapshots.");
    expect(legacy.snapshot.source.kind).toBe("preset");
    expect(generated.snapshot.source.kind).toBe("generated");
    expect(legacy.snapshot.section.chords.map((chord) => chord.label)).toEqual(generated.snapshot.section.chords.map((chord) => chord.label));
  });

  it("extends Vault sections to complete 12-bar sources without clipping and keeps the Bassline adapter deterministic", () => {
    const block: SavedProgressionBlock = {
      id: "blues-12", summaryText: "not retained", sourceAssetId: "asset", sourceFileName: "not-retained.mid", sourceFingerprint: "fixture", memo: "not retained",
      detectedKey: "A major", bpm: 96, timeSignature: "4/4", tags: [], capturedAt: "2026-01-01T00:00:00.000Z", analyzerVersion: "fixture",
      chords: Array.from({ length: 12 }, (_, index) => ({
        bar: index + 1, beat: 1, durationBeats: 4,
        chord: makeChordSymbol(index < 4 || (index >= 6 && index < 8) || index >= 10 ? 9 : index < 6 || index === 9 ? 2 : 4, "dom7"),
        confidence: 1, alternatives: [], warnings: [],
      })),
    };
    const sections = selectVaultChordContextSections(block);
    expect(sections.ok).toBe(true);
    if (!sections.ok) throw new Error(sections.error.message);
    expect(sections.sections.some((section) => section.id === "bars:1-12" && section.lengthBeats === 48)).toBe(true);
    const snapshot = buildVaultChordContextSnapshot({ sourceReference: { ideaId: "idea", blockId: "blues-12" }, block, sectionId: "bars:1-12" });
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) throw new Error(snapshot.error.message);
    const preset = buildBasslinePresetSnapshot({ presetId: "twelve-bar-blues" });
    if (!preset.ok) throw new Error(preset.error.message);
    const exercise = createChordContextPresetBasslineExercise(preset.snapshot, 2);
    expect(exercise.ok).toBe(true);
    if (exercise.ok) expect(exercise.exercise.targetEvents).toHaveLength(48);
  });

  it("records a detached factual History identity for a preset without retaining source material", () => {
    const preset = buildBasslinePresetSnapshot({ presetId: "twelve-bar-blues" });
    expect(preset.ok).toBe(true);
    if (!preset.ok) throw new Error(preset.error.message);
    const entry = createChordContextHistoryEntry({
      id: "history:preset",
      completedAt: "2026-08-09T00:00:00.000Z",
      snapshot: preset.snapshot,
      effectiveBpm: preset.snapshot.originalBpm,
      listenMode: "bass-and-chords",
      playMode: "chords-only",
      metronomeUsed: false,
      recordCompareUsed: false,
    });
    expect(entry).toMatchObject({
      source: { kind: "preset", presetId: "twelve-bar-blues", catalogVersion: BASSLINE_PRESET_CATALOG_VERSION },
      section: { lengthBeats: 48 },
    });
    expect(JSON.stringify(entry)).not.toMatch(/rawMidi|sourcePath|sourceFileName/);
  });
});
