// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const pianoMonitor = vi.hoisted(() => {
  const updateNotes = vi.fn();
  const stop = vi.fn();
  const dispose = vi.fn();
  return {
    updateNotes,
    stop,
    dispose,
    create: vi.fn(async () => ({ updateNotes, stop, dispose })),
  };
});

vi.mock("../../audio/midiInputPianoMonitor", () => ({
  createMidiInputPianoMonitor: pianoMonitor.create,
}));

import { TextProgressionCapturePanel } from "./TextProgressionCapturePanel";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

type PanelProps = Parameters<typeof TextProgressionCapturePanel>[0];

interface Harness {
  readonly container: HTMLElement;
  readonly onConvert: ReturnType<typeof vi.fn>;
  readonly onPreview: ReturnType<typeof vi.fn>;
  readonly onStop: ReturnType<typeof vi.fn>;
  render(overrides?: Partial<PanelProps>): Promise<void>;
  unmount(): Promise<void>;
}

async function mount(overrides: Partial<PanelProps> = {}): Promise<Harness> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onConvert = vi.fn();
  const onPreview = vi.fn();
  const onStop = vi.fn();
  let props: PanelProps = {
    showRomanNumerals: true,
    onConvert,
    onPreview,
    onStop,
    ...overrides,
  };

  const harness: Harness = {
    container,
    onConvert,
    onPreview,
    onStop,
    async render(next = {}) {
      props = { ...props, ...next };
      await act(async () => {
        root.render(<TextProgressionCapturePanel {...props} />);
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
  await harness.render();
  return harness;
}

async function changeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype = element instanceof HTMLInputElement
    ? HTMLInputElement.prototype
    : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  });
}


async function changeSelect(element: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
}

function input(harness: Harness) {
  const element = harness.container.querySelector<HTMLTextAreaElement>(
    '[data-testid="text-progression-input"]',
  );
  expect(element).not.toBeNull();
  return element!;
}

function keyInput(harness: Harness) {
  const element = harness.container.querySelector<HTMLSelectElement>(
    '[data-testid="text-progression-key"]',
  );
  expect(element).not.toBeNull();
  return element!;
}

function bpmInput(harness: Harness) {
  const element = harness.container.querySelector<HTMLInputElement>(
    '[data-testid="text-progression-bpm"]',
  );
  expect(element).not.toBeNull();
  return element!;
}

function button(harness: Harness, testId: string) {
  const element = harness.container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  expect(element).not.toBeNull();
  return element!;
}

function buttonByText(harness: Harness, label: string) {
  const element = [...harness.container.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent === label || candidate.getAttribute("aria-label") === label);
  expect(element).toBeDefined();
  return element!;
}

describe("TextProgressionCapturePanel", () => {
  it("keeps one shared syntax switch without duplicating the app heading", async () => {
    const harness = await mount();
    try {
      const heading = () => [...harness.container.querySelectorAll("h2")].map(node => node.textContent);
      expect(heading()).toEqual([]);
      expect(harness.container.querySelectorAll('[data-testid="text-mode-standard"]')).toHaveLength(1);
      expect(harness.container.querySelector('[data-testid="text-progression-capture"]')?.getAttribute("data-text-dialect"))
        .toBe("standard");
      await act(async () => harness.container.querySelector<HTMLButtonElement>('[data-testid="text-mode-extended"]')?.click());
      expect(heading()).toEqual([]);
      expect(harness.container.querySelectorAll('[data-testid="text-mode-extended"]')).toHaveLength(1);
      expect(harness.container.querySelector('[data-testid="text-progression-capture"]')?.getAttribute("data-text-dialect"))
        .toBe("extended");
    } finally {
      await harness.unmount();
    }
  });

  it("renders accepted rest/hold cells honestly and converts an all-rest score without a chord inspector", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| Cmaj7 _ | % = |");
    expect(harness.container.querySelectorAll('[data-testid="text-preview-rest"]')).toHaveLength(1);
    expect(harness.container.querySelectorAll('[data-testid="text-preview-error"]')).toHaveLength(0);
    // P23-17 V3/V9: the hold (=) has no card of its own any more; the write rules in 「?」 say what it does.
    await click(harness.container.querySelector<HTMLButtonElement>('[data-testid="text-help"]')!);
    expect(harness.container.querySelector('[data-testid="text-help-face"]')?.textContent).toContain("= は再発音せず保持");
    await changeValue(input(harness), "| _ |");
    expect(harness.container.querySelector('[data-testid="text-progression-inspector"]')).toBeNull();
    // V11: a rest-only score has no card, but 「音を細かく直す」 stays (the all-rest path must not be lost).
    const convert = harness.container.querySelector<HTMLButtonElement>('[data-testid="text-progression-convert"]')!;
    expect(convert.disabled).toBe(false);
    expect(harness.container.querySelector<HTMLButtonElement>("[data-testid='text-transport-primary']")?.disabled).toBe(false);
    await click(convert);
    expect(harness.onConvert).toHaveBeenCalledOnce();
    await changeValue(input(harness), "| _ = |");
    expect(harness.container.querySelector('[data-testid="text-progression-convert"]')).toBeNull();
    expect(harness.container.querySelector('[data-testid="text-progression-diagnostics"]')).not.toBeNull();
    await harness.unmount();
  });
  it("shows the extended bounded input contract", async () => {
    const harness = await mount();

    expect(harness.container.textContent).toContain("最大32小節・128セル");
    await harness.unmount();
  });

  it("groups valid 1/2/4-token bars into native selectable cards and updates the inspector", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| C | Dm7 G7 | C D E F |");

    const bars = harness.container.querySelectorAll<HTMLElement>(
      '[data-testid="extended-text-bar"]',
    );
    expect(bars).toHaveLength(3);
    expect([...bars].map((bar) => bar.querySelectorAll('[data-testid="text-preview-band"]').length)).toEqual([1, 2, 4]);

    const cards = harness.container.querySelectorAll<HTMLElement>(
      '[data-testid="text-preview-band"]',
    );
    expect(cards).toHaveLength(7);
    expect(cards[0]).toBeInstanceOf(HTMLElement);
    // The first card is the one the inspector opens on; its accent follows the preview workspace's own selection.
    expect(cards[0]?.getAttribute("data-selected")).toBe("false");
    expect(cards[0]?.querySelector('[data-testid="text-progression-voicing-state"]')?.textContent)
      .toContain("標準 / 自動生成");
    // These are native buttons: focus/activation are keyboard reachable without
    // introducing a custom keyboard model. Browser key activation is covered by
    // the stage's Playwright accessibility gate.
    const firstButton = cards[1]!.querySelector<HTMLButtonElement>(".lv-text-preview-chord")!;
    firstButton.focus();
    expect(document.activeElement).toBe(firstButton);
    await click(firstButton);

    const afterClick = harness.container.querySelectorAll<HTMLElement>('[data-testid="text-preview-band"]');
    expect(afterClick[1]?.getAttribute("data-selected")).toBe("true");
    expect(harness.onPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ canonical: "Dm7" }),
      undefined,
      120,
    );
    expect(harness.container.querySelector('[data-testid="text-progression-inspector"]')?.textContent)
      .toContain("Dm7");
    await harness.unmount();
  });

  it("keeps invalid three-token bars visible with source positions and blocks conversion", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| C D E |");

    const entry = input(harness);
    expect(entry.getAttribute("aria-invalid")).toBe("true");
    expect(entry.getAttribute("aria-errormessage")).toBe("text-progression-diagnostics");
    const diagnostics = harness.container.querySelector<HTMLElement>(
      '#text-progression-diagnostics',
    );
    expect(diagnostics?.textContent).toMatch(/1小節目・文字 \d+-\d+/);
    expect(harness.container.querySelectorAll('[data-testid="text-preview-error"]'))
      .toHaveLength(1);
    // V11: an invalid bar makes no card, so there is no convert button to press.
    expect(harness.container.querySelector('[data-testid="text-progression-convert"]')).toBeNull();
    await harness.unmount();
  });

  it("uses Japanese UI text for diagnostics and capability status/reasons", async () => {
    const invalid = await mount({  });
    await changeValue(input(invalid), "| C ? |");

    const diagnostics = invalid.container.querySelector<HTMLElement>(
      "#text-progression-diagnostics",
    );
    expect(diagnostics?.textContent).toContain("対応するコード表記ではありません。");
    expect(diagnostics?.textContent).toContain("1小節目・文字");
    expect(diagnostics?.textContent).not.toContain("`?` is not a supported chord token.");

    const invalidCapabilities = invalid.container.querySelector<HTMLElement>(
      '[data-testid="text-progression-capabilities"]',
    )?.textContent ?? "";
    expect(invalidCapabilities).toContain("利用不可:");
    expect(invalidCapabilities).toContain("すべてのパーサー診断を修正してください。");
    expect(invalidCapabilities).not.toContain("unsupported:");
    expect(invalidCapabilities).not.toContain("Resolve every parser diagnostic before creating a Draft.");
    expect(invalidCapabilities).not.toContain("Bass Practice is unsupported:");
    expect(invalidCapabilities).not.toContain("Root Motion depends on an eligible Chord Context snapshot:");
    await invalid.unmount();

    const eligible = await mount({  });
    await changeValue(input(eligible), "| C |");
    await changeSelect(keyInput(eligible), "C major");
    await changeValue(bpmInput(eligible), "120");

    const eligibleCapabilities = eligible.container.querySelector<HTMLElement>(
      '[data-testid="text-progression-capabilities"]',
    )?.textContent ?? "";
    expect(eligibleCapabilities).toContain("利用可能:");
    expect(eligibleCapabilities).toContain("未判定:");
    expect(eligibleCapabilities).not.toContain("supported:");
    expect(eligibleCapabilities).not.toContain("unknown:");
    expect(eligibleCapabilities).not.toContain("The saved progression contains at least one complete contiguous");
    expect(eligibleCapabilities).not.toContain("Select a Root Motion note count from 2 through 8");
    await eligible.unmount();
  });
  it("enables degree input only after an explicit C major confirmation", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| ii7 V7 | Imaj7 |");
    // V11: no card before the key is confirmed, so the convert button is not there yet.
    expect(harness.container.querySelector('[data-testid="text-progression-convert"]')).toBeNull();

    expect([...keyInput(harness).options].find((option) => option.value === "C major")?.textContent).toBe("Cメジャー");
    await changeSelect(keyInput(harness), "C major");

    expect(harness.container.querySelector('[data-testid="text-progression-key-state"]')?.textContent)
      .toContain("確定: C major");
    expect(button(harness, "text-progression-convert").disabled).toBe(false);
    const cards = harness.container.querySelectorAll<HTMLElement>(
      '[data-testid="text-preview-band"]',
    );
    expect(cards).toHaveLength(3);
    expect(cards[0]?.textContent).toContain("Dm7");
    // The degree badge names the scale degree; the canonical chord above it
    // retains the seventh quality as Dm7.
    expect(cards[0]?.textContent).toContain("Ⅱm7");
    await harness.unmount();
  });

  it("V14 resets key, BPM and name after a save when the input is cleared, and keeps them without a save", async () => {
    const onSaveStandard = vi.fn(() => true);
    const harness = await mount({ onSaveStandard });
    const nameInput = () => harness.container.querySelector<HTMLInputElement>('[data-testid="text-progression-name"]')!;
    await changeValue(input(harness), "| C |");
    await changeSelect(keyInput(harness), "C major");
    await changeValue(bpmInput(harness), "124");
    await changeValue(nameInput(), "保存する名前");
    await click(button(harness, "text-progression-save"));
    expect(onSaveStandard).toHaveBeenCalledOnce();
    await changeValue(input(harness), "");
    // P23-33: the key select's default state after a save is 「自動」 (it used to be 未確定).
    expect(keyInput(harness).value).toBe("auto");
    expect(bpmInput(harness).value).toBe("");
    expect(nameInput().value).toBe("テキスト進行");
    // Without a save the fields stay as they were.
    await changeValue(input(harness), "| C |");
    await changeSelect(keyInput(harness), "C major");
    await changeValue(bpmInput(harness), "100");
    await changeValue(input(harness), "");
    expect(keyInput(harness).value).toBe("C major");
    expect(bpmInput(harness).value).toBe("100");
    await harness.unmount();
  });

  it("uses the explicit BPM for Auto preview and stops playback for all source-changing inputs", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| C |");
    // P23-33: the automatic state replaced the 「推定」 group; the key list itself is unchanged.
    const suggestion = [...keyInput(harness).options]
      .find((option) => option.value !== "auto" && option.value !== "unset");
    expect(suggestion).not.toBeUndefined();
    await changeSelect(keyInput(harness), suggestion!.value);
    await changeValue(bpmInput(harness), "124");
    await click(harness.container.querySelector<HTMLButtonElement>(
      '[data-testid="text-preview-band"]',
    )!);

    expect(harness.onStop).toHaveBeenCalledTimes(4);
    await click(button(harness, "text-progression-preview"));
    expect(harness.onPreview).toHaveBeenCalledWith(
      expect.objectContaining({ canonical: "C" }),
      undefined,
      124,
    );

    await harness.unmount();
    expect(harness.onStop).toHaveBeenCalledTimes(5);
  });

  it("does not offer source-MIDI recovery for text entry", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| C |");

    expect(harness.container.textContent).not.toContain("Extract from source MIDI");
    expect(harness.container.textContent).not.toContain("The source MIDI file was not found.");
    const sourceChip = harness.container.querySelector<HTMLElement>('[data-testid="detail-voicing-source-chip"]');
    expect(sourceChip?.textContent).toContain("自動");
    expect(sourceChip?.getAttribute("title")).toBe("テキスト入力から自動生成したボイシングです。");
    expect(sourceChip?.getAttribute("title")).not.toContain("source MIDI");
    await harness.unmount();
  });

  it("keeps a long invalid token breakable in a compact 320px container", async () => {
    const harness = await mount();
    harness.container.style.width = "320px";
    await changeValue(input(harness), `| ${"C".repeat(320)} |`);

    const invalidCard = harness.container.querySelector<HTMLElement>(
      '[data-testid="text-preview-error"]',
    );
    expect(invalidCard?.className).toContain("w-full");
    expect(invalidCard?.querySelector("span")?.className).toContain("break-words");
    expect(invalidCard?.querySelector("span")?.className).toContain("[overflow-wrap:anywhere]");
    expect(harness.container.querySelector('#text-progression-diagnostics li')?.className)
      .toContain("[overflow-wrap:anywhere]");
    await harness.unmount();
  });
  it("closes the recording panel when conversion unmounts the Inspector, and leaves the shared MIDI connection alone", async () => {
    const original = defaultLiveMidiStore.getState();
    const activate = vi.fn(async () => { defaultLiveMidiStore.setState({ active: true }); });
    const deactivate = vi.fn(async () => { defaultLiveMidiStore.setState({ active: false }); });
    defaultLiveMidiStore.setState({ active: false, activate, deactivate });
    const harness = await mount();

    try {
      await changeValue(input(harness), "| C | ");
      await click(buttonByText(harness, "鍵盤で記録"));
      await act(async () => { await Promise.resolve(); });
      expect(activate).not.toHaveBeenCalled(); // P14 §5: the panel never opens the input itself
      expect(harness.container.querySelector("[data-voicing-panel]")).not.toBeNull();

      await harness.render({ draftActive: true });
      await act(async () => { await Promise.resolve(); });
      expect(harness.container.querySelector("[data-testid=\"text-progression-inspector\"]")).toBeNull();
      expect(harness.container.querySelector("[data-voicing-panel]")).toBeNull();
      expect(deactivate).not.toHaveBeenCalled();
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({
        active: original.active,
        activate: original.activate,
        deactivate: original.deactivate,
      });
    }
  });

  it("locks all text controls after conversion makes the Draft authoritative", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| C |");
    await harness.render({ draftActive: true });

    expect(input(harness).disabled).toBe(true);
    expect(keyInput(harness).disabled).toBe(true);
    expect(bpmInput(harness).disabled).toBe(true);
    // V11: the draft hides the chosen card's row (and so the convert button).
    expect(harness.container.querySelector('[data-testid="text-progression-inspector-row"]')).toBeNull();
    expect(harness.container.querySelector<HTMLButtonElement>(
      '[data-testid="text-preview-band"] .lv-text-preview-chord',
    )?.disabled).toBe(true);
    expect(harness.container.querySelector('[data-testid="text-draft-authoritative"]')).not.toBeNull();
    await harness.unmount();
  });
  it("selects a generated voicing style and uses the same notes for the card audition and Draft save", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| Cmaj7 Dm7 |");

    const selector = harness.container.querySelector<HTMLSelectElement>(
      '[data-testid="voicing-style-selector"]',
    );
    expect(selector).not.toBeNull();
    expect([...selector!.options].map((option) => option.textContent)).toEqual([
      "標準クローズ",
      "シェル 1–7",
      "オープン 1–7",
      "ルートレス A/B",
    ]);

    await changeSelect(selector!, "open-17");
    const savedNotes = harness.container.querySelector<HTMLElement>(
      '[data-testid="voicing-saved-notes"]',
    );
    expect(savedNotes?.textContent).toContain("このコードの保存予定音");
    expect(savedNotes?.textContent).toContain("MIDIノート:");
    expect(harness.container.querySelector('[data-testid="text-progression-voicing-state"]')?.textContent)
      .toContain("オープン 1–7");

    const firstCard = harness.container.querySelector<HTMLButtonElement>(
      '[data-testid="text-preview-band"]',
    )!;
    await click(firstCard);
    const previewMemory = harness.onPreview.mock.calls[harness.onPreview.mock.calls.length - 1]?.[1];
    const previewNotes = previewMemory?.practiceVoicingOverride?.midiNotes;
    expect(previewMemory?.practiceVoicingOverride).toMatchObject({
      source: "manual",
      extractorVersion: "text-style-v1:open-17",
      userVerified: true,
    });
    expect(savedNotes?.textContent).toContain(previewNotes.join(", "));

    await click(button(harness, "text-progression-convert"));
    const converted = harness.onConvert.mock.calls[0]?.[0];
    expect(converted.draft.events[0]?.source.voicingMemory?.practiceVoicingOverride?.midiNotes)
      .toEqual(previewNotes);
    await harness.unmount();
  });

  it("stops an owned keyboard capture when the selected card changes", async () => {
    const original = defaultLiveMidiStore.getState();
    const activate = vi.fn(async () => { defaultLiveMidiStore.setState({ active: true }); });
    const deactivate = vi.fn(async () => { defaultLiveMidiStore.setState({ active: false }); });
    defaultLiveMidiStore.setState({
      active: false,
      activate,
      deactivate,
      notes: {
        held: new Map(),
        sustained: new Set(),
        pedalByChannel: new Map(),
      },
    });
    const harness = await mount();

    try {
      await changeValue(input(harness), "| Cmaj7 Cmaj7 |");
      await click(buttonByText(harness, "鍵盤で記録"));
      expect(activate).not.toHaveBeenCalled();

      const cards = harness.container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="text-preview-band"]',
      );
      await click(cards[1]!);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(deactivate).not.toHaveBeenCalled();
      expect(harness.container.querySelector('[data-testid="voicing-capture-confirmation"]'))
        .toBeNull();
    } finally {
      await harness.unmount();
      await act(async () => { await Promise.resolve(); });
      defaultLiveMidiStore.setState({
        active: original.active,
        activate: original.activate,
        deactivate: original.deactivate,
        notes: original.notes,
      });
    }
  });
  it("latches released keyboard notes, monitors them as piano, and confirms the exact saved voicing", async () => {
    vi.useFakeTimers();
    pianoMonitor.create.mockClear();
    pianoMonitor.updateNotes.mockClear();
    pianoMonitor.stop.mockClear();
    pianoMonitor.dispose.mockClear();
    const original = defaultLiveMidiStore.getState();
    const activate = vi.fn(async () => undefined);
    const deactivate = vi.fn(async () => undefined);
    defaultLiveMidiStore.setState({
      active: true,
      activate,
      deactivate,
      notes: {
        held: new Map(),
        sustained: new Set(),
        pedalByChannel: new Map(),
      },
    });
    const harness = await mount();

    try {
      await changeValue(input(harness), "| Cmaj7 |");
      await click(buttonByText(harness, "鍵盤で記録"));
      await act(async () => { await Promise.resolve(); });
      expect(pianoMonitor.create).toHaveBeenCalledOnce();
      await act(async () => {
        defaultLiveMidiStore.setState({
          notes: {
            held: new Map([
              ["0:48", { count: 1, velocity: 100, sinceMs: 0, lastEventMs: 0 }],
              ["0:52", { count: 1, velocity: 100, sinceMs: 0, lastEventMs: 0 }],
              ["0:55", { count: 1, velocity: 100, sinceMs: 0, lastEventMs: 0 }],
              ["0:59", { count: 1, velocity: 100, sinceMs: 0, lastEventMs: 0 }],
            ]),
            sustained: new Set(),
            pedalByChannel: new Map(),
          },
        });
      });
      await act(async () => vi.advanceTimersByTime(100));
      expect(pianoMonitor.updateNotes).toHaveBeenCalledWith([48, 52, 55, 59]);

      for (const remaining of [
        [48, 52, 55],
        [48, 52],
        [48],
        [],
      ]) {
        await act(async () => {
          defaultLiveMidiStore.setState({
            notes: {
              held: new Map(remaining.map((note) => [
                `0:${note}`,
                { count: 1, velocity: 100, sinceMs: 0, lastEventMs: 0 },
              ])),
              sustained: new Set(),
              pedalByChannel: new Map(),
            },
          });
        });
        await act(async () => vi.advanceTimersByTime(120));
      }
      expect(pianoMonitor.updateNotes).toHaveBeenLastCalledWith([]);
      expect(harness.container.textContent).toContain("確認する音: C3  E3  G3  B3");
      const confirmButton = buttonByText(harness, "この音を保存予定にする");
      expect(confirmButton.disabled).toBe(false);
      await click(confirmButton);
      expect(pianoMonitor.dispose).toHaveBeenCalled();

      const confirmation = harness.container.querySelector<HTMLElement>(
        '[data-testid="voicing-capture-confirmation"]',
      );
      expect(confirmation?.textContent).toContain("鍵盤入力を記録しました。");
      expect(confirmation?.textContent).toContain("C3");
      expect(harness.container.querySelector('[data-testid="voicing-saved-notes"]')?.textContent)
        .toContain("48, 52, 55, 59");
      expect(harness.container.querySelector<HTMLSelectElement>(
        '[data-testid="voicing-style-selector"]',
      )?.value).toBe("live-custom");

      await click(button(harness, "text-progression-convert"));
      const converted = harness.onConvert.mock.calls[0]?.[0];
      expect(converted.draft.events[0]?.source.voicingMemory?.practiceVoicingOverride).toMatchObject({
        source: "live-played",
        midiNotes: [48, 52, 55, 59],
        bassNote: 48,
        userVerified: true,
      });
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({
        active: original.active,
        activate: original.activate,
        deactivate: original.deactivate,
        notes: original.notes,
      });
      vi.useRealTimers();
    }
  });
});

/** P23-33: the automatic key's session behaviour (the rule itself is tested in importKeyResolution.test.ts). */
describe("TextProgressionCapturePanel P23-33 automatic key", () => {
  it("follows the chords and travels to the save", async () => {
    const onSaveStandard = vi.fn((_converted: unknown, _title: string) => true);
    const harness = await mount({ onSaveStandard });
    const nameInput = () => harness.container.querySelector<HTMLInputElement>('[data-testid="text-progression-name"]')!;
    // A clear major progression settles automatically, without touching the key field.
    await changeValue(input(harness), "| C | F | G | C |");
    expect(keyInput(harness).value).toBe("auto");
    expect([...keyInput(harness).options].find((option) => option.value === "auto")?.textContent).toBe("自動: Cメジャー");
    await changeValue(nameInput(), "自動キー");
    await click(button(harness, "text-progression-save"));
    expect(onSaveStandard).toHaveBeenCalledOnce();
    const converted = onSaveStandard.mock.calls[0]![0] as { confirmedKey?: string; resolvedKey?: string };
    expect(converted.resolvedKey).toBe("C major");
    expect(converted.confirmedKey).toBeUndefined();
    await harness.unmount();
  });

  it("keeps a manual key as the confirmed and the resolved key", async () => {
    const onSaveStandard = vi.fn((_converted: unknown, _title: string) => true);
    const harness = await mount({ onSaveStandard });
    await changeValue(input(harness), "| C | F | G | C |");
    await changeSelect(keyInput(harness), "D major");
    await click(button(harness, "text-progression-save"));
    const converted = onSaveStandard.mock.calls[0]![0] as { confirmedKey?: string; resolvedKey?: string };
    expect(converted.confirmedKey).toBe("D major");
    expect(converted.resolvedKey).toBe("D major");
    await harness.unmount();
  });

  it("lets 未設定 remove an automatically inferred key without re-applying it", async () => {
    const onSaveStandard = vi.fn((_converted: unknown, _title: string) => true);
    const harness = await mount({ onSaveStandard });
    await changeValue(input(harness), "| C | F | G | C |");
    await changeSelect(keyInput(harness), "unset");
    expect([...keyInput(harness).options].find((option) => option.value === "unset")?.textContent).toBe("未設定");
    await click(button(harness, "text-progression-save"));
    const converted = onSaveStandard.mock.calls[0]![0] as { confirmedKey?: string; resolvedKey?: string };
    expect(converted.resolvedKey).toBeUndefined();
    expect(converted.confirmedKey).toBeUndefined();
    await harness.unmount();
  });

  it("shows 自動: 未確定 for an ambiguous progression and updates with the input", async () => {
    const onSaveStandard = vi.fn((_converted: unknown, _title: string) => true);
    const harness = await mount({ onSaveStandard });
    await changeValue(input(harness), "| C | Am | F |");
    expect([...keyInput(harness).options].find((option) => option.value === "auto")?.textContent).toBe("自動: 未確定");
    await click(button(harness, "text-progression-save"));
    expect((onSaveStandard.mock.calls[0]![0] as { resolvedKey?: string }).resolvedKey).toBeUndefined();
    // The next input's decision replaces the old one; the invalid one leaves no stale key behind.
    await changeValue(input(harness), "| C | F | G | C |");
    expect([...keyInput(harness).options].find((option) => option.value === "auto")?.textContent).toBe("自動: Cメジャー");
    await changeValue(input(harness), "| nope |");
    expect([...keyInput(harness).options].find((option) => option.value === "auto")?.textContent).toBe("自動: 未確定");
    await harness.unmount();
  });

  it("draws the preview degrees from the effective key before a manual pick", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| Cmaj7 | Fmaj7 | G7 |");
    const degrees = [...harness.container.querySelectorAll<HTMLElement>('[data-testid="text-preview-degree"]')]
      .map((element) => element.textContent);
    expect(degrees).toEqual(["Ⅰmaj7", "Ⅳmaj7", "Ⅴ7"]);
    await harness.unmount();
  });
});
