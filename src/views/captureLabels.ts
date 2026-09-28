
const confidenceLabels: Record<"ja", { high: string; medium: string; review: string }> = {
  ja: { high: "高", medium: "中", review: "要確認" },
};

/**
 * Reasons, not just a flag.
 *
 * `sparse-evidence` is the string the analyzer actually emits; the map
 * previously keyed it as `sparse-notes`, so it fell through to the humanised
 * fallback and showed English text in the Japanese UI. Both keys are kept so
 * memos saved under the old spelling still read correctly.
 */
const warningLabels: Record<"ja", Record<string, string>> = {
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
};

export function confidenceLabel(value: number): string {
  if (value >= 0.8) return confidenceLabels.ja.high;
  if (value >= 0.5) return confidenceLabels.ja.medium;
  return confidenceLabels.ja.review;
}

export function shouldShowConfidence(value: number): boolean {
  return value < 0.8;
}

export function warningLabel(warning: string): string {
  return warningLabels.ja[warning] ?? humanizeWarningKey(warning);
}

function humanizeWarningKey(warning: string): string {
  return warning
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
