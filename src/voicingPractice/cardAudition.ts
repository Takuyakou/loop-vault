import type {
  ProgressionPracticeEvent,
  ProgressionPracticeVoicingPlan,
  ProgressionPracticeVoicingResolution,
} from "../domain/progressionVoicingPractice";

export interface CardAuditionPlans {
  readonly saved?: ProgressionPracticeVoicingPlan;
  readonly source?: ProgressionPracticeVoicingPlan;
  readonly custom?: ProgressionPracticeVoicingPlan;
  readonly generated?: ProgressionPracticeVoicingPlan;
  readonly current?: ProgressionPracticeVoicingPlan;
}

/**
 * P25 V9: a card plays what the loop plays now (`current`: the source, the shape, its parts and 「なめらかにつなぐ」 already
 * applied). Only when that card cannot sound there does the saved card intent pick another family, as before.
 */
export function cardAuditionResolution(
  event: ProgressionPracticeEvent | undefined,
  index: number,
  plans: CardAuditionPlans,
): ProgressionPracticeVoicingResolution | undefined {
  if (!event) return undefined;
  const at = (plan: ProgressionPracticeVoicingPlan | undefined) => {
    const result = plan?.events[index];
    return result?.status === "SUPPORTED" ? result : undefined;
  };
  const now = at(plans.current);
  if (now) return now;
  if (event.playbackChoice === "SOURCE") return at(plans.source) ?? at(plans.generated);
  if (event.playbackChoice === "CUSTOM") return at(plans.custom) ?? at(plans.generated);
  if (event.playbackChoice === "GENERATED") return at(plans.generated);
  return at(plans.saved) ?? at(plans.custom)
    ?? (event.sourceNeedsReview ? undefined : at(plans.source)) ?? at(plans.generated);
}
