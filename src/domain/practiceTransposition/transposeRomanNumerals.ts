import { degreeOf, type DegreeSymbol } from "../harmony/degrees";
import type { ChordQuality, ChordSymbol, Tension } from "../types";
import {
  canonicalizeKeySignature,
  formatKeySignature,
  normalizePracticePitchClass,
} from "./keyCatalog";
import type { KeySignature } from "./types";

export interface PracticeDegreeSymbol {
  degree: number;
  accidental: -1 | 0 | 1;
  quality: ChordQuality;
  tensions: readonly Tension[];
  bassInterval?: number;
  bassLabel?: string;
  label: string;
}

const tensionOrder: readonly Tension[] = [
  "b9", "#9", "9", "11", "#11", "b13", "13",
];
const bassLabels = [
  "root", "b2nd", "2nd", "b3rd", "3rd", "4th",
  "#4th", "5th", "b6th", "6th", "b7th", "7th",
] as const;

export function romanNumeralForChord(
  chord: ChordSymbol,
  key: KeySignature,
): string {
  return degreeForChord(chord, key)?.label ?? "";
}

export function degreeForChord(
  chord: ChordSymbol,
  key: KeySignature,
): PracticeDegreeSymbol | undefined {
  const canonicalKey = canonicalizeKeySignature(key);
  const base = degreeOf(chord, formatKeySignature(canonicalKey, "en"));
  if (!base) return undefined;
  const tensions = canonicalTensions(chord.tensions);
  const bassInterval = chord.bass === undefined
    || normalizePracticePitchClass(chord.bass) === normalizePracticePitchClass(chord.root)
    ? undefined
    : normalizePracticePitchClass(chord.bass - chord.root);
  const bassLabel = bassInterval === undefined ? undefined : bassLabels[bassInterval];
  const baseLabel = removeLegacyBassLabel(base);
  return {
    degree: base.degree,
    accidental: base.accidental,
    quality: base.quality,
    tensions,
    ...(bassInterval === undefined ? {} : { bassInterval, bassLabel }),
    label: `${baseLabel}${tensions.join("")}${bassLabel ? `/${bassLabel}` : ""}`,
  };
}

export function preservesRomanNumeral(
  sourceChord: ChordSymbol,
  sourceKey: KeySignature,
  targetChord: ChordSymbol,
  targetKey: KeySignature,
): boolean {
  const source = degreeForChord(sourceChord, sourceKey);
  const target = degreeForChord(targetChord, targetKey);
  if (!source || !target) return false;
  return source.degree === target.degree
    && source.accidental === target.accidental
    && source.quality === target.quality
    && equalTensions(source.tensions, target.tensions)
    && source.bassInterval === target.bassInterval;
}

function canonicalTensions(tensions: readonly Tension[]): readonly Tension[] {
  const values = new Set(tensions);
  return tensionOrder.filter((tension) => values.has(tension));
}

function removeLegacyBassLabel(degree: DegreeSymbol): string {
  return degree.bass ? degree.label.replace(/\/(?:3rd|5th|7th)$/, "") : degree.label;
}

function equalTensions(
  left: readonly Tension[],
  right: readonly Tension[],
): boolean {
  return left.length === right.length
    && left.every((tension, index) => tension === right[index]);
}
