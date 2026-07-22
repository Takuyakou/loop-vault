import type { ProgressionIndex } from "../progressionClassification/types";
import { isKnownProgressionTagId } from "../progressionClassification/taxonomy";
import type { AdvisorReferenceContext } from "./types";

export interface AdvisorReferenceSelectionInput {
  index: ProgressionIndex;
  currentBlockId: string;
  key?: string;
  tagIds: readonly string[];
  romanNumerals?: readonly string[];
  limit?: number;
}

export function selectAdvisorReferenceContexts(input: AdvisorReferenceSelectionInput): AdvisorReferenceContext[] {
  const currentTags = new Set(input.tagIds.filter(isKnownProgressionTagId));
  const currentRoman = new Set(input.romanNumerals ?? []);
  return input.index
    .filter((entry) => entry.blockId !== input.currentBlockId)
    .filter((entry) => entry.block.userVerified || entry.block.userEdited || entry.block.pinned)
    .map((entry) => {
      const tags = entry.effectiveTags.filter(isKnownProgressionTagId);
      const romanNumerals = entry.romanNumeralText.split(/\s+/).filter(Boolean);
      const score = Number(entry.block.userVerified) * 12
        + Number(entry.block.userEdited) * 7
        + Number(entry.block.pinned) * 4
        + Number(Boolean(input.key && entry.key && normalizedKey(input.key) === normalizedKey(entry.key))) * 6
        + tags.filter((tag) => currentTags.has(tag)).length * 3
        + romanNumerals.filter((degree) => currentRoman.has(degree)).length;
      return { entry, tags, romanNumerals, score };
    })
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
    .slice(0, Math.min(3, Math.max(0, input.limit ?? 3)))
    .map(({ entry, tags, romanNumerals }) => ({
      ...(entry.key ? { key: entry.key } : {}),
      ...(entry.key ? { mode: keyMode(entry.key) } : {}),
      romanNumerals,
      chordLabels: entry.block.chords.map((item) => item.chord.label),
      tagIds: tags,
      verified: entry.block.userVerified === true,
    }));
}

function normalizedKey(key: string): string {
  return key.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function keyMode(key: string): string {
  return /m(?:in(?:or)?)?$/i.test(key.trim()) ? "minor" : "major";
}
