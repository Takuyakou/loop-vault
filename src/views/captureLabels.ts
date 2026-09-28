
const confidenceLabels: Record<"ja", { high: string; medium: string; review: string }> = {
  ja: { high: "高", medium: "中", review: "要確認" },
};

/**
 * The one table from analyzer warning ids to short Japanese reasons (P8.9-09: shared by
 * Capture, the progression page and the Idea detail). Stored ids never change.
 *
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
    "fallback-close": "近いボイシングで代用",
    "ai-generated-unverified": "AI の提案（未確認）",
    "manual-range-starts-mid-chord": "範囲がコードの途中から始まる",
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

/** Unknown ids read as 要確認 instead of showing the internal name; warnings already written as text stay as they are. */
export function warningLabel(warning: string): string {
  const known = warningLabels.ja[warning];
  if (known) return known;
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(warning) ? confidenceLabels.ja.review : warning;
}

export function describeWarnings(warnings: readonly string[]): string[] {
  return [...new Set(warnings.map(warningLabel))];
}

/**
 * A saved block memo written by the analyzer is its warning ids joined by "; " (stored as is).
 * Show it as reasons only when every part is a known warning id; a memo with any other word
 * (for example a hand-written "verse-2") is shown unchanged.
 */
export function describeBlockMemo(memo: string): string {
  const parts = memo.split(/;\s*/).filter(Boolean);
  return parts.length && parts.every((part) => Object.prototype.hasOwnProperty.call(warningLabels.ja, part))
    ? describeWarnings(parts).join("、")
    : memo;
}
