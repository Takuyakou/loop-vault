import { describe, expect, it } from "vitest";
import { analyzeMidi } from "./analysis";
import {
  attenuateRootBonus, evaluateQualityEvidence, missingQualityTonePenalty,
  qualityDefiningIntervals,
} from "./qualityEvidence";

/** Weight histogram from a set of sounding pitch classes. */
function histogramOf(pitchClasses: readonly number[]): number[] {
  const histogram = Array(12).fill(0) as number[];
  for (const pitchClass of pitchClasses) histogram[pitchClass] += 1;
  return histogram;
}

describe("quality-defining intervals", () => {
  it("requires the third that names the quality", () => {
    expect(qualityDefiningIntervals("maj")).toContain(4);
    expect(qualityDefiningIntervals("min")).toContain(3);
    expect(qualityDefiningIntervals("min11")).toContain(3);
    expect(qualityDefiningIntervals("maj7")).toEqual([4, 11]);
    expect(qualityDefiningIntervals("dom7")).toEqual([4, 10]);
  });

  it("requires the altered fifth only where it defines the quality", () => {
    expect(qualityDefiningIntervals("dim")).toEqual([3, 6]);
    expect(qualityDefiningIntervals("aug")).toEqual([4, 8]);
  });

  it("uses the suspended tone instead of a third", () => {
    expect(qualityDefiningIntervals("sus2")).toEqual([2]);
    expect(qualityDefiningIntervals("sus4")).toEqual([5]);
    expect(qualityDefiningIntervals("dom7sus4")).toEqual([5, 10]);
  });

  it("never requires the root or a plain fifth", () => {
    // Rootless voicings are common and the fifth is the first tone dropped.
    for (const quality of ["maj", "min", "maj7", "min7", "dom7", "min11"] as const) {
      expect(qualityDefiningIntervals(quality)).not.toContain(0);
      expect(qualityDefiningIntervals(quality)).not.toContain(7);
    }
  });
});

describe("evidence measurement", () => {
  it("reports full coverage when the defining tones sound", () => {
    // C E G: the major third is present.
    const evidence = evaluateQualityEvidence(0, "maj", histogramOf([0, 4, 7]), 3);
    expect(evidence.coverage).toBe(1);
    expect(evidence.missingPenalty).toBe(0);
  });

  it("charges a chord that claims minor without a minor third", () => {
    // E F# A D, the `endless endless chord` bar: no G, so Em11 is unsupported.
    const histogram = histogramOf([4, 6, 9, 2]);
    const evidence = evaluateQualityEvidence(4, "min11", histogram, 4);
    expect(evidence.coverage).toBeLessThan(1);
    expect(evidence.missingPenalty).toBeGreaterThan(0);
  });

  it("does not charge the major reading of the same notes", () => {
    // The same notes read as D major with an added ninth: the major third F# is there.
    const evidence = evaluateQualityEvidence(2, "add9", histogramOf([4, 6, 9, 2]), 4);
    expect(evidence.coverage).toBe(1);
    expect(evidence.missingPenalty).toBe(0);
  });

  it("scales the penalty with how much evidence is missing", () => {
    const none = evaluateQualityEvidence(0, "dom7", histogramOf([0, 7]), 2);
    const half = evaluateQualityEvidence(0, "dom7", histogramOf([0, 4, 7]), 3);
    expect(none.coverage).toBe(0);
    expect(none.missingPenalty).toBeCloseTo(missingQualityTonePenalty, 6);
    expect(half.coverage).toBe(0.5);
    expect(half.missingPenalty).toBeCloseTo(missingQualityTonePenalty / 2, 6);
  });

  it("ignores a tone too quiet to be a real chord tone", () => {
    const histogram = Array(12).fill(0) as number[];
    histogram[0] = 100;
    histogram[4] = 0.5;
    const evidence = evaluateQualityEvidence(0, "maj", histogram, 100.5);
    expect(evidence.coverage).toBe(0);
  });

  it("stays neutral for a silent window", () => {
    expect(evaluateQualityEvidence(0, "maj", histogramOf([]), 0).coverage).toBe(1);
  });
});

describe("bass attenuation", () => {
  it("keeps the root bonus intact when the quality is fully evidenced", () => {
    expect(attenuateRootBonus(0.18, 1)).toBeCloseTo(0.18, 6);
  });

  it("reduces the root bonus when the defining tone is missing", () => {
    expect(attenuateRootBonus(0.18, 0)).toBeCloseTo(0.18 * 0.4, 6);
    expect(attenuateRootBonus(0.18, 0)).toBeLessThan(attenuateRootBonus(0.18, 1));
  });
});

describe("analyzer modes", () => {
  it("leaves the legacy analyzer untouched", () => {
    const bytes = thirdlessMidi();
    const legacy = analyzeMidi(bytes, { mode: "legacy" });
    expect(legacy.analyzerVersion).toBe("legacy-v1");
    // Legacy still names a minor chord without its third.
    expect(legacy.fullTimeline[0].chord.quality.startsWith("min")).toBe(true);
  });

  it("reports its own analyzer version for phase4", () => {
    const phase4 = analyzeMidi(thirdlessMidi(), { mode: "phase4-v1" });
    expect(phase4.analyzerVersion).toBe("phase4-symbolic-v1");
  });

  it("stops naming a minor chord that has no minor third", () => {
    const phase4 = analyzeMidi(thirdlessMidi(), { mode: "phase4-v1" });
    const chord = phase4.fullTimeline[0].chord;
    expect(chord.quality.startsWith("min")).toBe(false);
  });

  it("stays deterministic", () => {
    const bytes = thirdlessMidi();
    expect(analyzeMidi(bytes, { mode: "phase4-v1" }))
      .toEqual(analyzeMidi(bytes, { mode: "phase4-v1" }));
  });
});

/** E F# A D sustained: the notes that legacy reads as Em11 without a G. */
function thirdlessMidi(): Uint8Array {
  const header = [
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0,
  ];
  const events: number[] = [];
  const pitches = [40, 54, 57, 62];
  for (const pitch of pitches) {
    events.push(0x00, 0x90, pitch, 0x64);
  }
  events.push(0x87, 0x40, 0x80, pitches[0], 0x00);
  for (const pitch of pitches.slice(1)) {
    events.push(0x00, 0x80, pitch, 0x00);
  }
  events.push(0x00, 0xff, 0x2f, 0x00);
  const length = events.length;
  return Uint8Array.from([
    ...header,
    0x4d, 0x54, 0x72, 0x6b,
    (length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff,
    ...events,
  ]);
}
