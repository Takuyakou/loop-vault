import { normalizePc } from "../chords";
import {
  definingToneEvidence,
  rootEvidence,
  type ChordObservation,
  type RootEvidenceContext,
} from "./shadowEvidence";
import { shadowFactorizedRoot, type ShadowFactorizedRoot } from "./shadowFactorizedRoot";

/**
 * Proposing a different root, rarely, and only where the evidence is one-sided.
 *
 * Stage F2 measured the factorized root as worse than the product's overall —
 * 80.2% against 92.1% — and better nowhere. Replacing the product's root with it
 * would import that deficit. But the same measurement found the correct root
 * inside the shadow Top 3 on 100% of inversion and pedal/slash windows, which
 * says the candidate set is sound and only the ranking is not.
 *
 * So the product's Top 1 stays the default and is never replaced wholesale. This
 * looks for the narrow case where the incumbent is positively contradicted, a
 * named alternative has structural support, and the two are too close for the
 * evidence to separate. Everywhere else it abstains, and abstaining is the
 * expected outcome rather than a failure mode.
 *
 * Thresholds are read from the caller and were frozen before any override was
 * measured (`docs/stage-f/03-f2r-preregistered-thresholds.json`). Nothing here is
 * connected to the product.
 */

export interface CorrectionThresholds {
  contestBand: number;
  relationMarginFloor: number;
  bassEvidenceFloor: number;
  bassMarginFloor: number;
}

/** The frozen values. Changing these is changing the contract, not tuning. */
export const preregisteredThresholds: CorrectionThresholds = {
  contestBand: 0.05,
  relationMarginFloor: 0.25,
  bassEvidenceFloor: 0.5,
  bassMarginFloor: 0.5,
};

export type AbstentionReason =
  | "no-product-root"
  | "relation-out-of-scope"
  | "plain-triad"
  | "relation-confidence-too-low"
  | "no-alternative"
  | "not-contested"
  | "alternative-lacks-skeleton"
  | "incumbent-not-contradicted"
  | "alternative-not-a-known-candidate";

export interface CorrectionProposal {
  /** Always the product's root. F2R never changes what the default is. */
  primaryRoot: number;
  proposedRoot: number | null;
  abstained: boolean;
  abstentionReason: AbstentionReason | null;
  /** Which of the two eligible shapes this window is, when one was proposed. */
  caseKind: "pedal-slash" | "inversion" | null;
  contestGap: number;
  relationMargin: number;
  shadow: ShadowFactorizedRoot;
}

export interface CorrectionInput {
  observation: ChordObservation;
  /** The product's Top 1. The default, and the thing being argued against. */
  productRoot: number | undefined;
  /** Roots the product itself already considered, if any. */
  productAlternativeRoots?: readonly number[];
  context?: RootEvidenceContext;
  thresholds?: CorrectionThresholds;
}

/**
 * Is this window a plain triad?
 *
 * Derived from the notes: root, a third and a fifth of the incumbent sounding,
 * no seventh, and the incumbent in the bass. Deliberately not read from a corpus
 * subset label or a scenario id — a rule that knows it is looking at "the
 * plain-triad fixture" would stop working on a real song that happens to contain
 * one, which is every song.
 */
export function isPlainTriad(observation: ChordObservation, root: number): boolean {
  if (observation.notes.length === 0) return false;
  const sounding = new Set(observation.notes.map((note) => normalizePc(note.pitch)));
  const has = (interval: number) => sounding.has(normalizePc(root + interval));

  const third = has(3) || has(4);
  const fifth = has(7);
  const seventh = has(10) || has(11);
  const lowest = normalizePc(
    observation.notes.reduce(
      (low, note) => (note.pitch < low.pitch ? note : low),
      observation.notes[0],
    ).pitch,
  );

  return third && fifth && !seventh && lowest === normalizePc(root);
}

const abstain = (
  primaryRoot: number,
  shadow: ShadowFactorizedRoot,
  reason: AbstentionReason,
  contestGap = 0,
): CorrectionProposal => ({
  primaryRoot,
  proposedRoot: null,
  abstained: true,
  abstentionReason: reason,
  caseKind: null,
  contestGap: Number(contestGap.toFixed(6)),
  relationMargin: shadow.relationMargin,
  shadow,
});

/**
 * The six conditions, in order, each with its own abstention reason.
 *
 * Ordered so the cheapest and most decisive exclusions come first, and so the
 * recorded reason says which condition actually stopped it. A single
 * "abstained" flag would make the abstention rate uninterpretable.
 */
export function proposeRootCorrection(input: CorrectionInput): CorrectionProposal {
  const thresholds = input.thresholds ?? preregisteredThresholds;
  const shadow = shadowFactorizedRoot(input.observation, input.context ?? {});

  if (input.productRoot === undefined) {
    return abstain(-1, shadow, "no-product-root");
  }
  const primaryRoot = normalizePc(input.productRoot);

  // Walking is Stage F2W. Stage F2 measured its Top 3 at 60.9%, so the candidate
  // set itself is unreliable and a rule built on it would be guessing.
  if (shadow.relation !== "pedal" && shadow.relation !== "aligned") {
    return abstain(primaryRoot, shadow, "relation-out-of-scope");
  }

  if (isPlainTriad(input.observation, primaryRoot)) {
    return abstain(primaryRoot, shadow, "plain-triad");
  }

  const evidence = rootEvidence(input.observation, input.context ?? {});
  const bassAmount = shadowBassAmount(input.observation);

  if (shadow.relationMargin < thresholds.relationMarginFloor
    || bassAmount.evidenceAmount < thresholds.bassEvidenceFloor
    || bassAmount.margin < thresholds.bassMarginFloor) {
    return abstain(primaryRoot, shadow, "relation-confidence-too-low");
  }

  // The alternative is the best shadow candidate that is not the incumbent.
  const alternative = shadow.top3.find((candidate) => candidate.pitchClass !== primaryRoot);
  if (alternative === undefined) {
    return abstain(primaryRoot, shadow, "no-alternative");
  }

  const incumbentScore = shadow.top3.find(
    (candidate) => candidate.pitchClass === primaryRoot,
  )?.score ?? 0;
  const contestGap = Math.abs(alternative.score - incumbentScore);
  if (contestGap > thresholds.contestBand) {
    return abstain(primaryRoot, shadow, "not-contested", contestGap);
  }

  const alternativeHasSkeleton = evidence.tertianSkeleton[alternative.pitchClass] > 0
    && (evidence.rootPresence[alternative.pitchClass] > 0
      || evidence.shellSkeleton[alternative.pitchClass] > 0);
  if (!alternativeHasSkeleton) {
    return abstain(primaryRoot, shadow, "alternative-lacks-skeleton", contestGap);
  }

  // A reason to disbelieve the incumbent, not merely a reason to like the
  // challenger. "Underdetermined" is deliberately not enough — F1 exists because
  // absence is not denial.
  const incumbentTones = definingToneEvidence(input.observation, primaryRoot);
  const incumbentContradicted = evidence.rootPresence[primaryRoot] === 0
    || (incumbentTones.triad.major === "contradicted"
      && incumbentTones.triad.minor === "contradicted");
  if (!incumbentContradicted) {
    return abstain(primaryRoot, shadow, "incumbent-not-contradicted", contestGap);
  }

  const known = new Set<number>([
    ...shadow.top3.map((candidate) => candidate.pitchClass),
    shadow.bassTop1,
    ...(input.productAlternativeRoots ?? []).map(normalizePc),
  ]);
  if (!known.has(alternative.pitchClass)) {
    return abstain(primaryRoot, shadow, "alternative-not-a-known-candidate", contestGap);
  }

  return {
    primaryRoot,
    proposedRoot: alternative.pitchClass,
    abstained: false,
    abstentionReason: null,
    // A pedal is a bass sitting under a chord it is not part of; an inversion is
    // a bass that is part of the chord but is not its root. The relation already
    // separates them, so the case kind is read from it rather than re-derived.
    caseKind: shadow.relation === "pedal" ? "pedal-slash" : "inversion",
    contestGap: Number(contestGap.toFixed(6)),
    relationMargin: shadow.relationMargin,
    shadow,
  };
}

/** Bass amount and margin, recomputed here so the caller needs only one call. */
function shadowBassAmount(observation: ChordObservation) {
  const notes = observation.notes;
  if (notes.length === 0) return { evidenceAmount: 0, margin: 0 };
  const lowest = Math.min(...notes.map((note) => note.pitch));
  const low = notes.filter((note) => note.pitch <= lowest + 12);
  const weights = Array.from({ length: 12 }, () => 0);
  for (const note of low) {
    const depth = 1 - (note.pitch - lowest) / 12;
    weights[normalizePc(note.pitch)] += note.weight * (0.5 + 0.5 * depth);
  }
  const total = weights.reduce((sum, value) => sum + value, 0);
  const sorted = [...weights].sort((left, right) => right - left);
  return {
    evidenceAmount: low.reduce((sum, note) => sum + note.weight, 0)
      / Math.max(1e-6, observation.windowBeats),
    margin: total > 0 ? (sorted[0] - sorted[1]) / total : 0,
  };
}

/** The correction pass over a whole sequence, chaining shadow continuity. */
export function proposeRootCorrections(
  inputs: readonly Omit<CorrectionInput, "context">[],
  options: { keyPitchClasses?: readonly number[]; thresholds?: CorrectionThresholds } = {},
): CorrectionProposal[] {
  const proposals: CorrectionProposal[] = [];
  let previousRoot: number | undefined;

  for (const input of inputs) {
    const proposal = proposeRootCorrection({
      ...input,
      context: {
        ...(previousRoot === undefined ? {} : { previousRoot }),
        ...(options.keyPitchClasses ? { keyPitchClasses: options.keyPitchClasses } : {}),
      },
      ...(options.thresholds ? { thresholds: options.thresholds } : {}),
    });
    previousRoot = proposal.shadow.top1;
    proposals.push(proposal);
  }

  return proposals;
}

/** The root F2R would show, which is the product's unless it proposed otherwise. */
export function correctedRoot(proposal: CorrectionProposal): number {
  return proposal.proposedRoot ?? proposal.primaryRoot;
}
