import type { AppLanguage } from "../i18n";

export function confidenceLabel(value: number, language: AppLanguage): string {
  if (value >= 0.8) return language === "ja" ? "高" : "High";
  if (value >= 0.5) return language === "ja" ? "中" : "Medium";
  return language === "ja" ? "要確認" : "Needs review";
}

export function shouldShowConfidence(value: number): boolean {
  return value < 0.8;
}

export function warningLabel(warning: string, language: AppLanguage): string {
  const ja: Record<string, string> = {
    "ambiguous-bass": "低音の解釈に注意",
    "low-confidence": "コード候補が不安定",
    "melody-heavy": "メロディ混在の可能性",
    "sparse-notes": "音数が少ないため要確認",
    "slash-chord-possible": "分数コードの可能性",
  };
  const en: Record<string, string> = {
    "ambiguous-bass": "Bass note may be ambiguous",
    "low-confidence": "Chord candidate needs review",
    "melody-heavy": "Melody notes may be mixed in",
    "sparse-notes": "Sparse notes; review recommended",
    "slash-chord-possible": "Slash chord may fit",
  };

  return (language === "ja" ? ja[warning] : en[warning]) ?? humanizeWarningKey(warning);
}

function humanizeWarningKey(warning: string): string {
  return warning
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
