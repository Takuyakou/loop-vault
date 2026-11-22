// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureInputModeSelector, type CaptureInputMode } from "./CaptureInputModeSelector";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
});

async function mount(value: CaptureInputMode, options: { disabled?: boolean; onChange?: (mode: CaptureInputMode) => void } = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const onChange = options.onChange ?? vi.fn();
  await act(async () => root?.render(
    <CaptureInputModeSelector value={value} disabled={options.disabled} onChange={onChange} />,
  ));
  return { container: host, onChange };
}

const group = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-testid='capture-input-mode']")!;
const buttons = (container: HTMLElement) => [...container.querySelectorAll<HTMLButtonElement>("button")];

describe("the MIDI / テキスト switch (P23-11)", () => {
  it("S1 marks the MIDI side as chosen", async () => {
    const { container } = await mount("midi");
    expect(group(container).getAttribute("role")).toBe("group");
    expect(group(container).getAttribute("aria-label")).toBe("入力方法");
    expect(group(container).getAttribute("data-value")).toBe("midi");
    expect(buttons(container).map((button) => button.textContent?.trim())).toEqual(["MIDI", "テキスト"]);
    expect(buttons(container).map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
  });

  it("S2 marks the テキスト side as chosen", async () => {
    const { container } = await mount("text");
    expect(group(container).getAttribute("data-value")).toBe("text");
    expect(buttons(container).map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("S3 reports the side that was pressed", async () => {
    const { container, onChange } = await mount("midi");
    await act(async () => buttons(container)[1]?.click());
    expect(onChange).toHaveBeenCalledWith("text");
    expect(onChange).toHaveBeenCalledTimes(1);
    await act(async () => buttons(container)[0]?.click());
    expect(onChange).toHaveBeenCalledWith("midi");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("S4 disables both sides", async () => {
    const { container } = await mount("midi", { disabled: true });
    expect(buttons(container).map((button) => button.disabled)).toEqual([true, true]);
  });

  it("S5 draws the two pictures as decoration", async () => {
    const { container } = await mount("midi");
    const pictures = [...container.querySelectorAll("svg")];
    expect(pictures).toHaveLength(2);
    expect(pictures.map((picture) => picture.getAttribute("aria-hidden"))).toEqual(["true", "true"]);
  });
});
