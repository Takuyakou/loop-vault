import type { SavedProgressionBlock, SongIdea } from "../types";

export type ProgressionTagCategory =
  | "source"
  | "feature"
  | "use"
  | "mood"
  | "collection";

export interface DerivedProgressionTag {
  tagId: string;
  category: ProgressionTagCategory;
  source: "derived";
  confidence?: number;
  taxonomyVersion: number;
  reasons: string[];
}

export type ProgressionSourceKind =
  | "midi-capture"
  | "live-midi"
  | "chord-drip"
  | "manual";

export interface ProgressionSourceMetadata {
  kind?: ProgressionSourceKind;
  candidateLabels?: readonly string[];
}

export interface ProgressionClassificationInput {
  block: SavedProgressionBlock;
  key?: string;
  sourceMetadata?: ProgressionSourceMetadata;
}

export interface ProgressionClassificationResult {
  sourceTags: DerivedProgressionTag[];
  featureTags: DerivedProgressionTag[];
  useTags: DerivedProgressionTag[];
  moodTags: DerivedProgressionTag[];
}

export interface ProgressionIndexEntry {
  id: string;
  ideaId: string;
  blockId: string;
  block: SavedProgressionBlock;
  normalizedChordText: string;
  romanNumeralText: string;
  normalizedSearchText: string;
  manualTags: string[];
  derivedTags: DerivedProgressionTag[];
  effectiveTags: string[];
  key?: string;
  bpm?: number;
  bars?: number;
  origin?: string;
  favorite: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type ProgressionIndex = readonly ProgressionIndexEntry[];

export interface ProgressionIndexFilter {
  query?: string;
  tagIds?: readonly string[];
}

export type ProgressionIndexIdea = Pick<
  SongIdea,
  "id" | "title" | "key" | "bpm" | "progressionBlocks" | "updatedAt"
>;
