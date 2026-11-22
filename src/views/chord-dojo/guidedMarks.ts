/**
 * P23-51 (mock ⑤): after a wrong MIDI answer the keyboard shows what was played against the answer —
 * the played notes that belong to the chord (hit), the played notes that do not (wrong), and the chord
 * tones that were not played (miss, drawn at the example's own key). One sentence says what happened.
 */
export type ResultMark = "hit" | "wrong" | "miss";

/** Note names by pitch class (rule 5: flats are written ♭). */
const FLAT = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"] as const;
const NATURAL = new Set([0, 2, 4, 5, 7, 9, 11]);

const pitchClass = (note: number): number => ((Math.trunc(note) % 12) + 12) % 12;

function uniqueInOrder(values: readonly number[]): number[] {
  return [...new Set(values)];
}

/**
 * Played notes are hit or wrong by pitch class; a chord tone not played at all is a miss at the example's key.
 * `required` (the item's required pitch classes) leaves an optional tone (the fifth of a seventh chord) unmarked;
 * `allowed` (the item's allowed pitch classes) counts an allowed extra tone as right.
 */
export function resultMarks(played: readonly number[], reference: readonly number[], required?: readonly number[], allowed?: readonly number[], bass?: number): Map<number, ResultMark> {
  const marks = new Map<number, ResultMark>();
  const target = new Set((allowed ?? reference).map(pitchClass));
  const playedPcs = new Set(played.map(pitchClass));
  for (const note of played) marks.set(note, target.has(pitchClass(note)) ? "hit" : "wrong");
  const needed = required === undefined ? undefined : new Set(required.map(pitchClass));
  for (const note of reference) {
    const value = pitchClass(note);
    if (playedPcs.has(value) || marks.has(note) || (needed !== undefined && !needed.has(value))) continue;
    marks.set(note, "miss");
  }
  // P23-54: a slash chord with the wrong lowest note marks that note wrong and the example's bass missing,
  // even when both pitch classes are chord tones (C/E played with C at the bottom).
  if (bass !== undefined && played.length > 0) {
    const lowest = Math.min(...played);
    if (pitchClass(lowest) !== pitchClass(bass)) {
      marks.set(lowest, "wrong");
      const wanted = reference.filter((note) => pitchClass(note) === pitchClass(bass));
      if (wanted.length > 0 && !marks.has(Math.min(...wanted))) marks.set(Math.min(...wanted), "miss");
    }
  }
  return marks;
}

/**
 * A wrong note is named against the tone it replaced: F instead of F♯ reads "F♯", E♭ instead of E reads "E♭".
 * Otherwise the flat name.
 */
export function wrongNoteName(pc: number, missing: readonly number[]): string {
  const below = (pc + 11) % 12;
  const above = (pc + 1) % 12;
  if (missing.includes(below) && NATURAL.has(below)) return `${FLAT[below]}♯`;
  if (missing.includes(above) && NATURAL.has(above)) return `${FLAT[above]}♭`;
  return FLAT[pc]!;
}

export interface WrongLines {
  /** swap: a wrong note took a chord tone's place; missing / extra / bass: only that. */
  readonly kind: "swap" | "missing" | "extra" | "bass";
  /** The one sentence under the verdict. */
  readonly line: string;
  /** The chord's tones, and what the dashed ring means when there is one. */
  readonly sub: string;
}

/**
 * The two lines of mock ⑤. `bass` is the pitch class that must be lowest (ear questions and slash chords).
 * Returns undefined when nothing is wrong by pitch class and the bass is right (the caller keeps its own text).
 */
export function wrongLines(
  label: string,
  played: readonly number[],
  reference: readonly number[],
  options: { readonly bass?: number; readonly required?: readonly number[]; readonly allowed?: readonly number[] } = {},
): WrongLines | undefined {
  const { bass, required, allowed } = options;
  if (played.length === 0 || reference.length === 0) return undefined;
  const tones = uniqueInOrder(reference.map(pitchClass));
  const playedPcs = uniqueInOrder([...played].sort((left, right) => left - right).map(pitchClass));
  const missing = tones.filter((value) => !playedPcs.includes(value) && (required === undefined || required.map(pitchClass).includes(value)));
  const fits = allowed === undefined ? tones : allowed.map(pitchClass);
  const foreign = playedPcs.filter((value) => !fits.includes(value) && value !== bass);
  const missingNames = missing.map((value) => FLAT[value]!).join("・");
  const foreignNames = foreign.map((value) => wrongNoteName(value, missing)).join("・");
  const toneText = `${label} は ${tones.map((value) => FLAT[value]!).join("・")}。`;
  const ring = missing.length > 0 ? "点線の輪が足りない音です。" : "";
  if (missing.length > 0 && foreign.length > 0) return { kind: "swap", line: `${missingNames} の代わりに ${foreignNames} を弾きました。`, sub: `${toneText}${ring}` };
  if (missing.length > 0) return { kind: "missing", line: `${missingNames} が足りません。`, sub: `${toneText}${ring}` };
  if (foreign.length > 0) return { kind: "extra", line: `${foreignNames} は ${label} の音ではありません。`, sub: toneText };
  if (bass !== undefined) {
    const lowest = pitchClass(Math.min(...played));
    if (lowest !== bass) return { kind: "bass", line: `一番低い音が ${FLAT[lowest]} です。${FLAT[bass]} を一番下にします。`, sub: toneText };
  }
  return undefined;
}
