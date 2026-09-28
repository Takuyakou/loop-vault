// @vitest-environment jsdom

import { act, startTransition, Suspense } from "react";
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
import { appCopy } from "../i18n";
import { layoutSongMiniMapCandidates, SongMiniMap, type SongMiniMapCopy } from "./SongMiniMap";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const neverCommit = new Promise<void>(() => undefined);

function NeverCommit(): never {
  throw neverCommit;
}

const miniMapCopy: SongMiniMapCopy = {
  title: appCopy.ja.capture.songMiniMap,
  description: appCopy.ja.capture.songMiniMapDescription,
  empty: appCopy.ja.capture.songMiniMapEmpty,
  candidateLabel: appCopy.ja.capture.songMiniMapCandidate,
};

const editorProps = {
  beatsPerBar: 4,
  timeline: [],
  candidateDatasetKey: "analysis-1",
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

  it("renders active state and Japanese accessible range labels", () => {
    const candidates = [candidate("a", 1, 4), candidate("b", 5, 8)];
    const markup = renderToStaticMarkup(
      <SongMiniMap
        {...editorProps}
        totalBars={8}
        candidates={candidates}
        activeCandidateId="b"
        copy={miniMapCopy}
        onCandidateSelect={vi.fn()}
      />,
    );
    expect(markup).toContain('aria-label="候補 2: 5-8小節。採集範囲の選択プリセット"');
    expect(markup).toContain('data-song-minimap-candidate="b"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="候補 1: 1-4小節。採集範囲の選択プリセット"');
  });

  it("is safe for empty candidates and zero bars", () => {
    const markup = renderToStaticMarkup(
      <SongMiniMap
        {...editorProps}
        totalBars={0}
        candidates={[candidate("a", 1, 4)]}
        copy={miniMapCopy}
        onCandidateSelect={vi.fn()}
      />,
    );

    expect(markup).toContain(appCopy.ja.capture.songMiniMapEmpty);
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
          copy={miniMapCopy}
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
        copy={miniMapCopy}
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
    expect(candidateButton.title).toContain("ダブルクリック");

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
        copy={miniMapCopy}
        onCandidateSelect={vi.fn()}
      />,
    ));

    const displayed = container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-candidate="range-source"]',
    )!;
    expect(displayed.style.left).toBe("12.5%");
    expect(displayed.style.width).toBe("87.5%");
    expect(displayed.getAttribute("aria-label")).toContain("2-8小節");
    expect(sourceCandidate.startBar).toBe(1);
    expect(sourceCandidate.endBar).toBe(4);

    await act(async () => root.unmount());
  });

  it("renders one representative bar and preserves every grouped candidate in the selector", async () => {
    const onCandidateSelect = vi.fn();
    const candidates = [
      { ...candidate("nested-4", 37, 40), lengthBars: 4 as const, selectionScore: 0.82 },
      { ...candidate("nested-8", 37, 44), lengthBars: 8 as const, selectionScore: 0.91 },
      { ...candidate("nested-16", 37, 52), lengthBars: 16 as const, selectionScore: 0.88 },
    ];
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <SongMiniMap
        {...editorProps}
        totalBars={64}
        candidates={candidates}
        copy={miniMapCopy}
        onCandidateSelect={onCandidateSelect}
      />,
    ));

    const groupButton = container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-group="nested-16"]',
    )!;
    expect(container.querySelectorAll("[data-song-minimap-candidate]")).toHaveLength(1);
    expect(groupButton.dataset.songMinimapRepresentative).toBe("nested-16");
    expect(groupButton.dataset.songMinimapSelectedVariant).toBe("nested-8");
    expect(groupButton.getAttribute("aria-expanded")).toBe("false");

    groupButton.focus();
    groupButton.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(onCandidateSelect).not.toHaveBeenCalled();
    await act(async () => groupButton.click());
    expect(onCandidateSelect).not.toHaveBeenCalled();
    expect(groupButton.getAttribute("aria-expanded")).toBe("true");

    const variantButtons = [
      ...container.querySelectorAll<HTMLButtonElement>("[data-song-minimap-variant]"),
    ];
    expect(variantButtons.map(({ dataset }) => dataset.songMinimapVariant)).toEqual([
      "nested-16",
      "nested-8",
      "nested-4",
    ]);
    expect(new Set(variantButtons.map(({ dataset }) => dataset.songMinimapVariant)).size).toBe(3);
    expect(variantButtons.map(({ textContent }) => textContent)).toEqual([
      "16小節 · Bar 37–52",
      "8小節 · Bar 37–44",
      "4小節 · Bar 37–40",
    ]);
    expect(variantButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "候補グループ 1、バリアント 1。16小節、Bar 37–52",
      "候補グループ 1、バリアント 2。8小節、Bar 37–44",
      "候補グループ 1、バリアント 3。4小節、Bar 37–40",
    ]);
    expect(variantButtons[0]?.dataset.songMinimapVariantRepresentative).toBe("true");
    expect(variantButtons[1]?.dataset.songMinimapVariantSelected).toBe("true");

    await act(async () => variantButtons[1]?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 0 }),
    ));
    expect(onCandidateSelect).toHaveBeenCalledTimes(1);
    expect(onCandidateSelect).toHaveBeenCalledWith("nested-8");
    expect(container.querySelector("[data-song-minimap-variant-selector]")).toBeNull();

    await act(async () => root.unmount());
  });

  it("closes the variant selector with Escape without changing selection", async () => {
    const onCandidateSelect = vi.fn();
    const candidates = [
      { ...candidate("group-4", 9, 12), lengthBars: 4 as const },
      { ...candidate("group-8", 9, 16), lengthBars: 8 as const },
    ];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(
      <SongMiniMap
        {...editorProps}
        totalBars={24}
        candidates={candidates}
        copy={miniMapCopy}
        onCandidateSelect={onCandidateSelect}
      />,
    ));

    const groupButton = container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-group="group-8"]',
    )!;
    await act(async () => groupButton.click());
    const selector = container.querySelector<HTMLElement>(
      "[data-song-minimap-variant-selector]",
    )!;
    const firstVariant = selector.querySelector<HTMLButtonElement>(
      "[data-song-minimap-variant]",
    )!;
    firstVariant.focus();
    await act(async () => selector.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ));

    expect(onCandidateSelect).not.toHaveBeenCalled();
    expect(container.querySelector("[data-song-minimap-variant-selector]")).toBeNull();
    expect(document.activeElement).toBe(groupButton);

    await act(async () => root.unmount());
    container.remove();
  });

  it("uses the exact Japanese visible and accessible variant labels", async () => {
    const candidates = [
      { ...candidate("ja-4", 17, 20), lengthBars: 4 as const },
      { ...candidate("ja-8", 17, 24), lengthBars: 8 as const },
    ];
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <SongMiniMap
        {...editorProps}
        totalBars={32}
        candidates={candidates}
        copy={{
          ...miniMapCopy,
          title: "全曲",
          candidateLabel: (index, startBar, endBar) => `候補 ${index}: ${startBar}-${endBar}小節`,
        }}
        onCandidateSelect={vi.fn()}
      />,
    ));

    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-group="ja-8"]',
    )?.click());
    const variants = [
      ...container.querySelectorAll<HTMLButtonElement>("[data-song-minimap-variant]"),
    ];
    expect(variants.map(({ textContent }) => textContent)).toEqual([
      "8小節 · Bar 17–24",
      "4小節 · Bar 17–20",
    ]);
    expect(variants.map((button) => button.getAttribute("aria-label"))).toEqual([
      "候補グループ 1、バリアント 1。8小節、Bar 17–24",
      "候補グループ 1、バリアント 2。4小節、Bar 17–20",
    ]);

    await act(async () => root.unmount());
  });

  it("invalidates an open selector when the analysis dataset generation changes", async () => {
    const onCandidateSelect = vi.fn();
    const candidates = [
      { ...candidate("stable-4", 9, 12), lengthBars: 4 as const },
      { ...candidate("stable-8", 9, 16), lengthBars: 8 as const },
    ];
    const container = document.createElement("div");
    const root = createRoot(container);
    const renderDataset = async (candidateDatasetKey: string) => {
      await act(async () => root.render(
        <SongMiniMap
          {...editorProps}
          candidateDatasetKey={candidateDatasetKey}
          totalBars={24}
          candidates={candidates.map((entry) => ({ ...entry }))}
          copy={miniMapCopy}
          onCandidateSelect={onCandidateSelect}
        />,
      ));
    };

    await renderDataset("analysis-run-1");
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-group="stable-8"]',
    )?.click());
    expect(container.querySelector("[data-song-minimap-variant-selector]")).not.toBeNull();
    expect(onCandidateSelect).not.toHaveBeenCalled();

    await renderDataset("analysis-run-2");
    const replacementTrigger = container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-group="stable-8"]',
    )!;
    expect(container.querySelector("[data-song-minimap-variant-selector]")).toBeNull();
    expect(replacementTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(onCandidateSelect).not.toHaveBeenCalled();

    await renderDataset("analysis-run-1");
    expect(container.querySelector("[data-song-minimap-variant-selector]")).toBeNull();
    expect(onCandidateSelect).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });



  it("cancels a pending pointer activation when the dataset key changes", async () => {
    vi.useFakeTimers();
    const onCandidateSelect = vi.fn();
    const candidates = [
      { ...candidate("key-4", 9, 12), lengthBars: 4 as const },
      { ...candidate("key-8", 9, 16), lengthBars: 8 as const },
    ];
    const container = document.createElement("div");
    const root = createRoot(container);
    const renderDataset = async (candidateDatasetKey: string) => {
      await act(async () => root.render(
        <SongMiniMap
          {...editorProps}
          candidateDatasetKey={candidateDatasetKey}
          totalBars={24}
          candidates={candidates}
          copy={miniMapCopy}
          onCandidateSelect={onCandidateSelect}
        />,
      ));
    };
    try {
      await renderDataset("pending-run-1");
      await act(async () => container.querySelector<HTMLButtonElement>(
        '[data-song-minimap-group="key-8"]',
      )?.click());
      const variant = container.querySelector<HTMLButtonElement>(
        '[data-song-minimap-variant="key-8"]',
      )!;
      await act(async () => variant.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      ));

      await renderDataset("pending-run-2");
      await act(async () => vi.advanceTimersByTime(250));
      expect(onCandidateSelect).not.toHaveBeenCalled();
      expect(container.querySelector("[data-song-minimap-variant-selector]")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      vi.useRealTimers();
    }
  });



  it("keeps a pending activation valid across an uncommitted dataset render", async () => {
    vi.useFakeTimers();
    const onCandidateSelect = vi.fn();
    const candidates = [
      { ...candidate("commit-4", 9, 12), lengthBars: 4 as const },
      { ...candidate("commit-8", 9, 16), lengthBars: 8 as const },
    ];
    const container = document.createElement("div");
    const root = createRoot(container);
    const tree = (candidateDatasetKey: string, suspend: boolean) => (
      <Suspense fallback={<p>Pending analysis</p>}>
        <SongMiniMap
          {...editorProps}
          candidateDatasetKey={candidateDatasetKey}
          totalBars={24}
          candidates={candidates}
          copy={miniMapCopy}
          onCandidateSelect={onCandidateSelect}
        />
        {suspend ? <NeverCommit /> : null}
      </Suspense>
    );
    try {
      await act(async () => root.render(tree("committed-run", false)));
      await act(async () => container.querySelector<HTMLButtonElement>(
        '[data-song-minimap-group="commit-8"]',
      )?.click());
      const variant = container.querySelector<HTMLButtonElement>(
        '[data-song-minimap-variant="commit-8"]',
      )!;
      await act(async () => variant.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      ));

      await act(async () => {
        startTransition(() => root.render(tree("speculative-run", true)));
      });
      expect(container.querySelector("[data-song-minimap-variant-selector]")).not.toBeNull();
      await act(async () => vi.advanceTimersByTime(250));
      expect(onCandidateSelect).toHaveBeenCalledTimes(1);
      expect(onCandidateSelect).toHaveBeenCalledWith("commit-8");
    } finally {
      await act(async () => root.unmount());
      vi.useRealTimers();
    }
  });  it("cancels a pending pointer activation when the minimap unmounts", async () => {
    vi.useFakeTimers();
    const onCandidateSelect = vi.fn();
    const candidates = [
      { ...candidate("unmount-4", 9, 12), lengthBars: 4 as const },
      { ...candidate("unmount-8", 9, 16), lengthBars: 8 as const },
    ];
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(
        <SongMiniMap
          {...editorProps}
          totalBars={24}
          candidates={candidates}
          copy={miniMapCopy}
          onCandidateSelect={onCandidateSelect}
        />,
      ));
      await act(async () => container.querySelector<HTMLButtonElement>(
        '[data-song-minimap-group="unmount-8"]',
      )?.click());
      const variant = container.querySelector<HTMLButtonElement>(
        '[data-song-minimap-variant="unmount-8"]',
      )!;
      await act(async () => variant.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      ));

      await act(async () => root.unmount());
      await act(async () => vi.advanceTimersByTime(250));
      expect(onCandidateSelect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });  it("exposes an active grouped candidate semantically while the selector is closed", () => {
    const candidates = [
      { ...candidate("active-4", 9, 12), lengthBars: 4 as const },
      { ...candidate("active-8", 9, 16), lengthBars: 8 as const },
      { ...candidate("inactive", 21, 24), lengthBars: 4 as const },
    ];
    const markup = renderToStaticMarkup(
      <SongMiniMap
        {...editorProps}
        totalBars={24}
        candidates={candidates}
        activeCandidateId="active-4"
        copy={miniMapCopy}
        onCandidateSelect={vi.fn()}
      />,
    );

    expect(markup).toContain('data-song-minimap-group="active-8"');
    expect(markup).toMatch(/data-song-minimap-group="active-8"[^>]*aria-pressed="true"/);
    expect(markup).toMatch(/data-song-minimap-group="inactive"[^>]*aria-pressed="false"/);
    expect(markup).not.toContain("data-song-minimap-variant-selector");
  });

  it("opens with Enter, focuses the selected variant, and restores trigger focus", async () => {
    const onCandidateSelect = vi.fn();
    const candidates = [
      { ...candidate("keyboard-4", 17, 20), lengthBars: 4 as const, selectionScore: 0.8 },
      { ...candidate("keyboard-8", 17, 24), lengthBars: 8 as const, selectionScore: 0.95 },
    ];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(
      <SongMiniMap
        {...editorProps}
        totalBars={32}
        candidates={candidates}
        copy={miniMapCopy}
        onCandidateSelect={onCandidateSelect}
      />,
    ));

    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-group="keyboard-8"]',
    )!;
    trigger.focus();
    await act(async () => trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    ));
    const selectedVariant = container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-variant="keyboard-8"]',
    )!;
    expect(document.activeElement).toBe(selectedVariant);
    expect(onCandidateSelect).not.toHaveBeenCalled();

    await act(async () => selectedVariant.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    ));
    expect(container.querySelector("[data-song-minimap-variant-selector]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onCandidateSelect).not.toHaveBeenCalled();

    await act(async () => trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    ));
    const selectedAfterReopen = container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-variant="keyboard-8"]',
    )!;
    expect(document.activeElement).toBe(selectedAfterReopen);
    await act(async () => selectedAfterReopen.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    ));
    expect(onCandidateSelect).toHaveBeenCalledTimes(1);
    expect(onCandidateSelect).toHaveBeenCalledWith("keyboard-8");
    expect(container.querySelector("[data-song-minimap-variant-selector]")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await act(async () => root.unmount());
    container.remove();
  });

  it("distinguishes pointer single and double activation without dropping reveal semantics", async () => {
    vi.useFakeTimers();
    const onCandidateSelect = vi.fn();
    const candidateCard = document.createElement("button");
    candidateCard.textContent = "Candidate card";
    document.body.append(candidateCard);
    const onCandidateDoubleClick = vi.fn(() => candidateCard.focus());
    const candidates = [
      { ...candidate("pointer-4", 1, 4), lengthBars: 4 as const },
      { ...candidate("pointer-8", 1, 8), lengthBars: 8 as const },
    ];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(
        <SongMiniMap
          {...editorProps}
          totalBars={16}
          candidates={candidates}
          copy={miniMapCopy}
          onCandidateSelect={onCandidateSelect}
          onCandidateDoubleClick={onCandidateDoubleClick}
        />,
      ));
      const trigger = container.querySelector<HTMLButtonElement>(
        '[data-song-minimap-group="pointer-8"]',
      )!;

      await act(async () => trigger.click());
      const singleVariant = container.querySelector<HTMLButtonElement>(
        '[data-song-minimap-variant="pointer-8"]',
      )!;
      await act(async () => singleVariant.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      ));
      expect(onCandidateSelect).not.toHaveBeenCalled();
      expect(onCandidateDoubleClick).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTime(250));
      expect(onCandidateSelect).toHaveBeenCalledTimes(1);
      expect(onCandidateSelect).toHaveBeenCalledWith("pointer-8");
      expect(onCandidateDoubleClick).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(trigger);

      onCandidateSelect.mockClear();
      await act(async () => trigger.click());
      const doubleVariant = container.querySelector<HTMLButtonElement>(
        '[data-song-minimap-variant="pointer-8"]',
      )!;
      await act(async () => {
        doubleVariant.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
        );
        doubleVariant.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true, detail: 2 }),
        );
        doubleVariant.dispatchEvent(
          new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 }),
        );
      });
      expect(onCandidateSelect).not.toHaveBeenCalled();
      expect(onCandidateDoubleClick).toHaveBeenCalledTimes(1);
      expect(onCandidateDoubleClick).toHaveBeenCalledWith("pointer-8");
      await act(async () => vi.runAllTimers());
      expect(onCandidateSelect).not.toHaveBeenCalled();
      expect(onCandidateDoubleClick).toHaveBeenCalledTimes(1);
      expect(container.querySelector("[data-song-minimap-variant-selector]")).toBeNull();
      expect(document.activeElement).toBe(candidateCard);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      candidateCard.remove();
      vi.useRealTimers();
    }
  });

  it("shows a non-color active marker without changing the exact variant label", async () => {
    const candidates = [
      { ...candidate("marked-4", 1, 4), lengthBars: 4 as const },
      { ...candidate("marked-8", 1, 8), lengthBars: 8 as const },
    ];
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <SongMiniMap
        {...editorProps}
        totalBars={16}
        candidates={candidates}
        activeCandidateId="marked-8"
        copy={miniMapCopy}
        onCandidateSelect={vi.fn()}
      />,
    ));
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-group="marked-8"]',
    )?.click());
    const activeVariant = container.querySelector<HTMLButtonElement>(
      '[data-song-minimap-variant="marked-8"]',
    )!;
    expect(activeVariant.textContent).toBe("8小節 · Bar 1–8");
    expect(activeVariant.querySelector("svg")).not.toBeNull();
    expect(activeVariant.getAttribute("aria-pressed")).toBe("true");

    await act(async () => root.unmount());
  });
});

function activityEvent(
  bar: number,
  durationBeats: number,
): ChordTimelineItem {
  return {
    bar,
    beat: 1,
    durationBeats,
    chord: parseChordLabel("Cmaj7")!,
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  };
}

describe("SongMiniMap harmonic activity", () => {
  it("uses exact Japanese lane and segment names", () => {
    const timeline = [
      activityEvent(2, 1),
      activityEvent(3, 3),
      activityEvent(4, 4),
    ];
    const japanese = renderToStaticMarkup(
      <SongMiniMap
        {...editorProps}
        totalBars={4}
        timeline={timeline}
        candidates={[]}
        copy={miniMapCopy}
        onCandidateSelect={vi.fn()}
      />,
    );

    expect(japanese).toContain('aria-label="\u548c\u58f0\u6d3b\u52d5"');
    expect(japanese).toContain('aria-label="\u548c\u58f0\u6d3b\u52d5: Bar 1\u3001\u5f37\u5ea6 \u6d3b\u52d5\u306a\u3057"');
    expect(japanese).toContain('aria-label="\u548c\u58f0\u6d3b\u52d5: Bar 2\u3001\u5f37\u5ea6 \u4f4e"');
    expect(japanese).toContain('aria-label="\u548c\u58f0\u6d3b\u52d5: Bar 3\u3001\u5f37\u5ea6 \u4e2d"');
    expect(japanese).toContain('aria-label="\u548c\u58f0\u6d3b\u52d5: Bar 4\u3001\u5f37\u5ea6 \u9ad8"');
    expect(japanese).toContain('aria-label="\u548c\u58f0\u6d3b\u52d5\u306e\u51e1\u4f8b"');
    expect(japanese).toContain(">\u548c\u58f0\u6d3b\u52d5</span>");
    expect(japanese).toContain("\u2014</span><span>\u6d3b\u52d5\u306a\u3057</span>");
    expect(japanese).toContain("\u2582</span><span>\u4f4e</span>");
    expect(japanese).toContain("\u2585</span><span>\u4e2d</span>");
    expect(japanese).toContain("\u2588</span><span>\u9ad8</span>");
  });

  it("maps every legend strength to distinct segment geometry", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <SongMiniMap
        {...editorProps}
        totalBars={4}
        timeline={[
          activityEvent(2, 1),
          activityEvent(3, 3),
          activityEvent(4, 4),
        ]}
        candidates={[]}
        copy={miniMapCopy}
        onCandidateSelect={vi.fn()}
      />,
    ));

    const mappings = [
      { level: "inactive", height: "h-px", symbolAndTerm: "\u2014\u6d3b\u52d5\u306a\u3057" },
      { level: "low", height: "h-1", symbolAndTerm: "\u2582\u4f4e" },
      { level: "medium", height: "h-1.5", symbolAndTerm: "\u2585\u4e2d" },
      { level: "high", height: "h-full", symbolAndTerm: "\u2588\u9ad8" },
    ] as const;
    for (const mapping of mappings) {
      const segment = container.querySelector<HTMLElement>(
        `[data-harmonic-activity-level="${mapping.level}"]`,
      );
      const legendItem = container.querySelector<HTMLElement>(
        `[data-harmonic-activity-legend-level="${mapping.level}"]`,
      );
      expect(segment?.classList.contains("bottom-0")).toBe(true);
      expect(segment?.classList.contains(mapping.height)).toBe(true);
      expect(legendItem?.textContent).toBe(mapping.symbolAndTerm);
    }
    const geometry = mappings.map(({ level }) => (
      container.querySelector<HTMLElement>(
        `[data-harmonic-activity-level="${level}"]`,
      )?.className
    ));
    expect(new Set(geometry)).toHaveLength(4);
    expect(container.querySelector('[data-harmonic-activity-level="inactive"]')
      ?.classList.contains("border-dashed")).toBe(true);
    expect(container.querySelector("[data-harmonic-activity-lane]")
      ?.classList.contains("h-2")).toBe(true);

    await act(async () => root.unmount());
  });

  it("renders a passive finite 145-bar strip in a narrow container", async () => {
    const container = document.createElement("div");
    container.style.width = "320px";
    const root = createRoot(container);
    await act(async () => root.render(
      <SongMiniMap
        {...editorProps}
        totalBars={145}
        timeline={[activityEvent(1, 145 * 4)]}
        candidates={[candidate("narrow-candidate", 1, 4)]}
        copy={miniMapCopy}
        onCandidateSelect={vi.fn()}
      />,
    ));

    const lane = container.querySelector<HTMLElement>("[data-harmonic-activity-lane]");
    const segments = [
      ...container.querySelectorAll<HTMLElement>("[data-harmonic-activity-bar]"),
    ];
    expect(lane?.classList.contains("pointer-events-none")).toBe(true);
    expect(lane?.querySelectorAll("button")).toHaveLength(0);
    const legend = container.querySelector<HTMLElement>(
      "[data-harmonic-activity-legend]",
    );
    const legendLevels = [
      ...container.querySelectorAll<HTMLElement>(
        "[data-harmonic-activity-legend-level]",
      ),
    ];
    expect(legend?.textContent).toContain("和声活動");
    const candidateRange = container.querySelector<HTMLElement>(
      '[data-song-minimap-candidate="narrow-candidate"]',
    );
    const track = container.querySelector<HTMLElement>("[data-song-minimap-track]");
    expect(candidateRange?.classList.contains("z-40")).toBe(true);
    expect(track?.contains(lane ?? null)).toBe(true);
    expect(track?.contains(legend ?? null)).toBe(false);

    expect(legend?.querySelectorAll("button")).toHaveLength(0);
    expect(legendLevels.map((level) => level.textContent)).toEqual([
      "\u2014\u6d3b\u52d5\u306a\u3057",
      "\u2582\u4f4e",
      "\u2585\u4e2d",
      "\u2588\u9ad8",
    ]);

    expect(segments).toHaveLength(145);
    expect(segments.every((segment) => (
      !segment.style.left.includes("NaN")
      && !segment.style.left.includes("Infinity")
      && !segment.style.width.includes("NaN")
      && !segment.style.width.includes("Infinity")
    ))).toBe(true);

    await act(async () => root.unmount());
  });
});
