/**
 * P23-09 D3–D6: the Home drawer's 「キーで聴く」 wheel. Keys come from `progressionKey` (the progression's detected key,
 * else its Idea's); a progression without a readable key is not counted.
 */
import type { HomeProgression } from "./useHomeSummary";
import { progressionKey } from "../vault/progressionFacts";

export type KeyMode = "major" | "minor";

/** The circle of fifths from the top, clockwise. The minor wheel puts each relative minor where its major is. */
const MAJOR_PCS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5] as const;
export const WHEEL_NAMES: Record<KeyMode, readonly string[]> = {
  major: ["C", "G", "D", "A", "E", "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F"],
  minor: ["A", "E", "B", "F♯", "C♯", "G♯", "E♭", "B♭", "F", "C", "G", "D"],
};
export const MODE_NAMES: Record<KeyMode, string> = { major: "メジャー", minor: "マイナー" };

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The same key spellings `degreeOf` reads (`C major`, `Eb major`, `F# minor`, `Am`, `C`). */
export function keyTonic(key: string | undefined): { tonicPc: number; mode: KeyMode } | undefined {
  const match = /^([A-G])(#|b)?(?:\s*(major|minor)|\s*(m))?$/i.exec(key?.trim() ?? "");
  if (!match) return undefined;
  const tonicPc = (PITCH[match[1]!.toUpperCase()]! + (match[2] === "#" ? 1 : match[2] === "b" ? 11 : 0)) % 12;
  return { tonicPc, mode: match[3]?.toLowerCase() === "minor" || match[4] ? "minor" : "major" };
}

/** Where a key sits on its wheel (0 = the top: C major, A minor). */
export function parseHomeKey(key: string | undefined): { slot: number; mode: KeyMode } | undefined {
  const tonic = keyTonic(key);
  if (!tonic) return undefined;
  const majorPc = (tonic.mode === "minor" ? tonic.tonicPc + 3 : tonic.tonicPc) % 12;
  return { slot: MAJOR_PCS.indexOf(majorPc as (typeof MAJOR_PCS)[number]), mode: tonic.mode };
}

export type KeyWheel = Record<KeyMode, HomeProgression[][]>;

/** The progressions of each wheel slot, newest first. */
export function keyWheel(progressions: readonly HomeProgression[]): KeyWheel {
  const wheel: KeyWheel = { major: MAJOR_PCS.map(() => []), minor: MAJOR_PCS.map(() => []) };
  for (const entry of [...progressions].sort((left, right) => right.touchedAt - left.touchedAt)) {
    const key = parseHomeKey(progressionKey(entry.idea, entry.block));
    if (key) wheel[key.mode][key.slot]!.push(entry);
  }
  return wheel;
}

/**
 * The key the wheel opens on: the one with the most progressions; on a tie, major before minor, then the slot nearer
 * the top of the wheel (C, or A minor), the sharp side first.
 */
export function initialKey(wheel: KeyWheel): { slot: number; mode: KeyMode } {
  let best = { slot: 0, mode: "major" as KeyMode, count: 0, distance: 0 };
  for (const mode of ["major", "minor"] as const) {
    wheel[mode].forEach((entries, slot) => {
      const distance = Math.min(slot, 12 - slot) * 2 + (slot > 6 ? 1 : 0);
      if (entries.length > best.count || (entries.length === best.count && entries.length > 0 && mode === best.mode && distance < best.distance)) {
        best = { slot, mode, count: entries.length, distance };
      }
    });
  }
  return { slot: best.slot, mode: best.mode };
}
