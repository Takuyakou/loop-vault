import type { QuickChordCandidate } from "../../domain/progressionEditing";
import type { ChordSymbol } from "../../domain/types";
import { quickChordEditorCopy, progressionEditorCopy, type AppLanguage } from "../../i18n";

interface ChordAlternativeListProps {
  candidates: readonly QuickChordCandidate[];
  selected?: ChordSymbol;
  onSelect: (candidate: QuickChordCandidate, index: number) => void;
  language: AppLanguage;
}

export function ChordAlternativeList({
  candidates,
  selected,
  onSelect,
  language,
}: ChordAlternativeListProps) {
  const text = progressionEditorCopy[language];
  const candidateText = quickChordEditorCopy[language];
  if (candidates.length === 0) {
    return null;
  }
  const displayedCandidates = candidates.slice(0, 5);
  const catalogCandidates = candidates.slice(5, 32);
  const candidateButton = (candidate: QuickChordCandidate, index: number) => {
    const active = selected?.label === candidate.chord.label;
    return (
      <button
        type="button"
        key={`${candidate.normalizedKey}-${index}`}
        className={`border px-3 py-2 text-sm ${active ? "border-teal-300 bg-teal-300/10 text-teal-100" : "border-[var(--lv-border-strong)] text-[var(--lv-text-secondary)]"}`}
        onClick={() => onSelect(candidate, index)}
        aria-pressed={active}
        title={candidate.sources.map((source) => source === "smoothConnection"
          ? candidateText.smoothDescription
          : source === "authorReferenceFit"
            ? candidateText.styleDescription
            : source === "harmonicContext"
              ? candidateText.contextDescription
              : candidateText.analyzerDescription).join(" / ")}
      >
        {candidate.chord.label}
        <span className="ml-2 text-[10px] text-teal-200">
          {candidate.sources.map((source) => source === "smoothConnection"
            ? candidateText.smoothSource
            : source === "authorReferenceFit"
              ? candidateText.styleSource
              : source === "harmonicContext"
                ? candidateText.contextSource
                : candidateText.analyzerSource).join("+")}
        </span>
      </button>
    );
  };
  return (
    <div>
      <p className="text-xs text-[var(--lv-text-muted)]">
        {text.alternatives}
      </p>
      <div className="mt-2 flex flex-wrap gap-2" data-alternative-count={displayedCandidates.length}>
        {displayedCandidates.map(candidateButton)}
      </div>
      {catalogCandidates.length > 0 ? (
        <details className="mt-3 border-t border-[var(--lv-border)] pt-3" data-candidate-catalog>
          <summary className="cursor-pointer text-xs font-semibold text-[var(--lv-text-secondary)]">
            {text.moreAnalyzerCandidates(catalogCandidates.length)}
          </summary>
          <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {catalogCandidates.map((candidate, index) =>
              candidateButton(candidate, index + displayedCandidates.length))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
