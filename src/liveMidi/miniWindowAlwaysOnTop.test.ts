import { describe, expect, it, vi } from "vitest";
import {
  MiniWindowController,
  type LiveMidiWindowAdapter,
  type LiveMidiWindowHandle,
  type MonitorWorkArea,
} from "./miniWindowController";

const monitor: MonitorWorkArea = { id: "primary", bounds: { x: 0, y: 0, width: 1920, height: 1040 } };

/**
 * P23-26 S7/C3: the preference reaches the window. `App.tsx` opens the small window with
 * `controller.open(preferences.miniBounds, preferences.alwaysOnTop ?? true)`, and the controller hands that
 * value to the adapter that creates the OS window.
 */
describe("the small window takes the always-on-top preference (P23-26 S7)", () => {
  it("passes the value it is given to the window that is created", async () => {
    const created: boolean[] = [];
    const makeHandle = (): LiveMidiWindowHandle => ({
      bounds: vi.fn(async () => ({ x: 20, y: 30, width: 420, height: 260 })),
      focusAndShow: vi.fn(async () => undefined),
      destroy: vi.fn(async () => { current = undefined; }),
    });
    let current: LiveMidiWindowHandle | undefined;
    const adapter: LiveMidiWindowAdapter = {
      get: vi.fn(async () => current),
      create: vi.fn(async (_bounds, alwaysOnTop) => {
        created.push(alwaysOnTop);
        current = makeHandle();
        return current;
      }),
      monitors: vi.fn(async () => [monitor]),
      showMain: vi.fn(async () => undefined),
    };

    const controller = new MiniWindowController(adapter);
    // 初めは入(記録が無いときの既定は true)。
    expect(await controller.open(undefined, true)).toBe("created");
    expect(created).toEqual([true]);
    await controller.close();

    // 切にすると、次に開いた窓は手前に出ない。
    expect(await controller.open({ x: 20, y: 30, width: 420, height: 260 }, false)).toBe("created");
    expect(created).toEqual([true, false]);
  });
});
