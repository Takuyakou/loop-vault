import type { SongIdea } from "../types";
import { voicingSourceStatus } from "../voicing";
import { practiceProgressState } from "./practiceProgress";
import { progressionFingerprint } from "./progressionFingerprint";
import type { PracticeRecommendation } from "./types";

export function recommendPracticeBlocks(
  ideas: readonly SongIdea[],
  localDate: string,
): PracticeRecommendation[] {
  return ideas.flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => {
    const effectiveKeySignature = block.detectedKey ?? idea.key;
    const state = practiceProgressState(block, localDate, effectiveKeySignature);
    return {
      ideaId: idea.id,
      ideaTitle: idea.title,
      block,
      stale: state === "stale",
      confirmationDue: state === "confirmation-due",
      unstarted: state === "unstarted",
      favorite: block.pinned ?? false,
      effectiveKeySignature,
    };
  })).sort(compareRecommendations);
}

function compareRecommendations(
  left: PracticeRecommendation,
  right: PracticeRecommendation,
): number {
  const priority = recommendationPriority(left) - recommendationPriority(right);
  if (priority !== 0) return priority;
  const voicingOrder = usableSourceVoicingRatio(right) - usableSourceVoicingRatio(left);
  if (voicingOrder !== 0) return voicingOrder;
  const leftPracticed = validProgress(left) ? left.block.practice?.lastPracticedAt ?? "" : "";
  const rightPracticed = validProgress(right) ? right.block.practice?.lastPracticedAt ?? "" : "";
  const practiceOrder = leftPracticed.localeCompare(rightPracticed);
  if (practiceOrder !== 0) return practiceOrder;
  if (left.favorite !== right.favorite) return left.favorite ? -1 : 1;
  const capturedOrder = right.block.capturedAt.localeCompare(left.block.capturedAt);
  if (capturedOrder !== 0) return capturedOrder;
  return left.block.id.localeCompare(right.block.id);
}

function usableSourceVoicingRatio(item: PracticeRecommendation): number {
  if (item.block.chords.length === 0) return 0;
  const usableCount = item.block.chords.filter((event) => (
    voicingSourceStatus(event.chord, event.voicingMemory).status === "source"
  )).length;
  return usableCount / item.block.chords.length;
}

function recommendationPriority(item: PracticeRecommendation): number {
  if (item.confirmationDue) return 0;
  if (item.stale) return 1;
  if (!item.unstarted) return 2;
  if (item.favorite) return 3;
  return 4;
}

function validProgress(item: PracticeRecommendation): boolean {
  return item.block.practice?.progressionFingerprint === progressionFingerprint(
    item.block,
    item.effectiveKeySignature,
  );
}

