import { labelFromSymbol, parseChordLabel } from "./chords";
import { parseFastChordEntry } from "./progressionEditing/fastLabelEntry";
import { parseKeySignature } from "./progressionEditing/chordSuggestions";
import type { ChordSymbol } from "./types";

/** P5.20 Grammar v1 is deliberately small so conversion stays exact. */
export const TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS = 4_096;
export const TEXT_PROGRESSION_MAX_BARS = 12;
export const TEXT_PROGRESSION_MAX_TOKENS = 48;
export const TEXT_PROGRESSION_BEATS_PER_BAR = 4;

const chordCounts = new Set([1, 2, 4]);
/** Mirrors the existing Vault Chord Context section lengths (in beats). */
const chordContextSectionBeats = [4, 8, 16, 32, 48] as const;
const keyRootLabels = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

export type TextProgressionNotation = "bar" | "simple" | "invalid";
export type TextProgressionKeyMode = "major" | "minor";

export interface TextProgressionRange {
  /** UTF-16 code-unit offsets in the supplied input, end-exclusive. */
  readonly start: number;
  readonly end: number;
}

export interface TextProgressionKeyCandidate {
  /** Canonical display spelling, for example `C major`. */
  readonly key: string;
  readonly tonicPitchClass: number;
  readonly mode: TextProgressionKeyMode;
  /** Number of entered absolute chords compatible with this candidate. */
  readonly support: number;
  /** Number of entered absolute chords that conflict with this candidate. */
  readonly conflicts: number;
}

/**
 * Inferred candidates are transient suggestions, never a substitute for an
 * explicit user confirmation. The type intentionally has no confidence field:
 * it is text-only harmonic compatibility, not MIDI analysis evidence.
 */
export type TextProgressionKeyState =
  | { readonly kind: "unknown" }
  | { readonly kind: "inferred"; readonly candidates: readonly TextProgressionKeyCandidate[] }
  | {
    readonly kind: "confirmed";
    readonly key: string;
    readonly tonicPitchClass: number;
    readonly mode: TextProgressionKeyMode;
  };

export type TextProgressionDiagnosticCode =
  | "empty-input"
  | "input-too-long"
  | "unsupported-meter"
  | "malformed-bar-notation"
  | "empty-bar"
  | "too-many-bars"
  | "too-many-tokens"
  | "three-chord-bar"
  | "invalid-chord-count"
  | "invalid-chord"
  | "degree-requires-confirmed-key"
  | "no-chord-not-supported"
  | "unsupported-repeat"
  | "unsupported-comment"
  | "unsupported-section-header"
  | "lyric-mixed-text";

export interface TextProgressionDiagnostic {
  readonly code: TextProgressionDiagnosticCode;
  readonly message: string;
  readonly range: TextProgressionRange;
  readonly bar?: number;
}

export interface TextProgressionToken {
  readonly index: number;
  readonly raw: string;
  readonly range: TextProgressionRange;
  readonly bar: number;
  /** Present only when the bar has an exact v1 timing allocation. */
  readonly startBeat?: number;
  /** Present only when the bar has an exact v1 timing allocation. */
  readonly durationBeats?: 1 | 2 | 4;
  /** Existing-parser canonical display label, present for a valid token. */
  readonly canonical?: string;
  /** Transient parsed identity. No source MIDI or analyzer evidence is added. */
  readonly chord?: ChordSymbol;
  readonly diagnostics: readonly TextProgressionDiagnostic[];
}

export interface TextProgressionEvent {
  readonly raw: string;
  readonly canonical: string;
  readonly range: TextProgressionRange;
  readonly bar: number;
  /** One-based beat inside the 4/4 bar. */
  readonly startBeat: number;
  readonly durationBeats: 1 | 2 | 4;
  readonly chord: ChordSymbol;
}

export interface TextProgressionParseResult {
  readonly input: string;
  readonly notation: TextProgressionNotation;
  readonly bars: number;
  readonly tokens: readonly TextProgressionToken[];
  /** Valid, exactly-timed transient events only. */
  readonly events: readonly TextProgressionEvent[];
  readonly diagnostics: readonly TextProgressionDiagnostic[];
  readonly keyState: TextProgressionKeyState;
  /**
   * A conversion gate, not a partial-success flag. Any diagnostic prevents a
   * Draft bridge from consuming the result.
   */
  readonly canConvert: boolean;
}

export interface TextProgressionMeter {
  readonly numerator: number;
  readonly denominator: number;
}

export interface ParseTextProgressionOptions {
  /** Grammar v1 accepts 4/4 only. Omit for the fixed default. */
  readonly meter?: TextProgressionMeter;
  /** Existing key state, used only when it is explicitly confirmed. */
  readonly keyState?: TextProgressionKeyState;
  /** Convenience form for a user-confirmed key such as `C major`. */
  readonly confirmedKey?: string;
}

export type TextProgressionCapabilityName =
  | "vault-save"
  | "chord-dojo"
  | "bass-practice"
  | "chord-context"
  | "root-motion"
  | "voicing-memory";

export type TextProgressionCapabilityStatus = "supported" | "unsupported" | "unknown";

export interface TextProgressionCapability {
  readonly name: TextProgressionCapabilityName;
  readonly status: TextProgressionCapabilityStatus;
  readonly reason: string;
}

export interface EvaluateTextProgressionCapabilitiesInput {
  readonly result: TextProgressionParseResult;
  /** Chord Context accepts the existing 30–240 BPM range. */
  readonly bpm?: number;
  /** Root Motion remains unknown until the user explicitly selects 2–8 roots. */
  readonly rootMotionNoteCount?: 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

interface RawToken {
  readonly raw: string;
  readonly range: TextProgressionRange;
}

interface BarInput {
  readonly bar: number;
  readonly tokens: readonly RawToken[];
  readonly range: TextProgressionRange;
}

interface TextProgressionSafeChordContextSection {
  readonly startBar: number;
  readonly endBar: number;
  readonly lengthBeats: (typeof chordContextSectionBeats)[number];
  /** Existing Vault Root Motion counts section chord roots, not unique pitch classes. */
  readonly rootCount: number;
}

interface ChordContextEligibility {
  readonly capability: TextProgressionCapability;
  readonly sections: readonly TextProgressionSafeChordContextSection[];
}

/** A fresh unknown state makes the absence of a confirmed key explicit. */
export function unknownTextProgressionKeyState(): TextProgressionKeyState {
  return { kind: "unknown" };
}

/**
 * Canonicalises a user-selected key only when it is accepted by the same key
 * parser used by Fast Label Entry. Invalid values remain unknown.
 */
export function confirmedTextProgressionKeyState(value: string | undefined): TextProgressionKeyState {
  const parsed = parseKeySignature(value);
  if (!parsed || !value) return unknownTextProgressionKeyState();
  const root = /^([A-G](?:#|b)?)/i.exec(value.trim())?.[1];
  if (!root) return unknownTextProgressionKeyState();
  const canonicalRoot = `${root[0]!.toUpperCase()}${root.slice(1)}`;
  const mode: TextProgressionKeyMode = parsed.minor ? "minor" : "major";
  return {
    kind: "confirmed",
    key: `${canonicalRoot} ${mode}`,
    tonicPitchClass: parsed.root,
    mode,
  };
}

export function isConfirmedTextProgressionKey(
  state: TextProgressionKeyState | undefined,
): state is Extract<TextProgressionKeyState, { readonly kind: "confirmed" }> {
  return state?.kind === "confirmed" && Boolean(parseKeySignature(state.key));
}

/**
 * Parses bounded P5.20 text without creating persistent entities or synthetic
 * MIDI/analyzer evidence. Token diagnostics are retained for the UI, while
 * `canConvert` rejects any partial conversion.
 */
export function parseTextProgression(
  input: string,
  options: ParseTextProgressionOptions = {},
): TextProgressionParseResult {
  const diagnostics: TextProgressionDiagnostic[] = [];
  const initialKeyState = resolveInitialKeyState(options);
  const unsupportedMeter = options.meter !== undefined && !isFourFour(options.meter);
  if (unsupportedMeter) {
    diagnostics.push(diagnostic(
      "unsupported-meter",
      "Text Progression Entry v1 supports 4/4 only.",
      wholeRange(input),
    ));
  }

  if (input.length > TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS) {
    diagnostics.push(diagnostic(
      "input-too-long",
      `Text progression input is limited to ${TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS} UTF-16 code units.`,
      wholeRange(input),
    ));
    return createResult(input, "invalid", 0, [], diagnostics, initialKeyState);
  }

  const boundary = nonWhitespaceBoundary(input);
  if (!boundary) {
    diagnostics.push(diagnostic("empty-input", "Enter at least one chord token.", wholeRange(input)));
    return createResult(input, "invalid", 0, [], diagnostics, initialKeyState);
  }

  const containsBarDelimiter = input.includes("|");
  const bars = containsBarDelimiter
    ? parseBarNotation(input, boundary, diagnostics)
    : parseSimpleNotation(input, boundary);
  const notation: TextProgressionNotation = containsBarDelimiter
    ? bars ? "bar" : "invalid"
    : "simple";
  if (!bars) return createResult(input, notation, 0, [], diagnostics, initialKeyState);

  if (bars.length > TEXT_PROGRESSION_MAX_BARS) {
    diagnostics.push(diagnostic(
      "too-many-bars",
      `Text Progression Entry accepts at most ${TEXT_PROGRESSION_MAX_BARS} bars.`,
      wholeRange(input),
    ));
  }

  const rawTokenCount = bars.reduce((count, bar) => count + bar.tokens.length, 0);
  if (rawTokenCount > TEXT_PROGRESSION_MAX_TOKENS) {
    diagnostics.push(diagnostic(
      "too-many-tokens",
      `Text Progression Entry accepts at most ${TEXT_PROGRESSION_MAX_TOKENS} chord tokens.`,
      wholeRange(input),
    ));
  }

  // Keep parser output bounded too. The global diagnostic preserves the fact
  // that the source exceeded grammar v1, while no truncated subset is usable.
  const boundedBars = bars.slice(0, TEXT_PROGRESSION_MAX_BARS);
  const tokens: TextProgressionToken[] = [];
  let index = 0;
  for (const bar of boundedBars) {
    const count = bar.tokens.length;
    const allocation = timingForChordCount(count);
    const visibleTokens = bar.tokens.slice(0, Math.max(0, TEXT_PROGRESSION_MAX_TOKENS - tokens.length));
    if (count === 0) {
      diagnostics.push(diagnostic("empty-bar", "Empty bars are not supported in Text Progression Entry.", bar.range, bar.bar));
    } else if (count === 3) {
      diagnostics.push(diagnostic("three-chord-bar", "Three chords per bar cannot be represented exactly in grammar v1.", bar.range, bar.bar));
    } else if (!chordCounts.has(count)) {
      diagnostics.push(diagnostic("invalid-chord-count", "Each 4/4 bar must contain exactly 1, 2, or 4 chord tokens.", bar.range, bar.bar));
    }

    for (let tokenIndex = 0; tokenIndex < visibleTokens.length; tokenIndex += 1) {
      const rawToken = visibleTokens[tokenIndex]!;
      const tokenDiagnostics: TextProgressionDiagnostic[] = [];
      const noChordPhrase = rawToken.raw.toLowerCase() === "no"
        && visibleTokens[tokenIndex + 1]?.raw.toLowerCase() === "chord";
      if (noChordPhrase) {
        const next = visibleTokens[tokenIndex + 1]!;
        const range = { start: rawToken.range.start, end: next.range.end };
        const issue = diagnostic("no-chord-not-supported", "N.C. and no-chord rests are not supported in Text Progression Entry v1.", range, bar.bar);
        diagnostics.push(issue);
        tokenDiagnostics.push(issue);
        tokens.push(createToken(index, input.slice(range.start, range.end), range, bar.bar, allocation, tokenIndex, undefined, tokenDiagnostics));
        index += 1;
        tokenIndex += 1;
        continue;
      }

      const unsupported = unsupportedTokenDiagnostic(rawToken, bar.bar);
      if (unsupported) {
        diagnostics.push(unsupported);
        tokenDiagnostics.push(unsupported);
        tokens.push(createToken(index, rawToken.raw, rawToken.range, bar.bar, allocation, tokenIndex, undefined, tokenDiagnostics));
        index += 1;
        continue;
      }

      const chord = parseTextChordToken(rawToken.raw, initialKeyState);
      if (!chord) {
        const issue = !isConfirmedTextProgressionKey(initialKeyState) && requiresConfirmedKey(rawToken.raw)
          ? diagnostic(
            "degree-requires-confirmed-key",
            "Roman and numeric chord tokens require a user-confirmed key.",
            rawToken.range,
            bar.bar,
          )
          : invalidTokenDiagnostic(rawToken, bar.bar);
        diagnostics.push(issue);
        tokenDiagnostics.push(issue);
      }
      tokens.push(createToken(index, rawToken.raw, rawToken.range, bar.bar, allocation, tokenIndex, chord, tokenDiagnostics));
      index += 1;
    }
  }

  const events = tokens.flatMap((token): TextProgressionEvent[] => (
    token.chord && token.canonical && token.startBeat !== undefined && token.durationBeats !== undefined
      ? [{
        raw: token.raw,
        canonical: token.canonical,
        range: token.range,
        bar: token.bar,
        startBeat: token.startBeat,
        durationBeats: token.durationBeats,
        chord: cloneChord(token.chord),
      }]
      : []
  ));
  const keyState = resolveResultKeyState(initialKeyState, events);
  return createResult(input, notation, boundedBars.length, tokens, diagnostics, keyState, events);
}

/**
 * Deterministic, text-only harmonic suggestions. This intentionally does not
 * call the MIDI analyzer and never reports a confidence value.
 */
export function inferTextProgressionKeyCandidates(
  chords: readonly ChordSymbol[],
  limit: number = 3,
): readonly TextProgressionKeyCandidate[] {
  if (!chords.length || !Number.isInteger(limit) || limit <= 0) return [];
  const candidates: TextProgressionKeyCandidate[] = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    for (const mode of ["major", "minor"] as const) {
      let support = 0;
      let conflicts = 0;
      for (const chord of chords) {
        if (isChordCompatibleWithKey(chord, tonic, mode)) support += 1;
        else conflicts += 1;
      }
      candidates.push({
        key: `${keyRootLabels[tonic]} ${mode}`,
        tonicPitchClass: tonic,
        mode,
        support,
        conflicts,
      });
    }
  }
  return candidates
    .sort((left, right) => right.support - left.support
      || left.conflicts - right.conflicts
      || left.tonicPitchClass - right.tonicPitchClass
      || modeRank(left.mode) - modeRank(right.mode))
    .slice(0, limit);
}

export function inferTextProgressionKeyState(
  chords: readonly ChordSymbol[],
): TextProgressionKeyState {
  const candidates = inferTextProgressionKeyCandidates(chords);
  return candidates.length ? { kind: "inferred", candidates } : unknownTextProgressionKeyState();
}

/**
 * Reports each existing downstream contract independently. It does not hide a
 * valid Vault Save merely because a later practice consumer is ineligible.
 */
export function evaluateTextProgressionCapabilities(
  input: EvaluateTextProgressionCapabilitiesInput,
): readonly TextProgressionCapability[] {
  const { result, bpm, rootMotionNoteCount } = input;
  const valid = result.canConvert;
  const vaultSave = valid
    ? capability("vault-save", "supported", "A valid text result can enter the existing session-only Draft and normal Vault save path.")
    : capability("vault-save", "unsupported", "Resolve every parser diagnostic before creating a Draft.");
  const chordDojo = valid
    ? capability("chord-dojo", "supported", "A normally saved valid block remains eligible for Chord Dojo through the existing Vault path.")
    : capability("chord-dojo", "unsupported", "Chord Dojo receives only a normally saved valid block.");
  const chordContextEligibility = evaluateChordContextCapability(result, bpm);
  const chordContext = chordContextEligibility.capability;
  const bassPractice = chordContext.status === "supported"
    ? capability("bass-practice", "supported", "The progression meets the existing Chord Context source requirements for Bass Practice.")
    : capability("bass-practice", chordContext.status, `Bass Practice is ${chordContext.status}: ${chordContext.reason}`);
  const rootMotion = evaluateRootMotionCapability(rootMotionNoteCount, chordContextEligibility);
  const voicingMemory = valid
    ? capability("voicing-memory", "supported", "Auto voicing remains available; compatible Live MIDI practice overrides use the existing Voicing Memory contract.")
    : capability("voicing-memory", "unsupported", "Voicing Memory is available after a valid text result reaches the existing Draft path.");
  return [vaultSave, chordDojo, bassPractice, chordContext, rootMotion, voicingMemory];
}

export function textProgressionCapability(
  capabilities: readonly TextProgressionCapability[],
  name: TextProgressionCapabilityName,
): TextProgressionCapability | undefined {
  return capabilities.find((candidate) => candidate.name === name);
}

function parseBarNotation(
  input: string,
  boundary: TextProgressionRange,
  diagnostics: TextProgressionDiagnostic[],
): readonly BarInput[] | undefined {
  if (input[boundary.start] !== "|" || input[boundary.end - 1] !== "|") {
    diagnostics.push(diagnostic(
      "malformed-bar-notation",
      "Bar notation must begin and end with a `|` delimiter.",
      boundary,
    ));
    return undefined;
  }
  const delimiters: number[] = [];
  for (let offset = boundary.start; offset < boundary.end; offset += 1) {
    if (input[offset] === "|") delimiters.push(offset);
  }
  if (delimiters.length < 2) {
    diagnostics.push(diagnostic(
      "empty-bar",
      "Empty bars are not supported in Text Progression Entry.",
      { start: boundary.start + 1, end: boundary.end },
      1,
    ));
    return [];
  }
  const bars: BarInput[] = [];
  for (let index = 0; index < delimiters.length - 1; index += 1) {
    const start = delimiters[index]! + 1;
    const end = delimiters[index + 1]!;
    bars.push({
      bar: index + 1,
      tokens: lexWhitespaceTokens(input, start, end),
      range: { start, end },
    });
  }
  return bars;
}

function parseSimpleNotation(input: string, boundary: TextProgressionRange): readonly BarInput[] {
  return lexWhitespaceTokens(input, boundary.start, boundary.end).map((token, index) => ({
    bar: index + 1,
    tokens: [token],
    range: token.range,
  }));
}

function lexWhitespaceTokens(input: string, start: number, end: number): readonly RawToken[] {
  const source = input.slice(start, end);
  const tokens: RawToken[] = [];
  for (const match of source.matchAll(/\[[^\]]*\]|\{[^}]*\}|[A-Za-z][A-Za-z0-9 _-]*:|\S+/g)) {
    const raw = match[0];
    const offset = start + (match.index ?? 0);
    tokens.push({ raw, range: { start: offset, end: offset + raw.length } });
  }
  return tokens;
}

function resolveInitialKeyState(options: ParseTextProgressionOptions): TextProgressionKeyState {
  if (options.confirmedKey !== undefined) return confirmedTextProgressionKeyState(options.confirmedKey);
  if (isConfirmedTextProgressionKey(options.keyState)) return confirmedTextProgressionKeyState(options.keyState.key);
  return unknownTextProgressionKeyState();
}

function resolveResultKeyState(
  initial: TextProgressionKeyState,
  events: readonly TextProgressionEvent[],
): TextProgressionKeyState {
  return initial.kind === "confirmed"
    ? initial
    : inferTextProgressionKeyState(events.map((event) => event.chord));
}

function createResult(
  input: string,
  notation: TextProgressionNotation,
  bars: number,
  tokens: readonly TextProgressionToken[],
  diagnostics: readonly TextProgressionDiagnostic[],
  keyState: TextProgressionKeyState,
  events?: readonly TextProgressionEvent[],
): TextProgressionParseResult {
  const copiedTokens = tokens.map(cloneToken);
  const copiedDiagnostics = diagnostics.map(cloneDiagnostic);
  const copiedEvents = (events ?? []).map(cloneEvent);
  return {
    input,
    notation,
    bars,
    tokens: copiedTokens,
    events: copiedEvents,
    diagnostics: copiedDiagnostics,
    keyState: cloneKeyState(keyState),
    canConvert: copiedDiagnostics.length === 0 && copiedEvents.length > 0,
  };
}

function createToken(
  index: number,
  raw: string,
  range: TextProgressionRange,
  bar: number,
  allocation: 1 | 2 | 4 | undefined,
  tokenIndex: number,
  chord: ChordSymbol | undefined,
  diagnostics: readonly TextProgressionDiagnostic[],
): TextProgressionToken {
  const timing = allocation === undefined
    ? {}
    : { startBeat: tokenIndex * allocation + 1, durationBeats: allocation };
  return {
    index,
    raw,
    range: { ...range },
    bar,
    ...timing,
    ...(chord === undefined ? {} : { canonical: labelFromSymbol(chord), chord: cloneChord(chord) }),
    diagnostics: diagnostics.map(cloneDiagnostic),
  };
}

function timingForChordCount(count: number): 1 | 2 | 4 | undefined {
  if (count === 1) return 4;
  if (count === 2) return 2;
  if (count === 4) return 1;
  return undefined;
}

function parseTextChordToken(raw: string, keyState: TextProgressionKeyState): ChordSymbol | undefined {
  const absolute = parseAbsoluteChordToken(raw);
  if (absolute) return absolute;
  if (!isConfirmedTextProgressionKey(keyState)) return undefined;
  return parseFastChordEntry(raw, keyState.key) ?? undefined;
}

function parseAbsoluteChordToken(raw: string): ChordSymbol | undefined {
  const direct = parseChordLabel(raw);
  if (direct) return direct;
  // Existing Fast Label Entry accepts the normal `m` spelling. This local alias
  // keeps `C-7` in the text grammar as the documented shorthand without
  // widening the global chord parser contract.
  const minorHyphen = /^([A-G](?:#|b)*?)-(.*)$/.exec(raw);
  if (!minorHyphen) return undefined;
  return parseChordLabel(`${minorHyphen[1]}m${minorHyphen[2]}`) ?? undefined;
}

function unsupportedTokenDiagnostic(rawToken: RawToken, bar: number): TextProgressionDiagnostic | undefined {
  const normalized = rawToken.raw.toLowerCase();
  if (normalized === "n.c." || normalized === "nc" || normalized === "-" || normalized === "no-chord") {
    return diagnostic("no-chord-not-supported", "N.C. and no-chord rests are not supported in Text Progression Entry v1.", rawToken.range, bar);
  }
  if (rawToken.raw.includes("%") || /^x\d+$/i.test(rawToken.raw) || /^:\d+$/.test(rawToken.raw)) {
    return diagnostic("unsupported-repeat", "Repeat syntax is not supported in Text Progression Entry v1.", rawToken.range, bar);
  }
  if (/^(?:\/\/|\/\*|;|#(?!\d))/.test(rawToken.raw)) {
    return diagnostic("unsupported-comment", "Comments are not supported in Text Progression Entry v1.", rawToken.range, bar);
  }
  if (/^(?:\[[^\]]*\]|\{[^}]*\}|[A-Za-z][A-Za-z0-9 _-]*:)$/.test(rawToken.raw)) {
    return diagnostic("unsupported-section-header", "Section headers are not supported in Text Progression Entry v1.", rawToken.range, bar);
  }
  return undefined;
}

function invalidTokenDiagnostic(rawToken: RawToken, bar: number): TextProgressionDiagnostic {
  const lyric = /\p{L}/u.test(rawToken.raw) && !/^[A-G](?:#|b)*/.test(rawToken.raw);
  return lyric
    ? diagnostic("lyric-mixed-text", "Lyrics and free text are not supported in Text Progression Entry v1.", rawToken.range, bar)
    : diagnostic("invalid-chord", `\`${rawToken.raw}\` is not a supported chord token.`, rawToken.range, bar);
}

function requiresConfirmedKey(raw: string): boolean {
  // Absolute parsing has already failed. Use the existing degree parser with a
  // fixed, safe confirmed key instead of treating every Roman-looking word as
  // degree input (`Ihello` and `Voodoo` are ordinary invalid/lyric text).
  return parseFastChordEntry(raw, "C major") !== null;
}

function isChordCompatibleWithKey(chord: ChordSymbol, tonic: number, mode: TextProgressionKeyMode): boolean {
  const interval = (chord.root - tonic + 12) % 12;
  const scale = mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const degree = scale.indexOf(interval);
  if (degree < 0) return false;
  const expected = mode === "major"
    ? ["major", "minor", "minor", "major", "dominant", "minor", "diminished"] as const
    : ["minor", "diminished", "major", "minor", "dominant", "major", "major"] as const;
  const family = chordFamily(chord);
  // A bare major V triad is a normal spelling of the same diatonic function as
  // V7; no text-only key suggestion should penalise `C F G` for omitting the
  // seventh. The inverse is intentionally not true: a dominant seventh on a
  // normally-major degree remains a lower-level ambiguity.
  return family === expected[degree]
    || (expected[degree] === "dominant" && family === "major");
}

function chordFamily(chord: ChordSymbol): "major" | "minor" | "dominant" | "diminished" | "other" {
  if (chord.quality === "dim" || chord.quality === "dim7" || chord.quality === "min7b5") return "diminished";
  if (chord.quality.startsWith("min")) return "minor";
  if (chord.quality === "dom7" || chord.quality === "dom9" || chord.quality === "dom13" || chord.quality === "dom7sus4") return "dominant";
  if (chord.quality === "maj" || chord.quality === "maj7" || chord.quality === "maj9" || chord.quality === "six" || chord.quality === "sixNine" || chord.quality === "add9" || chord.quality === "sus2" || chord.quality === "sus4") return "major";
  return "other";
}

function modeRank(mode: TextProgressionKeyMode): number {
  return mode === "major" ? 0 : 1;
}

function evaluateChordContextCapability(
  result: TextProgressionParseResult,
  bpm: number | undefined,
): ChordContextEligibility {
  if (!result.canConvert) return unsupportedChordContext("Chord Context requires a valid exact text result.");
  if (!isConfirmedTextProgressionKey(result.keyState)) {
    return unsupportedChordContext("Chord Context requires a user-confirmed key; an inferred key is only a suggestion.");
  }
  if (bpm === undefined) {
    return { capability: capability("chord-context", "unknown", "Choose a BPM before Chord Context eligibility can be evaluated."), sections: [] };
  }
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 240) {
    return unsupportedChordContext("Chord Context supports BPM values from 30 through 240.");
  }
  const sections = selectSafeChordContextSections(result.events);
  if (!sections.length) {
    return unsupportedChordContext("The saved progression has no complete contiguous 1, 2, 4, 8, or 12-bar 4/4 Chord Context section.");
  }
  return {
    capability: capability("chord-context", "supported", "The saved progression contains at least one complete contiguous 1, 2, 4, 8, or 12-bar 4/4 Chord Context section."),
    sections,
  };
}

function evaluateRootMotionCapability(
  noteCount: EvaluateTextProgressionCapabilitiesInput["rootMotionNoteCount"],
  chordContextEligibility: ChordContextEligibility,
): TextProgressionCapability {
  const chordContext = chordContextEligibility.capability;
  if (chordContext.status !== "supported") {
    return capability("root-motion", chordContext.status, `Root Motion depends on an eligible Chord Context snapshot: ${chordContext.reason}`);
  }
  if (noteCount === undefined) {
    return capability("root-motion", "unknown", "Select a Root Motion note count from 2 through 8 before source eligibility can be evaluated.");
  }
  if (!isRootMotionNoteCount(noteCount)) {
    return capability("root-motion", "unsupported", "Root Motion note count must be an integer from 2 through 8.");
  }
  if (!chordContextEligibility.sections.some((section) => section.rootCount >= noteCount)) {
    return capability("root-motion", "unsupported", `No selectable safe Chord Context section has ${noteCount} chord roots for the selected Root Motion chain.`);
  }
  return capability("root-motion", "supported", "A selectable safe Chord Context section has enough chord roots for the selected Root Motion chain; text cards are never treated as an original bassline.");
}

function unsupportedChordContext(reason: string): ChordContextEligibility {
  return { capability: capability("chord-context", "unsupported", reason), sections: [] };
}

/** Mirrors selectVaultChordContextSections without synthesising a persisted block. */
function selectSafeChordContextSections(
  events: readonly TextProgressionEvent[],
): readonly TextProgressionSafeChordContextSection[] {
  const sourceEvents = events
    .map((event) => ({
      event,
      absoluteStart: (event.bar - 1) * TEXT_PROGRESSION_BEATS_PER_BAR + event.startBeat - 1,
    }))
    .sort((left, right) => left.absoluteStart - right.absoluteStart || left.event.bar - right.event.bar);
  const sections: TextProgressionSafeChordContextSection[] = [];
  for (const source of sourceEvents) {
    if (source.event.startBeat !== 1) continue;
    for (const lengthBeats of chordContextSectionBeats) {
      const end = source.absoluteStart + lengthBeats;
      const contained = sourceEvents.filter((candidate) => (
        candidate.absoluteStart >= source.absoluteStart
        && candidate.absoluteStart + candidate.event.durationBeats <= end
      ));
      if (!isCompleteSafeSection(contained, source.absoluteStart, end)) continue;
      if (contained.length > TEXT_PROGRESSION_MAX_TOKENS) continue;
      sections.push({
        startBar: source.event.bar,
        endBar: source.event.bar + lengthBeats / TEXT_PROGRESSION_BEATS_PER_BAR - 1,
        lengthBeats,
        rootCount: contained.length,
      });
    }
  }
  return sections;
}

function isCompleteSafeSection(
  events: readonly { readonly event: TextProgressionEvent; readonly absoluteStart: number }[],
  start: number,
  end: number,
): boolean {
  if (!events.length || events.length > TEXT_PROGRESSION_MAX_TOKENS) return false;
  let cursor = start;
  for (const event of events) {
    if (event.absoluteStart !== cursor || event.event.durationBeats <= 0) return false;
    cursor += event.event.durationBeats;
  }
  return cursor === end;
}

function isRootMotionNoteCount(value: unknown): value is NonNullable<EvaluateTextProgressionCapabilitiesInput["rootMotionNoteCount"]> {
  return typeof value === "number" && Number.isInteger(value) && value >= 2 && value <= 8;
}

function capability(
  name: TextProgressionCapabilityName,
  status: TextProgressionCapabilityStatus,
  reason: string,
): TextProgressionCapability {
  return { name, status, reason };
}

function diagnostic(
  code: TextProgressionDiagnosticCode,
  message: string,
  range: TextProgressionRange,
  bar?: number,
): TextProgressionDiagnostic {
  return { code, message, range: { ...range }, ...(bar === undefined ? {} : { bar }) };
}

function wholeRange(input: string): TextProgressionRange {
  return { start: 0, end: input.length };
}

function nonWhitespaceBoundary(input: string): TextProgressionRange | undefined {
  const first = input.search(/\S/);
  if (first < 0) return undefined;
  let last = input.length - 1;
  while (last >= first && /\s/.test(input[last]!)) last -= 1;
  return { start: first, end: last + 1 };
}

function isFourFour(meter: TextProgressionMeter): boolean {
  return meter.numerator === 4 && meter.denominator === 4;
}

function cloneChord(chord: ChordSymbol): ChordSymbol {
  return { ...chord, tensions: [...chord.tensions] };
}

function cloneDiagnostic(value: TextProgressionDiagnostic): TextProgressionDiagnostic {
  return { ...value, range: { ...value.range } };
}

function cloneToken(value: TextProgressionToken): TextProgressionToken {
  return {
    ...value,
    range: { ...value.range },
    ...(value.chord === undefined ? {} : { chord: cloneChord(value.chord) }),
    diagnostics: value.diagnostics.map(cloneDiagnostic),
  };
}

function cloneEvent(value: TextProgressionEvent): TextProgressionEvent {
  return { ...value, range: { ...value.range }, chord: cloneChord(value.chord) };
}

function cloneKeyState(value: TextProgressionKeyState): TextProgressionKeyState {
  if (value.kind === "unknown") return unknownTextProgressionKeyState();
  if (value.kind === "confirmed") return { ...value };
  return { kind: "inferred", candidates: value.candidates.map((candidate) => ({ ...candidate })) };
}
