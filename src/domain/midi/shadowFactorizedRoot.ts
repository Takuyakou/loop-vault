import { normalizePc } from "../chords";
import {
  rootEvidence,
  relationEvidence,
  bassEvidence,
  type ChordObservation,
  type RootEvidenceContext,
  type BassUpperRelation,
} from "./shadowEvidence";

/**
 * A root chosen without asking what the chord is.
 *
 * The current detector picks a root by scoring whole quality templates and
 * taking the root of the winner. That makes the root only as good as the
 * template list: when `A7#5` is not in the list, the root comes from whichever
 * listed quality fit best, and a root decided that way cannot be better than the
 * quality layer it inherited its mistake from.
 *
 * This scores the root from what is sounding — which pitch classes are present,
 * what skeleton sits above each candidate, what a third-and-seventh pair
 * implies — and never from a quality template. The point is not that these
 * weights are better; it is that a root produced this way is *independent* of
 * the quality layer, so the two can be improved separately.
 *
 * Nothing here is connected to the product. F2 measures; F2b would connect, and
 * is deliberately not part of this stage.
 */

/**
 * The quality layer's parameters.
 *
 * Present so the isolation test has something real to perturb. The factorized
 * root must not read them; `qualityTemplateScore` does, and exists only so the
 * test can show the perturbation was actually applied. A test that scales a
 * parameter nothing reads proves nothing.
 */
export interface QualityLayerParameters {
  triadWeight: number;
  seventhWeight: number;
  extensionWeight: number;
  missingQualityPenalty: number;
}

export const defaultQualityLayer: QualityLayerParameters = {
  triadWeight: 1,
  seventhWeight: 0.8,
  extensionWeight: 0.5,
  missingQualityPenalty: 0.3,
};

export function scaleQualityLayer(
  parameters: QualityLayerParameters,
  scale: number,
): QualityLayerParameters {
  return {
    triadWeight: parameters.triadWeight * scale,
    seventhWeight: parameters.seventhWeight * scale,
    extensionWeight: parameters.extensionWeight * scale,
    missingQualityPenalty: parameters.missingQualityPenalty * scale,
  };
}

export interface ShadowFactorizedRoot {
  top1: number;
  top3: Array<{ pitchClass: number; score: number }>;
  margin: number;
  /** No candidate stands out, so no root should be asserted. */
  rootlessInferred: boolean;
  /** Diagnostic only. Never summed into the score above. */
  relation: BassUpperRelation;
  relationMargin: number;
  bassTop1: number;
  terms: {
    rootPresence: number;
    tertianSkeleton: number;
    susSkeleton: number;
    shellSkeleton: number;
    guideToneImplication: number;
    keyPrior: number;
    continuity: number;
  };
}

/**
 * Weights for the terms that are allowed to decide a root.
 *
 * Fixed rather than fitted. Fitting them against Gold in a shadow stage would
 * make the shadow numbers a measure of the fitting rather than of the approach,
 * and the whole reason to run a shadow stage is to find out whether the approach
 * is worth connecting.
 */
const TERM_WEIGHTS = {
  rootPresence: 0.30,
  tertianSkeleton: 0.24,
  susSkeleton: 0.10,
  shellSkeleton: 0.14,
  guideToneImplication: 0.12,
  // Both capped low on purpose. A key prior or a previous chord that can outvote
  // what is sounding stops being a prior and starts being the answer.
  keyPrior: 0.05,
  continuity: 0.05,
} as const;

/**
 * A quality-template score, computed and discarded.
 *
 * Exists so `shadowFactorizedRootIsIsolated` can demonstrate that perturbing the
 * quality layer changes something — otherwise the isolation test would pass
 * trivially on parameters that nothing anywhere reads.
 */
export function qualityTemplateScore(
  observation: ChordObservation,
  root: number,
  parameters: QualityLayerParameters = defaultQualityLayer,
): number {
  const weights = Array.from({ length: 12 }, () => 0);
  for (const note of observation.notes) weights[normalizePc(note.pitch)] += note.weight;
  const has = (interval: number) => (weights[normalizePc(root + interval)] > 0 ? 1 : 0);

  const triad = Math.max(has(3), has(4)) * has(7);
  const seventh = Math.max(has(10), has(11));
  const extensions = has(2) + has(5) + has(9);
  const missing = triad === 0 ? 1 : 0;

  return parameters.triadWeight * triad
    + parameters.seventhWeight * seventh
    + parameters.extensionWeight * extensions
    - parameters.missingQualityPenalty * missing;
}

/**
 * The shadow root.
 *
 * `qualityLayer` is accepted and deliberately unused by the scoring below. It is
 * in the signature so a caller cannot pass it and quietly believe it mattered,
 * and so the isolation test can pass a perturbed value through the same door a
 * future mistake would come through.
 */
export function shadowFactorizedRoot(
  observation: ChordObservation,
  context: RootEvidenceContext = {},
  _qualityLayer: QualityLayerParameters = defaultQualityLayer,
): ShadowFactorizedRoot {
  const evidence = rootEvidence(observation, context);
  const bass = bassEvidence(observation);
  const relation = relationEvidence(observation, bass);

  const combined = Array.from({ length: 12 }, (_unused, pitchClass) => (
    TERM_WEIGHTS.rootPresence * evidence.rootPresence[pitchClass]
    + TERM_WEIGHTS.tertianSkeleton * evidence.tertianSkeleton[pitchClass]
    + TERM_WEIGHTS.susSkeleton * evidence.susSkeleton[pitchClass]
    + TERM_WEIGHTS.shellSkeleton * evidence.shellSkeleton[pitchClass]
    + TERM_WEIGHTS.guideToneImplication * evidence.guideToneImplication[pitchClass]
    + TERM_WEIGHTS.keyPrior * evidence.keyPrior[pitchClass]
    + TERM_WEIGHTS.continuity * evidence.continuity[pitchClass]
  ));

  const ranked = combined
    .map((score, pitchClass) => ({ pitchClass, score: Number(score.toFixed(6)) }))
    .sort((left, right) => right.score - left.score || left.pitchClass - right.pitchClass)
    .slice(0, 3);

  const top1 = ranked[0]?.pitchClass ?? 0;
  return {
    top1,
    top3: ranked,
    margin: Number(((ranked[0]?.score ?? 0) - (ranked[1]?.score ?? 0)).toFixed(6)),
    rootlessInferred: evidence.rootlessInferred,
    // Carried alongside, not added in. Routing the root on the bass relation is
    // F4's question, and answering it here would make F2's numbers unable to say
    // anything about the factorized root on its own.
    relation: relation.relation,
    relationMargin: relation.margin,
    bassTop1: bass.top3[0]?.pitchClass ?? -1,
    terms: {
      rootPresence: evidence.rootPresence[top1],
      tertianSkeleton: evidence.tertianSkeleton[top1],
      susSkeleton: evidence.susSkeleton[top1],
      shellSkeleton: evidence.shellSkeleton[top1],
      guideToneImplication: evidence.guideToneImplication[top1],
      keyPrior: evidence.keyPrior[top1],
      continuity: evidence.continuity[top1],
    },
  };
}

/**
 * The shadow root for a whole sequence, chaining continuity forward.
 *
 * Continuity uses the previous *shadow* root rather than the product's, so the
 * sequence is not quietly anchored to the answer it is being compared against.
 */
export function shadowFactorizedRootSequence(
  observations: readonly ChordObservation[],
  options: {
    keyPitchClasses?: readonly number[];
    qualityLayer?: QualityLayerParameters;
  } = {},
): ShadowFactorizedRoot[] {
  const results: ShadowFactorizedRoot[] = [];
  let previousRoot: number | undefined;

  for (const observation of observations) {
    const result = shadowFactorizedRoot(
      observation,
      {
        ...(previousRoot === undefined ? {} : { previousRoot }),
        ...(options.keyPitchClasses ? { keyPitchClasses: options.keyPitchClasses } : {}),
      },
      options.qualityLayer ?? defaultQualityLayer,
    );
    previousRoot = result.top1;
    results.push(result);
  }

  return results;
}

/**
 * Does perturbing the quality layer change the shadow root sequence?
 *
 * Returns both answers, because only reporting the first would let a vacuous
 * pass look like a real one: if the perturbation changed nothing anywhere, the
 * root being unchanged says nothing about isolation.
 */
export function shadowFactorizedRootIsIsolated(
  observations: readonly ChordObservation[],
  scales: readonly number[] = [0.7, 1.0, 1.3],
): {
  isolated: boolean;
  perturbationHadEffect: boolean;
  sequences: Record<string, number[]>;
} {
  const sequences: Record<string, number[]> = {};
  const qualityScores: Record<string, number[]> = {};

  for (const scale of scales) {
    const layer = scaleQualityLayer(defaultQualityLayer, scale);
    const sequence = shadowFactorizedRootSequence(observations, { qualityLayer: layer });
    sequences[String(scale)] = sequence.map((entry) => entry.top1);
    qualityScores[String(scale)] = observations.map(
      (observation, index) => qualityTemplateScore(observation, sequence[index].top1, layer),
    );
  }

  const keys = Object.keys(sequences);
  const first = JSON.stringify(sequences[keys[0]]);
  const isolated = keys.every((key) => JSON.stringify(sequences[key]) === first);

  const firstScores = JSON.stringify(qualityScores[keys[0]]);
  const perturbationHadEffect = keys.some(
    (key) => JSON.stringify(qualityScores[key]) !== firstScores,
  );

  return { isolated, perturbationHadEffect, sequences };
}
