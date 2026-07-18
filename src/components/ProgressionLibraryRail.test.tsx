// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProgressionIndexEntry } from "../domain/progressionClassification/mod";
import { ProgressionLibraryRail } from "./ProgressionLibraryRail";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ProgressionLibraryRail", () => {
  it("shows category counts and supports independent multiple selection", async () => {
    const entries = [
      entry("one", ["feature.slash-bass", "use.loop"]),
      entry("two", ["feature.slash-bass", "use.turnaround"]),
      entry("three", ["feature.maj7-9", "use.loop"]),
    ];
    const onToggleTag = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProgressionLibraryRail
          entries={entries}
          selectedTagIds={["feature.slash-bass", "use.loop"]}
          scope="all"
          language="en"
          onToggleTag={onToggleTag}
          onScopeChange={vi.fn()}
        />,
      );
    });

    const slashBass = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Slash Bass"));
    const loop = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Loop"));
    expect(slashBass?.textContent).toContain("2");
    expect(slashBass?.getAttribute("aria-pressed")).toBe("true");
    expect(loop?.textContent).toContain("2");
    expect(loop?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => slashBass?.click());
    expect(onToggleTag).toHaveBeenCalledWith("feature.slash-bass");
    await act(async () => root.unmount());
  });
});

function entry(id: string, effectiveTags: string[]): ProgressionIndexEntry {
  return {
    id,
    ideaId: "idea",
    blockId: id,
    block: {
      id,
      summaryText: id,
      chords: [],
      tags: [],
      capturedAt: "2026-07-18T00:00:00.000Z",
      analyzerVersion: "test",
    },
    normalizedChordText: "",
    romanNumeralText: "",
    normalizedSearchText: id,
    manualTags: [],
    derivedTags: [],
    effectiveTags,
    favorite: false,
    createdAt: "2026-07-18T00:00:00.000Z",
  };
}
