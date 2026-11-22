import { progressionTagLabel } from "../../domain/progressionClassification/mod";
// P23-10: the Vault list's key band, date headings, role colours and "same motion" — pure functions over VaultRow.
import { progressionFunctions } from "../../domain/harmony/chordFunction";
import { degreeOf } from "../../domain/harmony/degrees";
import type { SavedProgressionBlock } from "../../domain/types";
import { keyTonic, type KeyMode } from "../home/homeKeys";
import type { VaultRow } from "./vaultLibrary";

/** The key band's order: the circle of fifths, majors from C and minors from A (as the Home wheel). */
const MAJOR_PCS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5] as const;
const MINOR_PCS = [9, 4, 11, 6, 1, 8, 3, 10, 5, 0, 7, 2] as const;
const MAJOR_NAMES = ["C", "G", "D", "A", "E", "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F"] as const;
const MINOR_NAMES = ["A", "E", "B", "F♯", "C♯", "G♯", "D♯", "B♭", "F", "C", "G", "D"] as const;

export interface KeyCell {
  /** `major:0` … `minor:11` (tonic pitch class). */
  readonly id: string;
  readonly mode: KeyMode;
  /** Shown text: `C`, `F♯`, `Am`, `C♯m`. */
  readonly label: string;
  /** Read aloud: `C メジャー`. */
  readonly name: string;
}

export const KEY_BAND: Record<KeyMode, readonly KeyCell[]> = {
  major: MAJOR_PCS.map((pc, index) => ({ id: `major:${pc}`, mode: "major" as const, label: MAJOR_NAMES[index]!, name: `${MAJOR_NAMES[index]} メジャー` })),
  minor: MINOR_PCS.map((pc, index) => ({ id: `minor:${pc}`, mode: "minor" as const, label: `${MINOR_NAMES[index]}m`, name: `${MINOR_NAMES[index]} マイナー` })),
};

/** The cell a saved key belongs to (`Eb major` and `D# major` share one); undefined when the key is unreadable or missing. */
export function keyCellOf(key: string | undefined): string | undefined {
  const tonic = keyTonic(key);
  return tonic ? `${tonic.mode}:${tonic.tonicPc}` : undefined;
}

/** Progression count per cell, from the per-key counts `queryVault` returns (the key facet ignores its own selection). */
export function keyCellCounts(keyCounts: ReadonlyMap<string, number>): Map<string, number> {
  const cells = new Map<string, number>();
  keyCounts.forEach((count, key) => {
    const cell = keyCellOf(key);
    if (cell) cells.set(cell, (cells.get(cell) ?? 0) + count);
  });
  return cells;
}

/** The saved key spellings that belong to a cell (what the key filter stores). */
export function keysInCell(cell: string, keys: Iterable<string>): string[] {
  return [...keys].filter((key) => keyCellOf(key) === cell);
}

/** The one cell the key filter is on, when every selected key is in the same cell. */
export function selectedKeyCell(selected: readonly string[]): string | undefined {
  const cells = new Set(selected.map(keyCellOf));
  return cells.size === 1 ? [...cells][0] : undefined;
}

/** T / SD / SDm / D per chord from the progression's key; empty strings when the key is unknown. */
export function chordRoles(block: SavedProgressionBlock, key: string | undefined): string[] {
  const tonic = keyTonic(key);
  if (!tonic) return block.chords.map(() => "");
  return progressionFunctions(block.chords.map(({ chord }) => ({
    rootPc: chord.root,
    quality: chord.quality,
    tensions: chord.tensions,
    ...(chord.bass === undefined ? {} : { bassPc: chord.bass }),
  })), tonic).map((result) => result.kind);
}

/** The progression's degrees in its own key (Ⅱm7…), or undefined when any chord has none. */
export function degreeShape(row: Pick<VaultRow, "block" | "key">): string | undefined {
  if (!row.key || !row.block.chords.length) return undefined;
  const degrees = row.block.chords.map((item) => degreeOf(item.chord, row.key)?.label);
  return degrees.every(Boolean) ? degrees.join(" ") : undefined;
}

/** V7: other progressions that move the same way — the same degree sequence, whatever their key. */
export function sameMotion(row: VaultRow, rows: readonly VaultRow[]): VaultRow[] {
  const shape = degreeShape(row);
  if (!shape) return [];
  return rows.filter((other) => other.id !== row.id && degreeShape(other) === shape);
}

/** A tag id as shown: its label, or the id without its group prefix. */
export function tagLabel(tagId: string): string {
  const label = progressionTagLabel(tagId);
  return label === tagId ? tagId.replace(/^[^.]+\./, "") : label;
}
