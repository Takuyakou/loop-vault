// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeChordSymbol } from "../domain/chords";
import type { LiveChordHistoryEntry } from "../domain/liveMidi";
import { makeIdea } from "../domain/testFactory";
import { appCopy } from "../i18n";
import { LiveMidiImportDialog, liveMidiImportTitle, type LiveMidiImportRequest } from "./LiveMidiImportDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
});

const entry = (index: number, notes: number[] = []): LiveChordHistoryEntry => ({
  id: `h${index}`,
  chord: makeChordSymbol(0, "maj"),
  label: `C${index}`,
  notes,
  startedAtMs: index,
  committedAtMs: index,
});

const history = Array.from({ length: 10 }, (_, index) => entry(index + 1, index === 2 ? [60, 64, 67] : []));
const idea = makeIdea({ id: "idea-1", title: "夜のループ", progressionBlocks: [] });

function controller() {
  return { play: vi.fn(async () => undefined), toggle: vi.fn(async () => undefined), stop: vi.fn() };
}

async function mount(options: {
  items?: readonly LiveChordHistoryEntry[];
  ideas?: readonly typeof idea[];
  onCancel?: () => void;
  onContinue?: () => void;
  onSave?: (request: LiveMidiImportRequest) => void;
} = {}) {
  const playback = controller();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(
    <LiveMidiImportDialog
      history={options.items ?? history}
      ideas={options.ideas ?? [idea]}
      copy={appCopy.ja.liveMidi}
      onCancel={options.onCancel ?? vi.fn()}
      onContinue={options.onContinue ?? vi.fn()}
      onSave={options.onSave ?? vi.fn()}
      controller={playback}
    />,
  ));
  return { playback, container: host };
}

const chords = () => [...document.querySelectorAll<HTMLButtonElement>(".lv-live-import-chord")];
const summary = () => document.querySelector("[data-testid='live-midi-import-summary']")?.textContent?.trim();
const titleInput = () => document.querySelector<HTMLInputElement>("[data-testid='live-midi-import-title-input']")!;
const saveButton = () => document.querySelector<HTMLButtonElement>("[data-testid='live-midi-import-save']")!;

async function press(index: number) {
  await act(async () => chords()[index]?.click());
}
async function click(testId: string) {
  await act(async () => document.querySelector<HTMLButtonElement>(`[data-testid='${testId}']`)?.click());
}
async function editTitle(value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(titleInput(), value);
    titleInput().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("the Live MIDI save dialog (P23-19)", () => {
  it("D1 starts with the whole range, its count and a name from the first chords", async () => {
    await mount();
    expect(summary()).toBe("1〜10 番 ・ 10 小節");
    expect(saveButton().textContent).toContain("10 小節を Vault へ保存");
    expect(chords()).toHaveLength(10);
    expect(chords().every((button) => button.getAttribute("aria-pressed") === "true")).toBe(true);
    expect(titleInput().value).toBe("C1 - C2 - C3 - C4");
    expect(document.querySelector<HTMLInputElement>("input[name='live-midi-import-target'][value='new']")?.checked).toBe(true);
  });

  it("D2 the first press starts a one-chord range and sounds it", async () => {
    const { playback } = await mount();
    await press(2);
    expect(summary()).toBe("3〜3 番 ・ 1 小節");
    expect(chords()[2]?.getAttribute("data-anchor")).toBe("true");
    expect(document.querySelector(".lv-live-import-hint")?.textContent).toBe("次に、終わりのコードを押します。");
    expect(playback.play).toHaveBeenCalledTimes(1);
    const [, options] = playback.play.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(options.type).toBe("chord");
    expect(options.explicitMidiNotes).toEqual([60, 64, 67]);
  });

  it("D3 the second press closes the range and renames the song", async () => {
    await mount();
    await press(2);
    await press(6);
    expect(summary()).toBe("3〜7 番 ・ 5 小節");
    expect(document.querySelector("[data-anchor]")).toBeNull();
    expect(titleInput().value).toBe("C3 - C4 - C5 - C6");
    expect(chords()[2]?.getAttribute("data-edge")).toBe("start");
    expect(chords()[6]?.getAttribute("data-edge")).toBe("end");
    for (const index of [0, 1, 7, 8, 9]) {
      expect(chords()[index]?.getAttribute("aria-pressed"), `${index + 1}`).toBe("false");
    }
  });

  it("D4 the range works in either order", async () => {
    await mount();
    await press(6);
    await press(2);
    expect(summary()).toBe("3〜7 番 ・ 5 小節");
  });

  it("D5 a chord without recorded notes sounds without explicit notes", async () => {
    const { playback } = await mount();
    await press(3);
    const [, options] = playback.play.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect("explicitMidiNotes" in options).toBe(false);
  });

  it("D6 the three shortcuts set the end of the range", async () => {
    await mount();
    await click("live-midi-import-last-4");
    expect(summary()).toBe("7〜10 番 ・ 4 小節");
    await click("live-midi-import-last-8");
    expect(summary()).toBe("3〜10 番 ・ 8 小節");
    await click("live-midi-import-all");
    expect(summary()).toBe("1〜10 番 ・ 10 小節");
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
    await mount({ items: [entry(1), entry(2), entry(3)] });
    await click("live-midi-import-last-4");
    expect(summary()).toBe("1〜3 番 ・ 3 小節");
  });

  it("D7 keeps a name the player wrote", async () => {
    await mount();
    await editTitle("自分の名前");
    await click("live-midi-import-last-4");
    expect(titleInput().value).toBe("自分の名前");
  });

  it("D8 saves the chosen range under the trimmed name", async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await press(2);
    await press(6);
    await editTitle("  夜  ");
    await act(async () => saveButton().click());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ startIndex: 2, endIndex: 7, newIdeaTitle: "夜" });
  });

  it("D9 can add the range to a song already in the Vault", async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await act(async () => document.querySelector<HTMLInputElement>("input[name='live-midi-import-target'][value='existing']")?.click());
    const select = document.querySelector<HTMLSelectElement>("[data-testid='live-midi-import-idea']")!;
    expect(select.disabled).toBe(false);
    expect(titleInput().disabled).toBe(true);
    await act(async () => saveButton().click());
    expect(onSave).toHaveBeenCalledWith({ startIndex: 0, endIndex: 10, ideaId: "idea-1" });
  });

  it("D10 refuses a blank name, and hides the song picker when the Vault is empty", async () => {
    await mount();
    await editTitle("   ");
    expect(saveButton().disabled).toBe(true);
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
    await mount({ ideas: [] });
    expect(document.querySelector("[data-testid='live-midi-import-idea']")).toBeNull();
  });

  it("D11 plays the chosen range at the app-wide BPM", async () => {
    const { playback } = await mount();
    await click("live-midi-import-listen");
    expect(playback.toggle).toHaveBeenCalledTimes(1);
    const [, options] = playback.toggle.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(options.type).toBe("timeline");
    expect((options.timeline as unknown[]).length).toBe(10);
    expect(options.beatsPerBar).toBe(4);
    expect(typeof options.bpm).toBe("number");
  });

  it("D12 Esc keeps the chords, the discard throws them away, the backdrop does nothing", async () => {
    const onCancel = vi.fn();
    const onContinue = vi.fn();
    await mount({ onCancel, onContinue });
    await click("live-midi-import-discard");
    expect(onCancel).toHaveBeenCalledTimes(1);
    await click("live-midi-import-continue");
    expect(onContinue).toHaveBeenCalledTimes(1);
    await act(async () => document.querySelector("[role='dialog']")?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
    ));
    expect(onContinue).toHaveBeenCalledTimes(2);
    expect(onCancel).toHaveBeenCalledTimes(1);
    await act(async () => document.querySelector("[data-modal-backdrop]")?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true }),
    ));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(2);
  });

  it("D13 stops the sound when the dialog goes away", async () => {
    const { playback } = await mount();
    await act(async () => root?.unmount());
    root = undefined;
    expect(playback.stop).toHaveBeenCalled();
  });

  it("D14 names a new song with the first chords of the range, at most 80 characters", () => {
    const items = Array.from({ length: 10 }, (_, index) => entry(index + 1));
    expect(liveMidiImportTitle(items, 0, 9)).toBe("C1 - C2 - C3 - C4");
    expect(liveMidiImportTitle(items, 0, 1)).toBe("C1 - C2");
    expect(liveMidiImportTitle(items, 8, 9)).toBe("C9 - C10");
    const long = Array.from({ length: 4 }, (_, index) => ({ ...entry(index + 1), label: "L".repeat(40) }));
    expect(liveMidiImportTitle(long, 0, 3)).toHaveLength(80);
  });
});
