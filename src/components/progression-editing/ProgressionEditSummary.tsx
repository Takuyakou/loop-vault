import type { ProgressionEditSummaryItem } from "../../domain/progressionEditing";
import { progressionEditorCopy, type AppLanguage } from "../../i18n";

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
  const text = progressionEditorCopy[language];
  if (items.length === 0) {
    return null;
  }
  return (
    <section className="mt-4 border border-teal-300/25 bg-teal-300/5 p-3" aria-label={text.changes(items.length)}>
      <p className="text-xs font-semibold text-teal-100">
        {text.changes(items.length)}
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
              {text.changeLocation(item.bar, item.beat)}
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
