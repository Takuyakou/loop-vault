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
  vaultSortLabels,
  type VaultFilters,
  type VaultSort,
} from "./vaultLibrary";

/** Session memory for the Vault's filters and sort (the old view-mode memory used the same scope). */
export const VAULT_LIBRARY_SESSION_KEY = "loop-vault.vault-library:v1";

/** Filter, search and sort state of the Vault list. */
export function useVaultLibraryFilters(ideas: SongIdea[], progressionIndex: ProgressionIndexEntry[]) {
  const [remembered] = useState(readRemembered);
  const [filters, setFilters] = useState<VaultFilters>(remembered.filters);
  const [sort, setSort] = useState<VaultSort>(remembered.sort);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => buildVaultRows(ideas, progressionIndex), [ideas, progressionIndex]);
  const result = useMemo(() => queryVault(rows, filters, query, sort), [filters, query, rows, sort]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(VAULT_LIBRARY_SESSION_KEY, JSON.stringify({ version: 1, filters, sort }));
    } catch {
      // UI preferences must never block the Vault.
    }
  }, [filters, sort]);

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

function readRemembered(): { filters: VaultFilters; sort: VaultSort } {
  const fallback = { filters: emptyVaultFilters, sort: "newest" as VaultSort };
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(VAULT_LIBRARY_SESSION_KEY) ?? "null") as
      { version?: number; filters?: Partial<VaultFilters>; sort?: string } | null;
    if (parsed?.version !== 1) return fallback;
    const strings = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);
    const filters: VaultFilters = {
      keys: strings(parsed.filters?.keys),
      tags: strings(parsed.filters?.tags),
      lengths: strings(parsed.filters?.lengths).filter((value): value is VaultFilters["lengths"][number] => (lengthBuckets as readonly string[]).includes(value)),
      sources: strings(parsed.filters?.sources).filter((value): value is VaultFilters["sources"][number] => (sourceKinds as readonly string[]).includes(value)),
      favorite: parsed.filters?.favorite === true,
    };
    const sort = parsed.sort && parsed.sort in vaultSortLabels ? parsed.sort as VaultSort : fallback.sort;
    return { filters, sort };
  } catch {
    return fallback;
  }
}
