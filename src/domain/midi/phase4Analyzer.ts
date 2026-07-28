import type { MidiProgressionAnalysis } from "../types";
import { analyzeMidiWithRankingScores } from "./legacy";
import type { QualityEvidenceOptions } from "./qualityEvidence";
import type { AnalyzeMidiOptions } from "./types";

export const phase4AnalyzerVersion = "phase4-symbolic-v1";

/**
 * Phase 4 analyzer.
 *
 * Same pipeline as legacy, with quality-defining tone evidence enabled: a chord
 * is charged for naming a quality whose defining tone is absent, and a bass note
 * sitting on the root no longer compensates for that absence.
 *
 * Promoted to `defaultAnalyzerMode` in P4.0-06. `legacy` remains available and
 * unchanged, so reverting is a one-line change with no data migration.
 */
/**
 * Chosen on the tune subset only. Holdout is read at stage completion and at the
 * promotion decision, never during the search.
 */
export const phase4QualityEvidence: QualityEvidenceOptions = {
  // `full` beat `third` on tune: restricting the charge to the third alone made
  // canonicalExact worse, not better.
  scope: "full",
  // Root accuracy collapses by ~10pp once the charge reaches 0.12, so the value
  // sits below that cliff. 0.08 gave the best root and Top-3 in the tune sweep.
  penalty: 0.08,
  // Inert on this corpus: 0.01, 0.02 and 0.03 produced identical results, so the
  // required tones are either clearly sounding or clearly absent.
  presenceThreshold: 0.02,
};

export function analyzeMidiPhase4(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions = {},
  evidence: QualityEvidenceOptions = phase4QualityEvidence,
): MidiProgressionAnalysis {
  return analyzeMidiWithRankingScores(bytes, options, {
    useQualityEvidence: true,
    qualityEvidence: evidence,
    useBassCompanionCandidates: options.accuracyFirst?.bassCompanionCandidates ?? false,
    useObservedFlatNineDominantCandidate:
      options.accuracyFirst?.enableObservedFlatNineDominantCandidate ?? false,
    analyzerVersion: (
      options.accuracyFirst?.bassCompanionCandidates
      || options.accuracyFirst?.enableObservedFlatNineDominantCandidate
    )
      ? "phase5-accuracy-first-v1"
      : phase4AnalyzerVersion,
  }).analysis;
}
