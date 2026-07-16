import type { ProgressionBlockCandidate } from "../types";

export interface CandidateSelectionEntry {
  candidate: ProgressionBlockCandidate;
  dedupeKey: string;
  selectionScore: number;
}

export const candidateOverlapIouThreshold = 0.6;

const candidateLengths = [4, 8, 16] as const;

export function candidateLimitForBars(totalBars: number): number {
  if (totalBars <= 32) return 6;
  if (totalBars <= 64) return 8;
  if (totalBars <= 128) return 10;
  return 12;
}

export function candidateRegionCountForBars(totalBars: number): number {
  if (totalBars <= 32) return 2;
  if (totalBars <= 64) return 3;
  return 4;
}

export function candidateRegionIndex(startBar: number, totalBars: number): number {
  const regionCount = candidateRegionCountForBars(totalBars);
  const normalizedBar = Math.max(1, Math.min(Math.max(1, totalBars), startBar));
  return Math.min(
    regionCount - 1,
    Math.floor((normalizedBar - 1) * regionCount / Math.max(1, totalBars)),
  );
}

export function candidateIntervalIou(
  left: Pick<ProgressionBlockCandidate, "startBar" | "endBar">,
  right: Pick<ProgressionBlockCandidate, "startBar" | "endBar">,
): number {
  const intersection = Math.max(
    0,
    Math.min(left.endBar, right.endBar) - Math.max(left.startBar, right.startBar) + 1,
  );
  if (intersection === 0) return 0;
  const leftLength = Math.max(0, left.endBar - left.startBar + 1);
  const rightLength = Math.max(0, right.endBar - right.startBar + 1);
  return intersection / Math.max(1, leftLength + rightLength - intersection);
}

export function selectProgressionCandidates(
  raw: readonly CandidateSelectionEntry[],
  totalBars: number,
): ProgressionBlockCandidate[] {
  const orderedRaw = [...raw]
    .filter((entry) => Number.isFinite(entry.selectionScore))
    .sort(compareEntries);
  const ranked = deduplicate(orderedRaw);
  const limit = Math.min(candidateLimitForBars(totalBars), orderedRaw.length);
  if (limit === 0) return [];

  const selected: CandidateSelectionEntry[] = [];
  const selectedIds = new Set<string>();
  const add = (entry: CandidateSelectionEntry | undefined): void => {
    if (!entry || selectedIds.has(entry.candidate.id) || selected.length >= limit) return;
    selected.push(entry);
    selectedIds.add(entry.candidate.id);
  };
  const compatible = (entry: CandidateSelectionEntry): boolean => selected.every(
    (current) => candidateIntervalIou(current.candidate, entry.candidate)
      < candidateOverlapIouThreshold,
  );

  const regionCount = candidateRegionCountForBars(totalBars);
  for (let region = 0; region < regionCount; region += 1) {
    const regionCandidates = ranked.filter(
      (entry) => candidateRegionIndex(entry.candidate.startBar, totalBars) === region,
    );
    const rawRegionCandidates = orderedRaw.filter(
      (entry) => candidateRegionIndex(entry.candidate.startBar, totalBars) === region,
    );
    add(
      regionCandidates.find(compatible)
      ?? rawRegionCandidates.find(compatible)
      ?? regionCandidates[0]
      ?? rawRegionCandidates[0],
    );
  }

  for (const lengthBars of candidateLengths) {
    if (selected.some((entry) => entry.candidate.lengthBars === lengthBars)) continue;
    add(ranked.find((entry) => entry.candidate.lengthBars === lengthBars && compatible(entry)));
  }

  for (const entry of ranked) {
    if (selected.length >= limit) break;
    if (compatible(entry)) add(entry);
  }

  if (selected.length < limit) {
    const remaining = ranked
      .filter((entry) => !selectedIds.has(entry.candidate.id))
      .sort((left, right) => maximumIou(left, selected) - maximumIou(right, selected)
        || compareEntries(left, right));
    for (const entry of remaining) {
      add(entry);
      if (selected.length >= limit) break;
    }
  }

  return selected.slice(0, limit).map(({ candidate, selectionScore }) => ({
    ...candidate,
    selectionScore,
  }));
}

function deduplicate(raw: readonly CandidateSelectionEntry[]): CandidateSelectionEntry[] {
  const seen = new Set<string>();
  return raw.filter((entry) => {
      if (seen.has(entry.dedupeKey)) return false;
      seen.add(entry.dedupeKey);
      return true;
    });
}

function compareEntries(left: CandidateSelectionEntry, right: CandidateSelectionEntry): number {
  return right.selectionScore - left.selectionScore
    || right.candidate.confidence - left.candidate.confidence
    || left.candidate.startBar - right.candidate.startBar
    || left.candidate.lengthBars - right.candidate.lengthBars
    || left.candidate.endBar - right.candidate.endBar
    || left.candidate.id.localeCompare(right.candidate.id);
}

function maximumIou(
  entry: CandidateSelectionEntry,
  selected: readonly CandidateSelectionEntry[],
): number {
  return selected.reduce(
    (maximum, current) => Math.max(
      maximum,
      candidateIntervalIou(entry.candidate, current.candidate),
    ),
    0,
  );
}
