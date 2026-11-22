import { chordPitchClasses } from "../domain/chordVoicing";
import { symbol, type Quality } from "../domain/chordDojo/recipes";
import { buildPracticeChordRequirements } from "../domain/practice/chordRequirements";

/**
 * P23-39 §3 (v2): the frozen Lv1–3 bank, the item sets for the same-day / delayed / ear blocks, and the
 * pass policy — one version pair. v1 was rejected in review for three material/scoring inconsistencies:
 * - Lv2 declared six roots but the bank only contained five (C/G/F/A/D), and the Lv2 ear 10/8 block was
 *   missing from the policy.
 * - The same-day and delayed "different problem" rule ("different cell") could not be satisfied by Lv1
 *   (its 20 same-day questions use all 12 cells), and no real delayed set existed in the bank.
 * - The name-recall policy required the source voicing's bass, which contradicts the approved design
 *   (required tones, inversion allowed, bass free when unspecified).
 *
 * v2 fixes these by *materialising* the sets: every same-day, delayed and ear question is an actual item
 * in this bank with a stable id, and the delayed set is disjoint from the same-day set by item id. Where a
 * level has no spare cells (Lv1/Lv3) the delayed set shares cells but uses a different authored placement;
 * "different order" alone is never treated as a different problem. The ear block is same-day only (the
 * approved design has no delayed-ear pass condition), and its items are synthetic single-chord prompts.
 *
 * The numeric inconsistency of the original Lv3 draft — 24 questions with four per quality cannot satisfy
 * "80% per quality" except by 4/4, which contradicts the overall 22/24 — stays resolved as 30 questions,
 * 27/30 overall and 4/5 per quality (80%). The old 24/22 is recorded as superseded, never rounded.
 */
export const CONTRACT_VERSION = "p23-39.contracts.v3";
export const POLICY_VERSION = "p23-39.policy.lv1-3.v3";
export const BANK_VERSION = "p23-39.bank.lv1-3.v3";
export const PAIR_ID = `${BANK_VERSION}+${POLICY_VERSION}`;

/** The delayed confirmation must start on a later local calendar day and at least 12 h after the same-day block. */
export const MIN_DELAY_MS = 12 * 60 * 60 * 1000;

export type Level = 1 | 2 | 3;
export const QUALITY_POOL = ["maj", "min", "maj7", "min7", "dom7", "min7b5"] as const;
export type CourseQuality = (typeof QUALITY_POOL)[number];
export const ROOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

/** The approved design: Lv1/Lv2 start from six roots (C/G/F/A/D/E); Lv3 covers all twelve. */
export const LEVEL_ROOTS: Record<Level, readonly number[]> = {
  1: [0, 7, 5, 9, 2, 4],
  2: [0, 7, 5, 9, 2, 4],
  3: ROOTS,
};

export const LEVEL_QUALITIES: Record<Level, readonly CourseQuality[]> = {
  1: ["maj", "min"],
  2: ["maj7", "min7", "dom7", "min7b5"],
  3: QUALITY_POOL,
};

export type Placement = "root" | "inv1" | "inv2" | "inv3";
export type Prompt = "name" | "ear";
export type BassPolicy = "free" | "root";

export interface EarPrompt {
  /** Lv1 asks major/minor as a displayed two-choice question; Lv2 identifies the seventh quality. */
  readonly kind: "two-choice" | "identify";
  readonly choices: readonly CourseQuality[];
  readonly choiceDisplayed: boolean;
  readonly playbacks: 1;
  readonly rootPresented: true;
  readonly bass: "root";
}

export interface BankItem {
  readonly id: string;
  readonly level: Level;
  readonly prompt: Prompt;
  readonly quality: CourseQuality;
  readonly root: number;
  /** The (quality, root) cell. */
  readonly cell: string;
  /** The authored reference voicing variant (model display / ear playback). */
  readonly placement: Placement;
  readonly referenceNotes: readonly number[];
  /** The product's `normal` leniency: root + 3rd required, 5th optional, 7th/b5 required when present. */
  readonly requiredPitchClasses: readonly number[];
  readonly allowedPitchClasses: readonly number[];
  readonly bass: BassPolicy;
  readonly judge: "core";
  readonly source: "synthetic-public";
  readonly family: string;
  readonly ear?: EarPrompt;
}

export interface SetDifferentiation {
  /** `shared`: the delayed set repeats cells; `distinct-where-available`: some spare cells are used. */
  readonly cells: "shared" | "distinct" | "distinct-where-available";
  readonly items: "disjoint";
  readonly placement: "distinct";
  readonly order: "independent";
  readonly sharedCells: number;
  readonly distinctCells: number;
  readonly rule: string;
}

export interface SetPair {
  /** Same-day presentation order (seeded); membership is fixed by the frozen cell/placement assignment. */
  readonly sameDay: readonly string[];
  /** Delayed presentation order. Disjoint from `sameDay` by item id. */
  readonly delay: readonly string[];
  readonly required: { readonly sameDay: number; readonly delay: number };
  readonly differentiation: SetDifferentiation;
}

export interface FrozenSet {
  readonly items: readonly string[];
  readonly required: number;
}

export interface LevelSets {
  readonly name: SetPair;
  readonly ear?: FrozenSet;
}

export type BankSets = Record<Level, LevelSets>;

const LEVEL_1_ROOTS = LEVEL_ROOTS[1];
const LEVEL_2_ROOTS = LEVEL_ROOTS[2];

export interface LvPolicy {
  readonly questions: number;
  readonly pass: number;
  readonly perQuality?: { readonly min: number; readonly of: number };
  readonly roots: number;
  readonly delay: { readonly questions: number; readonly pass: number };
  readonly speed?: { readonly limitMs: number; readonly ofCorrect: number };
  readonly ear?: { readonly questions: number; readonly pass: number };
}

export const POLICY = {
  version: POLICY_VERSION,
  bankVersion: BANK_VERSION,
  contractVersion: CONTRACT_VERSION,
  pairId: PAIR_ID,
  levels: {
    1: { questions: 20, pass: 18, roots: 6, delay: { questions: 10, pass: 8 }, ear: { questions: 10, pass: 8 } },
    2: { questions: 20, pass: 18, perQuality: { min: 4, of: 5 }, roots: 6, delay: { questions: 10, pass: 8 }, ear: { questions: 10, pass: 8 } },
    3: { questions: 30, pass: 27, perQuality: { min: 4, of: 5 }, roots: 12, speed: { limitMs: 3000, ofCorrect: 0.8 }, delay: { questions: 12, pass: 10 } },
  } satisfies Record<Level, LvPolicy>,
  // The original draft's Lv3 numbers are superseded; the reason is recorded, not silently rounded.
  superseded: {
    lv3: { questions: 24, pass: 22, perQuality: "4 per quality would need 4/4 for 80%, contradicting 22/24" },
    v1: {
      pairId: "p23-39.bank.lv1-3.v1+p23-39.policy.lv1-3.v1",
      lv2Roots: 5,
      lv2Ear: "missing from the policy",
      delaySets: "named in prose only; no frozen items",
      nameRecallBass: "required the source voicing's bass",
    },
    v2: {
      pairId: "p23-39.bank.lv1-3.v2+p23-39.policy.lv1-3.v2",
      lv2Ear: "first ten cells: maj7 6, min7 4, dom7 0, min7b5 0 (did not cover all qualities)",
      lv3Delay: "first twelve cells: maj 5, min 5, maj7 2, min7/dom7/min7b5 0 (did not cover all qualities)",
      delayDate: "evaluateLevel did not check 'next day and >= 12 h'; no timestamps in the evidence",
      lv1Ear: "maj 6 / min 4; no frozen quality balance (both qualities were present)",
    },
  },
  rules: {
    pass: "official pass requires the exact frozen same-day set (20/20 or 30/30 evaluated, no repeats), every quality block complete at of=5 with >= min, every level root covered, the exact delayed set (10/10 or 12/12) with >= pass, the ear set where the level has one, the delayed-date rule, and the Lv3 speed ratio; invalid trials are excluded and must be re-tried",
    independent: "a correct result counts toward the official pass only when it is MIDI-confirmed and not hint-assisted; self-confirmation is a separate progress track and never a formal pass",
    speed: "only the Lv3 name-recall level; 80% of independent-correct attempts must have a recorded completionAt - armedAt <= 3000 ms; missing speed counts as not within the limit; invalid trials are excluded",
    delay: "the delayed block must start on a later local calendar day than the same-day block's completion and at least 12 h after it; a missing timestamp, the same day, less than 12 h, or a delayed time before the same-day completion is not eligible; the delayed set is a frozen, disjoint item set; where a level has no spare cells the same cell reappears with a different authored placement; order alone is never a different problem",
    hint: "an audition/name hint or an ear replay marks the trial assisted; it counts as practice progress, never as an independent confirmation",
    selfCheck: "MIDI confirmation and self-confirmation are stored as different evidence; self-confirmation never promotes to MIDI-verified",
    duplicate: "an item id never repeats inside a same-day or delayed set; the frozen sets are disjoint by construction and a same-day repeat cannot add coverage",
    invalid: "disconnected / prepare-failed / clock-jump / capability / stall / hidden trials are excluded from every denominator, recorded with their reason, and re-tried",
    noInput: "no captured notes within the response timeout (10000 ms) is an attempt with result no-input, never a wrong answer or a device-invalid",
  },
  answerPolicy: {
    nameRecall: "the quality's required tones under the product 'normal' leniency, with the P23-47-fix-2 triad rule: Lv1/Lv3 major and minor triads require root+3rd+5th; maj7/min7/dom7 require the 7th and keep the 5th optional; min7b5 requires b5. An unspecified bass is free and any inversion is accepted; a bass is enforced only when the item specifies one; never a single fixed MIDI set",
    savedVoicing: "the authored notes are the gold: same notes, same octaves, same doubling; no theory-derived additions; this is a separate policy from name recall",
    ear: "accepted harmony (the same required tones) + the item's specified bass (root); exact voicing is not required; one playback, and a replay marks the trial assisted",
  },
} as const;

type Cell = { readonly quality: CourseQuality; readonly root: number };

function level1Cells(): Cell[] {
  const cells: Cell[] = [];
  for (const root of LEVEL_1_ROOTS) for (const quality of LEVEL_QUALITIES[1]) cells.push({ quality, root });
  return cells;
}

function level2Cells(): Cell[] {
  const cells: Cell[] = [];
  for (const [qualityIndex, quality] of LEVEL_QUALITIES[2].entries()) {
    for (let k = 0; k < 6; k += 1) cells.push({ quality, root: LEVEL_2_ROOTS[(qualityIndex + k) % LEVEL_2_ROOTS.length]! });
  }
  return cells;
}

function level3Cells(): Cell[] {
  const cells: Cell[] = [];
  for (const [qualityIndex, quality] of QUALITY_POOL.entries()) {
    for (let k = 0; k < 5; k += 1) cells.push({ quality, root: (qualityIndex * 5 + k) % 12 });
  }
  return cells;
}

function nameCells(level: Level): Cell[] {
  return level === 1 ? level1Cells() : level === 2 ? level2Cells() : level3Cells();
}

function pitchClass(value: number): number {
  return ((Math.trunc(value) % 12) + 12) % 12;
}

/** The root-position close voicing: the root is the lowest note, the tones ascend inside one octave. */
function rootPositionVoicing(root: number, quality: CourseQuality): number[] {
  const rootPc = pitchClass(root);
  const tones = [...new Set(chordPitchClasses(symbol(root, quality as Quality)).map(pitchClass))].sort((a, b) => a - b);
  // Ascending from the root, wrapping past the octave: e.g. G -> G, B, D (not D, G, B).
  const fromRoot = [...tones.filter((tone) => tone >= rootPc), ...tones.filter((tone) => tone < rootPc)];
  const notes: number[] = [];
  for (const tone of fromRoot) {
    let note = 48 + tone;
    while (notes.length > 0 && note <= notes[notes.length - 1]!) note += 12;
    notes.push(note);
  }
  return notes;
}

/**
 * Close-position voicing. `rotation` 0 is the root position; each step moves the current lowest note up an
 * octave, so 1..3 are the inversions. The authored model/ear playback uses these notes.
 */
export function closeVoicing(root: number, quality: CourseQuality, rotation: number): number[] {
  const notes = rootPositionVoicing(root, quality);
  const r = ((rotation % notes.length) + notes.length) % notes.length;
  const inverted = [...notes];
  for (let index = 0; index < r; index += 1) inverted[index] = inverted[index]! + 12;
  return inverted.sort((left, right) => left - right);
}

const PLACEMENTS: readonly Placement[] = ["root", "inv1", "inv2", "inv3"];

function makeItem(level: Level, prompt: Prompt, cell: Cell, rotation: number, index: number): BankItem {
  const chord = symbol(cell.root, cell.quality as Quality);
  const requirements = buildPracticeChordRequirements(chord, "normal");
  // P23-47-fix-2: Lv1/Lv3 major and minor triads require the fifth as well as the third, so A-C alone
  // is not a finished answer. Seventh chords keep the normal leniency (the fifth stays optional).
  const triad = (level === 1 || level === 3) && (cell.quality === "maj" || cell.quality === "min");
  const requiredPitchClasses = triad
    ? [...chordPitchClasses(chord)].sort((left, right) => left - right)
    : requirements.requiredPitchClasses;
  const referenceNotes = closeVoicing(cell.root, cell.quality, rotation);
  const ear: EarPrompt | undefined = prompt === "ear"
    ? {
      kind: level === 1 ? "two-choice" : "identify",
      choices: level === 1 ? ["maj", "min"] : [...LEVEL_QUALITIES[2]],
      choiceDisplayed: level === 1,
      playbacks: 1,
      rootPresented: true,
      bass: "root",
    }
    : undefined;
  return {
    id: `lv${level}-${prompt === "name" ? "n" : "e"}-${String(index + 1).padStart(3, "0")}`,
    level,
    prompt,
    quality: cell.quality,
    root: cell.root,
    cell: `${cell.quality}@${cell.root}`,
    placement: PLACEMENTS[rotation % PLACEMENTS.length]!,
    referenceNotes,
    requiredPitchClasses,
    allowedPitchClasses: requirements.allowedPitchClasses,
    bass: prompt === "ear" ? "root" : "free",
    judge: "core",
    source: "synthetic-public",
    family: `${cell.quality}@${cell.root}`,
    ...(ear === undefined ? {} : { ear }),
  };
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function shuffle<T>(values: readonly T[], seed: number): T[] {
  const out = [...values];
  const next = lcg(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const left = out[i]!;
    out[i] = out[j]!;
    out[j] = left;
  }
  return out;
}

function cellKey(cell: Cell): string {
  return `${cell.quality}@${cell.root}`;
}

function setPair(
  sameDayItems: readonly BankItem[],
  delayItems: readonly BankItem[],
  seed: number,
  rule: string,
  required: { readonly sameDay: number; readonly delay: number },
): SetPair {
  const sameDayCells = new Set(sameDayItems.map((item) => item.cell));
  const delayCells = new Set(delayItems.map((item) => item.cell));
  const sharedCells = [...delayCells].filter((cell) => sameDayCells.has(cell)).length;
  const distinctCells = delayCells.size - sharedCells;
  return {
    sameDay: shuffle(sameDayItems.map((item) => item.id), seed),
    delay: shuffle(delayItems.map((item) => item.id), seed ^ 0x5bf03635),
    required,
    differentiation: {
      cells: distinctCells === 0 ? "shared" : sharedCells === 0 ? "distinct" : "distinct-where-available",
      items: "disjoint",
      placement: "distinct",
      order: "independent",
      sharedCells,
      distinctCells,
      rule,
    },
  };
}

export interface Bank {
  readonly version: string;
  readonly policyVersion: string;
  readonly contractVersion: string;
  readonly pairId: string;
  readonly seed: number;
  readonly items: readonly BankItem[];
  readonly order: readonly string[];
  readonly sets: BankSets;
  readonly counts: {
    readonly total: number;
    readonly byLevel: readonly { readonly level: Level; readonly count: number; readonly name: number; readonly ear: number }[];
    readonly byQuality: readonly { readonly quality: CourseQuality; readonly count: number }[];
    readonly byRoot: readonly { readonly root: number; readonly count: number }[];
  };
}

export function buildBank(seed = 2338): Bank {
  const items: BankItem[] = [];
  // A single counter keeps every variant id unique (the v1 draft reused the pre-push length).
  let nextId = 0;
  const create = (level: Level, prompt: Prompt, cell: Cell, rotation: number) => makeItem(level, prompt, cell, rotation, nextId++);

  // Lv1 name: 12 cells x 3 placements = 36 items. Same-day 20 = 8 cells x 2 + 4 cells x 1.
  const l1 = nameCells(1);
  const l1Index = new Map<string, BankItem[]>();
  for (const cell of l1) {
    const variants = [0, 1, 2].map((rotation) => create(1, "name", cell, rotation));
    variants.forEach((item) => items.push(item));
    l1Index.set(cellKey(cell), variants);
  }
  const l1SameDay = [
    ...l1.slice(0, 8).flatMap((cell) => [l1Index.get(cellKey(cell))![0]!, l1Index.get(cellKey(cell))![1]!]),
    ...l1.slice(8).map((cell) => l1Index.get(cellKey(cell))![0]!),
  ];
  const l1Delay = [
    ...l1.slice(0, 8).map((cell) => l1Index.get(cellKey(cell))![2]!),
    ...l1.slice(8, 10).map((cell) => l1Index.get(cellKey(cell))![1]!),
  ];

  // Lv2 name: 24 cells (4 qualities x 6 roots). Same-day 20 = five roots per quality; the sixth root of
  // each quality is the spare cell used by the delayed set, plus six second placements on same-day cells.
  const l2 = nameCells(2);
  const l2Index = new Map<string, BankItem[]>();
  for (const cell of l2) {
    const item = create(2, "name", cell, 0);
    items.push(item);
    l2Index.set(cellKey(cell), [item]);
  }
  const l2AlternateCells = [0, 1, 6, 7, 12, 18].map((index) => l2[index]!);
  for (const cell of l2AlternateCells) {
    const alternate = create(2, "name", cell, 1);
    items.push(alternate);
    l2Index.get(cellKey(cell))!.push(alternate);
  }
  const l2SameDay = l2.filter((_, index) => index % 6 !== 5).map((cell) => l2Index.get(cellKey(cell))![0]!);
  const l2Spare = l2.filter((_, index) => index % 6 === 5).map((cell) => l2Index.get(cellKey(cell))![0]!);
  const l2Delay = [...l2Spare, ...l2AlternateCells.map((cell) => l2Index.get(cellKey(cell))![1]!)];

  // Lv3 name: 30 cells x 2 placements = 60 items. Same-day 30 = one per cell; delayed 12 = second
  // placements on the first twelve cells.
  const l3 = nameCells(3);
  const l3Index = new Map<string, BankItem[]>();
  for (const cell of l3) {
    const variants = [0, 1].map((rotation) => create(3, "name", cell, rotation));
    variants.forEach((item) => items.push(item));
    l3Index.set(cellKey(cell), variants);
  }
  const l3SameDay = l3.map((cell) => l3Index.get(cellKey(cell))![0]!);
  // Delayed Lv3: two per quality (6 x 2 = 12) so every quality is re-checked on the later day.
  const l3Delay = QUALITY_POOL.flatMap((quality, qualityIndex) =>
    [0, 1].map((offset) => l3Index.get(cellKey({ quality, root: (qualityIndex * 5 + offset) % 12 }))![1]!),
  );

  // Ear items: synthetic single-chord prompts (root presented, root position). Lv1 = 12 cells, Lv2 = 24
  // cells. The ear block is same-day only, so it needs no delayed set and only one placement per cell.
  const ear1 = level1Cells();
  const e1Index = new Map<string, BankItem>();
  for (const cell of ear1) {
    const item = create(1, "ear", cell, 0);
    items.push(item);
    e1Index.set(cellKey(cell), item);
  }
  // The Lv1 ear set balances the two qualities (5 maj / 5 min) across all six roots.
  const e1SameDayCells = [
    ...[0, 7, 5, 9, 2].map((root) => ear1.find((cell) => cell.quality === "maj" && cell.root === root)!),
    ...[0, 7, 5, 9, 4].map((root) => ear1.find((cell) => cell.quality === "min" && cell.root === root)!),
  ];
  const e1SameDay = e1SameDayCells.map((cell) => e1Index.get(cellKey(cell))!);

  const ear2 = level2Cells();
  const e2Index = new Map<string, BankItem>();
  for (const cell of ear2) {
    const item = create(2, "ear", cell, 0);
    items.push(item);
    e2Index.set(cellKey(cell), item);
  }
  // Lv2 ear: all four qualities (3 maj7 / 3 min7 / 2 dom7 / 2 min7b5) and all six roots.
  const e2SameDayCells = [
    ...[{ quality: "maj7" as const, roots: [0, 7, 5] }],
    ...[{ quality: "min7" as const, roots: [9, 2, 4] }],
    ...[{ quality: "dom7" as const, roots: [0, 9] }],
    ...[{ quality: "min7b5" as const, roots: [5, 2] }],
  ].flatMap((entry) => entry.roots.map((root) => ({ quality: entry.quality, root })));
  const e2SameDay = e2SameDayCells.map((cell) => e2Index.get(cellKey(cell))!);

  const sets: BankSets = {
    1: {
      name: setPair(
        l1SameDay,
        l1Delay,
        seed ^ 0x11,
        "別日の10問は同日の20問と item が重ならない。12 cell を同日で全部使うため「別cell」は成立しない。同じ cell では authored placement を変える。「別順序」だけでは別問題とみなさない。",
        { sameDay: POLICY.levels[1].questions, delay: POLICY.levels[1].delay.questions },
      ),
      ear: { items: shuffle(e1SameDay.map((item) => item.id), seed ^ 0x12), required: POLICY.levels[1].ear!.questions },
    },
    2: {
      name: setPair(
        l2SameDay,
        l2Delay,
        seed ^ 0x21,
        "遅延の10問は item が重ならず、4 cell は同日に未使用の cell。残り6 cell は同日と共有するが placement が違う。",
        { sameDay: POLICY.levels[2].questions, delay: POLICY.levels[2].delay.questions },
      ),
      ear: { items: shuffle(e2SameDay.map((item) => item.id), seed ^ 0x22), required: POLICY.levels[2].ear!.questions },
    },
    3: {
      name: setPair(
        l3SameDay,
        l3Delay,
        seed ^ 0x31,
        "同日30問で30 cell を全部使うため「別cell」は成立しない。遅延12問は別 item・別 placement。",
        { sameDay: POLICY.levels[3].questions, delay: POLICY.levels[3].delay.questions },
      ),
    },
  };

  const byLevel = [1, 2, 3].map((level) => ({
    level: level as Level,
    count: items.filter((item) => item.level === level).length,
    name: items.filter((item) => item.level === level && item.prompt === "name").length,
    ear: items.filter((item) => item.level === level && item.prompt === "ear").length,
  }));

  return {
    version: BANK_VERSION,
    policyVersion: POLICY_VERSION,
    contractVersion: CONTRACT_VERSION,
    pairId: PAIR_ID,
    seed,
    items,
    order: shuffle(items.map((item) => item.id), seed ^ 0x9e3779b9),
    sets,
    counts: {
      total: items.length,
      byLevel,
      byQuality: QUALITY_POOL.map((quality) => ({ quality, count: items.filter((item) => item.quality === quality).length })),
      byRoot: ROOTS.map((root) => ({ root, count: items.filter((item) => item.root === root).length })),
    },
  };
}

export type TrialResult = "correct" | "wrong" | "incomplete" | "no-input" | "invalid";

export interface TrialEvidence {
  readonly itemId: string;
  readonly result: TrialResult;
  readonly speedMs?: number;
  readonly hintUsed?: boolean;
  readonly selfConfirmed?: boolean;
  readonly midiConfirmed?: boolean;
  /** ISO 8601 seal time. Required for the official pass: the delayed-date rule is computed from it. */
  readonly at?: string;
}

export interface DelayEligibility {
  readonly eligible: boolean;
  readonly reason?: string;
  readonly elapsedMs?: number;
  readonly sameLocalDate?: boolean;
}

export interface DelayDates {
  readonly sameDayCompletedAt?: string;
  readonly delayedStartedAt?: string;
  readonly delayedCompletedAt?: string;
  readonly elapsedMs?: number;
  readonly sameLocalDate: boolean;
  readonly eligible: boolean;
  readonly reason?: string;
}

/** The local calendar day (the same day the course's `dateKey` uses), not the UTC day. */
export function localDateKey(iso: string): string | undefined {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return undefined;
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * The frozen delayed-confirmation rule: the delayed block must *start* on a later local calendar day than
 * the same-day block's completion and at least 12 hours after it. A missing timestamp is never eligible,
 * the same day is never eligible, and a backwards time is never eligible. There is no additional review
 * feature and no real-time wait: the caller passes the recorded times.
 */
export function delayEligibility(sameDayCompletedAt: string | undefined, delayedStartedAt: string | undefined): DelayEligibility {
  if (!sameDayCompletedAt || !delayedStartedAt) return { eligible: false, reason: "時刻がありません", sameLocalDate: false };
  const sameDay = Date.parse(sameDayCompletedAt);
  const delayed = Date.parse(delayedStartedAt);
  if (!Number.isFinite(sameDay) || !Number.isFinite(delayed)) return { eligible: false, reason: "時刻を読めません", sameLocalDate: false };
  if (delayed <= sameDay) return { eligible: false, reason: "遅延評価が同日評価より前です", elapsedMs: delayed - sameDay, sameLocalDate: false };
  const sameLocalDate = localDateKey(sameDayCompletedAt) === localDateKey(delayedStartedAt);
  const elapsedMs = delayed - sameDay;
  if (sameLocalDate) return { eligible: false, reason: "同じ日です", elapsedMs, sameLocalDate };
  if (elapsedMs < MIN_DELAY_MS) return { eligible: false, reason: "12 時間未満です", elapsedMs, sameLocalDate };
  return { eligible: true, elapsedMs, sameLocalDate };
}

export interface LevelEvidence {
  /** `midi` can reach a formal pass; `self` is a separate progress track and never does. */
  readonly mode: "midi" | "self";
  readonly name: readonly TrialEvidence[];
  readonly delay: readonly TrialEvidence[];
  readonly ear?: readonly TrialEvidence[];
}

export interface QualityBlockReport {
  readonly evaluated: number;
  readonly correct: number;
  readonly independentCorrect: number;
  readonly required: number;
  readonly minimum: number;
}

export interface BlockReport {
  readonly required: number;
  readonly evaluated: number;
  readonly correct: number;
  readonly independentCorrect: number;
  readonly hintAssisted: number;
  readonly selfConfirmed: number;
  readonly invalid: number;
  readonly missingItemIds: readonly string[];
  readonly unexpectedItemIds: readonly string[];
  readonly duplicateItemIds: readonly string[];
  readonly missingRoots: readonly number[];
  readonly qualityBlocks: Readonly<Record<string, QualityBlockReport>>;
}

export interface SpeedReport {
  readonly correct: number;
  readonly withinLimit: number;
  readonly missingSpeed: number;
  readonly ratio: number;
  readonly requiredRatio: number;
  readonly limitMs: number;
  readonly ok: boolean;
}

export interface LevelEvaluation {
  readonly level: Level;
  readonly mode: "midi" | "self";
  /** Complete frozen denominators + every threshold met + independent (MIDI) evidence. */
  readonly passed: boolean;
  /** Every denominator is present and exact (a formal pass still needs `mode: "midi"`). */
  readonly complete: boolean;
  readonly blocks: { readonly name: BlockReport; readonly delay: BlockReport; readonly ear?: BlockReport };
  readonly speed?: SpeedReport;
  /** The recorded times and the frozen "next day and >= 12 h" decision. */
  readonly dates: DelayDates;
  readonly reasons: readonly string[];
}

function isIndependent(trial: TrialEvidence): boolean {
  return trial.midiConfirmed === true && trial.hintUsed !== true;
}

function isCorrect(trial: TrialEvidence): boolean {
  return trial.result === "correct";
}

function blockReport(
  expectedItems: readonly BankItem[],
  trials: readonly TrialEvidence[],
  options: { readonly perQuality?: { readonly min: number; readonly of: number }; readonly roots?: readonly number[] },
): BlockReport {
  const itemById = new Map(expectedItems.map((item) => [item.id, item]));
  const expected = new Set(expectedItems.map((item) => item.id));
  const evaluated = trials.filter((trial) => trial.result !== "invalid");
  const ids = evaluated.map((trial) => trial.itemId);
  const duplicateItemIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const seen = new Set(ids);
  const missingItemIds = [...expected].filter((id) => !seen.has(id));
  const unexpectedItemIds = [...seen].filter((id) => !expected.has(id));
  const known = evaluated.filter((trial) => itemById.has(trial.itemId));
  const independentCorrect = known.filter((trial) => isIndependent(trial) && isCorrect(trial)).length;
  const qualityBlocks: Record<string, QualityBlockReport> = {};
  if (options.perQuality !== undefined) {
    for (const quality of new Set(expectedItems.map((item) => item.quality))) {
      const block = known.filter((trial) => itemById.get(trial.itemId)!.quality === quality);
      qualityBlocks[quality] = {
        evaluated: block.length,
        correct: block.filter(isCorrect).length,
        independentCorrect: block.filter((trial) => isIndependent(trial) && isCorrect(trial)).length,
        required: options.perQuality.of,
        minimum: options.perQuality.min,
      };
    }
  }
  const coveredRoots = new Set(known.map((trial) => itemById.get(trial.itemId)!.root));
  const missingRoots = (options.roots ?? []).filter((root) => !coveredRoots.has(root));
  return {
    required: expectedItems.length,
    evaluated: evaluated.length,
    correct: known.filter(isCorrect).length,
    independentCorrect,
    hintAssisted: evaluated.filter((trial) => trial.hintUsed === true).length,
    selfConfirmed: evaluated.filter((trial) => trial.selfConfirmed === true).length,
    invalid: trials.length - evaluated.length,
    missingItemIds,
    unexpectedItemIds,
    duplicateItemIds,
    missingRoots,
    qualityBlocks,
  };
}

function cachedBank(): Bank {
  return buildBank(2338);
}

/**
 * The official level evaluator. It deliberately returns `false` when any required block is missing or its
 * denominator is not the frozen one — a partial answer sheet never passes. The per-quality, root, delay,
 * ear and speed blocks are all part of the official level, not optional extra credit.
 */
export function evaluateLevel(level: Level, evidence: LevelEvidence, bank: Bank = cachedBank()): LevelEvaluation {
  const policy = POLICY.levels[level] as LvPolicy;
  const itemById = new Map(bank.items.map((item) => [item.id, item]));
  const nameIds = bank.sets[level].name.sameDay;
  const delayIds = bank.sets[level].name.delay;
  const name = blockReport(
    nameIds.map((id) => itemById.get(id)!),
    evidence.name,
    {
      ...(policy.perQuality === undefined ? {} : { perQuality: policy.perQuality }),
      roots: LEVEL_ROOTS[level],
    },
  );
  const delay = blockReport(delayIds.map((id) => itemById.get(id)!), evidence.delay, {});
  const reasons: string[] = [];

  const ear = policy.ear === undefined
    ? undefined
    : blockReport((bank.sets[level].ear?.items ?? []).map((id) => itemById.get(id)!), evidence.ear ?? [], {});
  if (policy.ear !== undefined && evidence.ear === undefined) reasons.push(`耳: ${policy.ear.questions} 問の記録がありません`);
  if (policy.ear === undefined && evidence.ear !== undefined && evidence.ear.length > 0) reasons.push("耳: このレベルに耳 block はありません");

  const complete = name.evaluated === policy.questions
    && name.missingItemIds.length === 0
    && name.unexpectedItemIds.length === 0
    && name.duplicateItemIds.length === 0
    && Object.values(name.qualityBlocks).every((block) => block.evaluated === block.required)
    && delay.evaluated === policy.delay.questions
    && delay.missingItemIds.length === 0
    && delay.unexpectedItemIds.length === 0
    && delay.duplicateItemIds.length === 0
    && (policy.ear === undefined
      ? true
      : ear !== undefined && ear.evaluated === policy.ear.questions && ear.missingItemIds.length === 0 && ear.unexpectedItemIds.length === 0 && ear.duplicateItemIds.length === 0);

  if (name.evaluated !== policy.questions) reasons.push(`記名: 評価済み ${name.evaluated}/${policy.questions} 問`);
  if (name.independentCorrect < policy.pass) reasons.push(`記名: 独立正答 ${name.independentCorrect}/${policy.questions} < ${policy.pass}`);
  if (name.missingItemIds.length > 0) reasons.push(`記名: 未実施の item が ${name.missingItemIds.length} 件`);
  if (name.unexpectedItemIds.length > 0) reasons.push(`記名: 凍結 set 外の item が ${name.unexpectedItemIds.length} 件`);
  if (name.duplicateItemIds.length > 0) reasons.push(`記名: 同じ item の重複が ${name.duplicateItemIds.length} 件`);
  if (name.missingRoots.length > 0) reasons.push(`記名: 未確認の根音 ${name.missingRoots.join(",")}`);
  for (const [quality, block] of Object.entries(name.qualityBlocks)) {
    if (block.evaluated !== block.required) reasons.push(`記名 ${quality}: ${block.evaluated}/${block.required} 問（必須 ${block.required} 問）`);
    if (block.independentCorrect < block.minimum) reasons.push(`記名 ${quality}: ${block.independentCorrect}/${block.evaluated} < ${block.minimum}/${block.required}`);
  }
  if (delay.evaluated !== policy.delay.questions) reasons.push(`遅延: 評価済み ${delay.evaluated}/${policy.delay.questions} 問`);
  if (delay.missingItemIds.length > 0) reasons.push(`遅延: 凍結 set の item が ${delay.missingItemIds.length} 件ありません`);
  if (delay.unexpectedItemIds.length > 0) reasons.push(`遅延: 凍結 set にない item が ${delay.unexpectedItemIds.length} 件あります`);
  if (delay.independentCorrect < policy.delay.pass) reasons.push(`遅延: 独立正答 ${delay.independentCorrect}/${policy.delay.questions} < ${policy.delay.pass}`);
  if (policy.ear !== undefined && ear !== undefined) {
    if (ear.evaluated !== policy.ear.questions) reasons.push(`耳: 評価済み ${ear.evaluated}/${policy.ear.questions} 問`);
    if (ear.independentCorrect < policy.ear.pass) reasons.push(`耳: 独立正答 ${ear.independentCorrect}/${policy.ear.questions} < ${policy.ear.pass}`);
  }

  let speed: SpeedReport | undefined;
  if (policy.speed !== undefined) {
    const independentCorrect = evidence.name.filter((trial) => trial.result === "correct" && isIndependent(trial));
    const withinLimit = independentCorrect.filter((trial) => trial.speedMs !== undefined && trial.speedMs <= policy.speed!.limitMs).length;
    const missingSpeed = independentCorrect.filter((trial) => trial.speedMs === undefined).length;
    const ratio = independentCorrect.length === 0 ? 0 : withinLimit / independentCorrect.length;
    speed = {
      correct: independentCorrect.length,
      withinLimit,
      missingSpeed,
      ratio,
      requiredRatio: policy.speed.ofCorrect,
      limitMs: policy.speed.limitMs,
      ok: independentCorrect.length > 0 && ratio >= policy.speed.ofCorrect,
    };
    if (!speed.ok) reasons.push(`速度: 3 秒以内 ${withinLimit}/${independentCorrect.length} (${Math.round(ratio * 100)}%) < ${Math.round(policy.speed.ofCorrect * 100)}%`);
  }

  if (evidence.mode !== "midi") reasons.push("自己確認は独立合格ではありません（別の進捗区分）");
  if (evidence.name.some((trial) => trial.hintUsed === true && trial.result === "correct")) reasons.push("ヒントありの正答は独立確認の分子に入りません");

  // The delayed-date rule is part of the official pass, not a presentation concern. A missing time can
  // never be treated as "later"; the same day or less than 12 h is not a delayed confirmation.
  const timeMs = (trial: TrialEvidence): number | undefined => {
    if (typeof trial.at !== "string") return undefined;
    const ms = Date.parse(trial.at);
    return Number.isFinite(ms) ? ms : undefined;
  };
  const evaluatedName = evidence.name.filter((trial) => trial.result !== "invalid");
  const evaluatedDelay = evidence.delay.filter((trial) => trial.result !== "invalid");
  const missingDates = [...evaluatedName, ...evaluatedDelay].some((trial) => timeMs(trial) === undefined);
  const earliest = (trials: readonly TrialEvidence[]): number | undefined => {
    const values = trials.map(timeMs).filter((value): value is number => value !== undefined);
    return values.length === 0 ? undefined : Math.min(...values);
  };
  const latest = (trials: readonly TrialEvidence[]): number | undefined => {
    const values = trials.map(timeMs).filter((value): value is number => value !== undefined);
    return values.length === 0 ? undefined : Math.max(...values);
  };
  const iso = (ms: number | undefined): string | undefined => (ms === undefined ? undefined : new Date(ms).toISOString());
  const sameDayCompletedAt = iso(latest(evaluatedName));
  const delayedStartedAt = iso(earliest(evaluatedDelay));
  const delayedCompletedAt = iso(latest(evaluatedDelay));
  const eligibility = delayEligibility(sameDayCompletedAt, delayedStartedAt);
  const dates: DelayDates = {
    ...(sameDayCompletedAt === undefined ? {} : { sameDayCompletedAt }),
    ...(delayedStartedAt === undefined ? {} : { delayedStartedAt }),
    ...(delayedCompletedAt === undefined ? {} : { delayedCompletedAt }),
    ...(eligibility.elapsedMs === undefined ? {} : { elapsedMs: eligibility.elapsedMs }),
    sameLocalDate: eligibility.sameLocalDate ?? false,
    eligible: !missingDates && eligibility.eligible,
    ...(missingDates ? { reason: "時刻がありません" } : eligibility.reason === undefined ? {} : { reason: eligibility.reason }),
  };
  if (missingDates) reasons.push("日時: 試行の時刻が欠けています");
  else if (!eligibility.eligible) reasons.push(`遅延: ${eligibility.reason}`);

  const thresholdsOk = name.independentCorrect >= policy.pass
    && name.missingRoots.length === 0
    && Object.values(name.qualityBlocks).every((block) => block.independentCorrect >= block.minimum)
    && delay.independentCorrect >= policy.delay.pass
    && (policy.ear === undefined || (ear !== undefined && ear.independentCorrect >= policy.ear.pass))
    && (speed === undefined || speed.ok)
    && dates.eligible;
  return {
    level,
    mode: evidence.mode,
    passed: evidence.mode === "midi" && complete && thresholdsOk,
    complete,
    blocks: { name, delay, ...(ear === undefined ? {} : { ear }) },
    ...(speed === undefined ? {} : { speed }),
    dates,
    reasons,
  };
}

/** The pass rule in executable form: never a partial sheet. */
export function levelPass(level: Level, evidence: LevelEvidence, bank?: Bank): boolean {
  return evaluateLevel(level, evidence, bank).passed;
}

export interface PracticeBlock {
  readonly evaluated: number;
  readonly correct: number;
  readonly required: number;
  readonly passAt: number;
}

export interface LevelPracticeProgress {
  readonly level: Level;
  readonly mode: "midi" | "self";
  /** Never a promotion. This helper exists so the UI can show partial work without calling it a pass. */
  readonly formal: false;
  readonly name: PracticeBlock;
  readonly quality: Readonly<Record<string, PracticeBlock>>;
  readonly delay: PracticeBlock;
  readonly ear?: PracticeBlock;
  readonly note: "practice only; never a promotion";
}

/**
 * Partial scoring for in-progress feedback. It counts what was played and never applies the promotion
 * rule: the official decision is `evaluateLevel` / `levelPass` only. Keeping the two apart prevents an
 * incomplete sheet (e.g. 27/30 with no quality blocks) from being shown as a pass.
 */
export function practiceProgress(level: Level, evidence: LevelEvidence, bank: Bank = cachedBank()): LevelPracticeProgress {
  const policy = POLICY.levels[level] as LvPolicy;
  const itemById = new Map(bank.items.map((item) => [item.id, item]));
  const counted = (trials: readonly TrialEvidence[]) => trials.filter((trial) => trial.result !== "invalid");
  const nameTrials = counted(evidence.name);
  const name = {
    evaluated: nameTrials.length,
    correct: nameTrials.filter(isCorrect).length,
    required: policy.questions,
    passAt: policy.pass,
  };
  const quality: Record<string, PracticeBlock> = {};
  for (const qualityName of LEVEL_QUALITIES[level]) {
    const block = nameTrials.filter((trial) => itemById.get(trial.itemId)?.quality === qualityName);
    quality[qualityName] = {
      evaluated: block.length,
      correct: block.filter(isCorrect).length,
      required: policy.perQuality?.of ?? 0,
      passAt: policy.perQuality?.min ?? 0,
    };
  }
  const delayTrials = counted(evidence.delay);
  const earTrials = evidence.ear === undefined ? undefined : counted(evidence.ear);
  return {
    level,
    mode: evidence.mode,
    formal: false,
    name,
    quality,
    delay: {
      evaluated: delayTrials.length,
      correct: delayTrials.filter(isCorrect).length,
      required: policy.delay.questions,
      passAt: policy.delay.pass,
    },
    ...(policy.ear === undefined || earTrials === undefined
      ? {}
      : { ear: { evaluated: earTrials.length, correct: earTrials.filter(isCorrect).length, required: policy.ear.questions, passAt: policy.ear.pass } }),
    note: "practice only; never a promotion",
  };
}
