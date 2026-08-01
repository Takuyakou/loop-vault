import { useState } from "react";
import { degreeHintDisclosure } from "../application";
import {
  formatDegree,
  midiNoteName,
  type Handedness,
  type PracticeExercise,
} from "../domain";

export function DegreeFretboard({
  exercise,
  handedness,
  hintLevel,
}: {
  exercise: PracticeExercise;
  handedness: Handedness;
  hintLevel: 0 | 1 | 2 | 3 | 4;
}) {
  const [display, setDisplay] = useState<"degree" | "note">("degree");
  const fretRange = exercise.generatorSnapshot.fretRange;
  const frets = Array.from(
    { length: fretRange.max - fretRange.min + 1 },
    (_, index) => fretRange.min + index,
  );
  const visualFrets = handedness === "left" ? [...frets].reverse() : frets;
  const tuning = exercise.generatorSnapshot.tuning;
  const markers = hintLevel === 4
    ? degreeHintDisclosure(exercise, 4).fretboard ?? []
    : [];
  const markerByPosition = new Map<string, typeof markers>();
  for (const marker of markers) {
    for (const position of marker.positions) {
      const key = `${position.stringIndex}:${position.fret}`;
      markerByPosition.set(key, [...(markerByPosition.get(key) ?? []), marker]);
    }
  }

  const screenReaderSummary = hintLevel === 4
    ? markers.flatMap((marker) => marker.positions.map((position) => (
        `${marker.sequenceIndex + 1}番目 ${marker.degree} ${marker.noteName}、`
        + `${tuning.length - position.stringIndex}弦 ${position.fret}フレット`
      ))).join("。")
    : "答えの位置はヒント4まで非表示です。";

  return (
    <section aria-labelledby="degree-fretboard-title" className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="degree-fretboard-title" className="text-sm font-semibold text-[var(--lv-text)]">
            フレットボード
          </h3>
          <p className="mt-1 text-xs text-[var(--lv-text-muted)]">
            {tuning.length}弦 · {handedness === "left" ? "左利き表示" : "右利き表示"} · fret {fretRange.min}–{fretRange.max}
          </p>
        </div>
        <div
          className="flex rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] p-1"
          role="group"
          aria-label="フレットボード表示"
        >
          <button
            type="button"
            className={`min-h-8 rounded-[var(--lv-radius-sm)] px-2 text-xs font-semibold ${display === "degree" ? "bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : "text-[var(--lv-text-muted)]"}`}
            aria-pressed={display === "degree"}
            onClick={() => setDisplay("degree")}
          >
            Degree
          </button>
          <button
            type="button"
            className={`min-h-8 rounded-[var(--lv-radius-sm)] px-2 text-xs font-semibold ${display === "note" ? "bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : "text-[var(--lv-text-muted)]"}`}
            aria-pressed={display === "note"}
            onClick={() => setDisplay("note")}
          >
            Note Name
          </button>
        </div>
      </div>

      <p className="sr-only" data-testid="degree-fretboard-summary">
        {screenReaderSummary}
      </p>
      <div
        className="mt-3 max-w-full overflow-x-auto pb-2"
        tabIndex={0}
        aria-label="フレットボード図"
        role="region"
      >
        <div
          className="grid min-w-max gap-px overflow-hidden rounded-[var(--lv-radius-md)] border border-[var(--lv-border-strong)] bg-[var(--lv-border)]"
          style={{ gridTemplateColumns: `minmax(3.5rem,auto) repeat(${frets.length},minmax(2.75rem,1fr))` }}
          aria-hidden="true"
        >
          <div className="bg-[var(--lv-surface-raised)] px-2 py-1.5 text-center text-[10px] font-semibold text-[var(--lv-text-muted)]">
            STRING
          </div>
          {visualFrets.map((fret) => (
            <div key={`fret-label-${fret}`} className="bg-[var(--lv-surface-raised)] px-2 py-1.5 text-center text-[10px] font-semibold text-[var(--lv-text-muted)]">
              {fret}
            </div>
          ))}
          {[...tuning].reverse().map((openNote, visualStringIndex) => {
            const stringIndex = tuning.length - visualStringIndex - 1;
            return [
              <div key={`string-${stringIndex}-label`} className="flex items-center justify-center bg-[var(--lv-surface)] px-2 py-2 text-xs font-semibold text-[var(--lv-text-secondary)]">
                {tuning.length - stringIndex}弦
              </div>,
              ...visualFrets.map((fret) => {
                const positionMarkers = markerByPosition.get(`${stringIndex}:${fret}`) ?? [];
                return (
                  <div key={`string-${stringIndex}-fret-${fret}`} className="flex min-h-10 items-center justify-center bg-[var(--lv-bg-subtle)] p-1">
                    {positionMarkers.length ? (
                      <span className="flex min-h-7 min-w-7 items-center justify-center rounded-full border border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] px-1 text-[10px] font-bold text-[var(--lv-accent)]">
                        {positionMarkers.map((marker) => (
                          display === "degree"
                            ? marker.degree
                            : midiNoteName(openNote + fret, exercise.tonalContext.key, exercise.tonalContext.scale)
                        )).join("/")}
                      </span>
                    ) : null}
                  </div>
                );
              }),
            ];
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--lv-text-muted)]">
        <span className="inline-block h-3 w-3 rounded-full border border-[var(--lv-accent)] bg-[var(--lv-accent-soft)]" aria-hidden="true" />
        <span>{hintLevel === 4 ? "丸印は答えの候補位置" : "マーカーはヒント4で表示"}</span>
        {hintLevel === 4 ? (
          <span>· {exercise.targetEvents.map((event) => formatDegree(event.degree)).join(" → ")}</span>
        ) : null}
      </div>
    </section>
  );
}
