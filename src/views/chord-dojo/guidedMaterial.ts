import { buildBuiltin, builtinDisplayName, keyLabel, type DojoChord } from "../../domain/chordDojo/builtins";
import { progressionInRange } from "../../domain/chordDojo/recordScope";
import type { VaultProgression } from "../../domain/chordDojo/collect";
import type { Task } from "../../domain/chordDojo/store";

/**
 * P23-38: what the guided practice is about — one 2–4 chord stretch of one material, in the state the
 * Dojo keeps while it is open (never stored).
 */
export interface GuidedMaterial {
  readonly task: Task;
  /** Card positions inside the material (0-based, inclusive). Omitted: the first cards. */
  readonly range?: { readonly start: number; readonly end: number };
}

/** The first material: the public built-in 「3-6-2-5」 in C, all four chords (stable id, no name matching). */
export const DEFAULT_GUIDED_MATERIAL: GuidedMaterial = {
  task: { kind: "progression", key: "builtin:jb-3625:1", review: false, roots: [0], seconds: 120 },
};

export interface GuidedMaterialView {
  readonly name: string;
  readonly keyLabel?: string;
  /** The material's own chords (saved occurrence / frozen display plan included). */
  readonly chords: readonly DojoChord[];
  /** The window the guide uses, after the material's own range (saved bars) was applied. */
  readonly start: number;
  readonly end: number;
  readonly count: number;
}

/**
 * The small adapter from the two sources. Nothing is regenerated: the chords, their beats, their saved
 * occurrence and their frozen display plan are passed on as they are. `undefined` when the material is gone
 * or has fewer than two chords (the guide needs 2–4).
 */
export function guidedMaterialView(
  material: GuidedMaterial,
  progressions: readonly VaultProgression[],
): GuidedMaterialView | undefined {
  const { task } = material;
  let name: string;
  let chords: GuidedMaterialView["chords"];
  let keyLabelText: string | undefined;
  if (task.key.startsWith("builtin:")) {
    const builtin = buildBuiltin(task.key.split(":")[1] ?? "", task.roots[0] ?? 0);
    if (!builtin) return undefined;
    name = builtinDisplayName(builtin);
    chords = builtin.chords;
    keyLabelText = keyLabel(task.roots[0] ?? 0, builtin.mode);
  } else {
    const source = progressions.find((entry) => entry.key === task.key);
    if (!source) return undefined;
    name = source.displayName ?? source.name;
    chords = task.kind === "progression" && task.range ? progressionInRange(source, task.range) : source.chords;
    keyLabelText = source.keyContext;
  }
  const total = chords.length;
  if (total < 2) return undefined;
  const start = Math.max(0, Math.min(material.range?.start ?? 0, total - 1));
  const end = Math.max(start, Math.min(material.range?.end ?? Math.min(3, total - 1), total - 1));
  return {
    name,
    ...(keyLabelText === undefined ? {} : { keyLabel: keyLabelText }),
    chords,
    start,
    end,
    count: end - start + 1,
  };
}

/** The window the guide would use without asking (the first four cards, or all of a short material). */
export function defaultGuidedRange(total: number): { start: number; end: number } {
  return { start: 0, end: Math.min(3, Math.max(1, total - 1)) };
}
