import type { ChordQuality, ChordSymbol, Tension } from "./types";

export interface PreviewVoicing {
  bassNote: number;
  notes: number[];
}

const qualityIntervals: Record<ChordQuality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  min7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  maj9: [0, 4, 7, 11, 14],
  min9: [0, 3, 7, 10, 14],
  dom9: [0, 4, 7, 10, 14],
  min11: [0, 3, 7, 10, 14, 17],
  dom13: [0, 4, 7, 10, 14, 21],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dom7sus4: [0, 5, 7, 10],
  add9: [0, 4, 7, 14],
  six: [0, 4, 7, 9],
  min6: [0, 3, 7, 9],
  sixNine: [0, 4, 7, 9, 14],
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

export function voiceChordForPreview(symbol: ChordSymbol): PreviewVoicing {
  const bassPc = symbol.bass ?? symbol.root;
  const bassNote = nearestMidiForPc(bassPc, 43, 55);
  const pcs = uniquePitchClasses([
    ...qualityIntervals[symbol.quality],
    ...symbol.tensions.map((tension) => tensionIntervals[tension]),
  ].map((interval) => symbol.root + interval));
  const upper = pcs
    .filter((pc) => pc !== bassPc || pcs.length <= 3)
    .map((pc, index) => nearestMidiForPc(pc, 55 + index, 76))
    .sort((left, right) => left - right)
    .slice(0, 5);

  return {
    bassNote,
    notes: [bassNote, ...upper],
  };
}

function uniquePitchClasses(values: number[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    const pc = normalizePc(value);
    if (!seen.has(pc)) {
      seen.add(pc);
      result.push(pc);
    }
  }
  return result;
}

function nearestMidiForPc(pc: number, target: number, max: number): number {
  const normalized = normalizePc(pc);
  let note = normalized;
  while (note < target) {
    note += 12;
  }
  while (note > max) {
    note -= 12;
  }
  return note;
}

function normalizePc(value: number): number {
  return ((Math.trunc(value) % 12) + 12) % 12;
}
