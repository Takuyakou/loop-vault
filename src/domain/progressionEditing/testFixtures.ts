import type { ChordSymbol, ProgressionBlockCandidate } from "../types";

const cMajor = chord(0, "maj", "C");
export const gMajor = chord(7, "maj", "G");

export function makeCandidate(): ProgressionBlockCandidate {
  return {
    id: "candidate-1",
    startBar: 1,
    endBar: 4,
    lengthBars: 4,
    summaryText: "C - C",
    confidence: 0.8,
    labels: [],
    warnings: [],
    chords: [
      timelineItem(1, 1, 2, cMajor),
      timelineItem(1, 3, 2, cMajor),
    ],
  };
}

function timelineItem(
  bar: number,
  beat: number,
  durationBeats: number,
  value: ChordSymbol,
) {
  return {
    bar,
    beat,
    durationBeats,
    chord: value,
    confidence: 0.8,
    alternatives: [{ chord: gMajor, confidence: 0.6 }],
    warnings: [],
  };
}

function chord(
  root: number,
  quality: ChordSymbol["quality"],
  label: string,
): ChordSymbol {
  return { root, quality, tensions: [], label };
}
