// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { parseChordLabel } from "../domain/chords";
import { buildOccurrences, groupIntoPatterns } from "../domain/midi/occurrence";
import type { CandidateOccurrence } from "../domain/midi/occurrence";
import type { Section } from "../domain/midi/sections";
import type { ChordTimelineItem } from "../domain/types";
import { OccurrenceList, type OccurrenceListText } from "./OccurrenceList";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const text: OccurrenceListText = {
  occurrenceCount: (count) => `出現: ${count}箇所`,
  bars: (startBar, endBar) => `${startBar}-${endBar}小節`,
  section: (id) => id,
  transposed: (semitones) => `+${semitones}`,
  selected: "選択中",
  preview: "試聴",
  save: "保存",
  showAll: "さらに表示",
  onlyOccurrence: "この進行はここだけです",
};

function timeline(labels: readonly string[]): ChordTimelineItem[] {
  return labels.map((label, index) => ({
    bar: index + 1,
    beat: 1,
    durationBeats: 4,
    chord: parseChordLabel(label)!,
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  }));
}

function repeated(pattern: readonly string[], times: number): string[] {
  return Array.from({ length: times }, () => [...pattern]).flat();
}

/** Three appearances of one progression. */
function threeOccurrencePattern() {
  const items = timeline(repeated(["C", "Am", "F", "G"], 3));
  const occurrences = buildOccurrences(items, 12, { lengths: [4] })
    .map((occurrence) => ({ ...occurrence, score: 0.7 }));
  const patterns = groupIntoPatterns(occurrences);
  return patterns.find((candidate) => candidate.occurrences.length >= 3)!;
}

function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return { container, root, node };
}

describe("occurrence list", () => {
  it("reports how many places the progression appears", async () => {
    const pattern = threeOccurrencePattern();
    const { container, root } = render(null);
    await act(async () => root.render(
      <OccurrenceList
        pattern={pattern}
        selectedOccurrenceId={pattern.occurrences[0].id}
        text={text}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onPreview={vi.fn()}
        onSave={vi.fn()}
      />,
    ));
    expect(container.textContent).toContain("出現: 3箇所");
    await act(async () => root.unmount());
  });

  it("lists every occurrence with its bar position", async () => {
    const pattern = threeOccurrencePattern();
    const { container, root } = render(null);
    await act(async () => root.render(
      <OccurrenceList
        pattern={pattern}
        selectedOccurrenceId={pattern.occurrences[0].id}
        text={text}
        expanded
        onToggleExpanded={vi.fn()}
        onPreview={vi.fn()}
        onSave={vi.fn()}
      />,
    ));
    const items = container.querySelectorAll("[data-occurrence-id]");
    expect(items).toHaveLength(3);
    expect(container.textContent).toContain("1-4小節");
    expect(container.textContent).toContain("5-8小節");
    expect(container.textContent).toContain("9-12小節");
    await act(async () => root.unmount());
  });

  it("previews the occurrence that was clicked, not the representative", async () => {
    const pattern = threeOccurrencePattern();
    const onPreview = vi.fn();
    const { container, root } = render(null);
    await act(async () => root.render(
      <OccurrenceList
        pattern={pattern}
        selectedOccurrenceId={pattern.occurrences[0].id}
        text={text}
        expanded
        onToggleExpanded={vi.fn()}
        onPreview={onPreview}
        onSave={vi.fn()}
      />,
    ));
    const third = pattern.occurrences[2];
    const button = container.querySelector<HTMLButtonElement>(
      `[data-occurrence-preview="${third.id}"]`,
    );
    await act(async () => button!.click());
    expect((onPreview.mock.calls[0][0] as CandidateOccurrence).startBar).toBe(third.startBar);
    await act(async () => root.unmount());
  });

  it("saves the occurrence that was clicked", async () => {
    const pattern = threeOccurrencePattern();
    const onSave = vi.fn();
    const { container, root } = render(null);
    await act(async () => root.render(
      <OccurrenceList
        pattern={pattern}
        selectedOccurrenceId={pattern.occurrences[0].id}
        text={text}
        expanded
        onToggleExpanded={vi.fn()}
        onPreview={vi.fn()}
        onSave={onSave}
      />,
    ));
    const second = pattern.occurrences[1];
    const button = container.querySelector<HTMLButtonElement>(
      `[data-occurrence-save="${second.id}"]`,
    );
    await act(async () => button!.click());
    expect((onSave.mock.calls[0][0] as CandidateOccurrence).startBar).toBe(second.startBar);
    await act(async () => root.unmount());
  });

  it("marks the selected occurrence with text, not colour alone", async () => {
    const pattern = threeOccurrencePattern();
    const selected = pattern.occurrences[1];
    const { container, root } = render(null);
    await act(async () => root.render(
      <OccurrenceList
        pattern={pattern}
        selectedOccurrenceId={selected.id}
        text={text}
        expanded
        onToggleExpanded={vi.fn()}
        onPreview={vi.fn()}
        onSave={vi.fn()}
      />,
    ));
    const item = container.querySelector(`[data-occurrence-id="${selected.id}"]`);
    expect(item?.getAttribute("data-occurrence-selected")).toBe("true");
    expect(item?.textContent).toContain("選択中");
    await act(async () => root.unmount());
  });

  it("shows the section number an occurrence falls in", async () => {
    const pattern = threeOccurrencePattern();
    const sections: Section[] = [
      {
        id: "Section 2", startBar: 5, endBar: 8, confidence: 1, reasons: [],
        activitySummary: {
          noteCount: 0, averagePolyphony: 0, averageDuration: 0,
          bassNotes: 0, percussionNotes: 0, distinctPitchClasses: 0,
        },
        chromaSummary: { distribution: Array(12).fill(0), dominantPitchClass: 0 },
      },
    ];
    const { container, root } = render(null);
    await act(async () => root.render(
      <OccurrenceList
        pattern={pattern}
        selectedOccurrenceId={pattern.occurrences[0].id}
        sections={sections}
        text={text}
        expanded
        onToggleExpanded={vi.fn()}
        onPreview={vi.fn()}
        onSave={vi.fn()}
      />,
    ));
    expect(container.textContent).toContain("Section 2");
    await act(async () => root.unmount());
  });

  it("labels each button so a screen reader knows which occurrence it acts on", async () => {
    const pattern = threeOccurrencePattern();
    const { container, root } = render(null);
    await act(async () => root.render(
      <OccurrenceList
        pattern={pattern}
        selectedOccurrenceId={pattern.occurrences[0].id}
        text={text}
        expanded
        onToggleExpanded={vi.fn()}
        onPreview={vi.fn()}
        onSave={vi.fn()}
      />,
    ));
    const buttons = [...container.querySelectorAll("[data-occurrence-preview]")];
    const labels = buttons.map((button) => button.getAttribute("aria-label"));
    expect(labels).toContain("試聴 5-8小節");
    expect(new Set(labels).size).toBe(labels.length);
    await act(async () => root.unmount());
  });

  it("is reachable by keyboard", async () => {
    const pattern = threeOccurrencePattern();
    const { container, root } = render(null);
    await act(async () => root.render(
      <OccurrenceList
        pattern={pattern}
        selectedOccurrenceId={pattern.occurrences[0].id}
        text={text}
        expanded
        onToggleExpanded={vi.fn()}
        onPreview={vi.fn()}
        onSave={vi.fn()}
      />,
    ));
    // Native buttons, so tab order and Enter/Space come for free.
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button.tagName).toBe("BUTTON");
    await act(async () => root.unmount());
  });

  it("says so plainly when a progression appears only once", async () => {
    const items = timeline(["C", "Am", "F", "G"]);
    const occurrences = buildOccurrences(items, 4, { lengths: [4] })
      .map((occurrence) => ({ ...occurrence, score: 0.7 }));
    const pattern = groupIntoPatterns(occurrences)[0];
    const { container, root } = render(null);
    await act(async () => root.render(
      <OccurrenceList
        pattern={pattern}
        selectedOccurrenceId={pattern.occurrences[0].id}
        text={text}
        expanded
        onToggleExpanded={vi.fn()}
        onPreview={vi.fn()}
        onSave={vi.fn()}
      />,
    ));
    expect(container.textContent).toContain("この進行はここだけです");
    expect(container.querySelectorAll("[data-occurrence-id]")).toHaveLength(0);
    await act(async () => root.unmount());
  });

  it("handles a missing pattern without breaking the card", async () => {
    const { container, root } = render(null);
    await act(async () => root.render(
      <OccurrenceList
        pattern={undefined}
        selectedOccurrenceId="none"
        text={text}
        expanded
        onToggleExpanded={vi.fn()}
        onPreview={vi.fn()}
        onSave={vi.fn()}
      />,
    ));
    expect(container.textContent).toContain("この進行はここだけです");
    await act(async () => root.unmount());
  });
});
