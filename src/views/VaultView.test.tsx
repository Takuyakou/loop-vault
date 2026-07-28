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
        openCreate={vi.fn()}
        openCapture={vi.fn()}
        updateIdea={vi.fn()}
        setToast={vi.fn()}
        copy={appCopy.ja}
        language="ja"
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
    };

    await render();
    const modeButtons = [...container.querySelectorAll<HTMLButtonElement>("[role='group'] button")];
    expect(modeButtons.map((button) => button.textContent)).toEqual(["Library", "List", "Idea"]);
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

    const openButtons = container.querySelectorAll<HTMLButtonElement>('[aria-label="Open progression"]');
    expect(openButtons).toHaveLength(2);
    expect(openButtons[1].title).toBe("Open progression");
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
    expect(openProgression).toHaveBeenCalledTimes(1);
    expect(openProgression).toHaveBeenLastCalledWith(idea.id, progressionBlock.id);

    openProgression.mockClear();
    await act(async () => {
      progression.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(openProgression).toHaveBeenCalledTimes(1);

    openProgression.mockClear();
    const openButton = container.querySelector<HTMLButtonElement>('[aria-label="Open progression"]')!;
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
    expect(row.querySelector(".lv-vault-tags")?.textContent).toContain("bridge · bright");
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
          <GlobalPreviewSoundSelector copy={appCopy.en} />
          <VaultView
            ideas={[idea]}
            openDetail={vi.fn()}
            openCreate={vi.fn()}
            openCapture={vi.fn()}
            updateIdea={vi.fn()}
            setToast={vi.fn()}
            copy={appCopy.en}
            language="en"
            showRomanNumerals={false}
          />
        </PreviewSoundProvider>,
      );
    });

    const selector = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Preview sound"]',
    );
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      setter?.call(selector, "electric-piano");
      selector?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Preview"]',
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

    const search = container.querySelector<HTMLInputElement>("input")!;
    await setInputValue(search, "Library");
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Library")?.click();
    });
    expect(search.value).toBe("Library");
    const slashFilter = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Slash Bass"));
    await act(async () => slashFilter?.click());
    expect(container.querySelectorAll(".lv-vault-row")).toHaveLength(1);
    expect(container.querySelector(".lv-vault-progression-primary")?.textContent).toContain("Cmaj7/E");

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "List")?.click();
    });
    expect(search.value).toBe("Library");
    await act(async () => root.unmount());
  });

  it("virtualizes progression rows after the 200-entry threshold", async () => {
    const blocks = Array.from({ length: 205 }, (_, index) => ({
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

    expect(container.querySelector("[data-virtualized='true']")).not.toBeNull();
    expect(container.querySelector("[data-virtualized='true']")?.getAttribute("data-row-height")).toBe("96");
    expect(container.querySelector(".lv-vault-row")?.classList.contains("h-24")).toBe(true);
    expect(container.querySelectorAll(".lv-vault-row").length).toBeLessThan(205);
    expect(container.textContent).toContain("205 items");
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
