import { normalizePc } from "../chords";
import type { TrackRole } from "./types";
import type { CoreTriad, SeventhKind } from "../chordFactorization";

/**
 * Evidence for a chord, computed but not used.
 *
 * Stage F1 is a measurement, not a change. Every number here is produced from
 * the notes and recorded; none of it reaches a product decision. The reason for
 * building it before building anything that acts on it is that the current
 * detector's mistakes — a pedal read as a root, a rootless voicing named from
 * its bass — are not visible in its output. They are visible in what it had to
 * work with, and that is what this exposes.
 *
 * Two rules the design turns on:
 *
 * A missing note is not a contradicted note. If a minor third is nowhere to be
 * heard, the chord is not "not minor" — it is undetermined between minor and
 * whatever else fits. Only a major third actually sounding contradicts minor.
 * Collapsing those two into one "absent" bucket is what makes a detector
 * confident about chords it has no evidence for.
 *
 * Nothing here consults the current chord hypothesis to decide anything. The
 * hypothesis is carried alongside as a reference so the diagnostics can be
 * compared to it, and that is all: routing on it would make the evidence a
 * function of the answer it is supposed to be evidence about.
 */

/** One sounding note inside the window being described. */
export interface ObservedNote {
  pitch: number;
  /** Beats this note sounds for inside the window. */
  weight: number;
  role: TrackRole;
}

export interface ChordObservation {
  notes: ObservedNote[];
  /** Beats the window spans, for normalising weights. */
  windowBeats: number;
  /**
   * The chord the product currently names here.
   *
   * Diagnostic reference only. Never an input to any score below.
   */
  currentRoot?: number;
  currentBass?: number;
}

const PITCH_CLASSES = Array.from({ length: 12 }, (_unused, index) => index);

function normalised(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? values.map((value) => value / total) : values.map(() => 0);
}

function topThree(values: readonly number[]): Array<{ pitchClass: number; score: number }> {
  return PITCH_CLASSES
    .map((pitchClass) => ({ pitchClass, score: Number(values[pitchClass].toFixed(6)) }))
    .sort((left, right) => right.score - left.score || left.pitchClass - right.pitchClass)
    .slice(0, 3);
}

const marginOf = (ranked: ReadonlyArray<{ score: number }>) => Number(
  ((ranked[0]?.score ?? 0) - (ranked[1]?.score ?? 0)).toFixed(6),
);

// --- A. bass evidence -------------------------------------------------------

export interface BassEvidence {
  posterior: number[];
  top3: Array<{ pitchClass: number; score: number }>;
  margin: number;
  /** Total weighted duration of everything below the split point. */
  evidenceAmount: number;
  /** Share of the window in which the lowest sounding note is the top candidate. */
  lowestNoteSupport: number;
  /** Share of that evidence contributed by tracks inferred as bass. */
  bassVoiceSupport: number;
}

/**
 * What is in the bass, from the low register alone.
 *
 * Deliberately register-based rather than role-based, with the role recorded
 * separately: a file with no bass track still has a lowest note, and a file
 * whose bass track doubles the melody would otherwise report a bass that is not
 * the lowest thing sounding.
 */
export function bassEvidence(observation: ChordObservation): BassEvidence {
  const notes = observation.notes;
  if (notes.length === 0) {
    return {
      posterior: PITCH_CLASSES.map(() => 0),
      top3: topThree(PITCH_CLASSES.map(() => 0)),
      margin: 0,
      evidenceAmount: 0,
      lowestNoteSupport: 0,
      bassVoiceSupport: 0,
    };
  }

  const lowest = Math.min(...notes.map((note) => note.pitch));
  // An octave above the lowest note is the register a bass line lives in. Wider
  // and the tenor voice votes; narrower and a bass that moves loses its own vote.
  const ceiling = lowest + 12;
  const low = notes.filter((note) => note.pitch <= ceiling);

  const weights = PITCH_CLASSES.map(() => 0);
  let bassRoleWeight = 0;
  for (const note of low) {
    // Lower notes count for more inside the band, so a walking line's target
    // note is not outvoted by a passing tone an octave up.
    const depth = 1 - (note.pitch - lowest) / 12;
    weights[normalizePc(note.pitch)] += note.weight * (0.5 + 0.5 * depth);
    if (note.role === "bass") bassRoleWeight += note.weight;
  }

  const posterior = normalised(weights);
  const ranked = topThree(posterior);
  const evidenceAmount = Number(
    (low.reduce((sum, note) => sum + note.weight, 0) / Math.max(1e-6, observation.windowBeats))
      .toFixed(6),
  );
  const lowestWeight = low
    .filter((note) => normalizePc(note.pitch) === ranked[0]?.pitchClass)
    .reduce((sum, note) => sum + note.weight, 0);
  const lowTotal = low.reduce((sum, note) => sum + note.weight, 0);

  return {
    posterior: posterior.map((value) => Number(value.toFixed(6))),
    top3: ranked,
    margin: marginOf(ranked),
    evidenceAmount,
    lowestNoteSupport: Number((lowTotal > 0 ? lowestWeight / lowTotal : 0).toFixed(6)),
    bassVoiceSupport: Number((lowTotal > 0 ? bassRoleWeight / lowTotal : 0).toFixed(6)),
  };
}

// --- B. bass-upper relation -------------------------------------------------

export type BassUpperRelation = "aligned" | "pedal" | "walking" | "none";

export interface RelationEvidence {
  relation: BassUpperRelation;
  scores: Record<BassUpperRelation, number>;
  margin: number;
  reasons: string[];
}

/**
 * How the bass is behaving under the upper voices.
 *
 * The four cases need different treatment later and are indistinguishable from
 * the bass note alone: a pedal and a root both sit still under changing chords,
 * and only the number of distinct low pitch classes tells them apart.
 */
export function relationEvidence(
  observation: ChordObservation,
  bass: BassEvidence,
): RelationEvidence {
  const reasons: string[] = [];
  const notes = observation.notes;
  if (notes.length === 0) {
    return {
      relation: "none",
      scores: { aligned: 0, pedal: 0, walking: 0, none: 1 },
      margin: 1,
      reasons: ["no notes"],
    };
  }

  const lowest = Math.min(...notes.map((note) => note.pitch));
  const low = notes.filter((note) => note.pitch <= lowest + 12);
  const upper = notes.filter((note) => note.pitch > lowest + 12);
  const lowClasses = new Set(low.map((note) => normalizePc(note.pitch)));
  const upperClasses = new Set(upper.map((note) => normalizePc(note.pitch)));

  const stillness = bass.lowestNoteSupport;
  const movement = Math.min(1, (lowClasses.size - 1) / 3);
  const bassInUpper = upperClasses.has(bass.top3[0]?.pitchClass ?? -1);

  const scores: Record<BassUpperRelation, number> = {
    // The bass note is one of the upper voices' notes: they agree about the chord.
    aligned: bassInUpper ? 0.4 + 0.6 * stillness : 0.15 * stillness,
    // Still, and not part of what the upper voices are spelling.
    pedal: !bassInUpper && stillness > 0.7 ? 0.3 + 0.7 * stillness : 0.2 * stillness,
    // Several distinct low notes inside one window.
    walking: 0.2 + 0.8 * movement,
    none: upper.length === 0 ? 0.6 : 0.1,
  };

  if (bassInUpper) reasons.push("bass pitch class present in the upper voices");
  if (!bassInUpper && stillness > 0.7) reasons.push("bass is still and absent from the upper voices");
  if (lowClasses.size > 2) reasons.push(`${lowClasses.size} distinct low pitch classes`);
  if (upper.length === 0) reasons.push("no upper voices to relate to");

  const ranked = (Object.entries(scores) as Array<[BassUpperRelation, number]>)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

  return {
    relation: ranked[0][0],
    scores: Object.fromEntries(
      (Object.entries(scores) as Array<[BassUpperRelation, number]>)
        .map(([key, value]) => [key, Number(value.toFixed(6))]),
    ) as Record<BassUpperRelation, number>,
    margin: Number((ranked[0][1] - ranked[1][1]).toFixed(6)),
    reasons,
  };
}

// --- C. root evidence -------------------------------------------------------

export interface RootEvidenceTerms {
  rootPresence: number[];
  tertianSkeleton: number[];
  susSkeleton: number[];
  shellSkeleton: number[];
  guideToneImplication: number[];
  keyPrior: number[];
  continuity: number[];
}

export interface RootEvidence extends RootEvidenceTerms {
  top3: Array<{ pitchClass: number; score: number }>;
  margin: number;
  /** True when no candidate stands out, so a root should not be asserted. */
  rootlessInferred: boolean;
}

export interface RootEvidenceContext {
  /** Pitch classes of the chord before this one, for continuity only. */
  previousRoot?: number;
  /** Weak, and capped so it can never decide a root by itself. */
  keyPitchClasses?: readonly number[];
}

function weightByPitchClass(notes: readonly ObservedNote[]): number[] {
  const weights = PITCH_CLASSES.map(() => 0);
  for (const note of notes) weights[normalizePc(note.pitch)] += note.weight;
  return weights;
}

/**
 * Evidence for each pitch class as the root, with no quality template involved.
 *
 * Each term asks a question a triad or seventh could answer, but none of them
 * asks "which of the twenty-one qualities is this". That separation is the whole
 * point: a root decided by quality template cannot be better than the template,
 * and the template is what gets `A7#5` wrong.
 */
export function rootEvidence(
  observation: ChordObservation,
  context: RootEvidenceContext = {},
): RootEvidence {
  const weights = weightByPitchClass(observation.notes);
  const present = normalised(weights);
  const has = (pitchClass: number) => (weights[normalizePc(pitchClass)] > 0 ? 1 : 0);

  const rootPresence = present.map((value) => value);
  // A third and a fifth above the candidate, either third.
  const tertianSkeleton = PITCH_CLASSES.map((pc) => {
    const third = Math.max(has(pc + 3), has(pc + 4));
    const fifth = has(pc + 7);
    return (third * 0.6 + fifth * 0.4) * (has(pc) ? 1 : 0.6);
  });
  const susSkeleton = PITCH_CLASSES.map((pc) => {
    const suspended = Math.max(has(pc + 2), has(pc + 5));
    const noThird = has(pc + 3) === 0 && has(pc + 4) === 0 ? 1 : 0;
    return suspended * has(pc + 7) * noThird;
  });
  // An inferred root is evidence, but weaker than a heard one. Without this
  // discount a plain C-E-G reads as A minor seventh with the A missing: the G is
  // counted as A's seventh rather than as C's fifth, and the phantom root scores
  // almost as well as the real one. The discount is the same 0.6 the tertian
  // term already applies, for the same reason.
  const inferred = (pc: number) => (has(pc) ? 1 : 0.6);

  // Root and seventh with no fifth: the shell a rootless voicing leaves behind.
  const shellSkeleton = PITCH_CLASSES.map((pc) => {
    const seventh = Math.max(has(pc + 10), has(pc + 11));
    const third = Math.max(has(pc + 3), has(pc + 4));
    return seventh * third * (has(pc + 7) ? 0.7 : 1) * inferred(pc);
  });
  // Third and seventh alone imply a root even when the root is not played.
  const guideToneImplication = PITCH_CLASSES.map((pc) => {
    const third = Math.max(has(pc + 3), has(pc + 4));
    const seventh = Math.max(has(pc + 10), has(pc + 11));
    return third * seventh * inferred(pc);
  });

  const keySet = new Set((context.keyPitchClasses ?? []).map(normalizePc));
  const keyPrior = PITCH_CLASSES.map((pc) => (keySet.has(pc) ? 1 : 0));
  const continuity = PITCH_CLASSES.map(
    (pc) => (context.previousRoot !== undefined && pc === normalizePc(context.previousRoot) ? 1 : 0),
  );

  // Weights are fixed here and are not tuned against Gold. F2 is where the
  // combination is measured; F1 only has to record the terms.
  const combined = PITCH_CLASSES.map((pc) => (
    0.30 * rootPresence[pc]
    + 0.24 * tertianSkeleton[pc]
    + 0.10 * susSkeleton[pc]
    + 0.14 * shellSkeleton[pc]
    + 0.12 * guideToneImplication[pc]
    // Capped hard: a key prior that can outvote what is sounding is a key
    // detector wearing a chord detector's clothes.
    + 0.05 * keyPrior[pc]
    + 0.05 * continuity[pc]
  ));

  const ranked = topThree(combined);
  const margin = marginOf(ranked);
  const round = (values: number[]) => values.map((value) => Number(value.toFixed(6)));

  return {
    rootPresence: round(rootPresence),
    tertianSkeleton: round(tertianSkeleton),
    susSkeleton: round(susSkeleton),
    shellSkeleton: round(shellSkeleton),
    guideToneImplication: round(guideToneImplication),
    keyPrior,
    continuity,
    top3: ranked,
    margin,
    // Guide tones alone do not pin a root: a third and seventh belong to two
    // roots a tritone apart, and asserting one of them is how a rootless voicing
    // becomes a confident wrong answer.
    rootlessInferred: margin < 0.05
      || (rootPresence[ranked[0]?.pitchClass ?? 0] === 0 && ranked.length > 1),
  };
}

// --- D. defining tone evidence ---------------------------------------------

export type ToneVerdict = "supported" | "contradicted" | "underdetermined";

export interface DefiningToneEvidence {
  triad: Record<CoreTriad, ToneVerdict>;
  seventh: Record<SeventhKind, ToneVerdict>;
}

/**
 * For each quality, whether its defining tone is heard, denied, or simply absent.
 *
 * The three-way answer is the point. "Absent" is not "denied": a minor third
 * that nobody plays leaves minor undetermined, while a major third that
 * definitely sounds denies it. A detector that treats both as denial will assert
 * qualities it has no evidence for, which is how a chord with a missing third
 * gets named major.
 */
export function definingToneEvidence(
  observation: ChordObservation,
  root: number,
): DefiningToneEvidence {
  const weights = weightByPitchClass(observation.notes);
  const heard = (interval: number) => weights[normalizePc(root + interval)] > 0;

  const verdict = (supports: boolean, denies: boolean): ToneVerdict => {
    if (supports) return "supported";
    if (denies) return "contradicted";
    return "underdetermined";
  };

  const minorThird = heard(3);
  const majorThird = heard(4);
  const fifth = heard(7);
  const flatFifth = heard(6);
  const sharpFifth = heard(8);

  return {
    triad: {
      major: verdict(majorThird && fifth, minorThird && !majorThird),
      minor: verdict(minorThird && fifth, majorThird && !minorThird),
      diminished: verdict(minorThird && flatFifth, fifth && !flatFifth),
      augmented: verdict(majorThird && sharpFifth, fifth && !sharpFifth),
      sus2: verdict(heard(2) && fifth, minorThird || majorThird),
      sus4: verdict(heard(5) && fifth, minorThird || majorThird),
      power: verdict(fifth && !minorThird && !majorThird, minorThird || majorThird),
      unknown: "underdetermined",
    },
    seventh: {
      minor7: verdict(heard(10), heard(11) && !heard(10)),
      major7: verdict(heard(11), heard(10) && !heard(11)),
      diminished7: verdict(heard(9) && minorThird && flatFifth, heard(10) || heard(11)),
    },
  };
}

// --- E. ambiguity -----------------------------------------------------------

export type AmbiguityKind =
  | "pedal-or-root"
  | "inversion-or-added"
  | "rootless-inferred"
  | "quality-underdetermined"
  | "tension-uncertain"
  | "boundary-uncertain";

export interface ShadowDiagnostics {
  bass: BassEvidence;
  relation: RelationEvidence;
  root: RootEvidence;
  definingTones: DefiningToneEvidence;
  ambiguities: AmbiguityKind[];
  /** The chord the product names here, carried for comparison only. */
  currentRoot?: number;
  currentBass?: number;
}

/**
 * Every diagnostic for one window.
 *
 * Ambiguities are named, not resolved. F1 does not show them and does not act on
 * them; recording which ones fire is how a later stage can tell whether it has
 * anything to act on before the work of acting is done.
 */
export function shadowDiagnostics(
  observation: ChordObservation,
  context: RootEvidenceContext = {},
): ShadowDiagnostics {
  const bass = bassEvidence(observation);
  const relation = relationEvidence(observation, bass);
  const root = rootEvidence(observation, context);
  const chosenRoot = root.top3[0]?.pitchClass ?? 0;
  const definingTones = definingToneEvidence(observation, chosenRoot);

  const ambiguities: AmbiguityKind[] = [];
  if (relation.relation === "pedal" || relation.margin < 0.1) ambiguities.push("pedal-or-root");
  if (root.rootlessInferred) ambiguities.push("rootless-inferred");
  if (bass.top3[0]?.pitchClass !== chosenRoot && relation.relation === "aligned") {
    ambiguities.push("inversion-or-added");
  }
  // Asked about the third specifically, not about whether any triad at all is
  // supported. A root and a fifth support `power`, which is true and says nothing
  // about the question that matters: with no third sounding, major and minor are
  // both still open, and that is what a later stage needs to know.
  if (definingTones.triad.major === "underdetermined"
    && definingTones.triad.minor === "underdetermined") {
    ambiguities.push("quality-underdetermined");
  }
  if (Object.values(definingTones.seventh).every((value) => value === "underdetermined")) {
    ambiguities.push("tension-uncertain");
  }
  if (observation.windowBeats < 1) ambiguities.push("boundary-uncertain");

  return {
    bass,
    relation,
    root,
    definingTones,
    ambiguities,
    ...(observation.currentRoot === undefined ? {} : { currentRoot: observation.currentRoot }),
    ...(observation.currentBass === undefined ? {} : { currentBass: observation.currentBass }),
  };
}
