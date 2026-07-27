// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPlaybackController,
  type PlaybackAudioDriver,
} from "../audio/playbackController";
import type {
  ChordTimelineItem,
  MidiProgressionAnalysis,
  ProgressionBlockCandidate,
} from "../domain/types";
import { appCopy } from "../i18n";
import { CaptureView } from "./CaptureView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function item(id: string, label: string, bar: number): ChordTimelineItem {
  return {
    eventId: id,
    bar,
    beat: 1,
    durationBeats: 4,
    chord: { root: 0, quality: "maj7", tensions: [], label },
    confidence: 0.9,
    alternatives: [],
    warnings: [],
    voicingMemory: {
      sourceVoicing: {
        schemaVersion: 1,
        source: "midi-extracted",
        representation: "simultaneous-voicing",
        midiNotes: [48, 52, 55, 59],
        capturedForChordKey: "0:maj7:-:-",
      },
    },
  };
}

function candidate(id: string, startBar: number): ProgressionBlockCandidate {
  const chords = [
    item(`${id}-1`, "Cmaj7", startBar),
    item(`${id}-2`, "Am7", startBar + 1),
  ];
  return {
    id,
    startBar,
    endBar: startBar + 3,
    lengthBars: 4,
    chords,
    summaryText: "Cmaj7 - Am7",
    confidence: 0.9,
    labels: [],
    warnings: [],
  };
}

function result(): MidiProgressionAnalysis {
  const first = candidate("candidate-1", 1);
  const second = candidate("candidate-2", 5);
  return {
    totalBars: 8,
    bpm: 100,
    fullTimeline: [...first.chords, ...second.chords],
    blockCandidates: [first, second],
    analyzedAt: "2026-07-26T00:00:00.000Z",
    analyzerVersion: "test",
  };
}

async function mount(createIdeaFromDraft = vi.fn(() => "idea-1")) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const driver: PlaybackAudioDriver = {
    playChord: vi.fn(async (_chord, _sound, callbacks) => callbacks.onStarted?.()),
    playTimeline: vi.fn(async (_timeline, _bpm, _sound, callbacks) => callbacks.onStarted?.()),
    stop: vi.fn(),
  };
  const controller = createPlaybackController(driver);
  await act(async () => root.render(
    <CaptureView
      ideas={[]}
      analysis={{ status: "done", result: result() }}
      analyzeMidiBytes={vi.fn()}
      clearAnalysis={vi.fn()}
      createIdeaFromDraft={createIdeaFromDraft}
      appendBlockToIdea={vi.fn()}
      updateIdea={vi.fn()}
      setToast={vi.fn()}
      copy={appCopy.en}
      language="en"
      showRomanNumerals
      controller={controller}
    />,
  ));
  return { container, root, driver, createIdeaFromDraft };
}

async function openFirstDraftAndReplaceSecondWithNoChord(
  harness: Awaited<ReturnType<typeof mount>>,
) {
  const headers = harness.container.querySelectorAll<HTMLButtonElement>(
    "[data-candidate-toggle]",
  );
  await act(async () => headers[0]?.click());
  const cards = harness.container.querySelectorAll<HTMLElement>('[role="option"]');
  await act(async () => cards[1]?.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
  ));
  const noChord = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    .find((button) => button.textContent?.includes("Replace with N.C."))!;
  await act(async () => noChord.click());
}

describe("Capture Draft keyboard, A/B preview, and retention", () => {
  it("previews source and edited timelines, stops with Escape, and ignores text inputs", async () => {
    const harness = await mount();
    await openFirstDraftAndReplaceSecondWithNoChord(harness);

    expect(harness.container.querySelector(
      '[data-testid="capture-draft-session"]',
    )?.textContent).toContain("Unsaved");

    await act(async () => window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    ));
    const playTimeline = vi.mocked(harness.driver.playTimeline);
    expect(playTimeline).toHaveBeenCalledTimes(1);
    expect(playTimeline.mock.calls[0]?.[0].map((entry) => entry.chord.label))
      .toEqual(["Cmaj7", "Am7"]);

    await act(async () => window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", bubbles: true }),
    ));
    expect(playTimeline).toHaveBeenCalledTimes(2);
    expect(playTimeline.mock.calls[1]?.[0].map((entry) => entry.chord.label))
      .toEqual(["Cmaj7", "N.C."]);

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    await act(async () => input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    ));
    expect(playTimeline).toHaveBeenCalledTimes(2);

    input.blur();
    await act(async () => window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ));
    expect(harness.driver.stop).toHaveBeenCalled();

    await act(async () => harness.root.unmount());
  });

  it("offers back, discard, and save before switching to another candidate", async () => {
    const harness = await mount();
    await openFirstDraftAndReplaceSecondWithNoChord(harness);
    const headers = harness.container.querySelectorAll<HTMLButtonElement>(
      "[data-candidate-toggle]",
    );

    await act(async () => headers[1]?.click());
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Cancel");
    expect(dialog.textContent).toContain("Close");
    expect(dialog.textContent).toContain("Save to Vault and continue");

    const save = [...dialog.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Save to Vault and continue")!;
    await act(async () => save.click());

    expect(harness.createIdeaFromDraft).toHaveBeenCalledOnce();
    expect(headers[1]?.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => harness.root.unmount());
  });

  it("ends the Draft session after a successful direct Vault save", async () => {
    const harness = await mount();
    const firstHeader = harness.container.querySelector<HTMLButtonElement>(
      "[data-candidate-toggle]",
    )!;
    await act(async () => firstHeader.click());
    expect(harness.container.querySelector(
      '[data-testid="capture-draft-session"]',
    )).not.toBeNull();

    const openSave = [...harness.container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Save to Vault")!;
    await act(async () => openSave.click());
    const form = harness.container.querySelector<HTMLFormElement>('form[role="dialog"]')!;
    const save = [...form.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Save")!;
    await act(async () => save.click());

    expect(harness.createIdeaFromDraft).toHaveBeenCalledOnce();
    expect(harness.container.querySelector(
      '[data-testid="capture-draft-session"]',
    )).toBeNull();

    await act(async () => harness.root.unmount());
  });
});
