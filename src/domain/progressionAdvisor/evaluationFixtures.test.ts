import { describe, expect, it } from "vitest";
import { advisorEvaluationCases } from "./evaluationFixtures";
import { validateAdvisorResponse } from "./validateAdvisorResponse";

describe("Progression Advisor fixed evaluation", () => {
  it("classifies all 24 fixtures as expected", () => {
    const cases = advisorEvaluationCases();
    expect(cases).toHaveLength(24);
    expect(cases.filter((entry) => entry.expectedValid)).toHaveLength(12);
    expect(cases.map((entry) => validateAdvisorResponse(entry.response).success)).toEqual(cases.map((entry) => entry.expectedValid));
  });
});
