import { normalizePc } from "../chords";
import type { CoreTriad, SeventhKind, TensionKind } from "../chordFactorization";
import type { ChordObservation, ObservedNote, ToneVerdict } from "./shadowEvidence";

/**
 * Detecting tensions on their own, with the chord already decided.
 *
 * Every earlier stage tried to improve something the product decides well and
 * came back worse. This one starts from a different place: the root, the bass,
 * the triad and the seventh are all taken from `phase4-v1` and are never
 * reconsidered, so the qualities are not put back into competition with each
 * other. The only question is what to make of the pitch classes left over.
 *
 * Two problems make that harder than it looks.
 *
 * The same interval means different things depending on the chord underneath it.
 * Six semitones above the root is a `#11` when the fifth is also sounding and a
 * `b5` when it is not; nine semitones is a `13` over a seventh chord and a plain
 * `6` without one. So each candidate is interpreted against the fixed core
 * rather than looked up in a table, and an interval that *is* a core tone is
 * contradicted rather than counted twice.
 *
 * And a note that sounds is not necessarily a tension. A passing note in the
 * melody, an ornament, a grace note — all of them put a pitch class in the
 * window without the composer having written an extension. Duration, metric
 * position, which voice plays it and whether it sustains are recorded
 * separately, and a short melody-only note off the beat lands in
 * `underdetermined` rather than being asserted.
 *
 * Nothing here is connected to the product.
 */

/** Thresholds for calling a sounding pitch class a tension rather than an ornament. */
export interface TensionDetectionParameters {
  /** Share of the window the pitch class must sound for, to count on duration. */
  durationFloor: number;
  /** Share of a beat a note must last to count as sustained. */
  sustainedFloor: number;
  /** How many independent supports are needed before a tension is asserted. */
  supportsRequired: number;
  /** A note played only by a melody voice counts for less. */
  melodyOnlyPenalty: number;
}

export const defaultTensionDetection: TensionDetectionParameters = {
  durationFloor: 0.35,
  sustainedFloor: 1,
  supportsRequired: 2,
  melodyOnlyPenalty: 0.5,
};

export function scaleTensionDetection(
  parameters: TensionDetectionParameters,
  scale: number,
): TensionDetectionParameters {
  return {
    durationFloor: parameters.durationFloor * scale,
    sustainedFloor: parameters.sustainedFloor * scale,
    supportsRequired: parameters.supportsRequired,
    melodyOnlyPenalty: parameters.melodyOnlyPenalty * scale,
  };
}

/** A tension, plus the two alterations of the fifth that behave like one. */
export type TensionSlot = TensionKind | "b5" | "#5";

/**
 * Which interval each candidate occupies, and what has to be true of the core
 * for that reading to be the right one.
 *
 * Written as data so the interpretation is inspectable rather than buried in a
 * chain of conditionals, and so no chord name appears anywhere.
 */
const SLOTS: Array<{
  slot: TensionSlot;
  semitones: number;
  /** True when the fixed core makes this reading available. */
  available(core: { triad: CoreTriad; seventh: SeventhKind | null; sounding: Set<number>; root: number }): boolean;
}> = [
  { slot: "b9", semitones: 1, available: () => true },
  {
    slot: "9",
    semitones: 2,
    // A sus2 already owns the second: counting it again would be double-billing
    // a note the triad is built from.
    available: ({ triad }) => triad !== "sus2",
  },
  {
    slot: "#9",
    semitones: 3,
    // Three semitones is the minor third. Over a minor triad it is the core, not
    // a tension.
    available: ({ triad }) => triad !== "minor" && triad !== "diminished",
  },
  {
    slot: "11",
    semitones: 5,
    available: ({ triad }) => triad !== "sus4",
  },
  {
    slot: "b5",
    semitones: 6,
    // A flat fifth only when the natural fifth is absent and the triad does not
    // already carry it.
    available: ({ triad, sounding, root }) => triad !== "diminished"
      && !sounding.has(normalizePc(root + 7)),
  },
  {
    slot: "#11",
    semitones: 6,
    // A raised eleventh sits above a fifth that is still there.
    available: ({ sounding, root }) => sounding.has(normalizePc(root + 7)),
  },
  {
    slot: "#5",
    semitones: 8,
    available: ({ triad, sounding, root }) => triad !== "augmented"
      && !sounding.has(normalizePc(root + 7)),
  },
  {
    slot: "b13",
    semitones: 8,
    available: ({ sounding, root }) => sounding.has(normalizePc(root + 7)),
  },
  {
    slot: "6",
    semitones: 9,
    // Without a seventh the ninth semitone is a sixth.
    available: ({ seventh }) => seventh === null,
  },
  {
    slot: "13",
    semitones: 9,
    // With a seventh it is a thirteenth.
    available: ({ seventh }) => seventh !== null,
  },
];

export interface TensionSupport {
  slot: TensionSlot;
  semitones: number;
  presenceSupport: boolean;
  /** Share of the window this pitch class sounds for. */
  durationSupport: number;
  /** True when it starts on a strong beat. */
  metricPositionSupport: boolean;
  /** Strongest voice role that plays it. */
  voiceRoleSupport: "harmony" | "bass" | "mixed" | "melody" | "none";
  /** True when a single note of it lasts at least a beat. */
  sustainedSupport: boolean;
  /** True when this interval is a tone of the fixed core. */
  conflictWithCore: boolean;
  verdict: ToneVerdict;
  /** How many independent supports were found. Diagnostic. */
  supportCount: number;
}

export interface TimedNote extends ObservedNote {
  onsetBeat: number;
}

export interface ShadowTensionInput {
  observation: ChordObservation & { timedNotes?: TimedNote[] };
  /** All four taken from the product and never reconsidered. */
  root: number;
  bass: number;
  triad: CoreTriad;
  seventh: SeventhKind | null;
  beatsPerBar?: number;
  parameters?: TensionDetectionParameters;
}

export interface ShadowTensionResult {
  root: number;
  bass: number;
  triad: CoreTriad;
  seventh: SeventhKind | null;
  /** Asserted tensions. Only the `supported` ones. */
  tensions: TensionSlot[];
  supports: TensionSupport[];
  /** Present but not asserted: the passing-tone and ornament cases. */
  underdetermined: TensionSlot[];
  contradicted: TensionSlot[];
}

/** The intervals the fixed core already accounts for. */
function coreIntervals(triad: CoreTriad, seventh: SeventhKind | null): Set<number> {
  const intervals = new Set<number>([0]);
  switch (triad) {
    case "major": intervals.add(4); intervals.add(7); break;
    case "minor": intervals.add(3); intervals.add(7); break;
    case "diminished": intervals.add(3); intervals.add(6); break;
    case "augmented": intervals.add(4); intervals.add(8); break;
    case "sus2": intervals.add(2); intervals.add(7); break;
    case "sus4": intervals.add(5); intervals.add(7); break;
    case "power": intervals.add(7); break;
    case "unknown": break;
  }
  if (seventh === "minor7") intervals.add(10);
  if (seventh === "major7") intervals.add(11);
  if (seventh === "diminished7") intervals.add(9);
  return intervals;
}

function isStrongBeat(onsetBeat: number, beatsPerBar: number): boolean {
  const withinBar = ((onsetBeat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  return Math.abs(withinBar) < 1e-6 || Math.abs(withinBar - beatsPerBar / 2) < 1e-6;
}

const ROLE_RANK = { harmony: 4, bass: 3, mixed: 2, melody: 1, none: 0 } as const;

/**
 * Which tensions the notes support, given a core that is already settled.
 *
 * A tension is asserted only when at least `supportsRequired` independent
 * supports agree. That is the guard against over-detection: a passing note has
 * presence and nothing else, so it never reaches two.
 */
export function shadowTensions(input: ShadowTensionInput): ShadowTensionResult {
  const parameters = input.parameters ?? defaultTensionDetection;
  const beatsPerBar = input.beatsPerBar ?? 4;
  const root = normalizePc(input.root);
  const windowBeats = Math.max(1e-6, input.observation.windowBeats);
  const core = coreIntervals(input.triad, input.seventh);
  const notes = input.observation.notes;
  const timed = input.observation.timedNotes;

  const sounding = new Set(notes.map((note) => normalizePc(note.pitch)));
  const byPitchClass = new Map<number, ObservedNote[]>();
  for (const note of notes) {
    const pitchClass = normalizePc(note.pitch);
    byPitchClass.set(pitchClass, [...(byPitchClass.get(pitchClass) ?? []), note]);
  }

  const supports: TensionSupport[] = [];
  for (const candidate of SLOTS) {
    const pitchClass = normalizePc(root + candidate.semitones);
    const matching = byPitchClass.get(pitchClass) ?? [];
    const presenceSupport = matching.length > 0;
    const conflictWithCore = core.has(candidate.semitones);
    const available = candidate.available({
      triad: input.triad, seventh: input.seventh, sounding, root,
    });

    const totalWeight = matching.reduce((sum, note) => sum + note.weight, 0);
    const roleRank = matching.reduce<TensionSupport["voiceRoleSupport"]>(
      (best, note) => (ROLE_RANK[note.role as keyof typeof ROLE_RANK] > ROLE_RANK[best] ? note.role as TensionSupport["voiceRoleSupport"] : best),
      "none",
    );
    // A melody-only note contributes less, because a melody puts pitch classes
    // in a window for reasons that have nothing to do with the harmony.
    const effectiveWeight = roleRank === "melody"
      ? totalWeight * parameters.melodyOnlyPenalty
      : totalWeight;
    const durationSupport = Number((effectiveWeight / windowBeats).toFixed(6));
    const sustainedSupport = matching.some((note) => note.weight >= parameters.sustainedFloor);
    const metricPositionSupport = timed === undefined
      ? false
      : timed.some(
        (note) => normalizePc(note.pitch) === pitchClass
          && isStrongBeat(note.onsetBeat, beatsPerBar),
      );

    const supportCount = [
      durationSupport >= parameters.durationFloor,
      metricPositionSupport,
      roleRank === "harmony" || roleRank === "bass",
      sustainedSupport,
    ].filter(Boolean).length;

    // `contradicted` is reserved for a positive reason: the interval belongs to
    // the core, or the core makes this reading unavailable. Never for absence.
    const verdict: ToneVerdict = conflictWithCore || !available
      ? "contradicted"
      : (presenceSupport && supportCount >= parameters.supportsRequired
        ? "supported"
        : "underdetermined");

    supports.push({
      slot: candidate.slot,
      semitones: candidate.semitones,
      presenceSupport,
      durationSupport,
      metricPositionSupport,
      voiceRoleSupport: roleRank,
      sustainedSupport,
      conflictWithCore,
      verdict,
      supportCount,
    });
  }

  return {
    root,
    bass: normalizePc(input.bass),
    triad: input.triad,
    seventh: input.seventh,
    // Deliberately not mutually exclusive beyond what the core forces. A chord
    // can carry a ninth and a thirteenth at once, and forcing a single winner
    // would drop one of them.
    tensions: supports.filter((support) => support.verdict === "supported").map((support) => support.slot),
    supports,
    underdetermined: supports.filter((support) => support.verdict === "underdetermined").map((support) => support.slot),
    contradicted: supports.filter((support) => support.verdict === "contradicted").map((support) => support.slot),
  };
}

/**
 * Does perturbing the tension parameters move the core?
 *
 * It cannot: root, bass, triad and seventh are all inputs. Measured anyway,
 * because "it is an input" is an argument and this is evidence.
 */
export function coreIsInvariant(
  inputs: readonly ShadowTensionInput[],
  scales: readonly number[] = [0.7, 1.0, 1.3],
): { invariant: boolean; perturbationHadEffect: boolean } {
  const coreOf = (scale: number) => inputs.map((input) => {
    const result = shadowTensions({
      ...input,
      parameters: scaleTensionDetection(input.parameters ?? defaultTensionDetection, scale),
    });
    return `${result.root}:${result.bass}:${result.triad}:${result.seventh ?? "-"}`;
  }).join("|");
  const tensionsOf = (scale: number) => inputs.map((input) => shadowTensions({
    ...input,
    parameters: scaleTensionDetection(input.parameters ?? defaultTensionDetection, scale),
  }).tensions.join(",")).join("|");

  const first = coreOf(scales[0]);
  const firstTensions = tensionsOf(scales[0]);
  return {
    invariant: scales.every((scale) => coreOf(scale) === first),
    perturbationHadEffect: scales.some((scale) => tensionsOf(scale) !== firstTensions),
  };
}

/**
 * A canonical identity's tensions, as slots.
 *
 * Bridges the identity model — numeric extensions plus string alterations — to
 * the slot vocabulary, so product, shadow and gold can be compared as sets.
 */
export function slotsFromIdentity(
  extensions: readonly number[],
  alterations: readonly string[],
): TensionSlot[] {
  const slots: TensionSlot[] = [];
  for (const extension of extensions) {
    if (extension === 6) slots.push("6");
    else if (extension === 9) slots.push("9");
    else if (extension === 11) slots.push("11");
    else if (extension === 13) slots.push("13");
  }
  for (const alteration of alterations) {
    if (alteration === "b9" || alteration === "#9" || alteration === "#11"
      || alteration === "b13" || alteration === "b5" || alteration === "#5") {
      slots.push(alteration);
    }
  }
  return [...new Set(slots)];
}

/** Slots that are alterations rather than plain extensions. */
export const ALTERATION_SLOTS: ReadonlySet<TensionSlot> = new Set<TensionSlot>([
  "b5", "#5", "b9", "#9", "#11", "b13",
]);
