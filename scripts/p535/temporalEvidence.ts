/**
 * P5.35 shadow temporal-evidence classifier (shadow-only, pure, deterministic).
 *
 * Given the same parsed notes production uses, it labels each per-window note
 * contribution with an explainable temporal role. It NEVER changes production
 * pitch histograms, candidate sets, scores, ranks, top-1, or any production
 * behavior — it only reads evidence. No ranking happens here (that is P5.35-02).
 *
 * Design rule (P5.35-01 §1): onset position is ONE feature, never the whole
 * classifier. A sustained note is only carryover contamination when a *competing
 * new harmony* attacks in the window AND the note's pitch class is not part of
 * that new state; a held chord with no new harmony stays current, and a pitch
 * that is freshly attacked in the current state is a common tone, not
 * contamination — regardless of onset.
 *
 * The window grid is meter-independent (P5.34 confirmed harmonic segmentation is
 * stable across meters); it never touches the meter/fragmentation family.
 */

import { normalizePc } from "../../src/domain/chords";
import { selectChordEvidenceNotes } from "../../src/domain/midi/voices";
import type { MidiSongData, TimedNote, TrackRole } from "../../src/domain/midi/types";

export type EvidenceRole =
  | "CURRENT_ATTACK"
  | "CURRENT_SUSTAIN"
  | "COMMON_TONE"
  | "CARRIED_IN_SUSTAIN"
  | "STRUCTURAL_BASS"
  | "SHORT_TRANSIENT"
  | "UNCERTAIN";

export type ReasonCode =
  | "attack-in-current"
  | "supported-through-current-window"
  | "shared-with-adjacent-state"
  | "prior-state-only-support"
  | "structural-bass"
  | "short-duration-transient"
  | "held-window-no-new-harmony"
  | "ambiguous-context";

export const EVIDENCE_ROLES: readonly EvidenceRole[] = [
  "CURRENT_ATTACK",
  "CURRENT_SUSTAIN",
  "COMMON_TONE",
  "CARRIED_IN_SUSTAIN",
  "STRUCTURAL_BASS",
  "SHORT_TRANSIENT",
  "UNCERTAIN",
];

/** One note's contribution to one window. `id` is positional; never a raw pitch id for private data. */
export interface NoteEvidence {
  readonly id: number;
  readonly pc: number;
  readonly role: EvidenceRole;
  readonly reason: ReasonCode;
  /** Role confidence in [0,1] — NOT a chord score. */
  readonly confidence: number;
}

export interface WindowEvidence {
  readonly windowIndex: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  /** True when no competing new harmony attacks (held chord / pad / re-strike). */
  readonly heldWindow: boolean;
  readonly contributions: readonly NoteEvidence[];
}

export interface ClassifierOptions {
  readonly durationBeats?: 1 | 2 | 4;
  /** Near-boundary onset tolerance (classifier robustness, NOT production onset clustering). */
  readonly attackToleranceTicks?: number;
  /** Notes shorter than this many beats are SHORT_TRANSIENT (ornaments/arpeggio steps). */
  readonly transientMaxBeats?: number;
}

export type RoleCounts = Record<EvidenceRole, number>;

export interface ClassificationResult {
  readonly windows: readonly WindowEvidence[];
  readonly roleCounts: RoleCounts;
  /** Total note contributions processed (bounded-cost evidence). */
  readonly contributionsProcessed: number;
}

const ROLE_CONFIDENCE: Record<EvidenceRole, number> = {
  CURRENT_ATTACK: 0.9,
  STRUCTURAL_BASS: 0.9,
  CURRENT_SUSTAIN: 0.8,
  COMMON_TONE: 0.8,
  CARRIED_IN_SUSTAIN: 0.6,
  SHORT_TRANSIENT: 0.6,
  UNCERTAIN: 0.3,
};

function overlaps(note: TimedNote, startTick: number, endTick: number): boolean {
  return note.startTick < endTick && note.startTick + note.durationTick > startTick;
}

/** Meter-independent beat extent from the unchanged source-note extent. */
function beatExtent(notes: readonly TimedNote[], ticksPerBeat: number): number {
  const lastTick = notes.reduce((max, n) => Math.max(max, n.startTick + n.durationTick), 0);
  return Math.max(1, Math.ceil(lastTick / Math.max(1, ticksPerBeat)));
}

function emptyRoleCounts(): RoleCounts {
  return {
    CURRENT_ATTACK: 0,
    CURRENT_SUSTAIN: 0,
    COMMON_TONE: 0,
    CARRIED_IN_SUSTAIN: 0,
    STRUCTURAL_BASS: 0,
    SHORT_TRANSIENT: 0,
    UNCERTAIN: 0,
  };
}

/** pcs whose notes ATTACK within [start-tol, end). */
function attackPcSet(
  notes: readonly TimedNote[],
  startTick: number,
  endTick: number,
  tol: number,
): Set<number> {
  const set = new Set<number>();
  for (const note of notes) {
    if (note.startTick >= startTick - tol && note.startTick < endTick) {
      set.add(normalizePc(note.pitch));
    }
  }
  return set;
}

/**
 * Classifies temporal evidence roles per window. Pure: it never mutates `data`
 * or its notes, and is deterministic (no clock/random). Bounded: each note is
 * visited once per window it overlaps.
 */
export function classifyTemporalEvidence(
  data: MidiSongData,
  roles: Map<number, TrackRole> = new Map(),
  options: ClassifierOptions = {},
): ClassificationResult {
  const durationBeats = options.durationBeats ?? 2;
  const tol = options.attackToleranceTicks ?? 2;
  const transientMaxBeats = options.transientMaxBeats ?? 0.35;
  const ticksPerBeat = Math.max(1, data.ticksPerBeat);

  // Production evidence filter, for parity with the analyzed note set.
  const evidence = selectChordEvidenceNotes(data.notes).filter(
    (note) => (roles.get(note.trackIndex) ?? "mixed") !== "percussion",
  );
  const extent = beatExtent(evidence, ticksPerBeat);

  const windows: WindowEvidence[] = [];
  const roleCounts = emptyRoleCounts();
  let contributionsProcessed = 0;

  const windowStarts: number[] = [];
  for (let sb = 0; sb < extent; sb += durationBeats) windowStarts.push(sb);

  // Pre-compute each window's attack pc-set once (used by prev-window context).
  const attackSets = windowStarts.map((sb) =>
    attackPcSet(evidence, sb * ticksPerBeat, (sb + durationBeats) * ticksPerBeat, tol),
  );

  windowStarts.forEach((startBeat, windowIndex) => {
    const startTick = startBeat * ticksPerBeat;
    const endTick = (startBeat + durationBeats) * ticksPerBeat;
    const overlapping = evidence.filter((note) => overlaps(note, startTick, endTick));

    const attackPcs = attackSets[windowIndex];
    const prevAttackPcs = windowIndex > 0 ? attackSets[windowIndex - 1] : new Set<number>();

    // Sustained set = pcs of notes that started before this window (minus tolerance).
    const sustainedPcs = new Set<number>();
    for (const note of overlapping) {
      if (note.startTick < startTick - tol) sustainedPcs.add(normalizePc(note.pitch));
    }
    // A held window introduces no NEW pitch class via its attacks.
    const newAttackPcs = [...attackPcs].filter((pc) => !sustainedPcs.has(pc));
    const heldWindow = newAttackPcs.length === 0;
    const competingNewHarmony = newAttackPcs.length >= 2;

    // Structural bass = the lowest-pitch bass-ish contribution (pitch<60 or bass role).
    let bassNote: TimedNote | undefined;
    for (const note of overlapping) {
      const role = roles.get(note.trackIndex) ?? "mixed";
      if (note.pitch < 60 || role === "bass") {
        if (!bassNote || note.pitch < bassNote.pitch) bassNote = note;
      }
    }

    const contributions: NoteEvidence[] = overlapping.map((note, id) => {
      contributionsProcessed += 1;
      const pc = normalizePc(note.pitch);
      const durationBeatsNote = note.durationTick / ticksPerBeat;
      const attackInWindow = note.startTick >= startTick - tol && note.startTick < endTick;

      let role: EvidenceRole;
      let reason: ReasonCode;

      if (note === bassNote) {
        // Structural bass is a role, NOT the chord root (P5.34: bass can be correct
        // while root is wrong). It is reported regardless of onset.
        role = "STRUCTURAL_BASS";
        reason = "structural-bass";
      } else if (durationBeatsNote < transientMaxBeats) {
        // Short, non-sustaining contribution (ornament / grace).
        role = "SHORT_TRANSIENT";
        reason = "short-duration-transient";
      } else if (attackInWindow) {
        role = "CURRENT_ATTACK";
        reason = "attack-in-current";
      } else if (heldWindow) {
        // Sustained, but the window has no competing new harmony -> held chord/pad.
        role = "CURRENT_SUSTAIN";
        reason = "held-window-no-new-harmony";
      } else if (attackPcs.has(pc)) {
        // Sustained AND freshly attacked in the current state -> common tone.
        role = "COMMON_TONE";
        reason = "shared-with-adjacent-state";
      } else if (competingNewHarmony && (prevAttackPcs.has(pc) || note.startTick < startTick - tol)) {
        // Sustained, not part of the new state, supported by the prior state -> carryover.
        role = "CARRIED_IN_SUSTAIN";
        reason = "prior-state-only-support";
      } else {
        role = "UNCERTAIN";
        reason = "ambiguous-context";
      }

      roleCounts[role] += 1;
      return { id, pc, role, reason, confidence: ROLE_CONFIDENCE[role] };
    });

    windows.push({ windowIndex, startBeat, durationBeats, heldWindow, contributions });
  });

  return { windows, roleCounts, contributionsProcessed };
}
