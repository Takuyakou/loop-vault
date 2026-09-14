import type { ChordSymbol } from "./types";

export interface ScoreToken {
  readonly raw: string;
  readonly range: { readonly start: number; readonly end: number };
}
export type ScoreSegmentation =
  | { readonly kind: "ok"; readonly tokens: readonly ScoreToken[] }
  | { readonly kind: "invalid" | "ambiguous" };

/** Memoized complete segmentation; punctuation within a chord is never a split. */
export function segmentScoreBar(
  input: string,
  start: number,
  end: number,
  parse: (raw: string) => ChordSymbol | undefined,
): ScoreSegmentation {
  const source = input.slice(start, end);
  const parsed = new Map<string, ChordSymbol | undefined>();
  const parseCached = (raw: string) => {
    if (!parsed.has(raw)) parsed.set(raw, parse(raw));
    return parsed.get(raw);
  };
  // Preserve valid legacy whitespace-token grammar, including arbitrary long
  // accidentals and confirmed degree tokens, without searching alternate syntax.
  const spaced = [...source.matchAll(/\S+/g)].map(match => ({
    raw: match[0], range: { start: start + match.index!, end: start + match.index! + match[0].length },
  }));
  if (spaced.length && spaced.every(token => parseCached(token.raw))) return { kind: "ok", tokens: spaced };

  const boundaries: number[] = [];
  let depth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0 || depth > 1) return { kind: "invalid" };
    if (depth === 0 && /[A-G]/.test(char) && source[i - 1] !== "/") boundaries.push(i);
  }
  if (depth !== 0) return { kind: "invalid" };
  boundaries.push(source.length);
  const memo = new Map<string, readonly ScoreToken[][]>();
  const identity = (tokens: readonly ScoreToken[]) => tokens.map(token => {
    const chord = parseCached(token.raw)!;
    return [chord.root, chord.quality, [...chord.tensions].sort(), chord.bass ?? chord.root];
  });
  const search = (offset: number, remaining: number): readonly ScoreToken[][] => {
    while (offset < source.length && /\s/.test(source[offset]!)) offset += 1;
    if (offset === source.length) return [[]];
    if (!remaining) return [];
    const key = `${offset}:${remaining}`;
    const prior = memo.get(key);
    if (prior) return prior;
    const results: ScoreToken[][] = [];
    const seen = new Set<string>();
    // Candidate budget is per memo state, not exponential in the full input.
    // Valid long legacy tokens were accepted above. Exotic oversized compact
    // alternatives fail closed rather than guessing after truncation.
    const ends = boundaries.filter(boundary => boundary > offset);
    if (ends.length > 128) { memo.set(key, []); return []; }
    for (const boundary of ends) {
      const text = source.slice(offset, boundary);
      const trimmed = text.trimEnd();
      if (!parseCached(trimmed)) continue;
      const token = { raw: trimmed, range: { start: start + offset, end: start + offset + trimmed.length } };
      for (const suffix of search(boundary, remaining - 1)) {
        const result = [token, ...suffix];
        const normalized = JSON.stringify(identity(result));
        if (!seen.has(normalized)) { seen.add(normalized); results.push(result); }
        if (results.length === 2) { memo.set(key, results); return results; }
      }
    }
    memo.set(key, results);
    return results;
  };
  const complete = search(0, 4);
  if (!complete.length) return { kind: "invalid" };
  if (complete.length > 1) return { kind: "ambiguous" };
  return { kind: "ok", tokens: complete[0]! };
}

/** Only root/type whitespace is removed, never arbitrary inter-chord spaces. */
export function normalizeScoreChord(raw: string): string {
  return raw.replace(/^([A-G](?:#|b)*)\s+(?=[^A-G\s])/, "$1");
}

/** Comments are replaced, not removed, so source offsets remain accurate. */
export function maskScoreComments(input: string): string {
  return input.replace(/^[\t ]*#[^\r\n]*/gm, line => " ".repeat(line.length));
}
