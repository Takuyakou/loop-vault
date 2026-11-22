import { describe, expect, it, vi } from "vitest";
import { fadeInView, preferredScrollBehavior } from "./motion";

describe("preferredScrollBehavior", () => {
  it("keeps smooth navigation by default", () => {
    expect(preferredScrollBehavior(undefined)).toBe("smooth");
  });

  it("uses immediate navigation when reduced motion is requested", () => {
    const matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;

    expect(preferredScrollBehavior(matchMedia)).toBe("auto");
  });
});

describe("fadeInView (P23-03)", () => {
  const noReduce = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
  const reduce = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;

  it("fades an element in once over 180 ms", () => {
    const animate = vi.fn();
    fadeInView({ animate } as unknown as HTMLElement, noReduce);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]?.[0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(animate.mock.calls[0]?.[1]).toMatchObject({ duration: 180 });
  });

  it("does nothing with reduced motion", () => {
    const animate = vi.fn();
    fadeInView({ animate } as unknown as HTMLElement, reduce);
    expect(animate).not.toHaveBeenCalled();
  });

  it("does nothing without animate or without an element", () => {
    expect(() => fadeInView({} as HTMLElement, noReduce)).not.toThrow();
    expect(() => fadeInView(null, noReduce)).not.toThrow();
    expect(() => fadeInView(undefined, noReduce)).not.toThrow();
  });
});
