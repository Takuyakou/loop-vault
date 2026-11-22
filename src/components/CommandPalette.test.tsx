// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeIdea } from "../domain/testFactory";
import type { ChordQuality, SavedProgressionBlock } from "../domain/types";
import type { PaletteCommand } from "../features/command-palette/paletteModel";
import { buildVaultRows } from "../views/vault/vaultLibrary";
import { CommandPalette } from "./CommandPalette";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let mountedRoot: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (mountedRoot) await act(async () => mountedRoot?.unmount());
  host?.remove();
  mountedRoot = undefined;
  host = undefined;
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

const pc: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function chord(label: string, bar: number) {
  const quality: ChordQuality = label.includes("maj7") ? "maj7" : label.includes("m7") ? "min7" : label.endsWith("7") ? "dom7" : label.endsWith("m") ? "min" : "maj";
  return { bar, beat: 1, durationBeats: 4, confidence: 1, alternatives: [], warnings: [], chord: { root: pc[label[0]], quality, tensions: [], label } };
}
function block(id: string, labels: string[], extra: Partial<SavedProgressionBlock> = {}): SavedProgressionBlock {
  return { id, summaryText: labels.join(" "), chords: labels.map((label, index) => chord(label, index + 1)), tags: [], capturedAt: "2026-09-10T00:00:00.000Z", analyzerVersion: "t", ...extra };
}

const rows = buildVaultRows([makeIdea({
  id: "night",
  title: "夜のループ",
  progressionBlocks: [block("night-1", ["Dm7", "G7", "Cmaj7", "A7"], { detectedKey: "C" })],
})]);

const homeRun = vi.fn();
const voicingRun = vi.fn();
const settingsRun = vi.fn();
const vaultSearchRun = vi.fn();
const commands: PaletteCommand[] = [
  { id: "home", group: "screen", title: "ホーム", keywords: "home", frequent: true, run: homeRun },
  { id: "voicing-loop", group: "screen", title: "Voicing Loop", frequent: true, run: voicingRun },
  { id: "settings", group: "screen", title: "設定", keywords: "settings せってい", run: settingsRun },
  { id: "vault-search", group: "action", title: "Vault で探す", keywords: "search 検索", frequent: true, run: vaultSearchRun },
];

function props(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    rows,
    commands,
    onOpenProgression: vi.fn(),
    onPracticeProgression: vi.fn(),
    ...overrides,
  } as Parameters<typeof CommandPalette>[0];
}

const input = () => document.querySelector<HTMLInputElement>('[data-testid="command-palette-input"]');
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
const selected = () => options().find((option) => option.getAttribute("aria-selected") === "true");

describe("CommandPalette", () => {
  it("C1 draws nothing while it is closed", async () => {
    await mount(<CommandPalette {...props({ open: false })} />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("C2 opens a dialog with the caret in the search input", async () => {
    await mount(<CommandPalette {...props()} />);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(input()).not.toBeNull();
    expect(input()?.getAttribute("role")).toBe("combobox");
    expect(document.activeElement).toBe(input());
  });

  it("C3 lists the frequent commands with the first one chosen", async () => {
    await mount(<CommandPalette {...props()} />);
    expect(document.querySelector(".lv-palette-group")?.textContent).toBe("よく使う操作");
    expect(options().map((option) => option.textContent)).toEqual(["ホーム", "Voicing Loop", "Vault で探す"]);
    expect(selected()).toBe(options()[0]);
    expect(input()?.getAttribute("aria-activedescendant")).toBe(options()[0]?.id);
  });

  it("C4 walks with ↑ ↓ and wraps at both ends", async () => {
    await mount(<CommandPalette {...props()} />);
    await keyDown(input(), "ArrowDown");
    expect(selected()).toBe(options()[1]);
    await keyDown(input(), "ArrowUp");
    await keyDown(input(), "ArrowUp");
    expect(selected()).toBe(options()[2]);
  });

  it("C5 runs the chosen command and closes on Enter", async () => {
    const onClose = vi.fn();
    await mount(<CommandPalette {...props({ onClose })} />);
    await keyDown(input(), "Enter");
    expect(homeRun).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("C6 opens a progression with Enter", async () => {
    const onOpenProgression = vi.fn();
    const onPracticeProgression = vi.fn();
    await mount(<CommandPalette {...props({ onOpenProgression, onPracticeProgression })} />);
    await type("夜");
    await keyDown(input(), "Enter");
    expect(onOpenProgression).toHaveBeenCalledWith("night", "night-1");
    expect(onPracticeProgression).not.toHaveBeenCalled();
  });

  it("C7 opens the same progression in Voicing Loop with Ctrl+Enter", async () => {
    const onOpenProgression = vi.fn();
    const onPracticeProgression = vi.fn();
    await mount(<CommandPalette {...props({ onOpenProgression, onPracticeProgression })} />);
    await type("夜");
    await keyDown(input(), "Enter", { ctrlKey: true });
    expect(onPracticeProgression).toHaveBeenCalledWith("night", "night-1");
    expect(onOpenProgression).not.toHaveBeenCalled();
  });

  it("C8 clicks like Enter and keeps the caret in the input", async () => {
    const onOpenProgression = vi.fn();
    const onClose = vi.fn();
    await mount(<CommandPalette {...props({ onOpenProgression, onClose })} />);
    await type("夜");
    const option = options()[0]!;
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => option.dispatchEvent(mouseDown));
    expect(mouseDown.defaultPrevented).toBe(true);
    await act(async () => option.click());
    expect(onOpenProgression).toHaveBeenCalledWith("night", "night-1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("C9 says nothing was found and keeps Enter quiet", async () => {
    const onClose = vi.fn();
    await mount(<CommandPalette {...props({ onClose })} />);
    await type("zzz");
    expect(document.querySelector('[data-testid="command-palette-none"]')?.textContent)
      .toContain("見つかりません");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(input()?.getAttribute("aria-expanded")).toBe("false");
    expect(input()?.hasAttribute("aria-controls")).toBe(false);
    await keyDown(input(), "Enter");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("C10 goes back to the first item when the text changes", async () => {
    await mount(<CommandPalette {...props()} />);
    await keyDown(input(), "ArrowDown");
    expect(selected()).toBe(options()[1]);
    await type("s");
    expect(options().length).toBeGreaterThan(1);
    expect(selected()).toBe(options()[0]);
  });

  it("C11 closes on Escape", async () => {
    const onClose = vi.fn();
    await mount(<CommandPalette {...props({ onClose })} />);
    await keyDown(input(), "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("C12 starts with an empty input every time it opens", async () => {
    await mount(<CommandPalette {...props()} />);
    await type("夜");
    expect(input()?.value).toBe("夜");
    await act(async () => mountedRoot?.render(<CommandPalette {...props({ open: false })} />));
    await act(async () => mountedRoot?.render(<CommandPalette {...props()} />));
    expect(input()?.value).toBe("");
  });
});

async function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  mountedRoot = createRoot(host);
  await act(async () => mountedRoot?.render(node));
}

async function keyDown(
  target: Element | null | undefined,
  key: string,
  options: KeyboardEventInit = {},
) {
  await act(async () => target?.dispatchEvent(new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ...options,
  })));
}

async function type(text: string) {
  const field = input();
  if (!field) throw new Error("the palette input is not there");
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
