import { describe, expect, it } from "vitest";
import { recoverMostlyOffscreenWindow } from "./mainWindowWorkArea";

const primary = { x: 0, y: 0, width: 1920, height: 1040 };
const secondary = { x: 1920, y: 0, width: 1600, height: 860 };

describe("main window work area recovery", () => {
  it("leaves valid normal and partially overlapping bounds untouched", () => {
    expect(recoverMostlyOffscreenWindow({ x: 400, y: 120, width: 1100, height: 760 }, [primary])).toBeUndefined();
    expect(recoverMostlyOffscreenWindow({ x: 1800, y: 20, width: 600, height: 700 }, [primary, secondary])).toBeUndefined();
    expect(recoverMostlyOffscreenWindow({ x: 0, y: 750, width: 1100, height: 560 }, [primary])).toBeUndefined();
  });

  it("moves a largely unreachable window onto the nearest monitor work area", () => {
    expect(recoverMostlyOffscreenWindow({ x: 3400, y: 780, width: 1100, height: 760 }, [primary, secondary]))
      .toEqual({ x: 2420, y: 100, width: 1100, height: 760 });
  });

  it("reduces an oversized offscreen window only enough to fit", () => {
    expect(recoverMostlyOffscreenWindow({ x: -3000, y: -3000, width: 2400, height: 1200 }, [primary]))
      .toEqual({ x: 0, y: 0, width: 1920, height: 1040 });
  });
});
