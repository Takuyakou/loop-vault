import { describe, expect, it, vi } from "vitest";
import {
  clampWindowBounds,
  MiniWindowController,
  type MainWindowSnapshot,
  type MiniWindowAdapter,
  type MonitorWorkArea,
} from "./miniWindowController";

const monitor: MonitorWorkArea = { id: "primary", bounds: { x: 0, y: 0, width: 1920, height: 1040 } };

function adapter(snapshot: MainWindowSnapshot) {
  const value: MiniWindowAdapter = {
    snapshot: vi.fn(async () => snapshot),
    currentBounds: vi.fn(async () => ({ x: 20, y: 30, width: 340, height: 200 })),
    monitors: vi.fn(async () => [monitor]),
    prepareForBounds: vi.fn(async () => undefined),
    setBounds: vi.fn(async () => undefined),
    setMinSize: vi.fn(async () => undefined),
    setAlwaysOnTop: vi.fn(async () => undefined),
    setFullscreen: vi.fn(async () => undefined),
    maximize: vi.fn(async () => undefined),
    focus: vi.fn(async () => undefined),
  };
  return value;
}

describe("clampWindowBounds", () => {
  it("moves an off-screen window into the available work area", () => {
    expect(clampWindowBounds({ x: 3000, y: -900, width: 340, height: 200 }, [monitor])).toEqual({
      x: 1580, y: 0, width: 340, height: 200,
    });
  });

  it("uses the preferred monitor and keeps the minimum mini size", () => {
    const second = { id: "second", bounds: { x: 1920, y: 0, width: 1280, height: 720 } };
    expect(clampWindowBounds({ x: 0, y: 0, width: 100, height: 100 }, [monitor, second], "second")).toEqual({
      x: 1920, y: 0, width: 280, height: 160,
    });
  });
});

describe("MiniWindowController", () => {
  it("restores normal bounds and always-on-top after ten round trips", async () => {
    const main: MainWindowSnapshot = {
      position: { x: 100, y: 120 }, size: { width: 1120, height: 760 }, maximized: false, fullscreen: false, monitorId: "primary",
    };
    const mock = adapter(main);
    const controller = new MiniWindowController(mock);
    for (let index = 0; index < 10; index += 1) {
      await controller.enter();
      await controller.exit();
    }
    expect(mock.setAlwaysOnTop).toHaveBeenCalledTimes(20);
    expect(mock.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(mock.setBounds).toHaveBeenLastCalledWith({ x: 100, y: 120, width: 1120, height: 760 });
  });

  it("restores maximized and fullscreen states", async () => {
    const maximized = adapter({ position: { x: 0, y: 0 }, size: { width: 1120, height: 760 }, maximized: true, fullscreen: false });
    const first = new MiniWindowController(maximized);
    await first.enter();
    await first.exit();
    expect(maximized.maximize).toHaveBeenCalledOnce();

    const fullscreen = adapter({ position: { x: 0, y: 0 }, size: { width: 1120, height: 760 }, maximized: false, fullscreen: true });
    const second = new MiniWindowController(fullscreen);
    await second.enter();
    await second.exit();
    expect(fullscreen.setFullscreen).toHaveBeenCalledWith(true);
  });
});
