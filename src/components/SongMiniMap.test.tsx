// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProgressionBlockCandidate } from "../domain/types";
import { layoutSongMiniMapCandidates, SongMiniMap, type SongMiniMapCopy } from "./SongMiniMap";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const englishCopy: SongMiniMapCopy = {
  title: "Whole song",
  description: "Candidate positions",
  empty: "No candidates",
  candidateLabel: (index, startBar, endBar) => `Candidate ${index}: bars ${startBar}-${endBar}`,
};

function candidate(id: string, startBar: number, endBar: number): ProgressionBlockCandidate {
  return {
    id,
    startBar,
    endBar,
    lengthBars: 4,
    chords: [],
    summaryText: id,
    confidence: 0.9,
    labels: [],
    warnings: [],
  };
}

describe("SongMiniMap", () => {
  it("positions inclusive bar ranges and separates overlaps into lanes", () => {
    const layout = layoutSongMiniMapCandidates([
      candidate("a", 1, 4),
      candidate("b", 3, 6),
      candidate("c", 5, 8),
    ], 8);

    expect(layout.map(({ candidate: item, lane, left, width }) => ({
      id: item.id,
      lane,
      left,
      width,
    }))).toEqual([
      { id: "a", lane: 0, left: 0, width: 50 },
      { id: "b", lane: 1, left: 25, width: 50 },
      { id: "c", lane: 0, left: 50, width: 50 },
    ]);
  });

  it("renders active state and localized accessible range labels", () => {
    const candidates = [candidate("a", 1, 4), candidate("b", 5, 8)];
    const english = renderToStaticMarkup(
      <SongMiniMap
        totalBars={8}
        candidates={candidates}
        activeCandidateId="b"
        copy={englishCopy}
        onCandidateSelect={vi.fn()}
      />,
    );
    const japanese = renderToStaticMarkup(
      <SongMiniMap
        totalBars={8}
        candidates={candidates}
        copy={{
          ...englishCopy,
          title: "全曲",
          candidateLabel: (index, startBar, endBar) => `候補 ${index}: ${startBar}-${endBar}小節`,
        }}
        onCandidateSelect={vi.fn()}
      />,
    );

    expect(english).toContain('aria-label="Candidate 2: bars 5-8"');
    expect(english).toContain('data-song-minimap-candidate="b"');
    expect(english).toContain('aria-pressed="true"');
    expect(japanese).toContain('aria-label="候補 1: 1-4小節"');
  });

  it("is safe for empty candidates and zero bars", () => {
    const markup = renderToStaticMarkup(
      <SongMiniMap
        totalBars={0}
        candidates={[candidate("a", 1, 4)]}
        copy={englishCopy}
        onCandidateSelect={vi.fn()}
      />,
    );

    expect(markup).toContain("No candidates");
    expect(markup).not.toContain("Infinity");
    expect(markup).not.toContain("NaN");
  });

  it("reports the clicked candidate", async () => {
    const onCandidateSelect = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <SongMiniMap
          totalBars={8}
          candidates={[candidate("a", 1, 4)]}
          copy={englishCopy}
          onCandidateSelect={onCandidateSelect}
        />,
      );
    });

    await act(async () => container.querySelector<HTMLButtonElement>("button")?.click());
    expect(onCandidateSelect).toHaveBeenCalledWith("a");
    await act(async () => root.unmount());
  });
});
