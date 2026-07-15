import { makeChordSymbol } from "../../domain/chords";
import type { ChordQuality, ChordSymbol } from "../../domain/types";
import { progressionEditorCopy, type AppLanguage } from "../../i18n";

const noteNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const qualityOptions: Array<{ value: ChordQuality; label: string }> = [
  { value: "maj", label: "Major" },
  { value: "min", label: "Minor" },
  { value: "maj7", label: "maj7" },
  { value: "min7", label: "m7" },
  { value: "dom7", label: "7" },
  { value: "maj9", label: "maj9" },
  { value: "min9", label: "m9" },
  { value: "dom9", label: "9" },
  { value: "min11", label: "m11" },
  { value: "dom13", label: "13" },
  { value: "add9", label: "add9" },
  { value: "six", label: "6" },
  { value: "min6", label: "m6" },
  { value: "sixNine", label: "6/9" },
  { value: "sus2", label: "sus2" },
  { value: "sus4", label: "sus4" },
  { value: "dom7sus4", label: "7sus4" },
  { value: "dim", label: "dim" },
  { value: "dim7", label: "dim7" },
  { value: "min7b5", label: "m7b5" },
  { value: "aug", label: "aug" },
];

interface ChordStructureEditorProps {
  chord: ChordSymbol;
  onChange: (chord: ChordSymbol) => void;
  language: AppLanguage;
}

export function ChordStructureEditor({
  chord,
  onChange,
  language,
}: ChordStructureEditorProps) {
  const text = progressionEditorCopy[language];
  function update(root: number, quality: ChordQuality, bass: number | undefined) {
    onChange(makeChordSymbol(root, quality, [...chord.tensions], bass));
  }

  return (
    <fieldset className="mt-4 border-t border-[var(--lv-border)] pt-4">
      <legend className="text-xs text-[var(--lv-text-muted)]">
        {text.chordStructure}
      </legend>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <StructureSelect
          label="Root"
          value={String(chord.root)}
          onChange={(value) => update(Number(value), chord.quality, chord.bass)}
          options={noteNames.map((label, value) => ({ value: String(value), label }))}
        />
        <StructureSelect
          label="Quality"
          value={chord.quality}
          onChange={(value) => update(chord.root, value as ChordQuality, chord.bass)}
          options={qualityOptions}
        />
        <StructureSelect
          label="Bass"
          value={chord.bass === undefined ? "root" : String(chord.bass)}
          onChange={(value) => update(chord.root, chord.quality, value === "root" ? undefined : Number(value))}
          options={[
            { value: "root", label: "Root" },
            ...noteNames.map((label, value) => ({ value: String(value), label })),
          ]}
        />
      </div>
    </fieldset>
  );
}

function StructureSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 text-xs text-[var(--lv-text-muted)]">
      {label}
      <select
        className="mt-1 w-full border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-2 py-2 text-sm text-[var(--lv-text)] outline-none focus:border-teal-300"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
