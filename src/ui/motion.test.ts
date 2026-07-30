import { describe, expect, it, vi } from "vitest";
import { preferredScrollBehavior } from "./motion";

describe("preferredScrollBehavior", () => {
  it("keeps smooth navigation by default", () => {
    expect(preferredScrollBehavior(undefined)).toBe("smooth");
  });

  it("uses immediate navigation when reduced motion is requested", () => {
    const matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;

    expect(preferredScrollBehavior(matchMedia)).toBe("auto");
  });
});
