// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeChordSymbol } from "../domain/chords";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import { appCopy } from "../i18n";
import { ProgressionDetailView } from "./ProgressionDetailView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const block: SavedProgressionBlock = {
  id: "progression-context",
  summaryText: "This private title is not handed to Practice",
  sourceAssetId: "private-asset",
  sourceFileName: "private-source.mid",
  detectedKey: "C major",
  bpm: 104,
  timeSignature: "4/4",
  chords: [
    { bar: 1, beat: 1, durationBeats: 4, chord: makeChordSymbol(0, "maj7"), confidence: 1, alternatives: [], warnings: [] },
    { bar: 2, beat: 1, durationBeats: 4, chord: makeChordSymbol(7, "dom7", [], 11), confidence: 1, alternatives: [], warnings: [] },
  ],
  tags: [],
  capturedAt: "2026-01-01T00:00:00.000Z",
  analyzerVersion: "fixture",
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Progression Detail Chord Context handoff", () => {
  // P23-15 H2 (B): practice is no longer opened from this page (the Vault preview, Home, the finder and each
  // practice's 「Vault から選ぶ」 open it). The snapshot itself is checked in chordContextSnapshot.test.ts.
  it("the page has no practice buttons and no practice section select, even in the ⋯ menu", async () => {
    const idea = makeIdea({ id: "idea-context", progressionBlocks: [block] });
    const openPractice = vi.fn();
    const openVoicingPractice = vi.fn();
    const openChordDojo = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProgressionDetailView
          idea={idea}
          block={block}
          updateProgressionBlock={vi.fn(() => true)}
          duplicateProgressionBlock={vi.fn()}
          openProgression={vi.fn()}
          openIdea={vi.fn()}
          openVault={vi.fn()}
          requestDelete={vi.fn()}
          openPractice={openPractice}
          openVoicingPractice={openVoicingPractice}
          openChordDojo={openChordDojo}
          setToast={vi.fn()}
          copy={appCopy.ja}
        />,
      );
    });

    await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="そのほか"]')!.click());
    const names = [...container.querySelectorAll<HTMLButtonElement>("button")].map((button) => button.textContent?.trim());
    expect(names).not.toContain("Bass Practice");
    expect(names).not.toContain("Voicing Loop");
    expect(names).not.toContain("Chord Dojo");
    expect(container.querySelector("[data-testid='chord-context-section-select']")).toBeNull();
    expect(container.querySelector("[data-testid='voicing-loop-handoff']")).toBeNull();
    expect(container.querySelector("[data-testid='chord-context-handoff']")).toBeNull();
    expect(openPractice).not.toHaveBeenCalled();
    expect(openVoicingPractice).not.toHaveBeenCalled();
    expect(openChordDojo).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
