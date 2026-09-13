import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import { makeIdea } from "../testFactory";
import { TEXT_PROGRESSION_ANALYZER_VERSION } from "../textProgression";
import type { ChordTimelineItem, SavedProgressionBlock, VoicingSnapshot } from "../types";
import { normalizedChordKey } from "../voicing";
import { buildProgressionVoicingPracticeHandoffFromVault } from "./handoff";
import { resolveProgressionPracticeVoicings } from "./voicingResolution";

describe("P5.27 saved Vault handoff", () => {
  it("detaches every selection and prefers complete Source MIDI without retaining private fields", () => {
    const block = progression([
      event(1, 1, 2, 0, "source-midi"),
      event(1, 3, 2, 7, "source-midi"),
    ]);
    Object.assign(block, {
      sourceFileName: "private.mid",
      sourceFingerprint: "private-source",
      memo: "private memo",
    });
    const idea = makeIdea({ id: "idea-1", title: "private title", progressionBlocks: [block] });

    const result = buildProgressionVoicingPracticeHandoffFromVault(
      [idea],
      { ideaId: idea.id, blockId: block.id },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handoff.initialSelection).toBe("source-midi");
    expect(Object.keys(result.handoff.snapshots).sort()).toEqual([
      "basic-full", "basic-shell", "custom", "left-hand", "source-midi",
    ]);
    expect(result.handoff.snapshots["source-midi"]?.events.map((item) => item.voicing?.midiNotes))
      .toEqual([[48, 55, 59], [43, 50, 53]]);
    expect(Object.isFrozen(result.handoff)).toBe(true);
    expect(Object.isFrozen(result.handoff.snapshots)).toBe(true);
    const serialized = JSON.stringify(result.handoff);
    expect(serialized).not.toMatch(/private|sourceFileName|sourceFingerprint|memo|title/i);

    block.chords[0]!.voicingMemory!.sourceVoicing!.midiNotes[0] = 1;
    idea.progressionBlocks = [];
    expect(result.handoff.snapshots["source-midi"]?.events[0]?.voicing?.midiNotes)
      .toEqual([48, 55, 59]);
  });

  it("prefers complete Custom, but never treats a partial MY source as complete", () => {
    const complete = progression([
      event(1, 1, 2, 0, "custom"),
      event(1, 3, 2, 7, "custom"),
    ]);
    const customResult = buildProgressionVoicingPracticeHandoffFromVault(
      [makeIdea({ id: "idea-custom", progressionBlocks: [complete] })],
      { ideaId: "idea-custom", blockId: complete.id },
    );
    expect(customResult.ok && customResult.handoff.initialSelection).toBe("custom");

    const partial = progression([
      event(1, 1, 2, 0, "custom"),
      event(1, 3, 2, 7),
    ]);
    const partialResult = buildProgressionVoicingPracticeHandoffFromVault(
      [makeIdea({ id: "idea-partial", progressionBlocks: [partial] })],
      { ideaId: "idea-partial", blockId: partial.id },
    );
    expect(partialResult.ok).toBe(true);
    if (!partialResult.ok) return;
    expect(partialResult.handoff.initialSelection).toBe("basic-full");
    expect(partialResult.handoff.snapshots.custom?.events[1]?.voicing).toBeUndefined();
    expect(partialResult.handoff.snapshots["source-midi"]?.events.every((item) => !item.voicing))
      .toBe(true);
  });

  it("keeps a pre-voicing-memory Vault progression playable through Basic Full", () => {
    const block = progression([
      event(1, 1, 4, 0),
      event(2, 1, 4, 7),
    ]);
    const result = buildProgressionVoicingPracticeHandoffFromVault(
      [makeIdea({ id: "idea-pre-voicing-memory", progressionBlocks: [block] })],
      { ideaId: "idea-pre-voicing-memory", blockId: block.id },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handoff.initialSelection).toBe("basic-full");
    const snapshot = result.handoff.snapshots["basic-full"]!;
    expect(resolveProgressionPracticeVoicings(snapshot).events.every(
      (resolution) => resolution.status === "SUPPORTED",
    )).toBe(true);
  });

  it("uses saved Idea BPM/key only as the detached block fallback", () => {
    const block = progression([event(1, 1, 4, 0)]);
    block.bpm = undefined;
    block.detectedKey = undefined;
    const result = buildProgressionVoicingPracticeHandoffFromVault(
      [makeIdea({ id: "idea-fallback", bpm: 132, key: "E major", progressionBlocks: [block] })],
      { ideaId: "idea-fallback", blockId: block.id },
    );
    expect(result.ok && result.handoff.snapshots["basic-full"]).toMatchObject({
      bpm: 132,
      key: "E major",
    });

    const legacyKey = buildProgressionVoicingPracticeHandoffFromVault(
      [makeIdea({ id: "idea-legacy", bpm: 132, key: "E", progressionBlocks: [block] })],
      { ideaId: "idea-legacy", blockId: block.id },
    );
    expect(legacyKey.ok && legacyKey.handoff.snapshots["basic-full"]?.key).toBeUndefined();
  });

  it("carries E-major altered and slash spelling through the detached Vault handoff", () => {
    const dominant = event(1, 1, 2, 8);
    dominant.chord = { ...makeChordSymbol(8, "dom7", ["b13"]), label: "G#7(b13)" };
    const slash = event(1, 3, 2, 4);
    slash.chord = { ...makeChordSymbol(4, "maj", [], 8), label: "E/G#" };
    const block = progression([dominant, slash]);
    block.detectedKey = "E major";
    const idea = makeIdea({ id: "idea-e-major", progressionBlocks: [block] });

    const result = buildProgressionVoicingPracticeHandoffFromVault(
      [idea],
      { ideaId: idea.id, blockId: block.id },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handoff.snapshots["basic-full"]?.events.map(({ chord }) => chord.label))
      .toEqual(["G#7(b13)", "E/G#"]);
    expect(result.handoff.snapshots["basic-full"]?.events.map(({ chord }) => ({
      root: chord.root,
      bass: chord.bass,
      tensions: chord.tensions,
    }))).toEqual([
      { root: 8, bass: undefined, tensions: ["b13"] },
      { root: 4, bass: 8, tensions: [] },
    ]);
  });

  it("fails closed when the saved source is missing, deleted, or invalid", () => {
    const block = progression([event(1, 1, 4, 0)]);
    const idea = makeIdea({ id: "idea-1", progressionBlocks: [block] });
    expect(buildProgressionVoicingPracticeHandoffFromVault([], {
      ideaId: idea.id, blockId: block.id,
    })).toEqual({ ok: false, error: { code: "source-unavailable" } });
    expect(buildProgressionVoicingPracticeHandoffFromVault([idea], {
      ideaId: idea.id, blockId: "deleted-block",
    })).toEqual({ ok: false, error: { code: "source-unavailable" } });
    block.timeSignature = "3/4";
    expect(buildProgressionVoicingPracticeHandoffFromVault([idea], {
      ideaId: idea.id, blockId: block.id,
    })).toEqual({
      ok: false,
      error: { code: "invalid-source", cause: "unsupported-meter" },
    });

    const invalidBpmBlock = progression([event(1, 1, 4, 0)]);
    invalidBpmBlock.analyzerVersion = TEXT_PROGRESSION_ANALYZER_VERSION;
    invalidBpmBlock.bpm = 241;
    const invalidBpmIdea = makeIdea({
      id: "idea-invalid-bpm",
      progressionBlocks: [invalidBpmBlock],
    });
    expect(buildProgressionVoicingPracticeHandoffFromVault([invalidBpmIdea], {
      ideaId: invalidBpmIdea.id, blockId: invalidBpmBlock.id,
    })).toEqual({
      ok: false,
      error: { code: "invalid-source", cause: "invalid-bpm" },
    });
  });
});

function progression(chords: ChordTimelineItem[]): SavedProgressionBlock {
  return {
    id: "block-1",
    summaryText: "private summary",
    chords,
    detectedKey: "C major",
    bpm: 108,
    timeSignature: "4/4",
    tags: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
    analyzerVersion: "fixture",
  };
}

function event(
  bar: number,
  beat: number,
  durationBeats: number,
  root: number,
  voicingKind?: "source-midi" | "custom",
): ChordTimelineItem {
  const chord = makeChordSymbol(root, "maj7");
  const midiNotes = root === 0 ? [48, 55, 59] : [43, 50, 53];
  const snapshot: VoicingSnapshot = {
    schemaVersion: 1,
    source: voicingKind === "custom" ? "live-played" : "midi-extracted",
    representation: "simultaneous-voicing",
    midiNotes,
    bassNote: midiNotes[0],
    capturedForChordKey: normalizedChordKey(chord),
    confidence: 1,
    userVerified: true,
    extractorVersion: "fixture",
  };
  return {
    bar,
    beat,
    durationBeats,
    chord,
    confidence: 1,
    alternatives: [],
    warnings: [],
    ...(voicingKind === "source-midi"
      ? { voicingMemory: { sourceVoicing: snapshot } }
      : voicingKind === "custom"
        ? { voicingMemory: { practiceVoicingOverride: snapshot } }
        : {}),
  };
}
