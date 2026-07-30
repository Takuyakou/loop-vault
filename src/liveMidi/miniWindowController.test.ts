import { describe, expect, it, vi } from "vitest";
import {
  clampWindowBounds,
  MiniWindowController,
  type LiveMidiWindowAdapter,
  type LiveMidiWindowHandle,
  type MonitorWorkArea,
} from "./miniWindowController";

const monitor: MonitorWorkArea = { id: "primary", bounds: { x: 0, y: 0, width: 1920, height: 1040 } };

function harness() {
  let current: LiveMidiWindowHandle | undefined;
  let createCount = 0;
  let destroyCount = 0;
  let focusCount = 0;
  const makeHandle = (): LiveMidiWindowHandle => ({
    bounds: vi.fn(async () => ({ x: 20, y: 30, width: 420, height: 260 })),
    focusAndShow: vi.fn(async () => { focusCount += 1; }),
    destroy: vi.fn(async () => {
      destroyCount += 1;
      current = undefined;
    }),
  });
  const adapter: LiveMidiWindowAdapter = {
    get: vi.fn(async () => current),
    create: vi.fn(async () => {
      createCount += 1;
      current = makeHandle();
      return current;
    }),
    monitors: vi.fn(async () => [monitor]),
    showMain: vi.fn(async () => undefined),
  };
  return {
    adapter,
    counts: () => ({ createCount, destroyCount, focusCount }),
  };
}

describe("clampWindowBounds", () => {
  it("moves an off-screen window into the available work area", () => {
    expect(clampWindowBounds({ x: 3000, y: -900, width: 420, height: 260 }, [monitor])).toEqual({
      x: 1500, y: 0, width: 420, height: 260,
    });
  });

  it("uses the preferred monitor and keeps the minimum mini size", () => {
    const second = { id: "second", bounds: { x: 1920, y: 0, width: 1280, height: 720 } };
    expect(clampWindowBounds({ x: 0, y: 0, width: 100, height: 100 }, [monitor, second], "second")).toEqual({
      x: 1920, y: 0, width: 320, height: 200,
    });
  });
});

describe("MiniWindowController", () => {
  it("focuses the existing single instance instead of creating a duplicate", async () => {
    const test = harness();
    const controller = new MiniWindowController(test.adapter);
    expect(await controller.open()).toBe("created");
    expect(await controller.open()).toBe("focused");
    expect(test.counts()).toEqual({ createCount: 1, destroyCount: 0, focusCount: 2 });
  });

  it("survives fifty open, focus and close cycles without duplicate windows", async () => {
    const test = harness();
    const controller = new MiniWindowController(test.adapter);
    for (let index = 0; index < 50; index += 1) {
      await Promise.all([controller.open(), controller.open(), controller.open()]);
      await controller.close();
    }
    expect(test.counts()).toEqual({ createCount: 50, destroyCount: 50, focusCount: 50 });
  });

  it("shows the main window without closing the mini window", async () => {
    const test = harness();
    const controller = new MiniWindowController(test.adapter);
    await controller.open();
    await controller.showMain();
    expect(test.adapter.showMain).toHaveBeenCalledOnce();
    expect(test.counts().destroyCount).toBe(0);
  });
});
