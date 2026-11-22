import { splitChordLabel } from "../ui/chordText";

/**
 * A chord name drawn large: the root big, the kind at 0.8×, ♯ ♭ from the symbol font.
 * The text content is the shown name (`F♯m7♭5`); text that is not a chord (「?」, a rest) is drawn as it is.
 */
export function ChordName({ label, className = "" }: { label: string; className?: string }) {
  const parts = splitChordLabel(label);
  if (!parts) return <span className={`lv-chordname ${className}`} data-chord-label={label}>{label}</span>;
  return (
    <span className={`lv-chordname ${className}`} data-chord-label={label}>
      <span className="lv-chordname-root">
        {parts.letter}
        {parts.accidental ? <span className="lv-chordname-acc">{parts.accidental}</span> : null}
      </span>
      {parts.rest ? <span className="lv-chordname-kind">{parts.rest}</span> : null}
    </span>
  );
}
