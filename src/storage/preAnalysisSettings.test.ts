// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultPreAnalysisSourceSelectionSettings,
  getPreAnalysisSourceSelectionSettings,
  setPreAnalysisSourceSelectionSettings,
  shouldOpenPreAnalysis,
} from "./preAnalysisSettings";

describe("pre-analysis source selection settings", () => {
  beforeEach(() => localStorage.clear());

  it("rolls out to Accuracy First while Stable keeps the direct path", () => {
    expect(shouldOpenPreAnalysis("accuracy-first")).toBe(true);
    expect(shouldOpenPreAnalysis("stable")).toBe(false);
  });

  it("can always show the preparation screen in Stable", () => {
    setPreAnalysisSourceSelectionSettings({
      enablePreAnalysisSourceSelection: true,
      alwaysShowPreAnalysis: true,
    });
    expect(shouldOpenPreAnalysis("stable")).toBe(true);
  });

  it("provides an immediate rollback flag", () => {
    setPreAnalysisSourceSelectionSettings({
      enablePreAnalysisSourceSelection: false,
      alwaysShowPreAnalysis: true,
    });
    expect(shouldOpenPreAnalysis("accuracy-first")).toBe(false);
    expect(getPreAnalysisSourceSelectionSettings()).toEqual({
      enablePreAnalysisSourceSelection: false,
      alwaysShowPreAnalysis: true,
    });
  });

  it("rejects invalid local data", () => {
    localStorage.setItem("loopvault.preAnalysisSourceSelection", "{broken");
    expect(getPreAnalysisSourceSelectionSettings())
      .toEqual(defaultPreAnalysisSourceSelectionSettings);
  });
});
