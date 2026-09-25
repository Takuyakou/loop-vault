import type { ProgressionFingeringHandTargets } from "./fingeringDisplay";

export interface MiniKeyboardRange { readonly min: number; readonly max: number }
export interface NextShapeRanges { readonly ranges: readonly MiniKeyboardRange[]; readonly separated: boolean }
const isBlack = (note: number) => [1, 3, 6, 8, 10].includes(note % 12);
export { isBlack };

function octaveRange(notes: readonly number[]): MiniKeyboardRange {
  const low = Math.min(...notes); const high = Math.max(...notes);
  const min = Math.max(0, Math.floor((low - 2) / 12) * 12);
  const max = Math.min(127, Math.ceil((high + 3) / 12) * 12 - 1);
  return { min, max: Math.max(min, max) };
}

export function nextShapeRanges(hands: ProgressionFingeringHandTargets): NextShapeRanges {
  const left = hands.left; const right = hands.right;
  const all = [...left, ...right];
  if (!all.length) return { ranges: [], separated: false };
  if (left.length && right.length && Math.min(...right) - Math.max(...left) >= 36) {
    return { ranges: [octaveRange(left), octaveRange(right)], separated: true };
  }
  return { ranges: [octaveRange(all)], separated: false };
}
