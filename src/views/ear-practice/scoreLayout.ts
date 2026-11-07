import type { SnapshotNote, WrittenPitch } from "../../domain/chordDojo/targetSnapshot";
import type { EarKeySignature } from "../../domain/earPractice";

/** The distance between two staff lines, in drawing units (one pixel at the size the score is drawn). */
export const GAP = 10;
const HALF = GAP / 2;
const STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
/** The diatonic number of the bottom line of each staff: E4 in the treble, G2 in the bass. */
const BOTTOM_LINE = { treble: 4 * 7 + 2, bass: 2 * 7 + 4 } as const;
/** Between the two staves: four line-spacings and a half, so the clef and the middle C ledger lines never meet. */
export const STAFF_GAP = GAP * 5.6;
const STAFF_HEIGHT = GAP * 4;
/** The room above the treble staff for the chord names and the marks. */
const LABEL_BAND = 46;
/** The room for the clefs and the key signature at the head of a row. */
const CLEF_WIDTH = 44;
const SIGNATURE_STEP = 11;

/** Flats and sharps in the order they appear in a key signature, as letters. */
const FLAT_LETTERS = ["B", "E", "A", "D", "G", "C", "F"] as const;
const SHARP_LETTERS = ["F", "C", "G", "D", "A", "E", "B"] as const;

export type Staff = "treble" | "bass";
export type NoteValue = "whole" | "dotted-half" | "half" | "dotted-quarter" | "quarter" | "eighth" | "none";

export const diatonic = (pitch: Pick<WrittenPitch, "step" | "octave">) => pitch.octave * 7 + STEPS.indexOf(pitch.step);

/** The alteration a key signature gives each letter (−1 flat, +1 sharp). */
export function signatureAlters(signature: EarKeySignature | undefined): Record<string, number> {
  const alters: Record<string, number> = {};
  if (!signature || signature.count === 0) return alters;
  const letters = signature.accidental === "flat" ? FLAT_LETTERS : SHARP_LETTERS;
  letters.slice(0, signature.count).forEach((letter) => { alters[letter] = signature.accidental === "flat" ? -1 : 1; });
  return alters;
}

/** The note value that writes a number of beats (quarter = 1), or undefined when it has no single note. */
export function noteValueOf(beats: number): Exclude<NoteValue, "none"> | undefined {
  switch (beats) {
    case 4: return "whole";
    case 3: return "dotted-half";
    case 2: return "half";
    case 1.5: return "dotted-quarter";
    case 1: return "quarter";
    case 0.5: return "eighth";
    default: return undefined;
  }
}

export interface ScoreChordInput {
  /** The index in the question. */
  index: number;
  label: string;
  /** 1-based bar. */
  bar: number;
  startBeat: number;
  durationBeats: number;
  notes: readonly SnapshotNote[];
}

/**
 * Whether the whole progression can be written with notes: in every bar the chords follow one another from the
 * first beat and fill the bar exactly, and each has a length that is one note (whole, dotted half, half, dotted
 * quarter, quarter, eighth). A chord that runs across a bar line, or a length like 2.5 beats, cannot be written.
 */
export function rhythmWritable(chords: readonly ScoreChordInput[], beatsPerBar: number): boolean {
  const bars = new Map<number, ScoreChordInput[]>();
  for (const chord of chords) bars.set(chord.bar, [...(bars.get(chord.bar) ?? []), chord]);
  for (const own of bars.values()) {
    let at = 0;
    for (const chord of own) {
      const inBar = chord.startBeat - Math.floor(chord.startBeat / beatsPerBar) * beatsPerBar;
      if (Math.abs(inBar - at) > 1e-6 || noteValueOf(chord.durationBeats) === undefined) return false;
      at += chord.durationBeats;
    }
    if (Math.abs(at - beatsPerBar) > 1e-6) return false;
  }
  return true;
}

export interface ScoreBar {
  bar: number;
  chords: ScoreChordInput[];
  /** The narrowest the bar may be drawn (110 for one chord, 160 for two, 50 more for each further chord). */
  minWidth: number;
}

/** Groups the chords into bars. Without a written rhythm, each chord is a bar of its own (one box per chord). */
export function scoreBars(chords: readonly ScoreChordInput[], writable: boolean): ScoreBar[] {
  const groups: ScoreChordInput[][] = [];
  if (writable) {
    for (const chord of chords) {
      const last = groups[groups.length - 1];
      if (last && last[0]!.bar === chord.bar) last.push(chord);
      else groups.push([chord]);
    }
  } else {
    for (const chord of chords) groups.push([chord]);
  }
  return groups.map((own) => ({ bar: own[0]!.bar, chords: own, minWidth: 110 + 50 * (own.length - 1) }));
}

/**
 * How many bars go on a row: 8 in a window 1200 px wide or more, else 4; fewer (never under 2) when the narrowest
 * width of the bars of a row would not fit (Stage 04 §3).
 */
export function barsPerRow(bars: readonly ScoreBar[], availableWidth: number, windowWidth: number): number {
  let perRow = windowWidth >= 1200 ? 8 : 4;
  const fits = (count: number) => {
    for (let at = 0; at < bars.length; at += count) {
      const sum = bars.slice(at, at + count).reduce((total, bar) => total + bar.minWidth, 0);
      if (sum > availableWidth) return false;
    }
    return true;
  };
  while (perRow > 2 && !fits(perRow)) perRow -= 1;
  return perRow;
}

export interface PlacedNote {
  midi: number;
  step: string;
  alter: number;
  octave: number;
  staff: Staff;
  x: number;
  y: number;
  /** A second is written on the other side of the stem. */
  shifted: boolean;
  /** `♭♭` (double flat), `♭`, `♮`, `♯`, `𝄪` (double sharp) or empty. */
  accidental: "" | "♭♭" | "♭" | "♮" | "♯" | "𝄪";
  accidentalX: number;
  ledgers: number[];
}

export interface PlacedStem {
  staff: Staff;
  x: number;
  y1: number;
  y2: number;
  /** Where the flag of an eighth note goes (the free end of the stem), and which way it hangs. */
  flag?: { x: number; y: number; up: boolean };
}

export interface PlacedChord {
  index: number;
  label: string;
  value: NoteValue;
  /** The box the chord owns (to press and to light up). */
  x: number;
  width: number;
  /** The centre of the note heads. */
  cx: number;
  notes: PlacedNote[];
  stems: PlacedStem[];
  /** The dot after a dotted note (one for each staff that has notes). */
  dots: { x: number; y: number }[];
}

export interface PlacedBar {
  bar: number;
  x: number;
  width: number;
  chords: PlacedChord[];
}

export interface PlacedRow {
  y: number;
  height: number;
  trebleTop: number;
  bassTop: number;
  bars: PlacedBar[];
  /** Where the row stops (the last bar line). */
  right: number;
  isLast: boolean;
}

export interface ScoreLayout {
  rows: PlacedRow[];
  width: number;
  height: number;
  /** The left edge of the first bar (after the clefs and the key signature). */
  headWidth: number;
  perRow: number;
  writable: boolean;
}

export interface LayoutInput {
  chords: readonly ScoreChordInput[];
  beatsPerBar: number;
  signature: EarKeySignature | undefined;
  width: number;
  windowWidth: number;
}

/** Which staff a note is on: middle C and above on the treble staff; the lowest note of a chord is the bass, always. */
export const staffOf = (midi: number, isLowest: boolean): Staff => (isLowest && midi < 72) || midi < 60 ? "bass" : "treble";

const yOf = (staff: Staff, top: number, note: Pick<WrittenPitch, "step" | "octave">) =>
  top + STAFF_HEIGHT - (diatonic(note) - BOTTOM_LINE[staff]) * HALF;

/** Notes of a chord by staff, with seconds moved to the right and the accidentals of the bar decided. */
function placeChord(
  chord: ScoreChordInput,
  value: NoteValue,
  box: { x: number; width: number },
  tops: { trebleTop: number; bassTop: number },
  state: Map<string, number>,
  signature: Record<string, number>,
): PlacedChord {
  const sorted = [...chord.notes].sort((a, b) => a.midi - b.midi);
  const cx = box.x + box.width / 2;
  const notes: PlacedNote[] = [];
  const byStaff: Record<Staff, SnapshotNote[]> = { treble: [], bass: [] };
  sorted.forEach((note, position) => byStaff[staffOf(note.midi, position === 0)].push(note));
  for (const staff of ["treble", "bass"] as const) {
    const own = byStaff[staff].sort((a, b) => diatonic(a.spelling) - diatonic(b.spelling));
    let previous: { d: number; shifted: boolean } | undefined;
    for (const note of own) {
      const d = diatonic(note.spelling);
      const shifted = previous !== undefined && d - previous.d === 1 && !previous.shifted;
      previous = { d, shifted };
      const top = staff === "treble" ? tops.trebleTop : tops.bassTop;
      const y = yOf(staff, top, note.spelling);
      const ledgers: number[] = [];
      for (let ly = top - GAP; ly >= y - 0.1; ly -= GAP) ledgers.push(ly);
      for (let ly = top + STAFF_HEIGHT + GAP; ly <= y + 0.1; ly += GAP) ledgers.push(ly);
      notes.push({
        midi: note.midi, step: note.spelling.step, alter: note.spelling.alter, octave: note.spelling.octave,
        staff, x: cx + (shifted ? 12 : 0), y, shifted, accidental: "", accidentalX: 0, ledgers,
      });
    }
  }
  // Accidentals: highest note first. A note needs one when what stands for its letter and octave in this bar
  // (an earlier accidental, else the key signature) is not what it is.
  const order = [...notes].sort((a, b) => a.y - b.y);
  const columns: Record<Staff, number[][]> = { treble: [], bass: [] };
  const placedAt: Array<{ note: PlacedNote; column: number }> = [];
  for (const note of order) {
    const id = `${note.step}${note.octave}`;
    const standing = state.get(id) ?? signature[note.step] ?? 0;
    if (standing === note.alter) continue;
    state.set(id, note.alter);
    note.accidental = note.alter <= -2 ? "♭♭" : note.alter < 0 ? "♭" : note.alter >= 2 ? "𝄪" : note.alter > 0 ? "♯" : "♮";
    const taken = columns[note.staff];
    let column = 0;
    while (taken[column]?.some((y) => Math.abs(y - note.y) < 2.6 * GAP)) column += 1;
    (taken[column] ??= []).push(note.y);
    placedAt.push({ note, column });
  }
  // The columns go left from the heads, each as wide as its widest sign (a double flat is wider than a flat).
  for (const staff of ["treble", "bass"] as const) {
    const own = placedAt.filter((item) => item.note.staff === staff);
    if (!own.length) continue;
    const widthOf = (column: number) => Math.max(...own.filter((item) => item.column === column).map((item) => (item.note.accidental === "♭♭" || item.note.accidental === "𝄪" ? 17 : 10)), 0);
    const headLeft = Math.min(...notes.filter((other) => other.staff === staff).map((other) => other.x)) - 8;
    for (const { note, column } of own) {
      let right = headLeft;
      for (let earlier = 0; earlier < column; earlier += 1) right -= widthOf(earlier) + 2;
      note.accidentalX = right - widthOf(column) / 2;
    }
  }
  const stems: PlacedStem[] = [];
  const dots: { x: number; y: number }[] = [];
  if (value !== "none" && value !== "whole") {
    for (const staff of ["treble", "bass"] as const) {
      const own = notes.filter((note) => note.staff === staff);
      if (!own.length) continue;
      const top = staff === "treble" ? tops.trebleTop : tops.bassTop;
      const middle = top + STAFF_HEIGHT / 2;
      const ys = own.map((note) => note.y);
      const low = Math.max(...ys);
      const high = Math.min(...ys);
      const up = (high + low) / 2 >= middle;
      const length = 3.4 * GAP;
      const x = up ? cx + 6 : cx - 6;
      const y1 = up ? low : high;
      const y2 = up ? Math.min(high - length, middle) : Math.max(low + length, middle);
      stems.push({ staff, x, y1, y2, ...(value === "eighth" ? { flag: { x, y: y2, up } } : {}) });
    }
  }
  if (value === "dotted-half" || value === "dotted-quarter") {
    for (const note of notes) {
      // A dot sits in the space above the line when the note is on a line.
      const onLine = Math.abs(((note.y - (note.staff === "treble" ? tops.trebleTop : tops.bassTop)) % GAP + GAP) % GAP) < 0.1;
      dots.push({ x: Math.max(...notes.filter((other) => other.staff === note.staff).map((other) => other.x)) + 12, y: onLine ? note.y - HALF : note.y });
    }
  }
  return { index: chord.index, label: chord.label, value, x: box.x, width: box.width, cx, notes, stems, dots };
}

/** Draws nothing: it only decides where everything goes. The same layout serves the screen and the tests. */
export function layoutScore(input: LayoutInput): ScoreLayout {
  const writable = rhythmWritable(input.chords, input.beatsPerBar);
  const bars = scoreBars(input.chords, writable);
  const headWidth = CLEF_WIDTH + (input.signature?.count ?? 0) * SIGNATURE_STEP + 8;
  const available = Math.max(200, input.width - headWidth - 12);
  // The most that fit, then shared out evenly over the rows they need (7 + 1 bars become 4 + 4).
  const most = barsPerRow(bars, available, input.windowWidth);
  const perRow = bars.length ? Math.ceil(bars.length / Math.ceil(bars.length / most)) : most;
  const signature = signatureAlters(input.signature);
  // The room one unit of minimum width gets: the fullest row fills the line, the others are drawn at the same scale.
  let widest = 1;
  for (let at = 0; at < bars.length; at += perRow) {
    widest = Math.max(widest, bars.slice(at, at + perRow).reduce((sum, bar) => sum + bar.minWidth, 0));
  }
  const scale = available / widest;
  const rows: PlacedRow[] = [];
  let y = 0;
  for (let at = 0; at < bars.length; at += perRow) {
    const own = bars.slice(at, at + perRow);
    // First a pass with the staves at a guess, to know how much room the notes need above and below.
    const place = (trebleTop: number, bassTop: number) => {
      const state = new Map<string, number>();
      let x = headWidth;
      return own.map((bar): PlacedBar => {
        state.clear();
        const width = bar.minWidth * scale;
        const barBeats = bar.chords.reduce((sum, chord) => sum + chord.durationBeats, 0) || 1;
        let offset = 0;
        const placed = bar.chords.map((chord) => {
          const share = writable ? chord.durationBeats / barBeats : 1;
          const box = { x: x + 8 + offset, width: (width - 16) * share };
          offset += box.width;
          return placeChord(chord, writable ? noteValueOf(chord.durationBeats) ?? "none" : "none", box, { trebleTop, bassTop }, state, signature);
        });
        const result: PlacedBar = { bar: bar.bar, x, width, chords: placed };
        x += width;
        return result;
      });
    };
    const guessTreble = LABEL_BAND + 40;
    const guess = place(guessTreble, guessTreble + STAFF_HEIGHT + STAFF_GAP);
    const all = guess.flatMap((bar) => bar.chords.flatMap((chord) => [...chord.notes.map((note) => note.y), ...chord.stems.flatMap((stem) => [stem.y1, stem.y2])]));
    const aboveStaff = Math.max(0, guessTreble - Math.min(guessTreble, ...all)) + 6;
    const trebleTop = LABEL_BAND + Math.max(8, aboveStaff);
    const bassTop = trebleTop + STAFF_HEIGHT + STAFF_GAP;
    const placed = place(trebleTop, bassTop);
    const lowest = Math.max(bassTop + STAFF_HEIGHT, ...placed.flatMap((bar) => bar.chords.flatMap((chord) => [...chord.notes.map((note) => note.y + 6), ...chord.stems.flatMap((stem) => [stem.y1, stem.y2])])));
    const height = lowest + 18;
    rows.push({ y, height, trebleTop, bassTop, bars: placed, right: headWidth + own.reduce((sum, bar) => sum + bar.minWidth * scale, 0), isLast: at + perRow >= bars.length });
    y += height + 10;
  }
  return { rows, width: input.width, height: y, headWidth, perRow, writable };
}
