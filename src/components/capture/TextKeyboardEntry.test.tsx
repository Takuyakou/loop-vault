// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const pianoMonitor = vi.hoisted(() => {
  const updateNotes = vi.fn();
  const stop = vi.fn();
  const dispose = vi.fn();
  return { updateNotes, stop, dispose, create: vi.fn(async () => ({ updateNotes, stop, dispose })) };
});
vi.mock("../../audio/midiInputPianoMonitor", () => ({ createMidiInputPianoMonitor: pianoMonitor.create }));

import { TextProgressionCapturePanel } from "./TextProgressionCapturePanel";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import { midiPanelStore, closeMidiPanel } from "../../liveMidi/midiPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  readonly container: HTMLElement;
  readonly onSaveExtended: ReturnType<typeof vi.fn>;
  unmount(): Promise<void>;
}

async function mount(): Promise<Harness> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onSaveExtended = vi.fn(() => true);
  await act(async () => root.render(<TextProgressionCapturePanel showRomanNumerals={false}
    onPreview={vi.fn()} onStop={vi.fn()} onSaveExtended={onSaveExtended} />));
  return {
    container,
    onSaveExtended,
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
}

function query<T extends Element>(container: HTMLElement, id: string): T | null {
  return container.querySelector<T>(`[data-testid="${id}"]`);
}

/** The synthetic keyboard: held notes go into the live store, exactly as the real input writes them. */
async function hold(notes: readonly number[]) {
  await act(async () => {
    defaultLiveMidiStore.setState({
      notes: {
        held: new Map(notes.map((note) => [`0:${note}`, { count: 1, velocity: 100, sinceMs: 0, lastEventMs: 0 }])),
        sustained: new Set(),
        pedalByChannel: new Map(),
      },
    });
  });
}
async function release() { await hold([]); }
async function click(element: HTMLElement | null) {
  if (element === null) throw new Error("element missing");
  await act(async () => element.click());
}
async function writeTextarea(element: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  });
}

/** P25-05 D: a key pressed on the page (the band listens on the document). */
async function press(key: string, options: KeyboardEventInit = {}) {
  await act(async () => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
  });
}

const inputOf = (harness: Harness) => harness.container.querySelector<HTMLTextAreaElement>('[data-testid="text-progression-input"]')!;

describe("P24-06 鍵盤で入れる", () => {
  it("turns on the band, shows the connection state, opens the shared panel and makes one piano part", async () => {
    const original = defaultLiveMidiStore.getState();
    const harness = await mount();
    try {
      expect(query(harness.container, "keyboard-entry-band")).toBeNull();
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      expect(query(harness.container, "keyboard-entry-band")).not.toBeNull();
      expect(harness.container.textContent).toContain("MIDI 未接続");
      await click(query<HTMLButtonElement>(harness.container, "keyboard-connect"));
      expect(midiPanelStore.getState().open).toBe(true);
      closeMidiPanel();
      expect(pianoMonitor.create).toHaveBeenCalledTimes(1);
      // One piano part for the whole entry; turning it off tidies it up.
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      expect(pianoMonitor.dispose).toHaveBeenCalled();
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({ active: original.active, notes: original.notes });
    }
  });

  it("adds one bar from the keys released one at a time, with the played sound on the card", async () => {
    const original = defaultLiveMidiStore.getState();
    const harness = await mount();
    try {
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      await hold([48, 52, 55, 59]);
      await hold([48, 52, 55]);
      await hold([48, 52]);
      await release();
      expect(inputOf(harness).value).toBe("| Cmaj7 |");
      // fix-2 item 5: no 「押さえている」 word; the keyboard's aria-label still describes the held notes.
      // V20: the held chord's place stays, with 「—」 while nothing is held.
      expect(query(harness.container, "keyboard-held-name")?.textContent).toBe("—");
      expect(query(harness.container, "keyboard-keys")?.getAttribute("aria-label")).toContain("押さえている音");
      // P25-03 C10: the card's dots say where the sound came from (the band stays away while the entry is on).
      const card = query<HTMLElement>(harness.container, "text-preview-band");
      expect(card?.getAttribute("title")).toBe("Cmaj7 · 鍵盤で弾いた音");
      expect([...card!.querySelectorAll<HTMLElement>('[data-testid="text-card-dot"]')].map((dot) => Number(dot.dataset.note))).toEqual([48, 52, 55, 59]);
      expect(harness.container.querySelector('[data-testid="text-card-dock"]')).toBeNull();
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({ active: original.active, notes: original.notes });
    }
  });

  it("keeps the open bar out of the text, shows it in the preview, and closes it with = when turned off", async () => {
    const original = defaultLiveMidiStore.getState();
    const harness = await mount();
    try {
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      await click(query<HTMLButtonElement>(harness.container, "keyboard-length-2"));
      await hold([48, 52, 55, 59]);
      await release();
      expect(inputOf(harness).value).toBe("");
      expect(query(harness.container, "text-pending-bar")?.textContent).toContain("Cmaj7");
      expect(harness.container.querySelector('[data-testid="text-preview-band"][data-pending="true"]')).not.toBeNull();
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      expect(inputOf(harness).value).toBe("| Cmaj7 = = = |");
      expect(query(harness.container, "text-pending-bar")).toBeNull();
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({ active: original.active, notes: original.notes });
    }
  });

  it("fills a whole added rest with _", async () => {
    const original = defaultLiveMidiStore.getState();
    const harness = await mount();
    try {
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      // The design's 1-bar rest fills the bar at once: `_` in every cell.
      await click(query<HTMLButtonElement>(harness.container, "keyboard-rest"));
      expect(inputOf(harness).value).toBe("| _ _ _ _ |");
      expect(query(harness.container, "text-pending-bar")).toBeNull();
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({ active: original.active, notes: original.notes });
    }
  });

  it("limits the lengths by the open bar and hides 2 拍 for an odd numerator", async () => {
    const original = defaultLiveMidiStore.getState();
    const harness = await mount();
    try {
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      await click(query<HTMLButtonElement>(harness.container, "keyboard-length-1"));
      await hold([48, 52, 55, 59]);
      await release();
      expect(query<HTMLButtonElement>(harness.container, "keyboard-length-bar")?.disabled).toBe(true);
      expect(query<HTMLButtonElement>(harness.container, "keyboard-length-2")?.disabled).toBe(false);
      expect(query<HTMLButtonElement>(harness.container, "keyboard-length-1")?.disabled).toBe(false);
      // Fill two more beats: only 1 拍 is left for the last beat.
      await click(query<HTMLButtonElement>(harness.container, "keyboard-length-2"));
      await hold([50, 53, 57, 60]);
      await release();
      expect(query<HTMLButtonElement>(harness.container, "keyboard-length-bar")?.disabled).toBe(true);
      expect(query<HTMLButtonElement>(harness.container, "keyboard-length-2")?.disabled).toBe(true);
      expect(query<HTMLButtonElement>(harness.container, "keyboard-length-1")?.disabled).toBe(false);
      await act(async () => {
        harness.container.querySelector<HTMLButtonElement>('[data-testid="text-progression-meter"]')!.click();
      });
      await act(async () => {
        harness.container.querySelector<HTMLElement>('[data-testid="text-progression-meter-list"] [data-value="3/4"]')!.click();
      });
      expect(query(harness.container, "keyboard-length-2")).toBeNull();
      expect(query(harness.container, "keyboard-length-bar")).not.toBeNull();
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({ active: original.active, notes: original.notes });
    }
  });

  it("takes the last chord back with 1 つ戻す, and a manual edit closes that door", async () => {
    const original = defaultLiveMidiStore.getState();
    const harness = await mount();
    try {
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      await click(query<HTMLButtonElement>(harness.container, "keyboard-length-2"));
      await hold([48, 52, 55, 59]);
      await release();
      await hold([50, 53, 57, 60]);
      await release();
      expect(inputOf(harness).value).toBe("| Cmaj7 Dm7 |");
      await click(query<HTMLButtonElement>(harness.container, "keyboard-undo"));
      expect(inputOf(harness).value).toBe("");
      expect(query(harness.container, "text-pending-bar")?.textContent).toContain("Cmaj7");
      await click(query<HTMLButtonElement>(harness.container, "keyboard-undo"));
      expect(inputOf(harness).value).toBe("");
      expect(query(harness.container, "text-pending-bar")).toBeNull();
      expect(query<HTMLButtonElement>(harness.container, "keyboard-undo")?.disabled).toBe(true);
      await hold([48, 52, 55, 59]);
      await release();
      await writeTextarea(inputOf(harness), "| Cmaj7 |");
      expect(query<HTMLButtonElement>(harness.container, "keyboard-undo")?.disabled).toBe(true);
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({ active: original.active, notes: original.notes });
    }
  });

  it("P25-05 D: 1/2/3 pick the length, 0 adds a rest, Backspace takes one back and Esc stops", async () => {
    const original = defaultLiveMidiStore.getState();
    const harness = await mount();
    try {
      const toggle = query<HTMLButtonElement>(harness.container, "text-keyboard-toggle")!;
      // Turning the entry on keeps the focus on its own button (never moves it into the input).
      toggle.focus();
      await click(toggle);
      expect(document.activeElement).toBe(toggle);
      (document.activeElement as HTMLElement | null)?.blur();
      const pressed = (value: string) =>
        query<HTMLButtonElement>(harness.container, `keyboard-length-${value}`)?.getAttribute("aria-pressed");
      await press("2");
      expect(pressed("2")).toBe("true");
      await press("3");
      expect(pressed("1")).toBe("true");
      await press("1");
      expect(pressed("bar")).toBe("true");
      // 0 fills the open bar with rests at the chosen length.
      await press("0");
      expect(inputOf(harness).value).toBe("| _ _ _ _ |");
      // Backspace takes one step back instead of deleting a card.
      await press("Backspace");
      expect(inputOf(harness).value).toBe("");
      await hold([48, 52, 55, 59]);
      await release();
      expect(inputOf(harness).value).toBe("| Cmaj7 |");
      await press("Backspace");
      expect(inputOf(harness).value).toBe("");
      expect(query(harness.container, "text-preview-band")).toBeNull();
      // Esc leaves the entry.
      await press("Escape");
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
      expect(query(harness.container, "keyboard-entry-band")).toBeNull();
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({ active: original.active, notes: original.notes });
    }
  });

  it("P25-05 D: a length the open bar cannot take is ignored, and the keys stay off in the input", async () => {
    const original = defaultLiveMidiStore.getState();
    const harness = await mount();
    try {
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      await press("3");
      await hold([48, 52, 55, 59]);
      await release();
      // Three beats are left, so 1 小節 (key 1) is disabled and pressing it changes nothing.
      expect(query<HTMLButtonElement>(harness.container, "keyboard-length-bar")?.disabled).toBe(true);
      await press("1");
      expect(query<HTMLButtonElement>(harness.container, "keyboard-length-1")?.getAttribute("aria-pressed")).toBe("true");
      // Two beats fit, so key 2 is taken; the last beat leaves only 1 拍.
      await press("2");
      expect(query<HTMLButtonElement>(harness.container, "keyboard-length-2")?.getAttribute("aria-pressed")).toBe("true");
      await press("3");
      // In an input the same keys do nothing.
      const input = inputOf(harness);
      input.focus();
      await press("0");
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe("");
      // An odd numerator has no 2 拍 at all, so key 2 has nothing to choose.
      input.blur();
      await act(async () => {
        harness.container.querySelector<HTMLButtonElement>('[data-testid="text-progression-meter"]')!.click();
      });
      await act(async () => {
        harness.container.querySelector<HTMLElement>('[data-testid="text-progression-meter-list"] [data-value="3/4"]')!.click();
      });
      expect(query(harness.container, "keyboard-length-2")).toBeNull();
      await press("2");
      expect(inputOf(harness).value).toBe("");
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({ active: original.active, notes: original.notes });
    }
  });

  it("P25-05 D: the band's buttons carry their key caps", async () => {
    const original = defaultLiveMidiStore.getState();
    const harness = await mount();
    try {
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      const caps = (id: string) => [...query(harness.container, id)!.querySelectorAll("kbd")].map((key) => key.textContent);
      expect(caps("keyboard-length-bar")).toEqual(["1"]);
      expect(caps("keyboard-length-2")).toEqual(["2"]);
      expect(caps("keyboard-length-1")).toEqual(["3"]);
      expect(caps("keyboard-rest")).toEqual(["0"]);
      expect(caps("keyboard-undo")).toEqual(["Back"]);
      expect(query(harness.container, "keyboard-undo")?.textContent).toBe("Back戻す");
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({ active: original.active, notes: original.notes });
    }
  });

  it("V20: もう一度 (R) adds the chord before as `%`, the same as typing `%`; off with no chord before", async () => {
    const original = defaultLiveMidiStore.getState();
    const harness = await mount();
    const typed = await mount();
    try {
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      const repeat = () => query<HTMLButtonElement>(harness.container, "keyboard-repeat")!;
      expect(repeat().disabled).toBe(true);
      expect(repeat().textContent).toBe("Rもう一度");
      await press("r");
      expect(inputOf(harness).value).toBe("");
      // The held chord is named the way a card's notes are read again; the place stays while nothing is held.
      await hold([48, 52, 55, 58]);
      expect(query(harness.container, "keyboard-held-name")?.textContent).toBe("C7");
      expect(query(harness.container, "keyboard-held-notes")?.textContent).toBe("C3 · E3 · G3 · A♯3");
      expect(query(harness.container, "keyboard-keys")?.querySelectorAll("[data-held]").length).toBe(4);
      await release();
      expect(query(harness.container, "keyboard-held-name")?.textContent).toBe("—");
      expect(inputOf(harness).value).toBe("| C7 |");
      expect(repeat().disabled).toBe(false);
      await press("r");
      expect(inputOf(harness).value).toBe("| C7 | % |");
      // Two beats: the chord, then R in the same bar.
      await click(query<HTMLButtonElement>(harness.container, "keyboard-length-2"));
      await hold([50, 53, 57, 60]);
      await release();
      await click(repeat());
      expect(inputOf(harness).value).toBe("| C7 | % | Dm7 % |");
      await writeTextarea(inputOf(typed), "| C7 | % | Dm7 % |");
      const faces = (h: Harness) => [...h.container.querySelectorAll('[data-testid="text-preview-band"]')].map((card) => card.textContent);
      expect(faces(harness)).toEqual(faces(typed));
      // × closes it like Esc.
      await click(query<HTMLButtonElement>(harness.container, "keyboard-close"));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
      expect(query(harness.container, "keyboard-entry-band")).toBeNull();
      expect(query(harness.container, "text-keyboard-toggle")?.getAttribute("aria-pressed")).toBe("false");
    } finally {
      await harness.unmount();
      await typed.unmount();
      defaultLiveMidiStore.setState({ active: original.active, notes: original.notes });
    }
  });

  it("fix-1: two presses of the same chord keep their own keys in the save", async () => {
    const original = defaultLiveMidiStore.getState();
    const harness = await mount();
    try {
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      // The same chord twice, the second press with another top note.
      await hold([48, 52, 55, 59]);
      await release();
      await hold([60, 64, 67, 71]);
      await release();
      expect(inputOf(harness).value).toBe("| Cmaj7 | Cmaj7 |");
      await click(query<HTMLButtonElement>(harness.container, "text-progression-save"));
      expect(harness.onSaveExtended).toHaveBeenCalledOnce();
      const voicings = harness.onSaveExtended.mock.calls[0]?.[3] as {
        readonly byAttackBeat?: ReadonlyMap<number, { midiNotes?: number[] }>;
      };
      expect([...(voicings.byAttackBeat?.entries() ?? [])]).toEqual([
        [0, expect.objectContaining({ midiNotes: [48, 52, 55, 59] })],
        [4, expect.objectContaining({ midiNotes: [60, 64, 67, 71] })],
      ]);
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({ active: original.active, notes: original.notes });
    }
  });

  it("saves the keys played for each card", async () => {
    const original = defaultLiveMidiStore.getState();
    const harness = await mount();
    try {
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      await hold([48, 52, 55, 59]);
      await release();
      await click(query<HTMLButtonElement>(harness.container, "text-progression-save"));
      expect(harness.onSaveExtended).toHaveBeenCalledOnce();
      const voicings = harness.onSaveExtended.mock.calls[0]?.[3] as {
        readonly byAttackBeat?: ReadonlyMap<number, { midiNotes?: number[] }>;
      };
      expect(voicings.byAttackBeat?.size).toBe(1);
      expect([...(voicings.byAttackBeat?.values() ?? [])][0]?.midiNotes).toEqual([48, 52, 55, 59]);
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({ active: original.active, notes: original.notes });
    }
  });
});
