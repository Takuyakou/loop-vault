// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../audio/playbackController";
import type { PlaybackController } from "../audio/playbackController";
import { progressionFingerprint } from "../domain/practice";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import { appCopy, progressionDetailCopy, progressionEditorCopy } from "../i18n";
import { ProgressionDetailView } from "./ProgressionDetailView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const block: SavedProgressionBlock = {
  id: "block-1",
  summaryText: "Cmaj7 turnaround",
  chords: [{
    bar: 1,
    beat: 1,
    durationBeats: 4,
    chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
    confidence: 0.82,
    alternatives: [{
      chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
      confidence: 0.74,
    }],
    warnings: [],
  }],
  detectedKey: "C major",
  bpm: 92,
  lengthBars: 4,
  sourceFileName: "turnaround.mid",
  tags: ["turnaround"],
  capturedAt: "2026-07-18T00:00:00.000Z",
  analyzerVersion: "test",
};

afterEach(() => {
  playbackController.stop();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/**
 * Same rule the badge uses to decide "today".
 *
 * The practice state flips from `provisional` to `confirmation-due` the day
 * after a level is cleared, so a hard-coded clear date only passes on the day
 * the fixture was written. These dates are derived instead.
 */
function localDateString(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function practicedBlock(clearedOnLocalDate: string): SavedProgressionBlock {
  return {
    ...block,
    practice: {
      schemaVersion: 1,
      progressionFingerprint: progressionFingerprint(block),
      confirmedLevel: 3,
      provisional: {
        level: 4,
        clearedAt: `${clearedOnLocalDate}T00:00:00.000Z`,
        clearedOnLocalDate,
        targetTempo: 70,
        confirmationPitchClasses: [5, 7],
      },
      transposition: {
        schemaVersion: 1,
        clearedKeyPitchClasses: [2, 4, 5, 7, 9, 11],
        updatedAt: `${clearedOnLocalDate}T00:00:00.000Z`,
      },
    },
  };
}

describe("ProgressionDetailView", () => {
  it("shows transposition coverage and provisional state in progression details", async () => {
    const practiced = practicedBlock(localDateString(new Date()));
    const idea = makeIdea({
      id: "idea-practice-progress",
      progressionBlocks: [practiced],
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = (
      currentIdea: typeof idea,
      currentBlock: SavedProgressionBlock,
    ) => (
      <ProgressionDetailView
        idea={currentIdea}
        block={currentBlock}
        updateProgressionBlock={vi.fn(() => true)}
        duplicateProgressionBlock={vi.fn()}
        openProgression={vi.fn()}
        openIdea={vi.fn()}
        openVault={vi.fn()}
        requestDelete={vi.fn()}
        setToast={vi.fn()}
        copy={appCopy.ja}
        language="ja"
      />
    );

    // Cleared today: still provisional.
    await act(async () => root.render(render(idea, practiced)));
    expect(container.textContent).toContain("仮クリア");
    expect(container.textContent).toContain("L4 キー 6/6");

    // Cleared on an earlier day: the badge asks for confirmation on another day.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dueForConfirmation = practicedBlock(localDateString(yesterday));
    await act(async () => root.render(render({
      ...idea,
      progressionBlocks: [dueForConfirmation],
    }, dueForConfirmation)));
    expect(container.textContent).toContain("別日確認");
    expect(container.textContent).toContain("L4 キー 6/6");

    const stale = {
      ...practiced,
      practice: {
        ...practiced.practice!,
        progressionFingerprint: "practice-v1-stale",
      },
    };
    await act(async () => root.render(render({
      ...idea,
      progressionBlocks: [stale],
    }, stale)));
    const staleBadge = container.querySelector<HTMLElement>(
      '[data-practice-state="stale"]',
    );
    expect(staleBadge?.textContent).toContain("進行更新・要確認");
    expect(staleBadge?.textContent).not.toContain("6/6");
    await act(async () => root.unmount());
  });

  it("keeps the progression, playback metadata, parent Idea, and saved/editing labels in the first view", async () => {
    const idea = makeIdea({ id: "idea-1", title: "Night Loop", progressionBlocks: [block] });
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
          setToast={vi.fn()}
          copy={appCopy.ja}
          language="ja"
        />,
      );
    });

    expect(container.textContent).toContain(block.summaryText);
    expect(container.textContent).toContain("Cmaj7");
    expect(container.textContent).toContain("Key");
    expect(container.textContent).toContain("92");
    expect(container.textContent).toContain("4小節");
    expect(container.textContent).toContain("Night Loop");
    expect(container.textContent).toContain(progressionDetailCopy.ja.savedChord);
    expect(container.textContent).toContain(progressionDetailCopy.ja.editingChord);
    expect(container.textContent).toContain(appCopy.ja.capture.piano);
    const previewToggle = container.querySelector(".lv-progression-preview-toggle");
    expect(previewToggle?.classList.contains("inline-flex")).toBe(true);
    expect(previewToggle?.classList.contains("whitespace-nowrap")).toBe(true);
    expect(container.querySelectorAll("[role='option']")).toHaveLength(1);
    expect(container.querySelector("[data-alternative-count]")?.getAttribute("data-alternative-count")).toBe("5");
    expect(container.querySelector("[data-progression-detail-inspector]")?.classList.contains("lv-responsive-inspector-host")).toBe(false);
    expect(container.querySelector(
      '[data-testid="detail-voicing-source-chip"]',
    )?.getAttribute("data-voicing-source")).toBe("generated");

    await act(async () => root.unmount());
  });

  it("previews a clicked chord card with the selected preview sound", async () => {
    const idea = makeIdea({ id: "idea-preview", progressionBlocks: [block] });
    const toggle = vi.fn().mockResolvedValue(undefined);
    const idleState = { status: "idle" as const };
    const controller: PlaybackController = {
      getState: () => idleState,
      play: vi.fn(),
      stop: vi.fn(),
      toggle,
      isPlaying: () => false,
      subscribe: () => () => undefined,
    };
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
          setToast={vi.fn()}
          copy={appCopy.en}
          language="en"
          controller={controller}
        />,
      );
    });

    const electricPiano = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === appCopy.en.capture.electricPiano)!;
    await act(async () => electricPiano.click());

    const card = container.querySelector<HTMLElement>("[role='option']")!;
    await act(async () => card.click());
    expect(toggle).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "detail", id: expect.stringContaining(":chord:") }),
      expect.objectContaining({ type: "chord", chord: block.chords[0]!.chord, sound: "electric-piano" }),
    );

    toggle.mockClear();
    await act(async () => {
      card.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    expect(toggle).not.toHaveBeenCalled();
    expect(document.querySelector("[data-quick-chord-editor]")).not.toBeNull();
    expect(document.querySelectorAll("[data-quick-candidate]")).toHaveLength(5);
    expect(document.querySelector("[data-candidate-source='harmonicContext']")).not.toBeNull();
    expect(document.querySelector("[data-style-candidate-unavailable]")?.textContent)
      .toBe("Style candidates appear after more progressions or accepted edits are verified.");

    await act(async () => root.unmount());
  });

  it("inserts a generated candidate after a chord card and saves it", async () => {
    const idea = makeIdea({ id: "idea-add", progressionBlocks: [block] });
    const updateProgressionBlock = vi.fn((
      _ideaId: string,
      _blockId: string,
      _changes: Partial<SavedProgressionBlock>,
    ) => true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProgressionDetailView
          idea={idea}
          block={block}
          updateProgressionBlock={updateProgressionBlock}
          duplicateProgressionBlock={vi.fn()}
          openProgression={vi.fn()}
          openIdea={vi.fn()}
          openVault={vi.fn()}
          requestDelete={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          language="ja"
        />,
      );
    });

    const addChord = container.querySelector<HTMLButtonElement>("[data-insert-chord-after]")!;
    expect(addChord.getAttribute("aria-label")).toBe(progressionEditorCopy.ja.insertAfterChord);
    await act(async () => addChord.click());
    const cards = [...container.querySelectorAll<HTMLElement>("[role='option']")];
    expect(cards).toHaveLength(2);
    expect(cards[1]?.getAttribute("aria-selected")).toBe("true");
    expect(cards[1]?.textContent).not.toContain("Cmaj7");
    expect(container.querySelector("[data-alternative-count]")).not.toBeNull();

    await act(async () => {
      cards[1]!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    expect(document.querySelectorAll("[data-quick-candidate]")).toHaveLength(5);
    expect(document.querySelectorAll("[data-candidate-source='harmonicContext']").length)
      .toBeGreaterThanOrEqual(3);
    expect(document.querySelector("[data-candidate-sources*='smoothConnection']")).not.toBeNull();

    const save = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === progressionDetailCopy.ja.saveChanges)!;
    await act(async () => save.click());
    expect(updateProgressionBlock).toHaveBeenCalledOnce();
    const saved = updateProgressionBlock.mock.calls[0]![2];
    expect(saved.chords).toHaveLength(2);
    expect(saved.chords?.[0]?.chord.label).toBe("Cmaj7");
    expect(saved.chords?.[1]?.chord.label).not.toBe("Cmaj7");

    await act(async () => root.unmount());
  });

  it("applies an alternative and saves the edited block through the supplied store action", async () => {
    const idea = makeIdea({ id: "idea-1", progressionBlocks: [block] });
    const updateProgressionBlock = vi.fn(() => true);
    const setToast = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProgressionDetailView
          idea={idea}
          block={block}
          updateProgressionBlock={updateProgressionBlock}
          duplicateProgressionBlock={vi.fn()}
          openProgression={vi.fn()}
          openIdea={vi.fn()}
          openVault={vi.fn()}
          requestDelete={vi.fn()}
          setToast={setToast}
          copy={appCopy.en}
          language="en"
        />,
      );
    });

    const buttons = () => [...container.querySelectorAll<HTMLButtonElement>("button")];
    const save = buttons().find((button) => button.textContent?.trim() === progressionDetailCopy.en.saveChanges)!;
    expect(save.disabled).toBe(true);

    await act(async () => {
      buttons().find((button) => button.textContent?.trim().startsWith("G7"))?.click();
    });
    await act(async () => {
      buttons().find((button) => button.textContent?.trim() === "Apply")?.click();
    });
    expect(save.disabled).toBe(false);

    await act(async () => save.click());
    expect(updateProgressionBlock).toHaveBeenCalledWith(
      idea.id,
      block.id,
      expect.objectContaining({
        id: block.id,
        summaryText: "G7",
        userEdited: true,
        chords: [expect.objectContaining({ chord: expect.objectContaining({ label: "G7" }) })],
      }),
    );
    expect(setToast).toHaveBeenLastCalledWith(progressionDetailCopy.en.savedToast);
    expect(save.disabled).toBe(true);

    await act(async () => root.unmount());
  });

  it("keeps the clicked slot selected through editing and saving", async () => {
    const secondAlternative = {
      root: 5,
      quality: "dom7" as const,
      tensions: [],
      label: "F7",
    };
    const multiBlock: SavedProgressionBlock = {
      ...block,
      summaryText: "Cmaj7 - Dm7 - G7",
      chords: [
        block.chords[0]!,
        {
          bar: 2,
          beat: 1,
          durationBeats: 4,
          chord: { root: 2, quality: "min7", tensions: [], label: "Dm7" },
          confidence: 0.8,
          alternatives: [{ chord: secondAlternative, confidence: 0.7 }],
          warnings: [],
        },
        {
          bar: 3,
          beat: 1,
          durationBeats: 4,
          chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
          confidence: 0.85,
          alternatives: [],
          warnings: [],
        },
      ],
    };
    const idea = makeIdea({ id: "idea-1", progressionBlocks: [multiBlock] });
    const updateProgressionBlock = vi.fn(() => true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProgressionDetailView
          idea={idea}
          block={multiBlock}
          updateProgressionBlock={updateProgressionBlock}
          duplicateProgressionBlock={vi.fn()}
          openProgression={vi.fn()}
          openIdea={vi.fn()}
          openVault={vi.fn()}
          requestDelete={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.en}
          language="en"
        />,
      );
    });

    const cards = [...container.querySelectorAll<HTMLElement>("[role='option']")];
    expect(cards).toHaveLength(3);
    expect(cards[0]?.getAttribute("aria-selected")).toBe("true");

    const firstCardButton = cards[0]!.querySelector<HTMLButtonElement>("button")!;
    await act(async () => {
      firstCardButton.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(cards[1]?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(cards[1]!.querySelector("button"));

    await act(async () => {
      cards[2]!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    expect(cards[2]?.getAttribute("aria-selected")).toBe("true");
    const quickEditor = document.querySelector<HTMLElement>("[data-quick-chord-editor]")!;
    expect(quickEditor).not.toBeNull();
    await act(async () => {
      quickEditor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    await act(async () => cards[1]!.click());
    expect(cards[1]?.getAttribute("aria-selected")).toBe("true");
    expect(cards[0]?.getAttribute("aria-selected")).toBe("false");

    const buttons = () => [...container.querySelectorAll<HTMLButtonElement>("button")];
    await act(async () => {
      buttons().find((button) => button.textContent?.trim().startsWith("F7"))?.click();
    });
    await act(async () => {
      buttons().find((button) => button.textContent?.trim() === "Apply")?.click();
    });
    expect(cards[1]?.getAttribute("aria-selected")).toBe("true");

    const save = buttons().find((button) => button.textContent?.trim() === progressionDetailCopy.en.saveChanges)!;
    await act(async () => save.click());

    expect(updateProgressionBlock).toHaveBeenCalledWith(
      idea.id,
      multiBlock.id,
      expect.objectContaining({
        chords: [
          expect.objectContaining({ chord: expect.objectContaining({ label: "Cmaj7" }) }),
          expect.objectContaining({ chord: expect.objectContaining({ label: "F7" }) }),
          expect.objectContaining({ chord: expect.objectContaining({ label: "G7" }) }),
        ],
      }),
    );
    expect(cards[1]?.getAttribute("aria-selected")).toBe("true");

    await act(async () => root.unmount());
  });
});
