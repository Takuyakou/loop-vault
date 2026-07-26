import { normalizePc } from "../chords";
import { chordIdentityKey, type NormalizedChordIdentity } from "../chordIdentity";
import type { CoreTriad, SeventhKind } from "../chordFactorization";
import {
  definingToneEvidence,
  type ChordObservation,
  type ToneVerdict,
} from "./shadowEvidence";

/**
 * Choosing a quality for a root that is already decided.
 *
 * The root research is closed: `phase4-v1`'s root is the product's root and this
 * never touches it. That is the point. Stages F2 through F2A spent four rounds
 * discovering that a root chosen from evidence is worse than the product's, and
 * the one thing that came out of it intact was the three-way verdict from F1 —
 * that a note nobody plays leaves a quality undetermined rather than denied.
 *
 * So this asks a much smaller question. Given the root and the bass, which
 * triad and seventh does the evidence actually support? Candidates are removed
 * only when something sounding contradicts them. A candidate whose defining tone
 * is simply absent stays in, because absence is not denial — and a detector that
 * eliminates on absence is how a chord with no third gets named major.
 *
 * Tensions are taken from the product unchanged. Nothing here is connected to
 * the product.
 */

/**
 * The quality layer's knobs.
 *
 * Present so the perturbation test has something real to move. The root and bass
 * are inputs rather than outputs, so no setting of these can change them — which
 * is exactly the invariant F3a has to demonstrate rather than assert.
 */
export interface QualityScoringParameters {
  supportedWeight: number;
  underdeterminedWeight: number;
  /** Prefers the more specific reading when both are supported. */
  specificityBonus: number;
}

export const defaultQualityScoring: QualityScoringParameters = {
  supportedWeight: 1,
  underdeterminedWeight: 0.35,
  specificityBonus: 0.15,
};

export function scaleQualityScoring(
  parameters: QualityScoringParameters,
  scale: number,
): QualityScoringParameters {
  return {
    supportedWeight: parameters.supportedWeight * scale,
    underdeterminedWeight: parameters.underdeterminedWeight * scale,
    specificityBonus: parameters.specificityBonus * scale,
  };
}

/**
 * Triads from least to most specific.
 *
 * Used only to break a tie between two candidates the evidence supports equally.
 * `power` is least specific because it claims the least — a root and a fifth are
 * true of every tertian chord — so it wins only when nothing else survives.
 */
const TRIAD_SPECIFICITY: CoreTriad[] = [
  "power", "sus2", "sus4", "major", "minor", "diminished", "augmented",
];

const SEVENTH_SPECIFICITY: Array<SeventhKind | null> = [null, "minor7", "major7", "diminished7"];

export interface QualityCandidate<T> {
  value: T;
  verdict: ToneVerdict;
  score: number;
  eliminated: boolean;
}

export interface ShadowQuality {
  /** Copied from the product. Never derived here. */
  root: number;
  bass: number;
  triad: CoreTriad;
  seventh: SeventhKind | null;
  triadCandidates: Array<QualityCandidate<CoreTriad>>;
  seventhCandidates: Array<QualityCandidate<SeventhKind | null>>;
  /** Removed because something sounding contradicted them. */
  eliminatedByContradiction: string[];
  /** Kept despite an absent defining tone. */
  survivingUnderdetermined: string[];
  /** True when no candidate was positively supported. */
  triadUnsupported: boolean;
  seventhUnsupported: boolean;
}

export interface ShadowQualityInput {
  observation: ChordObservation;
  /** The product's root. An input, so no parameter here can move it. */
  root: number;
  /** The product's bass. Likewise. */
  bass: number;
  parameters?: QualityScoringParameters;
}

function scoreVerdict(
  verdict: ToneVerdict,
  specificityIndex: number,
  total: number,
  parameters: QualityScoringParameters,
): number {
  const base = verdict === "supported"
    ? parameters.supportedWeight
    : (verdict === "underdetermined" ? parameters.underdeterminedWeight : Number.NEGATIVE_INFINITY);
  return base + parameters.specificityBonus * (specificityIndex / Math.max(1, total - 1));
}

/**
 * Whether a seventh sounds at all, which is what makes "no seventh" a claim
 * rather than a default.
 *
 * Without this the absence of a seventh would be scored the same as the absence
 * of evidence about a seventh, and the tri-state would collapse back to two
 * states for the one case it most needs three.
 */
function noSeventhVerdict(observation: ChordObservation, root: number): ToneVerdict {
  const sounding = new Set(observation.notes.map((note) => normalizePc(note.pitch)));
  if (observation.notes.length === 0) return "underdetermined";
  const minorSeventh = sounding.has(normalizePc(root + 10));
  const majorSeventh = sounding.has(normalizePc(root + 11));
  // A seventh is audibly there, so "no seventh" is contradicted.
  if (minorSeventh || majorSeventh) return "contradicted";
  // Nothing above the fifth sounds and the chord is otherwise well described:
  // "no seventh" is positively supported rather than merely unrefuted.
  const third = sounding.has(normalizePc(root + 3)) || sounding.has(normalizePc(root + 4));
  const fifth = sounding.has(normalizePc(root + 7));
  return third && fifth ? "supported" : "underdetermined";
}

/**
 * The quality the evidence supports for an already-decided root.
 *
 * Elimination is by contradiction only. A candidate whose defining tone is
 * absent keeps a positive score and can still win, which is the behaviour the
 * whole tri-state exists to produce.
 */
export function shadowQuality(input: ShadowQualityInput): ShadowQuality {
  const parameters = input.parameters ?? defaultQualityScoring;
  const root = normalizePc(input.root);
  const bass = normalizePc(input.bass);
  const tones = definingToneEvidence(input.observation, root);

  const triadCandidates = TRIAD_SPECIFICITY.map((value, index) => {
    const verdict = tones.triad[value];
    return {
      value,
      verdict,
      score: Number(scoreVerdict(verdict, index, TRIAD_SPECIFICITY.length, parameters).toFixed(6)),
      eliminated: verdict === "contradicted",
    };
  });

  const seventhCandidates = SEVENTH_SPECIFICITY.map((value, index) => {
    const verdict = value === null
      ? noSeventhVerdict(input.observation, root)
      : tones.seventh[value];
    return {
      value,
      verdict,
      score: Number(scoreVerdict(verdict, index, SEVENTH_SPECIFICITY.length, parameters).toFixed(6)),
      eliminated: verdict === "contradicted",
    };
  });

  const pickBest = <T>(candidates: Array<QualityCandidate<T>>, fallback: T): T => {
    const survivors = candidates.filter((candidate) => !candidate.eliminated);
    if (survivors.length === 0) return fallback;
    return survivors.reduce(
      (best, candidate) => (candidate.score > best.score ? candidate : best),
    ).value;
  };

  // `unknown` when everything is contradicted, which is a real outcome and
  // better said than papered over with a guess.
  const triad = pickBest<CoreTriad>(triadCandidates, "unknown");
  const seventh = pickBest<SeventhKind | null>(seventhCandidates, null);

  return {
    root,
    bass,
    triad,
    seventh,
    triadCandidates,
    seventhCandidates,
    eliminatedByContradiction: [
      ...triadCandidates.filter((candidate) => candidate.eliminated)
        .map((candidate) => `triad:${candidate.value}`),
      ...seventhCandidates.filter((candidate) => candidate.eliminated)
        .map((candidate) => `seventh:${candidate.value ?? "none"}`),
    ],
    survivingUnderdetermined: [
      ...triadCandidates.filter((candidate) => candidate.verdict === "underdetermined")
        .map((candidate) => `triad:${candidate.value}`),
      ...seventhCandidates.filter((candidate) => candidate.verdict === "underdetermined")
        .map((candidate) => `seventh:${candidate.value ?? "none"}`),
    ],
    triadUnsupported: !triadCandidates.some((candidate) => candidate.verdict === "supported"),
    seventhUnsupported: !seventhCandidates.some((candidate) => candidate.verdict === "supported"),
  };
}

/**
 * The shadow quality as a canonical identity, using the product's tensions.
 *
 * Tension detection is untouched by F3a, so the extensions and alterations come
 * straight from whatever the product decided. Only the triad and the seventh are
 * the shadow's, which keeps the comparison attributable to the one thing that
 * changed.
 */
export function shadowIdentity(
  quality: ShadowQuality,
  productIdentity: NormalizedChordIdentity,
): NormalizedChordIdentity {
  return {
    rootPitchClass: quality.root,
    triad: quality.triad,
    ...(quality.seventh ? { seventh: quality.seventh } : {}),
    extensions: [...productIdentity.extensions],
    alterations: [...productIdentity.alterations],
    ...(quality.bass !== quality.root ? { bassPitchClass: quality.bass } : {}),
  };
}

/** Convenience for comparing a shadow identity with a gold one. */
export function identitiesMatch(
  left: NormalizedChordIdentity,
  right: NormalizedChordIdentity,
): boolean {
  return chordIdentityKey(left) === chordIdentityKey(right);
}

/**
 * Does perturbing the quality parameters move the root or the bass?
 *
 * It cannot, because both are inputs. Measured rather than argued: the whole
 * reason F3a is allowed to proceed after the root research closed is that it
 * provably cannot reopen it.
 */
export function rootAndBassAreInvariant(
  inputs: readonly ShadowQualityInput[],
  scales: readonly number[] = [0.7, 1.0, 1.3],
): { invariant: boolean; perturbationHadEffect: boolean } {
  const rootBassOf = (scale: number) => inputs.map((input) => {
    const result = shadowQuality({
      ...input,
      parameters: scaleQualityScoring(input.parameters ?? defaultQualityScoring, scale),
    });
    return `${result.root}:${result.bass}`;
  }).join("|");
  const qualityOf = (scale: number) => inputs.map((input) => {
    const result = shadowQuality({
      ...input,
      parameters: scaleQualityScoring(input.parameters ?? defaultQualityScoring, scale),
    });
    return `${result.triad}:${result.seventh ?? "-"}:${result.triadCandidates.map((c) => c.score).join(",")}`;
  }).join("|");

  const first = rootBassOf(scales[0]);
  const firstQuality = qualityOf(scales[0]);
  return {
    invariant: scales.every((scale) => rootBassOf(scale) === first),
    // Without this the invariance result is vacuous.
    perturbationHadEffect: scales.some((scale) => qualityOf(scale) !== firstQuality),
  };
}
