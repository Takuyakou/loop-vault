import { normalizePc } from "../chords";
import { rootEvidence, type ChordObservation, type ObservedNote, type RootEvidenceContext } from "./shadowEvidence";

/**
 * Why the right root is not even among the candidates when the bass walks.
 *
 * Stage F2 measured walking bass at 11.8% for the shadow's first choice and
 * 60.9% for its top three. Everywhere else the top three contained the answer —
 * 100% on inversion and pedal/slash — so walking is not a ranking problem. Four
 * windows in ten do not contain the right root at all, which means the evidence
 * feeding candidate generation is wrong before anything is ranked.
 *
 * The suspicion is specific and testable: bass evidence is gathered from every
 * note in the low register weighted by how long it sounds, and a walking line
 * spends most of its time on notes that are not the root. Approach tones,
 * chromatic passing notes and the note it is heading towards all vote, and they
 * outnumber the chord tone.
 *
 * Each variant below is a different answer to "which low notes should count",
 * expressed as a reweighting of the observed notes. The root pipeline after it
 * is unchanged, so a difference between variants is a difference in candidate
 * generation and nothing else. Nothing here is connected to the product.
 */

export type BassWeightingVariant =
  | "current"
  | "strong-beat"
  | "long-duration"
  | "passing-tone-attenuated"
  | "faster-than-harmony-attenuated"
  | "chord-boundary-preferred";

export const bassWeightingVariants: BassWeightingVariant[] = [
  "current",
  "strong-beat",
  "long-duration",
  "passing-tone-attenuated",
  "faster-than-harmony-attenuated",
  "chord-boundary-preferred",
];

/**
 * A note with enough context to judge whether it is structural or passing.
 *
 * `onsetBeat` is relative to the window. Without it none of the variants below
 * can be expressed: "on a strong beat", "moving faster than the harmony" and
 * "near the boundary" are all statements about when a note starts, and the
 * plain `ObservedNote` only says how long it lasts.
 */
export interface TimedObservedNote extends ObservedNote {
  onsetBeat: number;
}

export interface WalkingObservation extends ChordObservation {
  timedNotes: TimedObservedNote[];
  beatsPerBar: number;
}

/** Everything within an octave of the lowest note, which is where a bass line lives. */
function lowBand(notes: readonly TimedObservedNote[]): TimedObservedNote[] {
  if (notes.length === 0) return [];
  const lowest = Math.min(...notes.map((note) => note.pitch));
  return notes.filter((note) => note.pitch <= lowest + 12);
}

function isStrongBeat(onsetBeat: number, beatsPerBar: number): boolean {
  const withinBar = ((onsetBeat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  // Beat one and the half-bar. Anything else is weak for this purpose.
  return Math.abs(withinBar) < 1e-6 || Math.abs(withinBar - beatsPerBar / 2) < 1e-6;
}

/**
 * A note that steps to its neighbour on a weak beat and does not stay.
 *
 * This is what a passing tone is: it is approached and left by step, it sits off
 * the beat, and it is short. Requiring all three keeps a genuine chord change
 * that happens to be stepwise from being attenuated.
 */
function passingToneFactor(
  note: TimedObservedNote,
  band: readonly TimedObservedNote[],
  beatsPerBar: number,
): number {
  if (isStrongBeat(note.onsetBeat, beatsPerBar)) return 1;
  const neighbours = band.filter((other) => other !== note);
  const steppedInto = neighbours.some(
    (other) => Math.abs(other.pitch - note.pitch) <= 2
      && other.onsetBeat < note.onsetBeat,
  );
  const steppedOutOf = neighbours.some(
    (other) => Math.abs(other.pitch - note.pitch) <= 2
      && other.onsetBeat > note.onsetBeat,
  );
  const short = note.weight <= 1;
  return steppedInto && steppedOutOf && short ? 0.25 : 1;
}

/**
 * How fast the bass moves compared with the upper voices.
 *
 * A bass that changes note four times while the harmony above it holds still is
 * not spelling four chords; it is walking through one. Attenuating by the ratio
 * treats the bass as less reliable exactly in proportion to how much faster it
 * is moving, rather than switching it off at a threshold nobody can justify.
 */
function harmonySpeedFactor(
  band: readonly TimedObservedNote[],
  upper: readonly TimedObservedNote[],
): number {
  const bassOnsets = new Set(band.map((note) => Number(note.onsetBeat.toFixed(4)))).size;
  const upperOnsets = new Set(upper.map((note) => Number(note.onsetBeat.toFixed(4)))).size;
  if (bassOnsets <= 1 || upperOnsets === 0) return 1;
  const ratio = bassOnsets / Math.max(1, upperOnsets);
  return ratio <= 1 ? 1 : Math.max(0.2, 1 / ratio);
}

/**
 * Reweights the notes according to one hypothesis about which bass notes matter.
 *
 * Only low-register notes are ever touched. The upper voices carry the harmony
 * and reweighting them would change what is being tested from "which bass notes
 * count" to "which notes count", which is a different question.
 */
export function reweightForVariant(
  observation: WalkingObservation,
  variant: BassWeightingVariant,
): ObservedNote[] {
  const band = new Set(lowBand(observation.timedNotes));
  const upper = observation.timedNotes.filter((note) => !band.has(note));
  const bandNotes = [...band];
  const speedFactor = harmonySpeedFactor(bandNotes, upper);
  const longest = Math.max(1e-6, ...bandNotes.map((note) => note.weight));
  const windowEnd = observation.windowBeats;

  return observation.timedNotes.map((note) => {
    if (!band.has(note)) return { pitch: note.pitch, weight: note.weight, role: note.role };

    let factor = 1;
    switch (variant) {
      case "current":
        break;
      case "strong-beat":
        factor = isStrongBeat(note.onsetBeat, observation.beatsPerBar) ? 1 : 0.3;
        break;
      case "long-duration":
        // Proportional to how much of the longest bass note this one lasts, so a
        // held target note outweighs the three eighths that led to it.
        factor = note.weight / longest;
        break;
      case "passing-tone-attenuated":
        factor = passingToneFactor(note, bandNotes, observation.beatsPerBar);
        break;
      case "faster-than-harmony-attenuated":
        factor = speedFactor;
        break;
      case "chord-boundary-preferred": {
        // Near either edge of the window, which is where a chord change puts the
        // note that names it.
        const fromStart = note.onsetBeat;
        const fromEnd = Math.max(0, windowEnd - (note.onsetBeat + note.weight));
        const distance = Math.min(fromStart, fromEnd);
        factor = distance <= 0.5 ? 1 : Math.max(0.25, 1 / (1 + distance));
        break;
      }
    }

    return { pitch: note.pitch, weight: note.weight * factor, role: note.role };
  });
}

const TERM_WEIGHTS = {
  rootPresence: 0.30,
  tertianSkeleton: 0.24,
  susSkeleton: 0.10,
  shellSkeleton: 0.14,
  guideToneImplication: 0.12,
  keyPrior: 0.05,
  continuity: 0.05,
} as const;

export interface RootCandidateRanking {
  ranked: Array<{ pitchClass: number; score: number }>;
  /**
   * Shannon entropy of the normalised score distribution, in bits.
   *
   * A flat distribution means the evidence names no candidate; a peaked one
   * means it names one. Reported because a variant that raises recall by
   * flattening everything has not found the root, it has stopped choosing.
   */
  entropy: number;
}

/**
 * The same combination Stage F2 uses, over all twelve candidates.
 *
 * Weights are identical to `shadowFactorizedRoot`'s and are not re-fitted here.
 * F2W is asking whether better bass evidence puts the right root in the
 * candidate set; changing the ranking weights at the same time would make the
 * answer unattributable.
 */
export function rankRootCandidates(
  notes: readonly ObservedNote[],
  windowBeats: number,
  context: RootEvidenceContext = {},
): RootCandidateRanking {
  const evidence = rootEvidence({ notes: [...notes], windowBeats }, context);
  const combined = Array.from({ length: 12 }, (_unused, pitchClass) => (
    TERM_WEIGHTS.rootPresence * evidence.rootPresence[pitchClass]
    + TERM_WEIGHTS.tertianSkeleton * evidence.tertianSkeleton[pitchClass]
    + TERM_WEIGHTS.susSkeleton * evidence.susSkeleton[pitchClass]
    + TERM_WEIGHTS.shellSkeleton * evidence.shellSkeleton[pitchClass]
    + TERM_WEIGHTS.guideToneImplication * evidence.guideToneImplication[pitchClass]
    + TERM_WEIGHTS.keyPrior * evidence.keyPrior[pitchClass]
    + TERM_WEIGHTS.continuity * evidence.continuity[pitchClass]
  ));

  const total = combined.reduce((sum, value) => sum + value, 0);
  const entropy = total <= 0 ? 0 : -combined.reduce((sum, value) => {
    if (value <= 0) return sum;
    const probability = value / total;
    return sum + probability * Math.log2(probability);
  }, 0);

  return {
    ranked: combined
      .map((score, pitchClass) => ({ pitchClass, score: Number(score.toFixed(6)) }))
      .sort((left, right) => right.score - left.score || left.pitchClass - right.pitchClass),
    entropy: Number(entropy.toFixed(6)),
  };
}

export interface VariantOutcome {
  variant: BassWeightingVariant;
  ranking: RootCandidateRanking;
  /** Low-register pitch classes this variant reduced to near nothing. */
  suppressedPitchClasses: number[];
}

/** Every variant's ranking for one window, so they can be compared directly. */
export function compareVariants(
  observation: WalkingObservation,
  context: RootEvidenceContext = {},
): VariantOutcome[] {
  const baseline = reweightForVariant(observation, "current");
  const baselineWeight = weightByPitchClass(baseline);

  return bassWeightingVariants.map((variant) => {
    const notes = reweightForVariant(observation, variant);
    const weights = weightByPitchClass(notes);
    const suppressed: number[] = [];
    for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
      // Counted as suppressed only when it had real weight and lost most of it,
      // so a pitch class that was never there is not reported as removed.
      if (baselineWeight[pitchClass] > 0.5 && weights[pitchClass] < baselineWeight[pitchClass] * 0.4) {
        suppressed.push(pitchClass);
      }
    }
    return {
      variant,
      ranking: rankRootCandidates(notes, observation.windowBeats, context),
      suppressedPitchClasses: suppressed,
    };
  });
}

function weightByPitchClass(notes: readonly ObservedNote[]): number[] {
  const weights = Array.from({ length: 12 }, () => 0);
  for (const note of notes) weights[normalizePc(note.pitch)] += note.weight;
  return weights;
}

/**
 * Is the bass actually walking, judged from the notes?
 *
 * Independent of Stage F1's `relation` on purpose. Defining the evaluation
 * subset by the same classifier whose consequences are being measured would make
 * the result circular: any window the classifier mislabels would silently leave
 * the subset, and the measurement would flatter the classifier.
 */
export function looksLikeWalkingBass(observation: WalkingObservation): boolean {
  const band = lowBand(observation.timedNotes);
  if (band.length < 3) return false;
  const distinctPitchClasses = new Set(band.map((note) => normalizePc(note.pitch))).size;
  const bassOnsets = new Set(band.map((note) => Number(note.onsetBeat.toFixed(4)))).size;
  const upper = observation.timedNotes.filter((note) => !band.includes(note));
  const upperOnsets = new Set(upper.map((note) => Number(note.onsetBeat.toFixed(4)))).size;

  // Three or more distinct low pitch classes, arriving on three or more separate
  // onsets, moving at least as often as the harmony above.
  return distinctPitchClasses >= 3 && bassOnsets >= 3 && bassOnsets > upperOnsets;
}
