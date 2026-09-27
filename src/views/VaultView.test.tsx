// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../audio/playbackController";
import { GlobalPreviewSoundSelector } from "../components/GlobalPreviewSoundSelector";
import { PreviewSoundProvider } from "../components/PreviewSoundProvider";
import { progressionFingerprint } from "../domain/practice";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import { appCopy } from "../i18n";
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
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("VaultView keyboard shortcuts", () => {
  it("shows transposition coverage in the Vault progression row", async () => {
    const practiced: SavedProgressionBlock = {
      ...progressionBlock,
      detectedKey: "C major",
      practice: {
        schemaVersion: 1,
        progressionFingerprint: progressionFingerprint({
          ...progressionBlock,
          detectedKey: "C major",
        }),
        confirmedLevel: 3,
        transposition: {
          schemaVersion: 1,
          clearedKeyPitchClasses: [2, 5, 7, 9],
          updatedAt: "2026-07-24T00:00:00.000Z",
        },
      },
    };
    const idea = makeIdea({
      id: "idea-coverage",
      progressionBlocks: [practiced],
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = (currentIdea: typeof idea) => (
      <VaultView
        ideas={[currentIdea]}
        openDetail={vi.fn()}
        openCapture={vi.fn()}
        updateIdea={vi.fn()}
        updateProgressionBlock={vi.fn()}
        setToast={vi.fn()}
        copy={appCopy.ja}
        showRomanNumerals={false}
      />
    );

    await act(async () => root.render(render(idea)));
    const badge = container.querySelector<HTMLElement>("[data-practice-state]");
    expect(badge?.textContent).toContain("L4 4/6");
    expect(badge?.className).toContain("max-w-full");
    expect(badge?.className).not.toContain("shrink-0");

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
    })));
    const staleBadge = container.querySelector<HTMLElement>(
      '[data-practice-state="stale"]',
    );
    expect(staleBadge?.textContent).toContain("進行更新・要確認");
    expect(staleBadge?.textContent).not.toContain("4/6");
    await act(async () => root.unmount());
  });

  it("opens Library first and keeps a List choice for the current session", async () => {
    const idea = makeIdea({ id: "idea-mode", progressionBlocks: [progressionBlock] });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = async () => {
      await act(async () => {
        root.render(
          <VaultView
            ideas={[idea]}
            openDetail={vi.fn()}
            openCapture={vi.fn()}
            updateIdea={vi.fn()}
            updateProgressionBlock={vi.fn()}
            setToast={vi.fn()}
            copy={appCopy.ja}
            showRomanNumerals={false}
          />,
        );
      });
    };

    await render();
    const modeButtons = [...container.querySelectorAll<HTMLButtonElement>(
      "[role='group'][aria-label='Vault'] button",
    )];
    expect(modeButtons.map((button) => button.textContent)).toEqual(["ライブラリ", "一覧", "Idea"]);
    expect(modeButtons[0]?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => modeButtons[2]!.click());
    expect(modeButtons[2]?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => modeButtons[1]!.click());

    expect(modeButtons[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(window.sessionStorage.getItem("loop-vault.progression-view-mode")).toBe("list");

    await act(async () => root.unmount());
    const nextRoot = createRoot(container);
    await act(async () => {
      nextRoot.render(
        <VaultView
          ideas={[idea]}
          openDetail={vi.fn()}
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          updateProgressionBlock={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          showRomanNumerals={false}
        />,
      );
    });
    const restoredButtons = [...container.querySelectorAll<HTMLButtonElement>("[role='group'] button")];
    expect(restoredButtons[1]?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => nextRoot.unmount());
  });

  it("pins from the stored block array while another block is pending deletion", async () => {
    const pendingBlock = { ...progressionBlock, id: "pending-block" };
    const visibleBlock = { ...progressionBlock, id: "visible-block", pinned: false };
    const visibleIdea = makeIdea({ progressionBlocks: [visibleBlock] });
    const storedIdea = makeIdea({
      id: visibleIdea.id,
      progressionBlocks: [pendingBlock, visibleBlock],
    });
    const updateIdea = vi.fn();
    const updateProgressionBlock = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <VaultView
          ideas={[visibleIdea]}
          storedIdeas={[storedIdea]}
          openDetail={vi.fn()}
          openCapture={vi.fn()}
          updateIdea={updateIdea}
          updateProgressionBlock={updateProgressionBlock}
          setToast={vi.fn()}
          copy={appCopy.ja}
          showRomanNumerals={false}
        />,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(`[aria-label="${appCopy.ja.library.addFavorite}"]`)?.click();
    });

    expect(updateProgressionBlock).toHaveBeenCalledWith(visibleIdea.id, visibleBlock.id, { pinned: true });
    expect(updateIdea).not.toHaveBeenCalled();
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
    const openProgression = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <VaultView
          ideas={[firstIdea, secondIdea]}
          openDetail={openDetail}
          openProgression={openProgression}
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          updateProgressionBlock={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          showRomanNumerals={false}
        />,
      );
    });

    const openButtons = container.querySelectorAll<HTMLButtonElement>('[aria-label="進行を開く"]');
    expect(openButtons).toHaveLength(2);
    expect(openButtons[1].title).toBe("進行を開く");
    await act(async () => openButtons[1].click());
    expect(openProgression).toHaveBeenCalledTimes(1);
    expect(openProgression).toHaveBeenLastCalledWith("idea-second", "block-second");

    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(openProgression).toHaveBeenCalledTimes(2);
    expect(openProgression).toHaveBeenLastCalledWith("idea-first", "block-first");

    await act(async () => {
      root.render(
        <VaultView
          ideas={[firstIdea, secondIdea]}
          openDetail={openDetail}
          openProgression={openProgression}
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          updateProgressionBlock={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          showRomanNumerals={false}
        />,
      );
    });
    const localizedOpen = container.querySelector<HTMLButtonElement>('[aria-label="進行を開く"]');
    expect(localizedOpen?.title).toBe("進行を開く");

    await act(async () => root.unmount());
  });

  it("keeps double-click and Enter open shortcuts without duplicate button activation", async () => {
    const idea = makeIdea({ id: "idea-shortcuts", progressionBlocks: [progressionBlock] });
    const openDetail = vi.fn();
    const openProgression = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <VaultView
          ideas={[idea]}
          openDetail={openDetail}
          openProgression={openProgression}
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          updateProgressionBlock={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          showRomanNumerals={false}
        />,
      );
    });

    const progression = container.querySelector<HTMLButtonElement>(".lv-vault-progression")!;
    progression.focus();
    await act(async () => {
      progression.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(openProgression).toHaveBeenCalledTimes(1);
    expect(openProgression).toHaveBeenLastCalledWith(idea.id, progressionBlock.id);

    openProgression.mockClear();
    await act(async () => {
      progression.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(openProgression).toHaveBeenCalledTimes(1);

    openProgression.mockClear();
    const openButton = container.querySelector<HTMLButtonElement>('[aria-label="進行を開く"]')!;
    await act(async () => {
      openButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      openButton.click();
      openButton.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
    });
    expect(openProgression).toHaveBeenCalledTimes(1);

    openProgression.mockClear();
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(openProgression).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("labels row actions in Japanese and keeps selection when favorite and copy are clicked", async () => {
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
    const updateProgressionBlock = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    const render = async () => {
      await act(async () => {
        root.render(
          <VaultView
            ideas={[firstIdea, secondIdea]}
            openDetail={openDetail}
            openCapture={vi.fn()}
            updateIdea={updateIdea}
            updateProgressionBlock={updateProgressionBlock}
            setToast={vi.fn()}
            copy={appCopy.ja}
            showRomanNumerals={false}
          />,
        );
      });
    };

    await render();
    const search = container.querySelector<HTMLInputElement>("#vault-search");
    expect(search?.placeholder).toBe(appCopy.ja.library.searchPlaceholder);
    expect(container.querySelector<HTMLLabelElement>('label[for="vault-search"]')?.textContent)
      .toBe(appCopy.ja.library.search);
    expect(container.querySelector<HTMLLabelElement>('label[for="vault-search"]')?.className)
      .not.toContain("sr-only");
    expect(container.querySelector<HTMLLabelElement>('label[for="vault-sort"]')?.textContent)
      .toBe(appCopy.ja.library.sort);
    expect(container.querySelector<HTMLLabelElement>('label[for="vault-sort"]')?.className)
      .not.toContain("sr-only");
    expect(container.querySelector('[role="group"][aria-label="小節数で絞り込み"]'))
      .not.toBeNull();
    expect(container.querySelectorAll('[role="group"][aria-label="小節数で絞り込み"] button[aria-pressed="true"]'))
      .toHaveLength(1);
    expect(container.textContent).toContain(appCopy.ja.library.all);
    expect(container.querySelector('[role="status"][aria-live="polite"]')?.textContent)
      .toContain("2");
    const favorite = container.querySelectorAll<HTMLButtonElement>(`[aria-label="${appCopy.ja.library.addFavorite}"]`)[1]!;
    const copyButton = container.querySelectorAll<HTMLButtonElement>(`[aria-label="${appCopy.ja.library.copyProgression}"]`)[1]!;
    expect(favorite.title).toBe(appCopy.ja.library.addFavorite);
    expect(copyButton.title).toBe(appCopy.ja.library.copyProgression);
    await act(async () => {
      favorite.click();
      copyButton.click();
    });
    expect(updateProgressionBlock).toHaveBeenCalledWith(secondIdea.id, "block-actions", { pinned: true });
    expect(updateIdea).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith("| Cmaj7 |");

    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(openDetail).toHaveBeenLastCalledWith(firstIdea.id);

    await render();
    expect(container.querySelector<HTMLInputElement>("#vault-search")?.placeholder).toBe(appCopy.ja.library.searchPlaceholder);
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
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          updateProgressionBlock={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          showRomanNumerals
        />,
      );
    });

    const row = container.querySelector<HTMLElement>(".lv-vault-row")!;
    const primary = row.querySelector(".lv-vault-progression-primary")!;
    const secondary = row.querySelector(".lv-vault-progression-secondary")!;
    const metadata = row.querySelector(".lv-vault-metadata")!;
    expect(row.getAttribute("data-compact")).toBe("false");
    expect(row.classList.contains("min-h-24")).toBe(true);
    expect(row.classList.contains("overflow-hidden")).toBe(false);
    expect(primary.classList.contains("truncate")).toBe(false);
    expect(row.querySelector(".lv-vault-progression")?.getAttribute("aria-current")).toBe("true");
    expect(primary.textContent).toContain("Cmaj7");
    expect(secondary.textContent).toContain("Night bridge");
    expect(metadata.textContent).toContain("Key D minor");
    expect(metadata.textContent).toContain("124 BPM");
    expect(metadata.textContent).toContain(new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(progressionBlock.capturedAt)));
    expect(row.querySelector(".lv-vault-tags")?.textContent).toContain("bridge · bright");
    expect(row.querySelector(".lv-vault-actions")).not.toBeNull();

    await act(async () => root.unmount());
  });

  it("shows only the first eight chords while keeping later chords searchable", async () => {
    const longProgression = {
      ...progressionBlock,
      id: "block-long-preview",
      chords: Array.from({ length: 10 }, (_, index) => ({
        ...progressionBlock.chords[0],
        bar: index + 1,
        chord: {
          ...progressionBlock.chords[0].chord,
          label: index === 9 ? "HiddenChord10" : `Chord${index + 1}`,
        },
      })),
    };
    const idea = makeIdea({
      id: "idea-long-preview",
      progressionBlocks: [longProgression],
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <VaultView
          ideas={[idea]}
          openDetail={vi.fn()}
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          updateProgressionBlock={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          showRomanNumerals={false}
        />,
      );
    });

    const expectedPreview = "Chord1 · Chord2 · Chord3 · Chord4 · Chord5 · Chord6 · Chord7 · Chord8 · …";
    expect(container.querySelector(".lv-vault-progression-primary")?.textContent).toBe(expectedPreview);
    expect(container.textContent).not.toContain("Chord9");
    expect(container.textContent).not.toContain("HiddenChord10");

    const search = container.querySelector<HTMLInputElement>("#vault-search")!;
    await setInputValue(search, "HiddenChord10");
    expect(container.querySelectorAll(".lv-vault-row")).toHaveLength(1);
    expect(container.querySelector(".lv-vault-progression-primary")?.textContent).toBe(expectedPreview);

    await act(async () => root.unmount());
  });

  it("uses the shared preview sound for Vault playback", async () => {
    const toggle = vi.spyOn(playbackController, "toggle")
      .mockResolvedValue(undefined);
    const idea = makeIdea({ progressionBlocks: [progressionBlock] });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <PreviewSoundProvider>
          <GlobalPreviewSoundSelector copy={appCopy.ja} />
          <VaultView
            ideas={[idea]}
            openDetail={vi.fn()}
            openCapture={vi.fn()}
            updateIdea={vi.fn()}
            updateProgressionBlock={vi.fn()}
            setToast={vi.fn()}
            copy={appCopy.ja}
            showRomanNumerals={false}
          />
        </PreviewSoundProvider>,
      );
    });

    const electricPiano = container.querySelector<HTMLButtonElement>(
      'button[data-preview-sound="electric-piano"]',
    );
    await act(async () => electricPiano?.click());
    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="試聴"]',
      )?.click();
    });

    expect(toggle).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "vault" }),
      expect.objectContaining({ sound: "electric-piano" }),
    );

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
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          updateProgressionBlock={vi.fn()}
          setToast={setToast}
          copy={appCopy.ja}
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

  it("keeps search state while Smart Library filters by derived categories", async () => {
    const plain = { ...progressionBlock, id: "plain", sourceFileName: "plain.mid" };
    const slash = {
      ...progressionBlock,
      id: "slash",
      sourceFileName: "slash.mid",
      chords: [{
        ...progressionBlock.chords[0],
        chord: { ...progressionBlock.chords[0].chord, bass: 4, label: "Cmaj7/E" },
      }],
    };
    const idea = makeIdea({ id: "idea-library", title: "Library search", progressionBlocks: [plain, slash] });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <VaultView
          ideas={[idea]}
          openDetail={vi.fn()}
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          updateProgressionBlock={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          showRomanNumerals={false}
        />,
      );
    });

    const search = container.querySelector<HTMLInputElement>("input")!;
    await setInputValue(search, "Library");
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "ライブラリ")?.click();
    });
    expect(search.value).toBe("Library");
    const slashFilter = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("分数コード"));
    await act(async () => slashFilter?.click());
    expect(container.querySelectorAll(".lv-vault-row")).toHaveLength(1);
    expect(container.querySelector(".lv-vault-progression-primary")?.textContent).toContain("Cmaj7/E");

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "一覧")?.click();
    });
    expect(search.value).toBe("Library");
    await act(async () => root.unmount());
  });

  it("virtualizes 1000 progression rows without mounting every card", async () => {
    const blocks = Array.from({ length: 1000 }, (_, index) => ({
      ...progressionBlock,
      id: `block-${index}`,
    }));
    const idea = makeIdea({ id: "idea-large", progressionBlocks: blocks });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <VaultView
          ideas={[idea]}
          openDetail={vi.fn()}
          openCapture={vi.fn()}
          updateIdea={vi.fn()}
          updateProgressionBlock={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          showRomanNumerals={false}
        />,
      );
    });

    expect(container.querySelector("[data-virtualized='true']")).not.toBeNull();
    expect(container.querySelector("[data-virtualized='true']")?.getAttribute("data-row-height")).toBe("96");
    const compactRow = container.querySelector<HTMLElement>(".lv-vault-row")!;
    expect(compactRow.getAttribute("data-compact")).toBe("true");
    expect(compactRow.classList.contains("h-24")).toBe(true);
    expect(compactRow.classList.contains("overflow-hidden")).toBe(true);
    expect(compactRow.querySelector(".lv-vault-progression-primary")?.classList.contains("truncate"))
      .toBe(true);
    expect(compactRow.querySelector(".lv-vault-progression")?.getAttribute("title"))
      .toContain("Cmaj7");
    expect(container.querySelectorAll(".lv-vault-row").length).toBeLessThan(100);
    expect(container.textContent).toContain("1000件");
    await act(async () => root.unmount());
  });
});

async function setInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
