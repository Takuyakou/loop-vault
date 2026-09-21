/**
 * P5.36-01 attack-provenance tests. Shadow/diagnostic only. They pin the bucket
 * provenance + descriptive metrics and, crucially, assert the instrument does NOT
 * conflate "more than one attack region" with "more than one harmony": same-chord
 * re-attack, rolled/arpeggiated chords, and a layered extended chord are single
 * harmonies whose metrics must be readable as such, while only the true
 * two-harmony fixture shows genuinely distinct per-bucket evidence + bass change.
 */

import { describe, expect, it } from "vitest";

import { analyzeAttackProvenance, type WindowProvenance } from "./attackProvenance";
import {
  arpeggiatedOneChord,
  boundaryCase,
  layeredExtendedChord,
  rolledOneChord,
  sameChordReattack,
  structuralBassChange,
  syncopatedAttack,
  trueTwoHarmony,
} from "./fixtures";

function w0(data: Parameters<typeof analyzeAttackProvenance>[0]): WindowProvenance {
  const r = analyzeAttackProvenance(data);
  return r.windows[0]!;
}

describe("attack provenance — hard negatives (one harmony, >1 attack region)", () => {
  it("same-chord re-attack: two attack regions but identical PCs (inflation 0)", () => {
    const w = w0(sameChordReattack);
    expect(w.onsetClusterCount).toBe(2); // two attack regions
    expect(w.unionPcCount).toBe(4); // one Bm7
    expect(w.pcInflation).toBe(0);
    expect(w.crossBucketJaccard).toBe(1); // buckets identical
    expect(w.bassChange).toBe(false);
  });

  it("rolled one chord: 4 onset clusters, held bass, union is still one 4-note chord", () => {
    const w = w0(rolledOneChord);
    expect(w.onsetClusterCount).toBe(4);
    expect(w.unionPcCount).toBe(4); // one chord's PCs despite crossing the boundary
    expect(w.pcInflation).toBe(2); // upper voices split across buckets
    expect(w.bassChange).toBe(false); // B held throughout — not a bass change
  });

  it("arpeggiated one chord: 4 onsets, union is one triad", () => {
    const w = w0(arpeggiatedOneChord);
    expect(w.onsetClusterCount).toBe(4);
    expect(w.unionPcCount).toBe(3); // one C-major triad
  });

  it("layered extended chord: disjoint buckets but held bass and a single valid Cmaj9", () => {
    const w = w0(layeredExtendedChord);
    expect(w.unionPcCount).toBe(5); // Cmaj9
    expect(w.pcInflation).toBe(2);
    expect(w.crossBucketOverlapPcCount).toBe(0); // lower vs upper structure, disjoint PCs
    expect(w.bassChange).toBe(false); // C held — disjoint buckets do NOT prove two harmonies
  });
});

describe("attack provenance — true positive & bass provenance", () => {
  it("true two-harmony: distinct per-bucket evidence + bass change", () => {
    const w = w0(trueTwoHarmony);
    expect(w.bassChange).toBe(true); // C -> A
    expect(w.crossBucketOverlapPcCount).toBe(1); // only E shared
    expect(w.unionPcCount).toBe(5);
    expect(w.pcInflation).toBe(2);
  });

  it("structural-bass change with same harmony: bass moves but PC evidence does not inflate", () => {
    const w = w0(structuralBassChange);
    expect(w.bassChange).toBe(true); // C -> E bass
    expect(w.pcInflation).toBe(0); // same C-major PC content — bass change is NOT harmony change
  });

  it("syncopated late attack is bucketed to bucket 1", () => {
    const w = w0(syncopatedAttack);
    const b = w.attacks.find((a) => a.pitchClass === 11); // the B at beat 1.5
    expect(b?.beatBucket).toBe(1);
    expect(w.onsetClusterCount).toBe(2);
  });
});

describe("attack provenance — boundary, immutability, determinism", () => {
  it("bucket assignment follows the floor rule at the ±1-tick boundary (deterministic)", () => {
    const before = w0(boundaryCase(-1)).attacks.find((a) => a.pitchClass === 2)!.beatBucket;
    const at = w0(boundaryCase(0)).attacks.find((a) => a.pitchClass === 2)!.beatBucket;
    const after = w0(boundaryCase(1)).attacks.find((a) => a.pitchClass === 2)!.beatBucket;
    expect(before).toBe(0); // 1 tick before the boundary -> bucket 0
    expect(at).toBe(1); // exactly on the boundary -> bucket 1
    expect(after).toBe(1);
    // Re-running is identical (documented boundary sensitivity is deterministic).
    expect(w0(boundaryCase(0)).attacks.find((a) => a.pitchClass === 2)!.beatBucket).toBe(at);
  });

  it("never mutates the source data", () => {
    const before = JSON.stringify(trueTwoHarmony);
    analyzeAttackProvenance(trueTwoHarmony);
    analyzeAttackProvenance(layeredExtendedChord);
    expect(JSON.stringify(trueTwoHarmony)).toBe(before);
  });

  it("is deterministic (identical output across runs)", () => {
    for (const fx of [sameChordReattack, rolledOneChord, trueTwoHarmony, layeredExtendedChord]) {
      const a = analyzeAttackProvenance(fx);
      const b = analyzeAttackProvenance(fx);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});
