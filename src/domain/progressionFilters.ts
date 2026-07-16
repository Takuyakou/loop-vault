import { matchProgression, normalizeQuery } from "./harmony/degrees";
import type { SavedProgressionBlock, SongIdea } from "./types";

export interface ProgressionRecord { idea: SongIdea; block: SavedProgressionBlock }
export interface ProgressionFilters {
  query: string;
  pinnedOnly: boolean;
  keys: string[];
  lengths: number[];
  sources: string[];
  tags: string[];
}
export interface ProgressionSort { field: "capturedAt" | "updatedAt" | "key" | "bpm"; direction: "asc" | "desc" }

export function filterAndSortProgressions(
  ideas: readonly SongIdea[], filters: ProgressionFilters, sort: ProgressionSort,
): ProgressionRecord[] {
  const query = normalizeQuery(filters.query);
  return ideas.flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => ({ idea, block })))
    .filter(({ idea, block }) => {
      if (filters.pinnedOnly && !block.pinned) return false;
      const key = block.detectedKey ?? idea.key ?? "";
      if (filters.keys.length && !filters.keys.includes(key)) return false;
      if (filters.lengths.length && (!block.lengthBars || !filters.lengths.includes(block.lengthBars))) return false;
      if (filters.sources.length && (!block.sourceFileName || !filters.sources.includes(block.sourceFileName))) return false;
      if (filters.tags.length && !filters.tags.every((tag) => block.tags.includes(tag))) return false;
      if (query.kind !== "text") return matchProgression(block, query);
      if (!query.normalized) return true;
      return [idea.title, idea.genre ?? "", idea.moods.join(" "), idea.chordMemo,
        block.summaryText, block.memo ?? "", block.tags.join(" "), block.sourceFileName ?? ""]
        .join(" ").toLocaleLowerCase().includes(query.normalized);
    })
    .sort((left, right) => {
      if (Boolean(left.block.pinned) !== Boolean(right.block.pinned)) return right.block.pinned ? 1 : -1;
      const leftValue = sortValue(left, sort.field);
      const rightValue = sortValue(right, sort.field);
      const compared = typeof leftValue === "number"
        ? leftValue - (rightValue as number)
        : leftValue.localeCompare(rightValue as string);
      return sort.direction === "asc" ? compared : -compared;
    });
}

function sortValue(record: ProgressionRecord, field: ProgressionSort["field"]): string | number {
  if (field === "key") return record.block.detectedKey ?? record.idea.key ?? "";
  if (field === "bpm") return record.block.bpm ?? record.idea.bpm ?? 0;
  return new Date(field === "updatedAt" ? record.idea.updatedAt : record.block.capturedAt).getTime();
}
