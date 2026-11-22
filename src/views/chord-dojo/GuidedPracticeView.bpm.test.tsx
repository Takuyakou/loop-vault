// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseChordLabel } from "../../domain/chords";
import type { VaultProgression } from "../../domain/chordDojo/collect";
import type { Task } from "../../domain/chordDojo/store";
import { GuidedPracticeView } from "./GuidedPracticeView";

/**
 * P23-39 §6.2: the practice tempo inside ④. The mock replaces only the clock factory, so the test can
 * see exactly what the guide asks the existing tempo engine for; the notes and beats are literals of
 * the fixture and must arrive unchanged.
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const clock = vi.hoisted(() => ({
  canUseTempo: vi.fn(() => true),
  tempoPlan: vi.fn(),
}));
vi.mock("./tempo", () => clock);

const occurrence = (eventId: string) => ({
  ideaId: "idea-p2339", blockId: "block-p2339", eventId,
  source: "saved" as const, voicingKey: `notes:${eventId}`,
});

const progression: VaultProgression = {
  key: "vault:p2339-bpm",
  blockId: "block-p2339",
  ideaId: "idea-p2339",
  name: "P23-39 tempo fixture",
  keyContext: "C",
  beatsPerBar: 4,
  chords: [
    { chord: parseChordLabel("Cmaj7")!, notes: [48, 55, 59, 64], beats: 2, source: occurrence("e0") },
    { chord: parseChordLabel("Cmaj7/E")!, notes: [52, 55, 59, 60], beats: 6, source: occurrence("e1") },
    { chord: parseChordLabel("Dm7")!, notes: [50, 57, 60, 65], beats: 4, source: occurrence("e2") },
    { chord: parseChordLabel("G7")!, notes: [55, 59, 62, 65], beats: 4, source: occurrence("e3") },
  ],
  chordBars: [1, 2, 3, 4],
  chordBeatRanges: [{ start: 0, end: 2 }, { start: 2, end: 8 }, { start: 8, end: 12 }, { start: 12, end: 16 }],
  legacyConfirmed: true,
  pinned: false,
  capturedAt: "2026-11-10T00:00:00.000Z",
};

const HERO = { kind: "progression", key: progression.key, review: false, roots: [0], seconds: 120 } as Task;

function renderGuide() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<GuidedPracticeView material={{ task: HERO }} progressions={[progression]} bpm={80} settleMs={60}
      onChangeMaterial={() => undefined} onExit={() => undefined} />);
  });
  return { container, root };
}

const button = (container: ParentNode, testId: string) => {
  const element = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`no ${testId}`);
  return element;
};

const click = async (element: HTMLElement) => {
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
};

/** React's value tracker needs the native setter; a plain assignment is swallowed. */
async function typeBpm(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  clock.tempoPlan.mockReset();
  clock.canUseTempo.mockReturnValue(true);
  clock.tempoPlan.mockImplementation(() => ({ transport: { start: vi.fn(() => Promise.resolve()), stop: vi.fn() } }));
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("P23-39 §6.2 the practice tempo in ④", () => {
  it("starts at the Dojo tempo, passes the chosen BPM to the existing clock, and keeps the source notes/beats", async () => {
    const { container, root } = renderGuide();
    try {
      for (let step = 0; step < 3; step += 1) await click(button(container, "guided-next"));
      expect(container.querySelector(".dojo-practice-head")!.textContent).toContain("4 / 5");
      const bpm = container.querySelector<HTMLInputElement>('[data-testid="guided-bpm"]')!;
      expect(bpm.value).toBe("80");
      await expect(container.querySelector('[data-testid="guided-bpm-error"]')).toBeNull();

      await typeBpm(bpm, "120");
      expect(bpm.value).toBe("120");
      const transport = { start: vi.fn((_options: { bpm?: number }) => Promise.resolve()), stop: vi.fn() };
      clock.tempoPlan.mockReturnValue({ transport });
      await click(button(container, "guided-tempo"));

      expect(clock.tempoPlan).toHaveBeenCalledTimes(1);
      const [chords, bpmArg] = clock.tempoPlan.mock.calls[0]!;
      expect(bpmArg).toBe(120);
      // The material's own notes and beats reach the clock unchanged.
      expect(chords.map((chord: { notes: number[] }) => chord.notes)).toEqual([[48, 55, 59, 64], [52, 55, 59, 60], [50, 57, 60, 65], [55, 59, 62, 65]]);
      expect(chords.map((chord: { beats: number }) => chord.beats)).toEqual([2, 6, 4, 4]);
      expect(transport.start).toHaveBeenCalledTimes(1);
      expect(transport.start.mock.calls[0]![0].bpm).toBe(120);
      // The clock is running: the field is disabled and the stage does not move.
      expect(bpm.disabled).toBe(true);
      expect(container.querySelector(".dojo-practice-head")!.textContent).toContain("4 / 5");

      await click(button(container, "guided-tempo"));
      expect(bpm.disabled).toBe(false);
      expect(container.querySelector(".dojo-practice-head")!.textContent).toContain("4 / 5");
    } finally {
      act(() => root.unmount());
    }
  });

  it("never passes an empty, NaN or out-of-range value to the clock", async () => {
    const { container, root } = renderGuide();
    try {
      for (let step = 0; step < 3; step += 1) await click(button(container, "guided-next"));
      const bpm = container.querySelector<HTMLInputElement>('[data-testid="guided-bpm"]')!;
      await typeBpm(bpm, "100");
      const transport = { start: vi.fn((_options: { bpm?: number }) => Promise.resolve()), stop: vi.fn() };
      clock.tempoPlan.mockReturnValue({ transport });

      await typeBpm(bpm, "29");
      expect(container.querySelector('[data-testid="guided-bpm-error"]')!.textContent).toContain("30〜240");
      await typeBpm(bpm, "241");
      expect(container.querySelector('[data-testid="guided-bpm-error"]')!.textContent).toContain("30〜240");
      await typeBpm(bpm, "12.5");
      expect(container.querySelector('[data-testid="guided-bpm-error"]')!.textContent).toContain("30〜240");
      // An empty field is an input in progress: no error, no crash, and the last valid value is kept.
      await typeBpm(bpm, "");
      expect(container.querySelector('[data-testid="guided-bpm-error"]')).toBeNull();
      await click(button(container, "guided-tempo"));
      expect(clock.tempoPlan).toHaveBeenCalledTimes(1);
      expect(clock.tempoPlan.mock.calls[0]![1]).toBe(100);
      expect(transport.start.mock.calls[0]![0].bpm).toBe(100);
    } finally {
      act(() => root.unmount());
    }
  });

  it("keeps the stage and the earlier results when the tempo changes", async () => {
    const { container, root } = renderGuide();
    try {
      for (let step = 0; step < 3; step += 1) await click(button(container, "guided-next"));
      const bpm = container.querySelector<HTMLInputElement>('[data-testid="guided-bpm"]')!;
      await typeBpm(bpm, "140");
      expect(container.querySelector(".dojo-practice-head")!.textContent).toContain("4 / 5");
      // No answer leaks at ④, and the stage is still the tempo round after the change.
      expect(container.querySelector('[data-testid="guided-hidden-note"]')).not.toBeNull();
      await typeBpm(bpm, "150");
      expect(container.querySelector(".dojo-practice-head")!.textContent).toContain("4 / 5");
    } finally {
      act(() => root.unmount());
    }
  });
});
