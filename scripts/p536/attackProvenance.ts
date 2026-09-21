/**
 * P5.36-01 attack-provenance instrumentation (shadow / diagnostic only, pure,
 * deterministic).
 *
 * It splits each fixed legacy 2-beat analysis window into N equal beat buckets
 * (default 2 × 1-beat) and records, per attacked contribution, where in time it
 * lands — WITHOUT assuming any harmony. It NEVER changes production windows,
 * histograms, candidate sets, scores, ranks, or top-1; nothing here is wired into
 * the analyzer.
 *
 * CRITICAL (§3/§11): "attack inside the same 2-beat window" is NOT treated as
 * "same harmonic state". This module produces provenance + descriptive metrics
 * (attack counts, unique pitch classes per bucket, PC inflation, cross-bucket
 * similarity, structural-bass provenance, exact onset clusters). It does NOT
 * decide how many harmonies a window contains — that is deliberately out of scope
 * for Stage 01.
 */

import { normalizePc } from "../../src/domain/chords";
import { beatsPerBar } from "../../src/domain/midi/timing";
import { selectChordEvidenceNotes } from "../../src/domain/midi/voices";
import type { MidiSongData, TimedNote, TrackRole } from "../../src/domain/midi/types";

export interface ProvenanceOptions {
  readonly durationBeats?: 1 | 2 | 4;
  /** Number of equal sub-buckets per window (default 2 → two 1-beat buckets). */
  readonly bucketCount?: number;
  /** Near-boundary onset tolerance for counting an attack (diagnostic robustness). */
  readonly attackToleranceTicks?: number;
}

/** One attacked contribution's temporal provenance within a window. */
export interface AttackProvenance {
  readonly windowIndex: number;
  readonly windowStartBeat: number;
  readonly windowEndBeat: number;
  readonly absoluteAttackBeat: number;
  readonly relativeAttackBeat: number;
  readonly beatBucket: number;
  readonly pitchClass: number;
  readonly voiceRole: TrackRole;
  readonly structuralBass: boolean;
  readonly durationOverlapBeats: number;
  /** Exact-onset cluster id within the window (attacks sharing a startTick share an id). */
  readonly onsetClusterId: number;
  readonly attackOrderInWindow: number;
}

export interface BucketAggregate {
  readonly bucket: number;
  readonly attackCount: number;
  readonly uniquePcs: number[];
  readonly structuralBassAttackCount: number;
  readonly onsetClusterIds: number[];
  readonly durationOverlapBeats: number;
  /** Lowest bass-ish attacked pc in the bucket, or null if none. */
  readonly bassPc: number | null;
}

export interface WindowProvenance {
  readonly windowIndex: number;
  readonly startBeat: number;
  readonly endBeat: number;
  /** All overlapping (non-percussion) contributions — matches legacy noteCount. */
  readonly contributionCount: number;
  readonly attackCount: number;
  readonly unionPcs: number[];
  readonly unionPcCount: number;
  readonly maxSingleBucketPcCount: number;
  /** unionPcCount − maxSingleBucketPcCount: pitch evidence widened by merging buckets. */
  readonly pcInflation: number;
  readonly crossBucketOverlapPcCount: number;
  /** Jaccard similarity of bucket-0 vs bucket-1 attacked PC sets (0..1); 1 when identical. */
  readonly crossBucketJaccard: number;
  /** True when the two buckets' structural-bass pcs differ (both present). */
  readonly bassChange: boolean;
  readonly onsetClusterCount: number;
  readonly buckets: readonly BucketAggregate[];
  readonly attacks: readonly AttackProvenance[];
}

export interface ProvenanceResult {
  readonly windows: readonly WindowProvenance[];
}

function overlaps(note: TimedNote, startTick: number, endTick: number): boolean {
  return note.startTick < endTick && note.startTick + note.durationTick > startTick;
}

function overlapBeats(note: TimedNote, startTick: number, endTick: number, ticksPerBeat: number): number {
  const t = Math.min(note.startTick + note.durationTick, endTick) - Math.max(note.startTick, startTick);
  return Math.max(0, t / ticksPerBeat);
}

function isBassish(pitch: number, role: TrackRole): boolean {
  return pitch < 60 || role === "bass";
}

function jaccard(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

/**
 * Computes per-window attack provenance and descriptive bucket metrics. Pure:
 * never mutates `data`/notes. Deterministic: fixed iteration order, exact-onset
 * clusters, no clock/random. Bounded: notes × windows.
 */
export function analyzeAttackProvenance(
  data: MidiSongData,
  roles: Map<number, TrackRole> = new Map(),
  options: ProvenanceOptions = {},
): ProvenanceResult {
  const durationBeats = options.durationBeats ?? 2;
  const bucketCount = Math.max(1, options.bucketCount ?? 2);
  const tol = options.attackToleranceTicks ?? 2;
  const ticksPerBeat = Math.max(1, data.ticksPerBeat);
  const bucketBeats = durationBeats / bucketCount;

  const evidence = selectChordEvidenceNotes(data.notes).filter(
    (n) => (roles.get(n.trackIndex) ?? "mixed") !== "percussion",
  );
  const totalBeats = Math.max(durationBeats, data.totalBars * beatsPerBar(data.timeSignature));

  const windows: WindowProvenance[] = [];

  for (let windowIndex = 0, startBeat = 0; startBeat < totalBeats; windowIndex += 1, startBeat += durationBeats) {
    const endBeat = startBeat + durationBeats;
    const startTick = startBeat * ticksPerBeat;
    const endTick = endBeat * ticksPerBeat;

    const overlapping = evidence.filter((n) => overlaps(n, startTick, endTick));
    const attacking = overlapping
      .filter((n) => n.startTick >= startTick - tol && n.startTick < endTick)
      .slice()
      .sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);

    // Exact-onset clusters: distinct startTicks (sorted) share an id.
    const distinctOnsets = [...new Set(attacking.map((n) => n.startTick))].sort((a, b) => a - b);
    const onsetClusterOf = new Map(distinctOnsets.map((t, i) => [t, i] as const));

    const attacks: AttackProvenance[] = attacking.map((note, order) => {
      const role = roles.get(note.trackIndex) ?? "mixed";
      const absoluteAttackBeat = note.startTick / ticksPerBeat;
      const relativeAttackBeat = absoluteAttackBeat - startBeat;
      const beatBucket = Math.min(bucketCount - 1, Math.max(0, Math.floor(relativeAttackBeat / bucketBeats)));
      return {
        windowIndex,
        windowStartBeat: startBeat,
        windowEndBeat: endBeat,
        absoluteAttackBeat,
        relativeAttackBeat,
        beatBucket,
        pitchClass: normalizePc(note.pitch),
        voiceRole: role,
        structuralBass: isBassish(note.pitch, role),
        durationOverlapBeats: overlapBeats(note, startTick, endTick, ticksPerBeat),
        onsetClusterId: onsetClusterOf.get(note.startTick) ?? 0,
        attackOrderInWindow: order,
      };
    });

    // Per-bucket aggregates.
    const buckets: BucketAggregate[] = [];
    for (let b = 0; b < bucketCount; b += 1) {
      const bStartBeat = startBeat + b * bucketBeats;
      const bStartTick = bStartBeat * ticksPerBeat;
      const bEndTick = (bStartBeat + bucketBeats) * ticksPerBeat;
      const inBucket = attacks.filter((a) => a.beatBucket === b);
      const pcs = new Set(inBucket.map((a) => a.pitchClass));
      // Structural bass of the bucket = lowest-pitch bass-ish note SOUNDING in the
      // bucket (overlapping its sub-range, incl. sustained) — so a held bass is not
      // read as "changing" just because it does not re-attack.
      let bassPc: number | null = null;
      let bassPitch = Infinity;
      for (const note of overlapping) {
        const role = roles.get(note.trackIndex) ?? "mixed";
        if (overlaps(note, bStartTick, bEndTick) && isBassish(note.pitch, role) && note.pitch < bassPitch) {
          bassPitch = note.pitch;
          bassPc = normalizePc(note.pitch);
        }
      }
      const durOverlap = overlapping.reduce((s, n) => s + overlapBeats(n, bStartTick, bEndTick, ticksPerBeat), 0);
      buckets.push({
        bucket: b,
        attackCount: inBucket.length,
        uniquePcs: [...pcs].sort((x, y) => x - y),
        structuralBassAttackCount: inBucket.filter((a) => a.structuralBass).length,
        onsetClusterIds: [...new Set(inBucket.map((a) => a.onsetClusterId))].sort((x, y) => x - y),
        durationOverlapBeats: durOverlap,
        bassPc,
      });
    }

    const bucketPcSets = buckets.map((bk) => new Set(bk.uniquePcs));
    const unionPcs = new Set<number>();
    for (const s of bucketPcSets) for (const pc of s) unionPcs.add(pc);
    const maxSingleBucketPcCount = buckets.reduce((m, bk) => Math.max(m, bk.uniquePcs.length), 0);
    // Cross-bucket overlap/similarity are defined for the two-bucket default.
    const b0 = bucketPcSets[0] ?? new Set<number>();
    const b1 = bucketPcSets[1] ?? new Set<number>();
    let overlapCount = 0;
    for (const pc of b0) if (b1.has(pc)) overlapCount += 1;
    const bassPcs = buckets.map((bk) => bk.bassPc).filter((x): x is number => x !== null);
    const bassChange = bassPcs.length >= 2 && new Set(bassPcs).size > 1;

    windows.push({
      windowIndex,
      startBeat,
      endBeat,
      contributionCount: overlapping.length,
      attackCount: attacks.length,
      unionPcs: [...unionPcs].sort((x, y) => x - y),
      unionPcCount: unionPcs.size,
      maxSingleBucketPcCount,
      pcInflation: unionPcs.size - maxSingleBucketPcCount,
      crossBucketOverlapPcCount: overlapCount,
      crossBucketJaccard: jaccard(b0, b1),
      bassChange,
      onsetClusterCount: distinctOnsets.length,
      buckets,
      attacks,
    });
  }

  return { windows };
}
