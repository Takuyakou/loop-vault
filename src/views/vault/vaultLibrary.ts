// Vault list (P8.9-04): progressions only, faceted filters, chord / degree search, sort.
// Pure functions over the ideas; the view renders what these return.
import { degreeOf } from "../../domain/harmony/degrees";
import type { ProgressionIndexEntry } from "../../domain/progressionClassification/mod";
import type { SavedProgressionBlock, SongIdea } from "../../domain/types";
import {
  progressionBars,
  progressionBpm,
  progressionKey,
  progressionName,
  progressionSourceKind,
  type ProgressionSourceKind,
} from "./progressionFacts";

export type LengthBucket = "le4" | "5to8" | "9to16" | "ge17";
export const lengthBuckets: readonly LengthBucket[] = ["le4", "5to8", "9to16", "ge17"];
export const lengthBucketLabels: Record<LengthBucket, string> = {
  le4: "〜4小節",
  "5to8": "5〜8小節",
  "9to16": "9〜16小節",
  ge17: "17小節〜",
};
export const sourceKinds: readonly ProgressionSourceKind[] = ["midi", "text", "live-midi"];

export interface VaultFilters {
  keys: string[];
  lengths: LengthBucket[];
  tags: string[];
  sources: ProgressionSourceKind[];
  favorite: boolean;
}

export type VaultSort = "newest" | "name" | "length" | "practiced";
export const vaultSortLabels: Record<VaultSort, string> = {
  newest: "新しい順",
  name: "名前順",
  length: "長さ順",
  practiced: "最近練習した順",
};

export const emptyVaultFilters: VaultFilters = { keys: [], lengths: [], tags: [], sources: [], favorite: false };

export interface VaultRow {
  id: string;
  idea: SongIdea;
  block: SavedProgressionBlock;
  name: string;
  key?: string;
  bpm?: number;
  bars: number;
  length: LengthBucket;
  source: ProgressionSourceKind;
  /** Manual tags plus the Smart Library's derived tags (ids). */
  tags: string[];
  searchText: string;
}

/** Which chords a search matched, for highlighting ([start, end], inclusive). */
export interface VaultMatch {
  kind: "degree" | "chord";
  start: number;
  end: number;
}

export function lengthBucketOf(bars: number): LengthBucket {
  if (bars <= 4) return "le4";
  if (bars <= 8) return "5to8";
  if (bars <= 16) return "9to16";
  return "ge17";
}

export function buildVaultRows(ideas: readonly SongIdea[], index: readonly ProgressionIndexEntry[] = []): VaultRow[] {
  const derived = new Map(index.map((entry) => [entry.id, entry.effectiveTags]));
  return ideas.flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => {
    const id = `${idea.id}:${block.id}`;
    const bars = progressionBars(block);
    const name = progressionName(idea, block);
    const tags = [...new Set([...block.tags, ...(derived.get(id) ?? [])])];
    return {
      id, idea, block, name, bars,
      key: progressionKey(idea, block),
      bpm: progressionBpm(idea, block),
      length: lengthBucketOf(bars),
      source: progressionSourceKind(block),
      tags,
      searchText: [name, idea.title, block.summaryText, block.memo ?? "", block.sourceFileName ?? "", ...tags]
        .join(" ").toLocaleLowerCase(),
    };
  }));
}

export function ideasWithoutProgressions(ideas: readonly SongIdea[]): SongIdea[] {
  return ideas.filter((idea) => !idea.progressionBlocks?.length);
}

type DegreeTerm = { degree: number; accidental: -1 | 0 | 1 };
const romanDegrees: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };

/** "2-5-1", "2 5 1", "251", "b7-1", "ii-V-I" → degree terms; anything else → undefined. */
export function parseDegreeQuery(query: string): DegreeTerm[] | undefined {
  const text = query.trim().replace(/♭/g, "b").replace(/♯/g, "#");
  if (/^[1-7]{2,}$/.test(text)) return [...text].map((digit) => ({ degree: Number(digit), accidental: 0 }));
  const tokens = text.split(/\s*(?:[-–>→,]|\s)\s*/).filter(Boolean);
  if (tokens.length < 2) return undefined;
  const terms = tokens.map((token) => {
    const match = /^([b#]?)([1-7]|vii|vi|iv|v|iii|ii|i)$/i.exec(token);
    if (!match) return undefined;
    const degree = /\d/.test(match[2]) ? Number(match[2]) : romanDegrees[match[2].toLowerCase()];
    return { degree, accidental: match[1] === "b" ? -1 : match[1] === "#" ? 1 : 0 } as DegreeTerm;
  });
  return terms.every(Boolean) ? terms as DegreeTerm[] : undefined;
}

/** A consecutive run of the progression's degrees (from its key); repeated chords count once. */
export function matchDegrees(row: Pick<VaultRow, "block" | "key">, terms: readonly DegreeTerm[]): VaultMatch | undefined {
  if (!row.key) return undefined;
  const runs: { degree?: DegreeTerm; start: number; end: number }[] = [];
  row.block.chords.forEach((item, index) => {
    const found = degreeOf(item.chord, row.key);
    const degree = found ? { degree: found.degree, accidental: found.accidental } : undefined;
    const last = runs[runs.length - 1];
    if (last && last.degree && degree && last.degree.degree === degree.degree && last.degree.accidental === degree.accidental) last.end = index;
    else runs.push({ degree, start: index, end: index });
  });
  for (let start = 0; start + terms.length <= runs.length; start += 1) {
    const hit = terms.every((term, offset) => {
      const run = runs[start + offset].degree;
      return run?.degree === term.degree && run.accidental === term.accidental;
    });
    if (hit) return { kind: "degree", start: runs[start].start, end: runs[start + terms.length - 1].end };
  }
  return undefined;
}

const chordToken = /^[A-G](?:#|b|♯|♭)?\S*$/i;

/** Chord-name prefix search: "Dm7" finds Dm7 and Dm7(9); "Dm7 G7" finds them in a row. */
export function matchChords(row: Pick<VaultRow, "block">, query: string): VaultMatch | undefined {
  const terms = query.trim().split(/\s*[-–>→\s]\s*/).filter(Boolean).map((term) => term.toLocaleLowerCase());
  if (!terms.length || !terms.every((term) => chordToken.test(term))) return undefined;
  const labels = row.block.chords.map((item) => item.chord.label.toLocaleLowerCase());
  for (let start = 0; start + terms.length <= labels.length; start += 1) {
    if (terms.every((term, offset) => labels[start + offset].startsWith(term))) {
      return { kind: "chord", start, end: start + terms.length - 1 };
    }
  }
  return undefined;
}

/** undefined = no match; null = matched without a chord range (name, file, tag, or empty query). */
export function searchRow(row: VaultRow, query: string): VaultMatch | null | undefined {
  const text = query.trim();
  if (!text) return null;
  const degrees = parseDegreeQuery(text);
  if (degrees) return matchDegrees(row, degrees);
  const chords = matchChords(row, text);
  if (chords) return chords;
  const lower = text.toLocaleLowerCase();
  if (row.searchText.includes(lower)) return null;
  // Chord-looking queries match chord names by prefix only; other text may appear inside a chord name.
  if (!chordToken.test(text) && row.block.chords.some((item) => item.chord.label.toLocaleLowerCase().includes(lower))) return null;
  return undefined;
}

type Facet = keyof VaultFilters;

function passes(row: VaultRow, filters: VaultFilters, skip?: Facet): boolean {
  if (skip !== "favorite" && filters.favorite && !row.block.pinned) return false;
  if (skip !== "keys" && filters.keys.length && !filters.keys.includes(row.key ?? "")) return false;
  if (skip !== "lengths" && filters.lengths.length && !filters.lengths.includes(row.length)) return false;
  if (skip !== "sources" && filters.sources.length && !filters.sources.includes(row.source)) return false;
  if (skip !== "tags" && filters.tags.length && !filters.tags.some((tag) => row.tags.includes(tag))) return false;
  return true;
}

export interface VaultResult {
  rows: { row: VaultRow; match?: VaultMatch }[];
  counts: {
    favorite: number;
    keys: Map<string, number>;
    lengths: Map<LengthBucket, number>;
    sources: Map<ProgressionSourceKind, number>;
    tags: Map<string, number>;
  };
}

/** Within a facet values are OR, facets are AND; each facet's counts ignore that facet's own selection. */
export function queryVault(rows: readonly VaultRow[], filters: VaultFilters, query: string, sort: VaultSort): VaultResult {
  const searched = rows.flatMap((row) => {
    const match = searchRow(row, query);
    return match === undefined ? [] : [{ row, match: match ?? undefined }];
  });
  const count = <T,>(facet: Facet, values: (row: VaultRow) => readonly T[]) => {
    const counts = new Map<T, number>();
    searched.forEach(({ row }) => {
      if (passes(row, filters, facet)) values(row).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    });
    return counts;
  };
  return {
    rows: sortRows(searched.filter(({ row }) => passes(row, filters)), sort),
    counts: {
      favorite: searched.filter(({ row }) => row.block.pinned && passes(row, filters, "favorite")).length,
      keys: count("keys", (row) => (row.key ? [row.key] : [])),
      lengths: count("lengths", (row) => [row.length]),
      sources: count("sources", (row) => [row.source]),
      tags: count("tags", (row) => row.tags),
    },
  };
}

function sortRows<T extends { row: VaultRow }>(entries: T[], sort: VaultSort): T[] {
  const captured = (row: VaultRow) => Date.parse(row.block.capturedAt) || 0;
  const practiced = (row: VaultRow) => Date.parse(row.block.practice?.lastPracticedAt ?? "") || 0;
  const byName = (left: VaultRow, right: VaultRow) => left.name.localeCompare(right.name, "ja");
  const compare: Record<VaultSort, (left: VaultRow, right: VaultRow) => number> = {
    newest: (left, right) => captured(right) - captured(left),
    name: (left, right) => byName(left, right) || captured(right) - captured(left),
    length: (left, right) => left.bars - right.bars || byName(left, right),
    practiced: (left, right) => practiced(right) - practiced(left) || captured(right) - captured(left),
  };
  return [...entries].sort((left, right) => compare[sort](left.row, right.row));
}

export function activeFilterCount(filters: VaultFilters): number {
  return filters.keys.length + filters.lengths.length + filters.tags.length + filters.sources.length + (filters.favorite ? 1 : 0);
}
