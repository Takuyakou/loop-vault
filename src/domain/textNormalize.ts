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
export type NormalizeLineKind = "code" | "skipped" | "heading" | "comment" | "blank";

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
    .filter((line) => line.kind === "code" || line.kind === "heading" || line.kind === "comment")
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
  // `C-7` → `Cm7` (only a hyphen right after the root, followed by a digit)
  { pattern: /(^|[\s|/(])([A-G](?:#|b)?)-(\d)/g, replace: "$1$2m$3" },
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
  let restructured = false;
  let rawCursor = 0;

  rawLines.forEach((raw, index) => {
    const line = index + 1;
    lineRawStarts.push(rawCursor);
    rawCursor += raw.length + 1;
    const trimmed = raw.trim();
    const built = tidyLine(raw, line, changes);
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
    if (HEADING.test(trimmed)) {
      restructured = true;
      lines.push({ line, kind: "heading", raw, text, heading: trimmed.slice(1, -1).trim() });
      return;
    }
    if (forced.has(trimmed) || readsAsCodeLine(text)) {
      lines.push({ line, kind: "code", raw, text });
      code.push(text);
      codeLineNumbers.push(line);
      codeOrigins.push(built.origin);
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
  };
}
