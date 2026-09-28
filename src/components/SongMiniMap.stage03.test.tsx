// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { ProgressionBlockCandidate } from "../domain/types";
import { SongMiniMap, type SongMiniMapCopy } from "./SongMiniMap";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const longCopy: SongMiniMapCopy = {
  title: "Whole song candidate timeline",
  description: "UnbrokenCandidateTimelineDescription".repeat(12),
  empty: "No candidates",
  candidateLabel: (index, startBar, endBar) => `Candidate ${index}: bars ${startBar}-${endBar}`,
};

function candidate(
  id: string,
  startBar: number,
  endBar: number,
  lengthBars: ProgressionBlockCandidate["lengthBars"],
): ProgressionBlockCandidate {
  return {
    id,
    startBar,
    endBar,
    lengthBars,
    chords: [],
    summaryText: id,
    confidence: 0.9,
    selectionScore: 0.9,
    labels: [],
    warnings: [],
  };
}

describe("SongMiniMap Stage03 hardening", () => {
  it("keeps nested, duplicate-length, and chain-trap candidates reachable at 145 bars", async () => {
    const candidates = [
      candidate("nested-16", 37, 52, 16),
      candidate("nested-8-a", 37, 44, 8),
      candidate("nested-8-b", 39, 46, 8),
      candidate("chain-a", 101, 108, 8),
      candidate("chain-b", 103, 110, 8),
      candidate("chain-c", 105, 112, 8),
    ];
    const container = document.createElement("div");
    container.style.width = "320px";
    container.style.zoom = "2";
    const root = createRoot(container);
    await act(async () => root.render(
      <SongMiniMap
        totalBars={145}
        beatsPerBar={4}
        timeline={[]}
        candidates={candidates}
        candidateDatasetKey="stage03-long"
        copy={longCopy}
        onCandidateSelect={vi.fn()}
        onDraftChange={vi.fn()}
        onManualRangeCreate={vi.fn()}
      />,
    ));

    const section = container.querySelector<HTMLElement>("[data-song-minimap]")!;
    expect(section.classList.contains("min-w-0")).toBe(true);
    expect(section.querySelector("p")?.classList.contains("break-words")).toBe(true);

    const triggers = [
      ...container.querySelectorAll<HTMLButtonElement>("[data-song-minimap-group]"),
    ];
    expect(triggers.every((trigger) => (
      trigger.classList.contains("transition-shadow")
      && !trigger.classList.contains("transition")
    ))).toBe(true);
    expect(triggers.map((trigger) => trigger.dataset.songMinimapGroup)).toEqual([
      "nested-16",
      "chain-a",
      "chain-c",
    ]);

    const reachable = new Set<string>();
    for (const trigger of triggers) {
      if (trigger.hasAttribute("aria-expanded")) {
        await act(async () => trigger.click());
        const selector = container.querySelector<HTMLElement>(
          "[data-song-minimap-variant-selector]",
        )!;
        expect(selector.classList.contains("min-w-0")).toBe(true);
        const variants = [
          ...selector.querySelectorAll<HTMLButtonElement>("[data-song-minimap-variant]"),
        ];
        variants.forEach((variant) => reachable.add(variant.dataset.songMinimapVariant!));
        expect(variants.every((variant) => (
          variant.classList.contains("min-w-0")
          && variant.querySelector("span")?.classList.contains("break-words")
        ))).toBe(true);
        await act(async () => trigger.click());
      } else {
        reachable.add(trigger.dataset.songMinimapRepresentative!);
      }
    }

    expect([...reachable].sort()).toEqual(candidates.map(({ id }) => id).sort());
    expect(reachable.size).toBe(candidates.length);

    await act(async () => root.unmount());
  });
});
