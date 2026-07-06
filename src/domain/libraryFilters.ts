import type { SongIdea, Status } from "./types";

export type SortField = "updatedAt" | "createdAt" | "bpm";
export type SortDirection = "asc" | "desc";

export interface IdeaFilters {
  statuses?: Status[];
  genres?: string[];
  moods?: string[];
  query?: string;
}

export interface IdeaSort {
  field: SortField;
  direction: SortDirection;
}

export function filterIdeas(
  ideas: SongIdea[],
  filters: IdeaFilters = {},
): SongIdea[] {
  const statuses = new Set(filters.statuses ?? []);
  const genres = normalizeSet(filters.genres ?? []);
  const moods = normalizeSet(filters.moods ?? []);
  const query = normalize(filters.query ?? "");

  return ideas.filter((idea) => {
    if (statuses.size > 0 && !statuses.has(idea.status)) {
      return false;
    }

    if (genres.size > 0 && !idea.genre) {
      return false;
    }

    if (idea.genre && genres.size > 0 && !genres.has(normalize(idea.genre))) {
      return false;
    }

    if (
      moods.size > 0 &&
      !idea.moods.some((mood) => moods.has(normalize(mood)))
    ) {
      return false;
    }

    if (query && !searchText(idea).includes(query)) {
      return false;
    }

    return true;
  });
}

export function sortIdeas(ideas: SongIdea[], sort: IdeaSort): SongIdea[] {
  return [...ideas].sort((a, b) => compareIdeas(a, b, sort));
}

export function filterAndSortIdeas(
  ideas: SongIdea[],
  filters: IdeaFilters,
  sort: IdeaSort,
): SongIdea[] {
  return sortIdeas(filterIdeas(ideas, filters), sort);
}

function compareIdeas(a: SongIdea, b: SongIdea, sort: IdeaSort): number {
  const direction = sort.direction === "asc" ? 1 : -1;

  if (sort.field === "bpm") {
    return compareOptionalNumbers(a.bpm, b.bpm, direction);
  }

  const aTime = new Date(a[sort.field]).getTime();
  const bTime = new Date(b[sort.field]).getTime();

  if (aTime !== bTime) {
    return (aTime - bTime) * direction;
  }

  return a.title.localeCompare(b.title);
}

function compareOptionalNumbers(
  a: number | undefined,
  b: number | undefined,
  direction: 1 | -1,
): number {
  if (a === undefined && b === undefined) {
    return 0;
  }

  if (a === undefined) {
    return 1;
  }

  if (b === undefined) {
    return -1;
  }

  if (a !== b) {
    return (a - b) * direction;
  }

  return 0;
}

function normalizeSet(values: string[]): Set<string> {
  return new Set(values.map(normalize).filter(Boolean));
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function searchText(idea: SongIdea): string {
  return normalize(
    [idea.title, idea.chordMemo, idea.nextAction.text].filter(Boolean).join(" "),
  );
}
