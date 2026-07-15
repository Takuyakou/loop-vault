// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UndoToast } from "../components/UndoToast";
import { useUndoQueue } from "./useUndoQueue";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("useUndoQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps consecutive deletions independent and commits each after five seconds", async () => {
    const ids = ["undo-1", "undo-2"];
    const firstUndo = vi.fn();
    const firstCommit = vi.fn();
    const secondUndo = vi.fn();
    const secondCommit = vi.fn();
    const mounted = await mountQueue(() => ids.shift()!);

    await act(async () => {
      mounted.api().enqueue({
        label: "Deleted first",
        payload: { parentId: "vault", index: 0, value: "first" },
        undo: firstUndo,
        commit: firstCommit,
      });
      mounted.api().enqueue({
        label: "Deleted second",
        payload: { parentId: "vault", index: 1, value: "second" },
        undo: secondUndo,
        commit: secondCommit,
      });
    });

    expect(mounted.container.textContent).toContain("Deleted first");
    expect(mounted.container.textContent).toContain("Deleted second");
    expect(mounted.api().actions).toHaveLength(2);

    await act(async () => {
      expect(mounted.api().undo("undo-1")).toBe(true);
    });
    expect(firstUndo).toHaveBeenCalledOnce();
    expect(firstCommit).not.toHaveBeenCalled();
    expect(mounted.api().actions.map((action) => action.id)).toEqual(["undo-2"]);

    await act(async () => vi.advanceTimersByTimeAsync(4999));
    expect(secondCommit).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(secondCommit).toHaveBeenCalledOnce();
    expect(secondUndo).not.toHaveBeenCalled();
    expect(mounted.api().actions).toHaveLength(0);
    await mounted.unmount();
  });

  it("commits an action even when the owner unmounts immediately after enqueue", async () => {
    const commit = vi.fn();
    const mounted = await mountQueue(() => "pending");
    await mounted.runAndUnmount(() => {
      mounted.api().enqueue({
        label: "Pending delete",
        payload: null,
        undo: vi.fn(),
        commit,
      });
    });

    expect(commit).toHaveBeenCalledOnce();
  });

  it("keeps failed undo actions and exposes commitAll and clearAll", async () => {
    const commits = [vi.fn(() => true), vi.fn(() => false)];
    let nextId = 0;
    const mounted = await mountQueue(() => `action-${++nextId}`);
    await act(async () => {
      mounted.api().enqueue({ label: "Throws", payload: null, undo: () => { throw new Error("no"); }, commit: commits[0] });
      mounted.api().enqueue({ label: "Returns false", payload: null, undo: () => false, commit: commits[1] });
    });

    expect(mounted.api().undo("action-1")).toBe(false);
    expect(mounted.api().undo("action-2")).toBe(false);
    expect(mounted.api().actions).toHaveLength(2);
    let committedAll = true;
    await act(async () => {
      committedAll = mounted.api().commitAll();
    });
    expect(committedAll).toBe(false);
    expect(commits[0]).toHaveBeenCalledOnce();
    expect(commits[1]).toHaveBeenCalledOnce();
    expect(mounted.api().actions.map((action) => action.id)).toEqual(["action-2"]);

    await act(async () => mounted.api().clearAll());
    expect(mounted.api().actions).toHaveLength(0);
    await mounted.unmount();
  });

  it("uses one live region, moves focus, stays below modals, and avoids the wide inspector", async () => {
    const mounted = await mountQueue(() => "positioned");
    await act(async () => {
      mounted.api().enqueue({
        label: "Deleted",
        payload: null,
        undo: vi.fn(),
      });
    });

    expect(mounted.container.querySelectorAll('[role="status"]')).toHaveLength(1);
    const stack = mounted.container.querySelector<HTMLElement>("[data-undo-toast-stack]");
    expect(stack?.className).toContain("z-40");
    expect(stack?.className).toContain("xl:left-4");
    expect(stack?.style.bottom).toContain("safe-area-inset-bottom");
    expect(stack?.className).toContain("overflow-y-auto");
    expect(stack?.style.maxHeight).toContain("100vh");
    expect(stack?.style.maxHeight).toContain("--lv-sticky-inspector-height");
    expect(document.activeElement).toBe(
      mounted.container.querySelector('[data-undo-action-id="positioned"]'),
    );
    await mounted.unmount();
  });

  it("keeps every Undo action reachable in a viewport-constrained stack", async () => {
    let nextId = 0;
    const undoCallbacks = Array.from({ length: 6 }, () => vi.fn());
    const mounted = await mountQueue(() => `stack-${++nextId}`);

    await act(async () => {
      undoCallbacks.forEach((undo, index) => {
        mounted.api().enqueue({
          label: `Deleted ${index + 1}`,
          payload: null,
          undo,
        });
      });
    });

    const stack = mounted.container.querySelector<HTMLElement>("[data-undo-toast-stack]");
    expect(stack?.querySelectorAll("[data-undo-action-id]")).toHaveLength(6);
    expect(stack?.className).toContain("overflow-y-auto");
    expect(stack?.className).toContain("overscroll-contain");
    expect(stack?.style.maxHeight).toBe(
      "calc(100vh - var(--lv-sticky-inspector-height, 0px) - env(safe-area-inset-bottom, 0px) - 2rem)",
    );
    expect(document.activeElement).toBe(
      stack?.querySelector('[data-undo-action-id="stack-6"]'),
    );

    const oldestUndo = stack?.querySelector<HTMLButtonElement>('[data-undo-action-id="stack-1"]');
    await act(async () => oldestUndo?.click());
    expect(undoCallbacks[0]).toHaveBeenCalledOnce();
    expect(stack?.querySelector('[data-undo-action-id="stack-1"]')).toBeNull();

    await mounted.unmount();
  });

  it("moves focus to the next undo action, then back to the deletion source", async () => {
    const ids = ["undo-1", "undo-2"];
    const source = document.createElement("button");
    source.textContent = "Delete source";
    document.body.append(source);
    const mounted = await mountQueue(() => ids.shift()!);

    source.focus();
    await act(async () => {
      mounted.api().enqueue({ label: "Deleted first", payload: null, undo: vi.fn() });
    });
    source.focus();
    await act(async () => {
      mounted.api().enqueue({ label: "Deleted second", payload: null, undo: vi.fn() });
    });

    await act(async () => {
      mounted.api().undo("undo-2");
    });
    expect(document.activeElement).toBe(
      mounted.container.querySelector('[data-undo-action-id="undo-1"]'),
    );

    await act(async () => {
      mounted.api().undo("undo-1");
    });
    expect(document.activeElement).toBe(source);

    source.remove();
    await mounted.unmount();
  });

  it("moves focus to a safe heading when a timed-out action source is gone", async () => {
    const source = document.createElement("button");
    document.body.append(source);
    const mounted = await mountQueue(() => "timed-out");
    source.focus();
    await act(async () => {
      mounted.api().enqueue({ label: "Deleted", payload: null, undo: vi.fn() });
    });
    source.remove();

    await act(async () => vi.advanceTimersByTimeAsync(5000));

    expect(document.activeElement).toBe(
      mounted.container.querySelector("[data-undo-fallback]"),
    );
    await mounted.unmount();
  });

  it("replaces the live-region node for consecutive identical labels", async () => {
    const ids = ["same-1", "same-2"];
    const mounted = await mountQueue(() => ids.shift()!);
    await act(async () => {
      mounted.api().enqueue({ label: "Deleted item", payload: null, undo: vi.fn() });
    });
    const firstAnnouncement = mounted.container.querySelector(
      "[data-live-announcement]",
    );

    await act(async () => {
      mounted.api().undo("same-1");
      mounted.api().enqueue({ label: "Deleted item", payload: null, undo: vi.fn() });
    });
    const secondAnnouncement = mounted.container.querySelector(
      "[data-live-announcement]",
    );

    expect(secondAnnouncement?.textContent).toBe("Deleted item");
    expect(secondAnnouncement).not.toBe(firstAnnouncement);
    expect(secondAnnouncement?.getAttribute("data-live-announcement")).not.toBe(
      firstAnnouncement?.getAttribute("data-live-announcement"),
    );
    await mounted.unmount();
  });
});

async function mountQueue(idFactory: () => string) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let latest: ReturnType<typeof useUndoQueue> | undefined;
  function Harness() {
    const fallbackFocusRef = useRef<HTMLHeadingElement>(null);
    latest = useUndoQueue({ durationMs: 5000, now: () => 1000, idFactory });
    return (<>
      <h1 ref={fallbackFocusRef} tabIndex={-1} data-undo-fallback>Loop Vault</h1>
      <UndoToast
          actions={latest.actions}
          undoLabel="Undo"
          onUndo={latest.undo}
          fallbackFocusRef={fallbackFocusRef}
        />
      </>
    );
  }
  await act(async () => root.render(<Harness />));
  return {
    container,
    api: () => latest!,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
    runAndUnmount: async (callback: () => void) => {
      await act(async () => {
        callback();
        root.unmount();
      });
      container.remove();
    },
  };
}
