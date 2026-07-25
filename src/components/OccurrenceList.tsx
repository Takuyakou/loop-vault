import type { CandidateOccurrence, CandidatePattern } from "../domain/midi/occurrence";
import type { Section } from "../domain/midi/sections";

/**
 * The other places a progression appears.
 *
 * Selection shows one occurrence per progression, but the others are kept
 * rather than deleted. Without this list they would be unreachable, which is
 * the same as having been discarded: a user who wants the second chorus could
 * not get to it.
 *
 * Every occurrence can be auditioned and saved on its own; none of them is a
 * read-only shadow of the representative.
 */

export interface OccurrenceListText {
  occurrenceCount: (count: number) => string;
  bars: (startBar: number, endBar: number) => string;
  section: (id: string) => string;
  transposed: (semitones: number) => string;
  selected: string;
  preview: string;
  save: string;
  showAll: string;
  onlyOccurrence: string;
}

export interface OccurrenceListProps {
  pattern: CandidatePattern | undefined;
  selectedOccurrenceId: string;
  sections?: readonly Section[];
  text: OccurrenceListText;
  expanded: boolean;
  onToggleExpanded: () => void;
  onPreview: (occurrence: CandidateOccurrence) => void;
  onSave: (occurrence: CandidateOccurrence) => void;
}

function sectionsFor(
  occurrence: CandidateOccurrence,
  sections: readonly Section[] | undefined,
): Section[] {
  return (sections ?? []).filter(
    (section) => occurrence.startBar <= section.endBar && occurrence.endBar >= section.startBar,
  );
}

function chordSummary(occurrence: CandidateOccurrence): string {
  return occurrence.events.map((event) => event.chord.label).join(" · ");
}

export function OccurrenceList({
  pattern,
  selectedOccurrenceId,
  sections,
  text,
  expanded,
  onToggleExpanded,
  onPreview,
  onSave,
}: OccurrenceListProps) {
  const occurrences = pattern?.occurrences ?? [];
  if (occurrences.length <= 1) {
    return (
      <p className="mt-2 text-xs text-[var(--lv-muted)]" data-occurrence-count="1">
        {text.onlyOccurrence}
      </p>
    );
  }

  return (
    <div className="mt-2" data-occurrence-list>
      <button
        type="button"
        className="text-xs font-semibold text-[var(--lv-accent)] underline underline-offset-2"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        data-occurrence-toggle
      >
        {text.occurrenceCount(occurrences.length)}
      </button>

      {expanded ? (
        <ul className="mt-2 flex flex-col gap-1" data-occurrence-items>
          {occurrences.map((occurrence) => {
            const isSelected = occurrence.id === selectedOccurrenceId;
            const inSections = sectionsFor(occurrence, sections);
            return (
              <li
                key={occurrence.id}
                data-occurrence-id={occurrence.id}
                data-occurrence-selected={isSelected ? "true" : "false"}
                className={`flex flex-wrap items-center gap-2 border px-2 py-1 text-xs ${
                  // Selection is carried by weight and an explicit label, never
                  // by colour alone.
                  isSelected
                    ? "border-teal-300 font-semibold text-[var(--lv-text)]"
                    : "border-[var(--lv-border)] text-[var(--lv-muted)]"
                }`}
              >
                <span className="whitespace-nowrap">
                  {text.bars(occurrence.startBar, occurrence.endBar)}
                </span>
                {isSelected ? (
                  <span className="whitespace-nowrap text-teal-200">{text.selected}</span>
                ) : null}
                {inSections.length > 0 ? (
                  <span className="whitespace-nowrap">{text.section(inSections[0].id)}</span>
                ) : null}
                {occurrence.transposeOffset !== 0 ? (
                  <span className="whitespace-nowrap">
                    {text.transposed(occurrence.transposeOffset)}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate" title={chordSummary(occurrence)}>
                  {chordSummary(occurrence)}
                </span>
                <button
                  type="button"
                  className="border border-[var(--lv-border)] px-2 py-0.5"
                  onClick={() => onPreview(occurrence)}
                  data-occurrence-preview={occurrence.id}
                  aria-label={`${text.preview} ${text.bars(occurrence.startBar, occurrence.endBar)}`}
                >
                  {text.preview}
                </button>
                <button
                  type="button"
                  className="border border-[var(--lv-border)] px-2 py-0.5"
                  onClick={() => onSave(occurrence)}
                  data-occurrence-save={occurrence.id}
                  aria-label={`${text.save} ${text.bars(occurrence.startBar, occurrence.endBar)}`}
                >
                  {text.save}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
