// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseChordLabel } from "../domain/chords";
import {
  createDraftFromCandidate,
  createManualDraft,
} from "../domain/midi/manualDraft";
import { retargetDraftByAbsoluteBeats } from "../domain/midi/draftRangeEditing";
import type { ChordTimelineItem, ProgressionBlockCandidate } from "../domain/types";
import { layoutSongMiniMapCandidates, SongMiniMap, type SongMiniMapCopy } from "./SongMiniMap";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const englishCopy: SongMiniMapCopy = {
  title: "Whole song",
  description: "Candidate positions",
  empty: "No candidates",
  candidateLabel: (index, startBar, endBar) => `Candidate ${index}: bars ${startBar}-${endBar}`,
};

const editorProps = {
  beatsPerBar: 4,
  timeline: [],
  language: "en" as const,
  onDraftChange: vi.fn(),
  onManualRangeCreate: vi.fn(),
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
        {...editorProps}
        totalBars={8}
        candidates={candidates}
        activeCandidateId="b"
        copy={englishCopy}
        onCandidateSelect={vi.fn()}
      />,
    );
    const japanese = renderToStaticMarkup(
      <SongMiniMap
        {...editorProps}
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

    expect(english).toContain('aria-label="Candidate 2: bars 5-8. Capture range selection preset"');
    expect(english).toContain('data-song-minimap-candidate="b"');
    expect(english).toContain('aria-pressed="true"');
    expect(japanese).toContain('aria-label="候補 1: 1-4小節. Capture range selection preset"');
  });

  it("is safe for empty candidates and zero bars", () => {
    const markup = renderToStaticMarkup(
      <SongMiniMap
        {...editorProps}
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
    const candidates = Array.from({ length: 6 }, (_unused, index) => (
      candidate(`candidate-${index + 1}`, index * 4 + 1, index * 4 + 4)
    ));
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <SongMiniMap
          {...editorProps}
          totalBars={24}
          candidates={candidates}
          copy={englishCopy}
          onCandidateSelect={onCandidateSelect}
        />,
      );
    });

    const first = container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-candidate="candidate-1"]',
    );
    const sixth = container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-candidate="candidate-6"]',
    );
    await act(async () => first?.click());
    await act(async () => sixth?.click());
    expect(onCandidateSelect.mock.calls).toEqual([
      ["candidate-1"],
      ["candidate-6"],
    ]);
    await act(async () => root.unmount());
  });

  it("keeps overlapping candidates above the passive selection band", async () => {
    const selectionTimeline: ChordTimelineItem[] = Array.from(
      { length: 8 },
      (_unused, index) => ({
        eventId: `event-${index + 1}`,
        bar: index + 1,
        beat: 1,
        durationBeats: 4,
        chord: parseChordLabel(index % 2 === 0 ? "Cmaj7" : "G7")!,
        confidence: 0.9,
        alternatives: [],
        warnings: [],
      }),
    );
    const draft = createManualDraft({
      timeline: selectionTimeline,
      range: { startBar: 1, startBeat: 1, endBar: 4, endBeat: 4 },
      now: "2026-07-27T00:00:00.000Z",
    });
    const onCandidateSelect = vi.fn();
    const onCandidateDoubleClick = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <SongMiniMap
        {...editorProps}
        totalBars={8}
        timeline={selectionTimeline}
        candidates={[candidate("overlap", 1, 4)]}
        draft={draft}
        activeCandidateId="overlap"
        copy={englishCopy}
        onCandidateSelect={onCandidateSelect}
        onCandidateDoubleClick={onCandidateDoubleClick}
      />,
    ));

    const candidateButton = container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-candidate="overlap"]',
    )!;
    const selectionBand = container.querySelector<HTMLElement>("[data-selection-band]")!;
    expect(candidateButton.className).toContain("z-40");
    expect(candidateButton.style.top).toBe("2rem");
    expect(selectionBand.className).toContain("pointer-events-none");
    expect(selectionBand.className).toContain("top-1");
    expect(selectionBand.className).toContain("h-6");
    expect(selectionBand.className).not.toContain("inset-y");
    expect(container.querySelector("[data-selection-move-handle]")).not.toBeNull();
    await act(async () => candidateButton.click());
    expect(onCandidateSelect).toHaveBeenCalledWith("overlap");
    await act(async () => candidateButton.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, detail: 2 }),
    ));
    expect(onCandidateDoubleClick).toHaveBeenCalledWith("overlap");
    expect(candidateButton.title).toContain("Double-click");

    await act(async () => root.unmount());
  });

  it("renders the active candidate bar from the edited Draft range", async () => {
    const selectionTimeline: ChordTimelineItem[] = Array.from(
      { length: 8 },
      (_unused, index) => ({
        eventId: `range-event-${index + 1}`,
        bar: index + 1,
        beat: 1,
        durationBeats: 4,
        chord: parseChordLabel(index % 2 === 0 ? "Cmaj7" : "G7")!,
        confidence: 0.9,
        alternatives: [],
        warnings: [],
      }),
    );
    const sourceCandidate = {
      ...candidate("range-source", 1, 4),
      chords: selectionTimeline.slice(0, 4),
    };
    const sourceDraft = createDraftFromCandidate({
      candidate: sourceCandidate,
      timelineFingerprint: "timeline",
      now: "2026-07-27T00:00:00.000Z",
    });
    const editedDraft = retargetDraftByAbsoluteBeats(
      sourceDraft,
      selectionTimeline,
      4,
      32,
      8,
      { keepEdits: true },
    ).draft;
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <SongMiniMap
        {...editorProps}
        totalBars={8}
        timeline={selectionTimeline}
        candidates={[sourceCandidate]}
        draft={editedDraft}
        activeCandidateId={sourceCandidate.id}
        copy={englishCopy}
        onCandidateSelect={vi.fn()}
      />,
    ));

    const displayed = container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-candidate="range-source"]',
    )!;
    expect(displayed.style.left).toBe("12.5%");
    expect(displayed.style.width).toBe("87.5%");
    expect(displayed.getAttribute("aria-label")).toContain("bars 2-8");
    expect(sourceCandidate.startBar).toBe(1);
    expect(sourceCandidate.endBar).toBe(4);

    await act(async () => root.unmount());
  });
});
