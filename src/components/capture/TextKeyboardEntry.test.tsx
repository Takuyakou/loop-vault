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
    onConvert={vi.fn()} onPreview={vi.fn()} onStop={vi.fn()} onSaveExtended={onSaveExtended} />));
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

const inputOf = (harness: Harness) => harness.container.querySelector<HTMLTextAreaElement>('[data-testid="text-progression-input"]')!;

describe("P24-06 鍵盤で入れる", () => {
  it("turns on the band, shows the connection state, opens the shared panel and makes one piano part", async () => {
    const original = defaultLiveMidiStore.getState();
    const harness = await mount();
    try {
      expect(query(harness.container, "keyboard-entry-band")).toBeNull();
      await click(query<HTMLButtonElement>(harness.container, "text-keyboard-toggle"));
      expect(query(harness.container, "keyboard-entry-band")).not.toBeNull();
      expect(harness.container.textContent).toContain("つながっていません");
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
      const band = query(harness.container, "keyboard-entry-band");
      // fix-2 item 5: no 「押さえている」 word; the keyboard's aria-label still describes the held notes.
      expect(band?.textContent).not.toContain("押さえている");
      expect(band?.querySelector("svg")?.getAttribute("aria-label")).toContain("押さえている音");
      // fix-2 item 1: the only card is this one, so its small mark is hidden; the chosen row still says it.
      expect(query(harness.container, "text-preview-band")?.querySelector('[data-testid="text-progression-voicing-state"]')).toBeNull();
      expect(query(harness.container, "text-progression-inspector-row")?.textContent).toContain("鍵盤で弾いた音");
      expect(query(harness.container, "text-progression-inspector-row")?.textContent).toContain("Cmaj7");
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
