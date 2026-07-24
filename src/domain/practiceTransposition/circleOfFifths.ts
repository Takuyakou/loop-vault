import { normalizePracticePitchClass } from "./keyCatalog";

export const L4_FIFTH_OFFSETS = [-1, 1, -2, 2, -3, 3] as const;

export function createL4KeyPool(sourcePitchClass: number): number[] {
  const source = normalizePracticePitchClass(sourcePitchClass);
  return uniquePitchClasses(
    L4_FIFTH_OFFSETS.map((offset) => normalizePracticePitchClass(source + 7 * offset)),
  ).filter((pitchClass) => pitchClass !== source);
}

export function createL5KeyPool(sourcePitchClass: number): number[] {
  const source = normalizePracticePitchClass(sourcePitchClass);
  return Array.from({ length: 12 }, (_, offset) => (
    normalizePracticePitchClass(source + 7 * offset)
  ));
}

function uniquePitchClasses(values: readonly number[]): number[] {
  return [...new Set(values.map(normalizePracticePitchClass))];
}
