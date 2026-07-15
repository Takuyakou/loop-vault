import type { ChordAlternative } from "../../domain/progressionEditing";
import type { ChordSymbol } from "../../domain/types";
import type { AppLanguage } from "../../i18n";

interface ChordAlternativeListProps {
  alternatives: ChordAlternative[];
  selected?: ChordSymbol;
  onSelect: (chord: ChordSymbol) => void;
  language: AppLanguage;
}

export function ChordAlternativeList({
  alternatives,
  selected,
  onSelect,
  language,
}: ChordAlternativeListProps) {
  if (alternatives.length === 0) {
    return null;
  }
  return (
    <div>
      <p className="text-xs text-[var(--lv-text-muted)]">
        {language === "ja" ? "解析候補" : "Alternatives"}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {alternatives.map((alternative) => {
          const active = selected?.label === alternative.chord.label;
          return (
            <button
              type="button"
              key={`${alternative.chord.label}-${alternative.confidence}`}
              className={`border px-3 py-2 text-sm ${active ? "border-teal-300 bg-teal-300/10 text-teal-100" : "border-[var(--lv-border-strong)] text-[var(--lv-text-secondary)]"}`}
              onClick={() => onSelect(alternative.chord)}
              aria-pressed={active}
            >
              {alternative.chord.label}
              <span className="ml-2 text-xs text-[var(--lv-text-muted)]">
                {Math.round(alternative.confidence * 100)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
