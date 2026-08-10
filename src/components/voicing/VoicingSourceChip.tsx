import { AlertTriangle, FileMusic, Sparkles } from "lucide-react";
import type { AppLanguage } from "../../i18n";
import type {
  VoicingSourceReason,
  VoicingSourceStatus,
} from "../../domain/voicing";

interface VoicingSourceChipProps {
  status: VoicingSourceStatus;
  reason?: VoicingSourceReason;
  /** True when the input has no source MIDI by design, such as text entry. */
  sourceAbsentByDesign?: boolean;
  language: AppLanguage;
  testId?: string;
}

const copy = {
  ja: {
    source: "元の響き",
    generated: "自動",
    review: "要確認",
    descriptions: {
      "source-ready": "元MIDIから採れたボイシングを使用します。",
      "source-missing": "元MIDIのボイシングがないため、自動生成した形を使用します。",
      "source-stale": "コード編集後のため、自動生成した形を使用します。",
      "source-invalid": "保存された元MIDIのボイシングを確認してください。",
      "source-aggregated": "区間内の音を集約した結果です。同時に鳴った形とは限りません。",
      "source-low-confidence": "元MIDIからの推定が自動利用の信頼条件を満たしていません。",
      "source-non-midi": "元MIDI以外から記録されたボイシングです。",
    },
  },
  en: {
    source: "Source MIDI",
    generated: "Generated",
    review: "Review",
    descriptions: {
      "source-ready": "A voicing extracted from the source MIDI is available.",
      "source-missing": "Generated voicing is used because no source MIDI voicing is available.",
      "source-stale": "Generated voicing is used because the chord was edited.",
      "source-invalid": "Review the stored source voicing data.",
      "source-aggregated": "This is an aggregated note set and may not be a simultaneous voicing.",
      "source-low-confidence": "The source estimate does not meet the automatic-use confidence threshold.",
      "source-non-midi": "This voicing was captured from a source other than the original MIDI.",
    },
  },
} as const;

export function VoicingSourceChip({
  status,
  reason,
  sourceAbsentByDesign = false,
  language,
  testId = "voicing-source-chip",
}: VoicingSourceChipProps) {
  const text = copy[language];
  const label = text[status];
  const description = sourceAbsentByDesign
    ? language === "ja"
      ? "\u30c6\u30ad\u30b9\u30c8\u5165\u529b\u304b\u3089\u81ea\u52d5\u751f\u6210\u3057\u305f\u30dc\u30a4\u30b7\u30f3\u30b0\u3067\u3059\u3002"
      : "Auto-generated from this text entry."
    : reason
      ? text.descriptions[reason]
      : status === "source"
        ? text.descriptions["source-ready"]
        : status === "generated"
          ? text.descriptions["source-missing"]
          : text.descriptions["source-low-confidence"];
  const Icon = status === "source"
    ? FileMusic
    : status === "generated"
      ? Sparkles
      : AlertTriangle;
  const colors = status === "source"
    ? "border-teal-700 text-teal-200"
    : status === "generated"
      ? "border-sky-800 text-sky-200"
      : "border-amber-700 text-amber-200";

  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1.5 border px-2 py-1 text-xs font-semibold ${colors}`}
      data-testid={testId}
      data-voicing-source={status}
      aria-label={`${language === "ja" ? "ボイシング" : "Voicing"}: ${label}`}
      title={description}
    >
      <Icon aria-hidden="true" size={16} />
      {label}
    </span>
  );
}
