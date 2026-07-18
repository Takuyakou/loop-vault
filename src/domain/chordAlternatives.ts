import type { ChordSymbol, Tension } from "./types";

export const QUICK_CHORD_ALTERNATIVE_LIMIT = 5;

export interface QuickChordAlternative {
  chord: ChordSymbol;
  confidence: number;
}

export function selectQuickChordAlternatives<T extends QuickChordAlternative>(
  current: ChordSymbol | undefined,
  alternatives: readonly T[],
  limit = QUICK_CHORD_ALTERNATIVE_LIMIT,
): T[] {
  const cappedLimit = Math.max(0, Math.min(QUICK_CHORD_ALTERNATIVE_LIMIT, limit));
  if (cappedLimit === 0) return [];

  const currentKey = current ? canonicalChordAlternative(current) : undefined;
  const byChord = new Map<string, { value: T; index: number }>();
  alternatives.forEach((alternative, index) => {
    const key = canonicalChordAlternative(alternative.chord);
    if (key === currentKey) return;
    const previous = byChord.get(key);
    if (!previous || alternative.confidence > previous.value.confidence) {
      byChord.set(key, { value: alternative, index });
    }
  });
  const pool = [...byChord.values()]
    .sort((left, right) => right.value.confidence - left.value.confidence
      || left.index - right.index
      || canonicalChordAlternative(left.value.chord)
        .localeCompare(canonicalChordAlternative(right.value.chord)))
    .map((entry) => entry.value);
  const selected: T[] = [];
  const selectedKeys = new Set<string>();
  const take = (candidate: T | undefined) => {
    if (!candidate || selected.length >= cappedLimit) return;
    const key = canonicalChordAlternative(candidate.chord);
    if (selectedKeys.has(key)) return;
    selected.push(candidate);
    selectedKeys.add(key);
  };
  const takeFirst = (predicate: (candidate: T) => boolean) => {
    take(pool.find((candidate) => !selectedKeys.has(canonicalChordAlternative(candidate.chord))
      && predicate(candidate)));
  };

  take(pool[0]);
  const referenceRoot = current?.root ?? pool[0]?.chord.root;
  if (referenceRoot !== undefined) {
    takeFirst((candidate) => candidate.chord.root !== referenceRoot);
    takeFirst((candidate) => candidate.chord.root === referenceRoot
      && candidate.chord.quality !== current?.quality);
  }
  takeFirst((candidate) => candidate.chord.bass !== undefined
    && candidate.chord.bass !== candidate.chord.root);
  for (const candidate of pool) take(candidate);
  return selected;
}

export function canonicalChordAlternative(chord: ChordSymbol): string {
  return [
    normalizePitchClass(chord.root),
    chord.quality,
    tensionKey(chord.tensions),
    chord.bass === undefined ? "" : normalizePitchClass(chord.bass),
  ].join(":");
}

function tensionKey(tensions: readonly Tension[]): string {
  return [...new Set(tensions)].sort().join(",");
}

function normalizePitchClass(value: number): number {
  return ((value % 12) + 12) % 12;
}
