/**
 * P5.35-02 shadow carryover-resistant ranking tests. Shadow-only: they assert the
 * shadow re-ranking behaves, and prove production is untouched. Fidelity guard:
 * the mirror weight at attenuation=1 reproduces the production histogram exactly.
 */

import { describe, expect, it } from "vitest";

import { buildWeightedWindows } from "../../src/domain/midi/legacy";
import { shadowRankWindows } from "./shadowRanking";
import {
  commonTone,
  contamination,
  guideToneChange,
  heldHarmony,
  padSustain,
  structuralBassSlash,
  unrearticulatedCommonTone,
} from "./fixtures";

describe("shadowRankWindows — fidelity & controls", () => {
  it("attenuation=1 reproduces the production histogram bit-for-bit (mirror guard)", () => {
    for (const fx of [contamination, heldHarmony, commonTone, structuralBassSlash]) {
      const prod = buildWeightedWindows(fx, new Map(), 2);
      const shadow = shadowRankWindows(fx, new Map(), { carryoverAttenuation: 1 });
      expect(shadow.windows).toHaveLength(prod.length);
      shadow.windows.forEach((w, i) => {
        expect(w.shadowHistogram).toEqual(prod[i].histogram);
      });
    }
  });

  it("attenuation=1 is a no-op control: shadow top-1 equals legacy top-1 everywhere", () => {
    for (const fx of [contamination, heldHarmony, commonTone, padSustain, structuralBassSlash]) {
      const r = shadowRankWindows(fx, new Map(), { carryoverAttenuation: 1 });
      expect(r.changedCount).toBe(0);
    }
  });
});

describe("shadowRankWindows — legitimate-harmony safety (no regression)", () => {
  // Held 9th chord, pad, re-articulated common tone, unrearticulated common tone,
  // and a C/E slash have NO carryover, so attenuation must never change them.
  for (const [name, fx] of [
    ["held maj9 (rich harmony)", heldHarmony],
    ["pad / long sustain", padSustain],
    ["re-articulated common tone", commonTone],
    ["unrearticulated common tone", unrearticulatedCommonTone],
    ["C/E slash", structuralBassSlash],
  ] as const) {
    it(`does not change ${name} at full attenuation`, () => {
      const r = shadowRankWindows(fx, new Map(), { carryoverAttenuation: 0 });
      expect(r.changedCount).toBe(0);
      expect(r.carriedContributionCount).toBe(0);
    });
  }
});

describe("shadowRankWindows — carryover resistance", () => {
  it("attenuates prior-harmony carryover and can re-rank the contaminated window", () => {
    const legacyControl = shadowRankWindows(contamination, new Map(), { carryoverAttenuation: 1 });
    const attenuated = shadowRankWindows(contamination, new Map(), { carryoverAttenuation: 0 });

    // Carryover is detected in the contaminated window (C/E/G = pcs 0,4,7).
    const w1 = attenuated.windows[1];
    expect(w1.carriedPcs).toEqual([0, 4, 7]);

    // Removing the carryover moves the shadow top-1 away from the legacy top-1
    // that the contaminated histogram produced (the payoff of the phase).
    expect(attenuated.changedCount).toBeGreaterThan(0);
    expect(w1.shadowChord).not.toBe(legacyControl.windows[1].legacyChord);
  });
});

describe("shadowRankWindows — ablation / sensitivity (§5)", () => {
  it("changed-window count is monotone-ish in attenuation and controlled at α=1", () => {
    const counts = [1, 0.5, 0].map(
      (a) => shadowRankWindows(contamination, new Map(), { carryoverAttenuation: a }).changedCount,
    );
    expect(counts[0]).toBe(0); // α=1 control: nothing changes
    expect(counts[2]).toBeGreaterThanOrEqual(counts[0]); // more attenuation, at least as many changes
  });

  it("reports the competing-threshold effect on a sparse guide-tone change", () => {
    // Diagnostic only: a 2-tone guide change meets competing>=2, so a foreign
    // sustained C is attenuable; the run stays deterministic and bounded.
    const r = shadowRankWindows(guideToneChange, new Map(), { carryoverAttenuation: 0 });
    expect(r.windows.length).toBeGreaterThan(0);
    expect(Number.isFinite(r.changedCount)).toBe(true);
  });
});

describe("shadowRankWindows — invariants", () => {
  it("never mutates the source data", () => {
    const before = JSON.stringify(contamination);
    shadowRankWindows(contamination, new Map(), { carryoverAttenuation: 0 });
    expect(JSON.stringify(contamination)).toBe(before);
  });

  it("is deterministic (identical output across runs)", () => {
    const a = shadowRankWindows(contamination, new Map(), { carryoverAttenuation: 0 });
    const b = shadowRankWindows(contamination, new Map(), { carryoverAttenuation: 0 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
