import { parseTextChordLabel } from "../chords";
import type { ChordSymbol } from "../types";
import type { Occurrence } from "./store";

/** Existing persisted symbols carry full harmony without changing occurrence storage. */
export function occurrenceChord(harmony: Occurrence["harmony"]): ChordSymbol | undefined {
  const chord = parseTextChordLabel(harmony.symbol);
  return chord && chord.root === harmony.root && chord.quality === harmony.quality
    && chord.bass === harmony.bass ? chord : undefined;
}
