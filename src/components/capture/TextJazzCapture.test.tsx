// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { TextProgressionCapturePanel } from "./TextProgressionCapturePanel";

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
  // P24-05: one grammar, one screen; the two dialects' halves of this check are now the same screen.
  it("shows the registered count and the failed symbols before save", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const save = vi.fn(() => true), preview = vi.fn();
    await act(async () => root.render(<TextProgressionCapturePanel showRomanNumerals={false}
      onConvert={vi.fn()} onPreview={preview} onStop={vi.fn()}
      onSaveStandard={save} onSaveExtended={save} />));
    const input = query<HTMLTextAreaElement>(container, "text-progression-input");
    await write(input, "| G7alt | G7alt/D |");
    // P23-17 V3: the voicing note lives in the 「?」 face.
    await click(query(container, "text-help"));
    expect(query(container, "text-voicing-availability").textContent).toContain("1 / 2コード");
    expect(query(container, "text-voicing-unavailable").textContent).toContain("G7alt/D");
    // R-03: the per-version storage notice is no longer on the capture screen; the storage split itself is unchanged.
    expect(container.querySelector('[data-testid="text-storage-compatibility"]')).toBeNull();
    const cards = container.querySelectorAll<HTMLButtonElement>('[data-testid="text-preview-band"]');
    await click(cards[0]!); expect(preview).toHaveBeenCalledOnce();
    await click(cards[1]!); expect(preview).toHaveBeenCalledOnce();
    expect(query<HTMLButtonElement>(container, "text-progression-preview").disabled).toBe(true);
    await click(query(container, "text-progression-save"));
    expect(save).toHaveBeenCalledOnce();
    await write(input, "| G7alt | Unknown |");
    expect(query<HTMLButtonElement>(container, "text-progression-save").disabled).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    await act(async () => root.unmount()); container.remove();
  });
});
