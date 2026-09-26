// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { createPlaybackController, type PlaybackAudioDriver } from "../../audio/playbackController";
import { PreviewSoundProvider, usePreviewSound } from "../PreviewSoundProvider";
import { GlobalMetronomeButton } from "../GlobalMetronomeButton";
import { MetronomeProvider } from "../MetronomeProvider";
import { TextProgressionCapturePanel } from "./TextProgressionCapturePanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { window.localStorage.clear(); document.body.replaceChildren(); });

function SoundSwitch() {
  const { sound, setSound } = usePreviewSound();
  return <button type="button" data-testid="sound-switch"
    onClick={() => setSound(sound === "piano" ? "electric-piano" : "piano")}>{sound}</button>;
}
async function press(element: HTMLElement) { await act(async () => element.click()); }
async function write(input: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => { setter?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}

it("routes Text audio through global Piano/EP and uses each Text transport BPM for shared clicks", async () => {
  const driver: PlaybackAudioDriver = {
    playChord: vi.fn(async (_chord, _sound, lifecycle) => lifecycle.onStarted?.()),
    playTimeline: vi.fn(async (_timeline, _bpm, _sound, lifecycle) => lifecycle.onStarted?.()),
    playNotes: vi.fn(async (_notes, _bpm, _sound, lifecycle) => lifecycle.onStarted?.()),
    stop: vi.fn(),
  };
  const controller = createPlaybackController(driver);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(
    <PreviewSoundProvider controller={controller}>
      <MetronomeProvider>
        <SoundSwitch /><GlobalMetronomeButton />
        <TextProgressionCapturePanel language="en" showRomanNumerals={false}
          controller={controller} onConvert={vi.fn()} onPreview={vi.fn()}
          onStop={() => controller.stop()} onSaveExtended={vi.fn()} />
      </MetronomeProvider>
    </PreviewSoundProvider>,
  ));
  await write(host.querySelector<HTMLTextAreaElement>("[data-testid='text-progression-input']")!, "| C |");
  await press(host.querySelector<HTMLElement>("[data-testid='text-transport-primary']")!);
  expect(vi.mocked(driver.playNotes!).mock.lastCall?.[1]).toBe(120);
  expect(vi.mocked(driver.playNotes!).mock.lastCall?.[2]).toBe("piano");
  expect(vi.mocked(driver.playNotes!).mock.lastCall?.[0]?.some(note => note.velocity === 46)).toBe(false);
  await press(host.querySelector<HTMLElement>("[data-testid='text-transport-stop']")!);
  await press(host.querySelector<HTMLElement>("[data-testid='global-metronome']")!);
  await press(host.querySelector<HTMLElement>("[data-testid='text-transport-primary']")!);
  expect(vi.mocked(driver.playNotes!).mock.lastCall?.[1]).toBe(120);
  expect(vi.mocked(driver.playNotes!).mock.lastCall?.[0]?.filter(note => note.velocity === 46)).toHaveLength(4);
  await press(host.querySelector<HTMLElement>("[data-testid='text-transport-stop']")!);
  await press(host.querySelector<HTMLElement>("[data-testid='sound-switch']")!);
  await press(host.querySelector<HTMLElement>("[data-testid='text-transport-primary']")!);
  expect(vi.mocked(driver.playNotes!).mock.lastCall?.[2]).toBe("electric-piano");
  await press(host.querySelector<HTMLElement>("[data-testid='text-transport-stop']")!);

  await press(host.querySelector<HTMLElement>("[data-testid='text-mode-extended']")!);
  await write(host.querySelector<HTMLTextAreaElement>("[data-testid='extended-text-input']")!, "| Dm % = _ |");
  const bpm = host.querySelector<HTMLInputElement>("#text-intake-bpm")!;
  await act(async () => {
    bpm.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(bpm, "88");
    bpm.dispatchEvent(new Event("input", { bubbles: true }));
    bpm.blur();
  });
  await press(host.querySelector<HTMLElement>("[data-testid='extended-text-play']")!);
  expect(vi.mocked(driver.playNotes!).mock.lastCall?.[1]).toBe(88);
  expect(vi.mocked(driver.playNotes!).mock.lastCall?.[2]).toBe("electric-piano");
  expect(vi.mocked(driver.playNotes!).mock.lastCall?.[0]?.some(note => note.velocity === 46)).toBe(true);
  await act(async () => root.unmount());
});
