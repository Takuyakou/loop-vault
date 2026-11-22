/**
 * P19 ボイシングドリル: the content (all twenty sets, written in C), the fixed right-hand shapes and their placement,
 * the twelve keys, the written names, and the shape judgement.
 *
 * Everything is produced from the C data; no Vault, record file or screen is read here. The shape is fixed: the left
 * hand has the root, the right hand has the chord tones below (with the root added only for plain triads). No fingering.
 */
export type DrillStage = 1 | 2 | 3 | 4;
export type DrillForm = "A" | "B" | null;

export interface CCard {
  readonly id: string;
  readonly label: string;
  readonly degree: string;
  readonly form: DrillForm;
  readonly left: readonly number[];
  readonly right: readonly number[];
}

export interface CSet {
  readonly id: string;
  readonly stage: DrillStage;
  readonly name: string;
  readonly degrees: readonly string[];
  readonly cards: readonly CCard[];
}

export interface DrillCard extends CCard {
  readonly index: number;
  readonly leftNames: readonly string[];
  readonly rightNames: readonly string[];
  readonly rootPitchClass: number;
  readonly rightPitchClasses: readonly number[];
}

export interface DrillKeySet {
  readonly setId: string;
  readonly stage: DrillStage;
  readonly name: string;
  readonly degrees: readonly string[];
  readonly key: number;
  readonly cards: readonly DrillCard[];
}

/** A chord tone: semitones above the root, and how many letters it spans (a 9th spans one letter, like a 2nd). */
interface Tone { readonly semi: number; readonly steps: number }
interface Shape { readonly tones: readonly Tone[] }

// ---- letters, accidentals and keys --------------------------------------------------------------------------------
const LETTERS = "CDEFGAB";
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const DRILL_KEY_COUNT = 12;
export const DRILL_KEY_NAMES: readonly string[] = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const GLYPH: Record<number, string> = { [-2]: "𝄫", [-1]: "♭", 0: "", 1: "♯", 2: "𝄪" };
const mod = (n: number, m: number) => ((n % m) + m) % m;
const pc = (pitch: number) => mod(pitch, 12);

interface Written { readonly step: string; readonly alter: number }
const keyWritten = (key: number): Written => {
  const name = MAJOR_KEYS[key]!;
  return { step: name[0]!, alter: name[1] === "b" ? -1 : name[1] === "#" ? 1 : 0 };
};
const writtenName = (written: Written, octave: number) => `${written.step}${GLYPH[written.alter] ?? ""}${octave}`;
const letterAt = (step: string, steps: number) => LETTERS[mod(LETTERS.indexOf(step) + steps, 7)]!;
const writtenOn = (letter: string, pitch: number): Written => ({ step: letter, alter: mod(pitch - LETTER_PC[letter]! + 6, 12) - 6 });
const octaveOf = (written: Written, pitch: number) => Math.floor((pitch - LETTER_PC[written.step]! - written.alter) / 12) - 1;

/** The scale degree of a C-rooted chord: the step and accidental of the root. */
const C_DEGREE: Record<number, { step: number; alter: number }> = {
  0: { step: 1, alter: 0 }, 2: { step: 2, alter: 0 }, 4: { step: 3, alter: 0 }, 5: { step: 4, alter: 0 },
  7: { step: 5, alter: 0 }, 9: { step: 6, alter: 0 }, 11: { step: 7, alter: 0 },
  1: { step: 2, alter: -1 }, 3: { step: 3, alter: -1 }, 6: { step: 4, alter: 1 }, 8: { step: 6, alter: -1 }, 10: { step: 7, alter: -1 },
};

/**
 * Spell a chord from its degree: the root's letter comes from the degree counted from the key's letter, and every note
 * keeps its letter distance from the root. When a double accidental would be needed (root or note), the root is
 * respelled to the neighbour letter with at most one accidental (`C♭` → `B`, `B𝄫` → `A`).
 */
function spellChord(tonic: number, degreeStep: number, degreeAlter: number, shape: Shape): { readonly root: Written; readonly rootPc: number } {
  const key = keyWritten(tonic);
  const scale = [0, 2, 4, 5, 7, 9, 11];
  const rootPc = mod(tonic + scale[degreeStep - 1]! + degreeAlter, 12);
  const diatonicLetter = letterAt(key.step, degreeStep - 1);
  const candidates = [0, 1, -1, 2, -2].map((shift) => writtenOn(letterAt(diatonicLetter, shift), rootPc));
  const scored = candidates.map((root, order) => {
    const doubles = (Math.abs(root.alter) > 1 ? 1 : 0)
      + shape.tones.filter((tone) => Math.abs(writtenOn(letterAt(root.step, tone.steps), rootPc + tone.semi).alter) > 1).length;
    return { root, doubles, order };
  });
  return { root: [...scored].sort((a, b) => a.doubles - b.doubles || a.order - b.order)[0]!.root, rootPc };
}

const leftRoot = (rootPc: number) => 40 + mod(rootPc - 40, 12);

// ---- the fixed right-hand shapes ----------------------------------------------------------------------------------
const shape = (pairs: readonly (readonly [number, number])[]): Shape => ({ tones: pairs.map(([semi, steps]) => ({ semi, steps })) });

const SHAPE = {
  maj: shape([[0, 0], [4, 2], [7, 4]]),
  min: shape([[0, 0], [3, 2], [7, 4]]),
  maj7: shape([[4, 2], [7, 4], [11, 6]]),
  min7: shape([[3, 2], [7, 4], [10, 6]]),
  dom7: shape([[4, 2], [7, 4], [10, 6]]),
  halfDim7: shape([[3, 2], [6, 4], [10, 6]]),
  sevenSus4: shape([[5, 3], [7, 4], [10, 6]]),
  six: shape([[4, 2], [7, 4], [9, 5]]),
  aug7: shape([[4, 2], [8, 4], [10, 6]]),
  maj7_9: shape([[4, 2], [7, 4], [11, 6], [14, 1]]),
  maj7_9_13: shape([[4, 2], [9, 5], [11, 6], [14, 1]]),
  min7_9: shape([[3, 2], [7, 4], [10, 6], [14, 1]]),
  min7_9_11: shape([[7, 4], [10, 6], [14, 1], [17, 3]]),
  min7_11: shape([[0, 0], [5, 3], [7, 4], [10, 6]]),
  maj7_9_sharp11: shape([[7, 4], [11, 6], [14, 1], [18, 3]]),
  dom7_9: shape([[4, 2], [7, 4], [10, 6], [14, 1]]),
  dom7_9_13: shape([[4, 2], [9, 5], [10, 6], [14, 1]]),
  dom7_b9: shape([[4, 2], [7, 4], [10, 6], [13, 1]]),
  halfDim7_11: shape([[0, 0], [5, 3], [6, 4], [10, 6]]),
  halfDim7_11_b13: shape([[10, 6], [3, 2], [5, 3], [8, 5]]),
} as const;
export type DrillQuality = keyof typeof SHAPE;

const SUFFIX: Record<DrillQuality, string> = {
  maj: "", min: "m", maj7: "Δ7", min7: "m7", dom7: "7", halfDim7: "ø7", sevenSus4: "7sus4", six: "6", aug7: "+7",
  maj7_9: "Δ7(9)", maj7_9_13: "Δ7(9,13)", min7_9: "m7(9)", min7_9_11: "m7(9,11)", min7_11: "m7(11)",
  maj7_9_sharp11: "Δ7(9,♯11)", dom7_9: "7(9)", dom7_9_13: "7(9,13)", dom7_b9: "7(♭9)",
  halfDim7_11: "ø7(11)", halfDim7_11_b13: "ø7(11,♭13)",
};

// ---- placement of the right hand ----------------------------------------------------------------------------------
function compactCandidates(rootPc: number, semis: readonly number[], lowestMin: number, lowestMax: number, topLimit: number): number[][] {
  const notes = [...new Set(semis.map((semi) => mod(rootPc + semi, 12)))].sort((a, b) => a - b);
  const found: number[][] = [];
  const seen = new Set<string>();
  for (let rotation = 0; rotation < notes.length; rotation += 1) {
    const rotated = [...notes.slice(rotation), ...notes.slice(0, rotation).map((value) => value + 12)];
    if (rotated[rotated.length - 1]! - rotated[0]! > 11) continue;
    for (let octave = -1; octave <= 8; octave += 1) {
      const pitches = rotated.map((value) => value + octave * 12);
      if (pitches[0]! < lowestMin || pitches[0]! > lowestMax) continue;
      if (pitches[pitches.length - 1]! > topLimit) continue;
      const key = pitches.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(pitches);
    }
  }
  return found;
}

const movementSame = (from: readonly number[], to: readonly number[]) => from.reduce((sum, value, index) => sum + Math.abs(value - to[index]!), 0);
/** The alignment the spec fixes for a different number of notes: the shared part from the bottom, the rest to the nearest note. */
function movementDifferent(from: readonly number[], to: readonly number[]): number {
  const shared = Math.min(from.length, to.length);
  let cost = movementSame(from.slice(0, shared), to.slice(0, shared));
  const extra = from.length > to.length ? from.slice(shared) : to.slice(shared);
  const other = from.length > to.length ? to : from;
  for (const value of extra) cost += Math.min(...other.map((note) => Math.abs(note - value)));
  return cost;
}

const byTop = (target: number) => (a: number[], b: number[]) =>
  Math.abs(a[a.length - 1]! - target) - Math.abs(b[b.length - 1]! - target)
  || a[a.length - 1]! - b[b.length - 1]!
  || a[0]! - b[0]!;
const chooseFirst = (candidates: readonly number[][], topTarget: number) => [...candidates].sort(byTop(topTarget))[0]!;
function chooseNext(previous: readonly number[], candidates: readonly number[][]): number[] {
  return [...candidates].sort((a, b) =>
    movementDifferent(previous, a) - movementDifferent(previous, b)
    || Math.abs(a[a.length - 1]! - previous[previous.length - 1]!) - Math.abs(b[b.length - 1]! - previous[previous.length - 1]!)
    || a[a.length - 1]! - b[b.length - 1]!
    || a[0]! - b[0]!)[0]!;
}

/** Right hand for stages 1 and 2: first card 60..71 with the top nearest 76; then 57..74 with the least movement. */
export function placeRightHand(rootPc: number, semis: readonly number[], previous?: readonly number[]): number[] {
  if (!previous) return chooseFirst(compactCandidates(rootPc, semis, 60, 71, 84), 76);
  return chooseNext(previous, compactCandidates(rootPc, semis, 57, 74, 84));
}
/** Right hand for stage 4: first card 57..69 with the top nearest 74; then 57..74 with the least movement. */
export function placeMicroRightHand(rootPc: number, semis: readonly number[], previous?: readonly number[]): number[] {
  if (!previous) return chooseFirst(compactCandidates(rootPc, semis, 57, 69, 86), 74);
  return chooseNext(previous, compactCandidates(rootPc, semis, 57, 74, 86));
}

// ---- stages 1 and 2 ----------------------------------------------------------------------------------------------
interface DegreeChord { readonly degree: string; readonly quality: DrillQuality; readonly step: number; readonly alter: number }

const CYCLES: readonly { id: string; name: string; chords: readonly DegreeChord[] }[] = [
  { id: "cycle-a", name: "基本の循環", chords: [
    { degree: "I", quality: "maj", step: 1, alter: 0 }, { degree: "VIm7", quality: "min7", step: 6, alter: 0 },
    { degree: "IVΔ7", quality: "maj7", step: 4, alter: 0 }, { degree: "V7", quality: "dom7", step: 5, alter: 0 }] },
  { id: "cycle-b", name: "II を使う循環", chords: [
    { degree: "I", quality: "maj", step: 1, alter: 0 }, { degree: "VIm7", quality: "min7", step: 6, alter: 0 },
    { degree: "IIm7", quality: "min7", step: 2, alter: 0 }, { degree: "V7", quality: "dom7", step: 5, alter: 0 }] },
  { id: "cycle-c", name: "VI から始まる", chords: [
    { degree: "VIm7", quality: "min7", step: 6, alter: 0 }, { degree: "IIm7", quality: "min7", step: 2, alter: 0 },
    { degree: "V7", quality: "dom7", step: 5, alter: 0 }, { degree: "IΔ7", quality: "maj7", step: 1, alter: 0 }] },
  { id: "cycle-d", name: "IV から始まる", chords: [
    { degree: "IVΔ7", quality: "maj7", step: 4, alter: 0 }, { degree: "V7", quality: "dom7", step: 5, alter: 0 },
    { degree: "IIIm7", quality: "min7", step: 3, alter: 0 }, { degree: "VIm7", quality: "min7", step: 6, alter: 0 }] },
  { id: "cycle-e", name: "II から始まる", chords: [
    { degree: "IIm7", quality: "min7", step: 2, alter: 0 }, { degree: "V7", quality: "dom7", step: 5, alter: 0 },
    { degree: "IΔ7", quality: "maj7", step: 1, alter: 0 }, { degree: "VIm7", quality: "min7", step: 6, alter: 0 }] },
];

const DIATONIC: readonly { id: string; name: string; chords: readonly DegreeChord[] }[] = [
  { id: "diatonic-fourths", name: "4度で進む", chords: [
    { degree: "IΔ7", quality: "maj7", step: 1, alter: 0 }, { degree: "IVΔ7", quality: "maj7", step: 4, alter: 0 },
    { degree: "VIIø7", quality: "halfDim7", step: 7, alter: 0 }, { degree: "IIIm7", quality: "min7", step: 3, alter: 0 },
    { degree: "VIm7", quality: "min7", step: 6, alter: 0 }, { degree: "IIm7", quality: "min7", step: 2, alter: 0 },
    { degree: "V7", quality: "dom7", step: 5, alter: 0 }, { degree: "IΔ7", quality: "maj7", step: 1, alter: 0 }] },
  { id: "diatonic-up", name: "2度で上がる", chords: [
    { degree: "IΔ7", quality: "maj7", step: 1, alter: 0 }, { degree: "IIm7", quality: "min7", step: 2, alter: 0 },
    { degree: "IIIm7", quality: "min7", step: 3, alter: 0 }, { degree: "IVΔ7", quality: "maj7", step: 4, alter: 0 },
    { degree: "V7", quality: "dom7", step: 5, alter: 0 }, { degree: "VIm7", quality: "min7", step: 6, alter: 0 },
    { degree: "VIIø7", quality: "halfDim7", step: 7, alter: 0 }, { degree: "IΔ7", quality: "maj7", step: 1, alter: 0 }] },
  { id: "diatonic-down", name: "2度で下がる", chords: [
    { degree: "IΔ7", quality: "maj7", step: 1, alter: 0 }, { degree: "VIIø7", quality: "halfDim7", step: 7, alter: 0 },
    { degree: "VIm7", quality: "min7", step: 6, alter: 0 }, { degree: "V7", quality: "dom7", step: 5, alter: 0 },
    { degree: "IVΔ7", quality: "maj7", step: 4, alter: 0 }, { degree: "IIIm7", quality: "min7", step: 3, alter: 0 },
    { degree: "IIm7", quality: "min7", step: 2, alter: 0 }, { degree: "V7", quality: "dom7", step: 5, alter: 0 },
    { degree: "IΔ7", quality: "maj7", step: 1, alter: 0 }] },
  { id: "diatonic-mix-1", name: "組み合わせ 1", chords: [
    { degree: "IΔ7", quality: "maj7", step: 1, alter: 0 }, { degree: "IIIm7", quality: "min7", step: 3, alter: 0 },
    { degree: "VIm7", quality: "min7", step: 6, alter: 0 }, { degree: "IIm7", quality: "min7", step: 2, alter: 0 },
    { degree: "V7sus4", quality: "sevenSus4", step: 5, alter: 0 }, { degree: "V7", quality: "dom7", step: 5, alter: 0 },
    { degree: "IΔ7", quality: "maj7", step: 1, alter: 0 }] },
  { id: "diatonic-mix-2", name: "組み合わせ 2", chords: [
    { degree: "IVΔ7", quality: "maj7", step: 4, alter: 0 }, { degree: "V7", quality: "dom7", step: 5, alter: 0 },
    { degree: "IIIm7", quality: "min7", step: 3, alter: 0 }, { degree: "VIm7", quality: "min7", step: 6, alter: 0 },
    { degree: "IIm7", quality: "min7", step: 2, alter: 0 }, { degree: "V7sus4", quality: "sevenSus4", step: 5, alter: 0 },
    { degree: "V7", quality: "dom7", step: 5, alter: 0 }, { degree: "I6", quality: "six", step: 1, alter: 0 }] },
];

// ---- stage 3: the tension shapes (the table is the data) ----------------------------------------------------------
interface TensionRow {
  readonly degree: string;
  readonly suffix: string;
  readonly step: number;
  readonly alter: number;
  readonly left: number;
  readonly shapeA: Shape;
  readonly shapeB: Shape;
  readonly formA: readonly number[];
  readonly formB: readonly number[];
}

const tension = (a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]) => ({ shapeA: shape(a), shapeB: shape(b) });

const TENSION_ROWS: readonly TensionRow[] = [
  { degree: "IΔ7(9)", suffix: "Δ7(9)", step: 1, alter: 0, left: 48, ...tension([[16, 2], [19, 4], [23, 6], [26, 1]], [[11, 6], [14, 1], [16, 2], [19, 4]]), formA: [64, 67, 71, 74], formB: [59, 62, 64, 67] },
  { degree: "IΔ7(9,13)", suffix: "Δ7(9,13)", step: 1, alter: 0, left: 48, ...tension([[16, 2], [21, 5], [23, 6], [26, 1]], [[11, 6], [14, 1], [16, 2], [21, 5]]), formA: [64, 69, 71, 74], formB: [59, 62, 64, 69] },
  { degree: "IIm7(9)", suffix: "m7(9)", step: 2, alter: 0, left: 50, ...tension([[15, 2], [19, 4], [22, 6], [26, 1]], [[10, 6], [14, 1], [15, 2], [19, 4]]), formA: [65, 69, 72, 76], formB: [60, 64, 65, 69] },
  { degree: "IIm7(9,11)", suffix: "m7(9,11)", step: 2, alter: 0, left: 50, ...tension([[19, 4], [22, 6], [26, 1], [29, 3]], [[14, 1], [17, 3], [19, 4], [22, 6]]), formA: [69, 72, 76, 79], formB: [64, 67, 69, 72] },
  { degree: "IIIm7(11)", suffix: "m7(11)", step: 3, alter: 0, left: 52, ...tension([[12, 0], [17, 3], [19, 4], [22, 6]], [[7, 4], [10, 6], [12, 0], [17, 3]]), formA: [64, 69, 71, 74], formB: [59, 62, 64, 69] },
  { degree: "IVΔ7(9)", suffix: "Δ7(9)", step: 4, alter: 0, left: 41, ...tension([[16, 2], [19, 4], [23, 6], [26, 1]], [[23, 6], [26, 1], [28, 2], [31, 4]]), formA: [57, 60, 64, 67], formB: [64, 67, 69, 72] },
  { degree: "IVΔ7(9,13)", suffix: "Δ7(9,13)", step: 4, alter: 0, left: 41, ...tension([[16, 2], [21, 5], [23, 6], [26, 1]], [[23, 6], [26, 1], [28, 2], [33, 5]]), formA: [57, 62, 64, 67], formB: [64, 67, 69, 74] },
  { degree: "IVΔ7(9,♯11)", suffix: "Δ7(9,♯11)", step: 4, alter: 0, left: 41, ...tension([[19, 4], [23, 6], [26, 1], [30, 3]], [[26, 1], [30, 3], [31, 4], [35, 6]]), formA: [60, 64, 67, 71], formB: [67, 71, 72, 76] },
  { degree: "V7(9)", suffix: "7(9)", step: 5, alter: 0, left: 43, ...tension([[16, 2], [19, 4], [22, 6], [26, 1]], [[22, 6], [26, 1], [28, 2], [31, 4]]), formA: [59, 62, 65, 69], formB: [65, 69, 71, 74] },
  { degree: "V7(9,13)", suffix: "7(9,13)", step: 5, alter: 0, left: 43, ...tension([[16, 2], [21, 5], [22, 6], [26, 1]], [[22, 6], [26, 1], [28, 2], [33, 5]]), formA: [59, 64, 65, 69], formB: [65, 69, 71, 76] },
  { degree: "VIm7(9)", suffix: "m7(9)", step: 6, alter: 0, left: 45, ...tension([[15, 2], [19, 4], [22, 6], [26, 1]], [[22, 6], [26, 1], [27, 2], [31, 4]]), formA: [60, 64, 67, 71], formB: [67, 71, 72, 76] },
  { degree: "VIm7(9,11)", suffix: "m7(9,11)", step: 6, alter: 0, left: 45, ...tension([[19, 4], [22, 6], [26, 1], [29, 3]], [[14, 1], [17, 3], [19, 4], [22, 6]]), formA: [64, 67, 71, 74], formB: [59, 62, 64, 67] },
  { degree: "VIIø7(11)", suffix: "ø7(11)", step: 7, alter: 0, left: 47, ...tension([[12, 0], [17, 3], [18, 4], [22, 6]], [[18, 4], [22, 6], [24, 0], [29, 3]]), formA: [59, 64, 65, 69], formB: [65, 69, 71, 76] },
  { degree: "VIIø7(11,♭13)", suffix: "ø7(11,♭13)", step: 7, alter: 0, left: 47, ...tension([[10, 6], [15, 2], [17, 3], [20, 5]], [[17, 3], [20, 5], [22, 6], [27, 2]]), formA: [57, 62, 64, 67], formB: [64, 67, 69, 74] },
];

const TENSION_GROUPS: readonly { id: string; name: string; rows: readonly TensionRow[] }[] = [
  { id: "tension-front", name: "I〜III の形", rows: TENSION_ROWS.slice(0, 5) },
  { id: "tension-back", name: "IV〜VII の形", rows: TENSION_ROWS.slice(5) },
  { id: "tension-all", name: "全部の形", rows: TENSION_ROWS },
];

// ---- stage 4: short modulating progressions -----------------------------------------------------------------------
interface MicroChord { readonly root: number; readonly quality: DrillQuality; readonly degree: string; readonly suffix: string; readonly bass?: number }

const MICRO: readonly { id: string; name: string; chords: readonly MicroChord[] }[] = [
  { id: "micro-1", name: "Ⅱ-Ⅴ で寄り道", chords: [
    { root: 9, quality: "min7_9", degree: "VIm7(9)", suffix: "m7(9)" },
    { root: 7, quality: "min7_9", degree: "Vm7(9)", suffix: "m7(9)" },
    { root: 0, quality: "dom7_9_13", degree: "I7(9,13)", suffix: "7(9,13)" },
    { root: 5, quality: "maj7_9", degree: "IVΔ7(9)", suffix: "Δ7(9)" },
    { root: 4, quality: "min7", degree: "IIIm7", suffix: "m7" },
    { root: 2, quality: "dom7_9_13", degree: "II7(9,13)", suffix: "7(9,13)" },
    { root: 10, quality: "dom7_9_13", degree: "♭VII7(9,13)", suffix: "7(9,13)" }] },
  { id: "micro-2", name: "サブドミナントマイナーへ", chords: [
    { root: 0, quality: "maj", degree: "I", suffix: "" },
    { root: 7, quality: "min7", degree: "Vm7", suffix: "m7" },
    { root: 5, quality: "maj7_9", degree: "IVΔ7(9)", suffix: "Δ7(9)" },
    { root: 5, quality: "min7_9", degree: "IVm7(9)", suffix: "m7(9)" }] },
  { id: "micro-3", name: "同主調から借りる", chords: [
    { root: 0, quality: "maj", degree: "I", suffix: "" },
    { root: 10, quality: "six", degree: "♭VII6", suffix: "6" },
    { root: 9, quality: "min7", degree: "VIm7", suffix: "m7" },
    { root: 8, quality: "maj7", degree: "♭VIΔ7", suffix: "Δ7" }] },
  { id: "micro-4", name: "マイナーからの寄り道", chords: [
    { root: 9, quality: "min", degree: "VIm", suffix: "m" },
    { root: 4, quality: "min7", degree: "IIIm7", suffix: "m7" },
    { root: 2, quality: "min7", degree: "IIm7", suffix: "m7" },
    { root: 7, quality: "maj7", degree: "VΔ7", suffix: "Δ7" },
    { root: 9, quality: "min", degree: "VIm", suffix: "m" },
    { root: 4, quality: "min7", degree: "IIIm7", suffix: "m7" },
    { root: 2, quality: "min7", degree: "IIm7", suffix: "m7" },
    { root: 10, quality: "maj7", degree: "♭VIIΔ7", suffix: "Δ7" }] },
  { id: "micro-5", name: "メジャー7th で下がる", chords: [
    { root: 0, quality: "maj7", degree: "IΔ7", suffix: "Δ7" },
    { root: 10, quality: "maj7_9", degree: "♭VIIΔ7(9)", suffix: "Δ7(9)" },
    { root: 8, quality: "maj7", degree: "♭VIΔ7", suffix: "Δ7" },
    { root: 7, quality: "maj7_9", degree: "VΔ7(9)", suffix: "Δ7(9)" }] },
  { id: "micro-6a", name: "分数コードと Ⅱ-Ⅴ", chords: [
    { root: 5, quality: "maj7", degree: "IVΔ7", suffix: "Δ7" },
    { root: 7, quality: "maj", degree: "V/IV", suffix: "", bass: 5 },
    { root: 4, quality: "min7", degree: "IIIm7", suffix: "m7" },
    { root: 9, quality: "min7", degree: "VIm7", suffix: "m7" },
    { root: 2, quality: "min7_9", degree: "IIm7(9)", suffix: "m7(9)" },
    { root: 7, quality: "dom7_9_13", degree: "V7(9,13)", suffix: "7(9,13)" },
    { root: 0, quality: "maj7", degree: "IΔ7", suffix: "Δ7" },
    { root: 2, quality: "min7", degree: "IIm7", suffix: "m7" },
    { root: 4, quality: "min7", degree: "IIIm7", suffix: "m7" }] },
  { id: "micro-6b", name: "♯IVø7 から下がる", chords: [
    { root: 6, quality: "halfDim7", degree: "♯IVø7", suffix: "ø7" },
    { root: 5, quality: "maj7", degree: "IVΔ7", suffix: "Δ7" },
    { root: 4, quality: "dom7_b9", degree: "III7(♭9)", suffix: "7(♭9)" },
    { root: 9, quality: "aug7", degree: "VI+7", suffix: "+7" },
    { root: 9, quality: "dom7", degree: "VI7", suffix: "7" },
    { root: 2, quality: "min7_9", degree: "IIm7(9)", suffix: "m7(9)" },
    { root: 2, quality: "halfDim7", degree: "IIø7", suffix: "ø7" },
    { root: 7, quality: "dom7_b9", degree: "V7(♭9)", suffix: "7(♭9)" },
    { root: 7, quality: "min7_9", degree: "Vm7(9)", suffix: "m7(9)" },
    { root: 0, quality: "dom7_9_13", degree: "I7(9,13)", suffix: "7(9,13)" },
    { root: 0, quality: "dom7_9", degree: "I7(9)", suffix: "7(9)" }] },
];

// ---- the C sets ---------------------------------------------------------------------------------------------------
const labelOf = (root: Written, suffix: string) => `${root.step}${GLYPH[root.alter] ?? ""}${suffix}`;

function degreeCards(chords: readonly DegreeChord[]): CCard[] {
  const cards: CCard[] = [];
  let previous: number[] | undefined;
  for (const [index, chord] of chords.entries()) {
    const quality = SHAPE[chord.quality];
    const spelled = spellChord(0, chord.step, chord.alter, quality);
    const right = placeRightHand(spelled.rootPc, quality.tones.map((tone) => tone.semi), previous);
    previous = right;
    cards.push({ id: `${index + 1}`, label: labelOf(spelled.root, SUFFIX[chord.quality]), degree: chord.degree, form: null, left: [leftRoot(spelled.rootPc)], right });
  }
  return cards;
}

function tensionCards(rows: readonly TensionRow[]): CCard[] {
  const cards: CCard[] = [];
  for (const row of rows) {
    for (const [form, right] of [["A", row.formA], ["B", row.formB]] as const) {
      cards.push({ id: `${cards.length + 1}`, label: labelOf(spellChord(0, row.step, row.alter, form === "A" ? row.shapeA : row.shapeB).root, row.suffix), degree: row.degree, form, left: [row.left], right: [...right] });
    }
  }
  return cards;
}

function microCards(chords: readonly MicroChord[]): CCard[] {
  const cards: CCard[] = [];
  let previous: number[] | undefined;
  for (const [index, chord] of chords.entries()) {
    const quality = SHAPE[chord.quality];
    const right = placeMicroRightHand(chord.root, quality.tones.map((tone) => tone.semi), previous);
    previous = right;
    const degree = C_DEGREE[chord.root]!;
    const root = spellChord(0, degree.step, degree.alter, quality).root;
    const bass = chord.bass === undefined ? undefined : spellChord(0, C_DEGREE[chord.bass]!.step, C_DEGREE[chord.bass]!.alter, SHAPE.maj).root;
    cards.push({ id: `${index + 1}`, label: labelOf(root, chord.suffix) + (bass ? `/${labelOf(bass, "")}` : ""), degree: chord.degree, form: null, left: [leftRoot(chord.bass ?? chord.root)], right });
  }
  return cards;
}

export const DRILL_SETS: readonly CSet[] = Object.freeze([
  ...CYCLES.map((set) => ({ id: set.id, stage: 1 as const, name: set.name, degrees: set.chords.map((chord) => chord.degree), cards: degreeCards(set.chords) })),
  ...DIATONIC.map((set) => ({ id: set.id, stage: 2 as const, name: set.name, degrees: set.chords.map((chord) => chord.degree), cards: degreeCards(set.chords) })),
  ...TENSION_GROUPS.map((group) => ({ id: group.id, stage: 3 as const, name: group.name, degrees: group.rows.map((row) => row.degree), cards: tensionCards(group.rows) })),
  ...MICRO.map((set) => ({ id: set.id, stage: 4 as const, name: set.name, degrees: set.chords.map((chord) => chord.degree), cards: microCards(set.chords) })),
]);

export const DRILL_SET_IDS: readonly string[] = DRILL_SETS.map((set) => set.id);
export const drillSetById = (id: string) => DRILL_SETS.find((set) => set.id === id);

/**
 * The revision of a set's content (spec §4): a hash of the C cards the record was timed with, so that a record still
 * says which chords and shapes its milliseconds belonged to after the content changes. FNV-1a, the same hash the other
 * Dojo snapshots use (kept here so that this module has no dependency on the rest of the Dojo).
 */
export function drillSetRevision(setId: string): string {
  const set = drillSetById(setId);
  if (!set) throw new Error(`Voicing Drill: unknown set ${setId}`);
  let hash = 2166136261;
  const text = JSON.stringify(set.cards.map((card) => ({
    id: card.id, label: card.label, degree: card.degree, form: card.form, left: card.left, right: card.right,
  })));
  for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ---- the twelve keys ----------------------------------------------------------------------------------------------
/** Stage 3 moves every note by this many semitones (C 0, D♭ +1 … F♯ +6, G −5 … B −1). */
export const drillKeyShift = (key: number) => (key <= 6 ? key : key - 12);

function namesFor(spelled: { root: Written; rootPc: number }, pitches: readonly number[], shapeValue?: Shape): string[] {
  return pitches.map((pitch) => {
    const tone = shapeValue?.tones
      .filter((entry) => pc(spelled.rootPc + entry.semi) === pc(pitch))
      .sort((a, b) => b.semi - a.semi)[0];
    const steps = tone?.steps ?? 0;
    const written = writtenOn(letterAt(spelled.root.step, steps), pitch);
    return writtenName(written, octaveOf(written, pitch));
  });
}

const keyCache = new Map<string, DrillKeySet>();
export function buildDrillKeySet(setId: string, key: number): DrillKeySet {
  if (!Number.isInteger(key) || key < 0 || key > 11) throw new Error(`Voicing Drill: ${key} is not a key`);
  const cacheKey = `${setId}|${key}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;
  const set = drillSetById(setId);
  if (!set) throw new Error(`Voicing Drill: unknown set ${setId}`);
  const cards: DrillCard[] = [];
  let previous: number[] | undefined;
  for (const [index, card] of set.cards.entries()) {
    let spelled: { root: Written; rootPc: number };
    let leftSpelling: { root: Written; rootPc: number };
    let shapeValue: Shape;
    let left: number[];
    let right: number[];
    let label: string;
    if (set.stage === 3) {
      const row = TENSION_ROWS.find((entry) => entry.degree === card.degree)!;
      const shift = drillKeyShift(key);
      shapeValue = card.form === "A" ? row.shapeA : row.shapeB;
      spelled = spellChord(key, row.step, row.alter, shapeValue);
      leftSpelling = spelled;
      left = [row.left + shift];
      right = card.right.map((pitch) => pitch + shift);
      label = labelOf(spelled.root, row.suffix);
    } else if (set.stage === 4) {
      const chord = MICRO.find((entry) => entry.id === set.id)!.chords[index]!;
      const degree = C_DEGREE[chord.root]!;
      shapeValue = SHAPE[chord.quality];
      spelled = spellChord(key, degree.step, degree.alter, shapeValue);
      const bassDegree = C_DEGREE[chord.bass ?? chord.root]!;
      // The left hand keeps the chord's own root spelling (the slash bass keeps its own): its name must read like the label.
      leftSpelling = chord.bass === undefined ? spelled : spellChord(key, bassDegree.step, bassDegree.alter, SHAPE.maj);
      left = [leftRoot(mod((chord.bass ?? chord.root) + key, 12))];
      right = placeMicroRightHand(spelled.rootPc, shapeValue.tones.map((tone) => tone.semi), previous);
      label = labelOf(spelled.root, chord.suffix) + (chord.bass === undefined ? "" : `/${labelOf(leftSpelling.root, "")}`);
    } else {
      const chord = (set.stage === 1 ? CYCLES : DIATONIC).find((entry) => entry.id === set.id)!.chords[index]!;
      shapeValue = SHAPE[chord.quality];
      spelled = spellChord(key, chord.step, chord.alter, shapeValue);
      leftSpelling = spelled;
      left = [leftRoot(spelled.rootPc)];
      right = placeRightHand(spelled.rootPc, shapeValue.tones.map((tone) => tone.semi), previous);
      label = labelOf(spelled.root, SUFFIX[chord.quality]);
    }
    previous = right;
    cards.push({
      ...card, index, left, right, label,
      leftNames: namesFor(leftSpelling, left, SHAPE.maj),
      rightNames: namesFor(spelled, right, shapeValue),
      rootPitchClass: pc(left[0]!),
      rightPitchClasses: right.map(pc),
    });
  }
  const built: DrillKeySet = { setId: set.id, stage: set.stage, name: set.name, degrees: set.degrees, key, cards };
  keyCache.set(cacheKey, built);
  return built;
}

// ---- judgement ----------------------------------------------------------------------------------------------------
export interface DrillJudgeCard { readonly rootPitchClass: number; readonly left: readonly number[]; readonly right: readonly number[] }

/**
 * Whether the keys held now are exactly one card: the lowest key is the left hand's note, the rest is the right-hand
 * shape at any octave (same intervals, same count), the right hand is above the left, and no other key is held.
 */
export function drillShapeMatches(card: DrillJudgeCard, held: readonly number[]): boolean {
  const keys = sortedPitch(held);
  if (keys.length !== card.right.length + 1) return false;
  if (pc(keys[0]!) !== pc(card.rootPitchClass)) return false;
  if (keys[1]! <= keys[0]!) return false;
  const shapeIntervals = card.right.map((pitch) => pitch - card.right[0]!);
  const heldIntervals = keys.slice(1).map((pitch) => pitch - keys[1]!);
  return shapeIntervals.length === heldIntervals.length && shapeIntervals.every((interval, index) => interval === heldIntervals[index]);
}

const sortedPitch = (held: readonly number[]) => [...new Set(held)].sort((a, b) => a - b);

/** Why a held shape does not match: the reason shown after about a second (not a failure). */
export type DrillMismatch = "extra" | "missing" | "right" | "left" | "pedal";

export function drillMismatch(card: DrillJudgeCard, held: readonly number[], sustained: readonly number[] = []): DrillMismatch | undefined {
  const keys = sortedPitch(held);
  if (keys.length === 0) return sustained.length ? "pedal" : undefined;
  const required = card.right.length + 1;
  if (keys.length > required) return "extra";
  if (keys.length < required) return "missing";
  if (pc(keys[0]!) !== pc(card.rootPitchClass) || keys[1]! <= keys[0]!) return "left";
  const shapeIntervals = card.right.map((pitch) => pitch - card.right[0]!);
  const heldIntervals = keys.slice(1).map((pitch) => pitch - keys[1]!);
  if (shapeIntervals.length !== heldIntervals.length || shapeIntervals.some((interval, index) => interval !== heldIntervals[index])) return "right";
  return undefined;
}

/** The "迷った" mark: a pressed pitch class outside the left hand and the right-hand shape (octaves do not matter). */
export function drillDistracted(card: DrillJudgeCard, pitch: number): boolean {
  return !new Set([pc(card.rootPitchClass), ...card.right.map(pc)]).has(pc(pitch));
}

export interface DrillLapClock { readonly startedAt: number | null; readonly lastCardAt: number | null }
export const createDrillLapClock = (): DrillLapClock => ({ startedAt: null, lastCardAt: null });
export const noteFirstPress = (clock: DrillLapClock, at: number): DrillLapClock =>
  clock.startedAt === null ? { startedAt: at, lastCardAt: at } : clock;
export function passCard(clock: DrillLapClock, at: number): { clock: DrillLapClock; lastCardMs: number } {
  const from = clock.lastCardAt ?? clock.startedAt ?? at;
  // The MIDI time of an event is a performance time (a fraction of a millisecond); the record keeps whole milliseconds.
  return { clock: { ...clock, lastCardAt: at }, lastCardMs: Math.max(0, Math.round(at - from)) };
}
