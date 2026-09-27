// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useAppNavigation } from "./useAppNavigation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(onNavigate = vi.fn()) {
  const container = document.createElement("div");
  const root = createRoot(container);
  let api!: ReturnType<typeof useAppNavigation>;
  function Harness() {
    api = useAppNavigation({ onNavigate });
    return null;
  }
  act(() => root.render(<Harness />));
  return { api: () => api, onNavigate, unmount: () => act(() => root.unmount()) };
}

describe("useAppNavigation", () => {
  it("opens an Idea or a progression and navigates with the before-navigate hook", () => {
    const nav = mount();
    act(() => nav.api().openProgression("idea-1", "block-1"));
    expect(nav.api().view).toBe("progression-detail");
    expect(nav.api().selectedProgression).toEqual({ ideaId: "idea-1", blockId: "block-1" });
    act(() => nav.api().openDetail("idea-2"));
    expect(nav.api().view).toBe("detail");
    expect(nav.api().selectedId).toBe("idea-2");
    expect(nav.api().selectedProgression).toBeUndefined();
    act(() => nav.api().navigateTo("capture"));
    expect(nav.onNavigate).toHaveBeenCalledWith("capture", "detail");
    expect(nav.api().view).toBe("capture");
    nav.unmount();
  });

  it("holds navigation away from a dirty progression page until the pending leave runs", () => {
    const nav = mount();
    act(() => nav.api().openProgression("idea-1", "block-1"));
    act(() => nav.api().setProgressionDetailDirty(true));
    act(() => nav.api().navigateTo("library"));
    expect(nav.api().view).toBe("progression-detail");
    expect(nav.onNavigate).not.toHaveBeenCalled();
    const pending = nav.api().pendingProgressionLeave;
    expect(pending).toBeTypeOf("function");
    act(() => pending?.());
    expect(nav.api().view).toBe("library");
    expect(nav.onNavigate).toHaveBeenCalledWith("library", "progression-detail");
    nav.unmount();
  });
});
