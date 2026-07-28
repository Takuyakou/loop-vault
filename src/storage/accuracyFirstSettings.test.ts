// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  analysisProfileFeatureDefaults,
  defaultAccuracyFirstFeatureFlags,
  getAccuracyFirstFeatureFlags,
  getAnalysisProfileAnalyzeOptions,
  getAnalysisProfileSettings,
  setAccuracyFirstFeatureFlags,
  setAnalysisProfile,
} from "./accuracyFirstSettings";

describe("analysis profile settings", () => {
  beforeEach(() => localStorage.clear());

  it("uses Stable by default with R2 and Candidate Union off", () => {
    expect(getAnalysisProfileSettings()).toEqual({
      profile: "stable",
      analyzerMode: "phase4-v1",
      flags: defaultAccuracyFirstFeatureFlags,
    });
    expect(defaultAccuracyFirstFeatureFlags).toEqual({
      bassCompanionCandidates: true,
      melodyContaminationFilter: false,
      enableObservedFlatNineDominantCandidate: true,
      enableAccuracyCandidateUnion: false,
    });
  });

  it("enables conservative A1 and Candidate Union only in Accuracy First", () => {
    setAnalysisProfile("accuracy-first");
    expect(getAccuracyFirstFeatureFlags())
      .toEqual(analysisProfileFeatureDefaults["accuracy-first"]);
    expect(getAnalysisProfileAnalyzeOptions()).toEqual({
      mode: "phase4-v1",
      accuracyFirst: analysisProfileFeatureDefaults["accuracy-first"],
    });
  });

  it("round-trips independent rollback flags without enabling Stable-only defaults", () => {
    setAnalysisProfile("accuracy-first");
    setAccuracyFirstFeatureFlags({
      bassCompanionCandidates: true,
      melodyContaminationFilter: false,
      enableObservedFlatNineDominantCandidate: false,
      enableAccuracyCandidateUnion: false,
    });
    expect(getAccuracyFirstFeatureFlags()).toEqual({
      bassCompanionCandidates: true,
      melodyContaminationFilter: false,
      enableObservedFlatNineDominantCandidate: false,
      enableAccuracyCandidateUnion: false,
    });

    setAnalysisProfile("stable");
    setAccuracyFirstFeatureFlags({
      bassCompanionCandidates: false,
      melodyContaminationFilter: true,
      enableObservedFlatNineDominantCandidate: true,
      enableAccuracyCandidateUnion: true,
    });
    expect(getAccuracyFirstFeatureFlags()).toEqual({
      bassCompanionCandidates: false,
      melodyContaminationFilter: false,
      enableObservedFlatNineDominantCandidate: true,
      enableAccuracyCandidateUnion: false,
    });
  });

  it("migrates the legacy accuracy-first payload and old E1 key", () => {
    localStorage.setItem("loopvault.accuracyFirstFeatures", JSON.stringify({
      bassCompanionCandidates: true,
      melodyContaminationFilter: false,
      observedFlatNineDominantCandidate: false,
      enableAccuracyCandidateUnion: false,
    }));
    expect(getAnalysisProfileSettings()).toMatchObject({
      profile: "accuracy-first",
      flags: {
        bassCompanionCandidates: true,
        melodyContaminationFilter: false,
        enableObservedFlatNineDominantCandidate: false,
        enableAccuracyCandidateUnion: false,
      },
    });
  });

  it("falls back safely when local data is invalid", () => {
    localStorage.setItem("loopvault.accuracyFirstFeatures", "{broken");
    expect(getAccuracyFirstFeatureFlags()).toEqual(defaultAccuracyFirstFeatureFlags);
  });
});
