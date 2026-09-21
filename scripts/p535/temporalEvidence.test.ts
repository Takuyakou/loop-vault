/**
 * P5.35-01 shadow temporal-evidence classifier tests. Shadow-only: these never
 * assert on or touch production ranking. They pin the role semantics that
 * distinguish held/common-tone/carryover WITHOUT collapsing to an onset rule.
 */

import { describe, expect, it } from "vitest";

import {
  classifyTemporalEvidence,
  type ClassificationResult,
  type EvidenceRole,
  type WindowEvidence,
} from "./temporalEvidence";
import {
  arpeggio,
  bassRestrike,
  boundaryCase,
  commonTone,
  contamination,
  genuineTransition,
  heldHarmony,
  padSustain,
  shortTransient,
  structuralBassSlash,
  song,
} from "./fixtures";

function win(result: ClassificationResult, index: number): WindowEvidence {
  const w = result.windows[index];
  if (!w) throw new Error(`no window ${index}`);
  return w;
}

function countRoles(w: WindowEvidence): Record<EvidenceRole, number> {
  const counts = {
    CURRENT_ATTACK: 0,
    CURRENT_SUSTAIN: 0,
    COMMON_TONE: 0,
    CARRIED_IN_SUSTAIN: 0,
    STRUCTURAL_BASS: 0,
    SHORT_TRANSIENT: 0,
    UNCERTAIN: 0,
  } as Record<EvidenceRole, number>;
  for (const c of w.contributions) counts[c.role] += 1;
  return counts;
}

describe("classifyTemporalEvidence — role semantics", () => {
  it("labels fresh attacks in the current window (not carryover)", () => {
    const r = classifyTemporalEvidence(heldHarmony);
    const c = countRoles(win(r, 0));
    expect(c.CURRENT_ATTACK).toBeGreaterThanOrEqual(1);
    expect(c.STRUCTURAL_BASS).toBe(1); // lowest C is the structural bass
    expect(c.CARRIED_IN_SUSTAIN).toBe(0);
  });

  it("held current harmony is NOT mislabeled wholesale as carryover", () => {
    const r = classifyTemporalEvidence(heldHarmony);
    const w = win(r, 1); // notes sustain, no new harmony
    expect(w.heldWindow).toBe(true);
    const c = countRoles(w);
    expect(c.CARRIED_IN_SUSTAIN).toBe(0);
    expect(c.CURRENT_SUSTAIN).toBeGreaterThanOrEqual(1);
  });

  it("pad / long sustain stays current across held windows", () => {
    const r = classifyTemporalEvidence(padSustain);
    for (const idx of [1, 2]) {
      const w = win(r, idx);
      expect(w.heldWindow).toBe(true);
      expect(countRoles(w).CARRIED_IN_SUSTAIN).toBe(0);
    }
  });

  it("a shared pitch across a change is a COMMON_TONE, not contamination", () => {
    const r = classifyTemporalEvidence(commonTone);
    const w = win(r, 1); // Am9 attacks; sustained G is shared
    const c = countRoles(w);
    expect(c.COMMON_TONE).toBeGreaterThanOrEqual(1);
    expect(c.CARRIED_IN_SUSTAIN).toBe(0);
  });

  it("prior-harmony carryover produces distinct CARRIED_IN_SUSTAIN evidence", () => {
    const r = classifyTemporalEvidence(contamination);
    const w = win(r, 1); // Bm7 attacks over sustained C/E/G
    const c = countRoles(w);
    expect(c.CARRIED_IN_SUSTAIN).toBe(3); // C, E, G foreign to Bm7
    expect(c.CURRENT_ATTACK).toBeGreaterThanOrEqual(3); // D, F#, A
    expect(c.STRUCTURAL_BASS).toBe(1); // B bass
  });

  it("structural bass is a role, not the root (slash chord)", () => {
    const r = classifyTemporalEvidence(structuralBassSlash);
    const bass = win(r, 0).contributions.filter((x) => x.role === "STRUCTURAL_BASS");
    expect(bass).toHaveLength(1);
    expect(bass[0].pc).toBe(4); // E is the bass; classifier does NOT force it to root C (0)
  });

  it("short ornament is a SHORT_TRANSIENT", () => {
    const r = classifyTemporalEvidence(shortTransient);
    expect(countRoles(win(r, 0)).SHORT_TRANSIENT).toBe(1);
  });

  it("bass re-strike does not manufacture a new-harmony boundary", () => {
    const r = classifyTemporalEvidence(bassRestrike);
    const w = win(r, 1);
    expect(w.heldWindow).toBe(true);
    const c = countRoles(w);
    expect(c.CARRIED_IN_SUSTAIN).toBe(0);
    expect(c.CURRENT_SUSTAIN).toBeGreaterThanOrEqual(3);
  });

  it("arpeggio steps are real attacks, not carryover or uncertain", () => {
    const r = classifyTemporalEvidence(arpeggio);
    const c = countRoles(win(r, 0));
    expect(c.CARRIED_IN_SUSTAIN).toBe(0);
    expect(c.UNCERTAIN).toBe(0);
  });

  it("genuine two-chord boundary carries nothing across", () => {
    const r = classifyTemporalEvidence(genuineTransition);
    expect(countRoles(win(r, 1)).CARRIED_IN_SUSTAIN).toBe(0);
  });
});

describe("classifyTemporalEvidence — robustness / invariants", () => {
  it("is robust to ±1-tick boundary jitter (no manufactured carryover/uncertain)", () => {
    for (const offset of [-1, 0, 1]) {
      const r = classifyTemporalEvidence(boundaryCase(offset));
      expect(r.roleCounts.CARRIED_IN_SUSTAIN).toBe(0);
      expect(r.roleCounts.UNCERTAIN).toBe(0);
    }
  });

  it("never mutates the source data (immutability)", () => {
    const before = JSON.stringify(contamination);
    classifyTemporalEvidence(contamination);
    expect(JSON.stringify(contamination)).toBe(before);
  });

  it("is deterministic (same input → identical output)", () => {
    const a = classifyTemporalEvidence(contamination);
    const b = classifyTemporalEvidence(contamination);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("contaminated vs clean windows yield distinct role distributions", () => {
    const clean = classifyTemporalEvidence(heldHarmony).roleCounts;
    const dirty = classifyTemporalEvidence(contamination).roleCounts;
    expect(clean.CARRIED_IN_SUSTAIN).toBe(0);
    expect(dirty.CARRIED_IN_SUSTAIN).toBeGreaterThan(0);
    expect(JSON.stringify(clean)).not.toBe(JSON.stringify(dirty));
  });

  it("cost is bounded: every contribution is accounted for exactly once", () => {
    // Stress: 200 back-to-back chords over 400 beats.
    const notes = [];
    for (let i = 0; i < 200; i += 1) {
      const start = i * 96; // one beat each
      notes.push(
        { pitch: 48, startTick: start, durationTick: 96 },
        { pitch: 52, startTick: start, durationTick: 96 },
        { pitch: 55, startTick: start, durationTick: 96 },
      );
    }
    const r = classifyTemporalEvidence(song(notes, 100));
    const summed = Object.values(r.roleCounts).reduce((a, b) => a + b, 0);
    expect(summed).toBe(r.contributionsProcessed);
    expect(r.contributionsProcessed).toBeGreaterThan(0);
    expect(Number.isFinite(r.contributionsProcessed)).toBe(true);
  });
});
