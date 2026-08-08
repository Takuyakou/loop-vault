// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { PlaybackState } from "./audio/playbackController";
import { makeChordSymbol } from "./domain/chords";
import { buildVaultChordContextSnapshotFromVault } from "./features/bass-practice/domain/chordContextSnapshot";
import type { SavedProgressionBlock } from "./domain/types";import { clearTransientChordContextSnapshotForNavigation, CreateDialog, deleteIdeaForUndo, errorMessage, stopIdeaPlayback } from "./App";
import { makeIdea } from "./domain/testFactory";
import { appCopy } from "./i18n";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function playbackStub(state: PlaybackState) {
  return {
    getState: vi.fn(() => state),
    stop: vi.fn(),
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

describe("CreateDialog IME handling", () => {
  it("does not create on composing Enter or keyCode 229, then allows normal Enter", async () => {
    const onCreate = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(CreateDialog, {
      onCreate,
      onClose: vi.fn(),
      copy: appCopy.en,
      language: "en",
    })));
    const input = document.querySelector<HTMLInputElement>('input[placeholder="Title"]');
    const form = input?.closest("form");
    expect(input).not.toBeNull();
    expect(form).not.toBeNull();
    expect(document.querySelector<HTMLLabelElement>('label[for="create-idea-name"]')?.textContent)
      .toBe(appCopy.en.common.title);
    expect(document.querySelector<HTMLLabelElement>('label[for="create-idea-status"]')?.textContent)
      .toBe(appCopy.en.library.status);
    await changeInput(input!, "Composed title");

    await pressEnterAndSubmitIfAllowed(input!, form!, { isComposing: true });
    await pressEnterAndSubmitIfAllowed(input!, form!, { keyCode: 229 });
    expect(onCreate).not.toHaveBeenCalled();

    await pressEnterAndSubmitIfAllowed(input!, form!);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith("Composed title", "idea");
    await act(async () => root.unmount());
    container.remove();
  });
});

async function changeInput(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  });
}

async function pressEnterAndSubmitIfAllowed(
  input: HTMLInputElement,
  form: HTMLFormElement,
  options: { isComposing?: boolean; keyCode?: number } = {},
) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
    isComposing: options.isComposing,
  });
  if (options.keyCode !== undefined) {
    Object.defineProperty(event, "keyCode", { value: options.keyCode });
  }
  await act(async () => {
    if (input.dispatchEvent(event)) form.requestSubmit();
  });
}
