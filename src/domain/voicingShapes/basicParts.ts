/**
 * P25-08 K11: Voicing Loop's 基本 with the two parts (テンションを足す・広げる). The 基本 notes stay as they are;
 * only the added note and the spread left hand follow K (K5 and ①'s 広げる).
 */
import type { ChordSymbol } from "../types";
import { recChordOf, type UsedVoicingShape } from ".";
import { recipe, SEMI } from "./recipe";

export interface BasicPlacement { readonly left: readonly number[]; readonly right: readonly number[] }
export interface BasicPartsResult extends BasicPlacement {
  readonly used: UsedVoicingShape;
  /** The degree added (K5); absent when nothing was added (already sounding, or nothing to add). */
  readonly addedTension?: string;
  /** Why テンションを足す did nothing: the note is already in 基本 (「入り済み」) or there is none (「なし」). */
  readonly tensionState: "added" | "present" | "none";
}

const RIGHT_LOW = 52;
const RIGHT_HIGH = 88;
const pc = (note: number): number => ((note % 12) + 12) % 12;
const sorted = (notes: readonly number[]): number[] => [...notes].sort((a, b) => a - b);

/** K5: the colour 「テンションを足す」 adds — only when the chord has no written tension (mostly 9, m7♭5 → 11). */
export function addedTensionDegree(chord: ChordSymbol): string | undefined {
  let c;
  try { c = recChordOf(chord); } catch { return undefined; }
  const extras = [...c.altT, ...(c.alt ? ["#9"] : []), ...c.req, ...c.nat];
  if (extras.length > 0) return undefined;
  const toneSemis = new Set(c.tones().map((degree) => SEMI[degree]));
  return c.safe.find((degree) => !toneSemis.has(SEMI[degree]));
}

/** K11-2: the spread left hand's degrees — ①'s 広げる (R・5, else R・7); a chord ① cannot make takes R・5. */
function spreadLeftDegrees(chord: ChordSymbol): readonly [string, string] {
  try {
    const left = recipe(recChordOf(chord), "shell", false, true).L;
    if (left.length === 2) return [left[0]!, left[1]!];
  } catch { /* no third frame (C5 …) */ }
  return ["R", "5"];
}

function addTension(chord: ChordSymbol, basic: BasicPlacement): { readonly placement: BasicPlacement; readonly degree?: string; readonly state: BasicPartsResult["tensionState"] } {
  const degree = addedTensionDegree(chord);
  if (degree === undefined || SEMI[degree] === undefined) return { placement: basic, state: "none" };
  const target = pc(chord.root + SEMI[degree]!);
  const all = [...basic.left, ...basic.right];
  if (all.some((note) => pc(note) === target)) return { placement: basic, state: "present" };
  const heights: number[] = [];
  for (let note = RIGHT_LOW; note <= RIGHT_HIGH; note += 1) if (pc(note) === target) heights.push(note);
  const centre = basic.right.length > 0 ? basic.right.reduce((sum, note) => sum + note, 0) / basic.right.length : 67;
  const clear = heights.filter((height) => all.every((note) => Math.abs(note - height) !== 1));
  const pool = clear.length > 0 ? clear : heights;
  const best = pool.reduce((left, right) => Math.abs(right - centre) < Math.abs(left - centre) ? right : left);
  return { placement: { left: basic.left, right: sorted([...basic.right, best]) }, degree, state: "added" };
}

function spread(chord: ChordSymbol, basic: BasicPlacement): BasicPlacement {
  if (chord.bass !== undefined && pc(chord.bass) !== pc(chord.root)) return basic;
  const [, upper] = spreadLeftDegrees(chord);
  const lowest = Math.min(...(basic.left.length > 0 ? basic.left : basic.right));
  let root = 36 + pc(chord.root - 36);
  for (let note = root; note <= 59; note += 12) if (Math.abs(note - lowest) < Math.abs(root - lowest)) root = note;
  const left = [root, root + (SEMI[upper] ?? 7)];
  const leftClasses = new Set(left.map(pc));
  const kept = basic.right.filter((note) => !leftClasses.has(pc(note)));
  const top = Math.max(...left);
  const right: number[] = [];
  for (const note of kept.length > 0 ? kept : basic.right) {
    let moved = note;
    while (moved <= top) moved += 12;
    if (moved <= RIGHT_HIGH && !right.includes(moved)) right.push(moved);
  }
  return { left, right: sorted(right) };
}

/** K11: 1 (テンションを足す) then 2 (広げる). `used` names the parts asked for, even when nothing changed. */
export function buildBasicWithParts(
  chord: ChordSymbol,
  basic: BasicPlacement,
  parts: { readonly tension: boolean; readonly spread: boolean },
): BasicPartsResult {
  let placement: BasicPlacement = { left: sorted(basic.left), right: sorted(basic.right) };
  let addedTension: string | undefined;
  let tensionState: BasicPartsResult["tensionState"];
  if (parts.tension) {
    const added = addTension(chord, placement);
    placement = added.placement; addedTension = added.degree; tensionState = added.state;
  } else {
    const degree = addedTensionDegree(chord);
    tensionState = degree === undefined ? "none"
      : [...placement.left, ...placement.right].some((note) => pc(note) === pc(chord.root + (SEMI[degree] ?? 0))) ? "present" : "added";
  }
  if (parts.spread) placement = spread(chord, placement);
  const used = `basic${parts.tension ? "+tension" : ""}${parts.spread ? "+spread" : ""}` as UsedVoicingShape;
  return { ...placement, used, tensionState, ...(addedTension === undefined ? {} : { addedTension }) };
}
