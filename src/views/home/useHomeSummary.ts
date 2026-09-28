import { useMemo } from "react";
import { pickFocus } from "../../domain/focus";
import { formatProgressionText } from "../../domain/progressionText";
import type { SavedProgressionBlock, SongIdea } from "../../domain/types";

export interface HomeRecentProgression {
  idea: SongIdea;
  block: SavedProgressionBlock;
}

export interface HomeSummary {
  focus?: SongIdea;
  focusBlock?: SavedProgressionBlock;
  focusPreview?: string;
  recentProgressions: HomeRecentProgression[];
}

/** Pure Home aggregation; the view only renders what this returns. */
export function deriveHomeSummary(ideas: readonly SongIdea[], now: Date): HomeSummary {
  const focus = pickFocus([...ideas], now).focus;
  const focusBlock = focus?.progressionBlocks?.[0];
  const focusPreview = focusBlock
    ? formatProgressionText(focusBlock.chords).split("\n")[0]
    : focus?.chordMemo.split("\n").find((line) => line.trim());
  const recentProgressions = ideas
    .flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => ({ idea, block })))
    .sort((left, right) => new Date(right.block.capturedAt).getTime() - new Date(left.block.capturedAt).getTime())
    .slice(0, 3);
  return { focus, focusBlock, focusPreview, recentProgressions };
}

export function useHomeSummary(ideas: readonly SongIdea[], now: Date): HomeSummary {
  return useMemo(() => deriveHomeSummary(ideas, now), [ideas, now]);
}
