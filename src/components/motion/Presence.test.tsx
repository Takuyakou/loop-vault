// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Presence } from "./Presence";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function reducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({ matches: reduce && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} })) as never;
}

async function mount(show: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async (next: boolean) => act(async () => root.render(
    <Presence show={next} exitMs={140} after={<i data-testid="after" />}>
      {(presence) => <div data-testid="part" data-presence={presence.state} onTransitionEnd={presence.onTransitionEnd} />}
    </Presence>,
  ));
  await render(show);
  return { host, render, part: () => host.querySelector<HTMLElement>("[data-testid='part']"), unmount: () => act(async () => root.unmount()) };
}

describe("P25-16 N3: Presence", () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

  it("draws the part hidden first and shows it after the hidden state has been painted (two frames)", async () => {
    reducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.push(callback); return frames.length; });
    const view = await mount(false);
    expect(view.part()).toBeNull();
    expect(view.host.querySelector("[data-testid='after']")).not.toBeNull();
    await view.render(true);
    expect(view.part()?.dataset.presence).toBe("enter");
    await act(async () => frames.splice(0).forEach((callback) => callback(0)));
    expect(view.part()?.dataset.presence).toBe("enter");
    await act(async () => frames.splice(0).forEach((callback) => callback(0)));
    expect(view.part()?.dataset.presence).toBe("shown");
    await view.unmount();
    vi.restoreAllMocks();
  });

  it("keeps the part while it leaves, until transitionend", async () => {
    reducedMotion(false);
    const view = await mount(true);
    await view.render(false);
    expect(view.part()?.dataset.presence).toBe("exit");
    await act(async () => view.part()!.dispatchEvent(new Event("transitionend", { bubbles: true })));
    expect(view.part()).toBeNull();
    expect(view.host.querySelector("[data-testid='after']")).not.toBeNull();
    await view.unmount();
  });

  it("removes the part after the leaving time + 80ms when no transitionend comes", async () => {
    reducedMotion(false);
    vi.useFakeTimers();
    const view = await mount(true);
    await view.render(false);
    await act(async () => { vi.advanceTimersByTime(219); });
    expect(view.part()?.dataset.presence).toBe("exit");
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(view.part()).toBeNull();
    await view.unmount();
  });

  it("is immediate both ways with prefers-reduced-motion", async () => {
    reducedMotion(true);
    const view = await mount(false);
    await view.render(true);
    expect(view.part()?.dataset.presence).toBe("shown");
    await view.render(false);
    expect(view.part()).toBeNull();
    await view.unmount();
  });
});
