// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { PlaybackState } from "./audio/playbackController";
import { makeChordSymbol } from "./domain/chords";
import { buildVaultChordContextSnapshotFromVault } from "./features/bass-practice/domain/chordContextSnapshot";
import type { SavedProgressionBlock } from "./domain/types";
import {
  clearTransientChordContextSnapshotForNavigation,
  closeLiveMidiModeSafely,
  deleteIdeaForUndo,
  errorMessage,
  findSavedTextProgressionTarget,
  stopIdeaPlayback,
} from "./App";
import { makeIdea } from "./domain/testFactory";
import { appCopy } from "./i18n";
import { LiveMidiOpenGate } from "./liveMidi/activationLease";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function playbackStub(state: PlaybackState) {
  return {
    getState: vi.fn(() => state),
    stop: vi.fn(),
  };
}

function savedProgressionBlock(id: string): SavedProgressionBlock {
  return {
    id,
    summaryText: "Cmaj7",
    detectedKey: "C major",
    bpm: 108,
    timeSignature: "4/4",
    chords: [{
      bar: 1,
      beat: 1,
      durationBeats: 4,
      chord: makeChordSymbol(0, "maj7"),
      confidence: 1,
      alternatives: [],
      warnings: [],
    }],
    tags: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
    analyzerVersion: "fixture",
  };
}

describe("Chord Context navigation", () => {
  it("clears a transient snapshot on route leave and normal Practice re-entry after its source was deleted", () => {
    const sourceReference = { ideaId: "idea-1", blockId: "progression-1" };
    const sourceBlock: SavedProgressionBlock = {
      id: sourceReference.blockId,
      summaryText: "C major practice progression",
      detectedKey: "C major",
      bpm: 108,
      timeSignature: "4/4",
      chords: [{
        bar: 1,
        beat: 1,
        durationBeats: 4,
        chord: makeChordSymbol(0, "maj7"),
        confidence: 1,
        alternatives: [],
        warnings: [],
      }],
      tags: [],
      capturedAt: "2026-01-01T00:00:00.000Z",
      analyzerVersion: "fixture",
    };
    const created = buildVaultChordContextSnapshotFromVault(
      [makeIdea({ id: sourceReference.ideaId, progressionBlocks: [sourceBlock] })],
      sourceReference,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("Expected source handoff snapshot.");

    const afterRouteLeave = clearTransientChordContextSnapshotForNavigation(
      created.snapshot,
      "practice",
      "library",
    );
    const deletedSource = buildVaultChordContextSnapshotFromVault([], sourceReference);
    expect(deletedSource).toMatchObject({ ok: false, error: { code: "source-unavailable" } });
    // The source no longer exists, so no fresh handoff can occur. A generic
    // Practice navigation must not revive the detached historical snapshot.
    const afterGenericPracticeEntry = clearTransientChordContextSnapshotForNavigation(
      afterRouteLeave,
      "library",
      "practice",
    );

    expect(afterRouteLeave).toBeUndefined();
    expect(afterGenericPracticeEntry).toBeUndefined();
  });
});

describe("errorMessage", () => {
  it("preserves string errors returned by Tauri commands", () => {
    expect(errorMessage("Command plugin:window|set_min_size not allowed by ACL", "fallback"))
      .toBe("Command plugin:window|set_min_size not allowed by ACL");
  });

  it("falls back for non-message values", () => {
    expect(errorMessage({ code: "UNKNOWN" }, "fallback")).toBe("fallback");
  });
});

describe("saved Text Progression target", () => {
  it("returns only the exact newly saved block and never substitutes an older block", () => {
    const older = savedProgressionBlock("older-block");
    const saved = savedProgressionBlock("saved-block");
    const idea = makeIdea({ id: "text-idea", progressionBlocks: [older, saved] });
    expect(findSavedTextProgressionTarget([idea], idea.id, new Set([older.id])))
      .toEqual({ ideaId: idea.id, blockId: saved.id });
    expect(findSavedTextProgressionTarget([idea], idea.id, new Set([older.id, saved.id])))
      .toBeUndefined();
    expect(findSavedTextProgressionTarget([], idea.id)).toBeUndefined();
  });
});

describe("closeLiveMidiModeSafely", () => {
  it("consumes a rejecting window close while releasing the lease and hiding the preview", async () => {
    const releaseLease = vi.fn();
    const preserveHistory = vi.fn();
    const rawFailure = new Error("private adapter failure");
    let previewVisible = true;
    let feedback: string | undefined;

    await expect(closeLiveMidiModeSafely({
      gate: new LiveMidiOpenGate(),
      getHistory: () => [{
        id: "history-1",
        chord: makeChordSymbol(0, "maj7"),
        label: "Cmaj7",
        notes: [60, 64, 67, 71],
        startedAtMs: 1,
        committedAtMs: 2,
      }],
      releaseLease,
      closeWindow: async () => { throw rawFailure; },
      saveBounds: vi.fn(),
      hidePreview: () => { previewVisible = false; },
      preserveHistory,
      reportFailure: () => { feedback = appCopy.en.liveMidi.miniModeCloseFailed; },
    })).resolves.toBeUndefined();

    expect(releaseLease).toHaveBeenCalledOnce();
    expect(previewVisible).toBe(false);
    expect(preserveHistory).toHaveBeenCalledOnce();
    expect(feedback).toBe("Could not close Mini Mode. The main window returned safely.");
    expect(feedback).not.toContain(rawFailure.message);
  });
});

describe("stopIdeaPlayback", () => {
  it("stops playback belonging to the idea being deleted", () => {
    const controller = playbackStub({
      status: "playing",
      source: { kind: "detail", id: "idea:idea-1:block:block-1" },
    });

    stopIdeaPlayback("idea-1", controller);

    expect(controller.stop).toHaveBeenCalledOnce();
  });

  it("does not stop playback belonging to another idea", () => {
    const controller = playbackStub({
      status: "playing",
      source: { kind: "detail", id: "idea:idea-2:block:block-1" },
    });

    stopIdeaPlayback("idea-1", controller);

    expect(controller.stop).not.toHaveBeenCalled();
  });

  it("hides through a pending payload, stops playback, and deletes only on commit", () => {
    const idea = makeIdea({ id: "idea-1", title: "Night Drive" });
    const calls: string[] = [];
    const controller = playbackStub({
      status: "playing",
      source: { kind: "detail", id: "idea:idea-1:block:block-1" },
    });
    controller.stop.mockImplementation(() => calls.push("stop"));
    const deleteIdea = vi.fn(() => {
      calls.push("delete");
      return true;
    });
    const enqueueUndo = vi.fn((request: { undo(): boolean | void; commit?(): boolean | void }) => {
      void request;
      return "undo-1";
    });

    expect(deleteIdeaForUndo({
      idea,
      ideas: [makeIdea({ id: "idea-0" }), idea, makeIdea({ id: "idea-2" })],
      vaultEpoch: 4,
      label: "Deleted Night Drive",
      deleteIdea,
      enqueueUndo,
      controller,
    })).toBe(true);

    expect(calls).toEqual(["stop"]);
    expect(enqueueUndo).toHaveBeenCalledWith(expect.objectContaining({
      label: "Deleted Night Drive",
      payload: expect.objectContaining({
        kind: "idea",
        vaultEpoch: 4,
        snapshot: expect.objectContaining({
          parentId: "vault",
          index: 1,
          value: idea,
          targetAnchor: idea.id,
        }),
      }),
    }));
    const request = enqueueUndo.mock.calls[0]?.[0];
    expect(request?.undo()).toBe(true);
    expect(deleteIdea).not.toHaveBeenCalled();
    expect(request?.commit?.()).toBe(true);
    expect(deleteIdea).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "idea", vaultEpoch: 4 }),
    );
  });

});
