// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../audio/playbackController";
import { GlobalPreviewSoundSelector } from "../components/GlobalPreviewSoundSelector";
import { PreviewSoundProvider } from "../components/PreviewSoundProvider";
import { progressionFingerprint } from "../domain/practice";
import { makeIdea } from "../domain/testFactory";
import type { ChordQuality, SavedProgressionBlock } from "../domain/types";
import { appCopy } from "../i18n";
import { VaultView } from "./VaultView";
import { VAULT_LIBRARY_SESSION_KEY } from "./vault/useVaultLibraryFilters";

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

const pitch: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function chordBlock(id: string, labels: string[], extra: Partial<SavedProgressionBlock> = {}): SavedProgressionBlock {
  return {
    ...progressionBlock,
    id,
    chords: labels.map((label, index) => {
      const quality: ChordQuality = label.includes("maj7") ? "maj7" : label.includes("m7") ? "min7" : label.endsWith("7") ? "dom7" : label.endsWith("m") ? "min" : "maj";
      return { ...progressionBlock.chords[0], bar: index + 1, chord: { root: pitch[label[0]], quality, tensions: [], label } };
    }),
    ...extra,
  };
}

type Props = ComponentProps<typeof VaultView>;

async function renderVault(overrides: Partial<Props> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const props: Props = {
    ideas: [],
    openDetail: vi.fn(),
    openCapture: vi.fn(),
    updateIdea: vi.fn(),
    updateProgressionBlock: vi.fn(),
    setToast: vi.fn(),
    copy: appCopy.ja,
    showRomanNumerals: false,
    ...overrides,
  };
  await act(async () => root.render(<VaultView {...props} />));
  return {
    container,
    root,
    rerender: async (next: Partial<Props>) => act(async () => root.render(<VaultView {...props} {...next} />)),
    unmount: async () => act(async () => root.unmount()),
  };
}

const buttonByText = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes(text));
const rowNames = (container: HTMLElement) =>
  [...container.querySelectorAll(".lv-vault-progression-primary")].map((node) => node.textContent);

afterEach(() => {
  playbackController.stop();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("VaultView", () => {
  it("shows transposition coverage in the Vault progression row", async () => {
    const practiced: SavedProgressionBlock = {
      ...progressionBlock,
      detectedKey: "C major",
      practice: {
        schemaVersion: 1,
        progressionFingerprint: progressionFingerprint({ ...progressionBlock, detectedKey: "C major" }),
        confirmedLevel: 3,
        transposition: { schemaVersion: 1, clearedKeyPitchClasses: [2, 5, 7, 9], updatedAt: "2026-07-24T00:00:00.000Z" },
      },
    };
    const idea = makeIdea({ id: "idea-coverage", progressionBlocks: [practiced] });
    const view = await renderVault({ ideas: [idea] });
    const badge = view.container.querySelector<HTMLElement>("[data-practice-state]");
    expect(badge?.textContent).toContain("L4 4/6");
    expect(badge?.className).toContain("max-w-full");

    const stale = { ...practiced, practice: { ...practiced.practice!, progressionFingerprint: "practice-v1-stale" } };
    await view.rerender({ ideas: [{ ...idea, progressionBlocks: [stale] }] });
    const staleBadge = view.container.querySelector<HTMLElement>('[data-practice-state="stale"]');
    expect(staleBadge?.textContent).toContain("進行更新・要確認");
    expect(staleBadge?.textContent).not.toContain("4/6");
    await view.unmount();
  });

  it("lists progressions only, with Ideas without one grouped at the end", async () => {
    const openDetail = vi.fn();
    const view = await renderVault({
      openDetail,
      ideas: [
        makeIdea({ id: "with", title: "With progression", progressionBlocks: [progressionBlock] }),
        makeIdea({ id: "memo-1", title: "Memo only", progressionBlocks: [] }),
        makeIdea({ id: "memo-2", title: "Another memo" }),
      ],
    });
    expect(view.container.querySelectorAll(".lv-vault-row")).toHaveLength(1);
    expect(view.container.querySelector("[role='group'][aria-label='Vault']")).toBeNull();
    const group = view.container.querySelector("[data-testid='vault-orphan-ideas']")!;
    const toggle = buttonByText(group, "進行のない Idea（2件）")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle.click());
    await act(async () => buttonByText(group, "Memo only")!.click());
    expect(openDetail).toHaveBeenCalledWith("memo-1");
    await view.unmount();
  });

  it("guides an empty Vault to capture", async () => {
    const openCapture = vi.fn();
    const view = await renderVault({ openCapture });
    expect(view.container.textContent).toContain("まだ進行がありません");
    await act(async () => buttonByText(view.container, "コード採集")!.click());
    expect(openCapture).toHaveBeenCalled();
    expect(view.container.querySelectorAll(".lv-button-primary")).toHaveLength(1);
    await view.unmount();
  });

  it("filters with counted options: OR inside a section, AND across sections, and clears all", async () => {
    const view = await renderVault({
      ideas: [
        makeIdea({ id: "a", title: "Alpha", progressionBlocks: [chordBlock("a", ["C", "G"], { detectedKey: "C", lengthBars: 4, pinned: true })] }),
        makeIdea({ id: "b", title: "Bravo", progressionBlocks: [chordBlock("b", ["Am", "F"], { detectedKey: "Am", lengthBars: 8, origin: "live-midi" })] }),
        makeIdea({ id: "c", title: "Charlie", progressionBlocks: [chordBlock("c", ["D", "A"], { detectedKey: "D", lengthBars: 16, textSource: {} as SavedProgressionBlock["textSource"] })] }),
      ],
    });
    const filters = view.container.querySelector<HTMLElement>(".lv-vault-rail [data-testid='vault-filters']")!;
    const option = (section: string, label: string) =>
      buttonByText(filters.querySelector(`section[aria-label='${section}']`)!, label)!;
    expect(option("取り込み元", "MIDI").textContent).toContain("1");

    await act(async () => option("取り込み元", "Live MIDI").click());
    await act(async () => option("取り込み元", "テキスト").click());
    expect(new Set(rowNames(view.container))).toEqual(new Set(["Bravo", "Charlie"]));
    expect(option("取り込み元", "MIDI").getAttribute("aria-pressed")).toBe("false");

    await act(async () => option("長さ", "5〜8小節").click());
    expect(rowNames(view.container)).toEqual(["Bravo"]);
    expect(view.container.querySelector("[role='status']")?.textContent).toBe("1 / 3件");
    expect(option("長さ", "〜4小節").disabled).toBe(true);

    await act(async () => buttonByText(filters, "すべて解除")!.click());
    expect(view.container.querySelectorAll(".lv-vault-row")).toHaveLength(3);
    expect(view.container.querySelector("[role='status']")?.textContent).toBe("3件");

    await act(async () => buttonByText(filters, "お気に入り")!.click());
    expect(rowNames(view.container)).toEqual(["Alpha"]);
    await view.unmount();
  });

  it("finds a degree flow from each progression's key and highlights the match", async () => {
    const view = await renderVault({
      ideas: [
        makeIdea({ id: "two-five", title: "Two five", progressionBlocks: [chordBlock("tf", ["Em", "Dm7", "G7", "Cmaj7"], { detectedKey: "C" })] }),
        makeIdea({ id: "keyless", title: "Keyless", progressionBlocks: [chordBlock("kl", ["Dm7", "G7", "Cmaj7"])] }),
      ],
    });
    const search = view.container.querySelector<HTMLInputElement>("#vault-search")!;
    expect(search.placeholder).toBe("コード名か度数（2-5-1）で探す");
    await setInputValue(search, "2-5-1");
    expect(rowNames(view.container)).toEqual(["Two five"]);
    expect(view.container.querySelector("[data-testid='vault-degree-match']")?.textContent).toContain("ii7 → V7 → Imaj7（2〜4番目のコード）");
    expect([...view.container.querySelectorAll(".lv-vault-chip")].map((chip) => chip.getAttribute("data-match")))
      .toEqual(["false", "true", "true", "true"]);

    await setInputValue(search, "Dm7");
    expect(rowNames(view.container)).toEqual(["Two five", "Keyless"]);
    await view.unmount();
  });

  it("sorts by the four orders and remembers filters and sort for the session", async () => {
    const ideas = [
      makeIdea({ id: "long", title: "Bee", progressionBlocks: [chordBlock("l", ["C"], { lengthBars: 16, capturedAt: "2026-07-01T00:00:00.000Z", practice: { schemaVersion: 1, progressionFingerprint: "x", lastPracticedAt: "2026-07-20T00:00:00.000Z" } })] }),
      makeIdea({ id: "short", title: "Ant", progressionBlocks: [chordBlock("s", ["G"], { lengthBars: 4, capturedAt: "2026-07-10T00:00:00.000Z", pinned: true })] }),
    ];
    const view = await renderVault({ ideas });
    const sort = view.container.querySelector<HTMLSelectElement>("#vault-sort")!;
    expect([...sort.options].map((option) => option.textContent)).toEqual(["新しい順", "名前順", "長さ順", "最近練習した順"]);
    expect(rowNames(view.container)).toEqual(["Ant", "Bee"]);
    await setSelectValue(sort, "practiced");
    expect(rowNames(view.container)).toEqual(["Bee", "Ant"]);
    await setSelectValue(sort, "length");
    expect(rowNames(view.container)).toEqual(["Ant", "Bee"]);
    await act(async () => buttonByText(view.container.querySelector(".lv-vault-rail")!, "お気に入り")!.click());
    await view.unmount();

    expect(JSON.parse(window.sessionStorage.getItem(VAULT_LIBRARY_SESSION_KEY)!)).toMatchObject({ sort: "length", filters: { favorite: true } });
    const again = await renderVault({ ideas });
    expect(again.container.querySelector<HTMLSelectElement>("#vault-sort")!.value).toBe("length");
    expect(rowNames(again.container)).toEqual(["Ant"]);
    await again.unmount();
  });

  it("pins from the stored block array while another block is pending deletion", async () => {
    const pendingBlock = { ...progressionBlock, id: "pending-block" };
    const visibleBlock = { ...progressionBlock, id: "visible-block", pinned: false };
    const visibleIdea = makeIdea({ progressionBlocks: [visibleBlock] });
    const storedIdea = makeIdea({ id: visibleIdea.id, progressionBlocks: [pendingBlock, visibleBlock] });
    const updateIdea = vi.fn();
    const updateProgressionBlock = vi.fn();
    const view = await renderVault({ ideas: [visibleIdea], storedIdeas: [storedIdea], updateIdea, updateProgressionBlock });
    await act(async () => {
      view.container.querySelector<HTMLButtonElement>(`[aria-label="${appCopy.ja.library.addFavorite}"]`)?.click();
    });
    expect(updateProgressionBlock).toHaveBeenCalledWith(visibleIdea.id, visibleBlock.id, { pinned: true });
    expect(updateIdea).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("opens from the localized chevron without changing keyboard selection", async () => {
    const openProgression = vi.fn();
    const view = await renderVault({
      openProgression,
      ideas: [
        makeIdea({ id: "idea-first", title: "First", progressionBlocks: [{ ...progressionBlock, id: "block-first", capturedAt: "2026-07-16T00:00:00.000Z" }] }),
        makeIdea({ id: "idea-second", title: "Second", progressionBlocks: [{ ...progressionBlock, id: "block-second" }] }),
      ],
    });
    const openButtons = view.container.querySelectorAll<HTMLButtonElement>('[aria-label="進行を開く"]');
    expect(openButtons).toHaveLength(2);
    expect(openButtons[1].title).toBe("進行を開く");
    await act(async () => openButtons[1].click());
    expect(openProgression).toHaveBeenLastCalledWith("idea-second", "block-second");

    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(openProgression).toHaveBeenCalledTimes(2);
    expect(openProgression).toHaveBeenLastCalledWith("idea-first", "block-first");
    await view.unmount();
  });

  it("opens from the name, Enter, double-click and the chevron without duplicate activation", async () => {
    const idea = makeIdea({ id: "idea-shortcuts", progressionBlocks: [progressionBlock] });
    const openProgression = vi.fn();
    const view = await renderVault({ ideas: [idea], openProgression });

    const name = view.container.querySelector<HTMLButtonElement>(".lv-vault-progression")!;
    await act(async () => name.click());
    expect(openProgression).toHaveBeenCalledTimes(1);
    expect(openProgression).toHaveBeenLastCalledWith(idea.id, progressionBlock.id);

    openProgression.mockClear();
    name.focus();
    await act(async () => {
      name.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(openProgression).toHaveBeenCalledTimes(1);

    openProgression.mockClear();
    await act(async () => {
      view.container.querySelector(".lv-vault-row")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(openProgression).toHaveBeenCalledTimes(1);

    openProgression.mockClear();
    const openButton = view.container.querySelector<HTMLButtonElement>('[aria-label="進行を開く"]')!;
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
    await view.unmount();
  });

  it("labels row actions in Japanese and keeps selection when favorite and copy are clicked", async () => {
    const firstIdea = makeIdea({ id: "idea-selected", progressionBlocks: [{ ...progressionBlock, id: "block-selected", capturedAt: "2026-07-16T00:00:00.000Z" }] });
    const secondIdea = makeIdea({ id: "idea-actions", progressionBlocks: [{ ...progressionBlock, id: "block-actions", pinned: false }] });
    const openDetail = vi.fn();
    const updateProgressionBlock = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const view = await renderVault({ ideas: [firstIdea, secondIdea], openDetail, updateProgressionBlock });

    expect(view.container.querySelector('label[for="vault-search"]')?.textContent).toContain("進行を検索");
    expect(view.container.querySelector('label[for="vault-sort"]')?.textContent).toContain("並び順");
    expect(view.container.querySelector('[role="status"][aria-live="polite"]')?.textContent).toBe("2件");
    const favorite = view.container.querySelectorAll<HTMLButtonElement>(`[aria-label="${appCopy.ja.library.addFavorite}"]`)[1]!;
    const copyButton = view.container.querySelectorAll<HTMLButtonElement>(`[aria-label="${appCopy.ja.library.copyProgression}"]`)[1]!;
    expect(favorite.title).toBe(appCopy.ja.library.addFavorite);
    expect(copyButton.title).toBe(appCopy.ja.library.copyProgression);
    await act(async () => {
      favorite.click();
      copyButton.click();
    });
    expect(updateProgressionBlock).toHaveBeenCalledWith(secondIdea.id, "block-actions", { pinned: true });
    expect(writeText).toHaveBeenCalledWith("| Cmaj7 |");

    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(openDetail).toHaveBeenLastCalledWith(firstIdea.id);
    await view.unmount();
  });

  it("shows name, key, BPM, bars, date, source and tags in the row", async () => {
    const idea = makeIdea({
      id: "idea-metadata",
      title: "Night bridge",
      key: "C major",
      bpm: 108,
      progressionBlocks: [{ ...progressionBlock, id: "block-metadata", detectedKey: "D minor", bpm: 124, lengthBars: 4, tags: ["bridge", "bright"] }],
    });
    const view = await renderVault({ ideas: [idea], showRomanNumerals: true });
    const row = view.container.querySelector<HTMLElement>(".lv-vault-row")!;
    expect(row.getAttribute("data-compact")).toBe("false");
    expect(row.classList.contains("min-h-24")).toBe(true);
    expect(row.querySelector(".lv-vault-progression")?.getAttribute("aria-current")).toBe("true");
    expect(row.querySelector(".lv-vault-progression-primary")?.textContent).toBe("Night bridge");
    expect(row.querySelector(".lv-vault-progression-secondary")?.textContent).toBe("Dマイナー · BPM 124 · 4小節 · 7月15日 · MIDI");
    expect(row.querySelector(".lv-vault-tags")?.textContent).toContain("bridge");
    expect(row.querySelector(".lv-vault-tags")?.textContent).toContain("bright");
    expect(row.querySelector(".lv-vault-chip")?.textContent).toBe("Cmaj7♭VIImaj7");
    await view.unmount();
  });

  it("shows only the first eight chords while keeping later chords searchable", async () => {
    const longProgression = {
      ...progressionBlock,
      id: "block-long-preview",
      chords: Array.from({ length: 10 }, (_, index) => ({
        ...progressionBlock.chords[0],
        bar: index + 1,
        chord: { ...progressionBlock.chords[0].chord, label: index === 9 ? "HiddenChord10" : `Chord${index + 1}` },
      })),
    };
    const view = await renderVault({ ideas: [makeIdea({ id: "idea-long-preview", progressionBlocks: [longProgression] })] });
    const chips = () => [...view.container.querySelectorAll(".lv-vault-chip")].map((chip) => chip.textContent);
    expect(chips()).toEqual(["Chord1", "Chord2", "Chord3", "Chord4", "Chord5", "Chord6", "Chord7", "Chord8"]);
    expect(view.container.querySelector(".lv-vault-chip-more")).not.toBeNull();

    await setInputValue(view.container.querySelector<HTMLInputElement>("#vault-search")!, "HiddenChord10");
    expect(view.container.querySelectorAll(".lv-vault-row")).toHaveLength(1);
    expect(chips()).toHaveLength(8);
    await view.unmount();
  });

  it("uses the shared preview sound for Vault playback", async () => {
    const toggle = vi.spyOn(playbackController, "toggle").mockResolvedValue(undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PreviewSoundProvider>
          <GlobalPreviewSoundSelector copy={appCopy.ja} />
          <VaultView
            ideas={[makeIdea({ progressionBlocks: [progressionBlock] })]}
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
    await act(async () => container.querySelector<HTMLButtonElement>('button[data-preview-sound="electric-piano"]')?.click());
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="試聴"]')?.click());
    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ kind: "vault" }), expect.objectContaining({ sound: "electric-piano" }));
    await act(async () => root.unmount());
  });

  it("uses localized copy failure text when the Clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const setToast = vi.fn();
    const view = await renderVault({ ideas: [makeIdea({ progressionBlocks: [progressionBlock] })], setToast });
    await act(async () => {
      view.container.querySelector<HTMLButtonElement>(`[aria-label="${appCopy.ja.library.copyProgression}"]`)?.click();
    });
    expect(setToast).toHaveBeenLastCalledWith(appCopy.ja.library.copyFailed);
    await view.unmount();
  });

  it("keeps the search while filtering by a Smart Library tag", async () => {
    const plain = { ...progressionBlock, id: "plain", sourceFileName: "plain.mid" };
    const slash = {
      ...progressionBlock,
      id: "slash",
      sourceFileName: "slash.mid",
      chords: [{ ...progressionBlock.chords[0], chord: { ...progressionBlock.chords[0].chord, bass: 4, label: "Cmaj7/E" } }],
    };
    const view = await renderVault({ ideas: [makeIdea({ id: "idea-library", title: "Library search", progressionBlocks: [plain, slash] })] });
    const search = view.container.querySelector<HTMLInputElement>("#vault-search")!;
    await setInputValue(search, "Library");
    expect(view.container.querySelectorAll(".lv-vault-row")).toHaveLength(2);
    await act(async () => buttonByText(view.container.querySelector(".lv-vault-rail section[aria-label='タグ']")!, "分数コード")!.click());
    expect(search.value).toBe("Library");
    expect(view.container.querySelectorAll(".lv-vault-row")).toHaveLength(1);
    expect(view.container.querySelector(".lv-vault-chip")?.textContent).toBe("Cmaj7/E");
    await view.unmount();
  });

  it("virtualizes 1000 progression rows without mounting every card", async () => {
    const blocks = Array.from({ length: 1000 }, (_, index) => ({ ...progressionBlock, id: `block-${index}` }));
    const view = await renderVault({ ideas: [makeIdea({ id: "idea-large", progressionBlocks: blocks })] });
    expect(view.container.querySelector("[data-virtualized='true']")?.getAttribute("data-row-height")).toBe("96");
    const compactRow = view.container.querySelector<HTMLElement>(".lv-vault-row")!;
    expect(compactRow.getAttribute("data-compact")).toBe("true");
    expect(compactRow.classList.contains("h-24")).toBe(true);
    expect(compactRow.classList.contains("overflow-hidden")).toBe(true);
    expect(compactRow.querySelector(".lv-vault-progression-primary")?.classList.contains("truncate")).toBe(true);
    expect(compactRow.querySelector(".lv-vault-progression")?.getAttribute("title")).toContain("Cmaj7");
    expect(view.container.querySelectorAll(".lv-vault-row").length).toBeLessThan(100);
    expect(view.container.textContent).toContain("1000件");
    await view.unmount();
  });
});

async function setInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function setSelectValue(select: HTMLSelectElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    valueSetter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
