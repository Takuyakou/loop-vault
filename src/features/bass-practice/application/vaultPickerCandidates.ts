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
 * A single visible Vault progression may offer several safe Chord Context
 * sections. Keep those sections explicit, but never render each one as a
 * duplicate top-level Vault row.
 */
export interface VaultPickerProgressionGroupView {
  readonly id: string;
  readonly displayTitle: string;
  readonly candidates: readonly VaultPickerCandidateView[];
  readonly preferredCandidate: VaultPickerCandidateView;
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

/**
 * Groups only by the stable logical Vault progression reference. Live titles
 * remain presentation data, so duplicate titles from distinct Vault entries
 * remain distinct picker rows.
 */
export function groupVaultPickerCandidates(
  candidates: readonly VaultPickerCandidateView[],
): readonly VaultPickerProgressionGroupView[] {
  const groups = new Map<string, VaultPickerCandidateView[]>();
  for (const candidate of candidates) {
    const reference = candidate.safeSnapshot.source.reference;
    const id = `${reference.ideaId}:${reference.blockId}`;
    const group = groups.get(id);
    if (group) group.push(candidate);
    else groups.set(id, [candidate]);
  }

  return Object.freeze([...groups.entries()].map(([id, group]) => {
    const sections = Object.freeze([...group].sort(comparePickerSections));
    return Object.freeze({
      id,
      displayTitle: sections[0]!.displayTitle,
      candidates: sections,
      preferredCandidate: sections[0]!,
    });
  }));
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

/** Prefer the longest complete progression from its earliest start bar. */
function comparePickerSections(left: VaultPickerCandidateView, right: VaultPickerCandidateView): number {
  const length = right.safeSnapshot.section.lengthBeats - left.safeSnapshot.section.lengthBeats;
  if (length) return length;
  const start = left.safeSnapshot.section.startBar - right.safeSnapshot.section.startBar;
  if (start) return start;
  const end = left.safeSnapshot.section.endBar - right.safeSnapshot.section.endBar;
  if (end) return end;
  const leftSignature = left.safeSnapshot.signature;
  const rightSignature = right.safeSnapshot.signature;
  return leftSignature < rightSignature ? -1 : leftSignature > rightSignature ? 1 : 0;
}