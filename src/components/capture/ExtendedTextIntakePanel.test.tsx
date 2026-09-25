// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { TextProgressionCapturePanel } from "./TextProgressionCapturePanel";
import type { ExtendedTextResult } from "../../domain/extendedTextProgression";

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
    const onSaveExtended = vi.fn((_result: ExtendedTextResult) => true);
    await act(async () => root.render(<TextProgressionCapturePanel language="ja" showRomanNumerals={false}
      onConvert={vi.fn()} onPreview={vi.fn()} onStop={vi.fn()} onSaveExtended={onSaveExtended} />));
    expect(container.querySelector('[data-testid="text-mode-standard"]')?.getAttribute("aria-pressed")).toBe("true");
    await write(container.querySelector<HTMLTextAreaElement>('[data-testid="text-progression-input"]')!, "# Key: C major\nC %|= =");
    expect(container.querySelector('[data-testid="text-extended-suggestion"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="extended-text-intake"]')).toBeNull();
    await press(container.querySelector<HTMLButtonElement>('[data-testid="text-mode-extended"]')!);
    expect(container.querySelector<HTMLTextAreaElement>('[data-testid="extended-text-input"]')?.value).toBe("# Key: C major\nC %|= =");
    expect(container.querySelectorAll('[data-testid="extended-text-bar"]')).toHaveLength(2);
    expect(container.querySelector('[data-testid="extended-text-section"]')?.textContent).toContain("Key: C major");
    expect(container.querySelector('[data-testid="extended-text-metadata"]')).toBeNull();
    await press([...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Key: C major を使う"))!);
    expect(container.querySelector('[data-testid="extended-text-metadata"]')?.textContent).toContain("C major");
    await press(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-save"]')!);
    expect(onSaveExtended).toHaveBeenCalledOnce();
    expect(onSaveExtended.mock.calls[0]?.[0].harmonicSpans[0].attacks).toHaveLength(2);
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps invalid input editable and blocks partial save", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSaveExtended = vi.fn((_result: ExtendedTextResult) => true);
    await act(async () => root.render(<TextProgressionCapturePanel language="en" showRomanNumerals={false}
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
});
