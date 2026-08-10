import { midiNoteName } from "./midiNoteName";

interface KeyboardVisualizerProps {
  notes: readonly number[];
  bassNote?: number;
}

export function KeyboardVisualizer({ notes, bassNote }: KeyboardVisualizerProps) {
  const active = new Set(notes);
  const minimum = notes.length > 0 ? Math.max(24, Math.floor(Math.min(...notes) / 12) * 12 - 2) : 48;
  const maximum = notes.length > 0 ? Math.min(108, Math.ceil(Math.max(...notes) / 12) * 12 + 2) : 72;
  const keys = Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
  return (
    <div className="mt-3">
      <div
        className="flex h-16 overflow-hidden border border-[var(--lv-border)] bg-stone-950"
        aria-label="Voicing keyboard"
        data-testid="voicing-keyboard"
      >
        {keys.map((note) => {
          const black = [1, 3, 6, 8, 10].includes(note % 12);
          const selected = active.has(note);
          return (
            <span
              key={note}
              title={midiNoteName(note)}
              data-midi-note={note}
              data-active={selected ? "true" : "false"}
              className={[
                "min-w-0 flex-1 border-r border-stone-700",
                black ? "bg-stone-800" : "bg-stone-200",
                selected ? (note === bassNote ? "!bg-amber-300" : "!bg-teal-300") : "",
              ].join(" ")}
            />
          );
        })}
      </div>
    </div>
  );
}
