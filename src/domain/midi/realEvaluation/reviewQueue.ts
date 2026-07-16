import { parseChordLabel } from "../../chords";
import { defaultReviewPriorityWeights } from "./differenceReview";
import type { MidiDifferenceReview, MidiDifferenceReviewCase, ReviewReason } from "./types";

export interface ReviewQueueOptions {
  maxItems?: number;
  maxPerSource?: number;
  maxPerQuality?: number;
  nearbyBeatDistance?: number;
}

type ReviewCategory = "rootless" | "slash" | "tension" | "simple";

export function buildActiveReviewQueue(
  cases: readonly MidiDifferenceReviewCase[],
  reviews: readonly MidiDifferenceReview[],
  options: ReviewQueueOptions = {},
): MidiDifferenceReviewCase[] {
  const maxItems = options.maxItems ?? 100;
  const maxPerSource = options.maxPerSource ?? 5;
  const maxPerQuality = options.maxPerQuality ?? 10;
  const nearbyBeatDistance = options.nearbyBeatDistance ?? 1;
  const reviewedIds = new Set(reviews.map((review) => review.id));
  const available = cases.filter((item) => !reviewedIds.has(item.id));
  const qualityFrequency = new Map<string, number>();
  available.forEach((item) => {
    const quality = chordQuality(item);
    qualityFrequency.set(quality, (qualityFrequency.get(quality) ?? 0) + 1);
  });
  const ranked = available.map((item) => {
    const quality = chordQuality(item);
    if ((qualityFrequency.get(quality) ?? 0) > 2 || item.priority.reasons.includes("unseen-chord-quality")) return item;
    const reason: ReviewReason = "unseen-chord-quality";
    return {
      ...item,
      priority: {
        score: item.priority.score + defaultReviewPriorityWeights[reason],
        reasons: [...item.priority.reasons, reason],
      },
    };
  }).sort(comparePriority);

  const categories: ReviewCategory[] = ["rootless", "slash", "tension", "simple"];
  const buckets = new Map(categories.map((category) => [
    category,
    ranked.filter((item) => reviewCategory(item) === category),
  ]));
  const selected: MidiDifferenceReviewCase[] = [];
  const sourceCount = new Map<string, number>();
  const qualityCount = new Map<string, number>();

  while (selected.length < maxItems && categories.some((category) => (buckets.get(category)?.length ?? 0) > 0)) {
    for (const category of categories) {
      const candidate = buckets.get(category)?.shift();
      if (!candidate) continue;
      const source = candidate.sourceFingerprint;
      const quality = chordQuality(candidate);
      if ((sourceCount.get(source) ?? 0) >= maxPerSource) continue;
      if ((qualityCount.get(quality) ?? 0) >= maxPerQuality) continue;
      if (selected.some((item) => item.sourceFingerprint === source
        && Math.abs(item.range.startBeat - candidate.range.startBeat) < nearbyBeatDistance)) continue;
      selected.push(candidate);
      sourceCount.set(source, (sourceCount.get(source) ?? 0) + 1);
      qualityCount.set(quality, (qualityCount.get(quality) ?? 0) + 1);
      if (selected.length >= maxItems) break;
    }
  }
  return selected;
}

function comparePriority(left: MidiDifferenceReviewCase, right: MidiDifferenceReviewCase): number {
  return right.priority.score - left.priority.score || left.id.localeCompare(right.id);
}

function chordQuality(item: MidiDifferenceReviewCase): string {
  return parseChordLabel(item.reranker.primary)?.quality ?? "unknown";
}

function reviewCategory(item: MidiDifferenceReviewCase): ReviewCategory {
  const labels = [item.saved.primary, item.legacy.primary, item.reranker.primary];
  const warnings = [...(item.legacy.warnings ?? []), ...(item.reranker.warnings ?? [])];
  if (warnings.some((warning) => warning.includes("rootless"))) return "rootless";
  if (labels.some((label) => label.includes("/"))) return "slash";
  if (labels.some((label) => /(?:9|11|13)/.test(label))) return "tension";
  return "simple";
}
