import type { ChordTimelineItem } from "../domain/types";

export interface ProgressionGridProps {
  chords: readonly ChordTimelineItem[];
  currentBar: number | null;
  selectedChordIndex?: number;
  playingChordIndex?: number | null;
  playingProgress?: number | null;
  onChordSelect?(chordIndex: number): void;
}

function barChords(chords: readonly ChordTimelineItem[], bar: number) {
  const barStart = (bar - 1) * 4;
  const barEnd = barStart + 4;

  return chords
    .map((chord, chordIndex) => ({ chord, chordIndex }))
    .filter(({ chord }) => {
      const start = absoluteBeat(chord);
      return start < barEnd && start + chord.durationBeats > barStart;
    });
}

function segmentStyle(chord: ChordTimelineItem) {
  return {
    flexGrow: chord.durationBeats,
    flexBasis: `${(chord.durationBeats / 4) * 100}%`,
  };
}

export function ProgressionGrid({
  chords,
  currentBar,
  selectedChordIndex,
  playingChordIndex,
  playingProgress,
  onChordSelect,
}: ProgressionGridProps) {
  if (chords.length === 0) {
    return (
      <section
        className="grid min-h-24 place-items-center border border-[var(--lv-border)] bg-[var(--lv-bg)] text-sm text-[var(--lv-text)]0"
        aria-label="コード進行"
      >
        コードがありません
      </section>
    );
  }

  const firstBar = Math.min(...chords.map((chord) => chord.bar));
  const lastBar = Math.max(
    ...chords.map((chord) =>
      Math.max(chord.bar, Math.ceil((absoluteBeat(chord) + chord.durationBeats) / 4)),
    ),
  );

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="コード進行">
      {Array.from({ length: lastBar - firstBar + 1 }, (_, offset) => {
        const bar = firstBar + offset;
        const entries = barChords(chords, bar);

        return (
          <article
            className={`grid min-h-28 grid-cols-[2.25rem_minmax(0,1fr)] overflow-hidden rounded border bg-[var(--lv-bg)] ${
              currentBar === bar ? "border-cyan-300 shadow-[0_0_0_1px_rgba(103,232,249,0.75)]" : "border-[var(--lv-border)]"
            }`}
            key={bar}
          >
            <div className="grid place-items-center bg-[var(--lv-surface)] text-xs font-extrabold text-[var(--lv-text)]0">
              {bar}
            </div>
            <div className="flex min-w-0">
              {entries.map(({ chord, chordIndex }) => {
                const progress =
                  playingChordIndex === chordIndex ? (playingProgress ?? 0) : null;

                return (
                  <button
                    aria-pressed={selectedChordIndex === chordIndex}
                    className={`relative grid min-w-0 content-center gap-1 overflow-hidden border-l border-[var(--lv-border)] px-3 py-3 text-left transition hover:bg-[var(--lv-surface)] ${
                      selectedChordIndex === chordIndex ? "bg-[var(--lv-surface)] outline outline-2 -outline-offset-2 outline-amber-200" : ""
                    }`}
                    key={`${chordIndex}-${chord.bar}-${chord.beat}-${chord.chord.label}`}
                    type="button"
                    style={segmentStyle(chord)}
                    onClick={() => onChordSelect?.(chordIndex)}
                  >
                    {progress === null ? null : (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 bg-cyan-300/15 transition-[width] duration-100 ease-linear"
                        style={{ width: `${progress * 100}%` }}
                      />
                    )}
                    <span className="relative text-[0.7rem] font-extrabold uppercase text-[var(--lv-text)]0">
                      {chord.bar}.{formatBeat(chord.beat)}
                    </span>
                    <strong className="relative text-lg leading-tight text-[var(--lv-text)] [overflow-wrap:anywhere]">
                      {chord.chord.label}
                    </strong>
                    <span className="relative text-[0.68rem] text-[var(--lv-text)]0">
                      {Math.round(chord.confidence * 100)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </article>
        );
      })}
    </section>
  );
}

export function timelineStartBeat(chord: ChordTimelineItem): number {
  return absoluteBeat(chord);
}

function absoluteBeat(chord: ChordTimelineItem): number {
  return (chord.bar - 1) * 4 + (chord.beat - 1);
}

function formatBeat(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}
