import type { SavedProgressionBlock, SongIdea } from "../../../domain/types";
import {
  addExactBeat,
  capturedHarmonySignature,
  compareExactBeat,
  exactBeat,
  sourceBasslineSnapshotSchema,
  type CapturedHarmonySpan,
  type ExactBeat,
  type SourceBasslineSnapshotV1,
} from "../../../domain/sourceBassline";
import { chordPitchClasses } from "../../../domain/chordVoicing";
import type { SourceBasslineHarmonyComparison } from "../domain";
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

/** Strict detached source asset, catalogued independently from Chord Context eligibility. */
export interface VaultSourceBasslineCandidateView {
  /** Presentation-only live title; never persisted in Practice or recording facts. */
  readonly displayTitle: string;
  readonly reference: Readonly<{ readonly ideaId: string; readonly blockId: string }>;
  readonly sourceBassline: SourceBasslineSnapshotV1;
  readonly harmonyComparison?: SourceBasslineHarmonyComparison;
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

/**
 * Builds the strict source snapshot catalog without consulting current chord,
 * key, meter, or Chord Context support. A later progression edit must not make
 * an immutable saved performance disappear from Level 3.
 */
export function buildVaultSourceBasslineCandidateViews(
  ideas: readonly SongIdea[],
  fallbackTitle: string,
): readonly VaultSourceBasslineCandidateView[] {
  const candidates: VaultSourceBasslineCandidateView[] = [];
  for (const idea of ideas) {
    const displayTitle = normalizeDisplayTitle(idea.title, fallbackTitle);
    for (const block of idea.progressionBlocks ?? []) {
      if (!block.sourceBassline) continue;
      const parsed = sourceBasslineSnapshotSchema.safeParse(block.sourceBassline);
      if (!parsed.success) continue;
      candidates.push(Object.freeze({
        displayTitle,
        reference: Object.freeze({ ideaId: idea.id, blockId: block.id }),
        sourceBassline: deepFreeze(parsed.data),
        harmonyComparison: compareSourceBasslineCurrentHarmony(block, parsed.data),
      }));
    }
  }
  return Object.freeze(candidates);
}
export function compareSourceBasslineCurrentHarmony(
  block: SavedProgressionBlock,
  snapshot: SourceBasslineSnapshotV1,
): SourceBasslineHarmonyComparison {
  if (!snapshot.capturedHarmony || !block || block.timeSignature !== "4/4") return "comparison-unavailable";
  const current = currentHarmonySpans(block.chords, snapshot.length);
  if (!current) return "comparison-unavailable";
  return capturedHarmonySignature(current) === snapshot.capturedHarmony.signature ? "match" : "mismatch";
}

function currentHarmonySpans(
  chords: SavedProgressionBlock["chords"],
  length: ExactBeat,
): readonly CapturedHarmonySpan[] | undefined {
  if (!Array.isArray(chords) || chords.length === 0) return undefined;
  const spans: CapturedHarmonySpan[] = [];
  for (const item of chords) {
    if (!Number.isSafeInteger(item.bar) || item.bar < 1
      || !Number.isSafeInteger(item.beat) || item.beat < 1 || item.beat > 4
      || !Number.isSafeInteger(item.durationBeats) || item.durationBeats <= 0) return undefined;
    const start = exactBeat((item.bar - 1) * 4 + item.beat - 1, 1);
    const end = addExactBeat(start, exactBeat(item.durationBeats, 1));
    if (compareExactBeat(end, ZERO_BEAT) <= 0 || compareExactBeat(start, length) >= 0) continue;
    const clippedStart = compareExactBeat(start, ZERO_BEAT) < 0 ? ZERO_BEAT : start;
    const clippedEnd = compareExactBeat(end, length) > 0 ? length : end;
    const normalize = (value: number) => ((value % 12) + 12) % 12;
    spans.push({
      start: clippedStart,
      duration: addExactBeat(clippedEnd, exactBeat(-clippedStart.numerator, clippedStart.denominator)),
      rootPitchClass: normalize(item.chord.root),
      bassPitchClass: item.chord.bass === undefined ? null : normalize(item.chord.bass),
      allowedPitchClasses: [...new Set([
        ...chordPitchClasses(item.chord),
        ...(item.chord.bass === undefined ? [] : [item.chord.bass]),
      ].map(normalize))].sort((left, right) => left - right),
    });
  }
  spans.sort(compareCurrentHarmonySpans);
  const deduplicated = spans.filter((span, index) => index === 0 || JSON.stringify(span) !== JSON.stringify(spans[index - 1]));
  for (let index = 1; index < deduplicated.length; index += 1) {
    const previous = deduplicated[index - 1]!;
    if (compareExactBeat(addExactBeat(previous.start, previous.duration), deduplicated[index]!.start) > 0) return undefined;
  }
  return deduplicated.length ? Object.freeze(deduplicated) : undefined;
}

function compareCurrentHarmonySpans(left: CapturedHarmonySpan, right: CapturedHarmonySpan): number {
  return compareExactBeat(left.start, right.start)
    || compareExactBeat(left.duration, right.duration)
    || left.rootPitchClass - right.rootPitchClass
    || (left.bassPitchClass ?? -1) - (right.bassPitchClass ?? -1)
    || JSON.stringify(left.allowedPitchClasses).localeCompare(JSON.stringify(right.allowedPitchClasses));
}

const ZERO_BEAT = Object.freeze(exactBeat(0, 1));
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
