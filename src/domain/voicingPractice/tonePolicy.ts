import type {
  ChordQuality,
  ChordSymbol,
  Tension,
} from "../types";
import type {
  ChordToneDescriptor,
  StyleTonePolicy,
  VoicingStyleId,
} from "./types";

const qualityIntervals: Record<ChordQuality, readonly [number, string][]> = {
  maj: [[0, "R"], [4, "3"], [7, "5"]],
  min: [[0, "R"], [3, "b3"], [7, "5"]],
  dim: [[0, "R"], [3, "b3"], [6, "b5"]],
  aug: [[0, "R"], [4, "3"], [8, "#5"]],
  maj7: [[0, "R"], [4, "3"], [7, "5"], [11, "7"]],
  min7: [[0, "R"], [3, "b3"], [7, "5"], [10, "b7"]],
  dom7: [[0, "R"], [4, "3"], [7, "5"], [10, "b7"]],
  min7b5: [[0, "R"], [3, "b3"], [6, "b5"], [10, "b7"]],
  dim7: [[0, "R"], [3, "b3"], [6, "b5"], [9, "bb7"]],
  maj9: [[0, "R"], [4, "3"], [7, "5"], [11, "7"], [14, "9"]],
  min9: [[0, "R"], [3, "b3"], [7, "5"], [10, "b7"], [14, "9"]],
  dom9: [[0, "R"], [4, "3"], [7, "5"], [10, "b7"], [14, "9"]],
  min11: [[0, "R"], [3, "b3"], [7, "5"], [10, "b7"], [14, "9"], [17, "11"]],
  dom13: [[0, "R"], [4, "3"], [7, "5"], [10, "b7"], [14, "9"], [21, "13"]],
  sus2: [[0, "R"], [2, "2"], [7, "5"]],
  sus4: [[0, "R"], [5, "4"], [7, "5"]],
  dom7sus4: [[0, "R"], [5, "4"], [7, "5"], [10, "b7"]],
  add9: [[0, "R"], [4, "3"], [7, "5"], [14, "9"]],
  six: [[0, "R"], [4, "3"], [7, "5"], [9, "6"]],
  min6: [[0, "R"], [3, "b3"], [7, "5"], [9, "6"]],
  sixNine: [[0, "R"], [4, "3"], [7, "5"], [9, "6"], [14, "9"]],
};

const tensionIntervals: Record<Tension, number> = {
  "9": 14,
  b9: 13,
  "#9": 15,
  "11": 17,
  "#11": 18,
  "13": 21,
  b13: 20,
};

const thirdOrSus = new Set(["3", "b3", "2", "4"]);
const sevenths = new Set(["7", "b7", "bb7"]);
const alteredFifths = new Set(["b5", "#5"]);
const characteristicExtensions = new Set(["6", "9", "b9", "#9", "11", "#11", "13", "b13"]);

export function chordToneDescriptors(chord: ChordSymbol): ChordToneDescriptor[] {
  const qualityTones = qualityIntervals[chord.quality].map(([interval, label]) => ({
    interval,
    label,
    pitchClass: normalizePitchClass(chord.root + interval),
    explicit: characteristicExtensions.has(label),
  }));
  const tensions = chord.tensions.map((tension) => {
    const interval = tensionIntervals[tension];
    return {
      interval,
      label: tension,
      pitchClass: normalizePitchClass(chord.root + interval),
      explicit: true,
    };
  });
  const byPitchClass = new Map<number, ChordToneDescriptor>();
  for (const tone of [...qualityTones, ...tensions]) {
    const previous = byPitchClass.get(tone.pitchClass);
    if (!previous || tone.explicit) byPitchClass.set(tone.pitchClass, tone);
  }
  return [...byPitchClass.values()].sort((left, right) => (
    left.interval - right.interval || left.label.localeCompare(right.label)
  ));
}

export function getStyleTonePolicy(
  chord: ChordSymbol,
  styleId: VoicingStyleId,
): StyleTonePolicy {
  const tones = chordToneDescriptors(chord);
  const labels = tones.map((tone) => tone.label);
  const definingTone = labels.find((label) => thirdOrSus.has(label));
  const seventh = labels.find((label) => sevenths.has(label));
  const altered = labels.filter((label) => alteredFifths.has(label));
  const explicit = tones.filter((tone) => tone.explicit).map((tone) => tone.label);

  if (styleId === "rootless-ab") {
    return {
      requiredIntervals: unique([
        ...(definingTone ? [definingTone] : []),
        ...(seventh ? [seventh] : []),
        ...altered,
      ]),
      preferredIntervals: unique([...explicit, "9", "13", "5"]),
      droppableIntervals: ["5", "13", "9"],
      forbiddenIntervals: ["R"],
    };
  }

  return {
    requiredIntervals: unique([
      chord.bass !== undefined && chord.bass !== chord.root ? "Bass" : "R",
      ...(definingTone ? [definingTone] : []),
      ...(seventh ? [seventh] : []),
      ...altered,
      ...explicit.slice(0, 1),
    ]),
    preferredIntervals: ["9", "13", "11", "6", "5"],
    droppableIntervals: ["5", "13", "11", "9"],
    forbiddenIntervals: [],
  };
}

export function toneByLabel(
  chord: ChordSymbol,
  label: string,
): ChordToneDescriptor | undefined {
  return chordToneDescriptors(chord).find((tone) => tone.label === label);
}

export function normalizePitchClass(value: number): number {
  return ((Math.trunc(value) % 12) + 12) % 12;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
