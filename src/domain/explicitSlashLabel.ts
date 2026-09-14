import { labelFromSymbol } from "./chords";
import type { ChordSymbol } from "./types";

/** Text intake and practice preserve an explicit /root even when legacy display omits it. */
export function explicitSlashLabel(chord: ChordSymbol): string {
  const label = labelFromSymbol(chord);
  if (chord.bass !== chord.root) return label;
  const root = labelFromSymbol({ root: chord.root, quality: "maj", tensions: [], label: "" });
  return `${label}/${root}`;
}
