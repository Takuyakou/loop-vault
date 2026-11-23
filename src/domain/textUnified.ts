import {
  parseExtendedTextChordLabel,
  parseExtendedTextProgression,
  type ExtendedTextDiagnostic,
  type ExtendedTextMetadata,
  type ExtendedTextResult,
  type ExtendedTextSection,
  type ExtendedTextSlot,
  type TextHarmonicSpan,
} from "./extendedTextProgression";
import { EXTENDED_TEXT_LIMITS } from "./extendedTextBudgets";
import { parseTextProgression } from "./textProgression";
import type { ChordSymbol } from "./types";
import {
  isDegreeLike,
  normalizeTextScore,
  rawRangeOfNormalized,
  type NormalizeResult,
} from "./textNormalize";

/**
 * P24-05 05-a: one grammar for the text intake.
 *
 * The extended grammar is the base (it reads 35 inputs the old standard grammar could not). On top of it
 * this module adds what only the standard grammar had:
 * - Roman/numeric degrees, but only with a key the user confirmed;
 * - a rest-only progression is readable (no chord at all is a valid, silent progression);
 * - one meter range (1/4–12/4), the extended one.
 *
 * The old parsers and their tests stay as they are; this is the one entry the product uses.
 */
/** The extended metadata, plus the lines the user chose to read as code. */
export type UnifiedTextOptions = ExtendedTextMetadata & { readonly readAsCode?: readonly string[] };

export type UnifiedDiagnosticCode =
  | "unknown-token"
  | "unknown-chord"
  | "degree-requires-confirmed-key"
  | "unsupported-subdivision"
  | "empty-bar"
  | "unknown-character"
  | "input-too-long"
  | "too-many-bars"
  | "too-many-tokens"
  | "too-many-spans"
  | "unsupported-meter"
  | "unsupported-bpm"
  | "unsupported-capo"
  | "invalid-key"
  | "control-needs-harmony"
  | "unsupported-header"
  | "inline-directive"
  | "ambiguous-tokenization"
  | "malformed-chord"
  | "unsupported-notation"
  | "invalid-structure";

export interface UnifiedDiagnostic {
  readonly code: UnifiedDiagnosticCode;
  /** The one Japanese sentence the screen shows. */
  readonly message: string;
  readonly severity: "ERROR" | "WARNING" | "INFO";
  /** The characters in `text` (the parser's view), kept for the domain. */
  readonly span: { readonly start: number; readonly end: number };
  /** P24-05: the same characters in what the user typed (the input's underlines and moves). */
  readonly rawSpan: { readonly start: number; readonly end: number };
  /** The 1-based line in the input. */
  readonly line: number;
  readonly column: number;
  readonly token: string;
  /** The parser's own code, kept so the sentence can be rebuilt when the token narrows. */
  readonly reasonCode: string;
}

export interface UnifiedTextResult {
  /** Exactly what the user typed. */
  readonly source: string;
  readonly normalized: NormalizeResult;
  /** What the parser read (normalised code lines, degrees already turned into chord labels). */
  readonly text: string;
  readonly state: "EMPTY" | "VALID" | "INVALID" | "AMBIGUOUS";
  readonly canConvert: boolean;
  readonly beatsPerBar: number;
  readonly scoreLengthBeats: number;
  readonly bars: readonly (readonly string[])[];
  /** The bar ranges in what the user typed (for the heading groups and the error locations). */
  readonly barSourceSpans: readonly { readonly start: number; readonly end: number }[];
  readonly slots: readonly ExtendedTextSlot[];
  readonly spans: readonly TextHarmonicSpan[];
  readonly sections: readonly ExtendedTextSection[];
  readonly diagnostics: readonly UnifiedDiagnostic[];
  readonly metadata: ExtendedTextMetadata;
}

/**
 * The screen's sentences. Every error is one sentence: what is wrong (the token included), with the line
 * and bar shown next to it by the list. No English and no internal names reach the screen.
 */
function messageFor(code: string, token: string): string {
  const quoted = token.trim() === "" ? "この書き方" : `「${token.trim()}」`;
  const limits = EXTENDED_TEXT_LIMITS;
  switch (code) {
    case "UNKNOWN_CHORD":
    case "INVALID_CHORD":
    case "UNKNOWN_TOKEN":
      return `${quoted}はコードとして読めません。`;
    case "UNKNOWN_CHARACTER":
    case "UNRECOGNIZED_PUNCTUATION":
      return `${quoted}の文字は使えません。`;
    case "MALFORMED_SLASH":
      return `${quoted}のスラッシュの書き方が正しくありません。`;
    case "EMPTY_INTERIOR_BAR":
      return "小節線の間に空の小節があります。";
    case "UNSUPPORTED_SUBDIVISION":
      return `${quoted}の小節は等分できません。1・2・3・4・6・8・12 のどれかで区切ってください。`;
    case "AMBIGUOUS_SEGMENTATION":
      return `${quoted}は一通りに読めません。コードの間に空白を入れてください。`;
    case "INVALID_CONTROL_PREDECESSOR":
      return `${quoted}は、前に鳴っているコードが要ります。`;
    case "UNSUPPORTED_RHYTHM":
      return `${quoted}のリズムは読めません。小節を等分してください。`;
    case "SEMANTIC_GAP":
      return `${quoted}はまだ扱えません。`;
    case "BAR_LIMIT":
      return `小節が多すぎます。${limits.maxBars} 小節までにしてください。`;
    case "TOKEN_LIMIT":
      return `コードが多すぎます。1 つの進行に ${limits.maxScoreTokens} までにしてください。`;
    case "INPUT_LIMIT":
    case "INPUT_LIMIT_EXCEEDED":
      return `文字が多すぎます。${limits.maxInputCodeUnits} 文字までにしてください。`;
    case "UNSUPPORTED_METER":
      return `${quoted}の拍子は使えません。1/4〜12/4 にしてください。`;
    case "UNSUPPORTED_BPM":
      return "BPM は 30〜240 にしてください。";
    case "UNSUPPORTED_CAPO":
      return "カポは 0〜12 にしてください。";
    case "INVALID_KEY":
      return `${quoted}のキーは使えません。`;
    case "UNSUPPORTED_HEADER":
      return `${quoted}の行は見出しとして読みます。`;
    case "UNSUPPORTED_INLINE_DIRECTIVE":
      return "BPM やキーは、上の欄で指定してください。";
    default:
      return `${quoted}の書き方は読めません。`;
  }
}

const CODES: Record<string, UnifiedDiagnosticCode> = {
  UNKNOWN_CHORD: "unknown-chord",
  INVALID_CHORD: "unknown-chord",
  UNKNOWN_TOKEN: "unknown-token",
  UNKNOWN_CHARACTER: "unknown-character",
  UNRECOGNIZED_PUNCTUATION: "unknown-character",
  MALFORMED_SLASH: "malformed-chord",
  EMPTY_INTERIOR_BAR: "empty-bar",
  UNSUPPORTED_SUBDIVISION: "unsupported-subdivision",
  AMBIGUOUS_SEGMENTATION: "ambiguous-tokenization",
  INVALID_CONTROL_PREDECESSOR: "control-needs-harmony",
  UNSUPPORTED_RHYTHM: "unsupported-subdivision",
  SEMANTIC_GAP: "malformed-chord",
  BAR_LIMIT: "too-many-bars",
  TOKEN_LIMIT: "too-many-tokens",
  INPUT_LIMIT: "input-too-long",
  INPUT_LIMIT_EXCEEDED: "input-too-long",
  UNSUPPORTED_METER: "unsupported-meter",
  UNSUPPORTED_BPM: "unsupported-bpm",
  UNSUPPORTED_CAPO: "unsupported-capo",
  INVALID_KEY: "invalid-key",
  UNSUPPORTED_HEADER: "unsupported-header",
  UNSUPPORTED_INLINE_DIRECTIVE: "inline-directive",
};

/** The standard grammar's answer for one degree token, or undefined when it does not read it. */
function degreeChordLabel(token: string, key: string): string | undefined {
  if (!isDegreeLike(token)) return undefined;
  const parsed = parseTextProgression(`| ${token} |`, { confirmedKey: key });
  const event = parsed.events[0];
  return parsed.canConvert && event !== undefined ? event.canonical : undefined;
}

/**
 * Turns degree tokens into absolute chord labels, keeping a map from the converted text back to the
 * normalised text so every span the parser reports still points at the line the user typed.
 */
function convertDegrees(text: string, key: string): { text: string; map: number[] } {
  let output = "";
  const map: number[] = [];
  const tokenPattern = /[^\s|]+/g;
  let cursor = 0;
  for (let match = tokenPattern.exec(text); match !== null; match = tokenPattern.exec(text)) {
    const start = match.index;
    while (cursor < start) {
      output += text[cursor]!;
      map.push(cursor);
      cursor += 1;
    }
    const token = match[0];
    const label = degreeChordLabel(token, key);
    const replacement = label ?? token;
    for (let offset = 0; offset < replacement.length; offset += 1) {
      map.push(label === undefined ? start + offset : start);
    }
    output += replacement;
    cursor = start + token.length;
  }
  while (cursor < text.length) {
    output += text[cursor]!;
    map.push(cursor);
    cursor += 1;
  }
  return { text: output, map };
}

function mapSpan(span: { start: number; end: number }, map: readonly number[]): { start: number; end: number } {
  if (map.length === 0) return { start: 0, end: 0 };
  const start = map[Math.max(0, Math.min(map.length - 1, span.start))] ?? 0;
  const last = map[Math.max(0, Math.min(map.length - 1, Math.max(span.start, span.end - 1)))] ?? start;
  return { start, end: Math.max(start, last + 1) };
}

/** P24-05: the typed line a raw offset sits on (1-based), for the list's 「n 行目」. */
function rawLineOf(normalized: NormalizeResult, offset: number): number {
  let line = 1;
  for (let index = 0; index < normalized.lineRawStarts.length; index += 1) {
    if ((normalized.lineRawStarts[index] ?? 0) <= offset) line = index + 1;
    else break;
  }
  return line;
}

function toUnified(diagnostic: ExtendedTextDiagnostic, normalized: NormalizeResult, map: readonly number[]): UnifiedDiagnostic {
  const span = mapSpan(diagnostic.span, map);
  const rawSpan = rawRangeOfNormalized(normalized, span);
  const line = rawLineOf(normalized, rawSpan.start);
  const lineStart = normalized.lineRawStarts[line - 1] ?? 0;
  return {
    code: CODES[diagnostic.code] ?? "invalid-structure",
    message: messageFor(diagnostic.code, diagnostic.rawToken),
    severity: diagnostic.severity,
    span,
    rawSpan,
    line,
    column: rawSpan.start - lineStart + 1,
    token: diagnostic.rawToken,
    reasonCode: diagnostic.code,
  };
}

/** P24-05: words that are structure, never a chord to read. */
const STRUCTURAL_WORDS = new Set(["|", "||", "%", "_", "=", "x2", "×2", "X2", "(x2)", "（x2）", "N.C.", "N.C", "NC", "<", ">"]);

/** One word the screen can play at once, with the characters it was written with. */
export function readableTextToken(word: string): ChordSymbol | undefined {
  const trimmed = word.trim();
  if (trimmed === "" || STRUCTURAL_WORDS.has(trimmed) || isDegreeLike(trimmed)) return undefined;
  return parseExtendedTextChordLabel(trimmed);
}

/**
 * P24-05: when the bar could not be segmented, the parser names the whole bar. The screen names the one
 * word that failed (the design's 「Xm7 はコードとして読めません。」) and can then fix just that word.
 */
function refineUnreadableToken(
  diagnostic: UnifiedDiagnostic,
  convertedText: string,
  convertedMap: readonly number[],
  normalized: NormalizeResult,
  input: string,
): UnifiedDiagnostic {
  if (diagnostic.code !== "unknown-chord" && diagnostic.code !== "unknown-token" && diagnostic.code !== "malformed-chord") {
    return diagnostic;
  }
  const text = convertedText.slice(diagnostic.span.start, diagnostic.span.end);
  const pattern = /[^\s|]+/g;
  let bad: { start: number; end: number } | undefined;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const word = match[0];
    if (STRUCTURAL_WORDS.has(word) || isDegreeLike(word)) continue;
    if (parseExtendedTextChordLabel(word) !== undefined) continue;
    bad = { start: diagnostic.span.start + match.index, end: diagnostic.span.start + match.index + word.length };
    break;
  }
  if (bad === undefined) return diagnostic;
  const rawSpan = rawRangeOfNormalized(normalized, mapSpan(bad, convertedMap));
  const line = rawLineOf(normalized, rawSpan.start);
  const lineStart = normalized.lineRawStarts[line - 1] ?? 0;
  const token = input.slice(rawSpan.start, rawSpan.end);
  return {
    ...diagnostic,
    rawSpan,
    line,
    column: rawSpan.start - lineStart + 1,
    token,
    message: messageFor(diagnostic.reasonCode, token),
  };
}

/** The one entry. Pure; the old parsers remain available for their own tests. */
export function parseUnifiedText(input: string, options: UnifiedTextOptions = {}): UnifiedTextResult {
  const normalized = normalizeTextScore(input, options.readAsCode === undefined ? {} : { readAsCode: options.readAsCode });
  const confirmedKey = options.confirmed === true ? options.key : undefined;
  const converted = confirmedKey === undefined
    ? { text: normalized.text, map: normalized.text.split("").map((_character, index) => index) }
    : convertDegrees(normalized.text, confirmedKey);
  const parsed: ExtendedTextResult = parseExtendedTextProgression(converted.text, options);
  const diagnostics: UnifiedDiagnostic[] = parsed.diagnostics
    .map((diagnostic) => toUnified(diagnostic, normalized, converted.map))
    .map((diagnostic) => refineUnreadableToken(diagnostic, converted.text, converted.map, normalized, input));

  // Degrees without a key are the one error the extended grammar cannot name by itself.
  if (confirmedKey === undefined) {
    for (const match of converted.text.matchAll(/[^\s|]+/g)) {
      if (!isDegreeLike(match[0])) continue;
      const span = mapSpan({ start: match.index, end: match.index + match[0].length }, converted.map);
      if (diagnostics.some((entry) => entry.code === "degree-requires-confirmed-key"
        && entry.span.start === span.start && entry.span.end === span.end)) continue;
      const rawSpan = rawRangeOfNormalized(normalized, span);
      const line = rawLineOf(normalized, rawSpan.start);
      const lineStart = normalized.lineRawStarts[line - 1] ?? 0;
      diagnostics.push({
        code: "degree-requires-confirmed-key",
        message: messageFor("DEGREE_REQUIRES_KEY", match[0]),
        severity: "ERROR",
        span,
        rawSpan,
        line,
        column: rawSpan.start - lineStart + 1,
        token: match[0],
        reasonCode: "DEGREE_REQUIRES_KEY",
      });
    }
  }

  // P24-05: a progression of rests is a valid, silent progression (the old standard grammar's answer).
  const restOnly = parsed.state === "VALID" && parsed.harmonicSpans.length === 0 && parsed.slots.length > 0;
  const hasError = diagnostics.some((entry) => entry.severity === "ERROR");
  const canConvert = !hasError && (parsed.canConvert || restOnly);

  const state: UnifiedTextResult["state"] = restOnly ? "VALID" : parsed.state;
  const toRaw = (span: { start: number; end: number }) => rawRangeOfNormalized(normalized, mapSpan(span, converted.map));
  return {
    source: input,
    normalized,
    text: converted.text,
    state,
    canConvert,
    beatsPerBar: parsed.beatsPerBar,
    scoreLengthBeats: parsed.scoreLengthBeats,
    bars: parsed.bars,
    barSourceSpans: parsed.barSourceSpans.map(toRaw),
    slots: parsed.slots.map((slot) => ({ ...slot, span: toRaw(slot.span) })),
    spans: parsed.harmonicSpans.map((span) => ({
      ...span,
      sourceSpan: toRaw(span.sourceSpan),
      attacks: span.attacks.map((attack) => ({ ...attack, span: toRaw(attack.span) })),
    })),
    sections: parsed.sections.map((section) => ({ ...section, span: toRaw(section.span) })),
    diagnostics,
    metadata: parsed.metadata,
  };
}

/** The extended parser's own limits, exposed so the screen and the save path share one number. */
export const UNIFIED_TEXT_LIMITS = EXTENDED_TEXT_LIMITS;

/**
 * The shape the existing save code reads (`buildSavedTextSource`), built from the one entry's result.
 * The stored source keeps the text the user typed, so re-opening a saved progression re-reads exactly it.
 */
export function asExtendedTextResult(result: UnifiedTextResult): ExtendedTextResult {
  return {
    source: result.source,
    state: result.state,
    bars: result.bars,
    barSourceSpans: [...result.barSourceSpans],
    slots: result.slots,
    harmonicSpans: result.spans,
    sections: result.sections,
    diagnostics: [],
    metadata: result.metadata,
    beatsPerBar: result.beatsPerBar,
    scoreLengthBeats: result.scoreLengthBeats,
    canConvert: result.canConvert,
  };
}
