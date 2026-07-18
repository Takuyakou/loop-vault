import { degreeSequence } from "../harmony/degrees";
import type { SavedProgressionBlock } from "../types";
import { deriveFeatureTags } from "./deriveFeatureTags";
import { deriveSourceTags } from "./deriveSourceTags";
import { deriveUseTags } from "./deriveUseTags";
import { applyAutoTagSuppression, canonicalManualTag } from "./suppression";
import { getProgressionTagDefinition } from "./taxonomy";
import type {
  ProgressionClassificationInput,
  ProgressionClassificationResult,
  ProgressionIndex,
  ProgressionIndexEntry,
  ProgressionIndexFilter,
  ProgressionIndexIdea,
} from "./types";

export function classifyProgression(
  input: ProgressionClassificationInput,
): ProgressionClassificationResult {
  const suppressed = input.block.suppressedAutoTags ?? [];
  return {
    sourceTags: applyAutoTagSuppression(deriveSourceTags(input), suppressed),
    featureTags: applyAutoTagSuppression(deriveFeatureTags(input), suppressed),
    useTags: applyAutoTagSuppression(deriveUseTags(input), suppressed),
    moodTags: [],
  };
}

export function buildProgressionIndex(ideas: readonly ProgressionIndexIdea[]): ProgressionIndexEntry[] {
  return ideas.flatMap((idea) => buildIdeaEntries(idea)).sort(compareEntries);
}

export function replaceIdeaInProgressionIndex(
  index: ProgressionIndex,
  idea: ProgressionIndexIdea,
): ProgressionIndexEntry[] {
  return [...index.filter((entry) => entry.ideaId !== idea.id), ...buildIdeaEntries(idea)]
    .sort(compareEntries);
}

export function removeIdeaFromProgressionIndex(
  index: ProgressionIndex,
  ideaId: string,
): ProgressionIndexEntry[] {
  return index.filter((entry) => entry.ideaId !== ideaId);
}

export function filterProgressionIndex(
  index: ProgressionIndex,
  filter: ProgressionIndexFilter,
): ProgressionIndexEntry[] {
  const query = normalizeText(filter.query ?? "");
  const tagGroups = groupTagsByCategory(filter.tagIds ?? []);
  return index.filter((entry) => {
    if (query && !entry.normalizedSearchText.includes(query)) return false;
    const effective = new Set(entry.effectiveTags);
    return [...tagGroups.values()].every((tagIds) => tagIds.some((tagId) => effective.has(tagId)));
  });
}

function buildIdeaEntries(idea: ProgressionIndexIdea): ProgressionIndexEntry[] {
  return (idea.progressionBlocks ?? []).map((block) => {
    const key = block.detectedKey ?? idea.key;
    const classification = classifyProgression({ block, key });
    const derivedTags = [
      ...classification.sourceTags,
      ...classification.featureTags,
      ...classification.useTags,
      ...classification.moodTags,
    ];
    const manualTags = [...block.tags];
    const effectiveTags = [...new Set([
      ...manualTags.map(canonicalManualTag),
      ...derivedTags.map((tag) => tag.tagId),
    ])];
    const normalizedChordText = normalizeText(block.chords.map((item) => item.chord.label).join(" "));
    const romanNumeralText = degreeSequence({ ...block, detectedKey: key }).join(" ");
    const normalizedSearchText = normalizeText([
      idea.title,
      block.summaryText,
      block.memo ?? "",
      block.sourceFileName ?? "",
      normalizedChordText,
      romanNumeralText,
      ...manualTags,
      ...effectiveTags,
    ].join(" "));
    const sourceTag = classification.sourceTags[0]?.tagId;
    const bars = progressionBars(block);
    const bpm = block.bpm ?? idea.bpm;
    return {
      id: `${idea.id}:${block.id}`,
      ideaId: idea.id,
      blockId: block.id,
      block,
      normalizedChordText,
      romanNumeralText,
      normalizedSearchText,
      manualTags,
      derivedTags,
      effectiveTags,
      ...(key ? { key } : {}),
      ...(bpm ? { bpm } : {}),
      ...(bars !== undefined ? { bars } : {}),
      ...(sourceTag ? { origin: sourceTag.slice("source.".length) } : {}),
      favorite: block.pinned ?? false,
      createdAt: block.capturedAt,
      updatedAt: idea.updatedAt,
    };
  });
}

function progressionBars(block: SavedProgressionBlock): number | undefined {
  if (block.lengthBars) return block.lengthBars;
  if (block.chords.length === 0) return undefined;
  const bars = block.chords.map((item) => item.bar);
  return Math.max(...bars) - Math.min(...bars) + 1;
}

function groupTagsByCategory(tagIds: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const tagId of tagIds) {
    const namespace = /^(source|feature|use|mood|collection)\./.exec(tagId)?.[1];
    const category = getProgressionTagDefinition(tagId)?.category ?? namespace ?? `manual:${tagId}`;
    groups.set(category, [...(groups.get(category) ?? []), tagId]);
  }
  return groups;
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function compareEntries(left: ProgressionIndexEntry, right: ProgressionIndexEntry): number {
  return left.id.localeCompare(right.id);
}
