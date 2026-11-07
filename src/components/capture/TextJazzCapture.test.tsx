// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { TextProgressionCapturePanel } from "./TextProgressionCapturePanel";
import { createPlaybackController, type PlaybackAudioDriver } from "../../audio/playbackController";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const query = <T extends Element>(container: HTMLElement, id: string) => container.querySelector<T>(`[data-testid="${id}"]`)!;
async function write(element: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  });
}
async function click(element: HTMLElement) { await act(async () => element.click()); }

describe("TXT-JAZZ Capture registration disclosure and audition", () => {
  it.each(["standard", "extended"] as const)("shows %s registered count and failed symbols before save", async dialect => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const save = vi.fn(() => true), preview = vi.fn();
    const driver: PlaybackAudioDriver = { playChord: vi.fn(async () => {}), playTimeline: vi.fn(async () => {}), stop: vi.fn() };
    const controller = createPlaybackController(driver);
    await act(async () => root.render(<TextProgressionCapturePanel showRomanNumerals={false}
      onConvert={vi.fn()} onPreview={preview} onStop={controller.stop}
      onSaveStandard={save} onSaveExtended={save} controller={controller} />));
    if (dialect === "extended") await click(query(container, "text-mode-extended"));
    const input = query<HTMLTextAreaElement>(container, dialect === "standard" ? "text-progression-input" : "extended-text-input");
    await write(input, "| G7alt | G7alt/D |");
    expect(query(container, "text-voicing-availability").textContent).toContain("1 / 2コード");
    expect(query(container, "text-voicing-unavailable").textContent).toContain("G7alt/D");
    // R-03: the per-version storage notice is no longer on the capture screen; the storage split itself is unchanged.
    expect(container.querySelector('[data-testid="text-storage-compatibility"]')).toBeNull();
    if (dialect === "standard") {
      const cards = container.querySelectorAll<HTMLButtonElement>('[data-testid="text-progression-card"]');
      await click(cards[0]!); expect(preview).toHaveBeenCalledOnce();
      await click(cards[1]!); expect(preview).toHaveBeenCalledOnce();
      expect(query<HTMLButtonElement>(container, "text-progression-preview").disabled).toBe(true);
    } else {
      const bands = container.querySelectorAll<HTMLElement>('[data-testid="text-preview-band"]');
      await click(bands[0]!);
      expect(driver.playChord).toHaveBeenCalledWith(expect.objectContaining({ altered: true }),
        expect.anything(), expect.anything(), [43, 63, 65, 70, 71]);
      await click(bands[1]!);
      expect(driver.playChord).toHaveBeenCalledOnce();
      expect(container.textContent).toContain("試聴の音を作れません: G7alt/D");
    }
    await click(query(container, dialect === "standard" ? "text-progression-save" : "extended-text-save"));
    expect(save).toHaveBeenCalledOnce();
    await write(input, "| G7alt | Unknown |");
    expect(query<HTMLButtonElement>(container, dialect === "standard" ? "text-progression-save" : "extended-text-save").disabled).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    await act(async () => root.unmount()); container.remove();
  });
});
