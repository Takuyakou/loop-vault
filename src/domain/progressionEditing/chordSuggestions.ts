import {
  canonicalChordAlternative,
  QUICK_CHORD_ALTERNATIVE_LIMIT,
  selectQuickChordAlternatives,
} from "../chordAlternatives";
import { makeChordSymbol, normalizePc } from "../chords";
import type { ChordQuality, ChordSymbol } from "../types";
import { cloneSlot, slotStartBeat } from "./editableProgression";
import type {
  ChordAlternative,
  EditableChordSlot,
  EditableProgression,
} from "./types";

const NEXT_CHORD_SUGGESTION_LIMIT = QUICK_CHORD_ALTERNATIVE_LIMIT + 1;

export function contextualAlternativesForSlot(
  editable: EditableProgression,
  slotId: string,
  keySignature?: string,
): EditableChordSlot | undefined {
  const ordered = [...editable.slots].sort(
    (left, right) => slotStartBeat(left, editable.beatsPerBar)
      - slotStartBeat(right, editable.beatsPerBar),
  );
  const index = ordered.findIndex((slot) => slot.id === slotId);
  const slot = ordered[index];
  if (!slot) return undefined;

  return {
    ...cloneSlot(slot),
    alternatives: suggestChordAlternatives({
      current: slot.currentChord,
      analyzedAlternatives: slot.alternatives,
      previous: ordered[index - 1]?.currentChord,
      next: ordered[index + 1]?.currentChord,
      keySignature,
    }),
  };
}

export function suggestChordAlternatives({
  current,
  analyzedAlternatives = [],
  previous,
  next,
  keySignature,
}: {
  current: ChordSymbol;
  analyzedAlternatives?: readonly ChordAlternative[];
  previous?: ChordSymbol;
  next?: ChordSymbol;
  keySignature?: string;
}): ChordAlternative[] {
  const contextual = contextualChordPool(previous ?? current, keySignature);
  const neighborSuggestions = [previous, next]
    .filter((chord): chord is ChordSymbol => Boolean(chord))
    .map((chord, index) => ({ chord, confidence: 0.56 - index * 0.02 }));
  const generatedSuggestions = contextual.map((chord, index) => ({
    chord,
    confidence: 0.52 - index * 0.025,
  }));

  return selectQuickChordAlternatives(
    current,
    [...analyzedAlternatives, ...neighborSuggestions, ...generatedSuggestions],
  ).map(cloneAlternative);
}

export function suggestNextChordAlternatives(
  previous: ChordSymbol,
  keySignature?: string,
): ChordAlternative[] {
  const previousKey = canonicalChordAlternative(previous);
  return contextualChordPool(previous, keySignature)
    .filter((chord) => canonicalChordAlternative(chord) !== previousKey)
    .slice(0, NEXT_CHORD_SUGGESTION_LIMIT)
    .map((chord, index) => ({
      chord: { ...chord, tensions: [...chord.tensions] },
      confidence: 0.72 - index * 0.04,
    }));
}

function contextualChordPool(reference: ChordSymbol, keySignature?: string): ChordSymbol[] {
  const key = parseKeySignature(keySignature);
  if (key) {
    const pool = diatonicChordPool(key.root, key.minor);
    const intervalOrder = key.minor
      ? [5, 7, 3, 8, 10, 2, 0]
      : [5, 7, 9, 2, 4, 11, 0];
    return pool.sort((left, right) => {
      const leftRank = intervalOrder.indexOf(normalizePc(left.root - reference.root));
      const rightRank = intervalOrder.indexOf(normalizePc(right.root - reference.root));
      return rank(leftRank) - rank(rightRank) || left.root - right.root;
    });
  }

  const minor = isMinorQuality(reference.quality);
  const recipes: Array<[number, ChordQuality]> = minor
    ? [[5, "min7"], [7, "dom7"], [3, "maj7"], [8, "maj7"], [10, "dom7"], [2, "min7b5"], [0, "min9"]]
    : [[5, "maj7"], [7, "dom7"], [9, "min7"], [2, "min7"], [4, "min7"], [10, "dom7"], [0, "maj9"]];
  return recipes.map(([interval, quality]) => makeChordSymbol(reference.root + interval, quality));
}

function diatonicChordPool(root: number, minor: boolean): ChordSymbol[] {
  const recipes: Array<[number, ChordQuality]> = minor
    ? [[0, "min7"], [2, "min7b5"], [3, "maj7"], [5, "min7"], [7, "dom7"], [8, "maj7"], [10, "dom7"]]
    : [[0, "maj7"], [2, "min7"], [4, "min7"], [5, "maj7"], [7, "dom7"], [9, "min7"], [11, "min7b5"]];
  return recipes.map(([interval, quality]) => makeChordSymbol(root + interval, quality));
}

function parseKeySignature(value: string | undefined): { root: number; minor: boolean } | undefined {
  if (!value) return undefined;
  const match = /^([A-G](?:#|b)?)(?:\s*(major|minor)|\s*(m))?$/i.exec(value.trim());
  if (!match) return undefined;
  const roots: Record<string, number> = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
    "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
  };
  const root = roots[match[1]];
  if (root === undefined) return undefined;
  return {
    root,
    minor: match[2]?.toLowerCase() === "minor" || Boolean(match[3]),
  };
}

function isMinorQuality(quality: ChordQuality): boolean {
  return quality.startsWith("min") || quality === "dim" || quality === "dim7";
}

function rank(index: number): number {
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function cloneAlternative(alternative: ChordAlternative): ChordAlternative {
  return {
    chord: { ...alternative.chord, tensions: [...alternative.chord.tensions] },
    confidence: alternative.confidence,
  };
}
