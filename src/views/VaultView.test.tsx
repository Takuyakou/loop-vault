// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../audio/playbackController";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import { appCopy, type AppLanguage } from "../i18n";
import { VaultView } from "./VaultView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const progressionBlock: SavedProgressionBlock = {
  id: "block-1",
  summaryText: "C major loop",
  chords: [{
    bar: 1,
    beat: 1,
    durationBeats: 4,
    chord: {
      root: 0,
      quality: "maj7",
      tensions: [],
      label: "Cmaj7",
    },
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  }],
  tags: [],
  capturedAt: "2026-07-15T00:00:00.000Z",
  analyzerVersion: "test",
};

afterEach(() => {
  playbackController.stop();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("VaultView keyboard shortcuts", () => {
  it("pins from the stored block array while another block is pending deletion", async () => {
    const pendingBlock = { ...progressionBlock, id: "pending-block" };
    const visibleBlock = { ...progressionBlock, id: "visible-block", pinned: false };
    const visibleIdea = makeIdea({ progressionBlocks: [visibleBlock] });
    const storedIdea = makeIdea({
      id: visibleIdea.id,
      progressionBlocks: [pendingBlock, visibleBlock],
    });
    const updateIdea = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <VaultView
          ideas={[visibleIdea]}
          storedIdeas={[storedIdea]}
          openDetail={vi.fn()}
          openCreate={vi.fn()}
          openCapture={vi.fn()}
          updateIdea={updateIdea}
          setToast={vi.fn()}
          copy={appCopy.en}
          language="en"
          showRomanNumerals={false}
        />,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(`[aria-label="${appCopy.en.library.addFavorite}"]`)?.click();
    });

    expect(updateIdea).toHaveBeenCalledWith(visibleIdea.id, {
      progressionBlocks: [pendingBlock, { ...visibleBlock, pinned: true }],
    });
    await act(async () => root.unmount());
  });

  it("opens from the localized chevron without changing keyboard selection", async () => {
    const firstIdea = makeIdea({
      id: "idea-first",
      progressionBlocks: [{ ...progressionBlock, id: "block-first" }],
    });
    const secondIdea = makeIdea({
      id: "idea-second",
      progressionBlocks: [{ ...progressionBlock, id: "block-second" }],
    });
    const openDetail = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <VaultView
          ideas={[firstIdea, secondIdea]}
          openDetail={openDetail}
          openCreate={vi.fn()}
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.en}
          language="en"
          showRomanNumerals={false}
        />,
      );
    });

    const openButtons = container.querySelectorAll<HTMLButtonElement>('[aria-label="Open idea"]');
    expect(openButtons).toHaveLength(2);
    expect(openButtons[1].title).toBe("Open idea");
    await act(async () => openButtons[1].click());
    expect(openDetail).toHaveBeenCalledTimes(1);
    expect(openDetail).toHaveBeenLastCalledWith("idea-second");

    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(openDetail).toHaveBeenCalledTimes(2);
    expect(openDetail).toHaveBeenLastCalledWith("idea-first");

    await act(async () => {
      root.render(
        <VaultView
          ideas={[firstIdea, secondIdea]}
          openDetail={openDetail}
          openCreate={vi.fn()}
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          language="ja"
          showRomanNumerals={false}
        />,
      );
    });
    const localizedOpen = container.querySelector<HTMLButtonElement>('[aria-label="Ideaを開く"]');
    expect(localizedOpen?.title).toBe("Ideaを開く");

    await act(async () => root.unmount());
  });

  it("keeps double-click and Enter open shortcuts without duplicate button activation", async () => {
    const idea = makeIdea({ id: "idea-shortcuts", progressionBlocks: [progressionBlock] });
    const openDetail = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <VaultView
          ideas={[idea]}
          openDetail={openDetail}
          openCreate={vi.fn()}
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.en}
          language="en"
          showRomanNumerals={false}
        />,
      );
    });

    const progression = container.querySelector<HTMLButtonElement>(".lv-vault-progression")!;
    progression.focus();
    await act(async () => {
      progression.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(openDetail).toHaveBeenCalledTimes(1);

    openDetail.mockClear();
    await act(async () => {
      progression.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(openDetail).toHaveBeenCalledTimes(1);

    openDetail.mockClear();
    const openButton = container.querySelector<HTMLButtonElement>('[aria-label="Open idea"]')!;
    await act(async () => {
      openButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      openButton.click();
      openButton.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
    });
    expect(openDetail).toHaveBeenCalledTimes(1);

    openDetail.mockClear();
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(openDetail).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("localizes row actions and keeps selection when favorite and copy are clicked", async () => {
    const firstIdea = makeIdea({
      id: "idea-selected",
      progressionBlocks: [{ ...progressionBlock, id: "block-selected" }],
    });
    const secondIdea = makeIdea({
      id: "idea-actions",
      progressionBlocks: [{ ...progressionBlock, id: "block-actions", pinned: false }],
    });
    const openDetail = vi.fn();
    const updateIdea = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    const render = async (language: AppLanguage) => {
      await act(async () => {
        root.render(
          <VaultView
            ideas={[firstIdea, secondIdea]}
            openDetail={openDetail}
            openCreate={vi.fn()}
            openCapture={vi.fn()}
            updateIdea={updateIdea}
            setToast={vi.fn()}
            copy={appCopy[language]}
            language={language}
            showRomanNumerals={false}
          />,
        );
      });
    };

    await render("en");
    expect(container.querySelector<HTMLInputElement>("input")?.placeholder).toBe(appCopy.en.library.searchPlaceholder);
    expect(container.textContent).toContain(appCopy.en.library.all);
    const favorite = container.querySelectorAll<HTMLButtonElement>(`[aria-label="${appCopy.en.library.addFavorite}"]`)[1]!;
    const copyButton = container.querySelectorAll<HTMLButtonElement>(`[aria-label="${appCopy.en.library.copyProgression}"]`)[1]!;
    expect(favorite.title).toBe(appCopy.en.library.addFavorite);
    expect(copyButton.title).toBe(appCopy.en.library.copyProgression);
    await act(async () => {
      favorite.click();
      copyButton.click();
    });
    expect(updateIdea).toHaveBeenCalledWith(secondIdea.id, {
      progressionBlocks: [{ ...secondIdea.progressionBlocks![0], pinned: true }],
    });
    expect(writeText).toHaveBeenCalledWith("| Cmaj7 |");

    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(openDetail).toHaveBeenLastCalledWith(firstIdea.id);

    await render("ja");
    expect(container.querySelector<HTMLInputElement>("input")?.placeholder).toBe(appCopy.ja.library.searchPlaceholder);
    expect(container.textContent).toContain(appCopy.ja.library.all);
    expect(container.textContent).not.toContain("All");
    expect(container.querySelector(`[aria-label="${appCopy.ja.library.addFavorite}"][title="${appCopy.ja.library.addFavorite}"]`)).not.toBeNull();
    expect(container.querySelector(`[aria-label="${appCopy.ja.library.copyProgression}"][title="${appCopy.ja.library.copyProgression}"]`)).not.toBeNull();

    await act(async () => root.unmount());
  });

  it("keeps title and metadata in the responsive two-row structure", async () => {
    const idea = makeIdea({
      id: "idea-metadata",
      title: "Night bridge",
      key: "C major",
      bpm: 108,
      progressionBlocks: [{
        ...progressionBlock,
        id: "block-metadata",
        detectedKey: "D minor",
        bpm: 124,
        tags: ["bridge", "bright"],
      }],
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <VaultView
          ideas={[idea]}
          openDetail={vi.fn()}
          openCreate={vi.fn()}
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.en}
          language="en"
          showRomanNumerals
        />,
      );
    });

    const row = container.querySelector<HTMLElement>(".lv-vault-row")!;
    const primary = row.querySelector(".lv-vault-progression-primary")!;
    const secondary = row.querySelector(".lv-vault-progression-secondary")!;
    const metadata = row.querySelector(".lv-vault-metadata")!;
    expect(primary.textContent).toContain("Cmaj7");
    expect(secondary.textContent).toContain("Night bridge");
    expect(metadata.textContent).toContain("Key D minor");
    expect(metadata.textContent).toContain("124 BPM");
    expect(metadata.textContent).toContain(new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(progressionBlock.capturedAt)));
    expect(row.querySelector(".lv-vault-tags")?.textContent).toBe("bridge · bright");
    expect(row.querySelector(".lv-vault-actions")).not.toBeNull();

    await act(async () => root.unmount());
  });

  it("uses the latest language for a Space playback failure", async () => {
    const setToast = vi.fn();
    vi.spyOn(playbackController, "toggle").mockRejectedValue(undefined);
    const idea = makeIdea({ progressionBlocks: [progressionBlock] });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    const render = async (language: AppLanguage) => {
      await act(async () => {
        root.render(
          <VaultView
            ideas={[idea]}
            openDetail={vi.fn()}
            openCreate={vi.fn()}
            openCapture={vi.fn()}
            updateIdea={vi.fn()}
            setToast={setToast}
            copy={appCopy[language]}
            language={language}
            showRomanNumerals={false}
          />,
        );
      });
    };

    await render("ja");
    await render("en");
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });

    expect(setToast).toHaveBeenCalledWith(appCopy.en.toast.chordPreviewFailed);
    expect(setToast).not.toHaveBeenCalledWith(appCopy.ja.toast.chordPreviewFailed);

    await act(async () => root.unmount());
  });

  it("uses localized copy failure text when the Clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const setToast = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <VaultView
          ideas={[makeIdea({ progressionBlocks: [progressionBlock] })]}
          openDetail={vi.fn()}
          openCreate={vi.fn()}
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          setToast={setToast}
          copy={appCopy.ja}
          language="ja"
          showRomanNumerals={false}
        />,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(`[aria-label="${appCopy.ja.library.copyProgression}"]`)?.click();
    });
    expect(setToast).toHaveBeenLastCalledWith(appCopy.ja.library.copyFailed);
    await act(async () => root.unmount());
  });
});
