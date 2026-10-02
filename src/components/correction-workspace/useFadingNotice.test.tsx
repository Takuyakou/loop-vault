// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFadingNotice } from "./useFadingNotice";

/** P10.3 §1: notices go after 5 s, stay while held, and a new one starts its own time. */

let api: ReturnType<typeof useFadingNotice>;
function Probe() {
  api = useFadingNotice();
  return <span>{api.notice ?? ""}</span>;
}

describe("the control bar's notice (P10.3 §1)", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(async () => {
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(<Probe />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
  });

  it("goes after 5 seconds", async () => {
    await act(async () => api.say("名前を Am7 にしました（音から）"));
    expect(container.textContent).toBe("名前を Am7 にしました（音から）");
    await act(async () => { vi.advanceTimersByTime(4900); });
    expect(container.textContent).toBe("名前を Am7 にしました（音から）");
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(container.textContent).toBe("");
  });

  it("stays while the pointer is on it, and a new notice starts its own 5 seconds", async () => {
    await act(async () => api.say("最初からやり直しました"));
    await act(async () => api.hold(true));
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(container.textContent).toBe("最初からやり直しました");
    await act(async () => api.hold(false));
    await act(async () => { vi.advanceTimersByTime(4000); });
    await act(async () => api.say("最初からやり直しました")); // the same words again: a new notice
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(container.textContent).toBe("最初からやり直しました");
    await act(async () => { vi.advanceTimersByTime(1100); });
    expect(container.textContent).toBe("");
  });
});
