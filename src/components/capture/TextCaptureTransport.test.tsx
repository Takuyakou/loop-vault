// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaybackController, type PlaybackAudioDriver } from "../../audio/playbackController";
import { TextProgressionCapturePanel } from "./TextProgressionCapturePanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const containers: HTMLElement[] = [];
afterEach(() => { for (const item of containers.splice(0)) item.remove(); });

async function write(input: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => { setter?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function press(element: HTMLElement) { await act(async () => { element.click(); }); }

function mount() {
  const driver: PlaybackAudioDriver = {
    playChord: vi.fn(async (_chord, _sound, lifecycle) => lifecycle.onStarted?.()),
    playTimeline: vi.fn(async (_timeline, _bpm, _sound, lifecycle) => lifecycle.onStarted?.()),
    playNotes: vi.fn(async (_notes, _bpm, _sound, lifecycle) => lifecycle.onStarted?.()),
    stop: vi.fn(),
  };
  const controller = createPlaybackController(driver);
  const container = document.createElement("div"); document.body.append(container); containers.push(container);
  const root = createRoot(container);
  return { container, controller, driver,
    async render() { await act(async () => root.render(<TextProgressionCapturePanel
      showRomanNumerals={false} controller={controller} onConvert={vi.fn()}
      onPreview={vi.fn()} onStop={() => controller.stop()} onSaveExtended={vi.fn()} />)); },
    async unmount() { await act(async () => root.unmount()); },
  };
}

describe("Text Capture exact seek", () => {
  it("Standard band seeks its exact two-cell event and bar number seeks separately", async () => {
    const h = mount(); await h.render();
    const input = h.container.querySelector<HTMLTextAreaElement>("[data-testid='text-progression-input']")!;
    await write(input, "| C Dm | F |");
    const bands = h.container.querySelectorAll<HTMLElement>("[data-testid='standard-text-preview'] [data-testid='text-preview-band']");
    await press(bands[1]!);
    expect(input.value.slice(input.selectionStart, input.selectionEnd)).toBe("Dm");
    expect(h.container.querySelector<HTMLElement>("[data-testid='text-smooth-playhead']")?.style.left).toBe("50%");
    await press(h.container.querySelector<HTMLElement>("[data-testid='text-transport-primary']")!);
    expect(h.container.querySelector<HTMLElement>("[data-testid='extended-text-bar'][data-bar='1']")?.dataset.playbackActive).toBe("true");
    const request = h.controller.getState().request;
    expect(request?.type).toBe("notes");
    if (request?.type === "notes") expect(request.notes.every(note => note.startBeat >= 0)).toBe(true);
    await press(h.container.querySelector<HTMLElement>("[data-testid='text-transport-stop']")!);
    const calls = vi.mocked(h.driver.playChord).mock.calls.length;
    await press(h.container.querySelectorAll<HTMLElement>("[data-testid='standard-text-preview'] [data-testid='text-preview-bar-select']")[1]!);
    expect(vi.mocked(h.driver.playChord).mock.calls.length).toBe(calls);
    await press(h.container.querySelector<HTMLElement>("[data-testid='text-transport-primary']")!);
    const fromSecondBar = h.controller.getState().request;
    expect(fromSecondBar?.type).toBe("notes");
    if (fromSecondBar?.type === "notes") expect(fromSecondBar.notes.every(note => note.startBeat === 0)).toBe(true);
    await h.unmount();
  });

  it("Extended reattack marker selects its own source token before exact seek", async () => {
    const h = mount(); await h.render();
    await press(h.container.querySelector<HTMLElement>("[data-testid='text-mode-extended']")!);
    const input = h.container.querySelector<HTMLTextAreaElement>("[data-testid='extended-text-input']")!;
    await write(input, "| C % = _ | Dm |");
    const repeat = h.container.querySelector<HTMLElement>("[data-testid='text-preview-attack'][data-kind='repeat']")!;
    await press(repeat);
    expect(input.value.slice(input.selectionStart, input.selectionEnd)).toBe("%");
    await press(h.container.querySelector<HTMLElement>("[data-testid='extended-text-play']")!);
    const request = h.controller.getState().request;
    expect(request?.type).toBe("notes");
    if (request?.type === "notes") expect(request.notes[0]?.startBeat).toBe(0);
    await write(input, "| Dm % = _ | G |");
    expect(h.container.querySelector("[data-testid='extended-text-frozen-playback']")).not.toBeNull();
    expect(h.container.querySelector<HTMLElement>("[data-testid='extended-text-bar'][data-bar='1']")?.dataset.playheadVisible).toBe("false");
    await h.unmount();
  });
});
