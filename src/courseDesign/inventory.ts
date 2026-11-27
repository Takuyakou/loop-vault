import { BUILTINS, DEFS, buildBuiltin } from "../domain/chordDojo/builtins";
import { CURRICULUM, NAMES, recipeNotes, type Quality } from "../domain/chordDojo/recipes";
import ear from "../domain/earPractice/earProgressions.json";
import earExtra from "../domain/earPractice/earProgressionsExtra.json";

/**
 * P23-39 §1: the machine-readable inventory of the material the course may use. It is built from the
 * product's *public* tables only (built-ins, recipe presets, ear questions); no Vault, no private MIDI, no
 * generated answer is used as the only gold. `docs/contracts/p23-39/inventory.json` is the frozen copy and
 * `inventory.test.ts` fails when the copy drifts.
 */
export const LEVEL_QUALITIES = ["maj", "min", "maj7", "min7", "dom7", "min7b5"] as const;
export type LevelQuality = (typeof LEVEL_QUALITIES)[number];
const ROOT_INDEXES = Array.from({ length: 12 }, (_, index) => index);

interface EarQuestion {
  readonly id: string;
  readonly level: number;
  readonly length: number;
  readonly mode: string;
  readonly name: string;
  readonly bars: readonly (readonly string[])[];
}
interface EarFile {
  readonly version: number;
  readonly progressions: readonly EarQuestion[];
}
const earQuestions: EarQuestion[] = [...(ear as EarFile).progressions, ...(earExtra as EarFile).progressions];

export function buildInventory() {
  const defs = new Map(DEFS.map((def) => [def.id, def]));
  const builtins = BUILTINS.map((builtin) => {
    const def = defs.get(builtin.id)!;
    const material = buildBuiltin(builtin.id, 0);
    return {
      id: builtin.id,
      name: builtin.title ?? builtin.name,
      group: builtin.group,
      mode: builtin.mode,
      layer: builtin.layer,
      practiceKeys: builtin.practiceKeys,
      roots: def.roots.slice().sort((a, b) => a - b),
      qualitiesDeclared: def.qualities.slice(),
      todayPool: builtin.todayPool,
      judge: builtin.judge,
      cards: material.chords.map((card, index) => ({
        index,
        label: card.chord.label,
        quality: card.chord.quality,
        root: card.chord.root,
        bass: card.chord.bass ?? null,
        notes: card.notes.slice(),
        beats: card.beats,
      })),
      // A built-in is played in its own roots; transposition is a variation, never a second family.
      transformable: def.roots.length > 1,
      judgePolicy: `${builtin.judge} (course trial decides omissions/tensions; the authored notes stay the source)`,
      scorerCompatibility: "compatible",
    };
  });

  const shapes = CURRICULUM.map((entry) => ({
    id: `preset:${entry.quality}:${entry.preset}:${entry.bass}`,
    quality: entry.quality,
    preset: entry.preset,
    bass: entry.bass,
    notes: (recipeNotes(0, entry.quality as Quality, entry.preset) ?? []).slice(),
    transformable: true,
    judgePolicy: "shape (root/quality from the symbol; exact voicing is a separate policy)",
    scorerCompatibility: "compatible",
  }));

  const ears = earQuestions.map((question) => ({
    id: question.id,
    level: question.level,
    length: question.length,
    mode: question.mode,
    name: question.name,
    bars: question.bars.map((bar) => bar.slice()),
    judgePolicy: "ear session's own harmony+bass acceptance (not the course's shape judge)",
    transformable: false,
    scorerCompatibility: question.level <= 3 ? "adapter-needed" : "unsuitable (level > 3 is out of this course)",
    usedByCourse: false,
  }));

  // (quality, root) coverage of the built-ins, across the keys each built-in can be played in.
  const coverage: Record<string, Record<string, string[]>> = {};
  for (const quality of LEVEL_QUALITIES) {
    coverage[quality] = Object.fromEntries(ROOT_INDEXES.map((root) => [String(root), []]));
  }
  for (const builtin of BUILTINS) {
    const def = defs.get(builtin.id)!;
    for (const root of def.roots) {
      const material = buildBuiltin(def.id, root);
      for (const card of material.chords) {
        const quality = card.chord.quality;
        if (!(LEVEL_QUALITIES as readonly string[]).includes(quality)) continue;
        const pitchRoot = ((card.chord.root % 12) + 12) % 12;
        const list = coverage[quality]![String(pitchRoot)]!;
        if (!list.includes(def.id)) list.push(def.id);
      }
    }
  }
  for (const quality of LEVEL_QUALITIES) for (const root of ROOT_INDEXES) coverage[quality]![String(root)]!.sort();

  const gaps = LEVEL_QUALITIES.flatMap((quality) =>
    ROOT_INDEXES.map((root) => ({ quality, root: NAMES[root]!, rootIndex: root }))
      .filter((cell) => coverage[cell.quality]![String(cell.rootIndex)]!.length === 0),
  );

  const available = builtins.length + shapes.length;
  const adapterNeeded = ears.filter((question) => question.scorerCompatibility === "adapter-needed").length + gaps.length;
  const unsuitable = ears.filter((question) => question.scorerCompatibility.startsWith("unsuitable")).length;

  return {
    version: 1,
    generatedFrom: {
      builtins: BUILTINS.length,
      shapeRecipes: CURRICULUM.length,
      earQuestions: ears.length,
      sources: ["src/domain/chordDojo/builtins.ts", "src/domain/chordDojo/recipes.ts", "src/domain/earPractice/earProgressions*.json"],
      privateData: false,
    },
    level1to3Vocab: [...LEVEL_QUALITIES],
    builtins,
    shapes,
    ears,
    coverage,
    gaps: {
      cells: gaps,
      // Shapes are root-agnostic voicing recipes: they can voice every root, but they are not progressions
      // and cannot replace a missing built-in (an adapter is required to turn one into a course item).
      adapterNote: "a shape recipe can be voiced in any key; it is not itself a 2–4 chord progression",
    },
    classification: { available, adapterNeeded, unsuitable },
  };
}

export type Inventory = ReturnType<typeof buildInventory>;
