// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
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
    language: "en",
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
  const element = harness.container.querySelector<HTMLInputElement>(
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
    .find((candidate) => candidate.textContent === label);
  expect(element).toBeDefined();
  return element!;
}

describe("TextProgressionCapturePanel", () => {
  it("groups valid 1/2/4-token bars into native selectable cards and updates the inspector", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| C | Dm7 G7 | C D E F |");

    const bars = harness.container.querySelectorAll<HTMLElement>(
      '[data-testid="text-progression-bar"]',
    );
    expect(bars).toHaveLength(3);
    expect([...bars].map((bar) => bar.querySelectorAll("button").length)).toEqual([1, 2, 4]);

    const cards = harness.container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="text-progression-card"]',
    );
    expect(cards).toHaveLength(7);
    expect(cards[0]).toBeInstanceOf(HTMLButtonElement);
    expect(cards[0]?.getAttribute("type")).toBe("button");
    expect(cards[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(cards[0]?.querySelector('[data-testid="text-progression-voicing-state"]')?.textContent)
      .toContain("Default / Generated");
    // These are native buttons: focus/activation are keyboard reachable without
    // introducing a custom keyboard model. Browser key activation is covered by
    // the stage's Playwright accessibility gate.
    cards[1]?.focus();
    expect(document.activeElement).toBe(cards[1]);
    await click(cards[1]!);

    expect(cards[1]?.getAttribute("aria-pressed")).toBe("true");
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
    expect(diagnostics?.textContent).toMatch(/bar 1, characters \d+-\d+/i);
    expect(harness.container.querySelectorAll('[data-testid="text-progression-invalid-card"]'))
      .toHaveLength(3);
    expect(button(harness, "text-progression-convert").disabled).toBe(true);
    await harness.unmount();
  });

  it("uses Japanese UI text for diagnostics and capability status/reasons", async () => {
    const invalid = await mount({ language: "ja" });
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

    const eligible = await mount({ language: "ja" });
    await changeValue(input(eligible), "| C |");
    await changeValue(keyInput(eligible), "C major");
    const confirmKey = keyInput(eligible).parentElement?.querySelector<HTMLButtonElement>("button");
    expect(confirmKey).not.toBeNull();
    await click(confirmKey!);
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
    expect(button(harness, "text-progression-convert").disabled).toBe(true);

    await changeValue(keyInput(harness), "C major");
    await click(buttonByText(harness, "Confirm key"));

    expect(harness.container.querySelector('[data-testid="text-progression-key-state"]')?.textContent)
      .toContain("Confirmed: C major");
    expect(button(harness, "text-progression-convert").disabled).toBe(false);
    const cards = harness.container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="text-progression-card"]',
    );
    expect(cards).toHaveLength(3);
    expect(cards[0]?.textContent).toContain("Dm7");
    // The degree badge names the scale degree; the canonical chord above it
    // retains the seventh quality as Dm7.
    expect(cards[0]?.textContent).toContain("ii");
    await harness.unmount();
  });

  it("uses the explicit BPM for Auto preview and stops playback for all source-changing inputs", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| C |");
    const suggestion = harness.container.querySelector<HTMLButtonElement>(
      '[data-testid="text-progression-key-suggestions"] button',
    );
    expect(suggestion).not.toBeNull();
    await click(suggestion!);
    await click(buttonByText(harness, "Confirm key"));
    await changeValue(bpmInput(harness), "124");
    await click(harness.container.querySelector<HTMLButtonElement>(
      '[data-testid="text-progression-card"]',
    )!);

    expect(harness.onStop).toHaveBeenCalledTimes(5);
    await click(button(harness, "text-progression-preview"));
    expect(harness.onPreview).toHaveBeenCalledWith(
      expect.objectContaining({ canonical: "C" }),
      undefined,
      124,
    );

    await harness.unmount();
    expect(harness.onStop).toHaveBeenCalledTimes(6);
  });

  it("does not offer source-MIDI recovery for text entry", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| C |");

    expect(harness.container.textContent).not.toContain("Extract from source MIDI");
    expect(harness.container.textContent).not.toContain("The source MIDI file was not found.");
    const sourceChip = harness.container.querySelector<HTMLElement>('[data-testid="detail-voicing-source-chip"]');
    expect(sourceChip?.textContent).toContain("Generated");
    expect(sourceChip?.getAttribute("title")).toBe("Auto-generated from this text entry.");
    expect(sourceChip?.getAttribute("title")).not.toContain("source MIDI");
    await harness.unmount();
  });

  it("keeps a long invalid token breakable in a compact 320px container", async () => {
    const harness = await mount();
    harness.container.style.width = "320px";
    await changeValue(input(harness), `| ${"C".repeat(320)} |`);

    const invalidCard = harness.container.querySelector<HTMLElement>(
      '[data-testid="text-progression-invalid-card"]',
    );
    expect(invalidCard?.className).toContain("min-w-0");
    expect(invalidCard?.className).toContain("break-words");
    expect(invalidCard?.className).toContain("[overflow-wrap:anywhere]");
    expect(harness.container.querySelector('#text-progression-diagnostics li')?.className)
      .toContain("[overflow-wrap:anywhere]");
    await harness.unmount();
  });
  it("releases a Live MIDI connection when conversion unmounts the Inspector", async () => {
    const original = defaultLiveMidiStore.getState();
    const activate = vi.fn(async () => { defaultLiveMidiStore.setState({ active: true }); });
    const deactivate = vi.fn(async () => { defaultLiveMidiStore.setState({ active: false }); });
    defaultLiveMidiStore.setState({ active: false, activate, deactivate });
    const harness = await mount();

    try {
      await changeValue(input(harness), "| C | ");
      await click(buttonByText(harness, "Capture from keyboard"));
      await act(async () => { await Promise.resolve(); });
      expect(activate).toHaveBeenCalledTimes(1);
      expect(harness.container.querySelector("[data-voicing-panel]")).not.toBeNull();

      await harness.render({ draftActive: true });
      await act(async () => { await Promise.resolve(); });
      expect(harness.container.querySelector("[data-testid=\"text-progression-inspector\"]")).toBeNull();
      expect(harness.container.querySelector("[data-voicing-panel]")).toBeNull();
      expect(deactivate).toHaveBeenCalledTimes(1);
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
    expect(buttonByText(harness, "Confirm key").disabled).toBe(true);
    expect(button(harness, "text-progression-convert").disabled).toBe(true);
    expect(harness.container.querySelector<HTMLButtonElement>(
      '[data-testid="text-progression-card"]',
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
      "Default close",
      "Shell 1–7",
      "Open 1–7",
      "Rootless A/B",
    ]);

    await changeSelect(selector!, "open-17");
    const savedNotes = harness.container.querySelector<HTMLElement>(
      '[data-testid="voicing-saved-notes"]',
    );
    expect(savedNotes?.textContent).toContain("Notes to save for this chord");
    expect(savedNotes?.textContent).toContain("MIDI notes:");
    expect(harness.container.querySelector('[data-testid="text-progression-voicing-state"]')?.textContent)
      .toContain("Open 1–7");

    const firstCard = harness.container.querySelector<HTMLButtonElement>(
      '[data-testid="text-progression-card"]',
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
    const activate = vi.fn(async () => undefined);
    const deactivate = vi.fn(async () => undefined);
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
      await click(buttonByText(harness, "Capture from keyboard"));
      expect(activate).toHaveBeenCalledTimes(1);

      const cards = harness.container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="text-progression-card"]',
      );
      await click(cards[1]!);
      expect(deactivate).toHaveBeenCalledTimes(1);
      expect(harness.container.querySelector('[data-testid="voicing-capture-confirmation"]'))
        .toBeNull();
    } finally {
      await harness.unmount();
      defaultLiveMidiStore.setState({
        active: original.active,
        activate: original.activate,
        deactivate: original.deactivate,
        notes: original.notes,
      });
    }
  });
  it("confirms the exact keyboard notes that will overwrite the selected chord on save", async () => {
    vi.useFakeTimers();
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
      await click(buttonByText(harness, "Capture from keyboard"));
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
      await click(buttonByText(harness, "Use these notes for saving"));

      const confirmation = harness.container.querySelector<HTMLElement>(
        '[data-testid="voicing-capture-confirmation"]',
      );
      expect(confirmation?.textContent).toContain("Keyboard input recorded.");
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
