import type { AccuracyFirstFeatureFlags } from "../domain/midi/types";

const storageKey = "loopvault.accuracyFirstFeatures";

export const defaultAccuracyFirstFeatureFlags: AccuracyFirstFeatureFlags = {
  bassCompanionCandidates: true,
  melodyContaminationFilter: true,
};

export function getAccuracyFirstFeatureFlags(): AccuracyFirstFeatureFlags {
  if (typeof localStorage === "undefined") {
    return { ...defaultAccuracyFirstFeatureFlags };
  }
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as
      Partial<AccuracyFirstFeatureFlags>;
    return {
      bassCompanionCandidates: typeof stored.bassCompanionCandidates === "boolean"
        ? stored.bassCompanionCandidates
        : defaultAccuracyFirstFeatureFlags.bassCompanionCandidates,
      melodyContaminationFilter: typeof stored.melodyContaminationFilter === "boolean"
        ? stored.melodyContaminationFilter
        : defaultAccuracyFirstFeatureFlags.melodyContaminationFilter,
    };
  } catch {
    return { ...defaultAccuracyFirstFeatureFlags };
  }
}

export function setAccuracyFirstFeatureFlags(
  flags: AccuracyFirstFeatureFlags,
): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify(flags));
}
