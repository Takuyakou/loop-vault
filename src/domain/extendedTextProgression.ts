import { parseTextChordLabel } from "./chords";
import { segmentScoreBar, normalizeScoreChord } from "./textScoreTokenizer";
import type { ChordSymbol } from "./types";
import {
  confirmedTextProgressionKeyState,
  TEXT_PROGRESSION_MAX_BARS,
  TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS,
  TEXT_PROGRESSION_MAX_TOKENS,
} from "./textProgression";

export const EXTENDED_TEXT_PARSER_VERSION = "extended-text-v1";
export const EXTENDED_TEXT_SEMANTIC_POLICY = "p8.8-explicit-factors-v1";

export interface TextSourceRange { readonly start: number; readonly end: number }
export interface ExtendedTextMetadata {
  readonly beat?: string;
  readonly key?: string;
  readonly confirmed?: boolean;
  readonly bpm?: number;
  readonly capo?: number;
}
export interface ExtendedTextDiagnostic {
  readonly code: string;
  readonly severity: "ERROR" | "WARNING" | "INFO";
  readonly message: string;
  readonly span: TextSourceRange;
  readonly line: number;
  readonly column: number;
  readonly rawToken: string;
}
export interface ExtendedTextSection {
  readonly kind: "comment" | "playback-start" | "playback-end";
  readonly line: number;
  readonly span: TextSourceRange;
  readonly raw: string;
}
export interface ExtendedTextSlot {
  readonly raw: string;
  readonly span: TextSourceRange;
  readonly bar: number;
  readonly slot: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly kind: "attack" | "reattack" | "hold" | "rest";
  readonly chord?: ChordSymbol;
}
export interface TextAttackEvent {
  readonly beat: number;
  readonly kind: "written" | "repeat";
  readonly span: TextSourceRange;
}
export interface TextHarmonicSpan {
  readonly chord: ChordSymbol;
  readonly writtenChord: string;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly attacks: readonly TextAttackEvent[];
  readonly sourceSpan: TextSourceRange;
}
export interface ExtendedTextResult {
  readonly source: string;
  readonly state: "EMPTY" | "VALID" | "INVALID" | "AMBIGUOUS";
  readonly bars: readonly (readonly string[])[];
  readonly slots: readonly ExtendedTextSlot[];
  readonly harmonicSpans: readonly TextHarmonicSpan[];
  readonly sections: readonly ExtendedTextSection[];
  readonly diagnostics: readonly ExtendedTextDiagnostic[];
  readonly metadata: ExtendedTextMetadata;
  readonly beatsPerBar: number;
  readonly scoreLengthBeats: number;
  readonly canConvert: boolean;
}

interface BarRange { readonly start: number; readonly end: number }
interface MutableSpan {
  chord: ChordSymbol;
  writtenChord: string;
  startBeat: number;
  durationBeats: number;
  attacks: TextAttackEvent[];
  sourceSpan: TextSourceRange;
}

/** Parses only the confirmed extended-v1 document grammar; raw UTF-16 source is never rewritten. */
export function parseExtendedTextProgression(
  source: string,
  metadata: ExtendedTextMetadata = {},
): ExtendedTextResult {
  const sections: ExtendedTextSection[] = [];
  const diagnostics: ExtendedTextDiagnostic[] = [];
  const bars: string[][] = [];
  const slots: ExtendedTextSlot[] = [];
  const spans: MutableSpan[] = [];
  const copiedMetadata = { ...metadata };
  const meter = parseMeter(metadata.beat);
  const beatsPerBar = meter ?? 4;
  if (metadata.beat !== undefined && meter === undefined) {
    diagnostics.push(issue(source, "UNSUPPORTED_METER", "Use a supported n/4 meter from 1/4 through 12/4.", { start: 0, end: 0 }));
  }
  if (metadata.bpm !== undefined && (!Number.isFinite(metadata.bpm) || metadata.bpm < 30 || metadata.bpm > 240)) {
    diagnostics.push(issue(source, "UNSUPPORTED_BPM", "BPM must be from 30 through 240.", { start: 0, end: 0 }));
  }
  if (metadata.capo !== undefined && (!Number.isInteger(metadata.capo) || metadata.capo < 0 || metadata.capo > 12)) {
    diagnostics.push(issue(source, "UNSUPPORTED_CAPO", "Capo must be an integer from 0 through 12.", { start: 0, end: 0 }));
  }
  if (metadata.confirmed && confirmedTextProgressionKeyState(metadata.key).kind !== "confirmed") {
    diagnostics.push(issue(source, "INVALID_KEY", "Confirmed key is not supported.", { start: 0, end: 0 }));
  }
  if (source.length > TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS) {
    diagnostics.push(issue(source, "INPUT_LIMIT", "Text is longer than the supported input budget.", { start: 0, end: source.length }));
    return result("INVALID");
  }

  const normalized = normalizeSourceLengthPreserving(source);
  const masked = normalized.split("");
  for (const line of lineRanges(source)) {
    const raw = source.slice(line.start, line.end);
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const position = raw.search(/\S/);
    const start = line.start + position;
    const span = { start, end: line.end };
    if (trimmed.startsWith("#")) {
      sections.push({ kind: "comment", line: location(source, start).line, span, raw });
      mask(masked, line.start, line.end);
    } else if (trimmed === "<" || trimmed === ">") {
      sections.push({ kind: trimmed === "<" ? "playback-start" : "playback-end", line: location(source, start).line, span, raw });
      mask(masked, line.start, line.end);
    } else if (/^(?:\[[^\]]*\]|[A-Za-z][A-Za-z0-9 _-]*:)$/u.test(trimmed)) {
      diagnostics.push(issue(source, /^BPM:/i.test(trimmed) ? "UNSUPPORTED_INLINE_DIRECTIVE" : "UNSUPPORTED_HEADER",
        "Use separate metadata fields; this header is not confirmed score syntax.", span));
      mask(masked, line.start, line.end);
    } else if (/^BPM\s*:/i.test(trimmed)) {
      diagnostics.push(issue(source, "UNSUPPORTED_INLINE_DIRECTIVE", "Set BPM outside the score text.", span));
      mask(masked, line.start, line.end);
    }
  }
  const score = masked.join("");
  const ranges = barRanges(score, source, diagnostics);
  if (ranges.length > TEXT_PROGRESSION_MAX_BARS) {
    diagnostics.push(issue(source, "BAR_LIMIT", "Too many bars.", { start: 0, end: source.length }));
  }
  let previousChord: ChordSymbol | undefined;
  let active: MutableSpan | undefined;
  let totalTokens = 0;
  for (const range of ranges.slice(0, TEXT_PROGRESSION_MAX_BARS)) {
    const barNumber = bars.length + 1;
    const segmented = segmentScoreBar(score, range.start, range.end, parseExtendedChordToken, true);
    if (segmented.kind !== "ok") {
      const code = segmented.kind === "ambiguous" ? "AMBIGUOUS_SEGMENTATION" : classifyInvalid(source.slice(range.start, range.end));
      diagnostics.push(issue(source, code, "This bar needs an unambiguous supported chord or control.", range));
      bars.push([]);
      continue;
    }
    const tokens = segmented.tokens.map(token => ({
      raw: source.slice(token.range.start, token.range.end),
      span: token.range,
    }));
    for (const token of tokens) {
      if (/ADD9\([^)]*(?:#9|b9)/i.test(token.raw)) {
        diagnostics.push(issue(source, "AMBIGUOUS_SEGMENTATION", "The added and altered ninth conflict.", token.span));
      }
    }
    bars.push(tokens.map(token => token.raw));
    totalTokens += tokens.length;
    if (totalTokens > TEXT_PROGRESSION_MAX_TOKENS) {
      diagnostics.push(issue(source, "TOKEN_LIMIT", "Too many score tokens.", range));
      break;
    }
    if (tokens.some((token, index) => token.raw === "=" &&
      ((index === 0 && !active) || (index > 0 && (tokens[index - 1]!.raw === "_" || /^N\.C\.$/i.test(tokens[index - 1]!.raw)))))) {
      diagnostics.push(issue(source, "INVALID_CONTROL_PREDECESSOR", "Hold needs immediately sounding harmony.", range));
    }
    if (!tokens.length || beatsPerBar % tokens.length !== 0) {
      diagnostics.push(issue(source, "UNSUPPORTED_RHYTHM", "Bar slots must divide the selected meter exactly on whole beats.", range));
      continue;
    }
    const duration = beatsPerBar / tokens.length;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!;
      const absolute = (barNumber - 1) * beatsPerBar + index * duration;
      const startBeat = index * duration + 1;
      if (token.raw === "_" || /^N\.C\.$/i.test(token.raw)) {
        slots.push({ ...token, bar: barNumber, slot: index + 1, startBeat, durationBeats: duration, kind: "rest" });
        active = undefined;
        continue;
      }
      if (token.raw === "=") {
        if (!active) diagnostics.push(issue(source, "INVALID_CONTROL_PREDECESSOR", "Hold needs immediately sounding harmony.", token.span));
        else {
          active.durationBeats += duration;
          active.sourceSpan = { start: active.sourceSpan.start, end: token.span.end };
          slots.push({ ...token, bar: barNumber, slot: index + 1, startBeat, durationBeats: duration, kind: "hold", chord: active.chord });
        }
        continue;
      }
      const repeat = token.raw === "%";
      const chord = repeat ? previousChord : parseExtendedChordToken(normalizeSourceLengthPreserving(token.raw));
      if (!chord) {
        diagnostics.push(issue(source, repeat ? "INVALID_CONTROL_PREDECESSOR" : classifyInvalid(token.raw),
          repeat ? "Repeat needs preceding harmony." : "Unsupported chord meaning.", token.span));
        active = undefined;
        continue;
      }
      const kind = repeat ? "reattack" : "attack";
      slots.push({ ...token, bar: barNumber, slot: index + 1, startBeat, durationBeats: duration, kind, chord });
      const sameHarmony = active && sameChord(active.chord, chord) && active.startBeat + active.durationBeats === absolute;
      if (sameHarmony) {
        active!.durationBeats += duration;
        active!.attacks.push({ beat: absolute, kind: repeat ? "repeat" : "written", span: token.span });
        active!.sourceSpan = { start: active!.sourceSpan.start, end: token.span.end };
      } else {
        active = { chord, writtenChord: token.raw, startBeat: absolute, durationBeats: duration,
          attacks: [{ beat: absolute, kind: repeat ? "repeat" : "written", span: token.span }], sourceSpan: token.span };
        spans.push(active);
      }
      previousChord = chord;
    }
  }
  const state = diagnostics.some(d => d.code === "AMBIGUOUS_SEGMENTATION") ? "AMBIGUOUS"
    : diagnostics.some(d => d.severity === "ERROR") ? "INVALID"
      : slots.length ? "VALID" : "EMPTY";
  return result(state);

  function result(state: ExtendedTextResult["state"]): ExtendedTextResult {
    return { source, state, bars, slots, harmonicSpans: spans, sections, diagnostics,
      metadata: copiedMetadata, beatsPerBar, scoreLengthBeats: bars.length * beatsPerBar,
      canConvert: state === "VALID" && spans.length > 0 };
  }
}

function parseExtendedChordToken(raw: string): ChordSymbol | undefined {
  const normalized = normalizeScoreChord(normalizeSourceLengthPreserving(raw));
  const direct = parseTextChordLabel(normalized);
  if (direct) return direct;
  const onBass = /^(.*)on([A-G](?:#|b)*)$/.exec(normalized);
  return onBass ? parseTextChordLabel(`${onBass[1]}/${onBass[2]}`) ?? undefined : undefined;
}

function normalizeSourceLengthPreserving(source: string): string {
  return [...source].map(char => {
    const code = char.charCodeAt(0);
    if (code >= 0xff01 && code <= 0xff5e) return String.fromCharCode(code - 0xfee0);
    if (char === "　") return " ";
    if (char === "♭") return "b";
    if (char === "♯") return "#";
    return char;
  }).join("");
}

function* lineRanges(source: string): Generator<TextSourceRange> {
  let start = 0;
  for (let index = 0; index <= source.length; index += 1) {
    if (index === source.length || source[index] === "\n") {
      yield { start, end: source[index - 1] === "\r" ? index - 1 : index };
      start = index + 1;
    }
  }
}

function mask(chars: string[], start: number, end: number): void {
  for (let index = start; index < end; index += 1) chars[index] = " ";
}

function barRanges(score: string, source: string, diagnostics: ExtendedTextDiagnostic[]): BarRange[] {
  const result: BarRange[] = [];
  for (const line of lineRanges(score)) {
    const text = score.slice(line.start, line.end);
    if (!text.trim()) continue;
    if (!text.includes("|")) {
      const bare = segmentScoreBar(score, line.start, line.end, parseExtendedChordToken, true);
      if (bare.kind === "ok" && bare.tokens.length > 1 && bare.tokens.every((token, index) =>
        (index === 0 || /\s/u.test(source.slice(bare.tokens[index - 1]!.range.end, token.range.start))) &&
        parseExtendedChordToken(score.slice(token.range.start, token.range.end)) !== undefined)) {
        result.push(...bare.tokens.map(token => token.range));
        continue;
      }
    }
    let start = line.start;
    const delimiters: number[] = [];
    for (let index = line.start; index < line.end; index += 1) if (score[index] === "|") delimiters.push(index);
    for (const delimiter of [...delimiters, line.end]) {
      const fragment = score.slice(start, delimiter);
      if (fragment.trim()) result.push({ start, end: delimiter });
      else if (start !== line.start && delimiter !== line.end) {
        diagnostics.push(issue(source, "EMPTY_INTERIOR_BAR", "An empty bar lies between separators.", { start, end: delimiter + 1 }));
      }
      start = delimiter + 1;
    }
  }
  return result;
}

function sameChord(left: ChordSymbol, right: ChordSymbol): boolean {
  return left.root === right.root && left.quality === right.quality && left.bass === right.bass
    && left.tensions.join("|") === right.tensions.join("|")
    && (left.omissions ?? []).join("|") === (right.omissions ?? []).join("|");
}

function parseMeter(value: string | undefined): number | undefined {
  if (value === undefined) return 4;
  const match = /^([1-9]|1[0-2])\/4$/.exec(value);
  return match ? Number(match[1]) : undefined;
}

function classifyInvalid(raw: string): string {
  if (/\p{Extended_Pictographic}/u.test(raw)) return "UNKNOWN_CHARACTER";
  if (/[—–]/u.test(raw)) return "UNRECOGNIZED_PUNCTUATION";
  if (/\/\/|\/.*\//.test(raw)) return "MALFORMED_SLASH";
  if (/\([^()]*\).*\(/.test(raw)) return "SEMANTIC_GAP";
  return "INVALID_CHORD";
}

function location(source: string, offset: number): { line: number; column: number } {
  const prefix = source.slice(0, offset);
  const lastNewline = prefix.lastIndexOf("\n");
  return { line: prefix.split("\n").length, column: offset - lastNewline };
}

function issue(source: string, code: string, message: string, span: TextSourceRange): ExtendedTextDiagnostic {
  return { code, severity: "ERROR", message, span, ...location(source, span.start),
    rawToken: source.slice(span.start, span.end) };
}
