// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { PlaybackState } from "./audio/playbackController";
import { finalizeIdeaDelete, stopIdeaPlayback } from "./App";

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

  it("stops playback immediately before the deferred delete is finalized", () => {
    const calls: string[] = [];
    const controller = playbackStub({
      status: "playing",
      source: { kind: "detail", id: "idea:idea-1:block:block-1" },
    });
    controller.stop.mockImplementation(() => calls.push("stop"));
    const deleteIdea = vi.fn(() => calls.push("delete"));

    finalizeIdeaDelete("idea-1", deleteIdea, controller);

    expect(calls).toEqual(["stop", "delete"]);
    expect(deleteIdea).toHaveBeenCalledWith("idea-1");
  });
});
