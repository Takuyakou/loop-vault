import type { ChordQuality } from "../../../types";
import { makeChord, makeItem, NOTE_NAMES, voiceLed } from "./build";
import type { AdvancedBlock, AdvancedItem } from "./types";

/**
 * P23-45 Lv8: widen the chord vocabulary in three groups —
 * ① 6・add9・sus2・sus4, ② m9・maj9・9, ③ 13 and the basic rootless voicings.
 *
 * P23-56: each group asks 12 chord-name questions, 4 *recolour* questions (a plain progression played
 * with the group's colours — Dm7 → G7 → Cmaj7 as Dm9 → G13 → Cmaj9) and 6 ear questions on the same
 * day, then 6 names and 3 recolours on another day (was 20 · 10 · 10 single chords). The ids of the
 * kept questions are the P23-45 ids with the same chords, so earlier answers to them still count. The answer rule
 * is the product's normal leniency: a characteristic tone (9/13/sus) is required, an optional fifth or
 * eleventh is not, and the rootless items omit the root from the required set while keeping every
 * chord tone allowed, so another valid placement still passes.
 */
export interface Vocabulary {
  readonly quality: ChordQuality;
  readonly rootless?: boolean;
}

interface GroupSpec {
  readonly id: string;
  readonly label: string;
  readonly vocabulary: readonly Vocabulary[];
}

export const LV8_GROUPS: readonly GroupSpec[] = [
  {
    id: "six",
    label: "6・add9・sus",
    vocabulary: [{ quality: "six" }, { quality: "add9" }, { quality: "sus2" }, { quality: "sus4" }],
  },
  {
    id: "nine",
    label: "9系",
    vocabulary: [{ quality: "min9" }, { quality: "maj9" }, { quality: "dom9" }],
  },
  {
    id: "thirteen",
    label: "13・ルートレス",
    vocabulary: [
      { quality: "dom13" },
      { quality: "maj9", rootless: true },
      { quality: "min9", rootless: true },
      { quality: "dom9", rootless: true },
      { quality: "dom13", rootless: true },
    ],
  },
];

const ROOTS = [0, 5, 7, 2, 9, 10, 3, 4, 8, 11, 1, 6] as const;

function qualityName(vocabulary: Vocabulary): string {
  return vocabulary.rootless === true ? `${vocabulary.quality}（ルートレス）` : vocabulary.quality;
}

interface Combo {
  readonly root: number;
  readonly vocabulary: number;
}

/**
 * P23-46: each group's 20 name questions are 20 distinct (root, vocabulary) pairs, and the 10
 * delayed questions use pairs that never appear in the same-day set. The list walks every vocabulary
 * across all twelve roots, so every target word is present.
 */
function allCombos(group: GroupSpec): Combo[] {
  const result: Combo[] = [];
  const total = group.vocabulary.length * ROOTS.length;
  for (let index = 0; index < total; index += 1) {
    const vocabulary = index % group.vocabulary.length;
    const root = ROOTS[Math.floor(index / group.vocabulary.length) % ROOTS.length]!;
    result.push({ root, vocabulary });
  }
  return result;
}

const LV8_COMBOS = new Map<string, { sameDay: Combo[]; delay: Combo[] }>(LV8_GROUPS.map((group) => {
  const combos = allCombos(group);
  // P23-56: the first 12 of the P23-45 same-day pairs and the first 6 delayed pairs (same ids, same chords).
  return [group.id, { sameDay: combos.slice(0, 12), delay: combos.slice(20, 26) }];
}));

function nameItem(group: GroupSpec, combo: Combo, block: AdvancedBlock, index: number): AdvancedItem {
  const vocabulary = group.vocabulary[combo.vocabulary]!;
  const chord = makeChord({ root: combo.root, quality: vocabulary.quality, ...(vocabulary.rootless === true ? { rootless: true } : {}) });
  return makeItem({
    id: `lv8-${group.id}-${block === "sameDay" ? "name" : "dl"}-${String(index + 1).padStart(2, "0")}`,
    level: 8,
    block,
    setId: group.id,
    kind: "vocab",
    part: `${group.id}:${block === "sameDay" ? "name" : "delay"}`,
    group: group.id,
    label: chord.label,
    detail: group.label,
    chords: [chord],
    revealCards: true,
    allowedPlaybacks: 0,
  });
}

function earItem(group: GroupSpec, index: number): AdvancedItem {
  const vocabulary = group.vocabulary[(index + 2) % group.vocabulary.length]!;
  const root = ROOTS[(index + 4) % ROOTS.length]!;
  const chord = makeChord({ root, quality: vocabulary.quality, ...(vocabulary.rootless === true ? { rootless: true } : {}) });
  return makeItem({
    id: `lv8-${group.id}-ear-${String(index + 1).padStart(2, "0")}`,
    level: 8,
    block: "sameDay",
    setId: group.id,
    kind: "vocab",
    part: `${group.id}:ear`,
    group: group.id,
    prompt: "ear",
    label: `根音 ${NOTE_NAMES[root]}・${group.label}`,
    detail: "聴いて、同じ響きの和音を弾く",
    chords: [chord],
    revealCards: false,
    allowedPlaybacks: 2,
  });
}

/**
 * P23-56: recolour questions. Each one names the plain progression and asks for the coloured one; every
 * chord is judged by the normal leniency (the colour tone is required). The example is voice-led, so the
 * learner hears a progression a song would use, not single chords in a row.
 */
type Colour = readonly [number, ChordQuality, boolean?];

interface RecolourSpec {
  readonly key: number;
  /** The plain progression, as written under the question (and played by 「元の進行を聴く」). */
  readonly plain: string;
  /** [root, quality, rootless] per chord. */
  readonly chords: readonly Colour[];
}

const RECOLOUR: Readonly<Record<string, { readonly sameDay: readonly RecolourSpec[]; readonly delay: readonly RecolourSpec[] }>> = {
  six: {
    sameDay: [
      { key: 0, plain: "C → F → G → C", chords: [[0, "add9"], [5, "six"], [7, "sus4"], [0, "maj"]] },
      { key: 7, plain: "G → C → D → G", chords: [[7, "six"], [0, "add9"], [2, "sus4"], [7, "maj"]] },
      { key: 5, plain: "F → Dm → B♭ → C", chords: [[5, "add9"], [2, "min"], [10, "six"], [0, "sus4"]] },
      { key: 2, plain: "D → A → Bm → G", chords: [[2, "sus2"], [9, "maj"], [11, "min"], [7, "add9"]] },
    ],
    delay: [
      { key: 3, plain: "E♭ → A♭ → B♭ → E♭", chords: [[3, "add9"], [8, "six"], [10, "sus4"], [3, "maj"]] },
      { key: 9, plain: "A → D → E → A", chords: [[9, "six"], [2, "add9"], [4, "sus4"], [9, "maj"]] },
      { key: 10, plain: "B♭ → Gm → E♭ → F", chords: [[10, "sus2"], [7, "min"], [3, "six"], [5, "sus4"]] },
    ],
  },
  nine: {
    sameDay: [
      { key: 0, plain: "Dm7 → G7 → Cmaj7", chords: [[2, "min9"], [7, "dom9"], [0, "maj9"]] },
      { key: 5, plain: "Gm7 → C7 → Fmaj7", chords: [[7, "min9"], [0, "dom9"], [5, "maj9"]] },
      { key: 3, plain: "Fm7 → B♭7 → E♭maj7 → Cm7", chords: [[5, "min9"], [10, "dom9"], [3, "maj9"], [0, "min9"]] },
      { key: 7, plain: "Cmaj7 → D7 → Bm7 → Em7", chords: [[0, "maj9"], [2, "dom9"], [11, "min7"], [4, "min9"]] },
    ],
    delay: [
      { key: 10, plain: "Cm7 → F7 → B♭maj7", chords: [[0, "min9"], [5, "dom9"], [10, "maj9"]] },
      { key: 2, plain: "Em7 → A7 → Dmaj7", chords: [[4, "min9"], [9, "dom9"], [2, "maj9"]] },
      { key: 8, plain: "D♭maj7 → E♭7 → Cm7 → Fm7", chords: [[1, "maj9"], [3, "dom9"], [0, "min7"], [5, "min9"]] },
    ],
  },
  thirteen: {
    sameDay: [
      { key: 0, plain: "Dm7 → G7 → Cmaj7", chords: [[2, "min9"], [7, "dom13"], [0, "maj9"]] },
      { key: 5, plain: "Gm7 → C7 → Fmaj7", chords: [[7, "min9", true], [0, "dom13", true], [5, "maj9", true]] },
      { key: 10, plain: "Cm7 → F7 → B♭maj7", chords: [[0, "min9"], [5, "dom13"], [10, "maj9"]] },
      { key: 3, plain: "Fm7 → B♭7 → E♭maj7", chords: [[5, "min9", true], [10, "dom9", true], [3, "maj9", true]] },
    ],
    delay: [
      { key: 7, plain: "Am7 → D7 → Gmaj7", chords: [[9, "min9"], [2, "dom13"], [7, "maj9"]] },
      { key: 2, plain: "Em7 → A7 → Dmaj7", chords: [[4, "min9", true], [9, "dom13", true], [2, "maj9", true]] },
      { key: 9, plain: "Bm7 → E7 → Amaj7", chords: [[11, "min9"], [4, "dom13", true], [9, "maj9"]] },
    ],
  },
};

const PLAIN_QUALITY: Readonly<Record<string, ChordQuality>> = { "": "maj", m: "min", m7: "min7", "7": "dom7", maj7: "maj7" };

/** A plain chord name of the recolour table (C, Dm, Dm7, G7, Cmaj7, B♭, E♭maj7) as a chord. */
function plainChord(name: string): ReturnType<typeof makeChord> {
  const match = /^([A-G][♭#]?)(.*)$/.exec(name)!;
  const root = NOTE_NAMES.indexOf(match[1] as (typeof NOTE_NAMES)[number]);
  const quality = PLAIN_QUALITY[match[2]!];
  if (root < 0 || quality === undefined) throw new Error(`P23-56: unknown plain chord ${name}`);
  return makeChord({ root, quality });
}

function recolourItem(group: GroupSpec, spec: RecolourSpec, block: AdvancedBlock, index: number): AdvancedItem {
  const chords = voiceLed(spec.chords.map(([root, quality, rootless]) => makeChord({ root, quality, ...(rootless === true ? { rootless: true } : {}) })));
  return makeItem({
    plainChords: voiceLed(spec.plain.split(" → ").map(plainChord)),
    id: `lv8-${group.id}-${block === "sameDay" ? "ctx" : "dctx"}-${String(index + 1).padStart(2, "0")}`,
    level: 8,
    block,
    setId: group.id,
    kind: "progression",
    part: `${group.id}:${block === "sameDay" ? "context" : "delay-context"}`,
    group: group.id,
    keyRoot: spec.key,
    label: chords.map((chord) => chord.label).join(" → "),
    detail: `元の進行 ${spec.plain}。響きを足して弾く`,
    chords,
    revealCards: true,
    allowedPlaybacks: 0,
  });
}

/** Per group: 12 names, then 4 recolours, then 6 ear questions (a recolour every three names would break the rhythm of the names). */
export const LV8_SAME_DAY: readonly AdvancedItem[] = LV8_GROUPS.flatMap((group) => [
  ...LV8_COMBOS.get(group.id)!.sameDay.map((combo, index) => nameItem(group, combo, "sameDay", index)),
  ...RECOLOUR[group.id]!.sameDay.map((spec, index) => recolourItem(group, spec, "sameDay", index)),
  ...Array.from({ length: 6 }, (_, index) => earItem(group, index)),
]);

export const LV8_DELAY: readonly AdvancedItem[] = LV8_GROUPS.flatMap((group) => [
  ...LV8_COMBOS.get(group.id)!.delay.map((combo, index) => nameItem(group, combo, "delay", index)),
  ...RECOLOUR[group.id]!.delay.map((spec, index) => recolourItem(group, spec, "delay", index)),
]);

export const LV8_ITEMS: readonly AdvancedItem[] = [...LV8_SAME_DAY, ...LV8_DELAY];

/** The authored combinations, exported for the material tests. */
export function lv8NameCombos(group: string, block: AdvancedBlock): readonly Combo[] {
  return block === "sameDay" ? LV8_COMBOS.get(group)!.sameDay : LV8_COMBOS.get(group)!.delay;
}

export function lv8GroupItems(group: string, block: AdvancedBlock): readonly AdvancedItem[] {
  return LV8_ITEMS.filter((item) => item.group === group && item.block === block);
}

export function lv8GroupSameDayIds(group: string): readonly string[] {
  return LV8_SAME_DAY.filter((item) => item.group === group).map((entry) => entry.id);
}

export function lv8GroupDelayIds(group: string): readonly string[] {
  return LV8_DELAY.filter((item) => item.group === group).map((entry) => entry.id);
}

/** Group order for the level's progress display, with the vocabulary it covers. */
export const LV8_GROUP_SUMMARY = LV8_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  vocabulary: group.vocabulary.map(qualityName),
}));

/**
 * Borrowed / secondary-dominant / backdoor examples (practice only). They are not part of the 20/10/10
 * formal sets; the point is the short real-world context named by P23-45.
 */
export const LV8_EXAMPLES: readonly AdvancedItem[] = [
  makeItem({
    id: "lv8-example-borrowed",
    level: 8,
    block: "sameDay",
    setId: "demo",
    kind: "progression",
    part: "demo",
    group: "six",
    label: "A♭ → B♭ → Cmaj7（借用和音）",
    detail: "長調に bVI・bVII を借りる",
    chords: voiceLed([
      makeChord({ root: 8, quality: "maj" }),
      makeChord({ root: 10, quality: "maj" }),
      makeChord({ root: 0, quality: "maj7" }),
    ]),
    revealCards: true,
    allowedPlaybacks: 0,
  }),
  makeItem({
    id: "lv8-example-secondary",
    level: 8,
    block: "sameDay",
    setId: "demo",
    kind: "progression",
    part: "demo",
    group: "nine",
    label: "D7 → G7 → Cmaj7（セカンダリードミナント）",
    detail: "V/V から V へ進む",
    chords: voiceLed([
      makeChord({ root: 2, quality: "dom7" }),
      makeChord({ root: 7, quality: "dom7" }),
      makeChord({ root: 0, quality: "maj7" }),
    ]),
    revealCards: true,
    allowedPlaybacks: 0,
  }),
  makeItem({
    id: "lv8-example-backdoor",
    level: 8,
    block: "sameDay",
    setId: "demo",
    kind: "progression",
    part: "demo",
    group: "thirteen",
    label: "Fm7 → B♭7 → Cmaj7（バックドア）",
    detail: "IVm7 から bVII7 で I へ戻る",
    chords: voiceLed([
      makeChord({ root: 5, quality: "min7" }),
      makeChord({ root: 10, quality: "dom7" }),
      makeChord({ root: 0, quality: "maj7" }),
    ]),
    revealCards: true,
    allowedPlaybacks: 0,
  }),
];
