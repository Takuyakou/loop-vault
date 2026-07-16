// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { PlaybackState } from "./audio/playbackController";
import { deleteIdeaForUndo, stopIdeaPlayback } from "./App";
import { makeIdea } from "./domain/testFactory";

function playbackStub(state: PlaybackState) {
  return {
    getState: vi.fn(() => state),
    stop: vi.fn(),
  };
}

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
