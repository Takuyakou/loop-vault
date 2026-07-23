import { chordPitchClasses } from "../chordVoicing";
import { normalizePc } from "../chords";
import type { ChordQuality, ChordSymbol } from "../types";
import { normalizedChordKey } from "../voicing";
import type { PracticeChordRequirements, PracticeLeniency } from "./types";

const thirdOrSusIntervals: Record<ChordQuality, number[]> = {
  maj: [4],
  min: [3],
  dim: [3],
  aug: [4],
  maj7: [4],
  min7: [3],
  dom7: [4],
  min7b5: [3],
  dim7: [3],
  maj9: [4],
  min9: [3],
  dom9: [4],
  min11: [3],
  dom13: [4],
  sus2: [2],
  sus4: [5],
  dom7sus4: [5],
  add9: [4],
  six: [4],
  min6: [3],
  sixNine: [4],
};

const seventhIntervals: Partial<Record<ChordQuality, number>> = {
  maj7: 11,
  min7: 10,
  dom7: 10,
  min7b5: 10,
  dim7: 9,
  maj9: 11,
  min9: 10,
  dom9: 10,
  min11: 10,
  dom13: 10,
  dom7sus4: 10,
};

const characteristicIntervals: Partial<Record<ChordQuality, number[]>> = {
  maj9: [2],
  min9: [2],
  dom9: [2],
  min11: [5],
  dom13: [9],
  add9: [2],
  six: [9],
  min6: [9],
  sixNine: [9, 2],
};

const alteredFifthIntervals: Partial<Record<ChordQuality, number>> = {
  dim: 6,
  min7b5: 6,
  dim7: 6,
  aug: 8,
};

const tensionIntervals = {
  "9": 2,
  b9: 1,
  "#9": 3,
  "11": 5,
  "#11": 6,
  "13": 9,
  b13: 8,
} as const;

export function buildPracticeChordRequirements(
  chord: ChordSymbol,
  leniency: PracticeLeniency,
): PracticeChordRequirements {
  const all = unique(chordPitchClasses(chord));
  const core = unique([
    chord.root,
    ...thirdOrSusIntervals[chord.quality].map((interval) => chord.root + interval),
    ...(seventhIntervals[chord.quality] === undefined
      ? []
      : [chord.root + seventhIntervals[chord.quality]!]),
    ...(alteredFifthIntervals[chord.quality] === undefined
      ? []
      : [chord.root + alteredFifthIntervals[chord.quality]!]),
  ]);
  const characteristic = unique([
    ...(characteristicIntervals[chord.quality] ?? []).map((interval) => chord.root + interval),
    ...chord.tensions.map((tension) => chord.root + tensionIntervals[tension]),
  ]);
  const required = leniency === "easy"
    ? core
    : leniency === "normal"
      ? unique([...core, ...characteristic])
      : all;
  const optional = all.filter((pitchClass) => !required.includes(pitchClass));
  const requiredBassPitchClass = leniency === "strict"
    && chord.bass !== undefined
    && normalizePc(chord.bass) !== normalizePc(chord.root)
    ? normalizePc(chord.bass)
    : undefined;

  return {
    requiredPitchClasses: required,
    optionalPitchClasses: optional,
    allowedPitchClasses: all,
    ...(requiredBassPitchClass === undefined ? {} : { requiredBassPitchClass }),
    chordKey: normalizedChordKey(chord),
  };
}

function unique(values: readonly number[]): number[] {
  return [...new Set(values.map(normalizePc))].sort((left, right) => left - right);
}

