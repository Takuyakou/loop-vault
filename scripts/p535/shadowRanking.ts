/**
 * P5.35-02 shadow carryover-resistant ranking (shadow-only, pure, deterministic).
 *
 * It re-ranks each production window's chord candidates on a SHADOW histogram in
 * which carryover (CARRIED_IN_SUSTAIN) contributions are attenuated, then reports
 * legacy top-1 vs shadow top-1. It changes NO production behavior: the production
 * histogram, candidate set, legacy score, legacy rank, and legacy top-1 are
 * untouched. Nothing here is wired into the analyzer.
 *
 * Fidelity (same candidate set, same scorer): the shadow histogram is scored by
 * the EXACT exported production scorer via `matchWindow` — the only variable is
 * the histogram. The per-note weight is a mirror of `buildWeightedWindows`; a
 * guard test asserts the mirror (attenuation = 1) reproduces the production
 * histogram bit-for-bit, so any production drift fails loudly.
 *
 * Anti-oracle: evidence roles come only from runtime observations (onsets,
 * durations, attack/sustain sets, freshly-attacked bass, chord vocabulary) — no
 * fixture chord label ever enters. Candidate-dependent: attenuation applies to a
 * note's contribution to the shared candidate histogram, not to any label.
 */

import { buildWeightedWindows, matchWindow } from "../../src/domain/midi/legacy";
import { beatsPerBar } from "../../src/domain/midi/timing";
import { normalizePc } from "../../src/domain/chords";
import type { MidiSongData, TimedNote, TrackRole } from "../../src/domain/midi/types";

import { classifyWindow, windowAttackPcs } from "./temporalEvidence";

// --- Mirror of legacy.ts per-note weight factors (guarded by a test). ---
// ponytail: duplicated from legacy.ts; the attenuation-1 guard test fails if the
// production formula ever drifts, at which point re-home to a shared helper.
function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}
function beatPositionFactor(startBeat: number, barLengthBeats: number): number {
  if (startBeat % barLengthBeats === 0) return 1.5;
  if (Number.isInteger(startBeat)) return 1.2;
  return 0.8;
}
function rangeFactor(pitch: number): number {
  if (pitch < 48) return 1.4;
  if (pitch >= 72) return 0.6;
  return 1;
}
function velocityFactor(velocity: number): number {
  return 0.7 + clamp(velocity) * 0.5;
}
function roleFactor(role: TrackRole): number {
  if (role === "bass") return 1.5;
  if (role === "harmony") return 1.3;
  if (role === "melody") return 0.5;
  if (role === "percussion") return 0;
  return 1;
}
function overlaps(note: TimedNote, startTick: number, endTick: number): boolean {
  return note.startTick < endTick && note.startTick + note.durationTick > startTick;
}

export interface ShadowRankingOptions {
  readonly durationBeats?: 1 | 2 | 4;
  readonly attackToleranceTicks?: number;
  readonly transientMaxBeats?: number;
  /** Weight multiplier applied to CARRIED_IN_SUSTAIN contributions (0 = remove, 1 = no-op control). */
  readonly carryoverAttenuation?: number;
}

export interface WindowRankDelta {
  readonly windowIndex: number;
  readonly bar: number;
  readonly beat: number;
  readonly legacyChord: string;
  readonly shadowChord: string;
  readonly legacyConfidence: number;
  readonly shadowConfidence: number;
  readonly changed: boolean;
  /** Distinct pitch classes attenuated as carryover in this window. */
  readonly carriedPcs: number[];
  /** The shadow histogram fed to the scorer (also used by the mirror guard). */
  readonly shadowHistogram: number[];
}

export interface ShadowRankingResult {
  readonly carryoverAttenuation: number;
  readonly windows: readonly WindowRankDelta[];
  readonly changedCount: number;
  readonly carriedContributionCount: number;
}

/**
 * Re-ranks production windows on a carryover-attenuated shadow histogram. Pure,
 * deterministic, and bounded (windows × notes × fixed candidate set). Never
 * mutates `data`.
 */
export function shadowRankWindows(
  data: MidiSongData,
  roles: Map<number, TrackRole> = new Map(),
  options: ShadowRankingOptions = {},
): ShadowRankingResult {
  const durationBeats = options.durationBeats ?? 2;
  const tol = options.attackToleranceTicks ?? 2;
  const transientMaxBeats = options.transientMaxBeats ?? 0.35;
  const attenuation = options.carryoverAttenuation ?? 0;
  const ticksPerBeat = Math.max(1, data.ticksPerBeat);
  const barLengthBeats = beatsPerBar(data.timeSignature);

  const prodWindows = buildWeightedWindows(data, roles, durationBeats);

  const windows: WindowRankDelta[] = [];
  let changedCount = 0;
  let carriedContributionCount = 0;
  let prevAttackPcs: ReadonlySet<number> = new Set<number>();

  prodWindows.forEach((prodWindow, windowIndex) => {
    const startBeat = windowIndex * durationBeats;
    const startTick = startBeat * ticksPerBeat;
    const endTick = (startBeat + durationBeats) * ticksPerBeat;

    // Simultaneity bonus counts every overlapping note (matches buildWeightedWindows,
    // which computes it before the percussion skip).
    const simultaneityBonus =
      data.notes.filter((note) => overlaps(note, startTick, endTick)).length >= 3 ? 1.2 : 1;

    // The histogram contributors are the non-percussion overlapping notes.
    const overlapping = data.notes.filter(
      (note) => overlaps(note, startTick, endTick)
        && (roles.get(note.trackIndex) ?? "mixed") !== "percussion",
    );
    const attackPcs = windowAttackPcs(overlapping, startTick, endTick, tol);
    const { roles: windowRoles } = classifyWindow(
      overlapping, startTick, endTick, attackPcs, prevAttackPcs, roles,
      { tol, transientMaxBeats, ticksPerBeat },
    );

    const shadowHistogram = Array(12).fill(0) as number[];
    const shadowBass = Array(12).fill(0) as number[];
    const carried = new Set<number>();

    for (const r of windowRoles) {
      const note = r.note;
      const role = roles.get(note.trackIndex) ?? "mixed";
      const overlapTick =
        Math.min(note.startTick + note.durationTick, endTick) - Math.max(note.startTick, startTick);
      const overlapBeats = Math.max(0, overlapTick / ticksPerBeat);
      const weight =
        overlapBeats
        * beatPositionFactor(startBeat, barLengthBeats)
        * rangeFactor(note.pitch)
        * velocityFactor(note.velocity)
        * roleFactor(role)
        * simultaneityBonus;

      const isCarried = r.temporalRole === "CARRIED_IN_SUSTAIN";
      if (isCarried) {
        carried.add(r.pc);
        carriedContributionCount += 1;
      }
      const factor = isCarried ? attenuation : 1;
      const pc = normalizePc(note.pitch);
      shadowHistogram[pc] += weight * factor;
      if (note.pitch < 60 || role === "bass") shadowBass[pc] += weight * factor * 1.25;
    }

    const legacyItem = matchWindow(prodWindow);
    const shadowItem = matchWindow({ ...prodWindow, histogram: shadowHistogram, bassHistogram: shadowBass });
    const changed = legacyItem.chord.label !== shadowItem.chord.label;
    if (changed) changedCount += 1;

    windows.push({
      windowIndex,
      bar: prodWindow.bar,
      beat: prodWindow.beat,
      legacyChord: legacyItem.chord.label,
      shadowChord: shadowItem.chord.label,
      legacyConfidence: legacyItem.confidence,
      shadowConfidence: shadowItem.confidence,
      changed,
      carriedPcs: [...carried].sort((a, b) => a - b),
      shadowHistogram,
    });

    prevAttackPcs = attackPcs;
  });

  return { carryoverAttenuation: attenuation, windows, changedCount, carriedContributionCount };
}
