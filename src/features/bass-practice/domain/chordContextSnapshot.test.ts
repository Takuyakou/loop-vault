import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../../../domain/chords";
import type { SavedProgressionBlock, SongIdea } from "../../../domain/types";
import { createChordContextVaultBasslineExercise } from "./vaultBassline";
import {
  buildGeneratedChordContextSnapshot,
  buildVaultChordContextSnapshot,
  buildVaultChordContextSnapshotFromVault,
  buildVaultChordContextSnapshotCatalog,
  selectVaultChordContextSections,
  validateChordContextSnapshot,
  type ChordContextSnapshotChord,
} from "./chordContextSnapshot";

function block(overrides: Partial<SavedProgressionBlock> = {}): SavedProgressionBlock {
  return {
    id: "progression-1",
    summaryText: "Private artist name must not cross the Practice boundary",
    sourceAssetId: "asset-private",
    sourceFileName: "private-source.mid",
    sourceFingerprint: "private-fingerprint",
    memo: "private memo",
    detectedKey: "C major",
    bpm: 108,
    timeSignature: "4/4",
    chords: [
      { bar: 1, beat: 1, durationBeats: 2, chord: makeChordSymbol(0, "maj7"), confidence: 1, alternatives: [], warnings: [] },
      { bar: 1, beat: 3, durationBeats: 2, chord: makeChordSymbol(7, "dom7", [], 11), confidence: 1, alternatives: [], warnings: [] },
      { bar: 2, beat: 1, durationBeats: 4, chord: makeChordSymbol(9, "min7"), confidence: 1, alternatives: [], warnings: [] },
      { bar: 3, beat: 1, durationBeats: 4, chord: makeChordSymbol(5, "maj7"), confidence: 1, alternatives: [], warnings: [] },
    ],
    tags: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
    analyzerVersion: "fixture",
    ...overrides,
  };
}

const sourceReference = { ideaId: "idea-1", blockId: "progression-1" } as const;

describe("Vault Chord Context snapshot v1", () => {
  it("selects only complete one- or two-bar 4/4 sections on source chord boundaries", () => {
    const sections = selectVaultChordContextSections(block());
    expect(sections).toEqual(expect.objectContaining({ ok: true }));
    if (!sections.ok) throw new Error("Expected sections.");
    expect(sections.sections.map((section) => section.id)).toEqual([
      "bars:1-1", "bars:1-2", "bars:2-2", "bars:2-3", "bars:3-3",
    ]);
    expect(sections.sections.find((section) => section.id === "bars:1-2")).toMatchObject({
      startBar: 1,
      endBar: 2,
      lengthBeats: 8,
      chords: [
        { startBeat: 0, durationBeats: 2, label: "Cmaj7" },
        { startBeat: 2, durationBeats: 2, label: "G7/B" },
        { startBeat: 4, durationBeats: 4, label: "Am7" },
      ],
    });
  });

  it("creates an immutable, canonical, privacy-safe snapshot that remains valid after source edits", () => {
    const source = block();
    const result = buildVaultChordContextSnapshot({ sourceReference, block: source, sectionId: "bars:1-2" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected snapshot.");

    expect(Object.isFrozen(result.snapshot)).toBe(true);
    expect(Object.isFrozen(result.snapshot.section.chords)).toBe(true);
    expect(Object.isFrozen(result.snapshot.source)).toBe(true);
    expect(Object.isFrozen(result.snapshot.source.reference)).toBe(true);
    expect(Object.isFrozen(result.snapshot.tonalContext)).toBe(true);
    expect(Object.isFrozen(result.snapshot.meter)).toBe(true);
    expect(Object.isFrozen(result.snapshot.section)).toBe(true);
    expect(Object.isFrozen(result.snapshot.section.chords[0])).toBe(true);
    expect(Object.isFrozen(result.snapshot.section.chords[0]!.tensions)).toBe(true);
    expect(() => { (result.snapshot.source as { safeLabel: string }).safeLabel = "Changed"; }).toThrow();
    expect(() => { (result.snapshot.source.reference as { ideaId: string }).ideaId = "changed"; }).toThrow();
    expect(() => { (result.snapshot.section.chords[0] as { root: number }).root = 7; }).toThrow();
    expect(() => { (result.snapshot.section.chords[0]!.tensions as unknown as string[]).push("9"); }).toThrow();
    expect(() => { (result.snapshot.section.chords as unknown as ChordContextSnapshotChord[]).push(result.snapshot.section.chords[0]!); }).toThrow();
    expect(result.snapshot.source).toEqual({
      kind: "vault",
      reference: sourceReference,
      safeLabel: "C major · bars 1-2",
    });
    expect(JSON.stringify(result.snapshot)).not.toMatch(/sourceAsset|sourceFileName|fingerprint|memo|Private artist name/i);
    expect(validateChordContextSnapshot(structuredClone(result.snapshot))).toEqual({
      ok: true,
      snapshot: structuredClone(result.snapshot),
    });

    source.chords[0]!.chord = makeChordSymbol(2, "min7");
    const current = buildVaultChordContextSnapshot({ sourceReference, block: source, sectionId: "bars:1-2" });
    expect(current.ok).toBe(true);
    if (!current.ok) throw new Error("Expected current snapshot.");
    expect(current.snapshot.signature).not.toBe(result.snapshot.signature);
    expect(result.snapshot.section.chords[0]!.label).toBe("Cmaj7");
  });

  it("rejects missing, unsupported, partial, and explicitly invalid selections without clipping or substitution", () => {
    expect(selectVaultChordContextSections(undefined)).toMatchObject({ ok: false, error: { code: "source-unavailable" } });
    expect(selectVaultChordContextSections(block({ timeSignature: "3/4" }))).toMatchObject({ ok: false, error: { code: "unsupported-source" } });
    expect(selectVaultChordContextSections(block({ bpm: 241 }))).toMatchObject({ ok: false, error: { code: "unsupported-source" } });
    expect(selectVaultChordContextSections(block({
      chords: [
        { bar: 1, beat: 1, durationBeats: 3, chord: makeChordSymbol(0, "maj7"), confidence: 1, alternatives: [], warnings: [] },
      ],
    }))).toMatchObject({ ok: false, error: { code: "unsupported-source" } });
    expect(buildVaultChordContextSnapshot({ sourceReference, block: block(), sectionId: "bars:99-100" })).toMatchObject({ ok: false, error: { code: "invalid-section" } });
  });

  it("uses the latest source for new practice, but never needs a live source to validate an old snapshot", () => {
    const source = block();
    const first = buildVaultChordContextSnapshotFromVault([
      { id: sourceReference.ideaId, progressionBlocks: [source] } as SongIdea,
    ], sourceReference, "bars:1-1");
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected first snapshot.");

    source.chords[0]!.chord = makeChordSymbol(2, "min7");
    const latest = buildVaultChordContextSnapshotFromVault([
      { id: sourceReference.ideaId, progressionBlocks: [source] } as SongIdea,
    ], sourceReference, "bars:1-1");
    expect(latest.ok).toBe(true);
    if (!latest.ok) throw new Error("Expected latest snapshot.");
    expect(latest.snapshot.section.chords[0]!.label).toBe("Dm7");
    expect(first.snapshot.section.chords[0]!.label).toBe("Cmaj7");
    expect(validateChordContextSnapshot(first.snapshot).ok).toBe(true);

    expect(buildVaultChordContextSnapshotFromVault([], sourceReference)).toMatchObject({
      ok: false,
      error: { code: "source-unavailable" },
    });
  });

  it("builds a deterministic safe catalog of every supported Vault section", () => {
    const supported = block();
    const unsupported = block({ id: "unsupported", timeSignature: "3/4" });
    const catalog = buildVaultChordContextSnapshotCatalog([
      {
        id: sourceReference.ideaId,
        title: "Private catalog title",
        progressionBlocks: [supported, unsupported],
      } as SongIdea,
    ]);

    expect(catalog.length).toBeGreaterThan(1);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(catalog.every((snapshot) => Object.isFrozen(snapshot))).toBe(true);
    expect(catalog.every((snapshot) => snapshot.source.kind === "vault")).toBe(true);
    expect(new Set(catalog.map((snapshot) => snapshot.signature)).size).toBe(catalog.length);
    expect(JSON.stringify(catalog)).not.toMatch(/Private catalog title|Private artist name|sourceAsset|sourceFileName|fingerprint|memo/i);
    expect(catalog.map((snapshot) => snapshot.source.reference.blockId)).not.toContain("unsupported");
  });

  it("keeps generated Bassline sources compatible and adapts a valid Vault snapshot without the legacy clipper", () => {
    const chords: readonly ChordContextSnapshotChord[] = [
      { id: "generated:0", root: 0, quality: "maj7", tensions: [], label: "Cmaj7", startBeat: 0, durationBeats: 4 },
      { id: "generated:1", root: 7, quality: "dom7", tensions: [], label: "G7", startBeat: 4, durationBeats: 4 },
    ];
    const generated = buildGeneratedChordContextSnapshot({ key: "C major", bpm: 96, chords });
    expect(generated.ok).toBe(true);

    const snapshot = buildVaultChordContextSnapshot({ sourceReference, block: block(), sectionId: "bars:1-2" });
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) throw new Error("Expected snapshot.");
    const exercise = createChordContextVaultBasslineExercise(snapshot.snapshot, 2);
    expect(exercise.ok).toBe(true);
    if (!exercise.ok) throw new Error("Expected Bassline exercise.");
    expect(exercise.exercise.source).toEqual({
      kind: "vault",
      referenceId: sourceReference.blockId,
      label: "C major · bars 1-2",
    });
    expect(exercise.exercise.chords).toHaveLength(3);
    expect(exercise.exercise.chords[exercise.exercise.chords.length - 1]).toMatchObject({ startBeat: 4, durationBeats: 4 });
  });

  it("canonicalizes reversed historical chord order before signature validation and Bassline generation", () => {
    const result = buildVaultChordContextSnapshot({ sourceReference, block: block(), sectionId: "bars:1-2" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected snapshot.");
    const reversed = {
      ...structuredClone(result.snapshot),
      section: {
        ...structuredClone(result.snapshot.section),
        chords: [...result.snapshot.section.chords].reverse(),
      },
    };

    const normalized = validateChordContextSnapshot(reversed);
    expect(normalized).toEqual({ ok: true, snapshot: result.snapshot });
    const canonicalExercise = createChordContextVaultBasslineExercise(result.snapshot, 2);
    const reversedExercise = createChordContextVaultBasslineExercise(reversed, 2);
    expect(canonicalExercise).toEqual(reversedExercise);
    expect(reversedExercise).toMatchObject({
      ok: true,
      exercise: { chords: [{ startBeat: 0 }, { startBeat: 2 }, { startBeat: 4 }] },
    });
  });

  it("canonicalizes a valid historical snapshot so injected private/unknown fields cannot survive", () => {
    const result = buildVaultChordContextSnapshot({ sourceReference, block: block() });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected snapshot.");
    const injected = {
      ...structuredClone(result.snapshot),
      rawMidi: "private-bytes",
      sourcePath: "C:\\Users\\private\\source.mid",
      source: {
        ...structuredClone(result.snapshot.source),
        rawMidi: "private-source-bytes",
        sourcePath: "C:\\Users\\private\\source.mid",
      },
    };
    const normalized = validateChordContextSnapshot(injected);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) throw new Error("Expected canonicalized snapshot.");
    expect(normalized.snapshot).toEqual(result.snapshot);
    expect(JSON.stringify(normalized.snapshot)).not.toMatch(/rawMidi|sourcePath|private/i);
    expect("rawMidi" in normalized.snapshot).toBe(false);
    expect("sourcePath" in normalized.snapshot.source).toBe(false);
  });

  it("rejects path-like source identifiers and detected key values before they cross the snapshot boundary", () => {
    expect(buildVaultChordContextSnapshot({
      sourceReference: { ideaId: "C:\\Users\\private", blockId: sourceReference.blockId },
      block: block(),
    })).toMatchObject({ ok: false, error: { code: "invalid-section" } });
    expect(buildVaultChordContextSnapshot({
      sourceReference: { ideaId: sourceReference.ideaId, blockId: "C:/private/progression" },
      block: block(),
    })).toMatchObject({ ok: false, error: { code: "invalid-section" } });
    expect(selectVaultChordContextSections(block({ detectedKey: "C:\\Users\\private" }))).toMatchObject({
      ok: false,
      error: { code: "unsupported-source" },
    });
    expect(selectVaultChordContextSections(block({ detectedKey: "C major/../../private" }))).toMatchObject({
      ok: false,
      error: { code: "unsupported-source" },
    });
  });
  it("rejects a tampered detached history snapshot by canonical signature", () => {
    const result = buildVaultChordContextSnapshot({ sourceReference, block: block() });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected snapshot.");
    expect(validateChordContextSnapshot({ ...result.snapshot, originalBpm: 112 })).toMatchObject({
      ok: false,
      error: { code: "invalid-snapshot" },
    });
  });
});
