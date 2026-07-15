import type { ProgressionEditSummaryItem } from "../../domain/progressionEditing";
import type { AppLanguage } from "../../i18n";

interface ProgressionEditSummaryProps {
  items: ProgressionEditSummaryItem[];
  language: AppLanguage;
  onSelect?: (slotId: string) => void;
}

export function ProgressionEditSummary({
  items,
  language,
  onSelect,
}: ProgressionEditSummaryProps) {
  if (items.length === 0) {
    return null;
  }
  return (
    <section className="mt-4 border border-teal-300/25 bg-teal-300/5 p-3" aria-label={language === "ja" ? "変更内容" : "Changes"}>
      <p className="text-xs font-semibold text-teal-100">
        {language === "ja" ? `変更 ${items.length}件` : `${items.length} changes`}
      </p>
      <div className="mt-2 grid gap-1">
        {items.map((item) => (
          <button
            type="button"
            key={item.slotId}
            className="flex items-center justify-between gap-3 px-1 py-1 text-left text-sm hover:bg-white/5"
            onClick={() => onSelect?.(item.slotId)}
          >
            <span className="text-[var(--lv-text-muted)]">
              {language === "ja" ? `${item.bar}小節 ${item.beat}拍` : `Bar ${item.bar}, beat ${item.beat}`}
            </span>
            <span className="text-[var(--lv-text)]">
              {item.original} <span aria-hidden="true">→</span> <strong className="text-teal-100">{item.current}</strong>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
