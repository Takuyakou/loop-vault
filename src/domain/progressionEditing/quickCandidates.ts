import { canonicalChordAlternative } from "../chordAlternatives";
import type { ChordSymbol } from "../types";

export const QUICK_CHORD_CANDIDATE_LIMIT = 5;
const SOURCE_ORDER: readonly QuickCandidateSource[] = [
  "analyzer",
  "smoothConnection",
  "authorReferenceFit",
];

export type QuickCandidateSource =
  | "analyzer"
  | "smoothConnection"
  | "authorReferenceFit";

export interface QuickChordCandidateReason {
  code: string;
  labelKey: string;
  value?: number | string;
}

export interface QuickChordCandidate {
  chord: ChordSymbol;
  normalizedKey: string;
  primarySource: QuickCandidateSource;
  sources: QuickCandidateSource[];
  sourceScore: number;
  sourceRank: number;
  reasons: QuickChordCandidateReason[];
}

export interface QuickCandidateSelectionMetadata {
  source: QuickCandidateSource;
  sources?: QuickCandidateSource[];
  candidateRank: number;
  displayedCandidateCount: number;
}

export interface ComposeQuickChordCandidateInput {
  currentChord: ChordSymbol;
  analyzerCandidates: readonly QuickChordCandidate[];
  smoothCandidates?: readonly QuickChordCandidate[];
  styleCandidates?: readonly QuickChordCandidate[];
  limit?: number;
}

export function composeQuickChordCandidates({
  currentChord,
  analyzerCandidates,
  smoothCandidates = [],
  styleCandidates = [],
  limit = QUICK_CHORD_CANDIDATE_LIMIT,
}: ComposeQuickChordCandidateInput): QuickChordCandidate[] {
  const cappedLimit = Math.max(0, Math.min(QUICK_CHORD_CANDIDATE_LIMIT, limit));
  if (cappedLimit === 0) return [];
  const currentKey = canonicalChordAlternative(currentChord);
  const analyzer = rankWithinSource(analyzerCandidates, "analyzer", currentKey);
  const smooth = rankWithinSource(smoothCandidates, "smoothConnection", currentKey);
  const style = rankWithinSource(styleCandidates, "authorReferenceFit", currentKey);
  const selected: QuickChordCandidate[] = [];
  const selectedByKey = new Map<string, number>();

  const place = (candidate: QuickChordCandidate | undefined) => {
    if (!candidate || selected.length >= cappedLimit) return;
    const existingIndex = selectedByKey.get(candidate.normalizedKey);
    if (existingIndex !== undefined) {
      selected[existingIndex] = mergeCandidates(selected[existingIndex]!, candidate);
      return;
    }
    selectedByKey.set(candidate.normalizedKey, selected.length);
    selected.push(cloneCandidate(candidate));
  };

  analyzer.slice(0, 3).forEach(place);
  place(smooth[0]);
  place(style[0]);
  analyzer.slice(3).forEach(place);

  return selected.slice(0, cappedLimit);
}

export function analyzerQuickCandidates(
  alternatives: readonly { chord: ChordSymbol; confidence: number }[],
): QuickChordCandidate[] {
  return alternatives.map((alternative, index) => quickChordCandidate({
    chord: alternative.chord,
    source: "analyzer",
    sourceScore: alternative.confidence,
    sourceRank: index,
    reasons: [{
      code: "analyzer-alternative",
      labelKey: "quickCandidate.reason.analyzerAlternative",
      value: alternative.confidence,
    }],
  }));
}

export function quickChordCandidate({
  chord,
  source,
  sourceScore,
  sourceRank,
  reasons = [],
}: {
  chord: ChordSymbol;
  source: QuickCandidateSource;
  sourceScore: number;
  sourceRank: number;
  reasons?: readonly QuickChordCandidateReason[];
}): QuickChordCandidate {
  return {
    chord: cloneChord(chord),
    normalizedKey: canonicalChordAlternative(chord),
    primarySource: source,
    sources: [source],
    sourceScore,
    sourceRank,
    reasons: reasons.map((reason) => ({ ...reason })),
  };
}

export function quickCandidateSelectionMetadata(
  candidate: QuickChordCandidate,
  candidateRank: number,
  displayedCandidateCount: number,
): QuickCandidateSelectionMetadata {
  return {
    source: candidate.primarySource,
    ...(candidate.sources.length > 1 ? { sources: [...candidate.sources] } : {}),
    candidateRank,
    displayedCandidateCount,
  };
}

function rankWithinSource(
  candidates: readonly QuickChordCandidate[],
  source: QuickCandidateSource,
  currentKey: string,
): QuickChordCandidate[] {
  const byKey = new Map<string, QuickChordCandidate>();
  candidates.forEach((candidate) => {
    const normalizedKey = canonicalChordAlternative(candidate.chord);
    if (normalizedKey === currentKey) return;
    const normalized = {
      ...cloneCandidate(candidate),
      normalizedKey,
      primarySource: source,
      sources: orderedSources([...candidate.sources, source]),
    };
    const previous = byKey.get(normalizedKey);
    if (!previous || compareSourceRank(normalized, previous) < 0) {
      byKey.set(normalizedKey, normalized);
    }
  });
  return [...byKey.values()].sort(compareSourceRank);
}

function compareSourceRank(left: QuickChordCandidate, right: QuickChordCandidate): number {
  return left.sourceRank - right.sourceRank
    || right.sourceScore - left.sourceScore
    || left.normalizedKey.localeCompare(right.normalizedKey);
}

function mergeCandidates(
  left: QuickChordCandidate,
  right: QuickChordCandidate,
): QuickChordCandidate {
  return {
    ...cloneCandidate(left),
    sources: orderedSources([...left.sources, ...right.sources]),
    reasons: dedupeReasons([...left.reasons, ...right.reasons]),
  };
}

function orderedSources(sources: readonly QuickCandidateSource[]): QuickCandidateSource[] {
  const unique = new Set(sources);
  return SOURCE_ORDER.filter((source) => unique.has(source));
}

function dedupeReasons(reasons: readonly QuickChordCandidateReason[]): QuickChordCandidateReason[] {
  const seen = new Set<string>();
  return reasons.flatMap((reason) => {
    const key = `${reason.code}:${reason.labelKey}:${String(reason.value ?? "")}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...reason }];
  });
}

function cloneCandidate(candidate: QuickChordCandidate): QuickChordCandidate {
  return {
    ...candidate,
    chord: cloneChord(candidate.chord),
    sources: [...candidate.sources],
    reasons: candidate.reasons.map((reason) => ({ ...reason })),
  };
}

function cloneChord(chord: ChordSymbol): ChordSymbol {
  return { ...chord, tensions: [...chord.tensions] };
}
