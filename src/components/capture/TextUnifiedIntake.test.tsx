// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { TextProgressionCapturePanel } from "./TextProgressionCapturePanel";
import type { ExtendedTextResult } from "../../domain/extendedTextProgression";
import type { PlaybackAudioDriver } from "../../audio/playbackController";
import { createPlaybackController } from "../../audio/playbackController";
import { extendedTextSyntheticChart } from "../../domain/__fixtures__/extendedTextSyntheticChart";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function press(element: HTMLElement) { await act(async () => element.click()); }
async function write(element: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  });
}
function mount(overrides: { readonly onSaveExtended?: (result: ExtendedTextResult, title: string) => boolean; readonly controller?: ReturnType<typeof createPlaybackController> } = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onSaveExtended = vi.fn(overrides.onSaveExtended ?? (() => true));
  const render = async () => act(async () => root.render(<TextProgressionCapturePanel showRomanNumerals={false}
    onPreview={vi.fn()} onStop={vi.fn()} onSaveExtended={onSaveExtended}
    {...(overrides.controller === undefined ? {} : { controller: overrides.controller })} />));
  return {
    container,
    onSaveExtended,
    render,
    async unmount() { await act(async () => root.unmount()); container.remove(); },
    input: () => container.querySelector<HTMLTextAreaElement>('[data-testid="text-progression-input"]')!,
    save: () => container.querySelector<HTMLButtonElement>('[data-testid="text-progression-save"]')!,
  };
}

/**
 * P24-05 05-c: the old extended screen's checks, on the one screen that replaced it.
 * The parts that only proved 「a switch exists」 or 「both screens look alike」 are gone with the two screens.
 */
describe("the one text intake, through the extended-only inputs", () => {
  it("reads an extended-only chart, proposes its # Key line, and saves once", async () => {
    const harness = mount();
    await harness.render();
    try {
      await write(harness.input(), "# Key: C major\nC %|= =");
      const hint = harness.container.querySelector<HTMLButtonElement>('[data-testid="text-hint-key"]');
      expect(hint).not.toBeNull();
      expect(hint?.textContent).toContain("Cメジャー");
      expect(harness.container.querySelector('[data-testid="extended-text-section"]')).toBeNull();
      await press(hint!);
      expect(harness.container.querySelector('[data-testid="text-hint-key"]')?.textContent).toContain("使用中");
      // P23-17 V8: the key hint reaches the display (the hint line is not a bar and not a memo card).
      expect(harness.container.querySelector('[data-testid="text-progression-key-state"]')?.textContent)
        .toContain("確定: C major");
      expect(harness.container.querySelectorAll('[data-testid="extended-text-bar"]')).toHaveLength(2);
      await press(harness.save());
      expect(harness.onSaveExtended).toHaveBeenCalledOnce();
      expect(harness.onSaveExtended.mock.calls[0]?.[0].harmonicSpans[0]?.attacks).toHaveLength(2);
      expect(harness.onSaveExtended.mock.calls[0]?.[0].source).toBe("# Key: C major\nC %|= =");
    } finally {
      await harness.unmount();
    }
  });

  it("keeps invalid input editable and blocks the save", async () => {
    const harness = mount();
    await harness.render();
    try {
      await write(harness.input(), "C _ =|F");
      expect(harness.container.querySelector('[data-testid="text-progression-diagnostics"]')?.textContent)
        .toContain("直す所が");
      // No English code reaches the screen.
      expect(harness.container.querySelector('[data-testid="text-progression-diagnostics"]')?.textContent)
        .not.toMatch(/ERROR \d+:\d+/);
      expect(harness.save().disabled).toBe(true);
      expect(harness.onSaveExtended).not.toHaveBeenCalled();
      expect(harness.input().value).toBe("C _ =|F");
    } finally {
      await harness.unmount();
    }
  });

  it("explains an unreadable raw bar in Japanese, with its line and bar", async () => {
    const harness = mount();
    await harness.render();
    try {
      await write(harness.input(), "| C///E | F |");
      const bar = harness.container.querySelector('[data-testid="extended-text-bar"][data-state="error"]');
      expect(bar?.textContent).toContain("C///E");
      expect(bar?.textContent).toContain("スラッシュの書き方が正しくありません");
      const list = harness.container.querySelector('[data-testid="text-progression-diagnostics"]');
      expect(list?.textContent).toContain("1 行目 · 1 小節目");
      expect(list?.textContent).toContain("「C///E」");
      await press(harness.container.querySelector<HTMLButtonElement>('[data-testid="text-diagnostic-move"]')!);
      expect(harness.input().value.slice(harness.input().selectionStart, harness.input().selectionEnd))
        .toBe("C///E");
      expect(harness.save().disabled).toBe(true);
    } finally {
      await harness.unmount();
    }
  });

  it("navigates both ways between the preview card and its characters, and keeps the # memo card", async () => {
    const harness = mount();
    await harness.render();
    try {
      await write(harness.input(), "#メモ\n| C % = _ | F/C |");
      expect(harness.container.querySelector('[data-testid="extended-text-section"]')?.textContent).toBe("メモ");
      const band = harness.container.querySelector<HTMLButtonElement>('[data-testid="text-preview-band"]')!;
      await press(band);
      expect(harness.input().value.slice(harness.input().selectionStart, harness.input().selectionEnd)).toBe("C");
      const token = [...harness.container.querySelectorAll<HTMLElement>('[data-mark="token"]')]
        .find((element) => element.textContent === "F/C")!;
      await act(async () => {
        token.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      });
      expect(harness.input().value.slice(harness.input().selectionStart, harness.input().selectionEnd)).toBe("F/C");
      expect(harness.container.querySelector('[data-testid="text-preview-band"][data-chord="F/C"]')
        ?.getAttribute("data-selected")).toBe("true");
    } finally {
      await harness.unmount();
    }
  });

  it("freezes playback on Play and applies edits only on the next Play", async () => {
    const calls: Array<{ readonly notes: readonly { readonly pitch: number; readonly startBeat: number }[]; readonly bpm: number }> = [];
    const driver: PlaybackAudioDriver = {
      playChord: vi.fn(async (_chord, _sound, lifecycle) => { lifecycle.onStarted?.(); }),
      playTimeline: vi.fn(async (_timeline, _bpm, _sound, lifecycle) => { lifecycle.onStarted?.(); }),
      playNotes: vi.fn(async (notes, bpm, _sound, lifecycle) => { calls.push({ notes, bpm }); lifecycle.onStarted?.(); }),
      stop: vi.fn(),
    };
    const controller = createPlaybackController(driver);
    const harness = mount({ controller });
    await harness.render();
    try {
      await write(harness.input(), "| C % = _ | F |");
      await press(harness.container.querySelector<HTMLButtonElement>('[data-testid="text-transport-primary"]')!);
      expect(calls).toHaveLength(1);
      const original = calls[0]!.notes;
      await write(harness.input(), "| Dm % = _ | G |");
      expect(calls).toHaveLength(1);
      expect(controller.getState().request?.type).toBe("notes");
      expect(harness.container.querySelector('[data-testid="text-transport-frozen"]')).not.toBeNull();
      await press(harness.container.querySelector<HTMLButtonElement>('[data-testid="text-transport-primary"]')!);
      await press(harness.container.querySelector<HTMLButtonElement>('[data-testid="text-transport-primary"]')!);
      expect(calls).toHaveLength(2);
      expect(calls[1]!.notes).not.toEqual(original);
    } finally {
      await harness.unmount();
    }
  });

  it("keeps the frozen request until the score end and starts with the metronome off", async () => {
    const played: Array<readonly { readonly pitch: number; readonly velocity: number }[]> = [];
    const finish: Array<() => void> = [];
    const driver: PlaybackAudioDriver = {
      playChord: vi.fn(async (_chord, _sound, lifecycle) => { lifecycle.onStarted?.(); }),
      playTimeline: vi.fn(async (_timeline, _bpm, _sound, lifecycle) => { lifecycle.onStarted?.(); }),
      playNotes: vi.fn(async (notes, _bpm, _sound, lifecycle) => {
        played.push(notes);
        finish.push(() => lifecycle.onEnded?.("completed"));
        lifecycle.onStarted?.();
      }),
      stop: vi.fn(),
    };
    const controller = createPlaybackController(driver);
    const harness = mount({ controller });
    await harness.render();
    try {
      await write(harness.input(), "| C |");
      expect([...harness.container.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.includes("メトロノーム"))).toBeUndefined();
      await press([...harness.container.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.includes("ループ"))!);
      await press(harness.container.querySelector<HTMLButtonElement>('[data-testid="text-transport-primary"]')!);
      expect(played).toHaveLength(1);
      expect(played[0]?.every(note => note.velocity !== 46)).toBe(true);
      await act(async () => finish[0]?.());
      // The score timer owns the loop boundary; audio's release tail must not restart the score early.
      expect(played).toHaveLength(1);
      expect(harness.container.querySelector<HTMLButtonElement>('[data-testid="text-transport-primary"]')?.textContent)
        .toContain("一時停止");
      await press(harness.container.querySelector<HTMLButtonElement>('[data-testid="text-transport-stop"]')!);
    } finally {
      await harness.unmount();
    }
  });

  it("saves while saying, in the design's sentence, that Voicing Loop cannot practice the timing", async () => {
    const harness = mount();
    await harness.render();
    try {
      await write(harness.input(), "| C Dm G7 F Am |");
      const notice = harness.container.querySelector('[data-testid="text-practice-limit"]');
      expect(notice?.textContent).toBe("保存できますが、Voicing Loop ではこのタイミングを練習できません");
      expect(notice?.getAttribute("title")).toContain("invalid-timing");
      expect(harness.save().disabled).toBe(false);
      await press(harness.save());
      expect(harness.onSaveExtended).toHaveBeenCalledOnce();
    } finally {
      await harness.unmount();
    }
  });

  it("fix-1: the practice notice stays away once the attacks can be practiced", async () => {
    const harness = mount();
    await harness.render();
    try {
      // One card per attack means `| C % |` has two playable cards, so no notice.
      await write(harness.input(), "| C % |");
      expect(harness.container.querySelector('[data-testid="text-practice-limit"]')).toBeNull();
      // The fifth-of-a-bar grid still cannot be practiced exactly: the notice stays.
      await write(harness.input(), "| C Dm G7 F Am |");
      expect(harness.container.querySelector('[data-testid="text-practice-limit"]')).not.toBeNull();
    } finally {
      await harness.unmount();
    }
  });

  it("previews and saves all 150 synthetic bars without a partial-save state", async () => {
    const harness = mount();
    await harness.render();
    try {
      const chart = extendedTextSyntheticChart(150);
      await write(harness.input(), chart.source);
      expect(harness.container.querySelectorAll('[data-testid="extended-text-bar"]')).toHaveLength(150);
      expect(harness.container.querySelectorAll('[data-testid="text-preview-row"]').length).toBeGreaterThan(1);
      expect(harness.container.querySelectorAll('[data-testid="text-preview-band"]').length).toBeGreaterThan(0);
      expect(harness.save().disabled).toBe(false);
      await press(harness.save());
      expect(harness.onSaveExtended).toHaveBeenCalledOnce();
      expect(harness.onSaveExtended.mock.calls[0]?.[0].slots).toHaveLength(chart.expectedSlots);
    } finally {
      await harness.unmount();
    }
  });
});
