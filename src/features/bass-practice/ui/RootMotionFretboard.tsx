import type { AppLanguage } from "../../../i18n";
import type { Handedness, RootMotionExercise } from "../domain";

/**
 * Read-only physical-shape disclosure for Root Motion. It uses the generator's
 * frozen fingering pairs only; it never infers a path from Vault source data.
 */
export function RootMotionFretboard({ exercise, handedness, language = "en" }: { readonly exercise: RootMotionExercise; readonly handedness: Handedness; readonly language?: AppLanguage }) {
  const { tuning, fretRange } = exercise.generatorSnapshot;
  const frets = Array.from({ length: fretRange.max - fretRange.min + 1 }, (_, index) => fretRange.min + index);
  const visualFrets = handedness === "left" ? [...frets].reverse() : frets;
  const labels = language === "ja" ? {
    title: "\u30d5\u30ec\u30c3\u30c8\u30dc\u30fc\u30c9\u306e\u5f62",
    view: handedness === "left" ? "\u5de6\u5229\u304d\u8868\u793a" : "\u53f3\u5229\u304d\u8868\u793a",
    sequence: "\u30eb\u30fc\u30c8\u306e\u9806\u756a",
    note: "\u756a\u53f7\u306f\u30eb\u30fc\u30c8\u306e\u9806\u756a\u3092\u8868\u3057\u307e\u3059\u3002\u540c\u3058\u30eb\u30fc\u30c8\u3067\u3082\u6b21\u306e\u79fb\u52d5\u306e\u305f\u3081\u306b\u5225\u306e\u904b\u6307\u304c\u3042\u308b\u5834\u5408\u306f\u3001\u540c\u3058\u756a\u53f7\u304c\uff12\u304b\u6240\u306b\u8868\u793a\u3055\u308c\u307e\u3059\u3002\u6f14\u594f\u3092\u81ea\u52d5\u63a1\u70b9\u3057\u307e\u305b\u3093\u3002",
    step: "\u30b9\u30c6\u30c3\u30d7",
    string: "\u5f26",
    fret: "\u30d5\u30ec\u30c3\u30c8",
    source: "\u958b\u59cb",
    target: "\u79fb\u52d5\u5148",
    stringHeader: "\u5f26",
  } : {
    title: "Fretboard shape",
    view: handedness === "left" ? "left-handed view" : "right-handed view",
    sequence: "Root sequence",
    note: "Numbers show root order. A number can appear at two positions when the next motion uses a different legal fingering for the same root. The displayed path is deterministic and does not score your performance.",
    step: "Step",
    string: "string",
    fret: "fret",
    source: "source",
    target: "target",
    stringHeader: "STRING",
  };
  const markerByPosition = new Map<string, number[]>();
  const addMarker = (stringIndex: number, fret: number, step: number) => {
    const key = `${stringIndex}:${fret}`;
    const markers = markerByPosition.get(key) ?? [];
    if (!markers.includes(step)) markers.push(step);
    markerByPosition.set(key, markers);
  };
  exercise.fingering.forEach((pair, index) => {
    addMarker(pair.source.stringIndex, pair.source.fret, index + 1);
    addMarker(pair.target.stringIndex, pair.target.fret, index + 2);
  });
  const summary = exercise.fingering.map((pair, index) => `${labels.step} ${index + 1} ${labels.source}: ${labels.string} ${tuning.length - pair.source.stringIndex}, ${labels.fret} ${pair.source.fret}; ${labels.step} ${index + 2} ${labels.target}: ${labels.string} ${tuning.length - pair.target.stringIndex}, ${labels.fret} ${pair.target.fret}.`).join(" ");

  return <section aria-labelledby="root-motion-fretboard-title" className="min-w-0" data-testid="root-motion-fretboard">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 id="root-motion-fretboard-title" className="text-sm font-semibold text-[var(--lv-text)]">{labels.title}</h3>
        <p className="mt-1 text-xs text-[var(--lv-text-muted)]">{tuning.length}-string / {labels.view} / {labels.fret} {fretRange.min}-{fretRange.max}</p>
      </div>
      <p className="text-xs text-[var(--lv-text-muted)]">{labels.sequence}</p>
    </div>
    <p className="sr-only" data-testid="root-motion-fretboard-summary">{summary}</p>
    <div className="mt-3 max-w-full overflow-x-auto pb-2" role="region" tabIndex={0} aria-label={labels.title}>
      <div className="grid min-w-max gap-px overflow-hidden rounded-[var(--lv-radius-md)] border border-[var(--lv-border-strong)] bg-[var(--lv-border)]" style={{ gridTemplateColumns: `minmax(3.5rem,auto) repeat(${frets.length},minmax(2.5rem,1fr))` }} aria-hidden="true">
        <div className="bg-[var(--lv-surface-raised)] px-2 py-1.5 text-center text-[10px] font-semibold text-[var(--lv-text-muted)]">{labels.stringHeader}</div>
        {visualFrets.map((fret) => <div key={`fret-${fret}`} className="bg-[var(--lv-surface-raised)] px-2 py-1.5 text-center text-[10px] font-semibold text-[var(--lv-text-muted)]">{fret}</div>)}
        {[...tuning].reverse().flatMap((_open, visualIndex) => {
          const stringIndex = tuning.length - visualIndex - 1;
          return [
            <div key={`label-${stringIndex}`} className="flex items-center justify-center bg-[var(--lv-surface)] px-2 py-2 text-xs font-semibold text-[var(--lv-text-secondary)]">{tuning.length - stringIndex}</div>,
            ...visualFrets.map((fret) => {
              const marker = markerByPosition.get(`${stringIndex}:${fret}`);
              return <div key={`${stringIndex}-${fret}`} className="flex min-h-10 items-center justify-center bg-[var(--lv-bg-subtle)] p-1">{marker ? <span data-root-motion-position={`${stringIndex}:${fret}`} data-root-motion-step-markers={marker.join("/")} className="flex min-h-7 min-w-7 items-center justify-center rounded-full border border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] px-1 text-[10px] font-bold text-[var(--lv-accent)]">{marker.join("/")}</span> : null}</div>;
            }),
          ];
        })}
      </div>
    </div>
    <p className="mt-2 text-xs text-[var(--lv-text-muted)]">{labels.note}</p>
  </section>;
}