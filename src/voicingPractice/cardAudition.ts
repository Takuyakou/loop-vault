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

/** Saved card intent is resolved independently of the current practice display family. */
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
  if (event.playbackChoice === "SOURCE") return at(plans.source) ?? at(plans.generated);
  if (event.playbackChoice === "CUSTOM") return at(plans.custom) ?? at(plans.generated);
  if (event.playbackChoice === "GENERATED") return at(plans.generated);
  return at(plans.saved) ?? at(plans.custom)
    ?? (event.sourceNeedsReview ? undefined : at(plans.source)) ?? at(plans.generated) ?? at(plans.current);
}
