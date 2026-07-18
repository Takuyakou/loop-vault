// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeChordSymbol } from "../domain/chords";
import type { SavedProgressionBlock } from "../domain/types";
import { ProgressionTagsEditor } from "./ProgressionTagsEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const block: SavedProgressionBlock = {
  id: "block-1",
  startBar: 1,
  lengthBars: 4,
  summaryText: "Cmaj7",
  chords: [{
    bar: 1,
    beat: 1,
    durationBeats: 4,
    chord: makeChordSymbol(0, "maj7"),
    confidence: 1,
    alternatives: [],
    warnings: [],
  }],
  detectedKey: "C",
  tags: [],
  capturedAt: "2026-07-18T00:00:00.000Z",
  analyzerVersion: "manual-v1",
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ProgressionTagsEditor", () => {
  it("adds manual tags and suppresses derived tags independently", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <ProgressionTagsEditor
          block={block}
          keySignature="C"
          language="en"
          onChange={onChange}
        />,
      );
    });

    const input = container.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(input, "use:chorus");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button[aria-label='Add tag']")?.click();
    });
    expect(onChange).toHaveBeenCalledWith({ tags: ["use:chorus"], suppressedAutoTags: [] });

    const hideMaj7 = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.getAttribute("aria-label") === "Hide Maj7 / 9");
    await act(async () => hideMaj7?.click());
    expect(onChange).toHaveBeenLastCalledWith({
      tags: [],
      suppressedAutoTags: [{ tagId: "feature.maj7-9", taxonomyVersion: 1 }],
    });
    await act(async () => root.unmount());
  });
});
