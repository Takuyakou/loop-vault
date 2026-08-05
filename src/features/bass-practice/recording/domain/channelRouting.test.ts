import { describe, expect, it } from "vitest";
import { resolveAutoChannel, resolveChannel } from "./channelRouting";

describe("channel routing", () => {
  it("maps explicit modes directly", () => {
    expect(resolveChannel("left")).toBe("left");
    expect(resolveChannel("right")).toBe("right");
    expect(resolveChannel("mono-sum")).toBe("mono-sum");
  });

  it("auto picks the confidently louder channel", () => {
    expect(resolveAutoChannel({ left: 0.5, right: 0.05 })).toEqual({ ok: true, channel: "left" });
    expect(resolveAutoChannel({ left: 0.05, right: 0.6 })).toEqual({ ok: true, channel: "right" });
  });

  it("auto declines on silence and on ambiguity", () => {
    expect(resolveAutoChannel({ left: 0.001, right: 0.001 })).toEqual({ ok: false, reason: "silent" });
    expect(resolveAutoChannel({ left: 0.4, right: 0.38 })).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("auto wins outright when the other channel is fully silent", () => {
    expect(resolveAutoChannel({ left: 0.3, right: 0 })).toEqual({ ok: true, channel: "left" });
  });

  it("resolveChannel returns undefined for undecided auto so the UI can re-pick", () => {
    expect(resolveChannel("auto", { ok: false, reason: "ambiguous" })).toBeUndefined();
    expect(resolveChannel("auto", { ok: true, channel: "right" })).toBe("right");
    expect(resolveChannel("auto")).toBeUndefined();
  });

  it("rejects invalid energies", () => {
    expect(() => resolveAutoChannel({ left: -1, right: 0 })).toThrow(RangeError);
    expect(() => resolveAutoChannel({ left: Number.NaN, right: 0 })).toThrow(RangeError);
  });
});
