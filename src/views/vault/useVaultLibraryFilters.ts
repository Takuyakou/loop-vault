import { useMemo, useState } from "react";
import { isRecent, type ProgressionLibraryScope } from "../../components/ProgressionLibraryRail";
import { filterProgressionIndex, type ProgressionIndexEntry } from "../../domain/progressionClassification/mod";
import { filterAndSortProgressions } from "../../domain/progressionFilters";
import type { SavedProgressionBlock, SongIdea } from "../../domain/types";

export type ProgressionEntry = { idea: SongIdea; block: SavedProgressionBlock };
export type SortField = "capturedAt" | "updatedAt" | "key" | "bpm";
export type VaultMode = "library" | "list" | "idea";
type ProgressionViewMode = Exclude<VaultMode, "idea">;
export type LengthFilter = "all" | "4" | "8" | "16";

const progressionViewModeSessionKey = "loop-vault.progression-view-mode";

/** Filter, search and sort state of the Vault list, plus the remembered view mode. */
export function useVaultLibraryFilters(ideas: SongIdea[], progressionIndex: ProgressionIndexEntry[]) {
  const [mode, setMode] = useState<VaultMode>(readProgressionViewMode);
  const [libraryScope, setLibraryScope] = useState<ProgressionLibraryScope>("all");
  const [selectedLibraryTags, setSelectedLibraryTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [lengthBars, setLengthBars] = useState<LengthFilter>("all");
  const [keyFilter, setKeyFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState<SortField>("capturedAt");
  const allBlocks = useMemo(() => ideas.flatMap((idea) => idea.progressionBlocks ?? []), [ideas]);
  const keys = useMemo(() => [...new Set(ideas.flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => block.detectedKey ?? idea.key).filter((value): value is string => Boolean(value))))].sort(), [ideas]);
  const sources = useMemo(() => [...new Set(allBlocks.map((block) => block.sourceFileName).filter((value): value is string => Boolean(value)))].sort(), [allBlocks]);
  const tags = useMemo(() => [...new Set(allBlocks.flatMap((block) => block.tags))].sort(), [allBlocks]);
  const hasActiveFilters = onlyPinned
    || lengthBars !== "all"
    || keyFilter !== ""
    || sourceFilter !== ""
    || tagFilter !== ""
    || selectedLibraryTags.length > 0;
  const visible = useMemo(() => {
    const sorted = filterAndSortProgressions(ideas, {
      query: mode === "library" ? "" : query,
      pinnedOnly: onlyPinned,
      keys: keyFilter ? [keyFilter] : [],
      lengths: lengthBars === "all" ? [] : [Number(lengthBars)],
      sources: sourceFilter ? [sourceFilter] : [],
      tags: tagFilter ? [tagFilter] : [],
    }, { field: sort, direction: sort === "key" || sort === "bpm" ? "asc" : "desc" });
    if (mode !== "library") return sorted;
    const libraryMatches = filterProgressionIndex(progressionIndex, {
      query,
      tagIds: selectedLibraryTags,
    }).filter((entry) => {
      if (libraryScope === "favorites") return entry.favorite;
      if (libraryScope === "recent") return isRecent(entry.createdAt);
      return true;
    });
    const allowed = new Set(libraryMatches.map((entry) => entry.id));
    return sorted.filter((entry) => allowed.has(progressionEntryId(entry)));
  }, [ideas, keyFilter, lengthBars, libraryScope, mode, onlyPinned, progressionIndex, query, selectedLibraryTags, sort, sourceFilter, tagFilter]);

  function changeMode(next: VaultMode) {
    setMode(next);
    if (next !== "idea") writeProgressionViewMode(next);
  }

  function clearFilters() {
    setOnlyPinned(false);
    setLengthBars("all");
    setKeyFilter("");
    setSourceFilter("");
    setTagFilter("");
    setSelectedLibraryTags([]);
    setLibraryScope("all");
  }

  return {
    mode, changeMode,
    libraryScope, setLibraryScope,
    selectedLibraryTags, setSelectedLibraryTags,
    query, setQuery,
    onlyPinned, setOnlyPinned,
    lengthBars, setLengthBars,
    keyFilter, setKeyFilter,
    sourceFilter, setSourceFilter,
    tagFilter, setTagFilter,
    sort, setSort,
    keys, sources, tags,
    hasActiveFilters, clearFilters,
    visible,
  };
}

export function progressionEntryId(entry: ProgressionEntry): string { return `${entry.idea.id}:${entry.block.id}`; }

function readProgressionViewMode(): ProgressionViewMode {
  try {
    const stored = window.sessionStorage.getItem(progressionViewModeSessionKey);
    return stored === "list" || stored === "library" ? stored : "library";
  } catch {
    return "library";
  }
}

function writeProgressionViewMode(mode: ProgressionViewMode): void {
  try {
    window.sessionStorage.setItem(progressionViewModeSessionKey, mode);
  } catch {
    // UI preferences must never block the Vault.
  }
}
