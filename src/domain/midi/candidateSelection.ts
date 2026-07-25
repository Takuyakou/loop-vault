import type { ProgressionBlockCandidate } from "../types";
import { qualityFloor, type BlockQualityComponents } from "./blockQuality";
import type { CandidateDensityClass } from "./candidateBlock";

export interface CandidateSelectionEntry {
  candidate: ProgressionBlockCandidate;
  dedupeKey: string;
  selectionScore: number;
  densityClass?: CandidateDensityClass;
  quality?: BlockQualityComponents;
}

/** Why a candidate ended up in, or out of, the final list. */
export type CandidateSelectionReason =
  | "selected-by-region"
  | "selected-by-length"
  | "selected-by-density"
  | "selected-by-overall"
  | "selected-by-backfill"
  | "rejected-by-quality-floor"
  | "rejected-by-iou"
  | "rejected-by-limit"
  | "deduplicated";

export interface CandidateSelectionDiagnostic {
  id: string;
  startBar: number;
  lengthBars: number;
  densityClass?: CandidateDensityClass;
  selectionScore: number;
  reason: CandidateSelectionReason;
}

export const candidateOverlapIouThreshold = 0.6;

const candidateLengths = [2, 4, 8, 16] as const;
const densityClasses: readonly CandidateDensityClass[] = ["vamp", "compact", "standard", "dense"];

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
  diagnostics?: CandidateSelectionDiagnostic[],
): ProgressionBlockCandidate[] {
  const orderedRaw = [...raw]
    .filter((entry) => Number.isFinite(entry.selectionScore))
    .sort(compareEntries);
  const ranked = deduplicate(orderedRaw, diagnostics);
  const limit = Math.min(candidateLimitForBars(totalBars), orderedRaw.length);
  if (limit === 0) return [];

  const selected: CandidateSelectionEntry[] = [];
  const selectedIds = new Set<string>();
  const record = (entry: CandidateSelectionEntry, reason: CandidateSelectionReason): void => {
    diagnostics?.push({
      id: entry.candidate.id,
      startBar: entry.candidate.startBar,
      lengthBars: entry.candidate.lengthBars,
      ...(entry.densityClass ? { densityClass: entry.densityClass } : {}),
      selectionScore: entry.selectionScore,
      reason,
    });
  };
  const add = (
    entry: CandidateSelectionEntry | undefined,
    reason: CandidateSelectionReason,
  ): void => {
    if (!entry || selectedIds.has(entry.candidate.id) || selected.length >= limit) return;
    selected.push(entry);
    selectedIds.add(entry.candidate.id);
    record(entry, reason);
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
      "selected-by-region",
    );
  }

  for (const lengthBars of candidateLengths) {
    if (selected.some((entry) => entry.candidate.lengthBars === lengthBars)) continue;
    add(
      ranked.find((entry) => entry.candidate.lengthBars === lengthBars && compatible(entry)),
      "selected-by-length",
    );
  }

  // Density diversity: a vamp or a compact loop should be findable even when
  // busier blocks score higher. The quality floor is checked first so a slot is
  // never filled with a weak candidate purely to represent its class.
  for (const densityClass of densityClasses) {
    if (selected.some((entry) => entry.densityClass === densityClass)) continue;
    const candidate = ranked.find((entry) => entry.densityClass === densityClass
      && entry.selectionScore >= qualityFloor
      && compatible(entry));
    if (candidate) {
      add(candidate, "selected-by-density");
    } else {
      const belowFloor = ranked.find((entry) => entry.densityClass === densityClass
        && entry.selectionScore < qualityFloor);
      if (belowFloor) record(belowFloor, "rejected-by-quality-floor");
    }
  }

  // A short block recurs more often than a long one simply because more copies
  // fit, so the repeat term systematically favours it. Cap how much of the list
  // any single length may take, so two-bar loops are offered without crowding
  // out the longer sections.
  const lengthShareCap = Math.max(1, Math.ceil(limit / 2));
  const lengthUsage = () => selected.reduce((counts, entry) => {
    counts.set(entry.candidate.lengthBars, (counts.get(entry.candidate.lengthBars) ?? 0) + 1);
    return counts;
  }, new Map<number, number>());

  for (const entry of ranked) {
    if (selected.length >= limit) break;
    if ((lengthUsage().get(entry.candidate.lengthBars) ?? 0) >= lengthShareCap) continue;
    if (compatible(entry)) add(entry, "selected-by-overall");
  }

  // Second pass without the cap, so the list is still filled when one length is
  // all the piece has to offer.
  for (const entry of ranked) {
    if (selected.length >= limit) break;
    if (compatible(entry)) add(entry, "selected-by-overall");
  }

  if (selected.length < limit) {
    const remaining = ranked
      .filter((entry) => !selectedIds.has(entry.candidate.id))
      .sort((left, right) => maximumIou(left, selected) - maximumIou(right, selected)
        || compareEntries(left, right));
    for (const entry of remaining) {
      add(entry, "selected-by-backfill");
      if (selected.length >= limit) break;
    }
  }

  if (diagnostics) {
    for (const entry of ranked) {
      if (selectedIds.has(entry.candidate.id)) continue;
      record(entry, compatible(entry) ? "rejected-by-limit" : "rejected-by-iou");
    }
  }

  return selected.slice(0, limit).map(({ candidate, selectionScore, quality }) => ({
    ...candidate,
    selectionScore,
    ...(quality ? { quality } : {}),
  }));
}

function deduplicate(
  raw: readonly CandidateSelectionEntry[],
  diagnostics?: CandidateSelectionDiagnostic[],
): CandidateSelectionEntry[] {
  const seen = new Set<string>();
  return raw.filter((entry) => {
      if (seen.has(entry.dedupeKey)) {
        diagnostics?.push({
          id: entry.candidate.id,
          startBar: entry.candidate.startBar,
          lengthBars: entry.candidate.lengthBars,
          ...(entry.densityClass ? { densityClass: entry.densityClass } : {}),
          selectionScore: entry.selectionScore,
          reason: "deduplicated",
        });
        return false;
      }
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
