// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CaptureDraftSessionBar } from "./CaptureDraftSessionBar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("CaptureDraftSessionBar", () => {
  it("exposes A, B, shared Stop, unsaved state, and the Capture shortcuts", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onPreviewSource = vi.fn();
    const onPreviewEdited = vi.fn();
    const onStop = vi.fn();
    const onRequestDiscard = vi.fn();
    await act(async () => root.render(
      <CaptureDraftSessionBar
        dirty
        sourceAvailable
        playing={null}
        onPreviewSource={onPreviewSource}
        onPreviewEdited={onPreviewEdited}
        onStop={onStop}
        onRequestDiscard={onRequestDiscard}
      />,
    ));

    const source = container.querySelector<HTMLButtonElement>('[data-preview-side="source"]')!;
    const edited = container.querySelector<HTMLButtonElement>('[data-preview-side="edited"]')!;
    await act(async () => {
      source.click();
      edited.click();
      container.querySelector<HTMLButtonElement>('[aria-label="試聴を停止"]')?.click();
    });

    expect(onPreviewSource).toHaveBeenCalledOnce();
    expect(onPreviewEdited).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("未保存");
    expect(container.textContent).toContain("Shift+F10/Menu");

    await act(async () => root.unmount());
  });

  it("disables A when the Draft has no source MIDI voicing", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <CaptureDraftSessionBar
        dirty={false}
        sourceAvailable={false}
        playing={null}
        onPreviewSource={vi.fn()}
        onPreviewEdited={vi.fn()}
        onStop={vi.fn()}
        onRequestDiscard={vi.fn()}
      />,
    ));

    expect(container.querySelector<HTMLButtonElement>(
      '[data-preview-side="source"]',
    )?.disabled).toBe(true);
    expect(container.textContent).toContain("保存済みの状態");
    expect(container.querySelector('[aria-label="試聴を停止"]')?.className)
      .toContain("h-10");

    await act(async () => root.unmount());
  });
});
