import { describe, expect, it } from "vitest";
import { EXTENDED_TEXT_TIMING_PPQ, parseExtendedTextProgression } from "./extendedTextProgression";

describe("P8.8.1 exact Extended timing", () => {
  it.each([1, 2, 3, 4, 5, 6, 8, 12, 16])("keeps %i equal slots on an exact 960-tick grid", slotCount => {
    const source = ["C", ...Array.from({ length: slotCount - 1 }, () => "=")].join(" ");
    const result = parseExtendedTextProgression(source, { beat: "4/4" });
    expect(result.state, JSON.stringify(result.diagnostics)).toBe("VALID");
    expect(result.slots).toHaveLength(slotCount);
    expect(result.slots.every(slot => Number.isSafeInteger(slot.startTick)
      && Number.isSafeInteger(slot.durationTicks))).toBe(true);
    expect(result.slots.map(slot => slot.startTick))
      .toEqual(Array.from({ length: slotCount }, (_, index) => index * 4 * EXTENDED_TEXT_TIMING_PPQ / slotCount));
    expect(result.slots.reduce((total, slot) => total + slot.durationTicks, 0))
      .toBe(4 * EXTENDED_TEXT_TIMING_PPQ);
    expect(result.harmonicSpans).toHaveLength(1);
    expect(result.harmonicSpans[0]?.durationTicks).toBe(4 * EXTENDED_TEXT_TIMING_PPQ);
    expect(result.harmonicSpans[0]?.attacks).toHaveLength(1);
  });

  it("preserves compact eight-slot bars, rests, holds and repeated attacks", () => {
    const source = "C=C%_CC_";
    const result = parseExtendedTextProgression(source);
    expect(result.state, JSON.stringify(result.diagnostics)).toBe("VALID");
    expect(result.slots).toHaveLength(8);
    expect(result.slots.map(slot => slot.startTick))
      .toEqual([0, 480, 960, 1440, 1920, 2400, 2880, 3360]);
    expect(result.slots.map(slot => slot.kind))
      .toEqual(["attack", "hold", "attack", "reattack", "rest", "attack", "attack", "rest"]);
    expect(result.harmonicSpans.flatMap(span => span.attacks.map(attack => attack.tick)))
      .toEqual([0, 960, 1440, 2400, 2880]);
  });

  it("parses the authored compound witness with no token or attack loss", () => {
    const source = "EM7_EM7=_EM7_Eaug/A#|=%_Eaug/A#=%=_";
    const result = parseExtendedTextProgression(source);
    expect(result.state, JSON.stringify(result.diagnostics)).toBe("VALID");
    expect(result.bars).toHaveLength(2);
    expect(result.slots).toHaveLength(16);
    expect(result.slots.filter(slot => slot.kind === "rest").length).toBeGreaterThan(0);
    expect(result.harmonicSpans.flatMap(span => span.attacks).length)
      .toBe(result.slots.filter(slot => slot.kind === "attack" || slot.kind === "reattack").length);
    expect(result.harmonicSpans.every(span => span.startTick + span.durationTicks <= 8 * EXTENDED_TEXT_TIMING_PPQ))
      .toBe(true);
  });
});