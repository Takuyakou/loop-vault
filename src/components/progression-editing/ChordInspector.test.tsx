// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { PlaybackAudioDriver } from "../../audio/playbackController";
import { createPlaybackController } from "../../audio/playbackController";
import type { EditableChordSlot } from "../../domain/progressionEditing";
import { ChordInspector } from "./ChordInspector";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("ChordInspector playback", () => {
  it("accepts degree input with key-aware autocomplete and applies it on Enter", async () => {
    const slot: EditableChordSlot = {
      id: "slot-fast-entry",
      position: { bar: 1, beat: 1, durationBeats: 4 },
      originalChord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
      currentChord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
      alternatives: [],
      warnings: [],
      edited: false,
    };
    const onApply = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ChordInspector
          slot={slot}
          language="ja"
          keySignature="C major"
          previousChord={{ root: 9, quality: "min7", tensions: [], label: "Am7" }}
          onPreview={vi.fn()}
          onApply={onApply}
          onReset={vi.fn()}
        />,
      );
    });

    const input = container.querySelector<HTMLInputElement>("#chord-label-slot-fast-entry");
    expect(input?.getAttribute("list")).toBe("chord-label-suggestions-slot-fast-entry");
    expect([...container.querySelectorAll<HTMLOptionElement>("datalist option")]
      .some((option) => option.label === "Gm7")).toBe(true);
    await act(async () => {
      if (!input) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")
        ?.set?.call(input, "V7");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      if (!input) return;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ label: "G7" }),
      "manual-label",
      undefined,
    );
    await act(async () => root.unmount());
  });

  it("keeps original, current, and draft controls synced with the shared controller", async () => {
    const driver: PlaybackAudioDriver = {
      playChord: vi.fn(async (_chord, _sound, callbacks) => callbacks.onStarted?.()),
      playTimeline: vi.fn(async () => undefined),
      stop: vi.fn(),
    };
    const controller = createPlaybackController(driver);
    const slot: EditableChordSlot = {
      id: "slot-1",
      position: { bar: 1, beat: 1, durationBeats: 4 },
      originalChord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
      currentChord: { root: 9, quality: "min7", tensions: [], label: "Am7" },
      alternatives: [],
      confidence: 0.9,
      warnings: [],
      edited: true,
      editSource: "manual-label",
    };
    const onPreview = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ChordInspector
          slot={slot}
          language="en"
          onPreview={onPreview}
          playbackSource={{ kind: "capture", id: "analysis:test:candidate:one" }}
          stopLabel="Stop"
          controller={controller}
          onApply={vi.fn()}
          onReset={vi.fn()}
        />,
      );
    });

    const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

    await act(async () => button("Preview original")?.click());
    expect(button("Stop")?.getAttribute("aria-pressed")).toBe("true");
    expect(controller.getState().source?.id).toBe("analysis:test:candidate:one:inspector:slot-1:original");
    expect(onPreview).not.toHaveBeenCalled();

    await act(async () => button("Preview current")?.click());
    expect(button("Preview original")?.getAttribute("aria-pressed")).toBe("false");
    expect(button("Stop")?.getAttribute("aria-pressed")).toBe("true");
    expect(controller.getState().source?.id).toBe("analysis:test:candidate:one:inspector:slot-1:current");

    await act(async () => button("Stop")?.click());
    expect(controller.getState().status).toBe("idle");
    expect(button("Preview current")?.getAttribute("aria-pressed")).toBe("false");

    await act(async () => button("Preview")?.click());
    expect(button("Stop")?.textContent).toContain("Stop");
    expect(controller.getState().source?.id).toBe("analysis:test:candidate:one:inspector:slot-1:draft");
    await act(async () => button("Stop")?.click());
    expect(controller.getState().status).toBe("idle");

    expect(driver.playChord).toHaveBeenCalledTimes(3);
    await act(async () => root.unmount());
  });

  it("offers the first alternative and expansion controls while collapsed", async () => {
    const alternative = { root: 7, quality: "dom7" as const, tensions: [], label: "G7" };
    const slot: EditableChordSlot = {
      id: "slot-collapsed",
      position: { bar: 2, beat: 1, durationBeats: 4 },
      originalChord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
      currentChord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
      alternatives: [{ chord: alternative, confidence: 0.72 }],
      warnings: [],
      edited: false,
    };
    const onApply = vi.fn();
    const onExpandedChange = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ChordInspector
          slot={slot}
          language="ja"
          expanded={false}
          onExpandedChange={onExpandedChange}
          onPreview={vi.fn()}
          onApply={onApply}
          onReset={vi.fn()}
        />,
      );
    });

    expect(container.querySelector("[data-collapsed-inspector]")?.textContent).toContain("G7");
    expect(container.querySelector("[data-expanded-inspector]")?.hasAttribute("hidden")).toBe(true);
    const apply = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "先頭候補を適用");
    await act(async () => apply?.click());
    expect(onApply).toHaveBeenCalledWith(alternative, "alternative", {
      source: "analyzer",
      candidateRank: 0,
      displayedCandidateCount: 1,
    });

    const expand = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "展開");
    expect(expand?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => expand?.click());
    expect(onExpandedChange).toHaveBeenCalledWith(true);

    await act(async () => root.unmount());
  });
});
