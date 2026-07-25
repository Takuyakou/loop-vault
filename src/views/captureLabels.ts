import type { AppLanguage } from "../i18n";

const confidenceLabels: Record<AppLanguage, { high: string; medium: string; review: string }> = {
  ja: { high: "高", medium: "中", review: "要確認" },
  en: { high: "High", medium: "Medium", review: "Needs review" },
};

/**
 * Reasons, not just a flag.
 *
 * `sparse-evidence` is the string the analyzer actually emits; the map
 * previously keyed it as `sparse-notes`, so it fell through to the humanised
 * fallback and showed English text in the Japanese UI. Both keys are kept so
 * memos saved under the old spelling still read correctly.
 */
const warningLabels: Record<AppLanguage, Record<string, string>> = {
  ja: {
    "ambiguous-bass": "候補が僅差",
    "ambiguous-quality": "メジャーかマイナーか判別しにくい",
    "missing-quality-defining-tone": "3rdなど和音を決める音が鳴っていない",
    "low-confidence": "コード候補が不安定",
    "melody-heavy": "メロディ混在の可能性",
    "sparse-evidence": "音数が少ないため要確認",
    "sparse-notes": "音数が少ないため要確認",
    "slash-chord-possible": "分数コードの可能性",
    "legacy-primary": "従来判定を採用",
    "legacy-boundary-retained": "従来判定を維持",
    "hybrid-reranked": "別方式で再判定",
    "voice-aware-reranked": "パート構成から再判定",
    "review-recommended": "確認推奨",
  },
  en: {
    "ambiguous-bass": "Top candidates are close",
    "ambiguous-quality": "Major or minor is hard to tell apart",
    "missing-quality-defining-tone": "The tone that defines this chord is not sounding",
    "low-confidence": "Chord candidate needs review",
    "melody-heavy": "Melody notes may be mixed in",
    "sparse-evidence": "Sparse notes; review recommended",
    "sparse-notes": "Sparse notes; review recommended",
    "slash-chord-possible": "Slash chord may fit",
    "legacy-primary": "Kept the legacy reading",
    "legacy-boundary-retained": "Kept the legacy reading",
    "hybrid-reranked": "Re-read by another method",
    "voice-aware-reranked": "Re-read from the part layout",
    "review-recommended": "Review recommended",
  },
};

export function confidenceLabel(value: number, language: AppLanguage): string {
  if (value >= 0.8) return confidenceLabels[language].high;
  if (value >= 0.5) return confidenceLabels[language].medium;
  return confidenceLabels[language].review;
}

export function shouldShowConfidence(value: number): boolean {
  return value < 0.8;
}

export function warningLabel(warning: string, language: AppLanguage): string {
  return warningLabels[language][warning] ?? humanizeWarningKey(warning);
}

function humanizeWarningKey(warning: string): string {
  return warning
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
