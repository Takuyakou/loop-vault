import { describe, expect, it } from "vitest";
import { CLIP_THRESHOLD, meterSegments, readLevel } from "./levelMeter";

describe("input level meter", () => {
  it("returns zero for an empty or silent block", () => {
    expect(readLevel([])).toEqual({ rms: 0, peak: 0, clipping: false });
    expect(readLevel([0, 0, 0, 0])).toEqual({ rms: 0, peak: 0, clipping: false });
  });

  it("computes RMS and peak for a full-scale square wave", () => {
    const reading = readLevel([1, -1, 1, -1]);
    expect(reading.rms).toBeCloseTo(1, 6);
    expect(reading.peak).toBeCloseTo(1, 6);
    expect(reading.clipping).toBe(true);
  });

  it("computes a lower RMS than peak for a spiky block", () => {
    const reading = readLevel([0.5, 0, 0, 0]);
    expect(reading.peak).toBeCloseTo(0.5, 6);
    expect(reading.rms).toBeLessThan(reading.peak);
    expect(reading.clipping).toBe(false);
  });

  it("flags clipping at the threshold", () => {
    expect(readLevel([CLIP_THRESHOLD]).clipping).toBe(true);
    expect(readLevel([CLIP_THRESHOLD - 0.01]).clipping).toBe(false);
  });

  it("rejects non-finite samples and bad thresholds", () => {
    expect(() => readLevel([Number.NaN])).toThrow(RangeError);
    expect(() => readLevel([0.5], 0)).toThrow(RangeError);
  });

  it("maps RMS to a bounded number of meter segments", () => {
    expect(meterSegments(0, 10)).toBe(0);
    expect(meterSegments(1, 10)).toBe(10);
    expect(meterSegments(0.5, 10)).toBe(5);
    expect(meterSegments(2, 10)).toBe(10); // clamped
    expect(() => meterSegments(0.5, 0)).toThrow(RangeError);
  });
});
