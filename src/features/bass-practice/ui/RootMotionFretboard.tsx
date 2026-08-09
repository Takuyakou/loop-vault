import type { Handedness, RootMotionExercise } from "../domain";

/**
 * Read-only physical-shape disclosure for Root Motion.  It uses the generator's
 * frozen fingering pairs only; it never infers a path from Vault source data.
 */
export function RootMotionFretboard({ exercise, handedness }: { readonly exercise: RootMotionExercise; readonly handedness: Handedness }) {
  const { tuning, fretRange } = exercise.generatorSnapshot;
  const frets = Array.from({ length: fretRange.max - fretRange.min + 1 }, (_, index) => fretRange.min + index);
  const visualFrets = handedness === "left" ? [...frets].reverse() : frets;
  const markerByPosition = new Map<string, "source" | "target">();
  for (const pair of exercise.fingering) {
    markerByPosition.set(`${pair.source.stringIndex}:${pair.source.fret}`, "source");
    markerByPosition.set(`${pair.target.stringIndex}:${pair.target.fret}`, "target");
  }
  const summary = exercise.fingering.map((pair, index) => `Motion ${index + 1}: source string ${tuning.length - pair.source.stringIndex}, fret ${pair.source.fret}; target string ${tuning.length - pair.target.stringIndex}, fret ${pair.target.fret}; ${pair.shape.stringRelation}, fret shift ${pair.shape.fretShift}.`).join(" ");

  return <section aria-labelledby="root-motion-fretboard-title" className="min-w-0" data-testid="root-motion-fretboard">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 id="root-motion-fretboard-title" className="text-sm font-semibold text-[var(--lv-text)]">{"\u30d5\u30ec\u30c3\u30c8\u30dc\u30fc\u30c9\u306e\u5f62"}</h3>
        <p className="mt-1 text-xs text-[var(--lv-text-muted)]">{tuning.length}-string · {handedness === "left" ? "left-handed view" : "right-handed view"} · fret {fretRange.min}–{fretRange.max}</p>
      </div>
      <p className="text-xs text-[var(--lv-text-muted)]">Source → Target</p>
    </div>
    <p className="sr-only" data-testid="root-motion-fretboard-summary">{summary}</p>
    <div className="mt-3 max-w-full overflow-x-auto pb-2" role="region" tabIndex={0} aria-label="Root Motion fretboard">
      <div className="grid min-w-max gap-px overflow-hidden rounded-[var(--lv-radius-md)] border border-[var(--lv-border-strong)] bg-[var(--lv-border)]" style={{ gridTemplateColumns: `minmax(3.5rem,auto) repeat(${frets.length},minmax(2.5rem,1fr))` }} aria-hidden="true">
        <div className="bg-[var(--lv-surface-raised)] px-2 py-1.5 text-center text-[10px] font-semibold text-[var(--lv-text-muted)]">STRING</div>
        {visualFrets.map((fret) => <div key={`fret-${fret}`} className="bg-[var(--lv-surface-raised)] px-2 py-1.5 text-center text-[10px] font-semibold text-[var(--lv-text-muted)]">{fret}</div>)}
        {[...tuning].reverse().flatMap((_open, visualIndex) => {
          const stringIndex = tuning.length - visualIndex - 1;
          return [
            <div key={`label-${stringIndex}`} className="flex items-center justify-center bg-[var(--lv-surface)] px-2 py-2 text-xs font-semibold text-[var(--lv-text-secondary)]">{tuning.length - stringIndex}</div>,
            ...visualFrets.map((fret) => {
              const marker = markerByPosition.get(`${stringIndex}:${fret}`);
              return <div key={`${stringIndex}-${fret}`} className="flex min-h-10 items-center justify-center bg-[var(--lv-bg-subtle)] p-1">{marker ? <span className={marker === "source" ? "flex min-h-7 min-w-7 items-center justify-center rounded-full border border-[var(--lv-text-secondary)] px-1 text-[10px] font-bold text-[var(--lv-text-secondary)]" : "flex min-h-7 min-w-7 items-center justify-center rounded-full border border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] px-1 text-[10px] font-bold text-[var(--lv-accent)]"}>{marker === "source" ? "S" : "T"}</span> : null}</div>;
            }),
          ];
        })}
      </div>
    </div>
    <p className="mt-2 text-xs text-[var(--lv-text-muted)]">S = source root · T = target root. The displayed path is deterministic and does not score your performance.</p>
  </section>;
}