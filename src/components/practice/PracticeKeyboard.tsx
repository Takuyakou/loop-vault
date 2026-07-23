import { midiNoteName } from "../voicing/midiNoteName";

interface PracticeKeyboardProps {
  guideNotes: readonly number[];
  heldNotes: readonly number[];
  sustainedNotes: readonly number[];
  foreignPitchClasses: readonly number[];
}

export function PracticeKeyboard({
  guideNotes,
  heldNotes,
  sustainedNotes,
  foreignPitchClasses,
}: PracticeKeyboardProps) {
  const guide = new Set(guideNotes);
  const held = new Set(heldNotes);
  const sustained = new Set(sustainedNotes);
  const allNotes = [...guideNotes, ...heldNotes, ...sustainedNotes];
  const minimum = allNotes.length > 0
    ? Math.max(24, Math.floor(Math.min(...allNotes) / 12) * 12 - 2)
    : 48;
  const maximum = allNotes.length > 0
    ? Math.min(108, Math.ceil(Math.max(...allNotes) / 12) * 12 + 2)
    : 72;
  const keys = Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);

  return (
    <div>
      <div
        className="flex h-32 overflow-hidden border border-[var(--lv-border)] bg-black"
        aria-label="Practice keyboard"
      >
        {keys.map((note) => {
          const black = [1, 3, 6, 8, 10].includes(note % 12);
          const foreign = held.has(note) && foreignPitchClasses.includes(note % 12);
          const className = foreign
            ? "!bg-amber-300"
            : held.has(note)
              ? "!bg-teal-300"
              : sustained.has(note)
                ? "!bg-sky-700"
                : guide.has(note)
                  ? "!bg-teal-900"
                  : black
                    ? "bg-stone-800"
                    : "bg-stone-200";
          return (
            <span
              key={note}
              title={midiNoteName(note)}
              className={`min-w-0 flex-1 border-r border-stone-700 ${className}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--lv-text-muted)]">
        <Legend color="bg-teal-900" label="Guide" />
        <Legend color="bg-teal-300" label="Held" />
        <Legend color="bg-amber-300" label="Foreign" />
        <Legend color="bg-sky-700" label="Sustain" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 ${color}`} />
      {label}
    </span>
  );
}

