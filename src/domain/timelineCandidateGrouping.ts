import type { ProgressionBlockCandidate } from "./types";

const OVERLAP_COEFFICIENT_THRESHOLD = 0.75;
const PROXIMITY_BARS_THRESHOLD = 2;

export interface TimelineCandidateIntervalMetrics {
  intersection: number;
  union: number;
  iou: number;
  overlapCoefficient: number;
  startDistance: number;
  endDistance: number;
  centerDistance: number;
}

export interface TimelineCandidateGroup {
  anchor: ProgressionBlockCandidate;
  variants: readonly ProgressionBlockCandidate[];
  representative: ProgressionBlockCandidate;
  selectedVariant: ProgressionBlockCandidate;
}

export function timelineCandidateIntervalMetrics(
  left: Pick<ProgressionBlockCandidate, "startBar" | "endBar">,
  right: Pick<ProgressionBlockCandidate, "startBar" | "endBar">,
): TimelineCandidateIntervalMetrics {
  const intersection = Math.max(
    0,
    Math.min(left.endBar, right.endBar) - Math.max(left.startBar, right.startBar) + 1,
  );
  const leftLength = Math.max(1, left.endBar - left.startBar + 1);
  const rightLength = Math.max(1, right.endBar - right.startBar + 1);
  const union = leftLength + rightLength - intersection;
  return {
    intersection,
    union,
    iou: intersection / Math.max(1, union),
    overlapCoefficient: intersection / Math.max(1, Math.min(leftLength, rightLength)),
    startDistance: Math.abs(left.startBar - right.startBar),
    endDistance: Math.abs(left.endBar - right.endBar),
    centerDistance: Math.abs(
      (left.startBar + left.endBar) / 2 - (right.startBar + right.endBar) / 2,
    ),
  };
}

export function areTimelineCandidatesRelated(
  left: Pick<ProgressionBlockCandidate, "startBar" | "endBar">,
  right: Pick<ProgressionBlockCandidate, "startBar" | "endBar">,
): boolean {
  const metrics = timelineCandidateIntervalMetrics(left, right);
  return metrics.overlapCoefficient >= OVERLAP_COEFFICIENT_THRESHOLD
    && Math.min(metrics.startDistance, metrics.endDistance, metrics.centerDistance)
      <= PROXIMITY_BARS_THRESHOLD;
}

export function compareTimelineCandidateAnchors(
  left: ProgressionBlockCandidate,
  right: ProgressionBlockCandidate,
): number {
  return left.startBar - right.startBar
    || right.endBar - left.endBar
    || compareStableIds(left.id, right.id);
}

export function compareTimelineCandidateRepresentatives(
  left: ProgressionBlockCandidate,
  right: ProgressionBlockCandidate,
): number {
  return right.lengthBars - left.lengthBars
    || candidateScore(right) - candidateScore(left)
    || left.startBar - right.startBar
    || left.endBar - right.endBar
    || compareStableIds(left.id, right.id);
}

export function compareTimelineCandidateSelectedVariants(
  left: ProgressionBlockCandidate,
  right: ProgressionBlockCandidate,
): number {
  return candidateScore(right) - candidateScore(left)
    || finiteConfidence(right) - finiteConfidence(left)
    || left.startBar - right.startBar
    || left.lengthBars - right.lengthBars
    || left.endBar - right.endBar
    || compareStableIds(left.id, right.id);
}

export function groupTimelineCandidates(
  candidates: readonly ProgressionBlockCandidate[],
): TimelineCandidateGroup[] {
  const remaining = [...candidates].sort(compareTimelineCandidateAnchors);
  const groups: TimelineCandidateGroup[] = [];

  while (remaining.length > 0) {
    const anchor = remaining.shift();
    if (!anchor) break;
    const variants = [anchor];
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const candidate = remaining[index];
      if (!candidate || !areTimelineCandidatesRelated(anchor, candidate)) continue;
      variants.push(candidate);
      remaining.splice(index, 1);
    }
    variants.sort(compareTimelineCandidateAnchors);
    groups.push({
      anchor,
      variants,
      representative: [...variants].sort(compareTimelineCandidateRepresentatives)[0]!,
      selectedVariant: [...variants].sort(compareTimelineCandidateSelectedVariants)[0]!,
    });
  }

  return groups;
}

export function selectInitialTimelineCandidate(
  candidates: readonly ProgressionBlockCandidate[],
): ProgressionBlockCandidate | undefined {
  let selected: ProgressionBlockCandidate | undefined;
  for (const group of groupTimelineCandidates(candidates)) {
    if (
      selected === undefined
      || compareTimelineCandidateSelectedVariants(group.selectedVariant, selected) < 0
    ) {
      selected = group.selectedVariant;
    }
  }
  return selected;
}

function candidateScore(candidate: ProgressionBlockCandidate): number {
  return Number.isFinite(candidate.selectionScore)
    ? candidate.selectionScore!
    : finiteConfidence(candidate);
}

function finiteConfidence(candidate: ProgressionBlockCandidate): number {
  return Number.isFinite(candidate.confidence)
    ? candidate.confidence
    : Number.NEGATIVE_INFINITY;
}

function compareStableIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}