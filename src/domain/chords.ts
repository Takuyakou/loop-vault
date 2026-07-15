import type { ChordQuality, ChordSymbol, Tension } from "./types";

const noteNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
type NoteName = (typeof noteNames)[number];

const noteNameToPc: ReadonlyMap<string, number> = new Map(
  [
    ["C", 0], ["B#", 0],
    ["C#", 1], ["Db", 1],
    ["D", 2],
    ["D#", 3], ["Eb", 3],
    ["E", 4], ["Fb", 4],
    ["F", 5], ["E#", 5],
    ["F#", 6], ["Gb", 6],
    ["G", 7],
    ["G#", 8], ["Ab", 8],
    ["A", 9],
    ["A#", 10], ["Bb", 10],
    ["B", 11], ["Cb", 11],
  ] as const,
);

const qualityLabels: Record<ChordQuality, string> = {
  maj: "",
  min: "m",
  dim: "dim",
  aug: "aug",
  maj7: "maj7",
  min7: "m7",
  dom7: "7",
  min7b5: "m7b5",
  dim7: "dim7",
  maj9: "maj9",
  min9: "m9",
  dom9: "9",
  min11: "m11",
  dom13: "13",
  sus2: "sus2",
  sus4: "sus4",
  dom7sus4: "7sus4",
  add9: "add9",
  six: "6",
  min6: "m6",
  sixNine: "6/9",
};

const labelQualities: Array<[RegExp, ChordQuality]> = [
  [/^(maj9|M9)$/i, "maj9"],
  [/^(maj7|M7|△7)$/i, "maj7"],
  [/^(m7b5|ø)$/i, "min7b5"],
  [/^(min11|m11)$/i, "min11"],
  [/^(min9|m9)$/i, "min9"],
  [/^(min7|m7)$/i, "min7"],
  [/^(min6|m6)$/i, "min6"],
  [/^(min|m)$/i, "min"],
  [/^(dim7)$/i, "dim7"],
  [/^(dim|o)$/i, "dim"],
  [/^(aug|\+)$/i, "aug"],
  [/^(dom13|13)$/i, "dom13"],
  [/^(dom9|9)$/i, "dom9"],
  [/^(dom7|7)$/i, "dom7"],
  [/^(7sus4)$/i, "dom7sus4"],
  [/^(sus2)$/i, "sus2"],
  [/^(sus4|sus)$/i, "sus4"],
  [/^(add9)$/i, "add9"],
  [/^(6\/9)$/i, "sixNine"],
  [/^(6)$/i, "six"],
  [/^$/, "maj"],
];

export function labelFromSymbol(symbol: ChordSymbol): string {
  const root = pcToName(symbol.root);
  const quality = qualityLabels[symbol.quality];
  const tensions = symbol.tensions.join("");
  const bass =
    symbol.bass === undefined || normalizePc(symbol.bass) === normalizePc(symbol.root)
      ? ""
      : `/${pcToName(symbol.bass)}`;

  return `${root}${quality}${tensions}${bass}`;
}

export function parseChordLabel(label: string): ChordSymbol | null {
  const trimmed = label.trim();
  const match = /^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const root = noteNameToPc.get(match[1]);
  const bass = match[3] ? noteNameToPc.get(match[3]) : undefined;
  if (root === undefined || (match[3] && bass === undefined)) {
    return null;
  }

  const qualityText = match[2].trim();
  const tensions: Tension[] = [];
  let remaining = qualityText;
  let quality = parseQuality(remaining);
  if (!quality) {
    for (const tension of ["b13", "#11", "b9", "#9", "13", "11", "9"] as const) {
      if (remaining.includes(tension)) {
        tensions.push(tension);
        remaining = remaining.replace(tension, "");
      }
    }
    quality = parseQuality(remaining);
  }
  if (!quality) {
    return null;
  }

  const symbol: ChordSymbol = {
    root,
    quality,
    tensions,
    ...(bass !== undefined ? { bass } : {}),
    label: "",
  };

  return { ...symbol, label: labelFromSymbol(symbol) };
}

export function makeChordSymbol(
  root: number,
  quality: ChordQuality,
  tensions: Tension[] = [],
  bass?: number,
): ChordSymbol {
  const symbol: ChordSymbol = {
    root: normalizePc(root),
    quality,
    tensions,
    ...(bass !== undefined ? { bass: normalizePc(bass) } : {}),
    label: "",
  };
  return { ...symbol, label: labelFromSymbol(symbol) };
}

export function normalizePc(value: number): number {
  return ((Math.trunc(value) % 12) + 12) % 12;
}

function parseQuality(value: string): ChordQuality | null {
  for (const [pattern, quality] of labelQualities) {
    if (pattern.test(value)) {
      return quality;
    }
  }

  return null;
}

function pcToName(value: number): NoteName {
  return noteNames[normalizePc(value)];
}
