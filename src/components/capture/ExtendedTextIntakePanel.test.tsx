// @vitest-environment jsdom
import { act } from "react";
import { createPlaybackController, type PlaybackAudioDriver } from "../../audio/playbackController";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { TextProgressionCapturePanel } from "./TextProgressionCapturePanel";
import type { ExtendedTextResult } from "../../domain/extendedTextProgression";
import { extendedTextSyntheticChart } from "../../domain/__fixtures__/extendedTextSyntheticChart";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function press(element: HTMLElement) {
  await act(async () => element.click());
}

async function write(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  });
}

describe("P8.8 extended Capture intake", () => {
  it("offers an explicit mode switch, live source preview and one save action", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSaveExtended = vi.fn((_result: ExtendedTextResult, _title: string) => true);
    await act(async () => root.render(<TextProgressionCapturePanel showRomanNumerals={false}
      onConvert={vi.fn()} onPreview={vi.fn()} onStop={vi.fn()} onSaveExtended={onSaveExtended} />));
    expect(container.querySelector('[data-testid="text-mode-standard"]')?.getAttribute("aria-pressed")).toBe("true");
    await write(container.querySelector<HTMLTextAreaElement>('[data-testid="text-progression-input"]')!, "# Key: C major\nC %|= =");
    expect(container.querySelector('[data-testid="text-extended-suggestion"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="extended-text-intake"]')).toBeNull();
    await press(container.querySelector<HTMLButtonElement>('[data-testid="text-mode-extended"]')!);
    expect(container.querySelector<HTMLTextAreaElement>('[data-testid="extended-text-input"]')?.value).toBe("# Key: C major\nC %|= =");
    expect(container.querySelectorAll('[data-testid="extended-text-bar"]')).toHaveLength(2);
    expect(container.querySelector(".lv-text-intake-grid")).not.toBeNull();
    expect(container.querySelector(".lv-text-intake-savebar")).not.toBeNull();
    expect(container.querySelector(".lv-text-intake-gutter")?.textContent).toContain("2");
    expect(container.querySelector('[data-testid="extended-text-section"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="text-preview-attack"]')).toHaveLength(2);
    expect(container.querySelector('[data-testid="extended-text-metadata"]')).toBeNull();
    expect(container.querySelector('[data-testid="text-intake-bpm-field"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="text-intake-bpm-drag"]')).not.toBeNull();
    await press([...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("キー Cメジャーを使う"))!);
    expect(container.querySelector('[data-testid="extended-text-metadata"]')?.textContent).toContain("キー Cメジャー");
    const title = container.querySelector<HTMLInputElement>('[data-testid="extended-text-name"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(title, "練習用の進行");
      title.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await press(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-save"]')!);
    expect(onSaveExtended).toHaveBeenCalledOnce();
    expect(onSaveExtended.mock.calls[0]?.[1]).toBe("練習用の進行");
    expect(onSaveExtended.mock.calls[0]?.[0].harmonicSpans[0].attacks).toHaveLength(2);
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps invalid input editable and blocks partial save", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSaveExtended = vi.fn((_result: ExtendedTextResult) => true);
    await act(async () => root.render(<TextProgressionCapturePanel showRomanNumerals={false}
      onConvert={vi.fn()} onPreview={vi.fn()} onStop={vi.fn()} onSaveExtended={onSaveExtended} />));
    await press(container.querySelector<HTMLButtonElement>('[data-testid="text-mode-extended"]')!);
    await write(container.querySelector<HTMLTextAreaElement>('[data-testid="extended-text-input"]')!, "C _ =|F");
    expect(container.querySelector('[data-testid="extended-text-diagnostics"]')?.textContent).toMatch(/ERROR \d+:\d+/);
    expect(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-save"]')?.disabled).toBe(true);
    expect(onSaveExtended).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLTextAreaElement>('[data-testid="extended-text-input"]')?.value).toBe("C _ =|F");
    await act(async () => root.unmount());
    container.remove();
  });

  it("explains an invalid raw bar in Japanese with a reason and source span", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TextProgressionCapturePanel showRomanNumerals={false}
      onConvert={vi.fn()} onPreview={vi.fn()} onStop={vi.fn()} onSaveExtended={vi.fn()} />));
    await press(container.querySelector<HTMLButtonElement>('[data-testid="text-mode-extended"]')!);
    await write(container.querySelector<HTMLTextAreaElement>('[data-testid="extended-text-input"]')!, "| C///E | F |");
    const bar = container.querySelector('[data-testid="extended-text-bar"][data-state="error"]');
    expect(bar?.textContent).toContain("C///E");
    expect(bar?.textContent).toContain("書式を確認してください");
    expect(container.querySelector('.lv-text-intake-gutter [data-diagnostic="ERROR"]')).not.toBeNull();
    await press(container.querySelector<HTMLButtonElement>('[data-testid="text-preview-error"]')!);
    expect(container.querySelector<HTMLTextAreaElement>('[data-testid="extended-text-input"]')?.selectionStart)
      .toBe(Number(container.querySelector('[data-testid="extended-text-bar"][data-state="error"] [data-source-start]')?.getAttribute("data-source-start")));
    const diagnostic = container.querySelector('[data-testid="extended-text-diagnostics"] [data-reason="INVALID_STRUCTURE"]');
    expect(diagnostic?.textContent).toContain("書式を確認してください");
    expect(diagnostic?.getAttribute("data-span-start")).not.toBeNull();
    expect(diagnostic?.getAttribute("data-span-end")).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-save"]')?.disabled).toBe(true);
    await act(async () => root.unmount());
    container.remove();
  });

  it("navigates from a preview band to its exact source span", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TextProgressionCapturePanel showRomanNumerals={false}
      onConvert={vi.fn()} onPreview={vi.fn()} onStop={vi.fn()} onSaveExtended={vi.fn()} />));
    await press(container.querySelector<HTMLButtonElement>('[data-testid="text-mode-extended"]')!);
    const editor = container.querySelector<HTMLTextAreaElement>('[data-testid="extended-text-input"]')!;
    await write(editor, "#メモ\n| C % = _ | F/C |");
    const band = container.querySelector<HTMLButtonElement>('[data-testid="text-preview-band"]')!;
    const start = Number(band.dataset.sourceStart);
    const end = Number(band.dataset.sourceEnd);
    await press(band);
    expect(editor.selectionStart).toBe(start);
    expect(editor.selectionEnd).toBe(end);
    expect(editor.value.slice(start, end)).toBe("C % =");
    expect(container.querySelector('[data-testid="extended-text-section"]')?.textContent).toBe("メモ");
    const later = editor.value.indexOf("F/C");
    await act(async () => {
      editor.setSelectionRange(later, later);
      editor.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }));
    });
    expect(container.querySelector<HTMLButtonElement>('[data-testid="text-preview-band"][data-selected="true"]')
      ?.textContent).toContain("F/C");
    await act(async () => root.unmount());
    container.remove();
  });

  it("freezes whole playback on Play and applies edits only on the next Play", async () => {
    const calls: Array<{ readonly notes: readonly { readonly pitch: number; readonly startBeat: number }[]; readonly bpm: number }> = [];
    const driver: PlaybackAudioDriver = {
      playChord: vi.fn(async (_chord, _sound, lifecycle) => { lifecycle.onStarted?.(); }),
      playTimeline: vi.fn(async (_timeline, _bpm, _sound, lifecycle) => { lifecycle.onStarted?.(); }),
      playNotes: vi.fn(async (notes, bpm, _sound, lifecycle) => {
        calls.push({ notes, bpm });
        lifecycle.onStarted?.();
      }),
      stop: vi.fn(),
    };
    const controller = createPlaybackController(driver);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TextProgressionCapturePanel showRomanNumerals={false}
      controller={controller} onConvert={vi.fn()} onPreview={vi.fn()} onStop={() => controller.stop()}
      onSaveExtended={vi.fn()} />));
    await press(container.querySelector<HTMLButtonElement>('[data-testid="text-mode-extended"]')!);
    const editor = container.querySelector<HTMLTextAreaElement>('[data-testid="extended-text-input"]')!;
    await write(editor, "| C % = _ | F |");
    await press(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-play"]')!);
    expect(calls).toHaveLength(1);
    const original = calls[0]!.notes;
    await write(editor, "| Dm % = _ | G |");
    expect(calls).toHaveLength(1);
    expect(controller.getState().request?.type).toBe("notes");
    expect(container.querySelector('[data-testid="extended-text-frozen-playback"]')).not.toBeNull();
    await press(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-play"]')!);
    await press(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-play"]')!);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.notes).not.toEqual(original);
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the frozen whole request until score end and starts with metronome disabled", async () => {
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
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TextProgressionCapturePanel showRomanNumerals={false}
      controller={controller} onConvert={vi.fn()} onPreview={vi.fn()} onStop={() => controller.stop()}
      onSaveExtended={vi.fn()} />));
    await press(container.querySelector<HTMLButtonElement>('[data-testid="text-mode-extended"]')!);
    await write(container.querySelector<HTMLTextAreaElement>('[data-testid="extended-text-input"]')!, "| C |");
    expect([...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.includes("メトロノーム"))).toBeUndefined();
    await press([...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.includes("ループ"))!);
    await press(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-play"]')!);
    expect(played).toHaveLength(1);
    expect(played[0]?.every(note => note.velocity !== 46)).toBe(true);
    await act(async () => finish[0]?.());
    // Audio's release tail can complete before trailing score time; the score
    // timer owns the loop boundary and must not restart early.
    expect(played).toHaveLength(1);
    expect(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-play"]')?.textContent)
      .toContain("一時停止");
    await press(container.querySelector<HTMLButtonElement>('[data-testid="text-transport-stop"]')!);
    await act(async () => root.unmount());
    container.remove();
  });

  it("allows save while showing a distinct practice limitation for exact unsupported grid", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSaveExtended = vi.fn(() => true);
    await act(async () => root.render(<TextProgressionCapturePanel showRomanNumerals={false}
      onConvert={vi.fn()} onPreview={vi.fn()} onStop={vi.fn()} onSaveExtended={onSaveExtended} />));
    await press(container.querySelector<HTMLButtonElement>('[data-testid="text-mode-extended"]')!);
    await write(container.querySelector<HTMLTextAreaElement>('[data-testid="extended-text-input"]')!,
      "| C Dm G7 F Am |");
    expect(container.querySelector('[data-testid="extended-text-practice-limit"]')?.textContent).toContain("invalid-timing");
    const save = container.querySelector<HTMLButtonElement>('[data-testid="extended-text-save"]')!;
    expect(save.disabled).toBe(false);
    await press(save);
    expect(onSaveExtended).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    container.remove();
  });

  it("previews and submits all 150 authored synthetic bars without a partial-save state", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSaveExtended = vi.fn((_result: ExtendedTextResult) => true);
    await act(async () => root.render(<TextProgressionCapturePanel showRomanNumerals={false}
      onConvert={vi.fn()} onPreview={vi.fn()} onStop={vi.fn()} onSaveExtended={onSaveExtended} />));
    await press(container.querySelector<HTMLButtonElement>('[data-testid="text-mode-extended"]')!);
    const chart = extendedTextSyntheticChart(150);
    await write(container.querySelector<HTMLTextAreaElement>('[data-testid="extended-text-input"]')!, chart.source);
    expect(container.querySelectorAll('[data-testid="extended-text-bar"]')).toHaveLength(150);
    expect(container.querySelectorAll('[data-testid="text-preview-row"]').length).toBeGreaterThan(1);
    expect(container.querySelectorAll('[data-testid="text-preview-band"]').length).toBeGreaterThan(0);
    expect(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-save"]')?.disabled).toBe(false);
    await press(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-save"]')!);
    expect(onSaveExtended).toHaveBeenCalledOnce();
    expect(onSaveExtended.mock.calls[0]?.[0].slots).toHaveLength(chart.expectedSlots);
    await act(async () => root.unmount());
    container.remove();
  });
});
