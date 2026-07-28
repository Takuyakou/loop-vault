// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultAccuracyFirstFeatureFlags,
  getAccuracyFirstFeatureFlags,
  setAccuracyFirstFeatureFlags,
} from "./accuracyFirstSettings";

describe("accuracy-first settings", () => {
  beforeEach(() => localStorage.clear());

  it("enables both independently rollbackable features by default", () => {
    expect(getAccuracyFirstFeatureFlags()).toEqual(defaultAccuracyFirstFeatureFlags);
  });

  it("round-trips an explicit rollback without touching Vault data", () => {
    setAccuracyFirstFeatureFlags({
      bassCompanionCandidates: false,
      melodyContaminationFilter: true,
    });
    expect(getAccuracyFirstFeatureFlags()).toEqual({
      bassCompanionCandidates: false,
      melodyContaminationFilter: true,
    });
  });

  it("falls back safely when local data is invalid", () => {
    localStorage.setItem("loopvault.accuracyFirstFeatures", "{broken");
    expect(getAccuracyFirstFeatureFlags()).toEqual(defaultAccuracyFirstFeatureFlags);
  });
});
