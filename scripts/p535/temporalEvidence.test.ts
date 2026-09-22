/**
 * P5.35-01 shadow temporal-evidence classifier tests. Shadow-only: these never
 * assert on or touch production ranking. They pin the ORTHOGONAL model — a
 * temporalRole plus independent structuralBass / shortTransient flags — and the
 * role semantics that distinguish held / common-tone / carryover WITHOUT
 * collapsing to an onset rule. No fixture chord label reaches the classifier.
 */

import { describe, expect, it } from "vitest";

import {
  classifyTemporalEvidence,
  type ClassificationResult,
  type NoteEvidence,
  type TemporalRole,
  type WindowEvidence,
} from "./temporalEvidence";
import {
  arpeggio,
  bassRestrike,
  boundaryCase,
  carriedStructuralBass,
  commonTone,
  contamination,
  genuineTransition,
  heldHarmony,
  padSustain,
  shortCurrentCharacteristicTone,
  shortTransient,
  structuralBassSlash,
  unrearticulatedCommonTone,
  song,
} from "./fixtures";

function win(result: ClassificationResult, index: number): WindowEvidence {
  const w = result.windows[index];
  if (!w) throw new Error(`no window ${index}`);
  return w;
}

function countRoles(w: WindowEvidence): Record<TemporalRole, number> {
  const counts = {
    CURRENT_ATTACK: 0,
    CURRENT_SUSTAIN: 0,
    COMMON_TONE: 0,
    CARRIED_IN_SUSTAIN: 0,
    UNCERTAIN: 0,
  } as Record<TemporalRole, number>;
  for (const c of w.contributions) counts[c.temporalRole] += 1;
  return counts;
}

function pick(w: WindowEvidence, pc: number): NoteEvidence {
  const c = w.contributions.find((x) => x.pc === pc);
  if (!c) throw new Error(`no contribution for pc ${pc}`);
  return c;
}

function countFlag(w: WindowEvidence, flag: "structuralBass" | "shortTransient"): number {
  return w.contributions.filter((c) => c[flag]).length;
}

describe("classifyTemporalEvidence — role semantics", () => {
  it("labels fresh attacks in the current window (not carryover)", () => {
    const r = classifyTemporalEvidence(heldHarmony);
    const w = win(r, 0);
    const c = countRoles(w);
    expect(c.CURRENT_ATTACK).toBeGreaterThanOrEqual(1);
    expect(countFlag(w, "structuralBass")).toBe(1); // lowest C flagged, but temporally a current attack
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

  it("a re-articulated shared pitch is a COMMON_TONE, not contamination", () => {
    const r = classifyTemporalEvidence(commonTone);
    const w = win(r, 1); // Am9 attacks; sustained G is re-struck
    const c = countRoles(w);
    expect(c.COMMON_TONE).toBeGreaterThanOrEqual(1);
    expect(c.CARRIED_IN_SUSTAIN).toBe(0);
  });

  it("an UNREARTICULATED shared pitch is still protected as a common tone (§2)", () => {
    const r = classifyTemporalEvidence(unrearticulatedCommonTone);
    const w = win(r, 1); // Am attacks (A bass + C); E sustains, NOT re-attacked
    const e = pick(w, 4); // E
    expect(e.temporalRole).toBe("COMMON_TONE");
    expect(e.reason).toBe("current-harmonic-support"); // via runtime support, not the label
    expect(countRoles(w).CARRIED_IN_SUSTAIN).toBe(0);
  });

  it("prior-harmony carryover produces distinct CARRIED_IN_SUSTAIN evidence", () => {
    const r = classifyTemporalEvidence(contamination);
    const w = win(r, 1); // Bm7 attacks over sustained C/E/G
    const c = countRoles(w);
    expect(c.CARRIED_IN_SUSTAIN).toBe(3); // C, E, G foreign to Bm7
    expect(c.CURRENT_ATTACK).toBe(4); // B, D, F#, A
    expect(pick(w, 11).structuralBass).toBe(true); // B is the structural bass (flag)
  });
});

describe("classifyTemporalEvidence — orthogonal role/flag preservation", () => {
  it("structural bass is a flag, not a temporal role, and not forced to root (slash chord)", () => {
    const r = classifyTemporalEvidence(structuralBassSlash);
    const w = win(r, 0);
    const bass = w.contributions.filter((x) => x.structuralBass);
    expect(bass).toHaveLength(1);
    expect(bass[0].pc).toBe(4); // E is the bass; not forced to root C (0)
    expect(bass[0].temporalRole).toBe("CURRENT_ATTACK"); // it still attacks now
  });

  it("carried structural bass keeps BOTH carryover role and bass flag (§3)", () => {
    const r = classifyTemporalEvidence(carriedStructuralBass);
    const w = win(r, 1); // F#m attacks over a stale low C bass
    const staleBass = pick(w, 0); // C
    expect(staleBass.structuralBass).toBe(true);
    expect(staleBass.temporalRole).toBe("CARRIED_IN_SUSTAIN"); // not forced to dominate
    expect(countRoles(w).CURRENT_ATTACK).toBeGreaterThanOrEqual(3); // fresh F#m evidence exists
  });

  it("short current characteristic tone keeps BOTH current attack and transient flag (§4)", () => {
    const r = classifyTemporalEvidence(shortCurrentCharacteristicTone);
    const third = pick(win(r, 0), 4); // E, the current major 3rd, very short
    expect(third.temporalRole).toBe("CURRENT_ATTACK"); // flag does not erase current evidence
    expect(third.shortTransient).toBe(true);
  });

  it("a short ornament carries the transient flag while staying a current attack", () => {
    const r = classifyTemporalEvidence(shortTransient);
    const w = win(r, 0);
    expect(countFlag(w, "shortTransient")).toBe(1);
    expect(pick(w, 6).shortTransient).toBe(true); // F# grace
    expect(pick(w, 6).temporalRole).toBe("CURRENT_ATTACK");
  });
});

describe("classifyTemporalEvidence — robustness / invariants", () => {
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
    classifyTemporalEvidence(unrearticulatedCommonTone);
    classifyTemporalEvidence(carriedStructuralBass);
    expect(JSON.stringify(contamination)).toBe(before);
  });

  it("is deterministic (same input → identical output)", () => {
    for (const fx of [contamination, unrearticulatedCommonTone, carriedStructuralBass]) {
      const a = classifyTemporalEvidence(fx);
      const b = classifyTemporalEvidence(fx);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("contaminated vs clean windows yield distinct role distributions", () => {
    const clean = classifyTemporalEvidence(heldHarmony).roleCounts;
    const dirty = classifyTemporalEvidence(contamination).roleCounts;
    expect(clean.CARRIED_IN_SUSTAIN).toBe(0);
    expect(dirty.CARRIED_IN_SUSTAIN).toBeGreaterThan(0);
    expect(JSON.stringify(clean)).not.toBe(JSON.stringify(dirty));
  });

  it("cost is bounded: every contribution is accounted for exactly once", () => {
    // Stress: 200 back-to-back chords over 200 beats.
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
