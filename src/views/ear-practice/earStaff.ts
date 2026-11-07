import { targetSnapshot, type TargetSnapshot } from "../../domain/chordDojo/targetSnapshot";
import { keySpelling, type EarMode } from "../../domain/earPractice";
import { degreeSpelledPitch } from "../../domain/earPractice/degreeSpelling";
import type { ChordSymbol } from "../../domain/types";

/** A chord that stands for nothing: its notes are spelled by the key only (flats in a flat key, else sharps). */
const NEUTRAL: ChordSymbol = { root: 0, quality: "power", tensions: [], label: "C5" };

const spellingHint = (tonic: number, mode: EarMode) => (keySpelling(tonic, mode) === "flat" ? "b" : "#");

/** The keys that are down, as notes on the staff. Spelled by the key; no hand, no finger. */
export function heldSnapshot(notes: readonly number[], tonic: number, mode: EarMode): TargetSnapshot | undefined {
  if (!notes.length) return undefined;
  return targetSnapshot("ear:held", NEUTRAL, notes, undefined, spellingHint(tonic, mode));
}

/** A chord's notes as notes on the staff: spelled from the chord (B♭7 has an A♭), drawn in the right-hand column. */
export function chordSnapshot(id: string, symbol: ChordSymbol, notes: readonly number[], tonic: number, mode: EarMode): TargetSnapshot | undefined {
  if (!notes.length) return undefined;
  const snapshot = targetSnapshot(id, symbol, notes, { hands: { left: [], right: notes } }, spellingHint(tonic, mode));
  // mMaj7 and 7alt are not known to the Dojo's spelling: they are written from their degrees here.
  return { ...snapshot, notes: snapshot.notes.map((note) => ({ ...note, spelling: degreeSpelledPitch(symbol, note.midi) ?? note.spelling })) };
}
