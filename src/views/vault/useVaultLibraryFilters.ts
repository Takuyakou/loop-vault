import { useEffect, useMemo, useState } from "react";
import type { ProgressionIndexEntry } from "../../domain/progressionClassification/mod";
import type { SongIdea } from "../../domain/types";
import {
  activeFilterCount,
  buildVaultRows,
  emptyVaultFilters,
  lengthBuckets,
  queryVault,
  sourceKinds,
  type VaultFilters,
  type VaultSort,
} from "./vaultLibrary";

/** Session memory for the Vault's filters (the old view-mode memory used the same scope). */
export const VAULT_LIBRARY_SESSION_KEY = "loop-vault.vault-library:v1";

/**
 * The sort lives only in this module, so every launch (and reload) starts at 新しい順
 * (P8.9-08, decided by the human); within one run the chosen sort is kept.
 */
let sortThisLaunch: VaultSort = "newest";

/** Filter, search and sort state of the Vault list. */
export function useVaultLibraryFilters(ideas: SongIdea[], progressionIndex: ProgressionIndexEntry[]) {
  const [remembered] = useState(readRemembered);
  const [filters, setFilters] = useState<VaultFilters>(remembered.filters);
  const [sort, setSortState] = useState<VaultSort>(sortThisLaunch);
  const setSort = (next: VaultSort) => {
    sortThisLaunch = next;
    setSortState(next);
  };
  const [query, setQuery] = useState("");
  const rows = useMemo(() => buildVaultRows(ideas, progressionIndex), [ideas, progressionIndex]);
  const result = useMemo(() => queryVault(rows, filters, query, sort), [filters, query, rows, sort]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(VAULT_LIBRARY_SESSION_KEY, JSON.stringify({ version: 1, filters }));
    } catch {
      // UI preferences must never block the Vault.
    }
  }, [filters]);

  function toggle<K extends "keys" | "lengths" | "tags" | "sources">(facet: K, value: VaultFilters[K][number]) {
    setFilters((current) => {
      const values = current[facet] as string[];
      return { ...current, [facet]: values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value] };
    });
  }

  return {
    filters,
    toggle,
    setFavorite: (favorite: boolean) => setFilters((current) => ({ ...current, favorite })),
    clearFilters: () => setFilters(emptyVaultFilters),
    activeCount: activeFilterCount(filters),
    query, setQuery,
    sort, setSort,
    total: rows.length,
    visible: result.rows,
    counts: result.counts,
  };
}

function readRemembered(): { filters: VaultFilters } {
  const fallback = { filters: emptyVaultFilters };
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(VAULT_LIBRARY_SESSION_KEY) ?? "null") as
      { version?: number; filters?: Partial<VaultFilters> } | null;
    if (parsed?.version !== 1) return fallback;
    const strings = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);
    const filters: VaultFilters = {
      keys: strings(parsed.filters?.keys),
      tags: strings(parsed.filters?.tags),
      lengths: strings(parsed.filters?.lengths).filter((value): value is VaultFilters["lengths"][number] => (lengthBuckets as readonly string[]).includes(value)),
      sources: strings(parsed.filters?.sources).filter((value): value is VaultFilters["sources"][number] => (sourceKinds as readonly string[]).includes(value)),
      favorite: parsed.filters?.favorite === true,
    };
    return { filters };
  } catch {
    return fallback;
  }
}
