/**
 * P5.35 shadow temporal-evidence classifier (shadow-only, pure, deterministic).
 *
 * Given the same parsed notes production uses, it labels each per-window note
 * contribution with an explainable temporal relation PLUS orthogonal functional
 * attributes. It NEVER changes production pitch histograms, candidate sets,
 * scores, ranks, top-1, or any production behavior — it only reads evidence. No
 * ranking happens here (that is P5.35-02).
 *
 * P5.35-01 hardening: a contribution's temporal/context relation and its
 * functional attributes are ORTHOGONAL axes, not one mutually-exclusive enum:
 *
 *   temporalRole: CURRENT_ATTACK | CURRENT_SUSTAIN | COMMON_TONE
 *                 | CARRIED_IN_SUSTAIN | UNCERTAIN
 *   flags:        structuralBass: boolean, shortTransient: boolean
 *
 * So `CARRIED_IN_SUSTAIN + structuralBass` (a stale bass), `CURRENT_ATTACK +
 * shortTransient` (a short current defining tone), and `COMMON_TONE +
 * structuralBass` are all representable. Downstream scoring (P5.35-02) must not
 * treat a structural-bass-flagged contribution as permanently strong.
 *
 * Design rule (§1): onset position is ONE feature, never the whole classifier. A
 * sustained note is carryover contamination only when a *competing new harmony*
 * attacks AND the note's pitch class is not supported by that new harmony. A held
 * chord with no new harmony stays current; a pitch that is freshly attacked in
 * the current state is a common tone; and a pitch that is NOT re-attacked but
 * fits the current harmony (an unrearticulated common tone) is still protected as
 * current/shared evidence — support is derived only from runtime observations
 * (the freshly-attacked bass + attack set + chord vocabulary), never a fixture
 * label (§6).
 *
 * The window grid is meter-independent (P5.34 confirmed harmonic segmentation is
 * stable across meters); it never touches the meter/fragmentation family.
 */

import { normalizePc } from "../../src/domain/chords";
import { selectChordEvidenceNotes } from "../../src/domain/midi/voices";
import type { MidiSongData, TimedNote, TrackRole } from "../../src/domain/midi/types";

export type TemporalRole =
  | "CURRENT_ATTACK"
  | "CURRENT_SUSTAIN"
  | "COMMON_TONE"
  | "CARRIED_IN_SUSTAIN"
  | "UNCERTAIN";

export type ReasonCode =
  | "attack-in-current"
  | "held-window-no-new-harmony"
  | "shared-with-adjacent-state"
  | "current-harmonic-support"
  | "prior-state-only-support"
  | "ambiguous-context";

export const TEMPORAL_ROLES: readonly TemporalRole[] = [
  "CURRENT_ATTACK",
  "CURRENT_SUSTAIN",
  "COMMON_TONE",
  "CARRIED_IN_SUSTAIN",
  "UNCERTAIN",
];

/** One note's contribution to one window. `id` is positional; never a raw pitch id for private data. */
export interface NoteEvidence {
  readonly id: number;
  readonly pc: number;
  /** Temporal/context relation — one axis. */
  readonly temporalRole: TemporalRole;
  /** Functional attribute: this note is the window's structural bass. Orthogonal to temporalRole. */
  readonly structuralBass: boolean;
  /** Functional attribute: this note is a short/transient duration. Orthogonal to temporalRole. */
  readonly shortTransient: boolean;
  readonly reason: ReasonCode;
  /** Temporal-role confidence in [0,1] — NOT a chord score. */
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
  /** Notes shorter than this many beats carry the shortTransient flag (ornaments/arpeggio steps). */
  readonly transientMaxBeats?: number;
}

export type RoleCounts = Record<TemporalRole, number>;

export interface FlagCounts {
  readonly structuralBass: number;
  readonly shortTransient: number;
}

export interface ClassificationResult {
  readonly windows: readonly WindowEvidence[];
  readonly roleCounts: RoleCounts;
  readonly flagCounts: FlagCounts;
  /** Total note contributions processed (bounded-cost evidence). */
  readonly contributionsProcessed: number;
}

const ROLE_CONFIDENCE: Record<TemporalRole, number> = {
  CURRENT_ATTACK: 0.9,
  CURRENT_SUSTAIN: 0.8,
  COMMON_TONE: 0.8,
  CARRIED_IN_SUSTAIN: 0.6,
  UNCERTAIN: 0.3,
};

// Root-relative STABLE-tone vocabulary (triads / 6ths / 7ths / sus) for the
// runtime harmonic-support check only (NOT production ranking). Deliberately
// excludes 9/11/13 extensions: an unrearticulated sustained note is protected as
// a common tone only when it is a *core* tone of the current harmony, so a wide
// extended template cannot swallow a genuine carryover as its 11th/13th. Freshly
// re-articulated tensions are still protected via the attack set, so rich-harmony
// safety is unaffected. ponytail: core-tone heuristic; if an unrearticulated
// legitimate tension common tone ever needs protection, widen with candidate
// context in P5.35-02 rather than here.
const SUPPORT_TEMPLATES: readonly number[][] = [
  [0, 4, 7], // maj
  [0, 3, 7], // min
  [0, 3, 6], // dim
  [0, 4, 8], // aug
  [0, 4, 7, 11], // maj7
  [0, 3, 7, 10], // min7
  [0, 4, 7, 10], // dom7
  [0, 3, 6, 10], // min7b5
  [0, 3, 6, 9], // dim7
  [0, 4, 7, 9], // six
  [0, 3, 7, 9], // min6
  [0, 2, 7], // sus2
  [0, 5, 7], // sus4
  [0, 5, 7, 10], // dom7sus4
];

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
 * Runtime (anti-oracle) harmonic support: is `pc` a chord tone of a tertian
 * chord rooted at the freshly-attacked bass that also covers every attacked pc?
 * This confirms an unrearticulated sustained pitch belongs to the CURRENT harmony
 * (a common tone), separating it from a foreign carryover — without any fixture
 * label. Bounded: templates × attacks.
 */
function currentHarmonicSupport(pc: number, currentRoot: number | undefined, attackPcs: Set<number>): boolean {
  if (currentRoot === undefined) return false;
  for (const template of SUPPORT_TEMPLATES) {
    const tset = new Set(template.map((interval) => normalizePc(currentRoot + interval)));
    let coversAttacks = true;
    for (const a of attackPcs) {
      if (!tset.has(a)) {
        coversAttacks = false;
        break;
      }
    }
    if (coversAttacks && tset.has(pc)) return true;
  }
  return false;
}

/**
 * Classifies temporal evidence roles + orthogonal flags per window. Pure: it
 * never mutates `data` or its notes, and is deterministic (no clock/random).
 * Bounded: each note is visited once per window it overlaps.
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
  let structuralBassCount = 0;
  let shortTransientCount = 0;
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
    const competingNewHarmony = newAttackPcs.length >= 2; // ponytail: heuristic threshold; ablate in P5.35-02, do not harden.

    // Structural-bass FLAG = the lowest-pitch bass-ish contribution (pitch<60 or
    // bass role). Purely a functional attribute — it does NOT decide temporalRole.
    let bassNote: TimedNote | undefined;
    // Current-harmony root = the lowest-pitch note that ATTACKS in this window
    // (the freshly-articulated bass), used only by the runtime support check.
    let currentRoot: number | undefined;
    let currentRootPitch = Infinity;
    for (const note of overlapping) {
      const role = roles.get(note.trackIndex) ?? "mixed";
      if (note.pitch < 60 || role === "bass") {
        if (!bassNote || note.pitch < bassNote.pitch) bassNote = note;
      }
      const attackInWindow = note.startTick >= startTick - tol && note.startTick < endTick;
      if (attackInWindow && note.pitch < currentRootPitch) {
        currentRootPitch = note.pitch;
        currentRoot = normalizePc(note.pitch);
      }
    }

    const contributions: NoteEvidence[] = overlapping.map((note, id) => {
      contributionsProcessed += 1;
      const pc = normalizePc(note.pitch);
      const durationBeatsNote = note.durationTick / ticksPerBeat;
      const attackInWindow = note.startTick >= startTick - tol && note.startTick < endTick;
      const startedBefore = note.startTick < startTick - tol;

      // Orthogonal functional attributes (independent of the temporal decision).
      const structuralBass = note === bassNote;
      const shortTransient = durationBeatsNote < transientMaxBeats;

      let temporalRole: TemporalRole;
      let reason: ReasonCode;

      if (attackInWindow) {
        // Freshly struck in the current window — a current attack regardless of
        // duration (a short defining tone keeps this; shortTransient flags it).
        temporalRole = "CURRENT_ATTACK";
        reason = "attack-in-current";
      } else if (heldWindow) {
        // Sustained, but the window has no competing new harmony -> held chord/pad.
        temporalRole = "CURRENT_SUSTAIN";
        reason = "held-window-no-new-harmony";
      } else if (attackPcs.has(pc)) {
        // Sustained AND freshly attacked in the current state -> re-articulated common tone.
        temporalRole = "COMMON_TONE";
        reason = "shared-with-adjacent-state";
      } else if (competingNewHarmony && currentHarmonicSupport(pc, currentRoot, attackPcs)) {
        // Sustained, NOT re-attacked, but fits the current harmony -> unrearticulated common tone.
        temporalRole = "COMMON_TONE";
        reason = "current-harmonic-support";
      } else if (competingNewHarmony && (prevAttackPcs.has(pc) || startedBefore)) {
        // Sustained, foreign to the current harmony, supported by the prior state -> carryover.
        temporalRole = "CARRIED_IN_SUSTAIN";
        reason = "prior-state-only-support";
      } else {
        temporalRole = "UNCERTAIN";
        reason = "ambiguous-context";
      }

      roleCounts[temporalRole] += 1;
      if (structuralBass) structuralBassCount += 1;
      if (shortTransient) shortTransientCount += 1;
      return { id, pc, temporalRole, structuralBass, shortTransient, reason, confidence: ROLE_CONFIDENCE[temporalRole] };
    });

    windows.push({ windowIndex, startBeat, durationBeats, heldWindow, contributions });
  });

  return {
    windows,
    roleCounts,
    flagCounts: { structuralBass: structuralBassCount, shortTransient: shortTransientCount },
    contributionsProcessed,
  };
}
