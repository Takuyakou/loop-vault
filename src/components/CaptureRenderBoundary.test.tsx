// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureRenderBoundary } from "./CaptureRenderBoundary";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.restoreAllMocks();
});

describe("CaptureRenderBoundary", () => {
  it("keeps a Capture rendering failure from blanking the application", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onReset = vi.fn();
    await render(
      <CaptureRenderBoundary language="ja" resetKey="midi-a" onReset={onReset}>
        <BrokenCapture />
      </CaptureRenderBoundary>,
    );

    const alert = host?.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.textContent).toContain("MIDI解析結果を表示できませんでした");
    expect(alert?.textContent).toContain("render failed");

    const reset = [...alert!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "MIDI選択へ戻る");
    await act(async () => reset?.click());
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("recovers automatically when a different analysis is supplied", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await render(
      <CaptureRenderBoundary language="en" resetKey="midi-a" onReset={vi.fn()}>
        <BrokenCapture />
      </CaptureRenderBoundary>,
    );
    expect(host?.querySelector('[role="alert"]')).not.toBeNull();

    await act(async () => root?.render(
      <CaptureRenderBoundary language="en" resetKey="midi-b" onReset={vi.fn()}>
        <p>Recovered Capture</p>
      </CaptureRenderBoundary>,
    ));

    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(host?.textContent).toContain("Recovered Capture");
  });
});

function BrokenCapture(): never {
  throw new Error("render failed");
}

async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
}
