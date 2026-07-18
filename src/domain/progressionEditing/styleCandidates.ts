import { canonicalChordAlternative } from "../chordAlternatives";
import { makeChordSymbol, normalizePc } from "../chords";
import type { ChordQuality, ChordSymbol, SongIdea } from "../types";
import { parseKeySignature } from "./chordSuggestions";
import { quickChordCandidate, type QuickChordCandidate } from "./quickCandidates";

export type AuthorReferenceSourceType =
  | "verifiedProgression"
  | "acceptedCorrection"
  | "chordDripAcceptedEdit"
  | "favoriteProgression";

export interface AuthorTransitionReference {
  previousDegree?: string;
  candidateDegree: string;
  nextDegree?: string;
  candidateQuality: ChordQuality;
  bassRelation?: string;
  keyMode?: "major" | "minor";
  sourceStrength: number;
  sourceType: AuthorReferenceSourceType;
  usageCount: number;
  stableSourceId: string;
}

export interface AuthorReferenceIndex {
  references: AuthorTransitionReference[];
  verifiedTransitionCount: number;
  acceptedCorrectionCount: number;
  available: boolean;
}

export interface StyleCandidateInput {
  index: AuthorReferenceIndex;
  previousChord?: ChordSymbol;
  currentChord: ChordSymbol;
  nextChord?: ChordSymbol;
  keySignature?: string;
}

export function buildAuthorReferenceIndex(ideas: readonly SongIdea[]): AuthorReferenceIndex {
  const raw: AuthorTransitionReference[] = [];
  let verifiedTransitionCount = 0;
  let acceptedCorrectionCount = 0;

  ideas.forEach((idea) => idea.progressionBlocks?.forEach((block) => {
    const key = parseKeySignature(block.detectedKey ?? idea.key);
    if (!key) return;
    const source = referenceSource(block.userVerified, block.userEdited, block.pinned);
    if (!source) return;
    const sourceStrength = source === "verifiedProgression" ? 3
      : source === "acceptedCorrection" ? 2
        : 1;
    const mode = key.minor ? "minor" : "major";
    block.chords.forEach((item, index) => {
      const previous = block.chords[index - 1]?.chord;
      const next = block.chords[index + 1]?.chord;
      if (!previous && !next) return;
      if (source === "verifiedProgression") verifiedTransitionCount += 1;
      if (source === "acceptedCorrection") acceptedCorrectionCount += 1;
      raw.push({
        ...(previous ? { previousDegree: degreeKey(previous, key.root) } : {}),
        candidateDegree: degreeKey(item.chord, key.root),
        ...(next ? { nextDegree: degreeKey(next, key.root) } : {}),
        candidateQuality: item.chord.quality,
        ...(item.chord.bass !== undefined
          ? { bassRelation: String(normalizePc(item.chord.bass - item.chord.root)) }
          : {}),
        keyMode: mode,
        sourceStrength,
        sourceType: source,
        usageCount: 1,
        stableSourceId: `${idea.id}:${block.id}:${index}`,
      });
    });
  }));

  const references = mergeReferences(raw);
  return {
    references,
    verifiedTransitionCount,
    acceptedCorrectionCount,
    available: verifiedTransitionCount >= 5 || acceptedCorrectionCount >= 3,
  };
}

export function generateStyleCandidates(input: StyleCandidateInput): QuickChordCandidate[] {
  const key = parseKeySignature(input.keySignature);
  if (!input.index.available || !key) return [];
  const previousDegree = input.previousChord ? degreeKey(input.previousChord, key.root) : undefined;
  const nextDegree = input.nextChord ? degreeKey(input.nextChord, key.root) : undefined;
  const currentKey = canonicalChordAlternative(input.currentChord);

  return input.index.references.map((reference) => {
    const root = normalizePc(key.root + Number(reference.candidateDegree));
    const bass = reference.bassRelation === undefined
      ? undefined
      : normalizePc(root + Number(reference.bassRelation));
    const chord = makeChordSymbol(root, reference.candidateQuality, [], bass);
    const contextScore = Number(reference.previousDegree === previousDegree) * 4
      + Number(reference.nextDegree === nextDegree) * 4
      + Number(reference.keyMode === (key.minor ? "minor" : "major")) * 2;
    return {
      reference,
      chord,
      contextScore,
      score: reference.sourceStrength * 10 + contextScore + Math.min(5, reference.usageCount),
      key: canonicalChordAlternative(chord),
    };
  }).filter((entry) => entry.key !== currentKey)
    .sort((left, right) => right.reference.sourceStrength - left.reference.sourceStrength
      || right.contextScore - left.contextScore
      || right.reference.usageCount - left.reference.usageCount
      || left.key.localeCompare(right.key)
      || left.reference.stableSourceId.localeCompare(right.reference.stableSourceId))
    .map((entry, index) => quickChordCandidate({
      chord: entry.chord,
      source: "authorReferenceFit",
      sourceScore: entry.score,
      sourceRank: index,
      reasons: [
        { code: "author-source", labelKey: "quickCandidate.reason.authorSource", value: entry.reference.sourceType },
        { code: "author-context", labelKey: "quickCandidate.reason.authorContext", value: entry.contextScore },
        { code: "author-usage", labelKey: "quickCandidate.reason.authorUsage", value: entry.reference.usageCount },
      ],
    }));
}

function mergeReferences(raw: readonly AuthorTransitionReference[]): AuthorTransitionReference[] {
  const grouped = new Map<string, AuthorTransitionReference>();
  raw.forEach((reference) => {
    const key = [
      reference.previousDegree ?? "x",
      reference.candidateDegree,
      reference.nextDegree ?? "x",
      reference.candidateQuality,
      reference.bassRelation ?? "root",
      reference.keyMode ?? "x",
      reference.sourceType,
    ].join(":");
    const previous = grouped.get(key);
    if (!previous) {
      grouped.set(key, { ...reference });
      return;
    }
    grouped.set(key, {
      ...previous,
      sourceStrength: Math.max(previous.sourceStrength, reference.sourceStrength),
      usageCount: previous.usageCount + reference.usageCount,
      stableSourceId: previous.stableSourceId.localeCompare(reference.stableSourceId) <= 0
        ? previous.stableSourceId
        : reference.stableSourceId,
    });
  });
  return [...grouped.values()].sort((left, right) => (
    left.stableSourceId.localeCompare(right.stableSourceId)
  ));
}

function referenceSource(
  userVerified: boolean | undefined,
  userEdited: boolean | undefined,
  pinned: boolean | undefined,
): AuthorReferenceSourceType | undefined {
  if (userVerified) return "verifiedProgression";
  if (userEdited) return "acceptedCorrection";
  if (pinned) return "favoriteProgression";
  return undefined;
}

function degreeKey(chord: ChordSymbol, keyRoot: number): string {
  return String(normalizePc(chord.root - keyRoot));
}
