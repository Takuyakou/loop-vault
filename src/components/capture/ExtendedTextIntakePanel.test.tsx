// @vitest-environment jsdom
import { act } from "react";
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
    expect(container.querySelector('[data-testid="text-intake-bpm-field"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="text-intake-bpm-drag"]')).not.toBeNull();
    await press([...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("キー C majorを使う"))!);
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

  it("explains an invalid raw bar in Japanese with a reason and source span", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TextProgressionCapturePanel language="ja" showRomanNumerals={false}
      onConvert={vi.fn()} onPreview={vi.fn()} onStop={vi.fn()} onSaveExtended={vi.fn()} />));
    await press(container.querySelector<HTMLButtonElement>('[data-testid="text-mode-extended"]')!);
    await write(container.querySelector<HTMLTextAreaElement>('[data-testid="extended-text-input"]')!, "| C///E | F |");
    const bar = container.querySelector('[data-testid="extended-text-bar"][data-state="error"]');
    expect(bar?.textContent).toContain("C///E");
    expect(bar?.textContent).toContain("解析できない元テキスト");
    const diagnostic = container.querySelector('[data-testid="extended-text-diagnostics"] [data-reason="INVALID_STRUCTURE"]');
    expect(diagnostic?.textContent).toContain("書式を確認してください");
    expect(diagnostic?.getAttribute("data-span-start")).not.toBeNull();
    expect(diagnostic?.getAttribute("data-span-end")).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-save"]')?.disabled).toBe(true);
    await act(async () => root.unmount());
    container.remove();
  });

  it("previews and submits all 150 authored synthetic bars without a partial-save state", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSaveExtended = vi.fn((_result: ExtendedTextResult) => true);
    await act(async () => root.render(<TextProgressionCapturePanel language="ja" showRomanNumerals={false}
      onConvert={vi.fn()} onPreview={vi.fn()} onStop={vi.fn()} onSaveExtended={onSaveExtended} />));
    await press(container.querySelector<HTMLButtonElement>('[data-testid="text-mode-extended"]')!);
    const chart = extendedTextSyntheticChart(150);
    await write(container.querySelector<HTMLTextAreaElement>('[data-testid="extended-text-input"]')!, chart.source);
    expect(container.querySelectorAll('[data-testid="extended-text-bar"]')).toHaveLength(150);
    expect(container.querySelectorAll('[data-testid="extended-text-slot"]')).toHaveLength(chart.expectedSlots);
    expect(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-save"]')?.disabled).toBe(false);
    await press(container.querySelector<HTMLButtonElement>('[data-testid="extended-text-save"]')!);
    expect(onSaveExtended).toHaveBeenCalledOnce();
    expect(onSaveExtended.mock.calls[0]?.[0].slots).toHaveLength(chart.expectedSlots);
    await act(async () => root.unmount());
    container.remove();
  });
});
