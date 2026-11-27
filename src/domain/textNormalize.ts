import { parseExtendedTextChordLabel, parseExtendedTextProgression } from "./extendedTextProgression";
import { EXTENDED_TEXT_LIMITS } from "./extendedTextBudgets";

/**
 * P24-05 05-a: the one normalising layer under the one text parser.
 *
 * It does two things and never guesses:
 * - A: spellings that mean the same are made the same (full-width → half-width, `CM7`/`C△7` → `Cmaj7`,
 *   `ConG` → `C/G`, `C-7` → `Cm7`, runs of spaces → one). Each change is reported with its position in the
 *   line the user typed, so the screen can underline it.
 * - B: a line whose words are all chord names (or `|`, `%`, `_`, `=`, `x2`, `N.C.`) is a code line; any
 *   other line is skipped (lyrics). A line that is only `[…]` is a heading. `#` lines keep the extended
 *   parser's meaning.
 *
 * A skipped or heading line never reaches the parser, so it can never eat a bar. A line the user asked to
 * read as code (`readAsCode`, remembered by its trimmed text) is read as code for as long as it is there.
 */
export type NormalizeLineKind = "code" | "skipped" | "heading" | "comment" | "blank" | "setting";

export interface NormalizeChange {
  /** 1-based line in the input. */
  readonly line: number;
  /** Start offset in the line the user typed. */
  readonly start: number;
  /** End offset (exclusive) in the line the user typed. */
  readonly end: number;
  readonly from: string;
  readonly to: string;
}

/**
 * fix-2 item 3: the characters that were tidied together read as one 「か所」 (one dotted underline):
 * `Ｆmaj7` is one, each `｜` is one, `C△7` is one. Space-only tidying is not counted.
 */
export interface NormalizeChangeRun {
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly from: string;
  readonly to: string;
}

export function mergeNormalizeChanges(changes: readonly NormalizeChange[]): NormalizeChangeRun[] {
  const out: NormalizeChangeRun[] = [];
  const sorted = [...changes].sort((left, right) => left.line - right.line || left.start - right.start);
  for (const change of sorted) {
    // A space-only tidy never starts or joins a visible group (no underline over spaces).
    if (change.from.trim() === "" && change.to.trim() === "") continue;
    const last = out[out.length - 1];
    if (last !== undefined && last.line === change.line && change.start <= last.end) {
      out[out.length - 1] = {
        line: last.line,
        start: last.start,
        end: Math.max(last.end, change.end),
        from: last.from + change.from,
        to: last.to + change.to,
      };
      continue;
    }
    out.push({ line: change.line, start: change.start, end: change.end, from: change.from, to: change.to });
  }
  return out;
}

export interface NormalizeLine {
  /** 1-based. */
  readonly line: number;
  readonly kind: NormalizeLineKind;
  readonly raw: string;
  /** The line after A (only meaningful for code, heading and comment lines). */
  readonly text: string;
  /** The heading's name without the brackets (heading lines only). */
  readonly heading?: string;
  /** P25 V32: what a `Key:` / `BPM:` / `Time Signature:` line sets (setting lines only). */
  readonly setting?: NormalizeSetting;
}

/** P25 V32: the values a chord sheet's setting lines carry. */
export interface NormalizeSetting {
  readonly key?: string;
  readonly bpm?: number;
  readonly meter?: string;
}

export interface NormalizeResult {
  /** The code lines only, after A, joined with "\n". This is what the parser reads. */
  readonly text: string;
  /** For each line of `text`, its 1-based line in the input. */
  readonly codeLineNumbers: readonly number[];
  /** P24-05: for each line of `text`, where each of its characters came from in the typed line. */
  readonly codeOrigins: readonly (readonly number[])[];
  /** P24-05: the typed line starts (0-based offsets into the input). */
  readonly lineRawStarts: readonly number[];
  readonly lines: readonly NormalizeLine[];
  readonly changes: readonly NormalizeChange[];
  readonly skipped: readonly NormalizeLine[];
  readonly headings: readonly NormalizeLine[];
  /** True when at least one line was skipped or treated as a heading (or a comment line was kept). */
  readonly restructured: boolean;
  /** P25 V32: the values of the sheet's setting lines — the first one that carried each value. */
  readonly settings: NormalizeSetting;
  /** P25-06 E: lines whose chords were written inside 歌詞 (`[C]きょうも[G]…`), one chord per bar. */
  readonly lyricChordLines: readonly NormalizeLine[];
  /** P25-06 E2: lines read after the comma/dash separators and the `.` repeat were applied. */
  readonly separatedLines: readonly NormalizeLine[];
  /** P25-06 E2: the `.` and `?` places the screen names in the list and underlines. */
  readonly notices: readonly NormalizeNotice[];
  /** P25 V37: the notes a chord's `{ }` gave it, by the position of that chord's first character. */
  readonly voicings: readonly NormalizeVoicing[];
}

/** P25-06 E2: a `.` or `?` the reading had to name. */
export interface NormalizeNotice {
  /** 1-based line in the input. */
  readonly line: number;
  /** Start offset in the line the user typed. */
  readonly start: number;
  /** End offset (exclusive). */
  readonly end: number;
  readonly token: string;
  readonly kind: "dot-without-chord" | "question-mark" | "voicing-notes";
  readonly message: string;
}

/** P25 V37: a chord's notes written in `{ }` right after its name (`Cmaj7{C3 G3 E4 B4 D5}`). */
export interface NormalizeVoicing {
  /** 1-based line in the input. */
  readonly line: number;
  /** Where that chord's first character is in the whole input. */
  readonly rawStart: number;
  readonly notes: readonly number[];
}

const NOTICE_TEXT: Record<Exclude<NormalizeNotice["kind"], "voicing-notes">, string> = {
  "dot-without-chord": "「.」の前にコードがありません。",
  "question-mark": "「?」は読めません。",
};

/** E2: the commas that separate chords (the half-width one, the full-width one and the Japanese one). */
const SEPARATING_COMMAS = new Set([",", "，", "、"]);

/** The word that ends just before `index` (spaces skipped), or "" at the line's head. */
function wordBefore(text: string, index: number): string {
  let end = index;
  while (end > 0 && text[end - 1] === " ") end -= 1;
  let start = end;
  while (start > 0 && text[start - 1] !== " ") start -= 1;
  return text.slice(start, end);
}

/** The word that starts just after `index` (spaces skipped), or "" at the line's end. */
function wordAfter(text: string, index: number): string {
  let start = index + 1;
  while (start < text.length && text[start] === " ") start += 1;
  if (start >= text.length) return "";
  let end = start;
  while (end < text.length && text[end] !== " ") end += 1;
  return text.slice(start, end);
}

/** E2: a dash separates only before a root letter or a roman numeral (`C-G`, `vi-IV`, not `C-7`). */
function separatesAtDash(text: string, index: number): boolean {
  const after = text[index + 1];
  if (after === undefined) return false;
  if (text[index - 1] === " " && after === " ") {
    // A spaced dash between two chords separates; at the line's head or end, or between `|` marks, it does not.
    const before = wordBefore(text, index);
    const next = wordAfter(text, index);
    return (isChordName(before) || isDegreeLike(before)) && (isChordName(next) || isDegreeLike(next));
  }
  return after === "I" || after === "V" || after === "i" || after === "v" || /[A-G]/.test(after);
}

/** The words of one piece read as the parser reads them (the same rules as `readsAsCodeLine`). */
function pieceReads(piece: string): boolean {
  const words = piece.trim().split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return false;
  return words.every((word) => {
    if (STRUCTURAL.has(word) || isDegreeLike(word)) return true;
    if (word.includes("|")) {
      const parts = word.split("|").filter((part) => part.length > 0);
      return parts.length > 0 && parts.every((part) => STRUCTURAL.has(part) || isDegreeLike(part) || isChordName(part));
    }
    return isChordName(word);
  });
}

interface BuiltPiece {
  readonly text: string;
  /** The indexes of this piece in the tidied line. */
  readonly start: number;
  readonly end: number;
}

/** Trims a piece, keeping where it starts and ends in the tidied line. */
function trimPiece(text: string, start: number, end: number): BuiltPiece {
  const raw = text.slice(start, end);
  const trimmed = raw.trim();
  const lead = raw.length - raw.trimStart().length;
  return { text: trimmed, start: start + lead, end: start + lead + trimmed.length };
}

interface BuiltChart {
  readonly text: string;
  readonly origin: number[];
  readonly changes: NormalizeChange[];
  readonly notices: NormalizeNotice[];
  readonly lastChord?: string;
}

/**
 * P25-06 E2: `C, G, Am, F` / `C-G-Am-F` / `C, ., G` read as a code line.
 * Returns undefined when the line is not read this way (it then keeps today's reading).
 */
function separatedChartLine(
  built: BuiltLine,
  line: number,
  previousChord: string | undefined,
): BuiltChart | undefined {
  const text = built.text;
  const pieces: BuiltPiece[] = [];
  const separators: number[] = [];
  let depth = 0;
  let pieceStart = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === "(") { depth += 1; continue; }
    if (character === ")") { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    // The bar marks and the repeat/hold signs are not pieces of their own: read them as written.
    if (character !== "-" && !SEPARATING_COMMAS.has(character)) continue;
    if (character === "-" && !separatesAtDash(text, index)) continue;
    pieces.push(trimPiece(text, pieceStart, index));
    separators.push(index);
    pieceStart = index + 1;
  }
  if (separators.length === 0) return undefined;
  pieces.push(trimPiece(text, pieceStart, text.length));

  let running = previousChord;
  let chords = 0;
  const resolved: { piece: BuiltPiece; text: string; repeat: boolean; question: boolean }[] = [];
  for (const piece of pieces) {
    if (piece.text === "") return undefined;
    if (piece.text === "-") return undefined;
    if (piece.text === ".") {
      if (running === undefined) {
        resolved.push({ piece, text: ".", repeat: false, question: false });
        continue;
      }
      resolved.push({ piece, text: running, repeat: true, question: false });
      continue;
    }
    if (piece.text === "?") {
      resolved.push({ piece, text: "?", repeat: false, question: true });
      continue;
    }
    if (!pieceReads(piece.text)) return undefined;
    chords += 1;
    running = piece.text.split(/\s+/).filter((word) => isChordName(word) || isDegreeLike(word)).pop() ?? running;
    resolved.push({ piece, text: piece.text, repeat: false, question: false });
  }
  if (chords === 0) return undefined;

  let output = "";
  const origin: number[] = [];
  const changes: NormalizeChange[] = [];
  const notices: NormalizeNotice[] = [];
  resolved.forEach((entry, index) => {
    if (index > 0) {
      const separator = separators[index - 1]!;
      output += " ";
      origin.push(built.origin[separator] ?? built.origin[entry.piece.start] ?? 0);
      changes.push({ line, start: built.origin[separator] ?? 0, end: (built.origin[separator] ?? 0) + 1, from: text[separator] ?? " ", to: " " });
    }
    if (entry.repeat) {
      const at = built.origin[entry.piece.start] ?? 0;
      for (let offset = 0; offset < entry.text.length; offset += 1) origin.push(at);
      changes.push({ line, start: at, end: (built.origin[entry.piece.end - 1] ?? at) + 1, from: ".", to: entry.text });
    } else {
      for (let offset = 0; offset < entry.text.length; offset += 1) {
        origin.push(built.origin[entry.piece.start + offset] ?? built.origin[entry.piece.start] ?? 0);
      }
    }
    if (entry.question) {
      const at = built.origin[entry.piece.start] ?? 0;
      notices.push({ line, start: at, end: at + 1, token: "?", kind: "question-mark", message: NOTICE_TEXT["question-mark"] });
    }
    if (entry.text === ".") {
      const at = built.origin[entry.piece.start] ?? 0;
      notices.push({ line, start: at, end: at + 1, token: ".", kind: "dot-without-chord", message: NOTICE_TEXT["dot-without-chord"] });
    }
    output += entry.text;
  });
  return { text: output, origin, changes, notices, ...(running === undefined ? {} : { lastChord: running }) };
}

/**
 * P25-06 E: a line of 歌詞 with the chords written inside `[…]` (`[C]きょうも[G]あるく`) reads as
 * `| C | G |` — one chord per bar — with every chord still pointing at its own brackets.
 */
function lyricChordLine(built: BuiltLine): { text: string; origin: number[]; chords: string[] } | undefined {
  const text = built.text;
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.includes("|") || !trimmed.includes("[")) return undefined;
  const matches = [...text.matchAll(/\[([^\]]*)\]/g)];
  if (matches.length === 0) return undefined;
  const chords: string[] = [];
  for (const match of matches) {
    const content = (match[1] ?? "").trim();
    if (content === "") return undefined;
    if (!isChordName(content) && !STRUCTURAL.has(content)) return undefined;
    chords.push(content);
  }
  const outside = text.replace(/\[[^\]]*\]/g, "").trim();
  if (matches.length < 2 && outside === "") return undefined;

  let output = "| ";
  const origin: number[] = [];
  origin.push(built.origin[matches[0]!.index] ?? 0, built.origin[matches[0]!.index] ?? 0);
  chords.forEach((chord, index) => {
    const match = matches[index]!;
    const inner = match[1] ?? "";
    const contentStart = match.index + 1 + (inner.length - inner.trimStart().length);
    for (let offset = 0; offset < chord.length; offset += 1) {
      origin.push(built.origin[contentStart + offset] ?? built.origin[match.index] ?? 0);
    }
    output += chord;
    if (index + 1 < chords.length) {
      const bracket = built.origin[matches[index + 1]!.index] ?? 0;
      origin.push(bracket, bracket, bracket);
      output += " | ";
    }
  });
  const last = matches[matches.length - 1]!;
  const close = built.origin[Math.min(text.length - 1, last.index + (last[0]?.length ?? 1) - 1)] ?? 0;
  origin.push(close, close);
  output += " |";
  return { text: output, origin, chords };
}

/** P25 V37: a note in `{ }` — a letter, an optional accidental, an octave (`C3`, `F#3`, `Bb4`, `E♭4`). */
const VOICING_NOTE = /^([A-Ga-g])(##|bb|#|b|♯|♭)?(-?\d)$/;
const NOTE_SEMITONE: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const VOICING_NOTES_MIN = 2;
export const VOICING_NOTES_MAX = 10;

/** The 2–10 notes of one `{ }`, or the sentence that says why they do not read. */
function readVoicingNotes(inner: string): { notes: number[] } | { message: string } {
  const notes: number[] = [];
  for (const token of inner.split(/[\s,;]+/).filter((part) => part !== "")) {
    const match = VOICING_NOTE.exec(token);
    if (match === null) return { message: `「${token}」は音として読めません(例:C3・F#3・Bb4)。` };
    const accidental = match[2] === undefined ? 0
      : match[2] === "##" || match[2] === "♯" ? 1
        : match[2] === "bb" || match[2] === "♭" ? -1
          : match[2] === "#" ? 1 : -1;
    const midi = (Number(match[3]) + 1) * 12 + NOTE_SEMITONE[match[1]!.toUpperCase()]! + accidental;
    if (midi < 21 || midi > 108) return { message: "音は A0〜C8 の中にしてください。" };
    notes.push(midi);
  }
  // The same note twice is one note; the card reads them from the bottom up.
  const unique = [...new Set(notes)].sort((left, right) => left - right);
  if (unique.length < VOICING_NOTES_MIN || unique.length > VOICING_NOTES_MAX) {
    return { message: "{ } の中の音は 2〜10 個にしてください。" };
  }
  return { notes: unique };
}

/**
 * P25 V37: `Cmaj7{C3 G3 E4 B4 D5}` — the `{ }` right after a chord's name (no space between) sets that
 * chord's notes and comes out of the text the parser reads. Other `{ }` (a `{title: …}` line, lyrics) stay.
 */
export function takeVoicingBraces(
  built: BuiltLine,
  line: number,
  lineRawStart: number,
  notices: NormalizeNotice[],
): { built: BuiltLine; voicings: NormalizeVoicing[] } {
  const text = built.text;
  const voicings: NormalizeVoicing[] = [];
  let out = "";
  const origin: number[] = [];
  let cursor = 0;
  let scan = 0;
  while (scan < text.length) {
    const open = text.indexOf("{", scan);
    if (open < 0) break;
    const close = text.indexOf("}", open + 1);
    if (close < 0) break;
    if (text.slice(open + 1, close).includes("{")) {
      scan = open + 1;
      continue;
    }
    // The word just before `{` — no space between, and the word itself a chord name.
    let wordStart = open;
    while (wordStart > 0 && text[wordStart - 1] !== " " && text[wordStart - 1] !== "|") wordStart -= 1;
    const attached = open > 0 && text[open - 1] !== " ";
    const word = text.slice(wordStart, open);
    if (!attached || !isChordName(word)) {
      out += text.slice(cursor, close + 1);
      origin.push(...built.origin.slice(cursor, close + 1));
      cursor = close + 1;
      scan = close + 1;
      continue;
    }
    out += text.slice(cursor, open);
    origin.push(...built.origin.slice(cursor, open));
    const read = readVoicingNotes(text.slice(open + 1, close));
    if ("notes" in read) {
      voicings.push({ line, rawStart: lineRawStart + (built.origin[wordStart] ?? wordStart), notes: read.notes });
    } else {
      notices.push({
        line,
        start: built.origin[open] ?? open,
        end: (built.origin[close] ?? close) + 1,
        token: text.slice(open, close + 1),
        kind: "voicing-notes",
        message: read.message,
      });
    }
    cursor = close + 1;
    scan = close + 1;
  }
  if (cursor === 0) return { built, voicings };
  out += text.slice(cursor);
  origin.push(...built.origin.slice(cursor));
  return { built: { text: out, origin }, voicings };
}


interface LocatedOffset {
  readonly lineNumber: number;
  readonly lineStart: number;
  readonly charIndex: number;
  readonly rawLength: number;
}

/** Where a position in `text` sits in the typed input. */
function locateOffset(normalized: NormalizeResult, offset: number): LocatedOffset {
  const lineTexts = normalized.text.split("\n");
  let start = 0;
  for (let index = 0; index < normalized.codeLineNumbers.length; index += 1) {
    const text = lineTexts[index] ?? "";
    const end = start + text.length;
    if (offset <= end || index === normalized.codeLineNumbers.length - 1) {
      const lineNumber = normalized.codeLineNumbers[index]!;
      return {
        lineNumber,
        lineStart: normalized.lineRawStarts[lineNumber - 1] ?? 0,
        charIndex: Math.max(0, Math.min(text.length, offset - start)),
        rawLength: (normalized.lines[lineNumber - 1]?.raw ?? "").length,
      };
    }
    start = end + 1;
  }
  return { lineNumber: 1, lineStart: 0, charIndex: 0, rawLength: 0 };
}

/** P24-05: the typed offset a position in `text` came from (the end of a line maps to its line end). */
export function rawOffsetOfNormalized(normalized: NormalizeResult, offset: number): number {
  if (normalized.codeLineNumbers.length === 0) return 0;
  const located = locateOffset(normalized, offset);
  const origins = normalized.codeOrigins[normalized.codeLineNumbers.indexOf(located.lineNumber)] ?? [];
  if (located.charIndex < origins.length) return located.lineStart + origins[located.charIndex]!;
  return located.lineStart + located.rawLength;
}

/**
 * P24-05: the end of a position in `text`, as typed. A character that was rewritten (`C△7` → `Cmaj7`, a
 * full-width sign) takes the whole run that was rewritten, so a selection never stops in the middle.
 */
export function rawEndOfNormalized(normalized: NormalizeResult, offset: number): number {
  if (normalized.codeLineNumbers.length === 0) return 0;
  const located = locateOffset(normalized, offset);
  const origins = normalized.codeOrigins[normalized.codeLineNumbers.indexOf(located.lineNumber)] ?? [];
  const rawStart = located.charIndex < origins.length ? origins[located.charIndex]! : located.rawLength;
  const change = normalized.changes.find((entry) => entry.line === located.lineNumber && entry.start === rawStart);
  return located.lineStart + (change?.end ?? rawStart + 1);
}

/** P24-05: the input with the skipped and blank lines removed (code, headings and comments stay, A applied). */
export function cleanedText(normalized: NormalizeResult): string {
  return normalized.lines
    .filter((line) => line.kind === "code" || line.kind === "heading" || line.kind === "comment" || line.kind === "setting")
    .map((line) => line.text)
    .join("\n");
}

/** P24-05: a range in `text`, moved to the same characters in the typed input. */
export function rawRangeOfNormalized(normalized: NormalizeResult, span: { readonly start: number; readonly end: number }): { start: number; end: number } {
  const start = rawOffsetOfNormalized(normalized, span.start);
  if (span.end <= span.start) return { start, end: start };
  const end = rawEndOfNormalized(normalized, span.end - 1);
  return { start, end: Math.max(start, end) };
}

export interface NormalizeOptions {
  /** Trimmed line texts the user chose to read as code. */
  readonly readAsCode?: readonly string[];
}

const FULL_WIDTH: Record<string, string> = {
  "｜": "|", "／": "/", "＃": "#", "♭": "b", "♯": "#", "　": " ",
  "０": "0", "１": "1", "２": "2", "３": "3", "４": "4", "５": "5", "６": "6", "７": "7", "８": "8", "９": "9",
  "Ａ": "A", "Ｂ": "B", "Ｃ": "C", "Ｄ": "D", "Ｅ": "E", "Ｆ": "F", "Ｇ": "G", "Ｈ": "H", "Ｉ": "I", "Ｊ": "J",
  "Ｋ": "K", "Ｌ": "L", "Ｍ": "M", "Ｎ": "N", "Ｏ": "O", "Ｐ": "P", "Ｑ": "Q", "Ｒ": "R", "Ｓ": "S", "Ｔ": "T",
  "Ｕ": "U", "Ｖ": "V", "Ｗ": "W", "Ｘ": "X", "Ｙ": "Y", "Ｚ": "Z",
  "ａ": "a", "ｂ": "b", "ｃ": "c", "ｄ": "d", "ｅ": "e", "ｆ": "f", "ｇ": "g", "ｈ": "h", "ｉ": "i", "ｊ": "j",
  "ｋ": "k", "ｌ": "l", "ｍ": "m", "ｎ": "n", "ｏ": "o", "ｐ": "p", "ｑ": "q", "ｒ": "r", "ｓ": "s", "ｔ": "t",
  "ｕ": "u", "ｖ": "v", "ｗ": "w", "ｘ": "x", "ｙ": "y", "ｚ": "z",
};

const STRUCTURAL = new Set(["|", "||", "%", "_", "=", "x2", "×2", "X2", "(x2)", "（x2）", "N.C.", "N.C", "NC"]);
const HEADING = /^\[[^\]]*\]$/;
/** P25 V32: `--- A Section ---` / `=== Chorus ===` read as headings (a line of signs alone does not). */
const SIGN_HEADING = /^[-=*~]{2,}\s*([^-=*~\s][^]*?)\s*[-=*~]{2,}$/;
/** P25 V32: the sheet's setting lines (`Key: D minor`, `BPM: 108`, `Time Signature: 4/4`). */
const SETTING_KEY = /^(?:key|キー|調)\s*[:：]\s*(.+)$/i;
const SETTING_KEY_VALUE = /^([A-Ga-g])\s*([#♯b♭]?)\s*(major|maj|minor|min|m|メジャー|マイナー|長調|短調)?$/i;
const SETTING_BPM = /^(?:bpm|tempo|テンポ)\s*[:：=]\s*(\d{2,3}(?:\.\d+)?)\s*(?:bpm)?$/i;
const SETTING_METER = /^(?:time signature|time|meter|拍子)\s*[:：]\s*(\d{1,2})\s*\/\s*(\d{1,2})$/i;

/** P25 V32: the key a `Key:` line names (`D minor`, `Dm`, `E♭ major`, `Aマイナー` …), else undefined. */
function readSettingKey(value: string): string | undefined {
  const match = SETTING_KEY_VALUE.exec(value.trim());
  if (match === null) return undefined;
  const root = match[1]!.toUpperCase();
  const accidental = match[2] === "#" || match[2] === "♯" ? "#" : match[2] === "b" || match[2] === "♭" ? "b" : "";
  const quality = match[3];
  // `m`/`min`/`minor`/`マイナー`/`短調` are minor; a lone capital `M` is major, as is everything else.
  const minor = quality !== undefined && quality !== "M"
    && (quality.toLowerCase() === "m" || quality.toLowerCase() === "min" || quality.toLowerCase() === "minor"
      || quality === "マイナー" || quality === "短調");
  return `${root}${accidental} ${minor ? "minor" : "major"}`;
}

/** P25 V32: what one trimmed line sets, or undefined when it is not a setting line that reads. */
function readSettingLine(trimmed: string): NormalizeSetting | undefined {
  const key = SETTING_KEY.exec(trimmed);
  if (key !== null) {
    const value = readSettingKey(key[1] ?? "");
    return value === undefined ? undefined : { key: value };
  }
  const bpm = SETTING_BPM.exec(trimmed);
  if (bpm !== null) return { bpm: Math.round(Number(bpm[1])) };
  const meter = SETTING_METER.exec(trimmed);
  if (meter !== null) return { meter: `${meter[1]}/${meter[2]}` };
  return undefined;
}
/** Roman/numeric degrees (`ii7`, `V7`, `Imaj7`). They are a code line only when a key is chosen. */
const DEGREE_TOKEN = /^(?:[#b]?)(?:I|II|III|IV|V|VI|VII)(?:maj7|m7|7|m|dim|aug|sus4|sus2|6|9|11|13|maj9|m9)?$/;
const DEGREE_LOWER = /^(?:[#b]?)(?:ii|iii|iv|v|vi|vii)(?:7|m7|m|dim|ø7|m7b5)?$/;
export function isDegreeLike(token: string): boolean {
  return DEGREE_TOKEN.test(token) || DEGREE_LOWER.test(token);
}
const CHORD_ALIASES: ReadonlyArray<{ readonly pattern: RegExp; readonly replace: string }> = [
  // `CM7` / `C△7` / `CΔ7` → `Cmaj7`
  { pattern: /(^|[\s|/(])([A-G](?:#|b)?)(?:M7|△7|Δ7)(?=$|[\s|/),])/g, replace: "$1$2maj7" },
  // `ConG` → `C/G`
  { pattern: /(^|[\s|/(])([A-G](?:#|b)?)on([A-G](?:#|b)?)(?=$|[\s|),])/g, replace: "$1$2/$3" },
  // `C-7` → `Cm7` (a hyphen right after the root, followed by a digit). P25-06 E2: it also applies after a
  // dash that separates two chords, so `C-7-F-7` reads as `Cm7 Fm7`.
  { pattern: /(^|[\s|/(-])([A-G](?:#|b)?)-(\d)/g, replace: "$1$2m$3" },
];

interface BuiltLine {
  readonly text: string;
  /** For each character of `text`, its start offset in the original line. */
  readonly origin: number[];
}

/** A (1): full-width → half-width, runs of spaces → one, chord aliases. Offsets point at the typed line. */
function tidyLine(raw: string, line: number, changes: NormalizeChange[]): BuiltLine {
  let text = "";
  const origin: number[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]!;
    const half = FULL_WIDTH[character];
    text += half ?? character;
    origin.push(index);
    if (half !== undefined) changes.push({ line, start: index, end: index + 1, from: character, to: half });
  }
  // Runs of spaces become one (the indent at the head of the line is kept as it is).
  let collapsed = "";
  const collapsedOrigin: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === " " && text[index - 1] === " ") continue;
    collapsed += character;
    collapsedOrigin.push(origin[index]!);
  }
  text = collapsed;
  origin.length = 0;
  origin.push(...collapsedOrigin);
  for (const alias of CHORD_ALIASES) {
    for (let guard = 0; guard < 50; guard += 1) {
      alias.pattern.lastIndex = 0;
      const match = alias.pattern.exec(text);
      if (match === null) break;
      const start = match.index + (match[1]?.length ?? 0);
      const from = text.slice(start, match.index + match[0].length);
      const to = alias.replace.replace("$1", "").replace("$2", match[2] ?? "").replace("$3", match[3] ?? "");
      if (from === to) break;
      const at = origin[start] ?? 0;
      const endAt = (origin[match.index + match[0].length - 1] ?? at) + 1;
      text = text.slice(0, start) + to + text.slice(match.index + match[0].length);
      const replacementOrigin = Array.from({ length: to.length }, () => at);
      origin.splice(start, from.length, ...replacementOrigin);
      changes.push({ line, start: at, end: endAt, from, to });
    }
  }
  return { text, origin };
}

/** A chord name as the extended parser reads it; `am` (a lowercase root) is not one. */
function isChordName(token: string): boolean {
  if (/^[a-g]/.test(token.slice(0, 1))) return false;
  return parseExtendedTextChordLabel(token) !== undefined;
}

function readsAsCodeLine(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  // An over-long line is left to the parser, which is the one that reports the input budget.
  if (text.length > EXTENDED_TEXT_LIMITS.maxInputCodeUnits) return true;
  // A bar-delimited line is a chart line even when one of its words is not a chord: the parser says why.
  if (trimmed.includes("|")) return true;
  const words = trimmed.split(/\s+/);
  if (words.length === 0) return false;
  const everyWordReads = words.every((word) => {
    if (STRUCTURAL.has(word) || isDegreeLike(word)) return true;
    if (word.includes("|")) {
      const parts = word.split("|").filter((part) => part.length > 0);
      return parts.length > 0 && parts.every((part) => STRUCTURAL.has(part) || isDegreeLike(part) || isChordName(part));
    }
    return isChordName(word);
  });
  if (everyWordReads) return true;
  // A compact chart (`|C9B7(#9,#5)|Em9…`) or a spaced one (`A m7 G 7`) is a code line even when a word on
  // its own is not a chord: the parser itself is the judge of what it can read.
  const parsed = parseExtendedTextProgression(text, { beat: "4/4" });
  return parsed.state === "VALID" || parsed.state === "AMBIGUOUS";
}

/** The one normalising pass. Pure. */
export function normalizeTextScore(input: string, options: NormalizeOptions = {}): NormalizeResult {
  const forced = new Set((options.readAsCode ?? []).map((line) => line.trim()));
  const rawLines = input.split("\n");
  const lines: NormalizeLine[] = [];
  const changes: NormalizeChange[] = [];
  const code: string[] = [];
  const codeLineNumbers: number[] = [];
  const codeOrigins: number[][] = [];
  const lineRawStarts: number[] = [];
  const lyricChordLines: NormalizeLine[] = [];
  const separatedLines: NormalizeLine[] = [];
  const notices: NormalizeNotice[] = [];
  const voicings: NormalizeVoicing[] = [];
  let restructured = false;
  const settings: { key?: string; bpm?: number; meter?: string } = {};
  let rawCursor = 0;
  /** P25-06 E2: the chord just before this line, in the order the lines are read. */
  let lastChord: string | undefined;
  const rememberChords = (text: string) => {
    let found: string | undefined;
    for (const match of text.matchAll(/[^\s|]+/g)) {
      const word = match[0];
      if (isChordName(word) || isDegreeLike(word)) found = word;
    }
    if (found !== undefined) lastChord = found;
  };

  rawLines.forEach((raw, index) => {
    const line = index + 1;
    lineRawStarts.push(rawCursor);
    rawCursor += raw.length + 1;
    const trimmed = raw.trim();
    const tidied = tidyLine(raw, line, changes);
    // P25 V37: `Cmaj7{C3 G3 E4 B4 D5}` sets that chord's notes and comes out of the text before it is read.
    const lineNotices: NormalizeNotice[] = [];
    const braces = takeVoicingBraces(tidied, line, lineRawStarts[index] ?? 0, lineNotices);
    const built = braces.built;
    const text = built.text;
    if (trimmed === "") {
      lines.push({ line, kind: "blank", raw, text });
      return;
    }
    if (trimmed.startsWith("#")) {
      lines.push({ line, kind: "comment", raw, text });
      code.push(text);
      codeLineNumbers.push(line);
      codeOrigins.push(built.origin);
      return;
    }
    // The extended grammar's playback markers (`<` / `>`) are structure, not a lyric line.
    if (trimmed === "<" || trimmed === ">") {
      lines.push({ line, kind: "comment", raw, text });
      code.push(text);
      codeLineNumbers.push(line);
      codeOrigins.push(built.origin);
      return;
    }
    // P25 V32: the chord sheet's setting lines are read, not sent to the parser and not read as lyrics.
    const setting = readSettingLine(trimmed);
    if (setting !== undefined) {
      restructured = true;
      lines.push({ line, kind: "setting", raw, text, setting });
      if (setting.key !== undefined && settings.key === undefined) settings.key = setting.key;
      if (setting.bpm !== undefined && settings.bpm === undefined) settings.bpm = setting.bpm;
      if (setting.meter !== undefined && settings.meter === undefined) settings.meter = setting.meter;
      return;
    }
    if (HEADING.test(trimmed)) {
      restructured = true;
      lines.push({ line, kind: "heading", raw, text, heading: trimmed.slice(1, -1).trim() });
      return;
    }
    // P25 V32: `--- A Section ---` reads as a heading (`-----` alone still does not).
    const signHeading = SIGN_HEADING.exec(trimmed);
    if (signHeading !== null) {
      restructured = true;
      lines.push({ line, kind: "heading", raw, text, heading: (signHeading[1] ?? "").trim() });
      return;
    }
    if (!forced.has(trimmed)) {
      // P25-06 E: 歌詞 with the chords written in brackets reads as one chord per bar.
      const lyric = lyricChordLine(built);
      if (lyric !== undefined) {
        const entry: NormalizeLine = { line, kind: "code", raw, text: lyric.text };
        lines.push(entry);
        lyricChordLines.push(entry);
        code.push(lyric.text);
        codeLineNumbers.push(line);
        codeOrigins.push(lyric.origin);
        voicings.push(...braces.voicings);
        notices.push(...lineNotices);
        rememberChords(lyric.text);
        return;
      }
      // P25-06 E2: the comma/dash separators and the `.` repeat.
      const separated = separatedChartLine(built, line, lastChord);
      if (separated !== undefined) {
        const entry: NormalizeLine = { line, kind: "code", raw, text: separated.text };
        lines.push(entry);
        separatedLines.push(entry);
        code.push(separated.text);
        codeLineNumbers.push(line);
        codeOrigins.push(separated.origin);
        changes.push(...separated.changes);
        notices.push(...separated.notices);
        voicings.push(...braces.voicings);
        notices.push(...lineNotices);
        rememberChords(separated.text);
        return;
      }
    }
    if (forced.has(trimmed) || readsAsCodeLine(text)) {
      lines.push({ line, kind: "code", raw, text });
      code.push(text);
      codeLineNumbers.push(line);
      codeOrigins.push(built.origin);
      voicings.push(...braces.voicings);
      notices.push(...lineNotices);
      rememberChords(text);
      return;
    }
    restructured = true;
    lines.push({ line, kind: "skipped", raw, text });
  });

  return {
    text: code.join("\n"),
    codeLineNumbers,
    codeOrigins,
    lineRawStarts,
    lines,
    changes,
    skipped: lines.filter((entry) => entry.kind === "skipped"),
    headings: lines.filter((entry) => entry.kind === "heading"),
    restructured,
    settings,
    lyricChordLines,
    separatedLines,
    notices,
    voicings,
  };
}
