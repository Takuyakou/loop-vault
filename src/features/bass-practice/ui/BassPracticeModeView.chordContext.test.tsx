// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { makeChordSymbol } from "../../../domain/chords";
import type { SavedProgressionBlock } from "../../../domain/types";
import { buildVaultChordContextSnapshot } from "../domain";
import { BassPracticeModeView } from "./BassPracticeModeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

describe("Bass Practice Vault Chord Context handoff", () => {
  it("opens Bassline Echo with the detached Vault snapshot while generated mode remains opt-in", async () => {
    const block = {
      id: "block-context",
      summaryText: "Private source title",
      detectedKey: "C major",
      bpm: 100,
      timeSignature: "4/4",
      chords: [
        { bar: 1, beat: 1, durationBeats: 4, chord: makeChordSymbol(0, "maj7"), confidence: 1, alternatives: [], warnings: [] },
      ],
      tags: [],
      capturedAt: "2026-01-01T00:00:00.000Z",
      analyzerVersion: "fixture",
    } as SavedProgressionBlock;
    const result = buildVaultChordContextSnapshot({
      sourceReference: { ideaId: "idea-context", blockId: block.id },
      block,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected Chord Context snapshot.");

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<BassPracticeModeView chordContextSnapshot={result.snapshot} />));

    expect(container.querySelector("[data-testid='bassline-echo-view']")).not.toBeNull();
    // P23-63: the progression/key/level/BPM moved into the stage's 条件 chip in the top band.
    expect(container.querySelector("[data-testid='bassline-conditions']")?.textContent)
      .toContain("Vault進行 · C major · bars 1-1");
    // P23-62: the screen name is Japanese now.
    expect(container.querySelector(".bass-mode-name")?.textContent)
      .toBe("コード進行のベース");
    // P23-25 P7: a practice asked for by a progression skips the picking home.
    expect(container.querySelector("[data-testid='bass-practice-home']")?.closest("[hidden]")).not.toBeNull();
    await act(async () => root.unmount());
  });
});
