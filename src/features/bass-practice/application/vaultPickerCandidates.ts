import type { SongIdea } from "../../../domain/types";
import {
  buildVaultChordContextSnapshotCatalog,
  type VaultChordContextSnapshot,
} from "../domain";

/**
 * A presentation-only projection of a current Vault progression.  The live
 * title must remain here: the detached snapshot intentionally contains only
 * harmonic facts and stable logical references.
 */
export interface VaultPickerCandidateView {
  readonly displayTitle: string;
  readonly searchableTitle: string;
  readonly safeSnapshot: VaultChordContextSnapshot;
}

/**
 * Builds the picker-only boundary between live Vault titles and safe Chord
 * Context snapshots.  This is deliberately recomputed from the live Vault;
 * it must not be persisted in Practice, History, or recording metadata.
 */
export function buildVaultPickerCandidateViews(
  ideas: readonly SongIdea[],
  fallbackTitle: string,
): readonly VaultPickerCandidateView[] {
  const titlesByIdeaAndBlock = new Map<string, Map<string, string>>();
  for (const idea of ideas) {
    const titlesByBlock = new Map<string, string>();
    const displayTitle = normalizeDisplayTitle(idea.title, fallbackTitle);
    for (const block of idea.progressionBlocks ?? []) titlesByBlock.set(block.id, displayTitle);
    titlesByIdeaAndBlock.set(idea.id, titlesByBlock);
  }

  return Object.freeze(buildVaultChordContextSnapshotCatalog(ideas).map((safeSnapshot) => {
    const displayTitle = titlesByIdeaAndBlock
      .get(safeSnapshot.source.reference.ideaId)
      ?.get(safeSnapshot.source.reference.blockId)
      ?? normalizeDisplayTitle("", fallbackTitle);
    return Object.freeze({
      displayTitle,
      searchableTitle: normalizeSearchText(displayTitle),
      safeSnapshot,
    });
  }));
}

/** Preserves the existing safe key/section/chord search while adding live-title matching. */
export function filterVaultPickerCandidates(
  candidates: readonly VaultPickerCandidateView[],
  query: string,
): readonly VaultPickerCandidateView[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return candidates;
  return candidates.filter((candidate) => (
    candidate.searchableTitle.includes(normalizedQuery)
    || searchableSnapshotText(candidate.safeSnapshot).includes(normalizedQuery)
  ));
}

export function normalizeDisplayTitle(title: string, fallbackTitle: string): string {
  const normalizedTitle = title.normalize("NFC").trim();
  if (normalizedTitle) return normalizedTitle;
  const normalizedFallback = fallbackTitle.normalize("NFC").trim();
  return normalizedFallback || "Untitled progression";
}

function searchableSnapshotText(snapshot: VaultChordContextSnapshot): string {
  return normalizeSearchText([
    snapshot.source.safeLabel,
    snapshot.tonalContext.key,
    `${snapshot.section.startBar}-${snapshot.section.endBar}`,
    ...snapshot.section.chords.map((chord) => chord.label),
  ].join(" "));
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase();
}
