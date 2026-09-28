import { useMemo } from "react";
import type { SavedProgressionBlock, SongIdea } from "../../domain/types";
import type { PracticeFileV2 } from "../../features/bass-practice/infra/repository/practiceRepository";
import { progressionTouchedAt } from "../vault/progressionFacts";
import { summarizePracticeActivity, type PracticeActivity, type PracticeKind } from "./practiceActivity";
import type { TodayLoopCandidate } from "./todayLoop";

export interface HomeProgression {
  id: string;
  idea: SongIdea;
  block: SavedProgressionBlock;
  touchedAt: number;
}

export interface HomeContinue {
  entry: HomeProgression;
  via: PracticeKind | "edit";
  at: number;
}

export interface HomeSummary {
  progressions: HomeProgression[];
  loopCandidates: TodayLoopCandidate[];
  continueFrom?: HomeContinue;
  recent: HomeProgression[];
  activity: PracticeActivity;
}

export const HOME_RECENT_LIMIT = 5;

/** Pure Home aggregation; the view only renders what this returns. */
export function deriveHomeSummary(
  ideas: readonly SongIdea[],
  practiceFile: PracticeFileV2 | undefined,
  now: Date,
): HomeSummary {
  const progressions = ideas.flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => ({
    id: `${idea.id}:${block.id}`,
    idea,
    block,
    touchedAt: progressionTouchedAt(idea, block),
  })));
  const byTouch = [...progressions].sort((left, right) => right.touchedAt - left.touchedAt
    || Date.parse(right.block.capturedAt) - Date.parse(left.block.capturedAt));
  const activity = summarizePracticeActivity(ideas, practiceFile, now);
  const practiced = activity.latest
    ? progressions.find((entry) => entry.idea.id === activity.latest!.reference.ideaId && entry.block.id === activity.latest!.reference.blockId)
    : undefined;
  const continueFrom: HomeContinue | undefined = practiced
    ? { entry: practiced, via: activity.latest!.kind, at: Date.parse(activity.latest!.at) }
    : byTouch[0] ? { entry: byTouch[0], via: "edit", at: byTouch[0].touchedAt } : undefined;
  return {
    progressions,
    loopCandidates: progressions.map((entry) => ({ id: entry.id, pinned: Boolean(entry.block.pinned) })),
    continueFrom,
    recent: byTouch.slice(0, HOME_RECENT_LIMIT),
    activity,
  };
}

export function useHomeSummary(
  ideas: readonly SongIdea[],
  practiceFile: PracticeFileV2 | undefined,
  now: Date,
): HomeSummary {
  return useMemo(() => deriveHomeSummary(ideas, practiceFile, now), [ideas, now, practiceFile]);
}

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

/** Header date, e.g. 9月28日（月）. */
export function formatHomeDate(now: Date): string {
  return `${now.getMonth() + 1}月${now.getDate()}日（${weekdays[now.getDay()]}）`;
}

/** 今日 22:40 / 昨日 22:40 / 9/26 */
export function formatWhen(at: number, now: Date, withTime = true): string {
  const date = new Date(at);
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86_400_000);
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (days === 0) return withTime ? `今日 ${time}` : "今日";
  if (days === 1) return withTime ? `昨日 ${time}` : "昨日";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
